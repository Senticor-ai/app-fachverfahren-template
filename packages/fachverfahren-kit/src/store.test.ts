import { describe, expect, it } from "vitest";
import { createFachverfahrenStore } from "./store.js";
import type { LeistungConfig, Vorgang } from "./types.js";

// Der SCHREIBPFAD des Stores war vollständig ungetestet — genau der Pfad, den die Bürger-Journey nutzt
// (Antrag absenden → Sachbearbeitung entscheidet). Diese Datei nagelt den Port-Vertrag fest, inklusive
// der async-Signatur: Lesen (list/get) bleibt SYNCHRON aus dem Snapshot, Schreiben ist ASYNC (damit eine
// server-gestützte Implementierung überhaupt typisierbar ist).

const config: LeistungConfig = {
  id: "musterantrag",
  label: "Musterantrag",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [{ norm: "§ 1 Mustersatzung", titel: "Grundlage" }],
  antrag: { steps: [{ id: "s", titel: "Angaben", felder: [] }] },
  statusMachine: {
    initial: "eingegangen",
    states: [
      { key: "eingegangen", label: "Eingegangen", tone: "neu" },
      { key: "in_pruefung", label: "In Prüfung", tone: "info" },
      { key: "festgesetzt", label: "Festgesetzt", tone: "ok", terminal: true },
    ],
    transitions: [
      {
        from: "eingegangen",
        to: "in_pruefung",
        label: "In Prüfung nehmen",
        rollen: ["sachbearbeitung"],
      },
      {
        from: "in_pruefung",
        to: "festgesetzt",
        label: "Festsetzen",
        rollen: ["sachbearbeitung"],
        vierAugen: true,
      },
    ],
  },
  register: {
    suchfelder: ["strasse"],
    mock: [{ strasse: "Musterweg 1", plz: "12345", ort: "Musterstadt" }],
  },
  detailSektionen: [],
};

function store() {
  return createFachverfahrenStore(config, {
    now: () => "2026-01-01T00:00:00.000Z",
  });
}

describe("VorgangPort — Schreibpfad", () => {
  it("einreichen legt einen Vorgang im Initialstatus an, den list/get SYNCHRON sehen", async () => {
    const s = store();
    expect(s.list()).toHaveLength(0);
    const v = await s.einreichen({ name: "Muster" });
    expect(v.status).toBe("eingegangen");
    // Der Snapshot ist nach dem await sofort synchron lesbar — genau das erwarten die Bausteine, die
    // `port.list()` im Render-Body aufrufen (AufsichtDashboard) bzw. über useSyncExternalStore abonnieren.
    expect(s.list()).toHaveLength(1);
    expect(s.get(v.id)?.id).toBe(v.id);
  });

  it("einreichen setzt KEINE KI-Einschätzung (an diesen Store ist kein Modell gebunden)", async () => {
    const v = await store().einreichen({ name: "Muster" });
    // Nicht `confidence: 0` — das hiesse „ein Modell war unsicher". Es lief gar keines.
    expect(v.ki).toBeUndefined();
  });

  it("uebergang wechselt den Status und schreibt einen History-Eintrag", async () => {
    const s = store();
    const v = await s.einreichen({ name: "Muster" });
    await s.uebergang(
      v.id,
      "in_pruefung",
      "sachbearbeitung",
      undefined,
      "sb.a",
    );
    expect(s.get(v.id)?.status).toBe("in_pruefung");
    expect(s.get(v.id)?.history.at(-1)).toMatchObject({
      rolle: "sachbearbeitung",
      akteur: "sb.a",
    });
  });

  it("uebergang LEHNT AB (rejected), wenn der Übergang nicht erlaubt ist", async () => {
    const s = store();
    const v = await s.einreichen({ name: "Muster" });
    // eingegangen → festgesetzt gibt es nicht. Als Rejection, nicht als stiller No-Op: der async-Vertrag
    // verlangt, dass Aufrufer awaiten und den Fehler behandeln.
    await expect(
      s.uebergang(v.id, "festgesetzt", "sachbearbeitung"),
    ).rejects.toThrow(/nicht erlaubt/);
    expect(s.get(v.id)?.status).toBe("eingegangen");
  });

  it("uebergang LEHNT AB, wenn eine fremde Rolle ihn auslösen will", async () => {
    const s = store();
    const v = await s.einreichen({ name: "Muster" });
    await expect(s.uebergang(v.id, "in_pruefung", "buerger")).rejects.toThrow(
      /Rolle/,
    );
  });

  it("Vier-Augen: derselbe Akteur darf den vierAugen-Übergang nicht selbst auslösen", async () => {
    const s = store();
    const v = await s.einreichen({ name: "Muster" });
    await s.uebergang(
      v.id,
      "in_pruefung",
      "sachbearbeitung",
      undefined,
      "sb.a",
    );
    // sb.a hat vorbereitet → sb.a darf nicht festsetzen.
    await expect(
      s.uebergang(v.id, "festgesetzt", "sachbearbeitung", undefined, "sb.a"),
    ).rejects.toThrow(/Vier-Augen/);
    expect(s.get(v.id)?.status).toBe("in_pruefung");
    // Eine ANDERE Person darf.
    await s.uebergang(
      v.id,
      "festgesetzt",
      "sachbearbeitung",
      undefined,
      "sb.b",
    );
    expect(s.get(v.id)?.status).toBe("festgesetzt");
  });

  it("lookupRegister findet über die konfigurierten Suchfelder — und liefert undefined ohne Treffer", async () => {
    const s = store();
    await expect(s.lookupRegister("Musterweg")).resolves.toMatchObject({
      ort: "Musterstadt",
    });
    await expect(s.lookupRegister("gibt-es-nicht")).resolves.toBeUndefined();
    await expect(s.lookupRegister("")).resolves.toBeUndefined();
  });
});

describe("VorgangPort — Persistenz-Naht", () => {
  it("ohne Persistenz: der DEV-Seed trägt den Bestand, laden() gibt es nicht", () => {
    const mitSeed = createFachverfahrenStore(
      { ...config, seed: () => [] as never[] },
      { now: () => "2026-01-01T00:00:00.000Z" },
    );
    // Ohne Persistenz existiert kein laden() (optionale Port-Methode) — rückwärtskompatibel.
    expect(mitSeed.laden).toBeUndefined();
  });

  it("mit Persistenz: der Seed ENTFÄLLT (der Server ist die Wahrheit), laden() hydriert den Snapshot", async () => {
    const persistierte: Vorgang[] = [
      {
        id: "case.remote-1",
        vorgangsnummer: "FV-2026-9999",
        eingangIso: "2026-05-01T00:00:00.000Z",
        antragsdaten: { name: "Remote" },
        status: "in_pruefung",
        nachweise: [],
        history: [],
      },
    ];
    const persistence = {
      laden: async () => persistierte,
      einreichen: async (v: Vorgang) => v,
    };
    // Diese Config HAT einen Seed — mit Persistenz darf er NICHT erscheinen.
    const s = createFachverfahrenStore(
      { ...config, seed: () => [{ id: "seed-1" }] as never },
      { now: () => "2026-01-01T00:00:00.000Z", persistence },
    );
    expect(s.list()).toEqual([]); // KEIN Seed
    await s.laden!();
    expect(s.list().map((v) => v.id)).toEqual(["case.remote-1"]);
  });

  it("mit Persistenz: einreichen SPEICHERT und übernimmt die KANONISCHE Fassung (Server-id), nicht die Client-id", async () => {
    const gespeichert: Vorgang[] = [];
    const persistence = {
      laden: async () => gespeichert,
      // Der Server ersetzt die Client-id durch seine kanonische caseId.
      einreichen: async (v: Vorgang) => {
        const kanonisch = { ...v, id: "case.server-vergeben" };
        gespeichert.push(kanonisch);
        return kanonisch;
      },
    };
    const s = createFachverfahrenStore(config, {
      now: () => "2026-01-01T00:00:00.000Z",
      persistence,
    });
    const v = await s.einreichen({ name: "Muster" });
    // Der Snapshot trägt die SERVER-id — sonst zeigte die Bestätigung eine id, die ein Reload nicht fände.
    expect(v.id).toBe("case.server-vergeben");
    expect(s.get("case.server-vergeben")?.id).toBe("case.server-vergeben");
    expect(gespeichert).toHaveLength(1);
  });

  it("mit Persistenz: schlägt das Speichern fehl, landet NICHTS im Snapshot und der Fehler propagiert", async () => {
    const persistence = {
      laden: async () => [],
      einreichen: async () => {
        throw new Error("403 Vier-Augen / Netz / …");
      },
    };
    const s = createFachverfahrenStore(config, {
      now: () => "2026-01-01T00:00:00.000Z",
      persistence,
    });
    await expect(s.einreichen({ name: "Muster" })).rejects.toThrow();
    // Fail-loud: kein halb-gespeicherter Vorgang im Snapshot.
    expect(s.list()).toEqual([]);
  });
});
