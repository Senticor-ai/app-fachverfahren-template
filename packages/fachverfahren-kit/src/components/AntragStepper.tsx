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
  Paperclip,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { ErrorSummary, type FieldError } from "./ErrorSummary.js";
import { useStatusRegion } from "./StatusRegion.js";
import { DateiUpload } from "./DateiUpload.js";
import { DokumentExtraktion } from "./DokumentExtraktion.js";
import {
  AdressValidierung,
  type AdressTreffer,
  type AdressWert,
} from "./AdressValidierung.js";

import type {
  Berechnung,
  CodelistenMarkierung,
  FeldDef,
  LeistungConfig,
  StepDef,
  Vorgang,
  VorgangPort,
} from "../types.js";
import {
  asString,
  feldAnzeige,
  feldHint,
  feldLabel,
  getPath,
  istDateiWert,
  resolveSteps,
  setPath,
  typisiereAntragsdaten,
  type Antragsdaten,
  type DateiWert,
} from "../lib/antrag-felder.js";
import {
  abgeleiteteFelder,
  effektiveBerechnung,
  effektiveNachweise,
  feldFehlerVollstaendig,
  feldHinweise,
  sichtbareSchritte,
  stepGueltigVollstaendig,
  type RegelKontext,
} from "../lib/interpreter.js";
import {
  extraktionsZielFelder,
  type DokumentExtraktionPort,
} from "../lib/dokument-extraktion.js";
import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { Card } from "../ui/card.js";
import { Input } from "../ui/input.js";
import { Textarea } from "../ui/textarea.js";
import { Label } from "../ui/label.js";
import { Checkbox } from "../ui/checkbox.js";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";
import {
  formatBetrag as formatBetragKit,
  formatDateiGroesse,
} from "../format.js";

// ── Feldwert-Logik (Pfad-Zugriff, Typisierung je FeldTyp, Validierung, Anzeige) ist die EINE, pur getestete
// Wahrheit in ../lib/antrag-felder — dieser Stepper RENDERT nur und delegiert jede fachliche Entscheidung dorthin.

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
  kontext: RegelKontext,
): FieldError[] {
  const out: FieldError[] = [];
  for (const f of step.felder) {
    const fehler = feldFehlerVollstaendig(f, daten, kontext);
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
  /** OPTIONAL: ein Dokument-Extraktions-PORT (KI/OCR). Ist er gesetzt, erscheint im ersten Schritt der
   *  DokumentExtraktion-Assistent (Upload → Vorschläge → Bestätigung → Feld befüllt). Fehlt er, ist der
   *  Antrag exakt wie bisher — rein additiv, vendor-neutral (Stub im Kit, echte Bindung in PROD). */
  extraktionPort?: DokumentExtraktionPort | undefined;
  /** M2 — LEICHTE SPRACHE aktiv: rendert je Feld die `leichteSprache`-Fassung des Labels + `hintEinfach` (falls
   *  gesetzt). Kontrolliert von der App (z. B. via LanguageSwitch). Default `false` = reguläre Bürger-Sprache. */
  leichteSprache?: boolean | undefined;
  /** M2 — FACHBEGRIFFE zeigen (Sachbearbeiter-/Prüf-Sicht): blendet je Feld die `labelFachlich`-Amtsbezeichnung als
   *  Zusatz ein. Default `false` = reine Bürger-Sicht (keine §/Fachkürzel). */
  zeigeFachbegriffe?: boolean | undefined;
}

/** Der geführte Bürger-Antrag — rendert `config.antrag.steps` dynamisch + Review als letzten Schritt. */
export function AntragStepper<T extends Antragsdaten = Antragsdaten>({
  config,
  port,
  onDone,
  extraktionPort,
  leichteSprache = false,
  zeigeFachbegriffe = false,
}: AntragStepperProps<T>): React.ReactElement {
  // Auswahl-Optionen einmalig auflösen: Felder mit `optionsRef` ziehen ihre Optionen aus `config.datenlisten` ODER
  // `config.codelisten` (data-driven, z. B. eine Rassenliste) — ab hier lesen ALLE Funktionen nur noch
  // `feld.options`. Eine Wahrheit. `steps` ist die VOLLE (aufgelöste) Menge; die progressive-disclosure-Filterung
  // (M3) erfolgt darunter über `sichtbareSteps`.
  const steps = useMemo(
    () =>
      resolveSteps(config.antrag.steps, config.datenlisten, config.codelisten),
    [config],
  );

  // Extrahierbare Zielfelder (data-driven aus den Schritten) — nur relevant, wenn ein `extraktionPort` gesetzt ist.
  const zielFelder = useMemo(() => extraktionsZielFelder(steps), [steps]);

  const [stepIdx, setStepIdx] = useState(0);
  const [daten, setDaten] = useState<Antragsdaten>({});
  const [registerHinweis, setRegisterHinweis] = useState<string | null>(null);
  // Angehängte Nachweis-Dateien (aus dem config.nachweise()-Upload im Review) — je Nachweis-Id. In PROD nimmt der
  // Port die Datei entgegen; hier halten wir die Referenz, damit der Fluss vollständig klickbar ist.
  const nachweisDateien = useRef<Record<string, DateiWert | null>>({});

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

  // Antragsdaten an der EINEN Naht TYPISIEREN (je FeldTyp: Zahl/Boolean/String) — bevor sie in die fachliche Logik
  // gehen. So subsumiert `berechne` über echte Zahlen (Staffel `=== 1` greift) statt über DOM-Strings ("1" === 1 = false).
  const typisierteDaten = useMemo(
    () => typisiereAntragsdaten(steps, daten),
    [steps, daten],
  );

  // M1 — ABGELEITETE Felder (Codelisten-Merkmal → Antragsfeld) VOR Berechnung/Sichtbarkeit anwenden. `effektiveDaten`
  // ist die WIRKSAME Wahrheit (typisiert + abgeleitet), auf der Sichtbarkeit, Berechnung, Nachweise, Validierung und
  // das Absenden beruhen. Der rohe `daten`-Buffer bleibt die Quelle der EDITIERBAREN Eingaben (kein Feld-Springen).
  const effektiveDaten = useMemo(
    () => abgeleiteteFelder(config, typisierteDaten),
    [config, typisierteDaten],
  );

  // M3 — SICHTBARE Schritte/Felder (progressive disclosure): der `rolle: "kontext"`-Schritt (Vorgangsart) zuerst,
  // danach materialisieren die von `sichtbarWenn` abhängigen Schritte/Felder. Ohne diese Signale = volle Menge in
  // Originalreihenfolge (rückwärtskompatibel).
  const sichtbareSteps = useMemo(
    () => sichtbareSchritte(steps, effektiveDaten),
    [steps, effektiveDaten],
  );
  const reviewIndex = sichtbareSteps.length; // virtueller Review-Schritt nach allen sichtbaren Fach-Schritten
  const lastIndex = reviewIndex;

  // LIVE-Berechnung über dem wirksamen (typisiert + abgeleitet) Antragsstand. EFFEKTIV: `config.berechne`
  // (Escape-Hatch) hat Vorrang, sonst wertet der reine Interpreter `config.tarif` aus. Defensiv.
  const berechnung = useMemo<Berechnung | null>(
    () => effektiveBerechnung(config, effektiveDaten as T) ?? null,
    [config, effektiveDaten],
  );

  // Erforderliche Nachweise aus dem wirksamen Stand ableiten (data-driven, je Tatbestand): `config.nachweise`
  // (Escape-Hatch) hat Vorrang, sonst leitet der Interpreter sie aus den `config.codelisten` (belege der gewählten
  // Einträge) ab. Erscheint als Upload/Register-Autorisierung im Review, sobald die Auswahl Nachweise fordert.
  const nachweise = useMemo(
    () => effektiveNachweise(config, effektiveDaten as T),
    [config, effektiveDaten],
  );

  // M3 — wenn ein zuvor sichtbarer Schritt durch geänderte Angaben verschwindet, den Cursor in den gültigen
  // Bereich zurückholen (nie über den Review-Schritt hinaus zeigen).
  useEffect(() => {
    if (stepIdx > reviewIndex) setStepIdx(reviewIndex);
  }, [reviewIndex, stepIdx]);

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
    if (
      stepIdx < sichtbareSteps.length &&
      !stepGueltigVollstaendig(sichtbareSteps[stepIdx]!, effektiveDaten, config)
    ) {
      setVersuchteWeiter((prev) => new Set(prev).add(stepIdx));
      focusSummary(
        stepFehlerEintraege(
          idPrefix,
          sichtbareSteps[stepIdx]!,
          effektiveDaten,
          config,
        ),
      );
      return;
    }
    setSummaryErrors([]);
    setStepIdx((s) => Math.min(lastIndex, s + 1));
  };

  const firstInvalidStep = (): number | null => {
    for (let i = 0; i < sichtbareSteps.length; i++)
      if (!stepGueltigVollstaendig(sichtbareSteps[i]!, effektiveDaten, config))
        return i;
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
    for (let i = 0; i < sichtbareSteps.length; i++) {
      for (const e of stepFehlerEintraege(
        idPrefix,
        sichtbareSteps[i]!,
        effektiveDaten,
        config,
      )) {
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
    // WIRKSAM einreichen (typisiert + M1-abgeleitet) — der Port/das Backend erhält fachlich korrekte, konsistente
    // Werte inkl. der abgeleiteten Felder (der Store leitet defensiv nochmals ab; die Ableitung ist idempotent).
    // Die tatsächlich hochgeladenen Nachweis-Dateien (keyed by Nachweis-Id) MIT einreichen — sonst verpuffen sie und der
    // Sachbearbeiter sieht für jeden Nachweis „Fehlt" (Wurzel-Fix „Upload landet nicht beim Sachbearbeiter").
    const vorgang = port.einreichen(effektiveDaten as T, nachweisDateien.current);
    onDone(vorgang);
  }

  return (
    <section className="mx-auto w-full max-w-2xl px-6 py-8 md:max-w-3xl lg:max-w-5xl">
      <Stepper
        steps={sichtbareSteps}
        stepIdx={stepIdx}
        setStepIdx={setStepIdx}
        daten={effektiveDaten}
        kontext={config}
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

        {/* Fach-Schritte (dynamisch aus config, M3-gefiltert/geordnet) */}
        {stepIdx < reviewIndex && (
          <Section
            titleRef={headingRef}
            title={sichtbareSteps[stepIdx]!.titel}
            sub={sichtbareSteps[stepIdx]!.beschreibung}
          >
            {/* OPTIONAL (nur wenn ein extraktionPort gesetzt ist): KI-/OCR-Assistent im ERSTEN Schritt —
                Dokument hochladen → Feld-Vorschläge mit Konfidenz → bestätigen/korrigieren → Feld befüllt.
                Rein additiv; fehlt der Port, ist der Antrag unverändert. */}
            {stepIdx === 0 && extraktionPort && zielFelder.length > 0 ? (
              <DokumentExtraktion
                zielFelder={zielFelder}
                port={extraktionPort}
                onUebernehmen={(feldName, wert) => setFeld(feldName, wert)}
                className="mb-6"
              />
            ) : null}

            <form
              autoComplete="on"
              onSubmit={(e) => e.preventDefault()}
              className="grid gap-4 sm:grid-cols-2"
            >
              {sichtbareSteps[stepIdx]!.felder.map((feld) => (
                <FeldRenderer
                  key={feld.name}
                  id={feldDomId(idPrefix, feld.name)}
                  feld={feld}
                  // M1 — abgeleitete Felder zeigen ihren WIRKSAMEN (abgeleiteten) Wert read-only; editierbare Felder
                  // spiegeln den rohen Eingabe-Buffer (kein Feld-Springen beim Tippen).
                  wert={getPath(
                    feld.abgeleitet ? effektiveDaten : daten,
                    feld.name,
                  )}
                  daten={effektiveDaten}
                  // Abgeleitete Felder sind read-only und werden nicht validiert (der Wert wird automatisch gesetzt).
                  fehler={
                    feld.abgeleitet
                      ? null
                      : feldFehlerVollstaendig(feld, effektiveDaten, config)
                  }
                  showErrors={showErrors}
                  leicht={leichteSprache}
                  zeigeFachbegriff={zeigeFachbegriffe}
                  onChange={(v) => setFeld(feld.name, v)}
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
              {sichtbareSteps.flatMap((step) =>
                step.felder.map((feld) => {
                  const v = getPath(effektiveDaten, feld.name);
                  const text = feldAnzeige(feld, v);
                  if (text.length === 0) return null;
                  return (
                    <ReviewRow
                      key={feld.name}
                      label={feldLabel(feld, { leicht: leichteSprache })}
                      labelFachlich={
                        zeigeFachbegriffe ? feld.labelFachlich : undefined
                      }
                      value={text}
                    />
                  );
                }),
              )}
            </dl>

            {/* Erforderliche Nachweise (data-driven aus `config.nachweise(daten)`): erscheinen je nach gewähltem
                Tatbestand als Upload — VOR dem Absenden. Nur sichtbar, wenn der aktuelle Stand Nachweise fordert.
                Der/die Bürger:in hängt die Datei an; der Port nimmt sie in PROD entgegen. */}
            {nachweise.length > 0 ? (
              <div className="mt-6">
                <DateiUpload
                  nachweise={nachweise}
                  titel="Erforderliche Nachweise"
                  onChange={(id, datei) => {
                    nachweisDateien.current[id] = datei;
                  }}
                />
              </div>
            ) : null}

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
                  Schritt {invalidStep + 1}:{" "}
                  {sichtbareSteps[invalidStep]!.titel}
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
                stepIdx < sichtbareSteps.length &&
                !stepGueltigVollstaendig(
                  sichtbareSteps[stepIdx]!,
                  effektiveDaten,
                  config,
                )
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
  kontext,
  onWeiter,
}: {
  steps: StepDef[];
  stepIdx: number;
  setStepIdx: React.Dispatch<React.SetStateAction<number>>;
  daten: Antragsdaten;
  kontext: RegelKontext; // Codelisten für regelbasierte Gültigkeit (gleiche Wahrheit wie die echte Pflicht-Sperre)
  onWeiter?: () => void; // gemeinsame Pflicht-Sperre (eine Wahrheit): blockt an leeren Pflichtfeldern, markiert rot
}) {
  // Labels: Fach-Schritte + virtueller Review-Schritt am Ende.
  const labels = [...steps.map((s) => s.titel), "Prüfen"];
  const total = labels.length;
  const aktuellUnvollstaendig =
    stepIdx < steps.length &&
    !stepGueltigVollstaendig(steps[stepIdx]!, daten, kontext);
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

        <h1 className="min-w-0 flex-1 text-sm font-medium text-foreground">
          Schritt <span className="tabular-nums">{stepIdx + 1}</span> von{" "}
          <span className="tabular-nums">{total}</span>
          <span className="text-muted-foreground"> — </span>
          <span className="truncate">{aktuellerName}</span>
          {aktuellUnvollstaendig && (
            <>
              {" "}
              <span className="ml-2 text-xs font-medium text-status-block">
                · unvollständig
              </span>
            </>
          )}
        </h1>

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
          className="h-full rounded-full bg-primary transition-[width] ease-out motion-reduce:transition-none"
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
            visited &&
            i < steps.length &&
            !stepGueltigVollstaendig(steps[i]!, daten, kontext);
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
                  // KEIN Pill/Oval-Container mehr (früher .ps-form-stepper__crumb + rounded-full = „schwebendes weißes
                  // Oval" hinter Nummer+Label): nur Fokus-Radius + dezente Text-Reaktion. Nummernkreis, Label und der
                  // eingefärbte Konnektor tragen die Information — ruhiger, moderner Fortschritts-Pfad (EINE Wahrheit
                  // mit dem Stepper-Primitiv). Kein `ps-form-stepper__crumb` mehr → keine gemeinsame Chip-Pille.
                  "group flex min-w-0 items-center gap-2 rounded-md py-1",
                  "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                  "transition-colors ease-out motion-reduce:transition-none",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    // tabular-nums + leading-none: die Ziffer optisch exakt in der Kreis-Mitte (Inter setzt „1" sonst
                    // leicht links/tief; Tabellenziffern zentrieren in ihrer Laufweite, leading-none nimmt den Zeilen-Offset).
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold leading-none tabular-nums",
                    "transition-colors ease-out motion-reduce:transition-none",
                    active
                      ? // aktueller Schritt: gefüllt + dezenter Halo (ring) statt Pill-Fläche
                        "border-transparent bg-primary text-primary-foreground ring-2 ring-primary/25 ring-offset-2 ring-offset-background"
                      : invalid
                        ? "border-transparent bg-status-block text-primary-foreground"
                        : done
                          ? "border-transparent bg-status-ok text-primary-foreground"
                          : // offener Schritt: OUTLINE (transparent + dünner Ring) statt gefülltem grauem Kreis → kein „weißes Oval"
                            "border-border bg-transparent text-muted-foreground",
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
                    "max-w-[16ch] truncate text-xs font-medium transition-colors group-hover:text-foreground motion-reduce:transition-none",
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
                // Konnektor als eingefärbter „Track" (absolvierte Strecke = primary, kommende = border) statt Chevron —
                // gibt dem Pfad Richtung/Fortschritt ohne die losen „>"-Zeichen zwischen den Pillen.
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-0.5 w-5 shrink-0 rounded-full transition-colors motion-reduce:transition-none",
                    visited ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ── M1: Codelisten-Markierung (Badge/Farbe eines Auswahl-Eintrags) — Token-only, kein Domänen-Literal ──
/** Token-Klassen je Markierungs-Ton (nur Design-Tokens, keine Hex/Domänen-Farben). */
function markierungKlasse(ton: CodelistenMarkierung["ton"]): string {
  switch (ton) {
    case "kritisch":
      return "border-status-block/40 bg-status-block-soft text-status-block";
    case "warn":
      return "border-status-warn/40 bg-status-warn-soft text-status-warn";
    default:
      return "border-status-info/40 bg-status-info-soft text-status-info";
  }
}
/** Generisches Default-Badge-Wort, falls die Markierung kein eigenes `label` trägt (verfahrensfrei). */
function markierungDefaultLabel(ton: CodelistenMarkierung["ton"]): string {
  switch (ton) {
    case "kritisch":
      return "Achtung";
    case "warn":
      return "Hinweis";
    default:
      return "Info";
  }
}

// ── Ein Feld → passendes shadcn-Element je `typ` ───────────────────────────────────────────────
function FeldRenderer({
  id: idProp,
  feld,
  wert,
  daten,
  fehler,
  showErrors,
  leicht = false,
  zeigeFachbegriff = false,
  onChange,
  onRegisterLookup,
}: {
  /** DETERMINISTISCHE Control-id (= ErrorSummary-Anker). Optional: fällt auf useId() zurück (Abwärtskompatibilität). */
  id?: string | undefined;
  feld: FeldDef;
  wert: unknown;
  /** GESAMTE Antragsdaten — für die bedingten Plausibilitäts-Hinweise (`feldHinweise` wertet über alle Felder aus). */
  daten: Antragsdaten;
  fehler: string | null;
  showErrors: boolean;
  /** M2 — Leichte-Sprache-Modus (nutzt `leichteSprache`/`hintEinfach` je Feld, falls gesetzt). */
  leicht?: boolean | undefined;
  /** M2 — Fachbegriff (`labelFachlich`) als Zusatz einblenden (Sachbearbeiter-/Prüfsicht). */
  zeigeFachbegriff?: boolean | undefined;
  onChange: (value: unknown) => void;
  onRegisterLookup: (rohwert: string) => void;
}) {
  const fallbackId = useId();
  const id = idProp ?? fallbackId;
  // M1 — abgeleitetes Feld: read-only, auto-gesetzt (kein Pflicht-Fehler, keine Eingabe).
  const istAbgeleitet = !!feld.abgeleitet;
  // M2 — die Bürger-/Leichte-Sprache-Projektion des Labels/Hilfetexts (fällt sauber auf `label`/`hint` zurück).
  const label = feldLabel(feld, { leicht });
  const hint = feldHint(feld, { leicht });
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
  const plausiId = `${id}-plausi`;
  // Plausibilitäts-Hinweise (weich, nicht sperrend, data-driven): über die GESAMTEN Antragsdaten ausgewertet.
  const plausiHinweise = feldHinweise(feld, daten);
  const describedBy =
    [
      sichtbarerFehler ? errorId : null,
      hint ? hintId : null,
      plausiHinweise.length > 0 ? plausiId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <Field
      htmlFor={id}
      label={label}
      labelFachlich={zeigeFachbegriff ? feld.labelFachlich : undefined}
      required={istAbgeleitet ? false : feld.required}
      hint={hint}
      wide={wide}
      invalid={!!sichtbarerFehler}
      error={sichtbarerFehler ?? undefined}
      errorId={errorId}
      hintId={hintId}
      hinweise={
        plausiHinweise.length > 0 ? (
          <ul
            id={plausiId}
            role="note"
            className="space-y-1"
            aria-live="polite"
          >
            {plausiHinweise.map((h, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-1.5 text-sm",
                  h.ton === "warn" ? "text-status-warn" : "text-status-info",
                )}
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{h.text}</span>
              </li>
            ))}
          </ul>
        ) : undefined
      }
    >
      {renderControl()}
    </Field>
  );

  function renderControl(): React.ReactElement {
    const s = asString(wert);
    const invalidAttr = !!sichtbarerFehler;

    // M1 — ABGELEITETES Feld: nicht editierbar, sondern eine read-only Anzeige des automatisch gesetzten Werts
    // („automatisch abgeleitet"-Badge). Der Wert stammt aus der Codelisten-Merkmal-Ableitung (VOR der Berechnung).
    if (istAbgeleitet) {
      const anzeige = feldAnzeige(feld, wert);
      return (
        <div
          id={id}
          aria-readonly="true"
          aria-describedby={describedBy}
          className="flex min-h-9 flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
        >
          <span className="text-foreground">
            {anzeige || (
              <span className="text-muted-foreground">
                wird automatisch ermittelt
              </span>
            )}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-status-info/30 bg-status-info-soft px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-status-info">
            <Sparkles className="h-3 w-3" aria-hidden="true" /> automatisch
            abgeleitet
          </span>
        </div>
      );
    }

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
              <SelectValue placeholder={hint ?? "Bitte auswählen"} />
            </SelectTrigger>
            <SelectContent>
              {(feld.options ?? []).map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {/* M1 — markierte Codelisten-Einträge (z. B. eine Sonderklasse) tragen ein farbiges Badge. */}
                  <span className="flex w-full items-center gap-2">
                    <span>{opt.label}</span>
                    {opt.markierung ? (
                      <span
                        className={cn(
                          "ml-auto inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide",
                          markierungKlasse(opt.markierung.ton),
                        )}
                      >
                        {opt.markierung.label ??
                          markierungDefaultLabel(opt.markierung.ton)}
                      </span>
                    ) : null}
                  </span>
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
            {hint && (
              <label
                htmlFor={id}
                className="cursor-pointer text-sm text-muted-foreground"
              >
                {hint}
              </label>
            )}
          </div>
        );

      case "ja-nein":
        // Tatbestand als Ja/Nein-Radio (Wert = boolean). „Nein" ist eine gültige, den Antrag NICHT sperrende Antwort —
        // im Gegensatz zu einer Pflicht-Checkbox. Die Gruppe trägt das Feld-Label (aria-label) + die Fehler-/Hinweis-Kopplung.
        return (
          <RadioGroup
            id={id}
            className="flex flex-row flex-wrap gap-x-6 gap-y-2 pt-1"
            aria-label={label}
            aria-invalid={invalidAttr}
            aria-describedby={describedBy}
            value={wert === true ? "ja" : wert === false ? "nein" : ""}
            onValueChange={(v) => onChange(v === "ja")}
          >
            {[
              { v: "ja", label: "Ja" },
              { v: "nein", label: "Nein" },
            ].map((opt) => (
              <div key={opt.v} className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-${opt.v}`} value={opt.v} />
                <label
                  htmlFor={`${id}-${opt.v}`}
                  className="cursor-pointer text-sm text-foreground"
                >
                  {opt.label}
                </label>
              </div>
            ))}
          </RadioGroup>
        );

      case "file":
        return (
          <FileFeld
            id={id}
            feld={feld}
            wert={wert}
            invalid={invalidAttr}
            describedBy={describedBy}
            onChange={onChange}
          />
        );

      case "textarea":
        return (
          <Textarea
            id={id}
            value={s}
            onChange={(e) => onChange(e.target.value)}
            placeholder={hint}
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
            placeholder={hint}
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
            placeholder={hint}
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
            placeholder={hint}
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
            placeholder={hint}
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
            placeholder={hint}
            required={feld.required}
            aria-invalid={invalidAttr}
            aria-describedby={describedBy}
          />
        );
    }
  }
}

// ── Inline-Datei-Feld (`typ: "file"`) — ein einzelner, barrierefreier Nachweis-Upload direkt im Feld ──────────────
// Der Wert ist { name, groesse } (Datei-Metadaten) oder null. Der echte Inhalt wandert in PROD über den Port; hier
// halten wir nur die Referenz. Auslösung über einen echten Button (Maus + Tastatur), verstecktes natives File-Input.
function FileFeld({
  id,
  feld,
  wert,
  invalid,
  describedBy,
  onChange,
}: {
  id: string;
  feld: FeldDef;
  wert: unknown;
  invalid: boolean;
  describedBy: string | undefined;
  onChange: (value: unknown) => void;
}): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const datei = istDateiWert(wert) ? wert : null;
  const oeffnen = () => inputRef.current?.click();

  return (
    <div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="sr-only"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        {...(feld.accept ? { accept: feld.accept } : {})}
        onChange={(e) => {
          const file = e.target.files?.[0];
          onChange(file ? { name: file.name, groesse: file.size } : null);
          // Eingabe leeren, damit dieselbe Datei erneut gewählt werden kann (löst sonst kein change-Event aus).
          e.target.value = "";
        }}
      />
      {datei ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-status-ok/40 bg-status-ok-soft/40 p-2.5">
          <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
            <Paperclip
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate" title={datei.name}>
              {datei.name}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatDateiGroesse(datei.groesse)}
            </span>
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={oeffnen}>
              <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
              Ersetzen
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              aria-label={`Datei „${datei.name}" für ${feld.label} entfernen`}
              className="text-status-block hover:text-status-block"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Entfernen
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={oeffnen}
          aria-describedby={describedBy}
        >
          <UploadCloud className="h-4 w-4" aria-hidden="true" />
          Datei auswählen
        </Button>
      )}
    </div>
  );
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
  // DATA-DRIVEN Kennzeichnung (KEIN Overfit): die HERKUNFT der Berechnung bestimmt die Anzeige. Regelfall
  // "deterministisch" (evidence-getriebenes, §-belegtes Prüfschema — KEIN Vorschlag); "ki" NUR, wenn der Wert
  // tatsaechlich von einem KI-Assistenten stammt (spaetere Stufe, aus dem DAG abgeleitet) → dann ehrlich als
  // KI-Vorschlag (Funke). Fehlt herkunft, gilt deterministisch.
  const kiVorschlag = berechnung.herkunft === "ki";
  return (
    // Zweite Ebene (Spec 4.2): bg-surface-2 + Border + rounded-md, KEIN eigener Schatten
    // (Elevation trägt nur die äußere Card).
    <div className="mt-6 rounded-md border border-border bg-surface-2 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {kiVorschlag
              ? live
                ? "Live-Einschätzung · KI-Vorschlag (Mensch entscheidet)"
                : "KI-Vorschlag · durch Mensch zu prüfen"
              : live
                ? "Live-Berechnung nach Prüfschema · aktueller Stand"
                : "Ergebnis nach Prüfschema (§-belegt, deterministisch)"}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatBetrag(berechnung)}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {berechnung.label}
            </span>
          </div>
        </div>
        {/* DATA-DRIVEN: KI-Funke NUR bei echter KI-Herkunft (herkunft==="ki"); sonst das DETERMINISTISCHE, §-belegte
            Pruef-/Berechnungsschema (ShieldCheck) — kein pauschales „Vorschlag". status "provisional" = nur
            Zwischenstand bis die noetigen Eingaben vollstaendig sind (die Behoerde setzt final fest), NICHT geraten. */}
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-status-info/30 bg-status-info-soft px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-status-info">
          {kiVorschlag ? (
            <>
              <Sparkles className="h-3 w-3" aria-hidden="true" /> KI-Vorschlag
            </>
          ) : (
            <>
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />{" "}
              {berechnung.status === "provisional"
                ? "vorläufig · §-belegt"
                : "§-belegt · Prüfschema"}
            </>
          )}
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

      {/* M5 — BÜRGERNAHE Begründung (einfache Sprache, OHNE Paragraphen): `begruendungBuerger` hat Vorrang, sonst
          die kanonische `begruendung`. Die rechtliche Fassung (`begruendungRecht`) erscheint im Bescheid. */}
      <p className="mt-3 text-sm text-foreground">
        {berechnung.begruendungBuerger ?? berechnung.begruendung}
      </p>

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
  return formatBetragKit(betrag, einheit);
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
  labelFachlich,
  required,
  children,
  wide,
  error,
  invalid,
  hint,
  errorId,
  hintId,
  hinweise,
}: {
  htmlFor: string;
  label: string;
  /** M2 — AMTS-/Fachbezeichnung (Sachbearbeiter-Sicht): als kleiner Zusatz unter dem Bürger-Label. Optional. */
  labelFachlich?: string | undefined;
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
  /** Weiche Plausibilitäts-Hinweise (NICHT sperrend) — unter Fehler/Hilfetext, in der Feld-Spalte. Optional. */
  hinweise?: React.ReactNode | undefined;
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
        {labelFachlich ? (
          // M2 — Amts-/Fachbezeichnung (Sachbearbeiter-Sicht) als dezenter Zusatz, klar als Fachbegriff markiert.
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            <span className="sr-only">Fachbegriff: </span>
            <span aria-hidden="true">· </span>
            {labelFachlich}
          </span>
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
      {hinweise}
    </div>
  );
}

function ReviewRow({
  label,
  labelFachlich,
  value,
}: {
  label: string;
  /** M2 — optionale Amts-/Fachbezeichnung (Sachbearbeiter-Sicht) unter dem Bürger-Label. */
  labelFachlich?: string | undefined;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <dt className="text-sm text-muted-foreground">
        {label}
        {labelFachlich ? (
          <span className="ml-2 text-xs text-muted-foreground/80">
            <span className="sr-only">Fachbegriff: </span>
            <span aria-hidden="true">· </span>
            {labelFachlich}
          </span>
        ) : null}
      </dt>
      <dd className="text-right text-sm font-medium text-foreground">
        {value}
      </dd>
    </div>
  );
}
