import { beforeAll, describe, expect, it } from "vitest";
import { createPgClient } from "./client.js";
import {
  createWissenStoreFromEnv,
  InMemoryWissenStore,
  PostgresWissenStore,
  UnavailableWissenStore,
  type VerfahrensWissenEintrag,
  type WissenStore,
} from "./wissen-store.js";

// Parametrisierte Vertrags-Tests: identisch gegen den In-Memory-Store (immer) UND — wenn eine Datenbank
// konfiguriert ist (APP_PG_URL/APP_PG_DIRECT_URL, Migrationen vorher ausgefuehrt) — gegen den Postgres-Store.
// So verhaelt sich die PROD-Standalone-Laufzeit nachweislich wie die Test-Laufzeit (eine Wahrheit InMemory==PG).
const uid = (): string => globalThis.crypto.randomUUID();

function eintrag(
  overrides: Partial<VerfahrensWissenEintrag> &
    Pick<VerfahrensWissenEintrag, "eintragId">,
): VerfahrensWissenEintrag {
  return {
    procedureId: "musterverfahren",
    procedureVersion: "1",
    tenantId: "tenant-1",
    authorityId: "authority-1",
    jurisdictionId: "de",
    actorId: "actor.sb",
    art: "wissen",
    urheber: "human:caseworker",
    text: "Auslegung von § 1: …",
    metadaten: {},
    occurredAt: "2026-01-02T10:00:00.000Z",
    ...overrides,
  };
}

const pgUrl = process.env["APP_PG_URL"] ?? process.env["APP_PG_DIRECT_URL"];
const impls: { name: string; make: () => WissenStore; enabled: boolean }[] = [
  {
    name: "InMemoryWissenStore",
    make: () => new InMemoryWissenStore(),
    enabled: true,
  },
  {
    name: "PostgresWissenStore",
    make: () => new PostgresWissenStore(pgUrl!),
    enabled: Boolean(pgUrl),
  },
];

for (const impl of impls) {
  describe.skipIf(!impl.enabled)(`WissenStore contract — ${impl.name}`, () => {
    let store: WissenStore;
    beforeAll(() => {
      store = impl.make();
    });

    it("append-only + chronologische Liste je Verfahren (aufsteigend)", async () => {
      const proc = `proc-${uid()}`;
      await store.appendEintrag(
        eintrag({
          eintragId: uid(),
          procedureId: proc,
          occurredAt: "2026-01-05T00:00:00.000Z",
          text: "spaeter",
        }),
      );
      await store.appendEintrag(
        eintrag({
          eintragId: uid(),
          procedureId: proc,
          occurredAt: "2026-01-01T00:00:00.000Z",
          text: "frueher",
        }),
      );
      const liste = await store.listEintraege({
        tenantId: "tenant-1",
        authorityId: "authority-1",
        procedureId: proc,
        procedureVersion: "1",
      });
      expect(liste.map((e) => e.text)).toEqual(["frueher", "spaeter"]);
    });

    it("behörden-scoped + verfahrens-scoped; metadaten überleben den Roundtrip", async () => {
      const proc = `proc-${uid()}`;
      await store.appendEintrag(
        eintrag({
          eintragId: uid(),
          procedureId: proc,
          metadaten: { norm: "§ 1", tags: ["frist"] },
        }),
      );
      const eigen = await store.listEintraege({
        tenantId: "tenant-1",
        authorityId: "authority-1",
        procedureId: proc,
        procedureVersion: "1",
      });
      expect(eigen).toHaveLength(1);
      expect(eigen[0]?.metadaten).toEqual({ norm: "§ 1", tags: ["frist"] });
      const fremd = await store.listEintraege({
        tenantId: "tenant-1",
        authorityId: "authority-anders",
        procedureId: proc,
        procedureVersion: "1",
      });
      expect(fremd).toHaveLength(0);
    });

    it("liefert eine unveränderliche Kopie (Caller-Mutation ändert den Store nicht)", async () => {
      const proc = `proc-${uid()}`;
      const gespeichert = await store.appendEintrag(
        eintrag({ eintragId: uid(), procedureId: proc, metadaten: { a: 1 } }),
      );
      gespeichert.metadaten["a"] = 999;
      const [gelesen] = await store.listEintraege({
        tenantId: "tenant-1",
        authorityId: "authority-1",
        procedureId: proc,
        procedureVersion: "1",
      });
      expect(gelesen?.metadaten["a"]).toBe(1);
    });
  });
}

// Postgres-spezifisch: die Unveränderlichkeit ist eine Eigenschaft der TABELLE (Trigger + REVOKE), nicht nur
// der Anwendung — gegen einen echten Verstoß gefahren.
describe.skipIf(!pgUrl)("app_verfahren_wissen ist append-only (DB-Trigger)", () => {
  it("UPDATE und DELETE werfen", async () => {
    const store = new PostgresWissenStore(pgUrl!);
    const id = uid();
    await store.appendEintrag(eintrag({ eintragId: id, procedureId: `proc-${uid()}` }));
    const client = await createPgClient(pgUrl!);
    await client.connect();
    try {
      await expect(
        client.query(
          "UPDATE app_verfahren_wissen SET text = 'manipuliert' WHERE eintrag_id = $1",
          [id],
        ),
      ).rejects.toThrow();
      await expect(
        client.query("DELETE FROM app_verfahren_wissen WHERE eintrag_id = $1", [
          id,
        ]),
      ).rejects.toThrow();
    } finally {
      await client.end();
    }
  });
});

describe("createWissenStoreFromEnv", () => {
  it("APP_STORE_MODE=memory → InMemory", () => {
    expect(
      createWissenStoreFromEnv({
        APP_STORE_MODE: "memory",
      } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(InMemoryWissenStore);
  });

  it("APP_PG_URL → Postgres", () => {
    expect(
      createWissenStoreFromEnv({
        APP_PG_URL: "postgres://app:app@127.0.0.1:5432/app",
      } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(PostgresWissenStore);
  });

  it("weder memory noch PG → fail-closed Unavailable", async () => {
    const store = createWissenStoreFromEnv({} as NodeJS.ProcessEnv);
    expect(store).toBeInstanceOf(UnavailableWissenStore);
    await expect(
      store.listEintraege({
        tenantId: "t",
        authorityId: "a",
        procedureId: "p",
        procedureVersion: "1",
      }),
    ).rejects.toThrow();
  });
});
