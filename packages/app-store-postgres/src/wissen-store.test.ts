import { describe, expect, it } from "vitest";
import {
  createWissenStoreFromEnv,
  InMemoryWissenStore,
  UnavailableWissenStore,
  type VerfahrensWissenEintrag,
} from "./wissen-store.js";

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

describe("InMemoryWissenStore", () => {
  it("append-only + chronologische Liste je Verfahren", async () => {
    const store = new InMemoryWissenStore();
    await store.appendEintrag(
      eintrag({ eintragId: "w2", occurredAt: "2026-01-05T00:00:00.000Z" }),
    );
    await store.appendEintrag(
      eintrag({ eintragId: "w1", occurredAt: "2026-01-01T00:00:00.000Z" }),
    );
    const liste = await store.listEintraege({
      tenantId: "tenant-1",
      authorityId: "authority-1",
      procedureId: "musterverfahren",
      procedureVersion: "1",
    });
    expect(liste.map((e) => e.eintragId)).toEqual(["w1", "w2"]);
  });

  it("ist behörden-scoped (fremde Behörde sieht nichts)", async () => {
    const store = new InMemoryWissenStore();
    await store.appendEintrag(eintrag({ eintragId: "w1" }));
    const fremd = await store.listEintraege({
      tenantId: "tenant-1",
      authorityId: "authority-anders",
      procedureId: "musterverfahren",
      procedureVersion: "1",
    });
    expect(fremd).toHaveLength(0);
  });

  it("liefert eine unveränderliche Kopie (append-only)", async () => {
    const store = new InMemoryWissenStore();
    const gespeichert = await store.appendEintrag(
      eintrag({ eintragId: "w1", metadaten: { a: 1 } }),
    );
    gespeichert.metadaten["a"] = 999;
    const [gelesen] = await store.listEintraege({
      tenantId: "tenant-1",
      authorityId: "authority-1",
      procedureId: "musterverfahren",
      procedureVersion: "1",
    });
    expect(gelesen?.metadaten["a"]).toBe(1);
  });
});

describe("createWissenStoreFromEnv", () => {
  it("APP_STORE_MODE=memory → InMemory", () => {
    const store = createWissenStoreFromEnv({
      APP_STORE_MODE: "memory",
    } as NodeJS.ProcessEnv);
    expect(store).toBeInstanceOf(InMemoryWissenStore);
  });

  it("ohne memory-Modus → fail-closed Unavailable", async () => {
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
