// fachverfahren-kit/components/AntragStepper — der GENERISCHE, geführte Bürger-Antrag.
//
// Abgeleitet 1:1 aus der verifizierten Referenz-UX (Lovable „buerger.anmelden") — gleicher Aufbau/Look/Flow/a11y:
// Stepper-Kopf (mobil kompakt, Desktop inline), Sektion je Schritt, per-Schritt-Validierung (`canStep`),
// LIVE-Berechnung über dem aktuellen Antragsstand, Once-Only-Vorbefüllung, Review + Absenden.
// ABER vollständig CONFIG-GETRIEBEN: keine Domänen-Literale — Schritte/Felder/Berechnung/Register kommen aus
// `config`, die Datenschicht aus `port`. Ein zweites Verfahren (Gewerbe/Parkausweis/Bauantrag) läuft ohne
// jede Änderung an dieser Datei.
import { useId, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Sparkles,
} from "lucide-react";

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
function setPath(obj: Antragsdaten, path: string, value: unknown): Antragsdaten {
  const keys = path.split(".");
  const [head, ...rest] = keys;
  if (head === undefined) return obj;
  if (rest.length === 0) return { ...obj, [head]: value };
  const child = obj[head];
  const childObj = child && typeof child === "object" ? (child as Antragsdaten) : {};
  return { ...obj, [head]: setPath(childObj, rest.join("."), value) };
}

/** Select-/Radix-Werte kommen IMMER als String aus dem DOM. Sind ALLE Options eines Selects numerisch, speichern
 *  wir den Wert als ZAHL — damit die fachliche Subsumtion (numerische Vergleiche/Staffeln, `=== 1`) deterministisch
 *  greift, statt still in den Default zu fallen ("1" === 1 ist false). Enum-Selects (z.B. Geschlecht m/w) bleiben
 *  String. GENERISCH + data-driven aus der Feld-Definition — kein leistungs-spezifischer Sonderfall. */
function coerceFeldwert(feld: FeldDef, v: unknown): unknown {
  if (feld.typ !== "select" || typeof v !== "string" || v === "") return v;
  const opts = feld.options ?? [];
  const allNumerisch = opts.length > 0 && opts.every((o) => o.value.trim() !== "" && !Number.isNaN(Number(o.value)));
  return allNumerisch ? Number(v) : v;
}

/** Feldwert als String (für Inputs) — undefined/null → "". */
function asString(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v);
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
      if (!new RegExp(feld.pattern).test(s)) return "Eingabe entspricht nicht dem erwarteten Format.";
    } catch {
      // Defekte Pattern dürfen den Antrag nicht blockieren.
    }
  }
  if (feld.typ === "number") {
    const n = Number(s);
    if (Number.isNaN(n)) return "Bitte eine Zahl eingeben.";
    if (feld.min !== undefined && n < feld.min) return `Mindestens ${feld.min}.`;
    if (feld.max !== undefined && n > feld.max) return `Höchstens ${feld.max}.`;
  }
  return null;
}

/** Ein Schritt ist gültig, wenn keines seiner Felder einen Fehler meldet. */
function stepGueltig(step: StepDef, daten: Antragsdaten): boolean {
  return step.felder.every((f) => feldFehler(f, getPath(daten, f.name)) === null);
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

  // Pflichtfeld-Markierung erst aktiv, sobald der/die Nutzer:in den Review-Schritt erreicht hat (wie Referenz).
  const showErrors = stepIdx >= reviewIndex;

  const firstInvalidStep = (): number | null => {
    for (let i = 0; i < steps.length; i++) if (!stepGueltig(steps[i]!, daten)) return i;
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
          if (f.name === feld.name || bestehend.length === 0) next = setPath(next, f.name, wert);
        }
      }
      return next;
    });
    setRegisterHinweis("Aus dem Register vorausgefüllt — bitte prüfen und ggf. korrigieren.");
  }

  function submit() {
    const vorgang = port.einreichen(daten as T);
    onDone(vorgang);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-8 md:max-w-3xl lg:max-w-5xl">
      <Stepper steps={steps} stepIdx={stepIdx} setStepIdx={setStepIdx} daten={daten} />

      {config.antrag.einleitung && stepIdx === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">{config.antrag.einleitung}</p>
      )}

      <div className="mt-8 rounded-md border border-border bg-card p-6">
        {/* Fach-Schritte (dynamisch aus config) */}
        {stepIdx < reviewIndex && (
          <Section title={steps[stepIdx]!.titel} sub={steps[stepIdx]!.beschreibung}>
            <form
              autoComplete="on"
              onSubmit={(e) => e.preventDefault()}
              className="grid gap-4 sm:grid-cols-2"
            >
              {steps[stepIdx]!.felder.map((feld) => (
                <FeldRenderer
                  key={feld.name}
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
              <div className="mt-4 flex items-start gap-2 rounded-sm border border-status-info/30 bg-status-info-soft p-3 text-[12px]">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-info" />
                <div>
                  <span className="inline-flex items-center gap-1 rounded-sm border border-status-info/30 bg-status-info-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-status-info">
                    <Sparkles className="h-3 w-3" /> Vorausfüllen
                  </span>
                  <div className="mt-1 text-muted-foreground">{registerHinweis}</div>
                </div>
              </div>
            )}

            {/* LIVE-Berechnung über dem aktuellen Stand — sichtbar, sobald die Funktion ein Ergebnis liefert. */}
            {berechnung && <BerechnungKarte berechnung={berechnung} config={config} live />}
          </Section>
        )}

        {/* Review-Schritt */}
        {stepIdx === reviewIndex && (
          <Section title="Bitte prüfen Sie Ihre Angaben">
            {berechnung && <BerechnungKarte berechnung={berechnung} config={config} />}

            <dl className="mt-6 grid gap-3 text-sm">
              {steps.flatMap((step) =>
                step.felder.map((feld) => {
                  const v = getPath(daten, feld.name);
                  const text = feldAnzeige(feld, v);
                  if (text.length === 0) return null;
                  return <ReviewRow key={feld.name} label={feld.label} value={text} />;
                }),
              )}
            </dl>

            <div className="mt-6 flex items-start gap-2 rounded-sm border border-border bg-background p-3 text-[12px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Mit dem Absenden geht ein <strong>Vorgang</strong> an die zuständige Stelle ({config.kommune}).
              </span>
            </div>
          </Section>
        )}

        {/* Hinweis auf fehlende Pflichtangaben (nur im Review) */}
        {stepIdx === reviewIndex && !allValid && invalidStep !== null && (
          <div className="mt-6 flex items-start justify-between gap-3 rounded-sm border border-status-block/30 bg-status-block-soft p-3 text-[12px] text-foreground">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-block" />
              <span>
                Pflichtangaben fehlen in{" "}
                <strong>
                  Schritt {invalidStep + 1}: {steps[invalidStep]!.titel}
                </strong>
                . Bitte ergänzen, bevor Sie absenden.
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={() => setStepIdx(invalidStep)}>
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
            <Button onClick={() => setStepIdx((s) => Math.min(lastIndex, s + 1))}>
              Weiter
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={!allValid} aria-disabled={!allValid}>
              Antrag absenden
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

// ── Stepper-Kopf (mobil kompakt / Desktop inline) — 1:1 aus der Referenz, data-driven ──────────
function Stepper({
  steps,
  stepIdx,
  setStepIdx,
  daten,
}: {
  steps: StepDef[];
  stepIdx: number;
  setStepIdx: React.Dispatch<React.SetStateAction<number>>;
  daten: Antragsdaten;
}) {
  // Labels: Fach-Schritte + virtueller Review-Schritt am Ende.
  const labels = [...steps.map((s) => s.titel), "Prüfen"];
  const total = labels.length;
  const aktuellUnvollstaendig = stepIdx < steps.length && !stepGueltig(steps[stepIdx]!, daten);

  return (
    <>
      {/* Mobil: kompakter Stepper mit Chevrons */}
      <div className="flex items-center justify-between gap-3 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
          disabled={stepIdx === 0}
          aria-label="Vorheriger Schritt"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <div
            className={cn(
              "text-[11px] uppercase tracking-wide",
              aktuellUnvollstaendig ? "text-status-block" : "text-muted-foreground",
            )}
          >
            Schritt {stepIdx + 1} von {total}
            {aktuellUnvollstaendig && " · unvollständig"}
          </div>
          <div className="truncate text-sm font-semibold text-foreground">{labels[stepIdx]}</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setStepIdx((s) => Math.min(total - 1, s + 1))}
          disabled={stepIdx === total - 1}
          aria-label="Nächster Schritt"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Desktop: voller Inline-Stepper, eine Zeile */}
      <ol className="hidden flex-nowrap items-center gap-x-2 gap-y-1 text-[11px] md:flex">
        {labels.map((label, i) => {
          const active = i === stepIdx;
          const visited = i < stepIdx;
          // Ein besuchter Fach-Schritt ist „invalid", wenn er Pflichtangaben offen lässt.
          const invalid = visited && i < steps.length && !stepGueltig(steps[i]!, daten);
          const done = visited && !invalid;
          return (
            <li key={i} className="flex items-center gap-2 whitespace-nowrap">
              <button
                type="button"
                onClick={() => setStepIdx(i)}
                aria-label={`Zu Schritt ${i + 1}: ${label}`}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : invalid
                      ? "bg-status-block text-primary-foreground"
                      : done
                        ? "bg-status-ok text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-secondary",
                )}
              >
                {invalid ? "!" : done ? <Check className="h-3 w-3" /> : i + 1}
              </button>
              <span
                className={cn(
                  active ? "text-foreground" : invalid ? "text-status-block" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {i < total - 1 && <span className="text-muted-foreground">›</span>}
            </li>
          );
        })}
      </ol>
    </>
  );
}

// ── Ein Feld → passendes shadcn-Element je `typ` ───────────────────────────────────────────────
function FeldRenderer({
  feld,
  wert,
  fehler,
  showErrors,
  onChange,
  onRegisterLookup,
}: {
  feld: FeldDef;
  wert: unknown;
  fehler: string | null;
  showErrors: boolean;
  onChange: (value: unknown) => void;
  onRegisterLookup: (rohwert: string) => void;
}) {
  const id = useId();
  // Fehler erst zeigen, wenn die Prüfungsseite erreicht ODER bereits etwas Ungültiges eingegeben wurde.
  // Pflichtfeld-Fehler nur ab Review; Format-/Wertefehler auch sofort bei Eingabe.
  const hatEingabe = asString(wert).trim().length > 0;
  const istPflichtLeer = !!feld.required && asString(wert).trim().length === 0;
  const sichtbarerFehler = fehler && (showErrors || (hatEingabe && !istPflichtLeer)) ? fehler : null;

  const wide = feld.typ === "textarea";

  return (
    <Field
      htmlFor={id}
      label={feld.label}
      hint={feld.hint}
      wide={wide}
      invalid={!!sichtbarerFehler}
      error={sichtbarerFehler ?? undefined}
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
          <Select {...(s ? { value: s } : {})} onValueChange={(v) => onChange(v)}>
            <SelectTrigger id={id} aria-invalid={invalidAttr}>
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
            />
            {feld.hint && (
              <label htmlFor={id} className="cursor-pointer text-sm text-muted-foreground">
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
          />
        );

      case "plz":
        return (
          <Input
            id={id}
            value={s}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
            onBlur={(e) => onRegisterLookup(e.target.value)}
            inputMode="numeric"
            pattern={feld.pattern ?? "\\d{5}"}
            maxLength={5}
            placeholder={feld.hint}
            required={feld.required}
            autoComplete="postal-code"
            aria-invalid={invalidAttr}
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
    <div className="mt-6 rounded-md border border-border bg-background p-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {live ? "Live-Berechnung · aktueller Stand" : "Ergebnis · Vorschlag"}
          </div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {formatBetrag(berechnung)}{" "}
            <span className="text-sm font-normal text-muted-foreground">{berechnung.label}</span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-sm border border-status-info/30 bg-status-info-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-status-info">
          <Sparkles className="h-3 w-3" /> Vorschlag
        </span>
      </div>

      {berechnung.positionen && berechnung.positionen.length > 0 && (
        <dl className="mt-3 grid gap-1 text-[12px]">
          {berechnung.positionen.map((p, i) => (
            <div key={i} className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">{p.label}</dt>
              <dd className="text-foreground">{formatEuro(p.betrag, berechnung.einheit)}</dd>
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
              className="inline-flex items-center rounded-sm border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground"
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
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(betrag);
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
}: {
  title: string;
  sub?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Field({
  htmlFor,
  label,
  children,
  wide,
  error,
  invalid,
  hint,
}: {
  htmlFor: string;
  label: string;
  children: React.ReactNode;
  wide?: boolean | undefined;
  error?: string | undefined;
  invalid?: boolean | undefined;
  hint?: string | undefined;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <Label
        htmlFor={htmlFor}
        className={cn("text-[12px] font-medium", invalid ? "text-status-block" : "text-muted-foreground")}
      >
        {label}
      </Label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p className="mt-1 text-[11px] text-status-block">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2 last:border-b-0">
      <dt className="text-[12px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm text-foreground">{value}</dd>
    </div>
  );
}
