// fachverfahren-kit/components/AntragStepper — der GENERISCHE, geführte Bürger-Antrag.
//
// Abgeleitet aus etablierten Public-Sector-UX-Mustern für geführte Bürger-Anträge — gleicher Aufbau/Look/Flow/a11y:
// Stepper-Kopf (mobil kompakt, Desktop inline), Sektion je Schritt, per-Schritt-Validierung (`canStep`),
// LIVE-Berechnung über dem aktuellen Antragsstand, Once-Only-Vorbefüllung, Review + Absenden.
// ABER vollständig CONFIG-GETRIEBEN: keine Domänen-Literale — Schritte/Felder/Berechnung/Register kommen aus
// `config`, die Datenschicht aus `port`. Ein zweites Verfahren (z.B. Gewerbe/Parkausweis/Bauantrag) läuft ohne
// jede Änderung an dieser Datei.
import * as React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Sparkles,
} from "lucide-react";

import { ErrorSummary, type FieldError } from "./ErrorSummary.js";
import { useStatusRegion } from "./StatusRegion.js";
import {
  AdressValidierung,
  type AdressTreffer,
  type AdressWert,
} from "./AdressValidierung.js";

import type {
  Berechnung,
  FeldDef,
  LeistungConfig,
  StepDef,
  Vorgang,
  VorgangPort,
} from "../types.js";
import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { Card } from "../ui/card.js";
import { Input } from "../ui/input.js";
import { Textarea } from "../ui/textarea.js";
import { Label } from "../ui/label.js";
import { Checkbox } from "../ui/checkbox.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";

// ── Pfad-Helfer: verschachteltes Antragsdaten-Objekt über "a.b.c"-Feldpfade ──────────────────
type Antragsdaten = Record<string, unknown>;

/** Liest einen Wert aus dem verschachtelten Objekt anhand des Feldpfads (z.B. "person.nachname"). */
function getPath(obj: Antragsdaten, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Antragsdaten)[key];
    return undefined;
  }, obj);
}

/** Setzt einen Wert im verschachtelten Objekt (immutabel) anhand des Feldpfads. */
function setPath(
  obj: Antragsdaten,
  path: string,
  value: unknown,
): Antragsdaten {
  const keys = path.split(".");
  const [head, ...rest] = keys;
  if (head === undefined) return obj;
  if (rest.length === 0) return { ...obj, [head]: value };
  const child = obj[head];
  const childObj =
    child && typeof child === "object" ? (child as Antragsdaten) : {};
  return { ...obj, [head]: setPath(childObj, rest.join("."), value) };
}

/** Select-/Radix-Werte kommen IMMER als String aus dem DOM. Sind ALLE Options eines Selects numerisch, speichern
 *  wir den Wert als ZAHL — damit die fachliche Subsumtion (numerische Vergleiche/Staffeln, `=== 1`) deterministisch
 *  greift, statt still in den Default zu fallen ("1" === 1 ist false). Enum-Selects (z.B. Geschlecht m/w) bleiben
 *  String. GENERISCH + data-driven aus der Feld-Definition — kein leistungs-spezifischer Sonderfall. */
function coerceFeldwert(feld: FeldDef, v: unknown): unknown {
  if (feld.typ !== "select" || typeof v !== "string" || v === "") return v;
  const opts = feld.options ?? [];
  const allNumerisch =
    opts.length > 0 &&
    opts.every((o) => o.value.trim() !== "" && !Number.isNaN(Number(o.value)));
  return allNumerisch ? Number(v) : v;
}

/** Feldwert als String (für Inputs) — undefined/null → "". */
function asString(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

// ── Adress-Validierung (OPTIONAL, generisch) ─────────────────────────────────────────────────────
// Sammelt eine (Teil-)Anschrift aus den Antragsdaten über die GENERISCHEN Adress-Blattnamen strasse/plz/ort
// (irgendwo verschachtelt) — keine Domänen-Annahme. Der Registerabgleich läuft über den vorhandenen
// `lookupRegister`-Port; ein Treffer wird in genau einen strukturellen AdressTreffer übersetzt.

/** Liest das erste Vorkommen eines Blattschlüssels (z.B. "plz") im verschachtelten Datenobjekt. */
function findeBlatt(obj: Antragsdaten, leaf: string): string | undefined {
  for (const [key, value] of Object.entries(obj)) {
    if (
      key === leaf &&
      (typeof value === "string" || typeof value === "number")
    ) {
      return String(value);
    }
    if (value && typeof value === "object") {
      const tiefer = findeBlatt(value as Antragsdaten, leaf);
      if (tiefer !== undefined) return tiefer;
    }
  }
  return undefined;
}

/** Baut den Ausgangs-Adresswert für die AdressValidierung aus den Antragsdaten (best effort, generisch). */
function adressAus(daten: Antragsdaten): AdressWert {
  const wert: AdressWert = {};
  const strasse = findeBlatt(daten, "strasse");
  const plz = findeBlatt(daten, "plz");
  const ort = findeBlatt(daten, "ort");
  if (strasse !== undefined) wert.strasse = strasse;
  if (plz !== undefined) wert.plz = plz;
  if (ort !== undefined) wert.ort = ort;
  return wert;
}

/** Deterministischer Registerabgleich über den Port: ein Treffer mit allen Adressbestandteilen → genau-1-Treffer. */
function adressValidieren<T extends Antragsdaten>(
  port: VorgangPort<T>,
  wert: AdressWert,
): Promise<AdressTreffer[]> {
  const query = [wert.strasse, wert.plz, wert.ort]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  const treffer = query ? port.lookupRegister(query) : undefined;
  if (!treffer) return Promise.resolve([]);
  const strasse = treffer["strasse"] ?? wert.strasse ?? "";
  const plz = treffer["plz"] ?? wert.plz ?? "";
  const ort = treffer["ort"] ?? wert.ort ?? "";
  // Nur als vollständiger amtlicher Treffer melden, wenn alle Bestandteile vorliegen.
  if (!strasse || !plz || !ort) return Promise.resolve([]);
  return Promise.resolve([{ strasse, plz, ort }]);
}

// ── Validierung eines Einzelfelds (required + pattern + min/max) ─────────────────────────────
function feldFehler(feld: FeldDef, wert: unknown): string | null {
  const s = asString(wert).trim();

  if (feld.required) {
    if (feld.typ === "checkbox") {
      if (wert !== true) return "Bitte bestätigen.";
    } else if (s.length === 0) {
      return "Pflichtangabe — bitte ausfüllen.";
    }
  }
  // Leere optionale Felder sind gültig (außer required oben).
  if (s.length === 0) return null;

  if (feld.pattern) {
    try {
      if (!new RegExp(feld.pattern).test(s))
        return "Eingabe entspricht nicht dem erwarteten Format.";
    } catch {
      // Defekte Pattern dürfen den Antrag nicht blockieren.
    }
  }
  if (feld.typ === "number") {
    const n = Number(s);
    if (Number.isNaN(n)) return "Bitte eine Zahl eingeben.";
    if (feld.min !== undefined && n < feld.min)
      return `Mindestens ${feld.min}.`;
    if (feld.max !== undefined && n > feld.max) return `Höchstens ${feld.max}.`;
  }
  return null;
}

/** Ein Schritt ist gültig, wenn keines seiner Felder einen Fehler meldet. */
function stepGueltig(step: StepDef, daten: Antragsdaten): boolean {
  return step.felder.every(
    (f) => feldFehler(f, getPath(daten, f.name)) === null,
  );
}

/** DETERMINISTISCHE Feld-DOM-id (gemeinsame Wahrheit für Control, aria-describedby UND ErrorSummary-Anker).
 *  Aus dem Instanz-Präfix (useId) + dem Feldpfad → eindeutig pro Stepper-Instanz, aber vorhersagbar, damit der
 *  Summary-Anker (#feldId) genau auf das Control zeigt. Punkte/Sonderzeichen → Bindestrich (CSS/HTML-id-tauglich). */
function feldDomId(prefix: string, feldName: string): string {
  return `${prefix}-${feldName}`.replace(/[^a-zA-Z0-9_-]/g, "-");
}

/** Sammelt alle offenen Pflicht-/Format-Fehler eines Schritts als ErrorSummary-Einträge — gleicher Wortlaut wie
 *  inline (feldFehler), gleicher Anker wie das Control (feldDomId). */
function stepFehlerEintraege(
  idPrefix: string,
  step: StepDef,
  daten: Antragsdaten,
): FieldError[] {
  const out: FieldError[] = [];
  for (const f of step.felder) {
    const fehler = feldFehler(f, getPath(daten, f.name));
    if (fehler)
      out.push({
        feldId: feldDomId(idPrefix, f.name),
        text: `${f.label}: ${fehler}`,
      });
  }
  return out;
}

// ── Props ────────────────────────────────────────────────────────────────────────────────────
export interface AntragStepperProps<T extends Antragsdaten = Antragsdaten> {
  config: LeistungConfig<T>;
  port: VorgangPort<T>;
  onDone: (vorgang: Vorgang<T>) => void;
}

/** Der geführte Bürger-Antrag — rendert `config.antrag.steps` dynamisch + Review als letzten Schritt. */
export function AntragStepper<T extends Antragsdaten = Antragsdaten>({
  config,
  port,
  onDone,
}: AntragStepperProps<T>): React.ReactElement {
  const steps = config.antrag.steps;
  const reviewIndex = steps.length; // virtueller Review-Schritt nach allen Fach-Schritten
  const lastIndex = reviewIndex;

  const [stepIdx, setStepIdx] = useState(0);
  const [daten, setDaten] = useState<Antragsdaten>({});
  const [registerHinweis, setRegisterHinweis] = useState<string | null>(null);

  // ── a11y-Fehlerverdrahtung (additiv): ein Instanz-Präfix für deterministische Feld-ids, eine Fehler-Zusammenfassung
  // oben (WCAG-konformes Fehlerzusammenfassungs-Muster, WCAG 3.3.1/3.3.3, BITV 2.0) die bei „Weiter"/„Absenden" den
  // Fokus erhält, plus zentrale Ansage über useStatusRegion. ──
  const idPrefix = useId();
  const summaryRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { announce } = useStatusRegion();

  // Schrittwechsel: Fokus auf die Schritt-Überschrift setzen + Ansage (Spec 4.6 „Schrittwechsel").
  // Beim ersten Render nicht fokussieren (kein Fokus-Klau beim Laden), nur bei tatsächlichem Wechsel.
  const ersterRender = useRef(true);
  useEffect(() => {
    if (ersterRender.current) {
      ersterRender.current = false;
      return;
    }
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => headingRef.current?.focus());
    }
  }, [stepIdx]);

  const setFeld = (path: string, value: unknown) =>
    setDaten((prev) => setPath(prev, path, value));

  // LIVE-Berechnung über dem aktuellen Antragsstand — defensiv (eine fehlerhafte `berechne` darf nicht crashen).
  const berechnung = useMemo<Berechnung | null>(() => {
    try {
      return config.berechne(daten as T);
    } catch {
      return null;
    }
  }, [config, daten]);

  // Pflichtfeld-Markierung (rot) aktiv: am Review-Schritt IMMER — ODER sobald in DIESEM Schritt „Weiter" trotz offener
  // Pflichtangabe versucht wurde. So sieht der/die Nutzer:in die roten Felder genau dann, wenn der Prozess sie blockiert.
  const [versuchteWeiter, setVersuchteWeiter] = useState<Set<number>>(
    () => new Set<number>(),
  );
  const showErrors = stepIdx >= reviewIndex || versuchteWeiter.has(stepIdx);

  // Fehler-Zusammenfassung (oben): leer, solange nicht blockiert wurde. Bei „Weiter"/„Absenden" mit offenen
  // Pflicht-/Format-Angaben gefüllt, Fokus springt hinein (summaryRef), zentrale Ansage über announce.
  const [summaryErrors, setSummaryErrors] = useState<FieldError[]>([]);
  const focusSummary = (errs: FieldError[]): void => {
    setSummaryErrors(errs);
    const anzahl = errs.length;
    announce(
      `${anzahl} ${anzahl === 1 ? "Pflichtangabe fehlt" : "Pflichtangaben fehlen"} — bitte ergänzen.`,
      "assertive",
    );
    // Nach dem Render fokussieren (rAF stellt sicher, dass die Summary im DOM ist).
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => summaryRef.current?.focus());
    }
  };

  // ECHTE PFLICHT-SPERRE (eine Wahrheit, Desktop + Mobil): ist der aktuelle Fach-Schritt unvollständig, NICHT weitergehen
  // — die offenen Pflichtfelder rot markieren statt still durchzuwinken. Sonst zum nächsten Schritt.
  const gehWeiter = (): void => {
    if (stepIdx < steps.length && !stepGueltig(steps[stepIdx]!, daten)) {
      setVersuchteWeiter((prev) => new Set(prev).add(stepIdx));
      focusSummary(stepFehlerEintraege(idPrefix, steps[stepIdx]!, daten));
      return;
    }
    setSummaryErrors([]);
    setStepIdx((s) => Math.min(lastIndex, s + 1));
  };

  const firstInvalidStep = (): number | null => {
    for (let i = 0; i < steps.length; i++)
      if (!stepGueltig(steps[i]!, daten)) return i;
    return null;
  };
  const invalidStep = firstInvalidStep();
  const allValid = invalidStep === null;

  // ── Once-Only: über die ersten editierbaren onceOnly-Felder gegen das Register suchen ────────
  function tryRegisterLookup(feld: FeldDef, rohwert: string) {
    if (!feld.onceOnly) return;
    const q = rohwert.trim();
    if (!q) {
      setRegisterHinweis(null);
      return;
    }
    const treffer = port.lookupRegister(q);
    if (!treffer) {
      setRegisterHinweis(null);
      return;
    }
    // Treffer in die passenden onceOnly-Felder schreiben (Match über das letzte Pfad-Segment).
    setDaten((prev) => {
      let next = prev;
      for (const step of steps) {
        for (const f of step.felder) {
          if (!f.onceOnly) continue;
          const leaf = f.name.split(".").pop()!;
          const wert = treffer[leaf];
          if (wert === undefined) continue;
          const bestehend = asString(getPath(next, f.name));
          // Vorbefüllen, aber bereits Eingegebenes nicht überschreiben (außer das gesuchte Feld selbst).
          if (f.name === feld.name || bestehend.length === 0)
            next = setPath(next, f.name, wert);
        }
      }
      return next;
    });
    setRegisterHinweis(
      "Aus dem Register vorausgefüllt — bitte prüfen und ggf. korrigieren.",
    );
  }

  // Alle offenen Fehler über alle Schritte (für die Review-Zusammenfassung), inkl. Ziel-Schritt je Feld.
  const alleFehlerEintraege = (): {
    errors: FieldError[];
    stepOf: Map<string, number>;
  } => {
    const errors: FieldError[] = [];
    const stepOf = new Map<string, number>();
    for (let i = 0; i < steps.length; i++) {
      for (const e of stepFehlerEintraege(idPrefix, steps[i]!, daten)) {
        errors.push(e);
        stepOf.set(e.feldId, i);
      }
    }
    return { errors, stepOf };
  };

  // Klick in der Zusammenfassung: zuerst zum richtigen Schritt wechseln, dann den Fokus auf das Feld setzen.
  const onSummaryErrorClick = (
    feldId: string,
    event: React.MouseEvent<HTMLAnchorElement>,
  ): void => {
    const ziel = alleFehlerEintraege().stepOf.get(feldId);
    if (ziel !== undefined && ziel !== stepIdx) {
      event.preventDefault();
      setStepIdx(ziel);
      setVersuchteWeiter((prev) => new Set(prev).add(ziel));
    }
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() =>
        document.getElementById(feldId)?.focus(),
      );
    }
  };

  function submit() {
    // PFLICHT-SPERRE auch beim Absenden: offene Angaben sammeln, oben anzeigen, Fokus + Ansage — NICHT einreichen.
    if (!allValid) {
      focusSummary(alleFehlerEintraege().errors);
      return;
    }
    setSummaryErrors([]);
    const vorgang = port.einreichen(daten as T);
    onDone(vorgang);
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-6 py-8 md:max-w-3xl lg:max-w-5xl">
      <Stepper
        steps={steps}
        stepIdx={stepIdx}
        setStepIdx={setStepIdx}
        daten={daten}
        onWeiter={gehWeiter}
      />

      {config.antrag.einleitung && stepIdx === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          {config.antrag.einleitung}
        </p>
      )}

      <Card className="mt-8 p-6 md:p-8">
        {/* Fehler-Zusammenfassung (WCAG-konformes Fehlerzusammenfassungs-Muster, WCAG 3.3.1/3.3.3, BITV 2.0) — oben im
            Formular, erhält bei „Weiter"/„Absenden" den Fokus, verlinkt per Anker auf das jeweilige Feld (gleicher Wortlaut wie inline). */}
        {summaryErrors.length > 0 && (
          <ErrorSummary
            ref={summaryRef}
            errors={summaryErrors}
            onErrorClick={onSummaryErrorClick}
            className="mb-6"
          />
        )}

        {/* Fach-Schritte (dynamisch aus config) */}
        {stepIdx < reviewIndex && (
          <Section
            titleRef={headingRef}
            title={steps[stepIdx]!.titel}
            sub={steps[stepIdx]!.beschreibung}
          >
            <form
              autoComplete="on"
              onSubmit={(e) => e.preventDefault()}
              className="grid gap-4 sm:grid-cols-2"
            >
              {steps[stepIdx]!.felder.map((feld) => (
                <FeldRenderer
                  key={feld.name}
                  id={feldDomId(idPrefix, feld.name)}
                  feld={feld}
                  wert={getPath(daten, feld.name)}
                  fehler={feldFehler(feld, getPath(daten, feld.name))}
                  showErrors={showErrors}
                  onChange={(v) => setFeld(feld.name, coerceFeldwert(feld, v))}
                  onRegisterLookup={(raw) => tryRegisterLookup(feld, raw)}
                />
              ))}
            </form>

            {registerHinweis && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-status-info/30 bg-status-info-soft p-3">
                <Sparkles
                  className="mt-0.5 h-4 w-4 shrink-0 text-status-info"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1 rounded-full border border-status-info/30 bg-status-info-soft px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-status-info">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />{" "}
                    Vorausfüllen
                  </span>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {registerHinweis}
                  </p>
                </div>
              </div>
            )}

            {/* LIVE-Berechnung über dem aktuellen Stand — sichtbar, sobald die Funktion ein Ergebnis liefert. */}
            {berechnung && (
              <BerechnungKarte berechnung={berechnung} config={config} live />
            )}
          </Section>
        )}

        {/* Review-Schritt */}
        {stepIdx === reviewIndex && (
          <Section titleRef={headingRef} title="Bitte prüfen Sie Ihre Angaben">
            {berechnung && (
              <BerechnungKarte berechnung={berechnung} config={config} />
            )}

            <dl className="mt-6 grid gap-0 text-sm">
              {steps.flatMap((step) =>
                step.felder.map((feld) => {
                  const v = getPath(daten, feld.name);
                  const text = feldAnzeige(feld, v);
                  if (text.length === 0) return null;
                  return (
                    <ReviewRow
                      key={feld.name}
                      label={feld.label}
                      value={text}
                    />
                  );
                }),
              )}
            </dl>

            {/* OPTIONAL (nur wenn config.adressValidierung.enabled): deterministischer Melderegister-Abgleich
                der erfassten Anschrift VOR dem Absenden — additiv, ohne den bestehenden Flow zu ändern. */}
            {config.adressValidierung?.enabled ? (
              <div className="mt-6">
                <AdressValidierung
                  wert={adressAus(daten)}
                  onValidieren={(w) => adressValidieren(port, w)}
                />
              </div>
            ) : null}

            <div className="mt-6 flex items-start gap-2 rounded-md border border-border bg-surface-2 p-3 text-sm text-muted-foreground">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Mit dem Absenden geht ein <strong>Vorgang</strong> an die
                zuständige Stelle ({config.kommune}).
              </span>
            </div>
          </Section>
        )}

        {/* Hinweis auf fehlende Pflichtangaben (nur im Review) */}
        {stepIdx === reviewIndex && !allValid && invalidStep !== null && (
          <div className="mt-6 flex items-start justify-between gap-3 rounded-md border border-status-block/30 bg-status-block-soft p-3 text-sm text-foreground">
            <div className="flex items-start gap-2">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-status-block"
                aria-hidden="true"
              />
              <span>
                Pflichtangaben fehlen in{" "}
                <strong>
                  Schritt {invalidStep + 1}: {steps[invalidStep]!.titel}
                </strong>
                . Bitte ergänzen, bevor Sie absenden.
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setStepIdx(invalidStep)}
            >
              Zu Schritt {invalidStep + 1}
            </Button>
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
          <Button
            variant="ghost"
            onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
            disabled={stepIdx === 0}
          >
            <ChevronLeft className="h-4 w-4" />
            Zurück
          </Button>
          {stepIdx < lastIndex ? (
            <Button
              onClick={gehWeiter}
              aria-disabled={
                stepIdx < steps.length && !stepGueltig(steps[stepIdx]!, daten)
              }
            >
              Weiter
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={!allValid}
              aria-disabled={!allValid}
            >
              Antrag absenden
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>
    </section>
  );
}

// ── Stepper-Kopf (responsiv, überlauf-frei) — Muster nach Spec 4.6 (KERN – Deutschlands Design-System
// für die öffentliche Verwaltung / EU Europa Component Library (ECL)) ───────────
// Progressive Enhancement: der textliche Zähler (A) + der dünne Fortschrittsbalken (B) rendern IMMER
// und passen in jeden Container; der horizontale Segment-Pfad (C) erscheint nur ab genügender Breite
// und kann durch `flex-wrap` + `truncate` selbst dann nicht horizontal überlaufen. Data-driven, token-only.
function Stepper({
  steps,
  stepIdx,
  setStepIdx,
  daten,
  onWeiter,
}: {
  steps: StepDef[];
  stepIdx: number;
  setStepIdx: React.Dispatch<React.SetStateAction<number>>;
  daten: Antragsdaten;
  onWeiter?: () => void; // gemeinsame Pflicht-Sperre (eine Wahrheit): blockt an leeren Pflichtfeldern, markiert rot
}) {
  // Labels: Fach-Schritte + virtueller Review-Schritt am Ende.
  const labels = [...steps.map((s) => s.titel), "Prüfen"];
  const total = labels.length;
  const aktuellUnvollstaendig =
    stepIdx < steps.length && !stepGueltig(steps[stepIdx]!, daten);
  const aktuellerName = labels[stepIdx] ?? "";
  const fortschritt = Math.round(((stepIdx + 1) / total) * 100);

  return (
    <div className="flex flex-col gap-3">
      {/* A. Robuster Kern: Zähler + Name + kompakte Navigation (funktioniert ohne den Pfad). */}
      <div className="flex items-center justify-between gap-3">
        {/* Mobile-Zurück (auf ≥ md ausgeblendet — dort trägt der Segment-Pfad die Navigation). */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
          disabled={stepIdx === 0}
          aria-label="Vorheriger Schritt"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
          Schritt <span className="tabular-nums">{stepIdx + 1}</span> von{" "}
          <span className="tabular-nums">{total}</span>
          <span className="text-muted-foreground"> — </span>
          <span className="truncate">{aktuellerName}</span>
          {aktuellUnvollstaendig && (
            <span className="ml-2 text-xs font-medium text-status-block">
              · unvollständig
            </span>
          )}
        </p>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() =>
            onWeiter
              ? onWeiter()
              : setStepIdx((s) => Math.min(total - 1, s + 1))
          }
          disabled={stepIdx === total - 1}
          aria-label="Nächster Schritt"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Live-Region: sagt den Schrittwechsel für Screenreader an (Spec 4.6 A). */}
      <p className="sr-only" aria-live="polite">
        Schritt {stepIdx + 1} von {total}, {aktuellerName}
        {aktuellUnvollstaendig ? ", unvollständig" : ", aktuell"}
      </p>

      {/* B. Dünner Fortschrittsbalken — immer sichtbar, läuft nie über. */}
      <div
        role="progressbar"
        aria-valuenow={stepIdx + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Fortschritt: Schritt ${stepIdx + 1} von ${total}`}
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out motion-reduce:transition-none"
          style={{ width: `${fortschritt}%` }}
        />
      </div>

      {/* C. Horizontaler Segment-Pfad — nur ab md, mit garantiertem Nicht-Überlauf (flex-wrap + truncate). */}
      <ol className="hidden flex-wrap items-center gap-x-2 gap-y-2 md:flex">
        {labels.map((label, i) => {
          const active = i === stepIdx;
          const visited = i < stepIdx;
          // Ein besuchter Fach-Schritt ist „invalid", wenn er Pflichtangaben offen lässt.
          const invalid =
            visited && i < steps.length && !stepGueltig(steps[i]!, daten);
          const done = visited && !invalid;
          const zustand = active
            ? "aktueller Schritt"
            : invalid
              ? "unvollständig"
              : done
                ? "abgeschlossen"
                : "offen";
          return (
            <li key={i} className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setStepIdx(i)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full py-0.5 pr-1",
                  "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  "transition-colors duration-150 ease-out motion-reduce:transition-none",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    "transition-colors duration-150 ease-out motion-reduce:transition-none",
                    active
                      ? "bg-primary text-primary-foreground"
                      : invalid
                        ? "bg-status-block text-primary-foreground"
                        : done
                          ? "bg-status-ok text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                  )}
                >
                  {invalid ? (
                    "!"
                  ) : done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    "max-w-[12ch] truncate text-xs font-medium",
                    active
                      ? "text-foreground"
                      : invalid
                        ? "text-status-block"
                        : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
                <span className="sr-only">
                  {`Zu Schritt ${i + 1}: ${label}, ${zustand}`}
                </span>
              </button>
              {i < total - 1 && (
                <ChevronRight
                  aria-hidden="true"
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── Ein Feld → passendes shadcn-Element je `typ` ───────────────────────────────────────────────
function FeldRenderer({
  id: idProp,
  feld,
  wert,
  fehler,
  showErrors,
  onChange,
  onRegisterLookup,
}: {
  /** DETERMINISTISCHE Control-id (= ErrorSummary-Anker). Optional: fällt auf useId() zurück (Abwärtskompatibilität). */
  id?: string | undefined;
  feld: FeldDef;
  wert: unknown;
  fehler: string | null;
  showErrors: boolean;
  onChange: (value: unknown) => void;
  onRegisterLookup: (rohwert: string) => void;
}) {
  const fallbackId = useId();
  const id = idProp ?? fallbackId;
  // Fehler erst zeigen, wenn die Prüfungsseite erreicht ODER bereits etwas Ungültiges eingegeben wurde.
  // Pflichtfeld-Fehler nur ab Review; Format-/Wertefehler auch sofort bei Eingabe.
  const hatEingabe = asString(wert).trim().length > 0;
  const istPflichtLeer = !!feld.required && asString(wert).trim().length === 0;
  const sichtbarerFehler =
    fehler && (showErrors || (hatEingabe && !istPflichtLeer)) ? fehler : null;

  const wide = feld.typ === "textarea";
  // ids für aria-describedby: Fehlertext UND/ODER Hinweis ans Control koppeln (Screenreader liest beide vor).
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy =
    [sichtbarerFehler ? errorId : null, feld.hint ? hintId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <Field
      htmlFor={id}
      label={feld.label}
      required={feld.required}
      hint={feld.hint}
      wide={wide}
      invalid={!!sichtbarerFehler}
      error={sichtbarerFehler ?? undefined}
      errorId={errorId}
      hintId={hintId}
    >
      {renderControl()}
    </Field>
  );

  function renderControl(): React.ReactElement {
    const s = asString(wert);
    const invalidAttr = !!sichtbarerFehler;

    switch (feld.typ) {
      case "select":
        return (
          <Select
            {...(s ? { value: s } : {})}
            onValueChange={(v) => onChange(v)}
          >
            <SelectTrigger
              id={id}
              aria-invalid={invalidAttr}
              aria-describedby={describedBy}
            >
              <SelectValue placeholder={feld.hint ?? "Bitte auswählen"} />
            </SelectTrigger>
            <SelectContent>
              {(feld.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "checkbox":
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              id={id}
              checked={wert === true}
              onCheckedChange={(c) => onChange(c === true)}
              aria-invalid={invalidAttr}
              aria-describedby={describedBy}
            />
            {feld.hint && (
              <label
                htmlFor={id}
                className="cursor-pointer text-sm text-muted-foreground"
              >
                {feld.hint}
              </label>
            )}
          </div>
        );

      case "textarea":
        return (
          <Textarea
            id={id}
            value={s}
            onChange={(e) => onChange(e.target.value)}
            placeholder={feld.hint}
            required={feld.required}
            aria-invalid={invalidAttr}
            aria-describedby={describedBy}
          />
        );

      case "plz":
        return (
          <Input
            id={id}
            value={s}
            onChange={(e) =>
              onChange(e.target.value.replace(/\D/g, "").slice(0, 5))
            }
            onBlur={(e) => onRegisterLookup(e.target.value)}
            inputMode="numeric"
            pattern={feld.pattern ?? "\\d{5}"}
            maxLength={5}
            placeholder={feld.hint}
            required={feld.required}
            autoComplete="postal-code"
            aria-invalid={invalidAttr}
            aria-describedby={describedBy}
          />
        );

      case "number":
        return (
          <Input
            id={id}
            type="number"
            value={s}
            onChange={(e) => onChange(e.target.value)}
            min={feld.min}
            max={feld.max}
            placeholder={feld.hint}
            required={feld.required}
            inputMode="numeric"
            aria-invalid={invalidAttr}
            aria-describedby={describedBy}
          />
        );

      case "date":
        return (
          <Input
            id={id}
            type="date"
            value={s}
            onChange={(e) => onChange(e.target.value)}
            required={feld.required}
            aria-invalid={invalidAttr}
            aria-describedby={describedBy}
          />
        );

      case "email":
        return (
          <Input
            id={id}
            type="email"
            value={s}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onRegisterLookup(e.target.value)}
            placeholder={feld.hint}
            required={feld.required}
            autoComplete="email"
            aria-invalid={invalidAttr}
            aria-describedby={describedBy}
          />
        );

      case "tel":
        return (
          <Input
            id={id}
            type="tel"
            value={s}
            onChange={(e) => onChange(e.target.value)}
            placeholder={feld.hint}
            required={feld.required}
            autoComplete="tel"
            inputMode="tel"
            aria-invalid={invalidAttr}
            aria-describedby={describedBy}
          />
        );

      case "text":
      default:
        return (
          <Input
            id={id}
            value={s}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onRegisterLookup(e.target.value)}
            placeholder={feld.hint}
            required={feld.required}
            aria-invalid={invalidAttr}
            aria-describedby={describedBy}
          />
        );
    }
  }
}

// ── Berechnungs-Karte (LIVE-Stand + Begründung) — Tokens statt Domänen-Texte ──────────────────
function BerechnungKarte<T extends Antragsdaten>({
  berechnung,
  config,
  live,
}: {
  berechnung: Berechnung;
  config: LeistungConfig<T>;
  live?: boolean | undefined;
}) {
  return (
    // Zweite Ebene (Spec 4.2): bg-surface-2 + Border + rounded-md, KEIN eigener Schatten
    // (Elevation trägt nur die äußere Card).
    <div className="mt-6 rounded-md border border-border bg-surface-2 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {live
              ? "Live-Berechnung · aktueller Stand"
              : "Ergebnis · Vorschlag"}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatBetrag(berechnung)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {berechnung.label}
            </span>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-status-info/30 bg-status-info-soft px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-status-info">
          <Sparkles className="h-3 w-3" aria-hidden="true" /> Vorschlag
        </span>
      </div>

      {berechnung.positionen && berechnung.positionen.length > 0 && (
        <dl className="mt-3 grid gap-1 text-sm">
          {berechnung.positionen.map((p, i) => (
            <div key={i} className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">{p.label}</dt>
              <dd className="tabular-nums text-foreground">
                {formatEuro(p.betrag, berechnung.einheit)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-3 text-sm text-foreground">{berechnung.begruendung}</p>

      {config.rechtsgrundlagen.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {config.rechtsgrundlagen.map((r) => (
            <span
              key={r.norm}
              className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
              title={r.titel}
            >
              {r.norm}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Anzeige-Helfer ─────────────────────────────────────────────────────────────────────────────
/** Betrag inkl. Einheit formatieren (generisch: Euro-Einheiten als Währung, sonst Zahl + Einheit). */
function formatBetrag(b: Berechnung): string {
  return formatEuro(b.betrag, b.einheit);
}
function formatEuro(betrag: number, einheit: string): string {
  if (/eur/i.test(einheit)) {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(betrag);
  }
  return `${betrag} ${einheit}`.trim();
}

/** Feldwert für die Review-Anzeige aufbereiten (Select → Options-Label, Checkbox → ja/—). */
function feldAnzeige(feld: FeldDef, wert: unknown): string {
  if (feld.typ === "checkbox") return wert === true ? "Ja" : "";
  const s = asString(wert).trim();
  if (s.length === 0) return "";
  if (feld.typ === "select") {
    return feld.options?.find((o) => o.value === s)?.label ?? s;
  }
  return s;
}

// ── Layout-Bausteine (1:1 aus der Referenz, generisch) ─────────────────────────────────────────
function Section({
  title,
  sub,
  children,
  titleRef,
}: {
  title: string;
  sub?: string | undefined;
  children: React.ReactNode;
  /** Fokus-Ziel beim Schrittwechsel (Spec 4.6). Optional (abwärtskompatibel). */
  titleRef?: React.Ref<HTMLHeadingElement> | undefined;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2
          ref={titleRef}
          tabIndex={-1}
          className="rounded-sm text-lg font-semibold text-foreground outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]"
        >
          {title}
        </h2>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Field({
  htmlFor,
  label,
  required,
  children,
  wide,
  error,
  invalid,
  hint,
  errorId,
  hintId,
}: {
  htmlFor: string;
  label: string;
  /** Pflichtfeld → sichtbarer „*"-Marker am Label (a11y: aria-hidden + sr-only „Pflichtfeld"). */
  required?: boolean | undefined;
  children: React.ReactNode;
  wide?: boolean | undefined;
  error?: string | undefined;
  invalid?: boolean | undefined;
  hint?: string | undefined;
  /** id des Fehlertexts (für aria-describedby des Controls). Optional. */
  errorId?: string | undefined;
  /** id des Hinweistexts (für aria-describedby des Controls). Optional. */
  hintId?: string | undefined;
}) {
  return (
    <div className={cn("flex flex-col gap-2", wide ? "sm:col-span-2" : "")}>
      {/* Feld-Label = primäre Information: volle Tinte, 14px (Spec 2). Bei Fehler destructive statt muted. */}
      <Label
        htmlFor={htmlFor}
        className={cn(invalid ? "text-destructive" : "text-foreground")}
      >
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="ml-1 text-destructive">
              *
            </span>
            <span className="sr-only"> (Pflichtfeld)</span>
          </>
        ) : null}
      </Label>
      {children}
      {error ? (
        // Fehler == Label == Hilfetext (14px): Signal über Farbe + Gewicht + Warn-Icon + sr-only-Präfix,
        // NIE über Größe. Geteilte Utility `.fv-text-error` (identisch zur ErrorSummary — nie divergent).
        <p
          id={errorId}
          role="alert"
          className="fv-text-error flex items-start gap-1.5"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            <span className="sr-only">Fehler: </span>
            {error}
          </span>
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}
