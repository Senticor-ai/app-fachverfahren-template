// fachverfahren-kit/lib/interpreter — der GENERISCHE, REINE Interpreter der Business-Logik-DATEN.
//
// Ein Reducer ohne EINE Zeile verfahrensspezifischen Codes: er wertet die deklarativen Daten-Strukturen der
// `LeistungConfig` aus — `tarif` (Gebührentabelle) → `Berechnung`, `regeln` (norm-abgeleitete Feldregeln) →
// Validierung, `codelisten` (Enumerationen mit Provenienz) → Optionen + abgeleitete Nachweise. `berechne`/`nachweise`
// werden damit zu OPTIONALEN Escape-Hatches: sind sie gesetzt, haben sie Vorrang; sonst ist die Daten-Auswertung der
// Default. Rein (kein Datum/Random/DOM), deterministisch, testbar. Die Bedingungs-Auswertung ist bewusst
// TYP-TOLERANT (Zahl/String/Boolean-Koerzierung), damit die Subsumtion sowohl über typisierte als auch über rohe
// Antragsdaten greift.
import type {
  Bedingung,
  Berechnung,
  BoardColumn,
  Codeliste,
  FeldBedingung,
  FeldDef,
  FeldRegel,
  LeistungConfig,
  Nachweis,
  NachweisBezugsweg,
  NormRef,
  PriorityDef,
  StatusDef,
  StepDef,
  Tarif,
  Transition,
} from "../types.js";
import {
  asString,
  feldFehler,
  getPath,
  istBeantwortet,
  setPath,
  type Antragsdaten,
} from "./antrag-felder.js";

/** Kontext, den regelbasierte Prüfungen brauchen (Codelisten für `erlaubte-werte`-Regeln mit `codelisteRef`). */
export type RegelKontext = {
  codelisten?: Record<string, Codeliste> | undefined;
};

// ── Bedingungs-Auswertung (das Herz der Subsumtion) ──────────────────────────────────────────────
/** Ist die Bedingung über die Antragsdaten erfüllt? Fehlende Bedingung = immer erfüllt (Auffang/Default). */
export function evalBedingung(
  bedingung: Bedingung | undefined,
  daten: Antragsdaten,
): boolean {
  if (!bedingung) return true;
  if (istFeldBedingung(bedingung)) return evalFeldBedingung(bedingung, daten);
  // BedingungGruppe: genau EIN Kombinator; leere Gruppe ist neutral erfüllt.
  if (bedingung.alle)
    return bedingung.alle.every((c) => evalBedingung(c, daten));
  if (bedingung.eine)
    return bedingung.eine.some((c) => evalBedingung(c, daten));
  if (bedingung.nicht) return !evalBedingung(bedingung.nicht, daten);
  return true;
}

function istFeldBedingung(b: Bedingung): b is FeldBedingung {
  return "feld" in b && "op" in b;
}

function evalFeldBedingung(b: FeldBedingung, daten: Antragsdaten): boolean {
  const wert = getPath(daten, b.feld);
  switch (b.op) {
    case "gesetzt":
      return asString(wert).trim().length > 0;
    case "nicht-gesetzt":
      return asString(wert).trim().length === 0;
    case "==":
      return gleich(wert, b.wert);
    case "!=":
      return !gleich(wert, b.wert);
    case ">":
      return zahlVergleich(wert, b.wert, (a, c) => a > c);
    case ">=":
      return zahlVergleich(wert, b.wert, (a, c) => a >= c);
    case "<":
      return zahlVergleich(wert, b.wert, (a, c) => a < c);
    case "<=":
      return zahlVergleich(wert, b.wert, (a, c) => a <= c);
    case "in":
      return alsMenge(b.wert).some((z) => gleich(wert, z));
    case "nicht-in":
      return !alsMenge(b.wert).some((z) => gleich(wert, z));
    default:
      return false;
  }
}

function alsMenge(wert: FeldBedingung["wert"]): (string | number | boolean)[] {
  return Array.isArray(wert) ? wert : wert === undefined ? [] : [wert];
}

/** True, wenn `v` ein String ist, der zwar als Zahl parst, dessen getrimmte Form aber NICHT der kanonischen
 *  Zahldarstellung entspricht — führende Null („01"), „1.0", „+1" etc. Solche amtlichen Schlüssel (Bundesland
 *  01–16, AGS, Gemeindeschlüssel) sind KEINE Quantitäten und dürfen nicht numerisch kollabiert werden; sie werden
 *  strikt als String verglichen — konsistent zu interpretNachweise/abgeleiteteFelder/feldAnzeige (`e.value === wert`). */
function istCodeString(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.trim().replace(",", ".");
  if (s === "") return false;
  const n = Number(s);
  if (Number.isNaN(n)) return false; // gar keine Zahl → String-Vergleich greift ohnehin
  return String(n) !== s;
}

/** Gleichheit typ-tolerant: Boolean gegen Boolean, sonst numerisch wenn beide ECHTE Zahlen sind, sonst String. */
function gleich(a: unknown, b: unknown): boolean {
  if (typeof a === "boolean" || typeof b === "boolean") {
    // Ein FEHLENDER Wert (undefined/null) ist weder true noch false — er darf `== false` NICHT erfüllen, sonst gälte
    // ein UNBEANTWORTETER Tatbestand als „mit Nein beantwortet" und erzeugte ein verfrühtes „final"/0-€-Ergebnis.
    if (a === undefined || a === null || b === undefined || b === null)
      return false;
    return alsBool(a) === alsBool(b);
  }
  const na = alsZahl(a);
  const nb = alsZahl(b);
  // Numerisch NUR, wenn keine Seite ein Code-String mit nicht-kanonischer Zahlform ist (sonst „1" == „01").
  if (
    na !== undefined &&
    nb !== undefined &&
    !istCodeString(a) &&
    !istCodeString(b)
  )
    return na === nb;
  return asString(a) === asString(b);
}

function zahlVergleich(
  wert: unknown,
  ziel: unknown,
  cmp: (a: number, c: number) => boolean,
): boolean {
  const a = alsZahl(wert);
  const c = alsZahl(ziel);
  if (a === undefined || c === undefined) return false;
  return cmp(a, c);
}

/** Wert → Zahl oder `undefined` (leerer String / NaN / null zählen NICHT als Zahl). Toleriert de-DE-Dezimalkomma. */
function alsZahl(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isNaN(v) ? undefined : v;
  if (typeof v === "boolean" || v === null || v === undefined) return undefined;
  const s = String(v).trim();
  if (s === "") return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isNaN(n) ? undefined : n;
}

function alsBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  return v === "true" || v === "ja" || v === 1 || v === "1";
}

// ── M1: Abgeleitete Felder (Codelisten-Merkmal → Antragsfeld, VOR der Berechnung) ─────────────────
/** Wendet die `ableitungen` aller Codelisten auf die Antragsdaten an: für jedes Feld mit `optionsRef` auf eine
 *  Codeliste liefert der GEWÄHLTE Eintrag über sein Merkmal (`ausMerkmal`) den Wert des Zielfelds (`setzeFeld`).
 *  Fehlt das Merkmal (oder ist noch nichts gewählt), greift der `default`. So ersetzt ein Codelisten-Merkmal ein
 *  manuelles Parallel-Flag: die Berechnung liest das ABGELEITETE Feld. Rein, immutabel, IDEMPOTENT (mehrfaches
 *  Anwenden ergibt dasselbe). Eine Config ohne `ableitungen` gibt die Daten unverändert zurück. */
export function abgeleiteteFelder<T = Record<string, unknown>>(
  config: Pick<LeistungConfig<T>, "antrag" | "codelisten">,
  daten: Antragsdaten,
): Antragsdaten {
  const codelisten = config.codelisten ?? {};
  let out = daten;
  for (const step of config.antrag.steps) {
    for (const feld of step.felder) {
      if (!feld.optionsRef) continue;
      const liste = codelisten[feld.optionsRef];
      if (!liste?.ableitungen?.length) continue;
      const wert = asString(getPath(out, feld.name));
      const eintrag = wert
        ? liste.eintraege.find((e) => e.value === wert)
        : undefined;
      for (const ableitung of liste.ableitungen) {
        const ausMerkmal = eintrag?.merkmale?.[ableitung.ausMerkmal];
        const zuSetzen =
          ausMerkmal !== undefined ? ausMerkmal : ableitung.default;
        if (zuSetzen !== undefined) {
          out = setPath(out, ableitung.setzeFeld, zuSetzen);
        }
      }
    }
  }
  return out;
}

// ── M3: Sichtbare Schritte/Felder (progressive disclosure) ────────────────────────────────────────
/** Die SICHTBAREN Schritte für den aktuellen Antragsstand: filtert Schritte UND ihre Felder über `sichtbarWenn`
 *  (der reine `evalBedingung`) und zieht `rolle: "kontext"`-Schritte nach vorne — die konditionierende Vorgangsart
 *  ZUERST. Stabil: ohne `rolle`/`sichtbarWenn` bleiben Menge und Reihenfolge exakt wie deklariert. Ein verstecktes
 *  (Pflicht-)Feld wird gar nicht gerendert und daher auch nicht validiert — es sperrt den Antrag nicht. Rein. */
export function sichtbareSchritte(
  steps: StepDef[],
  daten: Antragsdaten,
): StepDef[] {
  const gefiltert = steps
    .filter((s) => evalBedingung(s.sichtbarWenn, daten))
    .map((s) => ({
      ...s,
      felder: s.felder.filter((f) => evalBedingung(f.sichtbarWenn, daten)),
    }));
  const rang = (s: StepDef): number =>
    s.rolle === "kontext" ? 0 : s.rolle === "pruefung" ? 2 : 1;
  // Stabile Sortierung: kontext (0) vor Erhebung/Default (1) vor Prüfung (2); innerhalb eines Rangs Reihenfolge erhalten.
  return gefiltert
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rang(a.s) - rang(b.s) || a.i - b.i)
    .map((x) => x.s);
}

// ── Tarif-Auswertung (Gebührentabelle als DATEN → Berechnung) ─────────────────────────────────────
/** Wertet eine Tariftabelle über die Antragsdaten zu einer `Berechnung` aus. `modus: "summe"` addiert alle
 *  treffenden Staffeln, sonst gilt die ERSTE treffende. Trifft keine Staffel (kein Default), ist das Ergebnis
 *  `provisional` (noch keine Angaben, die eine Staffel bestimmen) — konsistent mit `Berechnung.status`. */
export function interpretTarif(tarif: Tarif, daten: Antragsdaten): Berechnung {
  const modus = tarif.modus ?? "erste-treffende";
  const treffer = tarif.staffeln.filter((s) =>
    evalBedingung(s.bedingung, daten),
  );
  const anwendbar = modus === "summe" ? treffer : treffer.slice(0, 1);
  const betrag = anwendbar.reduce((sum, s) => sum + s.betrag, 0);
  const positionen = anwendbar.map((s) => ({
    label: s.label ?? tarif.label ?? "Position",
    betrag: s.betrag,
  }));
  const vollstaendig = anwendbar.length > 0;
  const labels = anwendbar.map(
    (s) => s.label ?? `${s.betrag} ${s.einheit ?? tarif.einheit}`,
  );
  const begruendung = vollstaendig
    ? labels.join("; ")
    : "Noch keine Angaben, die eine Tarif-Staffel bestimmen.";
  // M5 — ZWEI EBENEN aus denselben DATEN: die Bürger-Fassung nennt nur die (bürgersprachlichen) Staffel-Gründe
  // OHNE Paragraphen; die Rechts-Fassung hängt die belegten Normen der treffenden Staffeln an (Bescheid/Prüfsicht).
  const begruendungBuerger = vollstaendig
    ? labels.join("; ")
    : "Sobald Ihre Angaben vollständig sind, berechnen wir den Betrag für Sie.";
  const normen = [
    ...new Set(
      anwendbar
        .map((s) => s.normRef?.norm)
        .filter((n): n is string => typeof n === "string" && n.length > 0),
    ),
  ];
  const begruendungRecht =
    vollstaendig && normen.length > 0
      ? `${begruendung} (${normen.join(", ")})`
      : begruendung;
  return {
    betrag,
    einheit: tarif.einheit,
    label: tarif.label ?? "Gebühr",
    begruendung,
    begruendungBuerger,
    begruendungRecht,
    status: vollstaendig ? "final" : "provisional",
    positionen,
  };
}

// ── Board-Spalten (Kanban) aus DATEN ableiten ─────────────────────────────────────────────────────
/** Leitet aus einem Endzustand die normalisierte Plane-State-Group ab: ein blockender Endzustand (Ablehnung)
 *  → „abgebrochen", sonst (Festsetzung o. Ä.) → „erledigt". Nicht-Endzustände bleiben ohne Default-Gruppe
 *  (der Cross-Verfahren-Fall setzt `gruppe` bei Bedarf explizit in der `BoardColumn`). */
function defaultGruppe(state: StatusDef): BoardColumn["gruppe"] | undefined {
  if (!state.terminal) return undefined;
  return state.tone === "block" ? "abgebrochen" : "erledigt";
}

/**
 * Die BOARD-SPALTEN (Kanban) als DATEN. Reihenfolge der Wahrheit: explizite `board.spalten` (falls gesetzt) haben
 * Vorrang; sonst werden die Spalten aus der gewählten Achse abgeleitet — `status` (Default) aus
 * `statusMachine.states`, `prioritaet` aus den Prioritäts-Stufen (Verfahren ODER übergebene Workspace-Stufen,
 * nach `ordinal` sortiert). Die Achse `zuweisung` kann NICHT statisch abgeleitet werden (Bearbeiter sind dynamisch)
 * → sie liefert nur die expliziten `spalten` (sonst leer). Rein/deterministisch.
 */
export function boardSpalten(
  config: Pick<LeistungConfig, "statusMachine" | "board" | "prioritaeten">,
  workspacePrioritaeten?: PriorityDef[],
): BoardColumn[] {
  const board = config.board;
  if (board?.spalten && board.spalten.length > 0) return board.spalten;

  const achse = board?.achse ?? "status";
  if (achse === "prioritaet") {
    const stufen = config.prioritaeten ?? workspacePrioritaeten ?? [];
    return [...stufen]
      .sort((a, b) => a.ordinal - b.ordinal)
      .map((p) => ({ key: p.key, label: p.label, tone: p.tone }));
  }
  if (achse === "zuweisung") {
    // Dynamische Achse — ohne explizite Spalten gibt es keine statische Ableitung.
    return [];
  }
  // Default: Status-Achse aus der State-Machine.
  return (config.statusMachine?.states ?? []).map((s) => {
    const gruppe = defaultGruppe(s);
    return {
      key: s.key,
      label: s.label,
      tone: s.tone,
      ...(gruppe ? { gruppe } : {}),
    };
  });
}

// ── Governance-Derivation (Dual-Mode Phase 2, MONOTON) ────────────────────────────────────────────
const transitionKey = (t: { from: string; to: string }) => `${t.from} ${t.to}`;

/** Die EFFEKTIVEN Transitionen: die deklarierten `statusMachine.transitions`, wobei jede Transition, die
 *  `governance.zusaetzlicheVierAugen` (from→to) nennt, zusaetzlich `vierAugen: true` traegt. Schaltet Vier-Augen
 *  NUR AN, NIE ab (Obermenge) — die Governance-Opt-in-Monotonie. Ohne `governance` (oder ohne Eintraege) wird die
 *  deklarierte Liste UNVERAENDERT (per Referenz) zurueckgegeben — Byte-identisches Verhalten. Rein (kein Datum/
 *  Random): DEV-Store UND PROD-Policy koennen dieselbe EINE Wahrheit ableiten, ohne eine zweite zu erzeugen. */
export function abgeleiteteTransitions(
  config: Pick<LeistungConfig, "statusMachine" | "governance">,
): Transition[] {
  const extra = config.governance?.zusaetzlicheVierAugen ?? [];
  if (extra.length === 0) return config.statusMachine.transitions;
  const gefordert = new Set(extra.map(transitionKey));
  return config.statusMachine.transitions.map((t) =>
    !t.vierAugen && gefordert.has(transitionKey(t))
      ? { ...t, vierAugen: true }
      : t,
  );
}

/** Positive Monotonie-Assertion: liefert die deklarierten Vier-Augen-Transitionen, die in der abgeleiteten Menge
 *  NICHT MEHR Vier-Augen-pflichtig sind (die Ableitung darf nur ANschalten). Leer = ok; nicht-leer = die Derivation
 *  hat Governance ABGESCHWAECHT (ein Fehler). Basis fuer Gate + Test — verriegelt, dass Governance-Opt-in strikt
 *  monoton bleibt und store.ts nie schwaechere Regeln als die Config sieht. */
export function governanceMonotonieVerletzungen(
  config: Pick<LeistungConfig, "statusMachine" | "governance">,
): { from: string; to: string }[] {
  const abgeleitetVierAugen = new Set(
    abgeleiteteTransitions(config)
      .filter((t) => t.vierAugen)
      .map(transitionKey),
  );
  return config.statusMachine.transitions
    .filter((t) => t.vierAugen && !abgeleitetVierAugen.has(transitionKey(t)))
    .map((t) => ({ from: t.from, to: t.to }));
}

// ── Nachweise aus Codelisten ableiten (belege der gewählten Einträge) ─────────────────────────────
/** Leitet die erforderlichen Nachweise aus den `codelisten` ab: für jedes Feld mit `optionsRef` auf eine Codeliste
 *  liefert der GEWÄHLTE Eintrag über seine `belege` die Nachweise. Dedupliziert über eine stabile Id (aus dem Label). */
export function interpretNachweise(
  config: Pick<LeistungConfig, "antrag" | "codelisten">,
  daten: Antragsdaten,
): Nachweis[] {
  const codelisten = config.codelisten ?? {};
  const out: Nachweis[] = [];
  const gesehen = new Set<string>();
  for (const step of config.antrag.steps) {
    for (const feld of step.felder) {
      if (!feld.optionsRef) continue;
      const liste = codelisten[feld.optionsRef];
      if (!liste) continue;
      const wert = asString(getPath(daten, feld.name));
      if (!wert) continue;
      const eintrag = liste.eintraege.find((e) => e.value === wert);
      for (const beleg of eintrag?.belege ?? []) {
        const id = belegId(beleg);
        if (gesehen.has(id)) continue;
        gesehen.add(id);
        out.push({ id, label: beleg, hochgeladen: false, erforderlich: true });
      }
    }
  }
  return out;
}

function belegId(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "nachweis";
}

// ── M4: Bezugsweg eines Nachweises (upload | register-once-only | gefordert) ──────────────────────
/** Der EFFEKTIVE Bezugsweg eines Nachweises — die EINE Wahrheit für die Kit-Rendering-Verzweigung: fehlt
 *  `bezugsweg`, ist es der klassische Datei-`upload` (rückwärtskompatibel). So müssen Renderer nicht selbst
 *  defaulten. Rein. */
export function nachweisBezugsweg(nachweis: Nachweis): NachweisBezugsweg {
  return nachweis.bezugsweg ?? "upload";
}

/** Ist dieser Nachweis ein Once-Only-Registerabruf (der/die Bürger:in autorisiert statt hochzuladen)? */
export function istRegisterAbruf(nachweis: Nachweis): boolean {
  return nachweisBezugsweg(nachweis) === "register-once-only";
}

// ── Feldregeln (norm-abgeleitete Validierung) ─────────────────────────────────────────────────────
/** Prüft die norm-abgeleiteten `regeln` eines Felds über die (gesamten) Antragsdaten — die erste verletzte Regel
 *  liefert ihre Meldung, sonst `null`. Additiv zu den `FeldDef`-Kurzformen (die `feldFehlerVollstaendig` bündelt). */
export function feldRegelFehler(
  feld: FeldDef,
  daten: Antragsdaten,
  kontext?: RegelKontext,
): string | null {
  for (const regel of feld.regeln ?? []) {
    const fehler = einzelRegelFehler(regel, feld, daten, kontext);
    if (fehler) return fehler;
  }
  return null;
}

function einzelRegelFehler(
  regel: FeldRegel,
  feld: FeldDef,
  daten: Antragsdaten,
  kontext?: RegelKontext,
): string | null {
  // Bedingte Regeln greifen nur, wenn `wenn` erfüllt ist (fehlt `wenn` ⇒ immer).
  if (!evalBedingung(regel.wenn, daten)) return null;
  const wert = getPath(daten, feld.name);
  switch (regel.art) {
    case "pflicht":
      return istBeantwortet(feld, wert)
        ? null
        : (regel.meldung ?? "Pflichtangabe — bitte ausfüllen.");
    case "format": {
      const s = asString(wert).trim();
      if (s === "" || !regel.pattern) return null; // leer/kein Pattern ⇒ keine Format-Prüfung
      try {
        return new RegExp(regel.pattern).test(s)
          ? null
          : (regel.meldung ??
              "Eingabe entspricht nicht dem erwarteten Format.");
      } catch {
        return null; // defektes Pattern darf nicht blockieren
      }
    }
    case "bereich": {
      const n = alsZahl(wert);
      if (n === undefined) return null; // nur nicht-leere Zahlen prüfen (Pflicht ist eine eigene Regel)
      if (regel.min !== undefined && n < regel.min)
        return regel.meldung ?? `Mindestens ${regel.min}.`;
      if (regel.max !== undefined && n > regel.max)
        return regel.meldung ?? `Höchstens ${regel.max}.`;
      return null;
    }
    case "erlaubte-werte": {
      const s = asString(wert).trim();
      if (s === "") return null; // leer ⇒ keine Wertmengen-Prüfung
      const erlaubt = erlaubteWerte(regel, kontext);
      if (erlaubt.length === 0) return null; // keine Menge deklariert ⇒ fail-open
      return erlaubt.some((z) => gleich(wert, z))
        ? null
        : (regel.meldung ?? "Wert ist nicht zulässig.");
    }
    default:
      return null;
  }
}

function erlaubteWerte(
  regel: FeldRegel,
  kontext?: RegelKontext,
): (string | number)[] {
  if (regel.werte && regel.werte.length > 0) return regel.werte;
  if (regel.codelisteRef) {
    const liste = kontext?.codelisten?.[regel.codelisteRef];
    if (liste) return liste.eintraege.map((e) => e.value);
  }
  return [];
}

/** Der VOLLSTÄNDIGE Feldfehler: erst die `FeldDef`-Kurzformen (required/pattern/min/max, gleiche Meldungen wie
 *  bisher), dann die norm-abgeleiteten `regeln`. Die EINE Validierungs-Wahrheit, die der Stepper überall nutzt. */
export function feldFehlerVollstaendig(
  feld: FeldDef,
  daten: Antragsdaten,
  kontext?: RegelKontext,
): string | null {
  return (
    feldFehler(feld, getPath(daten, feld.name)) ??
    feldRegelFehler(feld, daten, kontext)
  );
}

// ── Plausibilitäts-Hinweise (weiche, NICHT sperrende Rückmeldung) ─────────────────────────────────
/** Ein AKTIVER Plausibilitäts-Hinweis eines Felds (Bedingung erfüllt) — für die Anzeige aufbereitet. */
export interface FeldHinweisAktiv {
  text: string;
  ton: "info" | "warn";
  normRef?: NormRef;
}

/** Wertet die `hinweise` eines Felds über die (gesamten) Antragsdaten aus und liefert die AKTIVEN Hinweise (deren
 *  `wenn` erfüllt ist). Rein zusätzlich: Hinweise blockieren NIE (fließen nicht in `feldFehlerVollstaendig`), sie
 *  geben nur frühe, kontextsensitive Rückmeldung. Ein Feld ohne `hinweise` liefert `[]`. */
export function feldHinweise(
  feld: FeldDef,
  daten: Antragsdaten,
): FeldHinweisAktiv[] {
  const out: FeldHinweisAktiv[] = [];
  for (const h of feld.hinweise ?? []) {
    if (!evalBedingung(h.wenn, daten)) continue;
    out.push({
      text: h.text,
      ton: h.ton ?? "info",
      ...(h.normRef ? { normRef: h.normRef } : {}),
    });
  }
  return out;
}

/** Ein Schritt ist gültig, wenn KEIN Feld einen (vollständigen) Fehler meldet — inklusive der `regeln`. */
export function stepGueltigVollstaendig(
  step: StepDef,
  daten: Antragsdaten,
  kontext?: RegelKontext,
): boolean {
  return step.felder.every(
    (f) => feldFehlerVollstaendig(f, daten, kontext) === null,
  );
}

// ── Escape-Hatch-Auflösung: berechne/nachweise ODER Daten-Auswertung (Default) ────────────────────
/** Die EFFEKTIVE Berechnung: `config.berechne` (Escape-Hatch) hat Vorrang; fehlt sie, wertet der Interpreter
 *  `config.tarif` aus. Fehlt beides, gibt es keine Berechnung (`undefined`). Defensiv — ein fehlerhafter
 *  Escape-Hatch darf nicht crashen. */
export function effektiveBerechnung<T = Record<string, unknown>>(
  config: Pick<LeistungConfig<T>, "berechne" | "tarif">,
  daten: T,
): Berechnung | undefined {
  if (config.berechne) {
    try {
      return config.berechne(daten);
    } catch {
      return undefined;
    }
  }
  if (config.tarif) return interpretTarif(config.tarif, daten as Antragsdaten);
  return undefined;
}

/** Die EFFEKTIVEN Nachweise: `config.nachweise` (Escape-Hatch) hat Vorrang; fehlt sie, leitet der Interpreter sie
 *  aus den `codelisten` (belege der gewählten Einträge) ab. Fehlt beides, keine Nachweise (`[]`). */
export function effektiveNachweise<T = Record<string, unknown>>(
  config: Pick<LeistungConfig<T>, "nachweise" | "antrag" | "codelisten">,
  daten: T,
): Nachweis[] {
  if (config.nachweise) {
    try {
      return config.nachweise(daten);
    } catch {
      return [];
    }
  }
  return interpretNachweise(config, daten as Antragsdaten);
}
