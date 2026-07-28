// evidence-ledger-persistenz.test — DER GEMESSENE BEFUND: der Evidence-Ledger war der einzige Speicher
// dieses Pakets ohne Tabelle. `apps/fachverfahren/server/index.ts` verdrahtete fest
// `new InMemoryEvidenceLedger()`, während audit-, auth-, case-, kanban-, task- und wissen-store längst
// dauerhaft schrieben. Der Nachweis der agentischen Handlungen starb also mit dem Prozess — und die
// Hash-Kette darüber suggerierte Manipulationssicherheit, die es nach einem Neustart nicht mehr gab.
//
// Diese Suite misst genau das, was vorher niemand messen konnte:
//   1. ÜBERLEBEN: anhängen, neue Store-Instanz auf DENSELBEN Speicher, Kette ist da UND gültig.
//   2. TRENNUNG: fremder Mandant sieht nichts; je ledgerId eine eigene Kette.
//   3. APPEND-ONLY: roher UPDATE/DELETE scheitert am DB-Riegel.
//   4. GEGENPROBE MANIPULATION: ein nachträglich veränderter Eintrag (Riegel kurzzeitig gelöst) bricht
//      `verifyEvidenceChain` an GENAU dieser Stelle — ohne diese Probe wäre die Kette eine Notiz.
//   5. KEINE GABELUNG: gleichzeitige Appends erzeugen eine Kette, keine zwei.
//   6. PARITÄT: derselbe Vertrag gilt unverändert für die In-Memory-Variante.
//
// Ohne erreichbare Datenbank (kein Docker/kein APP_PG_URL) überspringt `describe.skipIf` die
// Postgres-Blöcke — derselbe Weg wie audit-append-only.test.ts / wissen-store.test.ts. Mit `pnpm test:pg`
// fährt tests/pg/global-setup.ts einen echten Postgres hoch und migriert; dann laufen sie echt.
import { describe, expect, it, vi } from "vitest";
import { createPgClient } from "./client.js";
import { InMemoryChosClient } from "./chos-client.js";
import { ChosEvidenceLedger } from "./chos-evidence-ledger.js";
import {
  createEvidenceLedgerFromEnv,
  InMemoryEvidenceLedger,
  PostgresEvidenceLedger,
  UnavailableEvidenceLedger,
  verifyEvidenceChain,
  type EvidenceAppendInput,
  type EvidenceLedger,
} from "./evidence-ledger.js";

const pgUrl = process.env["APP_PG_URL"] ?? process.env["APP_PG_DIRECT_URL"];
const uid = (): string => globalThis.crypto.randomUUID();

function eintrag(over: Partial<EvidenceAppendInput> = {}): EvidenceAppendInput {
  return {
    evidenceId: `ev-${uid()}`,
    ledgerId: `composable:${uid()}`,
    tenantId: "t1",
    actorId: "sb.a",
    entryType: "spine.suggestion",
    summary: "Spine-Vorschlag pruefung erzeugt",
    refs: { composableId: "musterverfahren", aufgabe: "pruefung" },
    occurredAt: "2026-07-28T00:00:00.000Z",
    ...over,
  };
}

// Die Implementierungen unter Vertrag. `dauerhaft` sagt, ob eine NEUE Instanz auf demselben Speicher die
// Kette noch sieht — das ist die Kern-Zusicherung, und genau die fehlte dem Ledger bisher komplett.
const impls: {
  name: string;
  make: () => EvidenceLedger;
  dauerhaft: boolean;
  enabled: boolean;
}[] = [
  {
    name: "InMemoryEvidenceLedger",
    make: () => new InMemoryEvidenceLedger(),
    dauerhaft: false,
    enabled: true,
  },
  {
    name: "PostgresEvidenceLedger",
    make: () => new PostgresEvidenceLedger(pgUrl!),
    dauerhaft: true,
    enabled: Boolean(pgUrl),
  },
  {
    // Der Graph-Backing-Adapter über einen Fake-Graph — läuft OHNE laufendes chos durch DENSELBEN Vertrag.
    name: "ChosEvidenceLedger(InMemoryChosClient)",
    make: (() => {
      // EIN Graph, mehrere Ledger-Instanzen: so simuliert `make()` einen Prozess-Neustart gegen denselben
      // dauerhaften Speicher (wie zwei PostgresEvidenceLedger auf dieselbe URL).
      const graph = new InMemoryChosClient();
      return () => new ChosEvidenceLedger(graph);
    })(),
    dauerhaft: true,
    enabled: true,
  },
];

for (const impl of impls) {
  describe.skipIf(!impl.enabled)(
    `EvidenceLedger-Vertrag — ${impl.name}`,
    () => {
      it("kettet an: Genesis prevHash=null, danach prevHash = entryHash des Vorgängers", async () => {
        const ledger = impl.make();
        const ledgerId = `composable:${uid()}`;
        const a = await ledger.append(eintrag({ ledgerId }));
        const b = await ledger.append(eintrag({ ledgerId }));
        expect(a.prevHash).toBeNull();
        expect(a.entryHash).toMatch(/^[0-9a-f]{64}$/);
        expect(b.prevHash).toBe(a.entryHash);
        expect(await ledger.verify({ tenantId: "t1", ledgerId })).toEqual({
          valid: true,
          length: 2,
        });
      });

      it("trennt Mandanten: ein fremder Mandant sieht die Kette nicht", async () => {
        const ledger = impl.make();
        const ledgerId = `composable:${uid()}`;
        await ledger.append(eintrag({ ledgerId, tenantId: "t1" }));
        await ledger.append(eintrag({ ledgerId, tenantId: "t2" }));
        const eigen = await ledger.list({ tenantId: "t1", ledgerId });
        expect(eigen).toHaveLength(1);
        expect(eigen[0]?.tenantId).toBe("t1");
        expect(await ledger.list({ tenantId: "fremd", ledgerId })).toHaveLength(
          0,
        );
        // Jeder Mandant hat seine EIGENE Genesis — die Ketten verschränken sich nicht.
        expect(
          (await ledger.list({ tenantId: "t2", ledgerId }))[0]?.prevHash,
        ).toBeNull();
      });

      it("je ledgerId eine eigene Kette (zwei Ströme verschränken sich nicht)", async () => {
        const ledger = impl.make();
        const a = `composable:${uid()}`;
        const b = `composable:${uid()}`;
        const a1 = await ledger.append(eintrag({ ledgerId: a }));
        const b1 = await ledger.append(eintrag({ ledgerId: b }));
        const a2 = await ledger.append(eintrag({ ledgerId: a }));
        expect(b1.prevHash).toBeNull();
        expect(a2.prevHash).toBe(a1.entryHash);
        expect(await ledger.verify({ tenantId: "t1", ledgerId: a })).toEqual({
          valid: true,
          length: 2,
        });
        expect(await ledger.verify({ tenantId: "t1", ledgerId: b })).toEqual({
          valid: true,
          length: 1,
        });
      });

      it("gibt eine Kopie heraus (Caller-Mutation ändert den Ledger nicht)", async () => {
        const ledger = impl.make();
        const ledgerId = `composable:${uid()}`;
        const geschrieben = await ledger.append(eintrag({ ledgerId }));
        geschrieben.refs["aufgabe"] = "manipuliert";
        const [gelesen] = await ledger.list({ tenantId: "t1", ledgerId });
        expect(gelesen?.refs["aufgabe"]).toBe("pruefung");
      });

      it("protokolliert NUR Metadaten — nie den Vorschlagsinhalt (kein PII in der Kette)", async () => {
        // Der Ledger trägt Referenzen (composableId, aufgabe, modelId, caseId), nie freien Text aus dem
        // Vorschlag. Gegenprobe über den DAUERHAFTEN Stand: was in den Speicher ging, enthält den Inhalt nicht.
        const ledger = impl.make();
        const ledgerId = `composable:${uid()}`;
        await ledger.append(
          eintrag({
            ledgerId,
            refs: { composableId: "musterverfahren", aufgabe: "pruefung" },
          }),
        );
        const [gelesen] = await ledger.list({ tenantId: "t1", ledgerId });
        expect(gelesen?.refs).toEqual({
          composableId: "musterverfahren",
          aufgabe: "pruefung",
        });
        expect(JSON.stringify(gelesen)).not.toContain("value");
      });

      it.skipIf(!impl.dauerhaft)(
        "ÜBERLEBT den Prozess-Neustart: neue Instanz auf demselben Speicher, Kette da UND gültig",
        async () => {
          const ledgerId = `composable:${uid()}`;
          const vorher = impl.make();
          const a = await vorher.append(
            eintrag({ ledgerId, summary: "erste" }),
          );
          const b = await vorher.append(
            eintrag({ ledgerId, summary: "zweite" }),
          );

          // DER NEUSTART: eine frische Store-Instanz, kein geteilter Prozess-Speicher.
          const nachher = impl.make();
          const gelesen = await nachher.list({ tenantId: "t1", ledgerId });
          expect(gelesen.map((e) => e.summary)).toEqual(["erste", "zweite"]);
          expect(gelesen.map((e) => e.entryHash)).toEqual([
            a.entryHash,
            b.entryHash,
          ]);
          expect(gelesen[0]?.prevHash).toBeNull();
          expect(gelesen[1]?.prevHash).toBe(a.entryHash);
          expect(await nachher.verify({ tenantId: "t1", ledgerId })).toEqual({
            valid: true,
            length: 2,
          });

          // Und der Anschluss geht weiter: das prevHash kommt aus dem DAUERHAFTEN Stand, nicht aus Speicher.
          const c = await nachher.append(
            eintrag({ ledgerId, summary: "dritte" }),
          );
          expect(c.prevHash).toBe(b.entryHash);
          expect(await nachher.verify({ tenantId: "t1", ledgerId })).toEqual({
            valid: true,
            length: 3,
          });
        },
      );

      it("GEGENPROBE: ein nachträglich veränderter Eintrag bricht die Prüfung an genau dieser Stelle", async () => {
        const ledger = impl.make();
        const ledgerId = `composable:${uid()}`;
        await ledger.append(eintrag({ ledgerId }));
        await ledger.append(eintrag({ ledgerId }));
        await ledger.append(eintrag({ ledgerId }));
        const kette = await ledger.list({ tenantId: "t1", ledgerId });
        expect(verifyEvidenceChain(kette)).toEqual({ valid: true, length: 3 });
        const gefaelscht = kette.map((e, i) =>
          i === 1 ? { ...e, summary: "nachträglich geändert" } : e,
        );
        expect(verifyEvidenceChain(gefaelscht)).toEqual({
          valid: false,
          length: 3,
          brokenAt: 1,
        });
      });
    },
  );
}

// ─── Die Ketten-Arithmetik selbst (backing-frei) ──────────────────────────────────────────────────────
// `verifyEvidenceChain` ist die EINE Hash-Wahrheit über alle drei Backings — was sie nicht erkennt, erkennt
// keiner der Ledger. Diese Proben brauchen keinen Speicher: sie stellen der Prüfung Ketten hin, die ein
// append-only-Speicher gar nicht erzeugen KANN (eine Lücke), und verlangen, dass sie auffliegen.

describe("verifyEvidenceChain", () => {
  it("erkennt eine LÜCKE: ein entfernter Eintrag lässt prevHash ins Leere zeigen", async () => {
    const ledger = new InMemoryEvidenceLedger();
    const ledgerId = `composable:${uid()}`;
    const a = await ledger.append(eintrag({ ledgerId }));
    await ledger.append(eintrag({ ledgerId })); // b — wird weggelassen
    const c = await ledger.append(eintrag({ ledgerId }));
    expect(verifyEvidenceChain([a, c])).toEqual({
      valid: false,
      length: 2,
      brokenAt: 1,
    });
  });

  it("erkennt die Manipulation des ERSTEN Eintrags (brokenAt = 0)", async () => {
    const ledger = new InMemoryEvidenceLedger();
    const ledgerId = `composable:${uid()}`;
    const a = await ledger.append(eintrag({ ledgerId }));
    const b = await ledger.append(eintrag({ ledgerId }));
    expect(verifyEvidenceChain([{ ...a, summary: "gefälscht" }, b])).toEqual({
      valid: false,
      length: 2,
      brokenAt: 0,
    });
  });

  it("die leere Kette ist gültig — Abwesenheit ist KEIN Bruch (und genau deshalb kein Nachweis)", () => {
    expect(verifyEvidenceChain([])).toEqual({ valid: true, length: 0 });
  });
});

// ─── Die Gegenprobe zur Dauerhaftigkeit ───────────────────────────────────────────────────────────────

describe("der gemessene Befund selbst", () => {
  it("die In-Memory-Variante VERLIERT die Kette beim Neustart — genau das lief bisher produktiv", async () => {
    // Ohne diese Probe wäre die ÜBERLEBT-Zusicherung oben nicht falsifizierbar: sie muss für einen
    // flüchtigen Speicher ROT sein. `apps/fachverfahren/server/index.ts` verdrahtete bis zum 2026-07-28
    // genau diesen Ledger fest — der Nachweis war nach jedem Neustart weg.
    const ledgerId = `composable:${uid()}`;
    const vorher = new InMemoryEvidenceLedger();
    await vorher.append(eintrag({ ledgerId }));
    expect(await vorher.list({ tenantId: "t1", ledgerId })).toHaveLength(1);
    const nachher = new InMemoryEvidenceLedger();
    expect(await nachher.list({ tenantId: "t1", ledgerId })).toHaveLength(0);
    // Und: die leere Kette meldet sich als "gültig" — Abwesenheit sieht aus wie Unversehrtheit.
    expect(await nachher.verify({ tenantId: "t1", ledgerId })).toEqual({
      valid: true,
      length: 0,
    });
  });

  it("PARITÄT: die In-Memory-Variante verhält sich sonst unverändert (Kette, Trennung, Kopie)", async () => {
    const ledger = new InMemoryEvidenceLedger();
    const ledgerId = `composable:${uid()}`;
    const a = await ledger.append(eintrag({ ledgerId }));
    const b = await ledger.append(eintrag({ ledgerId }));
    expect(a.prevHash).toBeNull();
    expect(b.prevHash).toBe(a.entryHash);
    expect(await ledger.verify({ tenantId: "t1", ledgerId })).toEqual({
      valid: true,
      length: 2,
    });
  });
});

// ─── Postgres-spezifisch: die Unveränderlichkeit ist eine Eigenschaft der TABELLE ─────────────────────

describe.skipIf(!pgUrl)(
  "app_evidence_ledger ist append-only (DB-Riegel)",
  () => {
    it("INSERT gelingt, roher UPDATE und DELETE werfen", async () => {
      const ledger = new PostgresEvidenceLedger(pgUrl!);
      const ledgerId = `composable:${uid()}`;
      const e = await ledger.append(eintrag({ ledgerId }));
      const client = await createPgClient(pgUrl!);
      await client.connect();
      try {
        await expect(
          client.query(
            "UPDATE app_evidence_ledger SET summary = $1 WHERE evidence_id = $2",
            ["manipuliert", e.evidenceId],
          ),
        ).rejects.toThrow(/append-only/i);
        await expect(
          client.query(
            "DELETE FROM app_evidence_ledger WHERE evidence_id = $1",
            [e.evidenceId],
          ),
        ).rejects.toThrow(/append-only/i);
        const nachher = await client.query<{ summary: string }>(
          "SELECT summary FROM app_evidence_ledger WHERE evidence_id = $1",
          [e.evidenceId],
        );
        expect(nachher.rows).toHaveLength(1);
        expect(nachher.rows[0]?.summary).toBe(e.summary);
      } finally {
        await client.end();
      }
    });

    it("MANIPULATION am dauerhaften Bestand (Riegel gelöst) bricht die Kette an genau dieser Stelle", async () => {
      // Der Riegel macht die Tabelle tamper-RESISTENT. Diese Probe zeigt das ZWEITE Bein: selbst wenn jemand
      // mit Eigentümerrechten den Trigger löst und die Zeile ändert, ist es tamper-EVIDENT — sonst wäre die
      // Hash-Kette bloss Dekoration.
      const ledger = new PostgresEvidenceLedger(pgUrl!);
      const ledgerId = `composable:${uid()}`;
      await ledger.append(eintrag({ ledgerId, summary: "erste" }));
      const zweite = await ledger.append(
        eintrag({ ledgerId, summary: "zweite" }),
      );
      await ledger.append(eintrag({ ledgerId, summary: "dritte" }));
      expect(await ledger.verify({ tenantId: "t1", ledgerId })).toEqual({
        valid: true,
        length: 3,
      });

      const client = await createPgClient(pgUrl!);
      await client.connect();
      try {
        await client.query(
          "ALTER TABLE app_evidence_ledger DISABLE TRIGGER app_evidence_ledger_append_only_trg",
        );
        await client.query(
          "UPDATE app_evidence_ledger SET summary = $1 WHERE evidence_id = $2",
          ["heimlich geändert", zweite.evidenceId],
        );
      } finally {
        await client
          .query(
            "ALTER TABLE app_evidence_ledger ENABLE TRIGGER app_evidence_ledger_append_only_trg",
          )
          .catch(() => undefined);
        await client.end();
      }

      expect(await ledger.verify({ tenantId: "t1", ledgerId })).toEqual({
        valid: false,
        length: 3,
        brokenAt: 1,
      });
    });

    it("KEINE GABELUNG: gleichzeitige Appends ergeben EINE gültige Kette", async () => {
      const ledger = new PostgresEvidenceLedger(pgUrl!);
      const ledgerId = `composable:${uid()}`;
      const anzahl = 8;
      await Promise.all(
        Array.from({ length: anzahl }, (_unused, i) =>
          ledger.append(eintrag({ ledgerId, summary: `parallel-${i}` })),
        ),
      );
      const kette = await ledger.list({ tenantId: "t1", ledgerId });
      expect(kette).toHaveLength(anzahl);
      // Genau EIN Genesis, und jeder Vorgänger hat genau EINEN Nachfolger.
      expect(kette.filter((e) => e.prevHash === null)).toHaveLength(1);
      expect(new Set(kette.map((e) => e.prevHash)).size).toBe(anzahl);
      expect(await ledger.verify({ tenantId: "t1", ledgerId })).toEqual({
        valid: true,
        length: anzahl,
      });
    });

    it("die gehashten Bytes überleben den Speicher unverändert (occurredAt bleibt wörtlich)", async () => {
      // `occurred_at` geht in den Hash ein. Wäre die Spalte timestamptz, normalisierte der Roundtrip die
      // Zeichenkette (Offset -> UTC) und die Kette bräche — deshalb ist sie text. Gegenprobe mit einer
      // NICHT-kanonischen Eingabe, an der ein timestamptz-Roundtrip sichtbar scheitern würde.
      const ledger = new PostgresEvidenceLedger(pgUrl!);
      const ledgerId = `composable:${uid()}`;
      const occurredAt = "2026-07-28T14:30:00.123456+02:00";
      const geschrieben = await ledger.append(
        eintrag({ ledgerId, occurredAt }),
      );
      const [gelesen] = await new PostgresEvidenceLedger(pgUrl!).list({
        tenantId: "t1",
        ledgerId,
      });
      expect(gelesen?.occurredAt).toBe(occurredAt);
      expect(gelesen?.entryHash).toBe(geschrieben.entryHash);
      expect(await ledger.verify({ tenantId: "t1", ledgerId })).toEqual({
        valid: true,
        length: 1,
      });
    });
  },
);

// ─── Auswahl aus der Umgebung: kein stiller Rückfall auf flüchtigen Nachweis ──────────────────────────

describe("createEvidenceLedgerFromEnv", () => {
  it("APP_PG_URL → Postgres (dauerhaft), OHNE Warnung", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(
        createEvidenceLedgerFromEnv({
          APP_PG_URL: "postgres://app:app@127.0.0.1:5432/app",
        } as NodeJS.ProcessEnv),
      ).toBeInstanceOf(PostgresEvidenceLedger);
      // PARITÄT/keine Überblockung: der dauerhafte Weg warnt NICHT.
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("APP_STORE_MODE=memory → In-Memory, aber LAUT (der Nachweis überlebt keinen Neustart)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(
        createEvidenceLedgerFromEnv({
          APP_STORE_MODE: "memory",
        } as NodeJS.ProcessEnv),
      ).toBeInstanceOf(InMemoryEvidenceLedger);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toMatch(
        /überlebt keinen Neustart/,
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("APP_STORE_MODE=chos + CHOS_API_URL → Graph-Ledger; ohne URL fail-closed", () => {
    expect(
      createEvidenceLedgerFromEnv({
        APP_STORE_MODE: "chos",
        CHOS_API_URL: "https://chos.example",
      } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(ChosEvidenceLedger);
    expect(
      createEvidenceLedgerFromEnv({
        APP_STORE_MODE: "chos",
      } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(UnavailableEvidenceLedger);
  });

  it("weder memory noch PG noch chos → fail-closed Unavailable (kein stiller In-Memory-Fallback)", async () => {
    const ledger = createEvidenceLedgerFromEnv({} as NodeJS.ProcessEnv);
    expect(ledger).toBeInstanceOf(UnavailableEvidenceLedger);
    await expect(
      ledger.list({ tenantId: "t1", ledgerId: "composable:x" }),
    ).rejects.toThrow(/APP_PG_URL/);
    await expect(ledger.append(eintrag())).rejects.toThrow(/APP_PG_URL/);
    await expect(
      ledger.verify({ tenantId: "t1", ledgerId: "composable:x" }),
    ).rejects.toThrow(/APP_PG_URL/);
  });
});
