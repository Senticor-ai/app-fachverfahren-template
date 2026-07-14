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
  /** Der HANDELNDE (pseudonymes Kürzel/Nutzer-ID, keine Klarnamen nötig) — zusätzlich zur Rolle. Ohne Akteur ist ein
   *  Vier-Augen-Nachweis nicht führbar: „Vier Augen" heißt ZWEI VERSCHIEDENE Personen, nicht zwei Rollen desselben
   *  Menschen. Optional (bestehende Configs bleiben gültig); Compliance-KPIs messen über history[].akteur. */
  akteur?: string;
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
  begruendung: string; // die belegte fachliche Herleitung (Rechts-/Audit-Detail — bleibt die kanonische Wahrheit)
  /** M5 — BÜRGERNAHE Begründung in einfacher Sprache (z. B. „Sie zahlen 0 €, weil in Ihrem Fall eine Ausnahme
   *  greift") — OHNE Paragraphen/Fachkürzel. OPTIONAL/additiv: fehlt sie, zeigt die Bürger-Karte `begruendung`. */
  begruendungBuerger?: string;
  /** M5 — RECHTLICHE Begründung (Subsumtion + §/Norm) für Bescheid/Prüfsicht. OPTIONAL/additiv: fehlt sie, gilt
   *  `begruendung`. Trennt die zwei Ebenen (Bürger vs. Recht), ohne eine bestehende Berechnung zu brechen. */
  begruendungRecht?: string;
  // ANZEIGE-STATUS (Pflicht): "provisional", solange für die Berechnung nötige Eingaben fehlen (Teil-/Vorschau-Ergebnis),
  // "final", wenn alle nötigen Felder vorliegen. Erzwingt, dass ein vorläufiger Betrag NIE wie ein endgültiger erscheint —
  // der Typ verlangt das Feld, sodass jede berechne-Funktion es liefern MUSS (kein nachgelagerter Repair-Zyklus).
  status: "provisional" | "final";
  // PFLICHT (wie `status`, gleiche Begründung): jede berechne-Funktion erzeugt `positionen` (mind. `[]`) — der Typ
  // verlangt das Feld, damit `erg.positionen` NIE „possibly undefined" ist. Vorher optional → jeder generierte
  // berechnung.test.ts brach mit tsc18048 (`'erg.positionen' is possibly 'undefined'`) und erzwang einen Self-Heal-
  // Repair-Zyklus (Regression). Non-optional stellt diese Wurzel ab: die Naht liefert positionen, der Test kompiliert.
  // `norm` (optional): die MATERIELLE Rechtsgrundlage dieser Rechenposition (z. B. „§ 11 Abs. 1 GewStG", eine
  // Satzungs-/Tarif-Norm) — damit die Fachkonzept-/DMN-Emission je Rechenschritt die belegende Norm zeigen kann
  // (statt „—"). Rein deskriptiv, data-driven, domänen-agnostisch.
  positionen: { label: string; betrag: number; norm?: string }[];
  /** HERKUNFT der Berechnung (DATA-DRIVEN — kein Anzeige-Hardcode): "deterministisch" = evidence-getriebenes, §-belegtes
   *  Pruef-/Berechnungsschema aus der Naht (DMN/Regeln/Subsumtion; der Regelfall) → KEIN „Vorschlag". "ki" = ein
   *  KI-Assistent hat den Wert vorgeschlagen/geschaetzt (spaetere Feature-Stufe) → als KI-Vorschlag kennzeichnen. Fehlt
   *  das Feld, gilt "deterministisch". Der Produzent/DAG setzt es; die Anzeige leitet die Kennzeichnung NUR daraus ab. */
  herkunft?: "deterministisch" | "ki";
}

/** M4 — der BEZUGSWEG eines Nachweises: klassischer Datei-`upload` (Default), `register-once-only` (der Nachweis
 *  liegt bereits in einem Register — der/die Bürger:in autorisiert nur den Abruf, lädt NICHTS hoch, Once-Only-Prinzip)
 *  oder `gefordert` (nachzureichen; wird später verlangt, jetzt kein Upload). Fehlt der Wert ⇒ `upload`. */
export type NachweisBezugsweg = "upload" | "register-once-only" | "gefordert";

/** M4 — REGISTER-BEZUG eines `register-once-only`-Nachweises (Once-Only): aus welcher Quelle inbound abgerufen,
 *  auf welcher Rechtsgrundlage, mit welcher (optionalen) Einwilligung — und der aktuelle Abruf-Status. Trägt die
 *  Interop-Trias-Richtung `inbound` (Nachweisabruf ≠ outbound Meldung/Zustellung). Alles als DATEN, IP-frei. */
export interface NachweisRegister {
  /** Register-/Quellsystem, aus dem der Nachweis abgerufen wird (z. B. „Melderegister", eine NOOTS-Quelle). */
  quelle: string;
  /** Interop-Richtung: der Nachweisabruf ist stets `inbound` (getrennt von outbound Meldung/Zustellung). */
  richtung: "inbound";
  /** Rechtsgrundlage des Abrufs (Fachrecht + Datenschutz-Befugnis) — als DATEN, kein Kit-Literal. */
  rechtsgrundlage: string;
  /** Optionale Einwilligung: bei nutzergesteuertem Abruf `erforderlich` mit dem anzuzeigenden Einwilligungs-`text`. */
  einwilligung?: { erforderlich: boolean; text: string };
  /** Abruf-Status (Provenienz): noch nicht abgerufen, vom Bürger autorisiert, oder bereits abgerufen. */
  status?: "nicht-abgerufen" | "autorisiert" | "abgerufen";
}

/** Ein hochzuladender/zu erbringender Nachweis. `erforderlich` trägt die Pflicht/optional-Regel als DATEN; die
 *  optionalen Einschränkungen (Typ/Größe) sind ADDITIV — ein Nachweis ohne sie akzeptiert wie bisher jede Datei.
 *  Der Server prüft sie verbindlich (server-autoritativ); die Client-Vorprüfung (`lib/nachweis-pruefung`) ist nur
 *  Fail-Fast-Komfort. Alle Werte kommen aus dem Verfahren/der Config — der Kit trägt KEINE Domänen-Literale. */
export interface Nachweis {
  id: string;
  label: string;
  /** LAUFZEIT-Zustand (ob die Datei erbracht wurde), NICHT Teil der Config-DEFINITION der geforderten Nachweise.
   *  Deshalb OPTIONAL (fehlt ⇒ nicht hochgeladen): der Interpreter/Store setzt ihn beim Einreichen (reconcile). So
   *  muss die generierte `leistung.config` eine SOLL-Nachweisliste NICHT mit Runtime-State anreichern — das vermeidet
   *  den wiederkehrenden Build-Repair „TS2741: Property 'hochgeladen' is missing" (Config-Definition ≠ Runtime-State). */
  hochgeladen?: boolean;
  erforderlich?: boolean;
  /** Erlaubte Datei-Typen als DATEN (native `accept`-Tokens: MIME wie `"application/pdf"`, Wildcard `"image/*"`
   *  oder Endung `".pdf"`). Steuert den Datei-Dialog + die Vorprüfung + den Einschränkungs-Hinweis. Fehlt sie ⇒
   *  jeder Typ ist wählbar. */
  akzeptierteTypen?: string[];
  /** Maximale Dateigröße in Bytes als DATEN. Fehlt sie ⇒ keine clientseitige Größen-Vorprüfung. */
  maxGroesseBytes?: number;
  /** M4 — BEZUGSWEG (upload | register-once-only | gefordert). Fehlt er ⇒ `upload` (rückwärtskompatibel). */
  bezugsweg?: NachweisBezugsweg;
  /** M4 — REGISTER-BEZUG (nur bei `register-once-only` sinnvoll): Quelle/Rechtsgrundlage/Einwilligung/Status. */
  register?: NachweisRegister;
  /** Die TATSÄCHLICH beim Antrag hochgeladene Datei (Metadaten). Wird beim Einreichen aus dem Bürger-Upload
   *  reconciled (hochgeladen:true) — so sieht der Sachbearbeiter im ReviewWorkspace echte „Hochgeladen"-Zustände. */
  datei?: { name: string; groesse: number };
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
  | "checkbox" // Zustimmung/Bestätigung: `required` = MUSS angehakt werden (Einwilligung, AGB) — NICHT für Ja/Nein-Tatbestände
  | "number"
  | "tel"
  | "email"
  | "textarea"
  // Boolescher TATBESTAND als Ja/Nein-Auswahl (Radio). `required` heißt „muss BEANTWORTET werden" (Ja ODER Nein) —
  // nicht „muss bejaht werden". Damit sperrt ein sachlich verneinter Tatbestand (Antwort „Nein") den Antrag NICHT,
  // anders als eine Pflicht-Checkbox. Der Wert wird als boolean geführt (Ja=true / Nein=false).
  | "ja-nein"
  // Einzelner Datei-Upload (Nachweis) inline im Feld. Der Wert ist { name, groesse } (Datei-Metadaten) oder leer.
  // Der echte Datei-Inhalt wandert in PROD über den Port; das Feld hält nur die Referenz.
  | "file";
/** Eine Auswahl-Option (Select). Schlank (`value`/`label`), aber ADDITIV um die M1-Codelisten-Signale erweitert:
 *  `markierung` (optische Hervorhebung, z. B. ein Sonderklasse-Badge) + `merkmale` (fachliche Merkmale des Eintrags) —
 *  durchgereicht aus der `Codeliste`, sodass der Selektor sie rendern kann. `datenlisten`-Optionen tragen sie nicht
 *  (rein value/label) — die Felder sind optional, alles degradiert sauber. */
export interface FeldOption {
  value: string;
  label: string;
  /** M1 — optische Markierung aus dem Codelisten-Eintrag (Badge/Farbe). */
  markierung?: CodelistenMarkierung;
  /** M1 — fachliche Merkmale des Codelisten-Eintrags (durchgereicht für die Anzeige). */
  merkmale?: Record<string, string | number | boolean>;
}

export interface FeldDef {
  name: string; // Pfad in den Antragsdaten, z.B. "halter.nachname"
  label: string; // BÜRGER-Beschriftung (einfache, verständliche Sprache) — die Standard-Sicht
  /** M2 — AMTS-/FACHBEZEICHNUNG (Sachbearbeiter-Sicht, §/Regel-ID). OPTIONAL/additiv: nur intern/auf Wunsch
   *  eingeblendet; die Bürger-Sicht nutzt weiter `label`. */
  labelFachlich?: string;
  /** M2 — LEICHTE-SPRACHE-Fassung des Labels (DIN SPEC 33429) — ZUSÄTZLICH, nicht ersetzend. Nur aktiv, wenn die
   *  App den Leichte-Sprache-Modus einschaltet; fehlt sie, bleibt `label` (sauberer Degrade). */
  leichteSprache?: string;
  /** M2 — vereinfachter Hilfetext für den Leichte-Sprache-Modus (fällt sonst auf `hint` zurück). */
  hintEinfach?: string;
  typ: FeldTyp;
  required?: boolean;
  pattern?: string; // z.B. "^\\d{5}$" für PLZ
  min?: number;
  max?: number;
  /** Auswahl-Optionen (Select) INLINE. Vorrang vor `optionsRef`. Tragen optional Codelisten-Signale
   *  (`markierung`/`merkmale`), sobald sie aus einer `Codeliste` materialisiert wurden. */
  options?: FeldOption[];
  /** DATA-DRIVEN Auswahl: Name einer benannten Liste in `LeistungConfig.datenlisten` (z. B. "rassen"). So liefert ein
   *  Verfahren seine Auswahl (Rassenliste, Kategorien, …) als DATEN und mehrere Felder teilen dieselbe Liste — statt
   *  Freitext oder inline-dupliziertem `options`. Wird ignoriert, wenn `options` gesetzt ist. */
  optionsRef?: string;
  /** Nur `typ: "file"`: erlaubte Datei-Typen für den Datei-Dialog (das native `accept`-Attribut, z. B. "application/pdf,image/*"). */
  accept?: string;
  hint?: string; // Hilfetext / Beispiel
  onceOnly?: boolean; // aus Register vorbefüllbar + editierbar (Once-Only)
  /** NORM-ABGELEITETE Feldregeln als DATEN (additiv zu required/pattern/min/max): bedingte Pflicht („pflicht"
   *  + `wenn`), Format, Bereich, erlaubte Werte — jede mit `normRef`. Der reine Interpreter wertet sie aus; ein
   *  Feld ohne `regeln` verhält sich unverändert. */
  regeln?: FeldRegel[];
  /** PLAUSIBILITÄTS-HINWEISE als DATEN: weiche, NICHT sperrende Hinweise, die erscheinen, wenn ihre `wenn`-Bedingung
   *  über die Antragsdaten erfüllt ist (z. B. „Wert ungewöhnlich hoch — bitte prüfen"). Anders als `regeln` blockieren
   *  sie den Antrag NIE. Der reine Interpreter (`feldHinweise`) wertet sie aus; ein Feld ohne `hinweise` ist unverändert. */
  hinweise?: FeldHinweis[];
  /** M1 — dieses Feld ist AUTOMATISCH ABGELEITET aus einem Codelisten-Merkmal (read-only „automatisch abgeleitet"):
   *  `ausCodeliste` = die Codeliste (deren `ableitungen` dieses Feld über `setzeFeld` füttern), `merkmal` = das
   *  Eintrags-Merkmal. Ersetzt ein manuelles Parallel-Flag. OPTIONAL/additiv — ein Feld ohne `abgeleitet` ist normal. */
  abgeleitet?: FeldAbleitung;
  /** M3 — SICHTBARKEITS-Bedingung (progressive disclosure): das Feld erscheint nur, wenn `sichtbarWenn` über die
   *  Antragsdaten erfüllt ist (der reine Interpreter `evalBedingung` wertet aus). Fehlt sie ⇒ immer sichtbar. Ein
   *  verstecktes Pflichtfeld sperrt den Antrag NICHT (es wird gar nicht validiert). */
  sichtbarWenn?: Bedingung;
}
export interface StepDef {
  id: string;
  titel: string;
  beschreibung?: string;
  felder: FeldDef[];
  /** M3 — ROLLE des Schritts im Fluss: `kontext` (die konditionierende Vorgangsart — ZUERST), `erhebung`
   *  (Datenerfassung, Default) oder `pruefung`. Steuert die Reihenfolge (kontext-Schritte werden vorgezogen).
   *  OPTIONAL/additiv — ohne `rolle` verhält sich der Schritt wie bisher (Erhebung, Original-Reihenfolge). */
  rolle?: "kontext" | "erhebung" | "pruefung";
  /** M3 — SICHTBARKEITS-Bedingung des ganzen Schritts (progressive disclosure). Fehlt sie ⇒ immer sichtbar. */
  sichtbarWenn?: Bedingung;
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
  /** true = Bekanntgabe kraft Fiktion (Zugangs-/Bekanntgabefiktion) — wird als Hinweis ausgewiesen. */
  fiktion?: boolean | undefined;
  /** Bekanntgabefiktion in TAGEN nach Aufgabe zur Post. Default 4: seit PostModG (01.01.2025) betragen sowohl
   *  § 122 Abs. 2 AO als auch § 41 Abs. 2 VwVfG VIER Tage (zuvor drei). EINE Wahrheit — die Rechtsbehelfsbelehrung
   *  (BescheidView) rendert diesen Wert, statt eine Frist im Prosatext zu backen. */
  fiktionTage?: number | undefined;
  /** Norm der Bekanntgabefiktion — Default „§ 41 Abs. 2 VwVfG" (allgemeines Verfahren). Ein Steuer-/AO-Verfahren
   *  setzt „§ 122 Abs. 2 AO" (das VwVfG ist über § 2 Abs. 2 AO ausgeschlossen). Data-driven, kein Regime-Hardcode. */
  fiktionNorm?: string | undefined;
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
  /** OPTIONAL — die typisierte NOMINAL-Dauer der Frist (z. B. `{ wert: 1, einheit: "monat" }`). Wird, falls gesetzt,
   *  zusätzlich zum konkreten Fälligkeitsdatum als „1 Monat" angezeigt (NIE als „1 Tag"). Additiv/rückwärts-
   *  kompatibel: fehlt sie, rendert die Frist unverändert. Die Fälligkeit selbst wird generierungsseitig über
   *  `faelligkeitAb` kalendergenau aus dieser Dauer + einem Ankerdatum abgeleitet (kein Tage×30). */
  dauer?: FristDauer;
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

// ── Business-Logik als DATEN (Tiefe-Stage-0) ────────────────────────────────
// Normativ vorgegebene Fach-Logik wird TRAGBAR als Daten statt in TS-Funktionen versteckt: Tarif-/Gebührentabelle,
// Codelisten mit Provenienz, norm-abgeleitete Feldregeln, Register-/FIM-Referenzen und Fristen-Typen. Alles OPTIONAL
// und additiv — eine Config ohne diese Felder rendert unverändert. Der generische reine Interpreter
// (lib/interpreter) wertet sie aus; `berechne`/`nachweise` werden damit zu OPTIONALEN Escape-Hatches (Default =
// Daten-Auswertung). Durchgängige `normRef` an Tarif/Codeliste/Regel/Frist erdet jeden Wert an „Gesetz#§" + Status.

/** Durchgängige Norm-/Beweis-Provenienz an Tarifen, Codelisten, Regeln, Fristen und Register-Refs. Kanonisch
 *  „Gesetz#§" (z. B. „AO#§12"); `status` trennt belegte Fundstellen von zu validierenden Annahmen — nie erfinden. */
export interface NormRef {
  /** Norm-Identifikator, kanonisch „Gesetz#§" (z. B. „AO#§12", „GewO#§14"). */
  norm: string;
  /** Titel/Kurzbeschreibung der Fundstelle (optional). */
  titel?: string;
  /** Beweisstatus: aus verifizierter Quelle („belegt") vs. zu validierende Annahme („annahme"). */
  status: "belegt" | "annahme";
}

/** Vergleichsoperator einer Feld-Bedingung. `gesetzt`/`nicht-gesetzt` prüfen nur Anwesenheit (ohne `wert`). */
export type BedingungOperator =
  | "=="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "in"
  | "nicht-in"
  | "gesetzt"
  | "nicht-gesetzt";

/** Prädikat über EIN Antragsfeld (Feldpfad wie in `FeldDef.name`). Der reine Interpreter wertet es tolerant gegen
 *  die Antragsdaten aus (Zahl/String/Boolean-Koerzierung), sodass die Subsumtion — z. B. Schwelle `>= 3` — greift. */
export interface FeldBedingung {
  feld: string;
  op: BedingungOperator;
  /** Vergleichswert (bei `in`/`nicht-in` eine Menge); entfällt bei `gesetzt`/`nicht-gesetzt`. */
  wert?: string | number | boolean | (string | number)[];
}

/** Boolesche Verknüpfung von Bedingungen (rekursiv). Genau EINE Kombinator-Angabe je Gruppe. */
export interface BedingungGruppe {
  /** UND — alle Teil-Bedingungen müssen erfüllt sein. */
  alle?: Bedingung[];
  /** ODER — mindestens eine Teil-Bedingung muss erfüllt sein. */
  eine?: Bedingung[];
  /** NICHT — die Teil-Bedingung muss NICHT erfüllt sein. */
  nicht?: Bedingung;
}

/** Generische, verfahrensfreie Bedingung — Blatt (`FeldBedingung`) oder Gruppe. Vom Interpreter ausgewertet. */
export type Bedingung = FeldBedingung | BedingungGruppe;

/** Eine Staffel/Stufe einer Gebühren-/Tariftabelle. Greift, wenn `bedingung` über die Antragsdaten erfüllt ist;
 *  fehlt `bedingung`, ist die Staffel der Auffang/Default. `betrag` in der NATÜRLICHEN Haupteinheit (kein Cent). */
export interface TarifStaffel {
  /** Beschriftung/Begründung der Staffel (fließt in `Berechnung.begruendung`/`positionen`). */
  label?: string;
  /** Subsumtions-Bedingung; fehlt sie ⇒ Auffang-Staffel (immer erfüllt). */
  bedingung?: Bedingung;
  /** Betrag dieser Staffel (natürliche Einheit; z. B. 120 = 120,00 €). */
  betrag: number;
  /** Einheit dieser Staffel, falls abweichend von der Tarif-Einheit. */
  einheit?: string;
  /** Norm-Provenienz genau dieser Staffel. */
  normRef?: NormRef;
}

/** Eine GEBÜHREN-/TARIFTABELLE als DATEN (statt const+switch im Code). Der reine Interpreter wertet sie zu einer
 *  `Berechnung` aus; `modus` bestimmt, ob die erste treffende Staffel gilt oder alle treffenden summiert werden. */
export interface Tarif {
  /** Ergebnis-Einheit (z. B. „EUR/Jahr"), falls nicht je Staffel gesetzt. */
  einheit: string;
  /** Ergebnis-Titel (`Berechnung.label`). */
  label?: string;
  /** Auswertung: erste treffende Staffel (Default) ODER Summe aller treffenden Staffeln. */
  modus?: "erste-treffende" | "summe";
  /** Die Staffeln/Stufen in Prüfreihenfolge. */
  staffeln: TarifStaffel[];
  /** Norm-Provenienz der gesamten Tabelle. */
  normRef?: NormRef;
}

/** Ein Eintrag einer Codeliste — eine Auswahl-Option MIT Herkunft. Ein normativ enumerierter Kategorien-Selektor
 *  ist eine Instanz: jede Kategorie ein Eintrag mit `normRef` (Verordnungsanlage) und ggf. `belege` (dadurch
 *  geforderte Nachweise). */
export interface CodelistenEintrag {
  value: string;
  label: string;
  /** Norm-Provenienz genau dieses Eintrags (z. B. die Anlage, die diese Kategorie normiert). */
  normRef?: NormRef;
  /** Freie Herkunftsangabe, falls kein strukturierter `normRef` vorliegt (z. B. Registername). */
  herkunft?: string;
  /** Nachweise, die dieser Eintrag auslöst (als Nachweis-Label) — der Interpreter leitet daraus Nachweise ab. */
  belege?: string[];
  /** M1 — fachliche MERKMALE dieses Eintrags als DATEN (z. B. `{ sonderklasse: true, stufe: 1 }`). Über die
   *  `ableitungen` der Codeliste projiziert ein Merkmal in ein Antragsfeld — die Subsumtion liest das ABGELEITETE
   *  Feld statt eines manuellen Parallel-Flags. OPTIONAL/additiv. */
  merkmale?: Record<string, string | number | boolean>;
  /** M1 — optische MARKIERUNG dieses Eintrags im Selektor (z. B. ein Warn-Badge für eine Sonderklasse). OPTIONAL. */
  markierung?: CodelistenMarkierung;
}

/** M1 — optische Markierung eines Codelisten-Eintrags im Auswahl-Menü (Ton steuert Farbe, `label` das Badge). */
export interface CodelistenMarkierung {
  /** Ton der Markierung: neutral erklärend (`info`), aufmerksam (`warn`) oder hervorgehoben (`kritisch`). */
  ton: "info" | "warn" | "kritisch";
  /** Badge-Text (z. B. „Sonderklasse"); fehlt er ⇒ nur farbliche Hervorhebung ohne Text. */
  label?: string;
}

/** M1 — eine AUTO-ABLEITUNG einer Codeliste: das Merkmal `ausMerkmal` des GEWÄHLTEN Eintrags wird in das
 *  Antragsfeld `setzeFeld` geschrieben (VOR der Berechnung). `default` greift, wenn der Eintrag das Merkmal nicht
 *  trägt (oder noch nichts gewählt ist) — so ist z. B. „sonderklasse=false" der saubere Normalfall. */
export interface CodelistenAbleitung {
  ausMerkmal: string;
  setzeFeld: string;
  default?: string | number | boolean;
}

/** M1 — Rückverweis eines abgeleiteten FELDS auf die Codeliste + das Merkmal, aus dem es gefüllt wird. Der Kit
 *  rendert ein Feld mit `abgeleitet` read-only als „automatisch abgeleitet". */
export interface FeldAbleitung {
  ausCodeliste: string;
  merkmal: string;
}

/** Eine CODELISTE als DATEN: eine benannte Enumeration mit Provenienz je Eintrag. Über `FeldDef.optionsRef`
 *  referenzierbar wie eine `datenliste`, trägt aber zusätzlich Herkunft/Belege — die reichere, geerdete Variante. */
export interface Codeliste {
  id: string;
  label: string;
  /** Norm-Provenienz der GESAMTEN Liste (z. B. die Verordnung, deren Anlage die Werte enumeriert). */
  normRef?: NormRef;
  eintraege: CodelistenEintrag[];
  /** M1 — AUTO-ABLEITUNGEN: je Regel projiziert das Merkmal des gewählten Eintrags in ein Antragsfeld (VOR der
   *  Berechnung). Ersetzt manuelle Parallel-Flags. OPTIONAL/additiv — eine Codeliste ohne `ableitungen` verhält
   *  sich wie bisher. */
  ableitungen?: CodelistenAbleitung[];
}

/** Art einer norm-abgeleiteten Feldregel: bedingte Pflicht, Format, Bereich, erlaubte Werte. */
export type FeldRegelArt = "pflicht" | "format" | "bereich" | "erlaubte-werte";

/** Eine VALIDIERUNGS-/FELDREGEL als DATEN (norm-abgeleitet), additiv zu den Kurzformen an `FeldDef`
 *  (required/pattern/min/max). Erlaubt BEDINGTE Pflicht (`pflicht` + `wenn` = „required-wenn") und trägt `normRef`. */
export interface FeldRegel {
  art: FeldRegelArt;
  /** Bedingung, unter der die Regel greift (v. a. „required-wenn"). Fehlt sie ⇒ Regel gilt immer. */
  wenn?: Bedingung;
  /** Für `format`: RegExp-Quelle. */
  pattern?: string;
  /** Für `bereich`: inklusive Untergrenze. */
  min?: number;
  /** Für `bereich`: inklusive Obergrenze. */
  max?: number;
  /** Für `erlaubte-werte`: zulässige Werte inline … */
  werte?: (string | number)[];
  /** … oder als Referenz auf eine Codeliste (deren Eintrags-`value`s die erlaubte Menge bilden). */
  codelisteRef?: string;
  /** Fehlermeldung bei Verletzung (sonst eine generische Meldung). */
  meldung?: string;
  /** Norm-Provenienz der Regel. */
  normRef?: NormRef;
}

/** Ein PLAUSIBILITÄTS-HINWEIS als DATEN — ein weicher, NICHT sperrender Hinweis am Feld, der erscheint, sobald seine
 *  `wenn`-Bedingung über die Antragsdaten erfüllt ist. Erhöht die Automation (frühe, kontextsensitive Rückmeldung),
 *  ohne den Antrag zu blockieren — `ton: "warn"` mahnt zur Prüfung, `ton: "info"` erklärt neutral. Generisch. */
export interface FeldHinweis {
  /** Bedingung, unter der der Hinweis erscheint (fehlt ⇒ Hinweis gilt immer). */
  wenn?: Bedingung;
  /** Der Hinweistext (verfahrensspezifisch als DATEN — nie im Kit-Code). */
  text: string;
  /** Ton: neutral erklärend („info", Default) oder aufmerksam machend („warn"). NIE sperrend. */
  ton?: "info" | "warn";
  /** Optionale Norm-Provenienz des Hinweises. */
  normRef?: NormRef;
}

/** REGISTER-REFERENZ: ein Antragsfeld stammt aus / wird abgeglichen mit einem Register. `richtung` trennt die
 *  Interop-Trias (inbound Nachweisabruf ≠ outbound Meldung/Zustellung). */
export interface RegisterRef {
  /** Antragsfeld (Feldpfad), das aus diesem Register stammt/vorbefüllt wird. */
  feld: string;
  /** Register-/Quellsystem (z. B. „Melderegister", „Gewerberegister", eine NOOTS-Quelle). */
  register: string;
  /** Datenformat/Schema des Austauschs (z. B. „XMeld", ein FIM-Datenschema). */
  datenformat?: string;
  /** Vertrauensniveau der Herkunft (z. B. eIDAS „hoch"/„substantiell"/„niedrig"). */
  vertrauensniveau?: string;
  /** Interop-Richtung: inbound (Nachweisabruf) vs. outbound (Meldung/Zustellung). */
  richtung?: "inbound" | "outbound";
  /** Norm-/Rechtsgrundlage des Abrufs/der Meldung. */
  normRef?: NormRef;
}

/** FIM-REFERENZ (Föderales Informationsmanagement): bindet ein Feld/den Antrag an einen FIM-Baustein. `status`
 *  trennt belegte Zuordnungen von zu validierenden Annahmen — nie erfinden. */
export interface FimRef {
  /** FIM-Schlüssel/URN des Bausteins. */
  fimId: string;
  /** Art des FIM-Bausteins. */
  art?: "leistung" | "prozess" | "datenschema" | "datenfeld";
  /** Antragsfeld, das dieser FIM-Baustein beschreibt (bei Datenfeldern). */
  feld?: string;
  status: "belegt" | "annahme-zu-validieren";
}

/** Zeit-Einheit einer Frist bzw. Frist-Dauer. SINGULAR-Schlüssel — die Anzeige pluralisiert (`formatFristDauer`:
 *  1 → „1 Monat", 4 → „4 Monate"). Die Einheit wird als DATEN geführt, damit eine Monatsfrist NICHT als roher
 *  Tage-Wert modelliert werden muss (sonst kollabiert „1 Monat" zu „1 Tag" bzw. wird über „30 Tage" genähert). */
export type FristEinheit = "tag" | "woche" | "monat" | "jahr";
/** Ereignis, ab dem eine Frist läuft. */
export type FristAnker = "eingang" | "bekanntgabe" | "bescheid" | "ereignis";

/** Eine typisierte Frist-DAUER als DATEN: Anzahl (`wert`) + Zeit-`einheit` — z. B. eine Monatsfrist als
 *  `{ wert: 1, einheit: "monat" }`. `einheit` ist OPTIONAL; fehlt sie, gilt der Default "tag" (so bleibt ein reiner
 *  Zahl-Wert rückwärts-kompatibel als Tage lesbar). `lib/frist` rendert die Dauer (korrektes Deutsch, Singular/
 *  Plural via `formatFristDauer`) und leitet aus einem Ankerdatum die Fälligkeit über ECHTE Kalender-Arithmetik ab
 *  (`faelligkeitAb` — Monate/Jahre kalendergenau mit Monatsende-Klemmung, kein Tage×30). Verhindert die Wurzel des
 *  Content-Audits: Monatsfrist ≠ Tage-Wert. */
export interface FristDauer {
  /** Anzahl der Einheiten (z. B. 1 für „1 Monat", 4 für „4 Jahre"). */
  wert: number;
  /** Zeit-Einheit; fehlt sie ⇒ "tag". */
  einheit?: FristEinheit;
}

/** Ein FRISTEN-TYP als DATEN (die Norm-Regel „X ab Ankerdatum"), unabhängig von einer konkreten Instanz
 *  (`FristItemConfig`). Der Interpreter kann daraus ab einem Ankerdatum eine konkrete Fälligkeit berechnen. */
export interface FristTyp {
  id: string;
  label: string;
  /** Dauer in `einheit`. */
  dauer: number;
  einheit: FristEinheit;
  /** Ereignis, ab dem die Frist läuft. */
  anker: FristAnker;
  /** Fristcharakter (informativ). */
  art?: "gesetzlich" | "behoerdlich" | "ausschluss";
  normRef?: NormRef;
}

/** Die EINE Config, die ein Fachverfahren vollständig beschreibt — von der Generierung aus dem Fachkonzept gefüllt. */
/** DATEN-Signal: das Verfahren BIETET transparente KI-Assistenz an (KiAssistPanel Live-Modus, KiAssistPort).
 *  Reines Angebot + Obergrenzen — der Mensch schaltet über `KiSteuerung`, ein Port (lib/ai-assist) liefert zur
 *  Laufzeit. Kein Modell/Netz im Kit. Transparenz nach Art. 50 EU-AI-Act ist Pflicht (Kennzeichnung + „warum"). */
export interface KiAssistConfig {
  /** Menschlich lesbarer Zweck (Transparenz) — z. B. „Vorschlag zur Vollständigkeitsprüfung". */
  zweck: string;
  /** Herkunft/Modellklasse als Anzeige (Transparenzelement „source"), z. B. „kommunales LLM (EU-Hosting)". */
  quelle?: string;
  /** Autonomie-OBERGRENZE: die effektive Schwelle ist max(diese, KiSteuerung.schwelleAutonom) — der Mensch kann
   *  nur strenger, nie lockerer stellen; unterhalb bleibt die menschliche Freigabe zwingend (humanOversight). */
  maxSchwelleAutonom?: number;
}

/** DATEN-Signal: das Verfahren BIETET einen KI-Assistenten/Chat an (AssistentPanel, KiChatPort). */
export interface KiChatConfig {
  zweck: string;
  quelle?: string;
  /** Optionaler, generischer Begrüßungstext (keine Domänen-Antworten im Kit). */
  begruessung?: string;
}

/** DATEN-Signal: das Verfahren BIETET Spracheingabe an (VoiceInput, VoicePort). */
export interface VoiceConfig {
  /** Sprache(n) als BCP-47 (z. B. „de-DE") — informativ für die Transkription. */
  sprachen?: string[];
  /** Muss die Verarbeitung on-device / EU-ansässig sein? Kit-Default-Erwartung: true (Datenschutz). */
  euResidenzErforderlich?: boolean;
}

export interface LeistungConfig<TAntragsdaten = Record<string, unknown>> {
  id: string; // slug, z.B. "leistung"
  label: string; // Anzeigename der Leistung
  kommune: string; // "Stadt Musterstadt"
  rechtsgrundlagen: { norm: string; titel: string; satzung?: boolean }[];
  fimLeistung?: { id: string; status: "belegt" | "annahme-zu-validieren" }; // GROUNDED — nie erfinden
  /** M3 — `konditionierendesFeld`: der P0-Feldpfad der Vorgangsart, der den Rest des Antrags konditioniert; MUSS
   *  in `steps[0]` (dem `rolle: "kontext"`-Schritt) liegen. Downstream-Schritte/-Felder blenden über `sichtbarWenn`
   *  darauf ein. OPTIONAL/additiv — fehlt es, gibt es keine progressive Disclosure (Verhalten wie bisher). */
  antrag: {
    steps: StepDef[];
    einleitung?: string;
    konditionierendesFeld?: string;
  };
  /** Benannte, wiederverwendbare Auswahl-Listen als DATEN (z. B. `{ rassen: [...], kategorien: [...] }`). Ein Feld
   *  referenziert eine Liste über `FeldDef.optionsRef` und zieht seine Optionen damit aus der Config — die generische
   *  Fähigkeit, dass ein Verfahren z. B. eine Rassenliste liefert, ohne Kit-Code zu ändern. */
  datenlisten?: Record<string, { value: string; label: string }[]>;
  /** GEBÜHREN-/TARIFTABELLE als DATEN (Staffeln statt const+switch). Fehlt `berechne`, wertet der reine Interpreter
   *  (lib/interpreter) diesen Tarif zur `Berechnung` aus — `berechne` ist der Escape-Hatch für nicht-tabellarische
   *  Logik und hat, falls gesetzt, Vorrang. */
  tarif?: Tarif;
  /** CODELISTEN mit Provenienz (Enumerationen mit `normRef`/`belege` je Eintrag). Über `FeldDef.optionsRef`
   *  referenzierbar wie `datenlisten`, aber geerdet — ein normativ enumerierter Kategorien-Selektor ist eine Instanz.
   *  Ein Eintrag mit `belege` leitet zusätzlich die erforderlichen Nachweise ab (Default für `nachweise`). */
  codelisten?: Record<string, Codeliste>;
  /** REGISTER-REFERENZEN als DATEN: Feld ↔ Register/Datenformat/Vertrauensniveau/Richtung. */
  registerRefs?: RegisterRef[];
  /** FIM-REFERENZEN als DATEN: Feld/Antrag ↔ FIM-Baustein (belegt|annahme-zu-validieren). */
  fimRefs?: FimRef[];
  /** FRISTEN-TYPEN als DATEN (Norm-Regel „X ab Ankerdatum") — unabhängig von konkreten Frist-Instanzen. */
  fristenTypen?: FristTyp[];
  statusMachine: StatusMachine;
  /** ESCAPE-HATCH für nicht-tabellarische Subsumtion (Tatbestand→Rechtsfolge): reine, testbare, deterministische
   *  Berechnung (kein Datum/Random). OPTIONAL — fehlt sie, ist die Daten-Auswertung von `tarif` durch den reinen
   *  Interpreter der Default. Ist sie gesetzt, hat sie Vorrang vor `tarif`. */
  berechne?: (antragsdaten: TAntragsdaten) => Berechnung;
  /** ESCAPE-HATCH für Nachweise. OPTIONAL — fehlt sie, leitet der Interpreter die Nachweise aus den `codelisten`
   *  (`belege` der gewählten Einträge) ab. Ist sie gesetzt, hat sie Vorrang. */
  nachweise?: (antragsdaten: TAntragsdaten) => Nachweis[];
  register: RegisterConfig;
  detailSektionen: DetailSektion[];
  /** KI-Schwelle (Aufsichts-Kennzahl) + optional EIN transparenter, menschlich entscheidbarer Vorschlag (KiAssistPanel). */
  ki?: {
    schwelleAutonom: number; // ab dieser Konfidenz + 0 Flags = "autonom-fähig" (Aufsichts-Kennzahl)
    /** Gesetzt ⇒ KiAssistPanel (5 Transparenzelemente) statt/zusätzlich zur KiVorschlag-Karte. */
    vorschlag?: KiVorschlagConfig | undefined;
    /** Gesetzt ⇒ das Verfahren bietet transparente KI-Assistenz an (KiAssistPanel Live-Modus + KiAssistPort). */
    assist?: KiAssistConfig | undefined;
    /** Gesetzt ⇒ das Verfahren bietet einen KI-Assistenten/Chat an (AssistentPanel + KiChatPort). */
    chat?: KiChatConfig | undefined;
    /** Gesetzt ⇒ das Verfahren bietet Spracheingabe an (VoiceInput + VoicePort). */
    voice?: VoiceConfig | undefined;
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
  /** Bürger-Antrag absenden → neuer Vorgang im Initialstatus + History-Eintrag. `erbrachteNachweise` (optional, generisch)
   *  = die vom Bürger hochgeladenen Dateien, keyed by Nachweis-Id → der Vorgang trägt sie als „hochgeladen" (sonst
   *  zeigte der Sachbearbeiter für JEDEN Nachweis „Fehlt", egal was hochgeladen wurde). */
  einreichen(
    antragsdaten: TAntragsdaten,
    erbrachteNachweise?: Record<
      string,
      { name: string; groesse: number } | null
    >,
  ): Vorgang<TAntragsdaten>;
  /** Status-Übergang (SB-Entscheidung) — prüft die Transition + schreibt History (4-Augen serverseitig in PROD).
   *  `akteur` (optional): pseudonyme Kennung des Handelnden → landet als `history[].akteur` und macht Vier-Augen
   *  nachweisbar; bei `vierAugen`-Transitionen prüft schon der DEV-Store, dass ZWEI VERSCHIEDENE Akteure handeln. */
  uebergang(
    id: string,
    to: string,
    rolle: string,
    detail?: string,
    akteur?: string,
  ): void;
  /** Once-Only-Lookup gegen das Register. */
  lookupRegister(query: string): Record<string, string> | undefined;
}

/** Ein Wissensartikel als DATEN. Inhalte werden über die gemeinsame Markdown-Render-Schicht dargestellt. */
export interface WissensArtikel {
  id: string;
  titel: string;
  markdown: string;
  /** Optionale Gruppierung in der Wissens-Navigation. */
  kategorie?: string;
  /** Optionaler ISO-Zeitstempel der letzten Änderung. */
  standIso?: string;
}
