// fachverfahren-kit/types — Der GENERISCHE Vertrag eines kommunalen Fachverfahrens.
//
// Abgeleitet aus verifizierten Public-Sector-Referenzmustern: gefuehrter Antrag, 3 Personen, Zustand-Store
// und interne Review-/Entscheidungs-UX. Die fertigen Bausteine (AntragStepper · Arbeitsvorrat ·
// ReviewWorkspace · EntscheidungPanel · AufsichtDashboard) konsumieren EINE `LeistungConfig`. Die Generierung füllt
// nur diese Config aus dem Fachkonzept — die UX entsteht IMMER identisch + geprüft. So ist ein Stub unmöglich:
// die Bausteine SIND die funktionierende UX, der Agent liefert nur die Leistungs-Daten.
//
// Architektur: DEV-Datenschicht = Zustand-Store im Browser (end-to-end klickbar). PROD = dieselbe
// `VorgangPort`-Schnittstelle gegen das SDK/Fastify-Backend. EINE Schnittstelle, zwei Laufzeiten.

/** Audit-/Historien-Eintrag eines Vorgangs (revisionssicher, append-only). */
export interface VorgangHistorie {
  ts: string;
  aktion: string;
  rolle: string;
  detail?: string;
}

/** KI-Einschätzung mit Transparenz (Konfidenz + Flags + Begründung) — KI assistiert, Mensch entscheidet. */
export interface KiEinschaetzung {
  confidence: number; // 0..1
  flags: string[]; // z.B. "angabe_unklar", "nachweis_fehlt"
  begruendung?: string;
}

/** Ergebnis der Subsumtion/Berechnung — Betrag + die fachliche BEGRÜNDUNG (Tatbestand→Rechtsfolge). */
export interface Berechnung {
  betrag: number; // in der NATÜRLICHEN Haupteinheit der `einheit` (bei EUR: ganze Euro, 120 = 120,00 €) — kein Cent
  einheit: string; // "EUR/Jahr", "EUR", …
  label: string; // kurzer Ergebnis-Titel
  begruendung: string; // die belegte fachliche Herleitung
  // ANZEIGE-STATUS (Pflicht): "provisional", solange für die Berechnung nötige Eingaben fehlen (Teil-/Vorschau-Ergebnis),
  // "final", wenn alle nötigen Felder vorliegen. Erzwingt, dass ein vorläufiger Betrag NIE wie ein endgültiger erscheint —
  // der Typ verlangt das Feld, sodass jede berechne-Funktion es liefern MUSS (kein nachgelagerter Repair-Zyklus).
  status: "provisional" | "final";
  positionen?: { label: string; betrag: number }[];
}

/** Ein hochzuladender/zu erbringender Nachweis. */
export interface Nachweis {
  id: string;
  label: string;
  hochgeladen: boolean;
  erforderlich?: boolean;
}

/** Der generische Vorgang — `TAntragsdaten` ist der LEISTUNGS-spezifische Antragsinhalt
 *  (z. B. {person, objekt, nachweise} oder {betrieb, taetigkeit}). Alles andere ist generisch über JEDES Fachverfahren. */
export interface Vorgang<TAntragsdaten = Record<string, unknown>> {
  id: string;
  vorgangsnummer: string;
  eingangIso: string;
  antragsdaten: TAntragsdaten;
  status: string; // ein Schlüssel aus config.statusMachine.states
  berechnung?: Berechnung;
  ki: KiEinschaetzung;
  nachweise: Nachweis[];
  history: VorgangHistorie[];
}

// ── Status-State-Machine (data-driven) ──────────────────────────────────────
export type StatusTone = "neu" | "info" | "warn" | "ok" | "block";
export interface StatusDef {
  key: string;
  label: string;
  tone: StatusTone;
  terminal?: boolean; // Endzustand (festgesetzt/abgelehnt) — keine weiteren Übergänge
}
/** Erlaubter Übergang: von→zu, durch welche Rollen, ggf. 4-Augen-pflichtig (serverseitig erzwungen). */
export interface Transition {
  from: string;
  to: string;
  label: string; // die Handlungs-Beschriftung im EntscheidungPanel ("Festsetzen", "Ablehnen", "Zur Prüfung")
  rollen: string[]; // wer den Übergang auslösen darf
  vierAugen?: boolean;
  detailPflicht?: boolean; // Begründung/Detail erforderlich (z.B. bei Ablehnung)
}
export interface StatusMachine {
  initial: string; // Status bei Antrags-Eingang ("eingegangen")
  states: StatusDef[];
  transitions: Transition[];
}

// ── Antrag (geführter Stepper) ──────────────────────────────────────────────
export type FeldTyp =
  | "text"
  | "plz"
  | "date"
  | "select"
  | "checkbox"
  | "number"
  | "tel"
  | "email"
  | "textarea";
export interface FeldDef {
  name: string; // Pfad in den Antragsdaten, z.B. "halter.nachname"
  label: string;
  typ: FeldTyp;
  required?: boolean;
  pattern?: string; // z.B. "^\\d{5}$" für PLZ
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  hint?: string; // Hilfetext / Beispiel
  onceOnly?: boolean; // aus Register vorbefüllbar + editierbar (Once-Only)
}
export interface StepDef {
  id: string;
  titel: string;
  beschreibung?: string;
  felder: FeldDef[];
}

// ── Once-Only Register (synthetische Vorbefüllung) ──────────────────────────
export interface RegisterConfig {
  /** Felder, über die gesucht wird (z.B. ["nachname", "plz"]). */
  suchfelder: string[];
  /** Synthetische Datensätze (Demo) — in PROD ein echter Register-Port. */
  mock?: Record<string, string>[];
}

// ── Render-Adapter für die interne Sicht (VorgangDetail/ReviewWorkspace) ─────
export interface DetailSektion {
  titel: string;
  felder: { pfad: string; label: string }[];
}

// ── OPTIONALE Kit-Komponenten-Signale (additiv) ─────────────────────────────
// Jedes Feld ist OPTIONAL: trägt die Config das Signal NICHT, rendert die App unverändert. Die Strukturen spiegeln
// EXAKT die Prop-Typen der jeweiligen Komponente — definiert hier
// lokal (kein Import aus components/, sonst Zyklus types↔components). Die Generierung füllt diese Felder aus
// dem Fachkonzept; ist keines gesetzt, ist die neue UX schlicht abwesend.

/** Ein konkreter, transparenter KI-Vorschlag (spiegelt KiAssistPanel `KiAssistVorschlag` + Panel-Kopf).
 *  `risikoklasse` spiegelt die KiAssistPanel-`KiRisikoklasse` (inline, um Doppel-Exporte zu vermeiden). */
export interface KiVorschlagConfig {
  /** Der vorgeschlagene Wert (Text/Zahl als String — kompatibel zu ReactNode der Komponente). */
  wert: string;
  /** Herkunft (Modell/Datenquelle) — Transparenzelement „source". */
  quelle: string;
  /** Konfidenz 0..1 — Transparenzelement „confidence". */
  konfidenz: number;
  /** Begründung für genau diesen Vorschlag — Transparenzelement „why". */
  begruendung: string;
  /** Name der unterstützten Funktion/des Feldes (Überschrift + SR-Ansage). */
  funktionsName: string;
  /** Risiko-Einstufung; „hochrisiko-pruefen" erzwingt den Annex-III-Hinweis. */
  risikoklasse: "begrenzt" | "hochrisiko-pruefen";
}

/** Eine Gebührenposition (spiegelt EPaymentPanel `EPaymentPosition`). */
export interface EPaymentPositionConfig {
  bezeichnung: string;
  betrag: number;
}

/** Eine wählbare Zahlart (spiegelt EPaymentPanel `EPaymentZahlart`). */
export interface EPaymentZahlartConfig {
  id: string;
  label: string;
}

/** E-Payment-Signal: nur wenn gesetzt + `berechnung.betrag > 0` rendert das EPaymentPanel im Bürger-Antrag. */
export interface EPaymentConfig {
  /** Wählbare Zahlarten (mindestens eine erwartet). */
  zahlarten: EPaymentZahlartConfig[];
  /** Optionale Gebührenaufschlüsselung (sonst nur der Gesamtbetrag aus `berechne`). */
  positionen?: EPaymentPositionConfig[] | undefined;
  /** ISO-4217-Währungscode (Default EUR). */
  waehrung?: string | undefined;
  /** Überschrift der Bezahl-Karte (Default „Gebühr bezahlen"). */
  titel?: string | undefined;
}

/** Zustellungs-/Bekanntgabe-Signal: schaltet Bescheid-Tab (PdfViewer) + Bürger-Postfach frei. */
export interface ZustellungConfig {
  /** ISO-Datum der rechtlichen Bekanntgabe (§ 41 VwVfG) — maßgeblich für den Fristlauf. */
  bekanntgabeIso?: string | undefined;
  /** true = Bekanntgabe kraft Fiktion (z. B. 3-Tages-Fiktion) — wird als Hinweis ausgewiesen. */
  fiktion?: boolean | undefined;
  /** URL des Bescheid-PDFs — gesetzt ⇒ Bescheid-Tab (PdfViewer) + Postfach-Dokument. */
  bescheidUrl?: string | undefined;
}

/** Eine zu überwachende Frist (spiegelt TerminFristPanel `FristItem` — `status` exakt-optional, ohne `| undefined`). */
export interface FristItemConfig {
  id: string;
  titel: string;
  /** Fälligkeit als ISO-8601-Zeitstempel. */
  faelligIso: string;
  status?: "offen" | "gewahrt";
}

/** Ein buchbarer Terminslot (spiegelt TerminFristPanel `TerminSlot`). */
export interface TerminSlotConfig {
  id: string;
  /** Start als ISO-8601-Zeitstempel. */
  startIso: string;
  /** Dauer in Minuten. */
  dauerMin: number;
}

/** Termin-/Frist-Signal: schaltet das TerminFristPanel (Bürger-Route) frei. */
export interface TerminConfig {
  fristen?: FristItemConfig[] | undefined;
  slots?: TerminSlotConfig[] | undefined;
}

/** Adress-/Melderegister-Validierung (XÖV/XMeld) im Antrag — deterministisch, KEINE KI. */
export interface AdressValidierungConfig {
  /** true ⇒ AdressValidierung wird im Bürger-Antrag eingeblendet. */
  enabled?: boolean | undefined;
}

/** Die EINE Config, die ein Fachverfahren vollständig beschreibt — von der Generierung aus dem Fachkonzept gefüllt. */
export interface LeistungConfig<TAntragsdaten = Record<string, unknown>> {
  id: string; // slug, z.B. "leistung"
  label: string; // Anzeigename der Leistung
  kommune: string; // "Stadt Musterstadt"
  rechtsgrundlagen: { norm: string; titel: string; satzung?: boolean }[];
  fimLeistung?: { id: string; status: "belegt" | "annahme-zu-validieren" }; // GROUNDED — nie erfinden
  antrag: { steps: StepDef[]; einleitung?: string };
  statusMachine: StatusMachine;
  /** Reine Subsumtions-/Berechnungsfunktion (Tatbestand→Rechtsfolge). Testbar, deterministisch, kein Datum/Random. */
  berechne: (antragsdaten: TAntragsdaten) => Berechnung;
  /** Erforderliche Nachweise je Antrag (statisch oder aus den Antragsdaten abgeleitet). */
  nachweise?: (antragsdaten: TAntragsdaten) => Nachweis[];
  register: RegisterConfig;
  detailSektionen: DetailSektion[];
  /** KI-Schwelle (Aufsichts-Kennzahl) + optional EIN transparenter, menschlich entscheidbarer Vorschlag (KiAssistPanel). */
  ki?: {
    schwelleAutonom: number; // ab dieser Konfidenz + 0 Flags = "autonom-fähig" (Aufsichts-Kennzahl)
    /** Gesetzt ⇒ KiAssistPanel (5 Transparenzelemente) statt/zusätzlich zur KiVorschlag-Karte. */
    vorschlag?: KiVorschlagConfig | undefined;
  };
  /** Gesetzt + `berechnung.betrag > 0` ⇒ EPaymentPanel im Bürger-Antrag (verbindliche Gebühr). */
  ePayment?: EPaymentConfig | undefined;
  /** Gesetzt ⇒ Bescheid-Tab (PdfViewer) im ReviewWorkspace + Bürger-Postfach (Zustellnachweis). */
  zustellung?: ZustellungConfig | undefined;
  /** Gesetzt ⇒ TerminFristPanel (Fristen-Überwachung + Terminbuchung) als Bürger-Route. */
  termin?: TerminConfig | undefined;
  /** `enabled` ⇒ AdressValidierung (deterministischer Registerabgleich) im Bürger-Antrag. */
  adressValidierung?: AdressValidierungConfig | undefined;
  /** Seed-Fälle (Demo-Arbeitsvorrat), damit die SB-Sicht sofort echte Vorgänge zeigt. */
  seed?: (helpers: {
    vorgangsnummer: () => string;
  }) => Vorgang<TAntragsdaten>[];
  /** VERFAHRENSSPEZIFISCHE Rollen für den PersonaSwitcher (aus dem Fachkonzept, z.B. Bauherr:in/Entwurfsverfasser:in/
   *  Bauaufsicht statt generisch). Fehlt es, nutzt die Shell die generischen DEFAULT_PERSONAS. Die `key`s bleiben die
   *  drei kanonischen Rollen (buerger/sachbearbeitung/aufsicht) — nur Label/Untertitel sind verfahrensspezifisch. */
  personas?: readonly import("./components/PersonaSwitcher.js").PersonaDescriptor[];
}

/** DATENSCHICHT-PORT — die EINE Schnittstelle, die der Kit nutzt. DEV: Zustand-Store. PROD: SDK/Fastify. */
export interface VorgangPort<TAntragsdaten = Record<string, unknown>> {
  list(): Vorgang<TAntragsdaten>[];
  get(id: string): Vorgang<TAntragsdaten> | undefined;
  /** Bürger-Antrag absenden → neuer Vorgang im Initialstatus + History-Eintrag. */
  einreichen(antragsdaten: TAntragsdaten): Vorgang<TAntragsdaten>;
  /** Status-Übergang (SB-Entscheidung) — prüft die Transition + schreibt History (4-Augen serverseitig in PROD). */
  uebergang(id: string, to: string, rolle: string, detail?: string): void;
  /** Once-Only-Lookup gegen das Register. */
  lookupRegister(query: string): Record<string, string> | undefined;
}
