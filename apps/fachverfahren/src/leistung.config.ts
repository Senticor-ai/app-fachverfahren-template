// DER EINE Austausch-Punkt dieser App — die `LeistungConfig`, aus der die gesamte App rendert (store.ts importiert
// NUR von hier). Die generischen Kit-Bausteine (AntragStepper · Arbeitsvorrat · ReviewWorkspace · AufsichtDashboard)
// erzeugen die komplette 3-Personen-UX allein aus dieser Config — kein verfahrens-spezifischer Code sonst.
//
// DEFAULT: ein NEUTRALES, verfahrens-UNSPEZIFISCHES Demo („Musterantrag"), NUR damit die Vorlage eigenständig läuft
// (pnpm dev) und sofort alle drei Sichten zeigt. Es sind bewusst KEINE echten Fachdaten: Sätze/Gebühren, Fristen,
// Rechtsgrundlagen und Prüfungen eines realen Verfahrens stehen NICHT hier — sie kommen aus dem FACHKONZEPT.
//
// GENERIERT: ein generierender Build (Agent oder externe Fabrik) ÜBERSCHREIBT GENAU DIESE DATEI mit der aus dem Fachkonzept generierten
// LeistungConfig des jeweiligen Verfahrens. Dieselbe App, dieselben Bausteine, anderes Verfahren — ohne dass eine
// weitere Datei der App sich ändert. Das ist die EINE Naht zwischen Generierung und laufender App.
import type {
  Berechnung,
  LeistungConfig,
  Vorgang,
} from "@senticor/fachverfahren-kit";

/** Antragsinhalt des neutralen Demo-Verfahrens. Ein reales Verfahren hat sein eigenes, aus dem Fachkonzept
 *  generiertes Schema. Type-Alias (nicht interface): die implizite Index-Signatur macht die Vorgänge dem
 *  generischen `Vorgang<Record<string, unknown>>` der verfahrens-agnostischen App zuweisbar. */
type MusterAntrag = {
  antragsteller: {
    vorname: string;
    nachname: string;
    plz: string;
    ort: string;
    bekannt?: boolean;
  };
  anliegen: { kategorie: string; beschreibung?: string };
};

// Demo-Tarif: EIN neutraler Pauschalsatz je Kategorie — reiner Platzhalter (ganze Euro, natürliche Einheit).
// Ein reales Verfahren führt seine Sätze im Fachkonzept; die Generierung schreibt sie in `berechne`.
const DEMO_TARIF: Record<string, number> = {
  standard: 50,
  express: 90,
  gebuehrenfrei: 0,
};

/** Reine, deterministische Demo-Berechnung (Tatbestand→Rechtsfolge) — Betrag in ganzen Euro (natürliche Einheit). */
function berechneDemo(a: MusterAntrag): Berechnung {
  const kat = a?.anliegen?.kategorie ?? "";
  const bekannt = Object.prototype.hasOwnProperty.call(DEMO_TARIF, kat);
  const betrag = DEMO_TARIF[kat] ?? 0;
  const label = bekannt ? `Bearbeitungsgebühr (${kat})` : "Bearbeitungsgebühr";
  return {
    betrag,
    einheit: "EUR",
    label,
    begruendung: bekannt
      ? `Pauschale Bearbeitungsgebühr für die Kategorie „${kat}" — Demo-Tarif; der reale Satz stammt aus dem Fachkonzept.`
      : "Bitte eine Kategorie wählen, um die Gebühr zu bestimmen.",
    status: bekannt ? "final" : "provisional",
    positionen: [{ label, betrag }],
  };
}

// Export als GENERISCHE LeistungConfig (die stabile Naht-Signatur, die store.ts erwartet — der Build tauscht nur
// den Inhalt). Die Verfahrens-Typisierung bleibt intern; `berechne` verengt an EINER dokumentierten Stelle.
export const leistungConfig: LeistungConfig = {
  id: "musterantrag",
  label: "Musterantrag",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [
    {
      norm: "§ 1 Demo-Satzung",
      titel:
        "Platzhalter — reale Rechtsgrundlagen kommen aus dem Fachkonzept, nicht aus der Vorlage",
    },
  ],
  antrag: {
    einleitung:
      "Neutrales Demo-Verfahren — es zeigt die drei Sichten (Bürger:in · Sachbearbeitung · Aufsicht), enthält aber keine echten Fachdaten.",
    steps: [
      {
        id: "antragsteller",
        titel: "Antragsteller:in",
        felder: [
          {
            name: "antragsteller.vorname",
            label: "Vorname",
            leichteSprache: "Ihr Vorname",
            typ: "text",
            required: true,
            onceOnly: true,
          },
          {
            name: "antragsteller.nachname",
            label: "Nachname",
            typ: "text",
            required: true,
            onceOnly: true,
          },
          {
            name: "antragsteller.plz",
            label: "Postleitzahl",
            typ: "plz",
            required: true,
            pattern: "^\\d{5}$",
            hint: "5-stellig",
            hintEinfach: "Ihre Postleitzahl hat 5 Ziffern.",
            onceOnly: true,
          },
          {
            name: "antragsteller.ort",
            label: "Ort",
            typ: "text",
            required: true,
            onceOnly: true,
          },
        ],
      },
      {
        id: "anliegen",
        titel: "Anliegen",
        felder: [
          {
            name: "anliegen.kategorie",
            label: "Kategorie",
            typ: "select",
            required: true,
            options: [
              { value: "standard", label: "Standard (50 €)" },
              { value: "express", label: "Express (90 €)" },
              { value: "gebuehrenfrei", label: "Gebührenfrei (0 €)" },
            ],
          },
          {
            name: "anliegen.beschreibung",
            label: "Beschreibung",
            typ: "textarea",
            hint: "optional",
          },
        ],
      },
    ],
  },
  statusMachine: {
    initial: "eingegangen",
    states: [
      { key: "eingegangen", label: "Eingegangen", tone: "neu" },
      { key: "in_pruefung", label: "In Prüfung", tone: "info" },
      { key: "review_noetig", label: "Review nötig", tone: "warn" },
      { key: "festgesetzt", label: "Festgesetzt", tone: "ok", terminal: true },
      { key: "abgelehnt", label: "Abgelehnt", tone: "block", terminal: true },
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
        to: "review_noetig",
        label: "Zur Zweitprüfung",
        rollen: ["sachbearbeitung"],
      },
      {
        from: "in_pruefung",
        to: "festgesetzt",
        label: "Festsetzen",
        rollen: ["sachbearbeitung"],
        vierAugen: true,
      },
      {
        from: "review_noetig",
        to: "festgesetzt",
        label: "Festsetzen (Zweitfreigabe)",
        rollen: ["sachbearbeitung"],
        vierAugen: true,
      },
      {
        from: "in_pruefung",
        to: "abgelehnt",
        label: "Ablehnen",
        rollen: ["sachbearbeitung"],
        detailPflicht: true,
      },
    ],
  },
  berechne: (a) => berechneDemo(a as MusterAntrag),
  register: {
    suchfelder: ["nachname", "plz"],
    mock: [
      { nachname: "Muster", vorname: "Alex", plz: "12345", ort: "Musterstadt" },
      {
        nachname: "Beispiel",
        vorname: "Kim",
        plz: "12347",
        ort: "Musterstadt",
      },
    ],
  },
  detailSektionen: [
    {
      titel: "Antragsteller:in",
      felder: [
        { pfad: "antragsteller.vorname", label: "Vorname" },
        { pfad: "antragsteller.nachname", label: "Nachname" },
        { pfad: "antragsteller.plz", label: "PLZ" },
        { pfad: "antragsteller.ort", label: "Ort" },
      ],
    },
    {
      titel: "Anliegen",
      felder: [
        { pfad: "anliegen.kategorie", label: "Kategorie" },
        { pfad: "anliegen.beschreibung", label: "Beschreibung" },
      ],
    },
  ],
  ki: { schwelleAutonom: 0.9 },
  seed: ({ vorgangsnummer }) => {
    const mk = (
      min: number,
      status: string,
      antragsdaten: MusterAntrag,
      ki?: { confidence: number; flags: string[] },
    ): Vorgang<MusterAntrag> => {
      const vn = vorgangsnummer();
      return {
        id: `seed-${vn}`,
        vorgangsnummer: vn,
        eingangIso: new Date(
          Date.UTC(2026, 5, 26, 9, 0) - min * 60000,
        ).toISOString(),
        antragsdaten,
        status,
        berechnung: berechneDemo(antragsdaten),
        ki: ki ?? { confidence: 0.94, flags: [] },
        nachweise: [],
        history: [
          {
            ts: new Date(Date.UTC(2026, 5, 26, 8, 0)).toISOString(),
            aktion: "Antrag eingegangen",
            rolle: "buerger",
          },
        ],
      };
    };
    return [
      mk(30, "eingegangen", {
        antragsteller: {
          vorname: "Alex",
          nachname: "Muster",
          plz: "12345",
          ort: "Musterstadt",
          bekannt: true,
        },
        anliegen: { kategorie: "standard" },
      }),
      mk(
        180,
        "in_pruefung",
        {
          antragsteller: {
            vorname: "Kim",
            nachname: "Beispiel",
            plz: "12347",
            ort: "Musterstadt",
            bekannt: true,
          },
          anliegen: { kategorie: "express" },
        },
        { confidence: 0.72, flags: ["angabe_unklar"] },
      ),
      mk(
        600,
        "review_noetig",
        {
          antragsteller: {
            vorname: "Sam",
            nachname: "Vorlage",
            plz: "12345",
            ort: "Musterstadt",
          },
          anliegen: { kategorie: "standard" },
        },
        { confidence: 0.55, flags: ["nachweis_fehlt"] },
      ),
      mk(1440, "festgesetzt", {
        antragsteller: {
          vorname: "Toni",
          nachname: "Exempel",
          plz: "12345",
          ort: "Musterstadt",
          bekannt: true,
        },
        anliegen: { kategorie: "gebuehrenfrei" },
      }),
    ];
  },
};
