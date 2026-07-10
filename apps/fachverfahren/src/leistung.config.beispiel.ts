// ZWEITES DEMO-VERFAHREN — ausschließlich, damit die Vorlage die VERFAHRENSÜBERGREIFENDE Sicht (Workspace-Liste +
// Board über MEHRERE Verfahren) eigenständig zeigt. Es ist bewusst KEIN reales Fachverfahren und trägt keine echten
// Fachdaten. `verfahren.registry.ts` bindet es NUR ein, solange das primäre Verfahren noch das unveränderte
// Vorlagen-Demo (`musterantrag`) ist — ein generierter Konsument (eigene `leistungConfig` aus dem Fachkonzept)
// bekommt automatisch NUR sein Verfahren, ohne dieses Demo.
//
// Es ist strukturgleich zu `leistung.config.ts` (dieselbe Naht-Signatur `LeistungConfig`), nur mit anderem Inhalt —
// so bleibt der Workspace-Store rein datengetrieben und muss für ein weiteres Verfahren keinen Code kennen.
import type {
  Berechnung,
  LeistungConfig,
  Vorgang,
} from "@senticor/fachverfahren-kit";

type BescheinigungAntrag = {
  antragsteller: {
    vorname: string;
    nachname: string;
    plz: string;
    ort: string;
  };
  zweck: { verwendung: string; ausfertigungen?: number };
};

// Neutrale Pauschale je Verwendungszweck (Demo, ganze Euro). Ein reales Verfahren führt seine Sätze im Fachkonzept.
const DEMO_GEBUEHR: Record<string, number> = {
  behoerde: 0,
  privat: 5,
  arbeitgeber: 5,
};

function berechneBescheinigung(a: BescheinigungAntrag): Berechnung {
  const zweck = a?.zweck?.verwendung ?? "";
  const bekannt = Object.prototype.hasOwnProperty.call(DEMO_GEBUEHR, zweck);
  const ausfertigungen = Math.max(1, a?.zweck?.ausfertigungen ?? 1);
  const einzel = DEMO_GEBUEHR[zweck] ?? 0;
  const betrag = einzel * ausfertigungen;
  const label = bekannt
    ? `Bescheinigungsgebühr (${zweck})`
    : "Bescheinigungsgebühr";
  return {
    betrag,
    einheit: "EUR",
    label,
    begruendung: bekannt
      ? `Pauschale Gebühr (${einzel} € × ${ausfertigungen}) für die Verwendung „${zweck}" — Demo-Tarif; der reale Satz stammt aus dem Fachkonzept.`
      : "Bitte einen Verwendungszweck wählen, um die Gebühr zu bestimmen.",
    status: bekannt ? "final" : "provisional",
    positionen: [{ label, betrag }],
  };
}

export const beispielConfig: LeistungConfig = {
  id: "musterbescheinigung",
  label: "Musterbescheinigung",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [
    {
      norm: "§ 2 Demo-Satzung",
      titel:
        "Platzhalter — reale Rechtsgrundlagen kommen aus dem Fachkonzept, nicht aus der Vorlage",
    },
  ],
  antrag: {
    einleitung:
      "Zweites neutrales Demo-Verfahren — es existiert nur, damit die Vorlage die verfahrensübergreifende Sachbearbeitung (Liste + Board über mehrere Verfahren) zeigt.",
    steps: [
      {
        id: "antragsteller",
        titel: "Antragsteller:in",
        felder: [
          {
            name: "antragsteller.vorname",
            label: "Vorname",
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
        id: "zweck",
        titel: "Verwendungszweck",
        felder: [
          {
            name: "zweck.verwendung",
            label: "Verwendung",
            typ: "select",
            required: true,
            options: [
              { value: "behoerde", label: "Für eine Behörde (0 €)" },
              { value: "privat", label: "Privat (5 €)" },
              { value: "arbeitgeber", label: "Für Arbeitgeber (5 €)" },
            ],
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
      { key: "ausgestellt", label: "Ausgestellt", tone: "ok", terminal: true },
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
        to: "ausgestellt",
        label: "Ausstellen",
        rollen: ["sachbearbeitung"],
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
  berechne: (a) => berechneBescheinigung(a as BescheinigungAntrag),
  register: {
    suchfelder: ["nachname", "plz"],
    mock: [
      { nachname: "Muster", vorname: "Alex", plz: "12345", ort: "Musterstadt" },
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
      titel: "Verwendungszweck",
      felder: [{ pfad: "zweck.verwendung", label: "Verwendung" }],
    },
  ],
  ki: { schwelleAutonom: 0.9 },
  fristenTypen: [
    {
      id: "ausstellungsfrist",
      label: "Ausstellungsfrist",
      dauer: 7,
      einheit: "tag",
      anker: "eingang",
      art: "behoerdlich",
    },
  ],
  seed: ({ vorgangsnummer }) => {
    const mk = (
      min: number,
      status: string,
      antragsdaten: BescheinigungAntrag,
      ki?: { confidence: number; flags: string[] },
    ): Vorgang<BescheinigungAntrag> => {
      const vn = vorgangsnummer();
      return {
        id: `seed-${vn}`,
        vorgangsnummer: vn,
        eingangIso: new Date(
          Date.UTC(2026, 5, 26, 9, 0) - min * 60000,
        ).toISOString(),
        antragsdaten,
        status,
        berechnung: berechneBescheinigung(antragsdaten),
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
      mk(45, "eingegangen", {
        antragsteller: {
          vorname: "Robin",
          nachname: "Muster",
          plz: "12345",
          ort: "Musterstadt",
        },
        zweck: { verwendung: "privat", ausfertigungen: 2 },
      }),
      mk(
        240,
        "in_pruefung",
        {
          antragsteller: {
            vorname: "Chris",
            nachname: "Beispiel",
            plz: "12347",
            ort: "Musterstadt",
          },
          zweck: { verwendung: "behoerde" },
        },
        { confidence: 0.68, flags: ["angabe_unklar"] },
      ),
    ];
  },
};
