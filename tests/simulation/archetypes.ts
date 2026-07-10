// tests/simulation/archetypes — 4 MAXIMAL DIVERSE, verfahrens-neutrale LeistungConfig-Fixtures, die je eine andere
// Ecke der Architektur belasten. KEINE realen Fachverfahren (keine Domänen-Literale) — reine Archetypen, damit die
// Simulation die GENERISCHE Vollständigkeit der Architektur beweist, nicht einen Einzelfall.
//
//  A "gebuehr"   — Tarif-Staffeln + Codelisten-Ableitung + belege→Nachweise + ePayment + Automation.
//  B "erlaubnis" — Vier-Augen + Begründungspflicht + rollen-spezifische Übergänge.
//  C "anzeige"   — Register-once-only-Nachweise, 2-State-Machine, keine Gebühr.
//  D "leistung"  — `berechne`-Funktions-Hatch + verzweigte Entscheidung (bewilligt/abgelehnt).
import type {
  Berechnung,
  LeistungConfig,
  Nachweis,
  WorkspaceConfig,
} from "@senticor/fachverfahren-kit";

function seedHelper(
  id: string,
  eingangIso: string,
  daten: Record<string, unknown>,
) {
  return (vorgangsnummer: string) => ({
    id,
    vorgangsnummer,
    eingangIso,
    antragsdaten: daten,
    status: "eingegangen",
    ki: { confidence: 0, flags: [] as string[] },
    nachweise: [] as Nachweis[],
    history: [
      {
        ts: eingangIso,
        aktion: "Antrag eingegangen",
        rolle: "buerger",
        art: "eingang" as const,
      },
    ],
  });
}

// ── A — Gebühr/Tarif/Codeliste/ePayment/Automation ────────────────────────────────────────────────
export function archetypGebuehr(): LeistungConfig {
  return {
    id: "gebuehr",
    label: "Gebühren-Verfahren",
    kommune: "Musterstadt",
    rechtsgrundlagen: [{ norm: "§ 1 Demo-Satzung", titel: "Gebühren" }],
    antrag: {
      steps: [
        {
          id: "s1",
          titel: "Angaben",
          felder: [
            {
              name: "kategorie",
              label: "Kategorie",
              typ: "select",
              optionsRef: "kategorien",
              required: true,
            },
            {
              name: "sonderklasse",
              label: "Sonderklasse",
              typ: "checkbox",
              abgeleitet: { ausCodeliste: "kategorien", merkmal: "sonder" },
            },
          ],
        },
      ],
    },
    codelisten: {
      kategorien: {
        id: "kategorien",
        label: "Kategorien",
        eintraege: [
          {
            value: "a",
            label: "Klasse A",
            merkmale: { sonder: false },
            belege: ["Nachweis A"],
          },
          {
            value: "b",
            label: "Klasse B",
            merkmale: { sonder: true },
            belege: ["Nachweis B", "Sondernachweis"],
          },
        ],
        ableitungen: [
          { ausMerkmal: "sonder", setzeFeld: "sonderklasse", default: false },
        ],
      },
    },
    tarif: {
      einheit: "EUR",
      label: "Gebühr",
      modus: "erste-treffende",
      staffeln: [
        {
          label: "Sonderklasse",
          bedingung: { feld: "sonderklasse", op: "==", wert: true },
          betrag: 300,
        },
        { label: "Standard", betrag: 120 },
      ],
    },
    ePayment: { zahlarten: [{ id: "giro", label: "Überweisung" }] },
    statusMachine: {
      initial: "eingegangen",
      states: [
        { key: "eingegangen", label: "Eingegangen", tone: "neu" },
        { key: "pruefung", label: "In Prüfung", tone: "info" },
        {
          key: "festgesetzt",
          label: "Festgesetzt",
          tone: "ok",
          terminal: true,
        },
        { key: "abgelehnt", label: "Abgelehnt", tone: "block", terminal: true },
      ],
      transitions: [
        {
          from: "eingegangen",
          to: "pruefung",
          label: "Prüfen",
          rollen: ["sachbearbeitung"],
        },
        {
          from: "pruefung",
          to: "festgesetzt",
          label: "Festsetzen",
          rollen: ["sachbearbeitung"],
        },
        {
          from: "pruefung",
          to: "abgelehnt",
          label: "Ablehnen",
          rollen: ["sachbearbeitung"],
          detailPflicht: true,
        },
      ],
    },
    automationen: [
      {
        id: "hohe-gebuehr-priorisieren",
        trigger: { art: "beim-eingang" },
        wenn: { feld: "sonderklasse", op: "==", wert: true },
        dann: [
          { art: "setze-prioritaet", wert: "hoch" },
          { art: "label-hinzufuegen", label: "sonder" },
        ],
      },
    ],
    register: { suchfelder: ["kategorie"] },
    detailSektionen: [
      { titel: "Antrag", felder: [{ pfad: "kategorie", label: "Kategorie" }] },
    ],
    seed: ({ vorgangsnummer }) => [
      seedHelper("geb-1", "2026-01-05T00:00:00.000Z", {
        kategorie: "b",
        sonderklasse: true,
      })(vorgangsnummer()),
    ],
  };
}

// ── B — Erlaubnis/Vier-Augen/detailPflicht/rollen ─────────────────────────────────────────────────
export function archetypErlaubnis(): LeistungConfig {
  return {
    id: "erlaubnis",
    label: "Erlaubnis-Verfahren",
    kommune: "Musterstadt",
    rechtsgrundlagen: [{ norm: "§ 2 Demo-Satzung", titel: "Erlaubnis" }],
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
        { key: "vorgelegt", label: "Vorgelegt", tone: "info" },
        { key: "erteilt", label: "Erteilt", tone: "ok", terminal: true },
        { key: "versagt", label: "Versagt", tone: "block", terminal: true },
      ],
      transitions: [
        {
          from: "eingegangen",
          to: "vorgelegt",
          label: "Vorlegen",
          rollen: ["sachbearbeitung"],
        },
        {
          from: "vorgelegt",
          to: "erteilt",
          label: "Erteilen",
          rollen: ["sachbearbeitung"],
          vierAugen: true,
        },
        {
          from: "vorgelegt",
          to: "versagt",
          label: "Versagen",
          rollen: ["sachbearbeitung"],
          detailPflicht: true,
        },
      ],
    },
    register: { suchfelder: ["name"] },
    detailSektionen: [
      { titel: "Antrag", felder: [{ pfad: "name", label: "Name" }] },
    ],
    seed: ({ vorgangsnummer }) => [
      seedHelper("erl-1", "2026-01-06T00:00:00.000Z", {
        name: "Antragsteller B",
      })(vorgangsnummer()),
    ],
  };
}

// ── C — Anzeige/Register-once-only/2-State ────────────────────────────────────────────────────────
export function archetypAnzeige(): LeistungConfig {
  return {
    id: "anzeige",
    label: "Anzeige-Verfahren",
    kommune: "Musterstadt",
    rechtsgrundlagen: [{ norm: "§ 3 Demo-Satzung", titel: "Anzeige" }],
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
    nachweise: () => [
      {
        id: "identitaet",
        label: "Identitätsnachweis",
        erforderlich: true,
        bezugsweg: "register-once-only",
        register: {
          quelle: "Demo-Register",
          richtung: "inbound",
          rechtsgrundlage: "§ 3 Demo-Satzung",
        },
      },
    ],
    statusMachine: {
      initial: "eingegangen",
      states: [
        { key: "eingegangen", label: "Eingegangen", tone: "neu" },
        { key: "bestaetigt", label: "Bestätigt", tone: "ok", terminal: true },
      ],
      transitions: [
        {
          from: "eingegangen",
          to: "bestaetigt",
          label: "Bestätigen",
          rollen: ["sachbearbeitung"],
        },
      ],
    },
    register: { suchfelder: ["name"] },
    detailSektionen: [
      { titel: "Antrag", felder: [{ pfad: "name", label: "Name" }] },
    ],
    seed: ({ vorgangsnummer }) => [
      seedHelper("anz-1", "2026-01-07T00:00:00.000Z", {
        name: "Anzeigender C",
      })(vorgangsnummer()),
    ],
  };
}

// ── D — Leistung/berechne-Funktion/verzweigt ──────────────────────────────────────────────────────
export function archetypLeistung(): LeistungConfig {
  const berechne = (d: Record<string, unknown>): Berechnung => {
    const betrag = Number(d["bedarf"] ?? 0) - Number(d["einkommen"] ?? 0);
    const wert = Math.max(0, betrag);
    return {
      betrag: wert,
      einheit: "EUR",
      label: "Leistung",
      begruendung: `Bedarf ${d["bedarf"]} − Einkommen ${d["einkommen"]} = ${wert}`,
      status: "final",
      positionen: [{ label: "Leistung", betrag: wert }],
    };
  };
  return {
    id: "leistung",
    label: "Leistungs-Verfahren",
    kommune: "Musterstadt",
    rechtsgrundlagen: [{ norm: "§ 4 Demo-Satzung", titel: "Leistung" }],
    antrag: {
      steps: [
        {
          id: "s1",
          titel: "Angaben",
          felder: [
            { name: "bedarf", label: "Bedarf", typ: "number", required: true },
            {
              name: "einkommen",
              label: "Einkommen",
              typ: "number",
              required: true,
            },
          ],
        },
      ],
    },
    berechne,
    statusMachine: {
      initial: "eingegangen",
      states: [
        { key: "eingegangen", label: "Eingegangen", tone: "neu" },
        { key: "geprueft", label: "Geprüft", tone: "info" },
        { key: "bewilligt", label: "Bewilligt", tone: "ok", terminal: true },
        { key: "abgelehnt", label: "Abgelehnt", tone: "block", terminal: true },
      ],
      transitions: [
        {
          from: "eingegangen",
          to: "geprueft",
          label: "Prüfen",
          rollen: ["sachbearbeitung"],
        },
        {
          from: "geprueft",
          to: "bewilligt",
          label: "Bewilligen",
          rollen: ["sachbearbeitung"],
        },
        {
          from: "geprueft",
          to: "abgelehnt",
          label: "Ablehnen",
          rollen: ["sachbearbeitung"],
          detailPflicht: true,
        },
      ],
    },
    register: { suchfelder: ["bedarf"] },
    detailSektionen: [
      { titel: "Antrag", felder: [{ pfad: "bedarf", label: "Bedarf" }] },
    ],
    seed: ({ vorgangsnummer }) => [
      seedHelper("lei-1", "2026-01-08T00:00:00.000Z", {
        bedarf: 1000,
        einkommen: 300,
      })(vorgangsnummer()),
    ],
  };
}

/** Alle Archetypen als EIN Workspace (verfahrensübergreifende Aggregation). */
export function archetypWorkspace(): WorkspaceConfig {
  return {
    tenantId: "sim-tenant",
    authorityId: "sim-authority",
    jurisdictionId: "de",
    verfahren: [
      { procedureId: "gebuehr", config: archetypGebuehr() },
      { procedureId: "erlaubnis", config: archetypErlaubnis() },
      { procedureId: "anzeige", config: archetypAnzeige() },
      { procedureId: "leistung", config: archetypLeistung() },
    ],
    prioritaeten: [
      { key: "hoch", label: "Hoch", tone: "warn", ordinal: 1 },
      { key: "normal", label: "Normal", tone: "info", ordinal: 2 },
    ],
    labels: [{ key: "sonder", label: "Sonder", tone: "block" }],
  };
}

export interface Szenario {
  id: string;
  config: () => LeistungConfig;
  /** Erwartete Berechnung (falls tarif/berechne) für den Seed-Fall. */
  erwarteterBetrag?: number;
}

export const ARCHETYPEN: Szenario[] = [
  { id: "gebuehr", config: archetypGebuehr, erwarteterBetrag: 300 },
  { id: "erlaubnis", config: archetypErlaubnis },
  { id: "anzeige", config: archetypAnzeige },
  { id: "leistung", config: archetypLeistung, erwarteterBetrag: 700 },
];
