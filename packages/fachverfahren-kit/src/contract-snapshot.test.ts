import { describe, it, expect } from "vitest";
import type { LeistungConfig } from "./types.js";
import {
  diffNurEinfacheSprache,
  toContractSnapshot,
} from "./contract-snapshot.js";

/** Minimal-Config-Basis (die Pflichtfelder des Vertrags), die einzelne Tests gezielt anreichern. */
const basis: LeistungConfig = {
  id: "leistung",
  label: "Leistung",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [{ norm: "§ 1 Satzung", titel: "Grundlage" }],
  antrag: { steps: [{ id: "s", titel: "S", felder: [] }] },
  statusMachine: { initial: "neu", states: [], transitions: [] },
  register: { suchfelder: [] },
  detailSektionen: [],
};

describe("toContractSnapshot — Business-Logik als ECHTE Zeilen, nicht '[function]'", () => {
  it("serialisiert tarif/codelisten/registerRefs/fimRefs/fristenTypen verbatim", () => {
    const config: LeistungConfig = {
      ...basis,
      tarif: {
        einheit: "EUR/Jahr",
        label: "Gebühr",
        staffeln: [
          {
            label: "Premium",
            bedingung: { feld: "objekt.kategorie", op: "==", wert: "premium" },
            betrag: 600,
            normRef: { norm: "Satzung#§5", status: "belegt" },
          },
        ],
        normRef: { norm: "Satzung#§4", status: "belegt" },
      },
      codelisten: {
        kategorien: {
          id: "kategorien",
          label: "Kategorien",
          normRef: { norm: "Satzung#Anlage1", status: "annahme" },
          eintraege: [
            {
              value: "premium",
              label: "Premium",
              belege: ["Nachweis A"],
            },
          ],
        },
      },
      registerRefs: [
        { feld: "kontakt.plz", register: "Melderegister", richtung: "inbound" },
      ],
      fimRefs: [{ fimId: "L100001", art: "leistung", status: "belegt" }],
      fristenTypen: [
        {
          id: "widerspruch",
          label: "Widerspruch",
          dauer: 1,
          einheit: "monat",
          anker: "bekanntgabe",
        },
      ],
    };
    const snap = toContractSnapshot(config);

    // ECHTE Zeilen — keine "[function]"-Marker mehr für die Business-Logik.
    expect(snap.tarif?.staffeln[0]).toMatchObject({
      betrag: 600,
      label: "Premium",
    });
    expect(snap.tarif?.staffeln[0]?.bedingung).toEqual({
      feld: "objekt.kategorie",
      op: "==",
      wert: "premium",
    });
    expect(snap.codelisten?.kategorien.eintraege[0]?.belege).toEqual([
      "Nachweis A",
    ]);
    expect(snap.registerRefs).toEqual([
      { feld: "kontakt.plz", register: "Melderegister", richtung: "inbound" },
    ]);
    expect(snap.fimRefs?.[0]?.fimId).toBe("L100001");
    expect(snap.fristenTypen?.[0]?.einheit).toBe("monat");

    // Kein berechne/nachweise-Marker, weil das Verfahren rein daten-getrieben ist.
    expect(snap.berechne).toBeUndefined();
    expect(snap.nachweise).toBeUndefined();

    // Der Snapshot ist vollständig JSON-serialisierbar (keine Funktionen).
    expect(() => JSON.stringify(snap)).not.toThrow();
    expect(JSON.stringify(snap)).not.toContain("[function]");
    expect(snap._snapshot).toBe(true);
  });

  it("markiert die Escape-Hatches nur, wenn berechne/nachweise gesetzt sind", () => {
    const snap = toContractSnapshot({
      ...basis,
      berechne: () => ({
        betrag: 1,
        einheit: "EUR",
        label: "x",
        begruendung: "y",
        status: "final",
        positionen: [],
      }),
      nachweise: () => [],
    });
    expect(snap.berechne).toBe("[function]");
    expect(snap.nachweise).toBe("[function]");
    // Keine Business-Logik-Daten deklariert ⇒ keine leeren Zeilen.
    expect(snap.tarif).toBeUndefined();
    expect(snap.codelisten).toBeUndefined();
  });

  it("WELLE 1c: personas mit KI-Fähigkeiten (faehigkeiten + AAL) fließen in den Contract, icon abgestreift", () => {
    const config = {
      ...basis,
      personas: [
        {
          key: "sachbearbeitung",
          label: "Sachbearbeitung",
          faehigkeiten: {
            ki: ["subsumtion", "bescheid-entwurf"],
            aal: "AAL-3",
          },
          certification: {
            status: "candidate",
            cal: 3,
            envelope: { outcome: "begründeter Bescheid" },
          },
        },
        { key: "buerger", label: "Bürger:in" },
      ],
    } as unknown as LeistungConfig;
    const snap = toContractSnapshot(config);
    expect(snap.personas?.[0]).toMatchObject({
      key: "sachbearbeitung",
      faehigkeiten: { ki: ["subsumtion", "bescheid-entwurf"], aal: "AAL-3" },
      certification: {
        status: "candidate",
        cal: 3,
        envelope: { outcome: "begründeter Bescheid" },
      },
    });
    // Rein menschlich besetzte Zuständigkeit trägt kein KI-Angebot.
    expect(snap.personas?.[1]?.faehigkeiten).toBeUndefined();
    // Das icon (LucideIcon) ist nicht JSON-serialisierbar → es darf NICHT im Snapshot landen.
    expect(() => JSON.stringify(snap)).not.toThrow();
    expect(snap.personas?.[0] && "icon" in snap.personas[0]).toBeFalsy();
  });

  it("bleibt für bestehende Configs (nur berechne) unverändert kompatibel", () => {
    const snap = toContractSnapshot({
      ...basis,
      berechne: () => ({
        betrag: 0,
        einheit: "EUR",
        label: "x",
        begruendung: "y",
        status: "final",
        positionen: [],
      }),
    });
    expect(snap.berechne).toBe("[function]");
    expect(snap.nachweise).toBeUndefined();
    expect(snap.id).toBe("leistung");
    expect(snap._snapshot).toBe(true);
  });
});

describe("diffNurEinfacheSprache — self-diagnosing FRISCHE-Fehlermeldung", () => {
  const mitFeld: LeistungConfig = {
    ...basis,
    antrag: {
      steps: [
        {
          id: "s",
          titel: "S",
          felder: [
            { name: "antragsteller.vorname", label: "Vorname", typ: "text" },
          ],
        },
      ],
    },
  };

  it("liefert [], wenn beide Snapshots identisch sind", () => {
    const snap = toContractSnapshot(mitFeld);
    expect(diffNurEinfacheSprache(snap, snap)).toEqual([]);
  });

  it("liefert die konkreten Feld/Schlüssel-Paare, wenn NUR leichteSprache/hintEinfach abweichen", () => {
    const committed = toContractSnapshot(mitFeld);
    const frisch = toContractSnapshot({
      ...mitFeld,
      antrag: {
        steps: [
          {
            id: "s",
            titel: "S",
            felder: [
              {
                name: "antragsteller.vorname",
                label: "Vorname",
                leichteSprache: "Ihr Vorname",
                hintEinfach: "So heißen Sie.",
                typ: "text",
              },
            ],
          },
        ],
      },
    });

    const drift = diffNurEinfacheSprache(committed, frisch);
    expect(drift).toEqual([
      {
        feld: "antragsteller.vorname",
        schluessel: "leichteSprache",
        committed: undefined,
        frisch: "Ihr Vorname",
      },
      {
        feld: "antragsteller.vorname",
        schluessel: "hintEinfach",
        committed: undefined,
        frisch: "So heißen Sie.",
      },
    ]);
  });

  it("liefert null, wenn zusätzlich echte Drift (z. B. label) vorliegt", () => {
    const committed = toContractSnapshot(mitFeld);
    const frisch = toContractSnapshot({
      ...mitFeld,
      antrag: {
        steps: [
          {
            id: "s",
            titel: "S",
            felder: [
              {
                name: "antragsteller.vorname",
                label: "Vorname (geändert)",
                leichteSprache: "Ihr Vorname",
                typ: "text",
              },
            ],
          },
        ],
      },
    });

    expect(diffNurEinfacheSprache(committed, frisch)).toBeNull();
  });

  it("liefert null, wenn sich die Schritt-/Feld-Struktur unterscheidet", () => {
    const committed = toContractSnapshot(basis);
    const frisch = toContractSnapshot(mitFeld);

    expect(diffNurEinfacheSprache(committed, frisch)).toBeNull();
  });
});

// ── PHASE 5 / W1: DAS RECHTSBEHELFS-REGIME REIST IM VERTRAG MIT ──────────────────────────────────────────────
// Rechtsfolgen-Test: der Server liest AUSSCHLIESSLICH `leistung.contract.json`. Fehlt dort das Regime, erbt er
// still das Regime der Vorlage und der Bescheid belehrt nach der falschen Verfahrensschiene — eine unrichtige
// Belehrung verlängert die Rechtsbehelfsfrist auf EIN JAHR (§ 356 Abs. 2 AO / § 58 Abs. 2 VwGO).
describe("toContractSnapshot — Rechtsbehelfs-/Bekanntgabe-Regime (W1)", () => {
  const aoRegime: LeistungConfig["zustellung"] = {
    fiktionTage: 4,
    fiktionNorm: "§ 122 Abs. 2 AO",
    rechtsbehelf: {
      art: "einspruch",
      fristWert: 1,
      fristEinheit: "monat",
      stelle: "der Stadt Musterstadt — Steueramt",
      sitz: "Rathausplatz 1, 12345 Musterstadt",
      form: "schriftlich, elektronisch oder zur Niederschrift",
      norm: "§ 355 Abs. 1 AO",
    },
  };

  it("transportiert das VOLLSTÄNDIGE Regime inkl. Sitz und Form (sonst belehrt der Server falsch)", () => {
    const snap = toContractSnapshot({ ...basis, zustellung: aoRegime });
    expect(snap.zustellung?.fiktionNorm).toBe("§ 122 Abs. 2 AO");
    expect(snap.zustellung?.rechtsbehelf?.art).toBe("einspruch");
    expect(snap.zustellung?.rechtsbehelf?.sitz).toBe(
      "Rathausplatz 1, 12345 Musterstadt",
    );
    expect(snap.zustellung?.rechtsbehelf?.form).toBe(
      "schriftlich, elektronisch oder zur Niederschrift",
    );
    // GEGENPROBE zum Vorher-Zustand: der Snapshot vor Phase 5 kannte das Feld gar nicht — hier als das
    // reproduzierte Symptom, das der Server sah (kein Regime ⇒ Muster-Regime der Vorlage).
    const ohneTransport = JSON.parse(JSON.stringify(snap)) as Record<
      string,
      unknown
    >;
    delete ohneTransport["zustellung"];
    expect(ohneTransport["zustellung"]).toBeUndefined();
  });

  it("bleibt deterministisch: die Laufzeit-URL `bescheidUrl` wandert NICHT in den Vertrag", () => {
    const snap = toContractSnapshot({
      ...basis,
      zustellung: { ...aoRegime, bescheidUrl: "https://host/x.pdf" },
    });
    expect(snap.zustellung).toBeDefined();
    expect(
      (snap.zustellung as Record<string, unknown>)["bescheidUrl"],
    ).toBeUndefined();
  });

  it("ÜBERBLOCKUNG: eine Config OHNE zustellung erzeugt kein leeres Feld (Bestandsverträge bleiben gültig)", () => {
    const snap = toContractSnapshot(basis);
    expect("zustellung" in snap).toBe(false);
  });
});
