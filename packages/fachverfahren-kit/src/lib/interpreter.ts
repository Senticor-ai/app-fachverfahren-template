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
  Codeliste,
  FeldBedingung,
  FeldDef,
  FeldRegel,
  LeistungConfig,
  Nachweis,
  NormRef,
  StepDef,
  Tarif,
} from "../types.js";
import {
  asString,
  feldFehler,
  getPath,
  istBeantwortet,
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

/** Gleichheit typ-tolerant: Boolean gegen Boolean, sonst numerisch wenn beide zu Zahlen werden, sonst String. */
function gleich(a: unknown, b: unknown): boolean {
  if (typeof a === "boolean" || typeof b === "boolean") {
    return alsBool(a) === alsBool(b);
  }
  const na = alsZahl(a);
  const nb = alsZahl(b);
  if (na !== undefined && nb !== undefined) return na === nb;
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
  const begruendung = vollstaendig
    ? anwendbar
        .map((s) => s.label ?? `${s.betrag} ${s.einheit ?? tarif.einheit}`)
        .join("; ")
    : "Noch keine Angaben, die eine Tarif-Staffel bestimmen.";
  return {
    betrag,
    einheit: tarif.einheit,
    label: tarif.label ?? "Gebühr",
    begruendung,
    status: vollstaendig ? "final" : "provisional",
    positionen,
  };
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
