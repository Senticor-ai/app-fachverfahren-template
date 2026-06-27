// leistungen/hundesteuer — die Referenz-Leistung als `LeistungConfig`. GENAU das Artefakt, das die Generierung aus
// dem Fachkonzept produziert: Antrag-Schritte, Status-Machine, Satzung-Regeln (Subsumtion mit Begründung), Register,
// Detail-Sektionen, Seed-Fälle. Fachlich aus der verifizierten Lovable-Referenz (satzung.ts) übernommen.
//
// Die ganze UX (Bürger-Antrag · Arbeitsvorrat · Review/Entscheidung · Aufsicht) entsteht aus den FERTIGEN Bausteinen
// + DIESER Config — kein Screen-Code je Leistung, daher immer identisch + geprüft.
import type { LeistungConfig, Vorgang, Berechnung } from "../types.js";

export interface HundesteuerAntrag {
  halter: { vorname: string; nachname: string; strasse: string; plz: string; ort: string; bekannt?: boolean };
  hund: { name: string; rasse: string; geschlecht: "m" | "w"; geburtsdatum: string; beginnHaltung: string; chipnummer?: string };
  haushaltsHundezahl: 1 | 2 | 3;
  listenhund: boolean;
  befreiungId?: string;
}

// ── Satzung als DATEN (Single-Source) ──
const SATZUNG = {
  kommune: "Stadt Musterstadt",
  stand: "Demo-Satzung, Fassung Juni 2026",
  staffel: { erster: 120, zweiter: 180, weiterer: 220 }, // EUR/Jahr
  listenhundSatz: 800, // EUR/Jahr (gefährlicher Hund)
  befreiungen: [
    { id: "assistenz", label: "Assistenz-/Blindenführhund", paragraph: "§ 6 Abs. 1 Nr. 1" },
    { id: "tierheim", label: "Hund aus Tierheim (erste 12 Monate)", paragraph: "§ 6 Abs. 1 Nr. 3" },
    { id: "dienst", label: "Diensthund (Behörde/Rettung)", paragraph: "§ 6 Abs. 1 Nr. 2" },
  ],
} as const;

/** Subsumtion Tatbestand→Rechtsfolge: Listenhund-Sondersatz > Befreiung > Hundezahl-Staffel. Mit Begründung. */
function berechneHundesteuer(a: HundesteuerAntrag): Berechnung {
  if (a.listenhund) {
    return {
      betrag: SATZUNG.listenhundSatz, einheit: "EUR/Jahr", label: "Gefährlicher Hund / Listenhund",
      begruendung: `Gefährlicher Hund (Listenhund) — Sondersatz nach Satzung; Befreiungen i. d. R. ausgeschlossen.`,
      positionen: [{ label: "Listenhund-Satz", betrag: SATZUNG.listenhundSatz }],
    };
  }
  if (a.befreiungId) {
    const b = SATZUNG.befreiungen.find((x) => x.id === a.befreiungId);
    if (b) return { betrag: 0, einheit: "EUR/Jahr", label: `Befreiung: ${b.label}`, begruendung: `Steuerbefreiung nach ${b.paragraph} (${b.label}) — Nachweis erforderlich.` };
  }
  const satz = a.haushaltsHundezahl === 1 ? SATZUNG.staffel.erster : a.haushaltsHundezahl === 2 ? SATZUNG.staffel.zweiter : SATZUNG.staffel.weiterer;
  const lbl = a.haushaltsHundezahl === 1 ? "1. Hund im Haushalt" : a.haushaltsHundezahl === 2 ? "2. Hund" : "weiterer Hund";
  return { betrag: satz, einheit: "EUR/Jahr", label: lbl, begruendung: `${lbl} nach Hundezahl-Staffel der Satzung.`, positionen: [{ label: lbl, betrag: satz }] };
}

export const hundesteuerConfig: LeistungConfig<HundesteuerAntrag> = {
  id: "hundesteuer",
  label: "Hundesteuer",
  kommune: SATZUNG.kommune,
  rechtsgrundlagen: [
    { norm: "KAG", titel: "Kommunalabgabengesetz des Landes" },
    { norm: "§ 1 ff. Hundesteuersatzung", titel: "Hundesteuersatzung der Kommune", satzung: true },
  ],
  fimLeistung: { id: "99102013000000", status: "annahme-zu-validieren" }, // GROUNDED — Status explizit, nicht erfunden

  antrag: {
    einleitung: "Melden Sie Ihren Hund an, damit die Hundesteuer korrekt festgesetzt werden kann.",
    steps: [
      { id: "halter", titel: "Halter:in", beschreibung: "Angaben zur anmeldepflichtigen Person.", felder: [
        { name: "halter.vorname", label: "Vorname", typ: "text", required: true, onceOnly: true },
        { name: "halter.nachname", label: "Nachname", typ: "text", required: true, onceOnly: true },
        { name: "halter.strasse", label: "Straße & Hausnummer", typ: "text", required: true, onceOnly: true },
        { name: "halter.plz", label: "Postleitzahl", typ: "plz", required: true, pattern: "^\\d{5}$", hint: "5-stellig", onceOnly: true },
        { name: "halter.ort", label: "Ort", typ: "text", required: true, onceOnly: true },
      ] },
      { id: "hund", titel: "Hund", felder: [
        { name: "hund.name", label: "Name des Hundes", typ: "text", required: true },
        { name: "hund.rasse", label: "Rasse", typ: "text", required: true, hint: "Bei Mischlingen die überwiegende Rasse" },
        { name: "hund.geschlecht", label: "Geschlecht", typ: "select", required: true, options: [{ value: "m", label: "männlich" }, { value: "w", label: "weiblich" }] },
        { name: "hund.geburtsdatum", label: "Geburtsdatum", typ: "date", required: true },
        { name: "hund.beginnHaltung", label: "Beginn der Haltung", typ: "date", required: true, hint: "Anzeige binnen 14 Tagen" },
        { name: "hund.chipnummer", label: "Chip-Nummer", typ: "text", hint: "falls vorhanden" },
      ] },
      { id: "einstufung", titel: "Einstufung", felder: [
        { name: "haushaltsHundezahl", label: "Wievielter Hund im Haushalt?", typ: "select", required: true, options: [{ value: "1", label: "1. Hund" }, { value: "2", label: "2. Hund" }, { value: "3", label: "weiterer Hund" }] },
        { name: "listenhund", label: "Gefährlicher Hund / Listenhund", typ: "checkbox", hint: "nach Landes-Listenhundeverordnung" },
      ] },
      { id: "befreiung", titel: "Ermäßigung / Befreiung", felder: [
        { name: "befreiungId", label: "Befreiungsgrund (optional)", typ: "select", options: SATZUNG.befreiungen.map((b) => ({ value: b.id, label: `${b.label} (${b.paragraph})` })), hint: "Nachweis erforderlich" },
      ] },
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
      { from: "eingegangen", to: "in_pruefung", label: "Prüfung starten", rollen: ["sachbearbeitung"] },
      { from: "in_pruefung", to: "review_noetig", label: "Zur Zweitprüfung", rollen: ["sachbearbeitung"] },
      { from: "in_pruefung", to: "festgesetzt", label: "Festsetzen", rollen: ["sachbearbeitung"], vierAugen: true },
      { from: "review_noetig", to: "festgesetzt", label: "Festsetzen (4-Augen)", rollen: ["sachbearbeitung"], vierAugen: true },
      { from: "in_pruefung", to: "abgelehnt", label: "Ablehnen", rollen: ["sachbearbeitung"], detailPflicht: true },
      { from: "review_noetig", to: "abgelehnt", label: "Ablehnen", rollen: ["sachbearbeitung"], detailPflicht: true },
    ],
  },

  berechne: berechneHundesteuer,
  nachweise: (a) => (a.befreiungId ? [{ id: "befreiung", label: "Nachweis für Befreiung", hochgeladen: false, erforderlich: true }] : []),

  register: {
    suchfelder: ["nachname", "plz"],
    mock: [
      { nachname: "Müller", vorname: "Anna", strasse: "Lindenweg 4", plz: "12345", ort: "Musterstadt", geburtsdatum: "1989-04-12" },
      { nachname: "Schmidt", vorname: "Tarek", strasse: "Ahornstr. 22", plz: "12345", ort: "Musterstadt", geburtsdatum: "1975-11-02" },
    ],
  },

  detailSektionen: [
    { titel: "Halter:in", felder: [
      { pfad: "halter.vorname", label: "Vorname" }, { pfad: "halter.nachname", label: "Nachname" },
      { pfad: "halter.strasse", label: "Anschrift" }, { pfad: "halter.plz", label: "PLZ" }, { pfad: "halter.ort", label: "Ort" },
    ] },
    { titel: "Hund", felder: [
      { pfad: "hund.name", label: "Name" }, { pfad: "hund.rasse", label: "Rasse" },
      { pfad: "hund.geschlecht", label: "Geschlecht" }, { pfad: "hund.geburtsdatum", label: "Geburtsdatum" },
      { pfad: "hund.beginnHaltung", label: "Beginn Haltung" }, { pfad: "hund.chipnummer", label: "Chip-Nr." },
    ] },
  ],

  ki: { schwelleAutonom: 0.9 },

  seed: ({ vorgangsnummer }) => {
    const mk = (over: Partial<Vorgang<HundesteuerAntrag>> & { antragsdaten: HundesteuerAntrag; status: string; min: number }): Vorgang<HundesteuerAntrag> => ({
      id: `seed-${over.vorgangsnummer ?? vorgangsnummer()}`, vorgangsnummer: vorgangsnummer(),
      eingangIso: new Date(Date.UTC(2026, 5, 26, 9, 0) - over.min * 60000).toISOString(),
      antragsdaten: over.antragsdaten, status: over.status,
      berechnung: berechneHundesteuer(over.antragsdaten),
      ki: over.ki ?? { confidence: 0.94, flags: [] },
      nachweise: [], history: [{ ts: new Date(Date.UTC(2026, 5, 26, 8, 0)).toISOString(), aktion: "Antrag eingegangen", rolle: "buerger" }],
    });
    return [
      mk({ min: 30, status: "eingegangen", antragsdaten: { halter: { vorname: "Anna", nachname: "Müller", strasse: "Lindenweg 4", plz: "12345", ort: "Musterstadt", bekannt: true }, hund: { name: "Bello", rasse: "Labrador", geschlecht: "m", geburtsdatum: "2023-02-10", beginnHaltung: "2026-06-01" }, haushaltsHundezahl: 1, listenhund: false } }),
      mk({ min: 180, status: "in_pruefung", ki: { confidence: 0.71, flags: ["rasse_unklar"] }, antragsdaten: { halter: { vorname: "Tarek", nachname: "Schmidt", strasse: "Ahornstr. 22", plz: "12345", ort: "Musterstadt", bekannt: true }, hund: { name: "Rex", rasse: "Mischling", geschlecht: "m", geburtsdatum: "2021-07-04", beginnHaltung: "2026-05-20" }, haushaltsHundezahl: 2, listenhund: false } }),
      mk({ min: 600, status: "review_noetig", ki: { confidence: 0.55, flags: ["listenhund_verdacht"] }, antragsdaten: { halter: { vorname: "Lena", nachname: "Vogt", strasse: "Birkenallee 9", plz: "12347", ort: "Musterstadt" }, hund: { name: "Athena", rasse: "Staffordshire Terrier", geschlecht: "w", geburtsdatum: "2022-03-15", beginnHaltung: "2026-04-30" }, haushaltsHundezahl: 1, listenhund: true } }),
      mk({ min: 1440, status: "festgesetzt", antragsdaten: { halter: { vorname: "Otto", nachname: "Kern", strasse: "Wiesenweg 1", plz: "12345", ort: "Musterstadt", bekannt: true }, hund: { name: "Fido", rasse: "Beagle", geschlecht: "m", geburtsdatum: "2020-01-01", beginnHaltung: "2026-03-01" }, haushaltsHundezahl: 1, listenhund: false } }),
    ];
  },
};
