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
export interface FeldDef {
  name: string; // Pfad in den Antragsdaten, z.B. "halter.nachname"
  label: string;
  typ: FeldTyp;
  required?: boolean;
  pattern?: string; // z.B. "^\\d{5}$" für PLZ
  min?: number;
  max?: number;
  /** Auswahl-Optionen (Select) INLINE. Vorrang vor `optionsRef`. */
  options?: { value: string; label: string }[];
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
}

/** Eine CODELISTE als DATEN: eine benannte Enumeration mit Provenienz je Eintrag. Über `FeldDef.optionsRef`
 *  referenzierbar wie eine `datenliste`, trägt aber zusätzlich Herkunft/Belege — die reichere, geerdete Variante. */
export interface Codeliste {
  id: string;
  label: string;
  /** Norm-Provenienz der GESAMTEN Liste (z. B. die Verordnung, deren Anlage die Werte enumeriert). */
  normRef?: NormRef;
  eintraege: CodelistenEintrag[];
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

/** Zeit-Einheit eines Fristen-Typs. */
export type FristEinheit = "tage" | "werktage" | "wochen" | "monate" | "jahre";
/** Ereignis, ab dem eine Frist läuft. */
export type FristAnker = "eingang" | "bekanntgabe" | "bescheid" | "ereignis";

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
export interface LeistungConfig<TAntragsdaten = Record<string, unknown>> {
  id: string; // slug, z.B. "leistung"
  label: string; // Anzeigename der Leistung
  kommune: string; // "Stadt Musterstadt"
  rechtsgrundlagen: { norm: string; titel: string; satzung?: boolean }[];
  fimLeistung?: { id: string; status: "belegt" | "annahme-zu-validieren" }; // GROUNDED — nie erfinden
  antrag: { steps: StepDef[]; einleitung?: string };
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
