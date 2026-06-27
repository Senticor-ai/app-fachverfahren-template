// fachverfahren-kit/types — Der GENERISCHE Vertrag eines kommunalen Fachverfahrens.
//
// Abgeleitet aus der VERIFIZIERTEN Referenz-UX (Lovable Hundesteuer = Bürger-Antrag + 3 Personen + Zustand-Store;
// sift-assist-pro = interne Review-/Entscheidungs-UX). Die fertigen Bausteine (AntragStepper · Arbeitsvorrat ·
// ReviewWorkspace · EntscheidungPanel · AufsichtDashboard) konsumieren EINE `LeistungConfig`. Die Generierung füllt
// nur diese Config aus dem Fachkonzept — die UX entsteht IMMER identisch + geprüft. So ist ein Stub unmöglich:
// die Bausteine SIND die funktionierende UX, der Agent liefert nur die Leistungs-Daten.
//
// Architektur: DEV-Datenschicht = Zustand-Store im Browser (end-to-end klickbar, wie die Referenz). PROD = dieselbe
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
  flags: string[]; // z.B. "rasse_unklar", "nachweis_fehlt"
  begruendung?: string;
}

/** Ergebnis der Subsumtion/Berechnung — Betrag + die fachliche BEGRÜNDUNG (Tatbestand→Rechtsfolge). */
export interface Berechnung {
  betrag: number; // in der kleinsten Währungseinheit ODER ganzzahlig je Einheit
  einheit: string; // "EUR/Jahr", "EUR", …
  label: string; // kurzer Ergebnis-Titel
  begruendung: string; // die belegte fachliche Herleitung
  positionen?: { label: string; betrag: number }[];
}

/** Ein hochzuladender/zu erbringender Nachweis. */
export interface Nachweis {
  id: string;
  label: string;
  hochgeladen: boolean;
  erforderlich?: boolean;
}

/** Der generische Vorgang — `TAntragsdaten` ist der LEISTUNGS-spezifische Antragsinhalt (Hundesteuer:
 *  {halter, hund, …}; Gewerbe: {betrieb, taetigkeit, …}). Alles andere ist generisch über JEDES Fachverfahren. */
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
export type FeldTyp = "text" | "plz" | "date" | "select" | "checkbox" | "number" | "tel" | "email" | "textarea";
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

/** Die EINE Config, die ein Fachverfahren vollständig beschreibt — von der Generierung aus dem Fachkonzept gefüllt. */
export interface LeistungConfig<TAntragsdaten = Record<string, unknown>> {
  id: string; // slug, z.B. "hundesteuer"
  label: string; // "Hundesteuer"
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
  ki?: { schwelleAutonom: number }; // ab dieser Konfidenz + 0 Flags = "autonom-fähig" (Aufsichts-Kennzahl)
  /** Seed-Fälle (Demo-Arbeitsvorrat), damit die SB-Sicht sofort echte Vorgänge zeigt. */
  seed?: (helpers: { vorgangsnummer: () => string }) => Vorgang<TAntragsdaten>[];
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
