import { describe, it, expect } from "vitest";
import type { LeistungConfig, Vorgang, WorkspaceConfig } from "./types.js";
import { createWorkspaceStore } from "./store.js";
import {
  istWurzel,
  kinderAnzahl,
  unteraufgabenVon,
} from "./lib/unteraufgaben.js";

function vorgang(
  id: string,
  eingangIso: string,
  name: string,
  vorgangsnummer: string,
): Vorgang {
  return {
    id,
    vorgangsnummer,
    eingangIso,
    antragsdaten: { name },
    status: "eingegangen",
    ki: { confidence: 0, flags: [] },
    nachweise: [],
    history: [],
  };
}

function macheConfig(
  id: string,
  seeds: { id: string; eingangIso: string; name: string }[],
): LeistungConfig {
  return {
    id,
    label: id,
    kommune: "Musterstadt",
    rechtsgrundlagen: [],
    antrag: {
      steps: [
        {
          id: "s1",
          titel: "Angaben",
          felder: [
            { name: "name", label: "Name", typ: "text", required: true },
          ],
        },
      ],
    },
    statusMachine: {
      initial: "eingegangen",
      states: [
        { key: "eingegangen", label: "Eingegangen", tone: "neu" },
        { key: "geprueft", label: "Geprüft", tone: "ok", terminal: true },
      ],
      transitions: [
        {
          from: "eingegangen",
          to: "geprueft",
          label: "Prüfen",
          rollen: ["sachbearbeitung"],
        },
      ],
    },
    register: { suchfelder: ["name"] },
    detailSektionen: [
      { titel: "Antrag", felder: [{ pfad: "name", label: "Name" }] },
    ],
    seed: ({ vorgangsnummer }) =>
      seeds.map((s) => vorgang(s.id, s.eingangIso, s.name, vorgangsnummer())),
  };
}

function macheWorkspace(): WorkspaceConfig {
  return {
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    verfahren: [
      {
        procedureId: "leistung-a",
        config: macheConfig("leistung-a", [
          { id: "a-v1", eingangIso: "2026-01-02T00:00:00.000Z", name: "Alice" },
          { id: "a-v2", eingangIso: "2026-01-03T00:00:00.000Z", name: "Bob" },
        ]),
      },
      {
        procedureId: "leistung-b",
        config: macheConfig("leistung-b", [
          { id: "b-v1", eingangIso: "2026-01-01T00:00:00.000Z", name: "Clara" },
        ]),
      },
    ],
    prioritaeten: [
      { key: "hoch", label: "Hoch", tone: "warn", ordinal: 1 },
      { key: "niedrig", label: "Niedrig", tone: "info", ordinal: 3 },
    ],
    labels: [{ key: "eilt", label: "Eilt", tone: "block" }],
  };
}

const NOW = () => "2026-06-01T00:00:00.000Z";

describe("createWorkspaceStore — verfahrensübergreifende Aggregation", () => {
  it("aggregiert Aufgaben über ALLE Verfahren, sortiert nach sortRank (eingangIso-Ordnung)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const tasks = store.listTasks();
    expect(tasks.map((t) => t.vorgangId)).toEqual(["b-v1", "a-v1", "a-v2"]);
    // verschiedene Verfahren in EINER Liste
    expect(new Set(tasks.map((t) => t.procedureId))).toEqual(
      new Set(["leistung-a", "leistung-b"]),
    );
  });

  it("führt die Registry der aktiven Verfahren", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    expect(store.verfahren().map((e) => e.procedureId)).toEqual([
      "leistung-a",
      "leistung-b",
    ]);
    expect(store.configFor("leistung-a")?.id).toBe("leistung-a");
  });

  it("filtert nach Verfahren", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const tasks = store.listTasks({ procedureId: ["leistung-b"] });
    expect(tasks.map((t) => t.vorgangId)).toEqual(["b-v1"]);
  });

  it("filtert nach nicht zugewiesenen Aufgaben ($niemand)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    store.assign("a-v1", "sb.mueller");
    const offen = store.listTasks({ zugewiesenAn: "$niemand" });
    expect(offen.map((t) => t.vorgangId)).toEqual(["b-v1", "a-v2"]);
  });

  it("leitet einen data-driven Kurztitel aus der ersten Detail-Sektion ab", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const t = store.getTask("a-v1");
    expect(t?.titel).toContain("Alice");
  });
});

describe("Board-Metadaten (kein fachliches Gate)", () => {
  it("setzt Priorität/Zuweisung/Label und erhöht die Version", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const v0 = store.getTask("a-v1")!.version;
    store.setPrioritaet("a-v1", "hoch");
    store.assign("a-v1", "sb.mueller");
    store.addLabel("a-v1", "eilt");
    const t = store.getTask("a-v1")!;
    expect(t.prioritaet).toBe("hoch");
    expect(t.zugewiesenAn).toBe("sb.mueller");
    expect(t.labels).toContain("eilt");
    expect(t.version).toBe(v0 + 3);
  });

  it("addLabel ist idempotent (kein Duplikat)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    store.addLabel("a-v1", "eilt");
    store.addLabel("a-v1", "eilt");
    expect(store.getTask("a-v1")!.labels).toEqual(["eilt"]);
  });

  it("uebernehmeKiVorschlag setzt Metadaten UND protokolliert die KI-Herkunft (task.ki-uebernommen)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const v0 = store.getTask("a-v1")!.version;
    store.uebernehmeKiVorschlag("a-v1", { prioritaet: "hoch" }, "sb.mueller");
    const t = store.getTask("a-v1")!;
    expect(t.prioritaet).toBe("hoch");
    // GENAU EIN mutMeta → EIN Versions-Sprung (nicht je Feld); Server == InMemory.
    expect(t.version).toBe(v0 + 1);
    // Die KI-Herkunft ist auditierbar protokolliert (nicht nur UI-Badge) — der Bypass über setPrioritaet ist zu.
    const marke = store
      .listAktivitaet("a-v1")
      .find((a) => a.typ === "task.ki-uebernommen");
    expect(marke).toBeDefined();
    expect(marke!.akteurId).toBe("sb.mueller");
    expect(marke!.payload).toMatchObject({
      marking: "ki-vorschlag",
      prioritaet: "hoch",
    });
    // GENAU ein ki-uebernommen-Vermerk, KEINE zusätzliche prioritaet-geaendert-Aktivität (Spiegel von /ai/apply).
    expect(
      store
        .listAktivitaet("a-v1")
        .filter((a) => a.typ === "task.prioritaet-geaendert"),
    ).toHaveLength(0);
  });

  it("move ordnet neu ein und respektiert Optimistic Locking", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const t = store.getTask("a-v2")!;
    // vor die aktuell erste Karte ziehen
    const erste = store.listTasks()[0]!;
    const neuerRang = erste.sortRank.slice(0, -1) + "0"; // garantiert < erster Rang
    store.move("a-v2", undefined, neuerRang, t.version);
    expect(store.listTasks()[0]!.vorgangId).toBe("a-v2");
    // veraltete Version → Konflikt
    expect(() => store.move("a-v2", undefined, "zzz", t.version)).toThrow(
      /Konflikt/,
    );
  });

  it("bulkAssign bilanziert jede Teilaktion einzeln", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const ergebnis = store.bulkAssign(["a-v1", "unbekannt", "b-v1"], "sb.x");
    expect(ergebnis.find((r) => r.taskId === "a-v1")?.ok).toBe(true);
    expect(ergebnis.find((r) => r.taskId === "unbekannt")?.ok).toBe(false);
    expect(store.getTask("b-v1")?.zugewiesenAn).toBe("sb.x");
  });

  it("bulkPrioritaet/bulkLabel setzen Metadaten je Aufgabe mit Einzel-Bilanz (kein Bulk-ENTSCHEIDUNG)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });

    const rp = store.bulkPrioritaet(
      ["a-v1", "unbekannt", "b-v1"],
      "hoch",
      "sb.eins",
    );
    expect(rp.find((r) => r.taskId === "a-v1")?.ok).toBe(true);
    expect(rp.find((r) => r.taskId === "unbekannt")?.ok).toBe(false); // Bilanz je Aufgabe
    expect(store.getTask("a-v1")?.prioritaet).toBe("hoch");
    expect(store.getTask("b-v1")?.prioritaet).toBe("hoch");

    const rl = store.bulkLabel(["a-v1", "b-v1"], "eilt", "sb.eins");
    expect(rl.every((r) => r.ok)).toBe(true);
    expect(store.getTask("a-v1")?.labels).toContain("eilt");

    // Change-Log: jede Bulk-Teilaktion erzeugt die passende Aktivität mit Akteur (Metadaten, kein Statuswechsel).
    const typen = store.listAktivitaet("a-v1").map((x) => x.typ);
    expect(typen).toContain("task.prioritaet-geaendert");
    expect(typen).toContain("task.label-hinzugefuegt");
  });
});

describe("Fachlicher Übergang (getrennt von Metadaten, mit Guards)", () => {
  it("taskUebergang delegiert an den Sub-Store und ändert den Status", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    store.taskUebergang("a-v1", "geprueft", "sachbearbeitung");
    expect(store.portFor("leistung-a")?.get("a-v1")?.status).toBe("geprueft");
  });

  it("verweigert einen Übergang durch eine nicht berechtigte Rolle", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    expect(() => store.taskUebergang("a-v1", "geprueft", "buerger")).toThrow();
  });
});

describe("Antrag über portFor erzeugt eine Aufgabe mit Metadaten", () => {
  it("legt für einen neuen Vorgang Task-Metadaten an (Rang am Ende)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const vorher = store.listTasks().length;
    const v = store.portFor("leistung-a")!.einreichen({ name: "Neu" });
    const tasks = store.listTasks();
    expect(tasks).toHaveLength(vorher + 1);
    const neu = store.getTask(v.id)!;
    expect(neu.procedureId).toBe("leistung-a");
    expect(neu.titel).toContain("Neu");
    // ans Ende gereiht
    expect(tasks[tasks.length - 1]!.vorgangId).toBe(v.id);
  });
});

describe("Generische Robustheit — degenerierte Configs laufen ohne Fehler durch", () => {
  it("ein Verfahren OHNE Seed liefert eine leere Aufgabenliste (kein Crash)", () => {
    const cfg = macheConfig("leer", []);
    const store = createWorkspaceStore(
      {
        tenantId: "t1",
        authorityId: "b1",
        jurisdictionId: "de",
        verfahren: [{ procedureId: "leer", config: cfg }],
        prioritaeten: [],
        labels: [],
      },
      { now: NOW },
    );
    expect(store.listTasks()).toEqual([]);
    expect(store.verfahren()).toHaveLength(1);
    // Antrag stellen erzeugt trotzdem eine Aufgabe.
    const v = store.portFor("leer")!.einreichen({ name: "Neu" });
    expect(store.listTasks().map((t) => t.vorgangId)).toEqual([v.id]);
  });

  it("ein inaktives Verfahren wird ausgeblendet", () => {
    const store = createWorkspaceStore(
      {
        tenantId: "t1",
        authorityId: "b1",
        jurisdictionId: "de",
        verfahren: [
          {
            procedureId: "aus",
            config: macheConfig("aus", [
              { id: "x1", eingangIso: "2026-01-01T00:00:00.000Z", name: "X" },
            ]),
            aktiv: false,
          },
        ],
        prioritaeten: [],
        labels: [],
      },
      { now: NOW },
    );
    expect(store.verfahren()).toHaveLength(0);
    expect(store.listTasks()).toEqual([]);
  });
});

describe("Multi-Verfahren-Robustheit — kollidierende Vorgangs-Ids", () => {
  function macheKollisionsWorkspace(): WorkspaceConfig {
    return {
      tenantId: "t1",
      authorityId: "b1",
      jurisdictionId: "de",
      verfahren: [
        {
          procedureId: "leistung-a",
          config: macheConfig("leistung-a", [
            {
              id: "shared-1",
              eingangIso: "2026-01-01T00:00:00.000Z",
              name: "Aus A",
            },
          ]),
        },
        {
          procedureId: "leistung-b",
          config: macheConfig("leistung-b", [
            {
              id: "shared-1",
              eingangIso: "2026-01-02T00:00:00.000Z",
              name: "Aus B",
            },
          ]),
        },
      ],
      prioritaeten: [{ key: "hoch", label: "Hoch", tone: "warn", ordinal: 1 }],
      labels: [],
    };
  }

  it("hält zwei Vorgänge mit gleicher Id getrennt (verfahren::vorgang)", () => {
    const store = createWorkspaceStore(macheKollisionsWorkspace(), {
      now: NOW,
    });
    const tasks = store.listTasks();
    expect(tasks).toHaveLength(2);
    expect(new Set(tasks.map((t) => t.id))).toEqual(
      new Set(["leistung-a::shared-1", "leistung-b::shared-1"]),
    );
    expect(store.getTask("leistung-a::shared-1")?.titel).toContain("Aus A");
    expect(store.getTask("leistung-b::shared-1")?.titel).toContain("Aus B");
  });

  it("eine Metadaten-Änderung trifft NUR das gemeinte Verfahren", () => {
    const store = createWorkspaceStore(macheKollisionsWorkspace(), {
      now: NOW,
    });
    store.setPrioritaet("leistung-a::shared-1", "hoch");
    expect(store.getTask("leistung-a::shared-1")?.prioritaet).toBe("hoch");
    expect(store.getTask("leistung-b::shared-1")?.prioritaet).toBeUndefined();
  });

  it("eine ROHE (mehrdeutige) Vorgangs-Id wirft einen sprechenden Fehler", () => {
    const store = createWorkspaceStore(macheKollisionsWorkspace(), {
      now: NOW,
    });
    expect(() => store.getTask("shared-1")).toThrow(/mehrdeutig/);
  });
});

describe("Reaktivität (useSyncExternalStore-Vertrag)", () => {
  it("snapshot() erhöht sich bei jeder Änderung; subscribe feuert", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    let gefeuert = 0;
    const unsub = store.subscribe(() => {
      gefeuert += 1;
    });
    const s0 = store.snapshot();
    store.setPrioritaet("a-v1", "hoch");
    expect(store.snapshot()).toBeGreaterThan(s0);
    expect(gefeuert).toBeGreaterThan(0);
    unsub();
  });
});

describe("Aufgaben-Detail (Vermerke/Aktivität/Beziehungen) — reaktiv", () => {
  it("addKommentar: Vermerk append-only + Aktivität + Snapshot-Bump", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const taskId = store.listTasks()[0]!.id;
    const s0 = store.snapshot();
    store.addKommentar(taskId, "Erster Vermerk", "sb.a");
    store.addKommentar(taskId, "Zweiter Vermerk", "sb.b");
    expect(store.snapshot()).toBeGreaterThan(s0);
    expect(store.listKommentare(taskId).map((x) => x.text)).toEqual([
      "Erster Vermerk",
      "Zweiter Vermerk",
    ]);
    expect(store.listKommentare(taskId)[0]!.autorAkteurId).toBe("sb.a");
    // Jeder Vermerk erzeugt eine Aktivität.
    expect(
      store.listAktivitaet(taskId).filter((a) => a.typ === "task.commented"),
    ).toHaveLength(2);
    // Leerer Vermerk wird ignoriert.
    store.addKommentar(taskId, "   ", "sb.a");
    expect(store.listKommentare(taskId)).toHaveLength(2);
  });

  it("Beziehungen: anlegen (keine Selbstreferenz/Duplikat) + entfernen", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const tasks = store.listTasks();
    const a = tasks[0]!;
    const b = tasks[1]!;
    store.addBeziehung(a.id, b.id, "blocks");
    store.addBeziehung(a.id, b.id, "blocks"); // Duplikat → ignoriert
    store.addBeziehung(a.id, a.id, "relates"); // Selbstreferenz → ignoriert
    const rel = store.listBeziehungen(a.id);
    expect(rel).toHaveLength(1);
    expect(rel[0]!.typ).toBe("blocks");
    store.entferneBeziehung(a.id, rel[0]!.id);
    expect(store.listBeziehungen(a.id)).toHaveLength(0);
  });
});

describe("resolveTaskId — verfahrens-qualifizierte Aufgaben-Id löst kollidierende rohe Vorgangs-Ids", () => {
  // Zwei Verfahren mit DERSELBEN rohen Vorgangs-Id („shared-1") — genau der Fall, der bei N≥2 real auftritt (jeder
  // Sub-Store seedet mit eigenem Zähler, `seed-1` kollidiert). Die kanonische Aufgaben-Id `procedureId::vorgangId`
  // bleibt global eindeutig; die App-Detail-Route trägt genau diese qualifizierte Id.
  function macheKollisionsWorkspace(): WorkspaceConfig {
    return {
      tenantId: "t1",
      authorityId: "b1",
      jurisdictionId: "de",
      verfahren: [
        {
          procedureId: "leistung-a",
          config: macheConfig("leistung-a", [
            {
              id: "shared-1",
              eingangIso: "2026-01-02T00:00:00.000Z",
              name: "Alice",
            },
          ]),
        },
        {
          procedureId: "leistung-b",
          config: macheConfig("leistung-b", [
            {
              id: "shared-1",
              eingangIso: "2026-01-01T00:00:00.000Z",
              name: "Clara",
            },
          ]),
        },
      ],
      prioritaeten: [{ key: "hoch", label: "Hoch", tone: "warn", ordinal: 1 }],
      labels: [],
    };
  }

  it("löst die verfahrens-qualifizierte Id eindeutig auf, obwohl die rohe Vorgangs-Id kollidiert", () => {
    const store = createWorkspaceStore(macheKollisionsWorkspace(), {
      now: NOW,
    });
    const a = store.getTask("leistung-a::shared-1");
    const b = store.getTask("leistung-b::shared-1");
    expect(a?.id).toBe("leistung-a::shared-1");
    expect(a?.procedureId).toBe("leistung-a");
    expect(a?.vorgangId).toBe("shared-1");
    expect(b?.id).toBe("leistung-b::shared-1");
    expect(b?.procedureId).toBe("leistung-b");
    expect(b?.vorgangId).toBe("shared-1");
  });

  it("wirft bei roher, mehrdeutiger Vorgangs-Id (erzwingt die volle Id) — kein stiller Fehlgriff", () => {
    const store = createWorkspaceStore(macheKollisionsWorkspace(), {
      now: NOW,
    });
    expect(() => store.getTask("shared-1")).toThrow(/mehrdeutig/);
  });
});

describe("Verfahrensübergreifende Inbox / Triage (Phase 4)", () => {
  it("listet offene Eingänge (je aktivem Verfahren einen Seed), Status pending", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const offen = store.listInbox();
    expect(offen.length).toBe(2);
    expect(new Set(offen.map((e) => e.procedureId))).toEqual(
      new Set(["leistung-a", "leistung-b"]),
    );
    expect(offen.every((e) => e.triageStatus === "pending")).toBe(true);
  });

  it("triageInbox setzt declined → raus aus pending, sichtbar unter declined, KEIN Vorgang erzeugt", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const vorherTasks = store.listTasks().length;
    const item = store.listInbox()[0]!;
    store.triageInbox(item.id, "declined");
    expect(store.listInbox().some((e) => e.id === item.id)).toBe(false);
    expect(store.listInbox("declined").some((e) => e.id === item.id)).toBe(
      true,
    );
    expect(store.listTasks().length).toBe(vorherTasks);
  });

  it("acceptInbox erzeugt einen Vorgang + Aufgabe im richtigen Verfahren, markiert accepted, protokolliert Aktivität", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const vorherTasks = store.listTasks().length;
    const item = store.listInbox().find((e) => e.procedureId === "leistung-a")!;
    const taskId = store.acceptInbox(item.id, "sb.a");
    expect(taskId).toBeDefined();
    expect(store.listTasks().length).toBe(vorherTasks + 1);
    expect(store.getTask(taskId!)?.procedureId).toBe("leistung-a");
    expect(store.listInbox().some((e) => e.id === item.id)).toBe(false);
    expect(
      store
        .listAktivitaet(taskId!)
        .some((a) => a.typ === "task.aus-inbox-angenommen"),
    ).toBe(true);
  });

  it("acceptInbox auf einen bereits angenommenen Eingang liefert undefined (kein Doppel-Vorgang)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const item = store.listInbox()[0]!;
    store.acceptInbox(item.id, "sb.a");
    expect(store.acceptInbox(item.id, "sb.a")).toBeUndefined();
  });
});

describe("Fälligkeit data-driven aus config.fristenTypen (Kalender/frist-erreicht)", () => {
  it("leitet faelligIso aus dem ersten fristenTyp + eingangIso ab (nur nicht-terminale Vorgänge)", () => {
    const cfg = macheConfig("frist-v", [
      { id: "offen-1", eingangIso: "2026-01-01T00:00:00.000Z", name: "Alice" },
    ]);
    // Frist-Konfig als DATEN ergänzen (14 Tage ab Eingang).
    cfg.fristenTypen = [
      { id: "f", label: "Frist", dauer: 14, einheit: "tag", anker: "eingang" },
    ];
    const store = createWorkspaceStore(
      {
        tenantId: "t1",
        authorityId: "b1",
        jurisdictionId: "de",
        verfahren: [{ procedureId: "frist-v", config: cfg }],
        prioritaeten: [
          { key: "hoch", label: "Hoch", tone: "warn", ordinal: 1 },
        ],
        labels: [],
      },
      { now: NOW },
    );
    // 2026-01-01 + 14 Tage = 2026-01-15; der Vorgang ist im nicht-terminalen Initialstatus „eingegangen".
    expect(store.getTask("frist-v::offen-1")?.faelligIso?.slice(0, 10)).toBe(
      "2026-01-15",
    );
  });

  it("setzt KEINE faelligIso ohne fristenTypen (kein fabrizierter Wert)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    expect(store.listTasks().every((t) => t.faelligIso === undefined)).toBe(
      true,
    );
  });
});

describe("Verfahrens-FREIE Aufgaben (generisches Projekt-/Workflow-Management)", () => {
  it("createFreieAufgabe legt eine Aufgabe OHNE Verfahren/Vorgang an, sichtbar in listTasks", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const vorher = store.listTasks().length;
    const frei = store.createFreieAufgabe("Projekt-Todo: Konzept schreiben", {
      prioritaet: "hoch",
    });
    expect(frei.procedureId).toBeUndefined();
    expect(frei.vorgangId).toBeUndefined();
    expect(frei.prioritaet).toBe("hoch");
    const tasks = store.listTasks();
    expect(tasks.length).toBe(vorher + 1);
    expect(
      tasks.some((t) => t.id === frei.id && t.procedureId === undefined),
    ).toBe(true);
  });

  it("Metadaten-Ops (Zuweisung/Priorität/Label) funktionieren auf freien Aufgaben", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const frei = store.createFreieAufgabe("Todo");
    store.assign(frei.id, "sb.x");
    store.setPrioritaet(frei.id, "dringend");
    store.addLabel(frei.id, "eilt");
    const t = store.getTask(frei.id)!;
    expect(t.zugewiesenAn).toBe("sb.x");
    expect(t.prioritaet).toBe("dringend");
    expect(t.labels).toContain("eilt");
  });

  it("taskUebergang auf einer freien Aufgabe wirft (kein fachlicher Status)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const frei = store.createFreieAufgabe("Todo");
    expect(() =>
      store.taskUebergang(frei.id, "geprueft", "sachbearbeitung"),
    ).toThrow(/verfahrens-frei/);
  });

  it("Verfahrens-Filter schließt freie Aufgaben aus; $niemand + Vermerke greifen", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const frei = store.createFreieAufgabe("Todo");
    expect(
      store
        .listTasks({ procedureId: ["leistung-a"] })
        .some((t) => t.id === frei.id),
    ).toBe(false);
    expect(
      store
        .listTasks({ zugewiesenAn: "$niemand" })
        .some((t) => t.id === frei.id),
    ).toBe(true);
    store.addKommentar(frei.id, "Notiz");
    expect(store.listKommentare(frei.id).some((k) => k.text === "Notiz")).toBe(
      true,
    );
  });
});

describe("Gespeicherte Ansichten (in-memory)", () => {
  it("saveView legt an, listSavedViews liefert sie, deleteView entfernt", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    expect(store.listSavedViews()).toEqual([]);
    store.saveView({
      label: "Meine dringenden",
      layout: "liste",
      definition: { prioritaet: ["dringend"] },
    });
    const views = store.listSavedViews();
    expect(views).toHaveLength(1);
    expect(views[0]?.label).toBe("Meine dringenden");
    expect(views[0]?.scope).toBe("personal");
    expect(views[0]?.definition).toEqual({ prioritaet: ["dringend"] });
    store.deleteView(views[0]!.id);
    expect(store.listSavedViews()).toEqual([]);
  });

  it("saveView/deleteView bumpen die Version (Reaktivität)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const v0 = store.snapshot();
    store.saveView({ label: "A", layout: "liste" });
    expect(store.snapshot()).toBeGreaterThan(v0);
    const id = store.listSavedViews()[0]!.id;
    const v1 = store.snapshot();
    store.deleteView(id);
    expect(store.snapshot()).toBeGreaterThan(v1);
  });
});

describe("createWorkspaceStore — Aktivitäts-Change-Log", () => {
  it("Zuweisung/Priorität/Label/Statuswechsel erzeugen je eine Aktivität mit Akteur + Typ + Payload", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const t = store.listTasks()[0]!; // b-v1 (leistung-b), Status „eingegangen"
    expect(store.listAktivitaet(t.id)).toEqual([]);

    store.assign(t.id, "sb.zwei", "sb.eins");
    store.setPrioritaet(t.id, "hoch", "sb.eins");
    store.addLabel(t.id, "eilt", "sb.eins");
    store.taskUebergang(
      t.id,
      "geprueft",
      "sachbearbeitung",
      undefined,
      "sb.eins",
    );

    const akt = store.listAktivitaet(t.id);
    expect(akt.map((a) => a.typ)).toEqual([
      "task.zugewiesen",
      "task.prioritaet-geaendert",
      "task.label-hinzugefuegt",
      "task.status-geaendert",
    ]);
    expect(akt.every((a) => a.akteurId === "sb.eins")).toBe(true);
    expect(akt[0]!.payload).toEqual({ zugewiesenAn: "sb.zwei" });
    expect(akt[1]!.payload).toEqual({ prioritaet: "hoch" });
    expect(akt[3]!.payload).toEqual({ nach: "geprueft" });
  });

  it("ein FEHLGESCHLAGENER Statuswechsel (unerlaubt) erzeugt KEINE Aktivität", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const t = store.listTasks()[0]!;
    expect(() =>
      store.taskUebergang(
        t.id,
        "gibtsnicht",
        "sachbearbeitung",
        undefined,
        "sb.eins",
      ),
    ).toThrow();
    expect(store.listAktivitaet(t.id)).toEqual([]);
  });

  it("addBeziehung legt die Verknüpfung an UND protokolliert eine Aktivität task.beziehung-hinzugefuegt", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const alle = store.listTasks();
    const t1 = alle[0]!;
    const t2 = alle[1]!;
    store.addBeziehung(t1.id, t2.id, "blocks", "sb.eins");

    const bez = store.listBeziehungen(t1.id);
    expect(bez).toHaveLength(1);
    expect(bez[0]!).toMatchObject({
      verknuepfteAufgabeId: t2.id,
      typ: "blocks",
    });

    const eintrag = store
      .listAktivitaet(t1.id)
      .find((a) => a.typ === "task.beziehung-hinzugefuegt");
    expect(eintrag?.akteurId).toBe("sb.eins");
    expect(eintrag?.payload).toMatchObject({
      verknuepfteAufgabeId: t2.id,
      typ: "blocks",
    });
  });

  it("addBeziehung ignoriert Selbstreferenz + Duplikat (kein Aktivitäts-Rauschen)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const alle = store.listTasks();
    const t1 = alle[0]!;
    const t2 = alle[1]!;
    store.addBeziehung(t1.id, t1.id, "blocks", "sb.eins"); // Selbstreferenz → ignoriert
    store.addBeziehung(t1.id, t2.id, "blocks", "sb.eins");
    store.addBeziehung(t1.id, t2.id, "blocks", "sb.eins"); // Duplikat → ignoriert
    expect(store.listBeziehungen(t1.id)).toHaveLength(1);
    expect(
      store
        .listAktivitaet(t1.id)
        .filter((a) => a.typ === "task.beziehung-hinzugefuegt"),
    ).toHaveLength(1);
  });
});

describe("Unteraufgaben (Sub-Issues, DEV)", () => {
  it("createFreieAufgabe mit parentAufgabeId legt eine Unteraufgabe an — als Kind auffindbar, Elternteil bleibt Wurzel", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const parent = store.createFreieAufgabe("Eltern-Projekt");
    const kind = store.createFreieAufgabe("Teilschritt A", {
      parentAufgabeId: parent.id,
    });
    expect(kind.parentAufgabeId).toBe(parent.id);

    const alle = store.listTasks();
    expect(unteraufgabenVon(alle, parent.id).map((x) => x.id)).toEqual([
      kind.id,
    ]);
    // Elternteil = Wurzel (eigene Board-Karte), Kind = keine Wurzel (nur im Detail).
    expect(istWurzel(store.getTask(parent.id)!)).toBe(true);
    expect(istWurzel(store.getTask(kind.id)!)).toBe(false);
    expect(kinderAnzahl(alle).get(parent.id)).toBe(1);
  });

  it("eine gewöhnliche freie Aufgabe hat keinen Parent (rückwärtskompatibel)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const frei = store.createFreieAufgabe("Ohne Eltern");
    expect(frei.parentAufgabeId).toBeUndefined();
    expect(istWurzel(frei)).toBe(true);
  });
});

describe("Wissensbasis/Wiki (DEV) — speichereWissen + Revisionshistorie (#20 Phase 3/4)", () => {
  it("legt an, versioniert hoch und führt die Revisionshistorie (neueste zuerst)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    // Neuanlage (expectedVersion fehlt = 0).
    store.speichereWissen({
      id: "handbuch",
      titel: "Handbuch",
      markdown: "v1",
    });
    expect(store.listWissen().find((a) => a.id === "handbuch")?.version).toBe(
      1,
    );
    // Neue Version (expectedVersion = 1).
    store.speichereWissen({
      id: "handbuch",
      titel: "Handbuch",
      markdown: "v2",
      expectedVersion: 1,
    });
    const kopf = store.listWissen().find((a) => a.id === "handbuch");
    expect(kopf?.version).toBe(2);
    expect(kopf?.markdown).toBe("v2");

    const revs = store.listWissenRevisionen("handbuch");
    expect(revs.map((r) => r.version)).toEqual([2, 1]); // neueste zuerst
    expect(revs[0]?.markdown).toBe("v2");
    expect(revs[1]?.markdown).toBe("v1"); // alte Revision ist ein unveränderter Snapshot
  });

  it("lehnt eine veraltete erwartete Version ab (no-op) und hält Verlauf leer für unbekannte Artikel", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    store.speichereWissen({ id: "doc", titel: "Doc", markdown: "v1" }); // → v1
    // Veraltete expectedVersion (0 statt 1) → keine Änderung.
    store.speichereWissen({ id: "doc", titel: "Doc", markdown: "stale" });
    expect(store.listWissen().find((a) => a.id === "doc")?.markdown).toBe("v1");
    expect(store.listWissenRevisionen("doc").map((r) => r.version)).toEqual([
      1,
    ]);
    // Unbekannter Artikel → leerer Verlauf (wie ein nie gespeicherter Artikel in PROD).
    expect(store.listWissenRevisionen("gibt-es-nicht")).toEqual([]);
  });
});
