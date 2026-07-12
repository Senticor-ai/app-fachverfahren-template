// fachverfahren-kit/components/DokumentExtraktion — der INTEGRIERTE KI-Extraktions-Assistent fuer den Dokument-Upload.
//
// Fluss (vollstaendig klickbar): Dokument hochladen → KI-Vorschlaege je Feld mit Konfidenz (aus dem PORT) → der
// Mensch bestaetigt ODER korrigiert je Feld → das Antragsfeld wird befuellt. Analog zur transparenten KI-Assistenz
// in der Sachbearbeitung (KiAssistPanel): sichtbare Herkunft (source), Konfidenz je Vorschlag (confidence + Textwert),
// Fundstelle (why) und ECHTE Uebernahme/Verwerfen-Steuerung (override, HITL). Der Vorschlag ist NIE autonom bindend.
//
// GENERISCH: keine Domaenen-Literale — die Zielfelder kommen als DATEN (`zielFelder`, z. B. aus
// `extraktionsZielFelder(steps)`), die Vorschlaege ausschliesslich aus dem `DokumentExtraktionPort` (Stub-Default;
// PROD dockt OCR/KI an — vendor-neutral, kein Dienst hartverdrahtet).
//
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): tastaturbedienbare Dropzone (echter Button, Enter/Space), Region mit
// verbundener Ueberschrift, Konfidenz als meter MIT sichtbarem Textwert (nie nur Farbe), Phasen/Vorschlaege ueber die
// zentrale StatusRegion angesagt, editierbare Vorschlagswerte als echte, gelabelte Inputs, Ziele >= 24px, sichtbarer
// Fokus, dekorative Icons aria-hidden, motion-reduce-fest.
import * as React from "react";
import { useId, useMemo, useRef, useState, type DragEvent } from "react";
import {
  Check,
  CheckCircle2,
  FileUp,
  Loader2,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { cn } from "../lib/utils.js";
import { formatDateiGroesse } from "../format.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Label } from "../ui/label.js";
import { useStatusRegion } from "./StatusRegion.js";
import type { DateiWert } from "../lib/antrag-felder.js";
import type {
  DokumentExtraktionPort,
  ExtrahiertesFeld,
  ExtraktionsErgebnis,
  ExtraktionsZielFeld,
} from "../lib/dokument-extraktion.js";

/** Phase des Assistenten (rein UI — die fachliche Arbeit macht der PORT). */
type Phase = "leer" | "laeuft" | "vorschlaege" | "fehler";

export interface DokumentExtraktionProps {
  /** Die Zielfelder, die aus einem Dokument befuellt werden koennen (DATEN, z. B. aus `extraktionsZielFelder(steps)`). */
  zielFelder: ExtraktionsZielFeld[];
  /** Der Extraktions-PORT — Mock/Stub-Default im Kit; in PROD eine echte OCR-/KI-Bindung. */
  port: DokumentExtraktionPort;
  /** Uebernahme EINES bestaetigten (ggf. korrigierten) Feldwerts nach oben — z. B. `setFeld(feld, wert)` im Stepper. */
  onUebernehmen: (feld: string, wert: string) => void;
  /** Optionale Ueberschrift (generisch, ohne Domaenen-Bezug). */
  titel?: string;
  /** Optionaler Erklaertext unter der Ueberschrift. */
  beschreibung?: string;
  /** Erlaubte Datei-Typen fuer den Dialog (natives `accept`, z. B. "application/pdf,image/*"). */
  accept?: string;
  className?: string;
}

/**
 * Dokument-Extraktions-Assistent — laedt ein Dokument, holt Feld-Vorschlaege vom PORT und laesst den Menschen jeden
 * Vorschlag bestaetigen oder korrigieren, bevor er ein Antragsfeld befuellt.
 */
export function DokumentExtraktion({
  zielFelder,
  port,
  onUebernehmen,
  titel = "Aus Dokument vorbefuellen",
  beschreibung = "Laden Sie ein Dokument hoch — die KI schlaegt Feldwerte vor. Sie bestaetigen oder korrigieren jeden Vorschlag.",
  accept = "application/pdf,image/*",
  className,
}: DokumentExtraktionProps): React.ReactElement {
  const { announce } = useStatusRegion();
  const reactId = useId();
  const titelId = `${reactId}-titel`;
  const beschreibungId = `${reactId}-beschreibung`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("leer");
  const [datei, setDatei] = useState<DateiWert | null>(null);
  const [ergebnis, setErgebnis] = useState<ExtraktionsErgebnis | null>(null);
  const [entwuerfe, setEntwuerfe] = useState<Record<string, string>>({});
  const [uebernommen, setUebernommen] = useState<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  // Laufsequenz: verhindert, dass ein spaeter aufgeloester alter Lauf einen neueren Upload ueberschreibt.
  const laufRef = useRef(0);

  const hatZiele = zielFelder.length > 0;

  async function starteExtraktion(file: File): Promise<void> {
    const ref: DateiWert = { name: file.name, groesse: file.size };
    const lauf = ++laufRef.current;
    setDatei(ref);
    setErgebnis(null);
    setEntwuerfe({});
    setUebernommen({});
    setFehler(null);
    setPhase("laeuft");
    announce(`Dokument „${ref.name}" wird ausgewertet.`, "polite");
    try {
      const res = await port.extrahiere(ref, zielFelder);
      if (lauf !== laufRef.current) return; // ein neuerer Upload hat uebernommen
      setErgebnis(res);
      setEntwuerfe(Object.fromEntries(res.felder.map((f) => [f.feld, f.wert])));
      setPhase("vorschlaege");
      announce(
        res.felder.length === 0
          ? "Keine Feldwerte im Dokument erkannt."
          : `${res.felder.length} ${res.felder.length === 1 ? "Vorschlag" : "Vorschlaege"} aus dem Dokument — bitte pruefen und uebernehmen.`,
        "polite",
      );
    } catch {
      if (lauf !== laufRef.current) return;
      setPhase("fehler");
      setFehler(
        "Die Auswertung ist fehlgeschlagen. Bitte versuchen Sie es erneut oder tragen Sie die Werte von Hand ein.",
      );
      announce("Die Dokument-Auswertung ist fehlgeschlagen.", "assertive");
    }
  }

  function verarbeiteDatei(file: File | undefined | null): void {
    if (!file) return;
    void starteExtraktion(file);
  }

  const oeffneDialog = (): void => inputRef.current?.click();

  const onDrop = (e: DragEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    verarbeiteDatei(e.dataTransfer?.files?.[0]);
  };

  function uebernehmeFeld(feld: ExtrahiertesFeld): void {
    const wert = entwuerfe[feld.feld] ?? feld.wert;
    onUebernehmen(feld.feld, wert);
    setUebernommen((prev) => ({ ...prev, [feld.feld]: wert }));
    announce(`${feld.label} uebernommen.`, "polite");
  }

  function uebernehmeAlle(): void {
    const offen = (ergebnis?.felder ?? []).filter(
      (f) => uebernommen[f.feld] === undefined,
    );
    for (const f of offen) {
      onUebernehmen(f.feld, entwuerfe[f.feld] ?? f.wert);
    }
    if (offen.length > 0) {
      setUebernommen((prev) => {
        const next = { ...prev };
        for (const f of offen) next[f.feld] = entwuerfe[f.feld] ?? f.wert;
        return next;
      });
      announce(
        `${offen.length} ${offen.length === 1 ? "Vorschlag" : "Vorschlaege"} uebernommen.`,
        "polite",
      );
    }
  }

  const offeneAnzahl = useMemo(
    () =>
      (ergebnis?.felder ?? []).filter((f) => uebernommen[f.feld] === undefined)
        .length,
    [ergebnis, uebernommen],
  );

  return (
    <section
      role="region"
      aria-labelledby={titelId}
      className={cn(
        "rounded-md border border-status-info/30 bg-status-info-soft/40 p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id={titelId}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"
          >
            <Sparkles className="h-4 w-4 text-status-info" aria-hidden="true" />
            {titel}
          </h3>
          <p id={beschreibungId} className="mt-1 text-sm text-muted-foreground">
            {beschreibung}
          </p>
        </div>
        <Badge tone="info">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          KI-Assistenz
        </Badge>
      </div>

      {/* Verstecktes natives File-Input — von der Dropzone/dem Ersetzen-Button getriggert (Maus + Tastatur). */}
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        aria-label={`Datei auswählen: ${titel}`}
        aria-describedby={beschreibungId}
        {...(accept ? { accept } : {})}
        onChange={(e) => {
          verarbeiteDatei(e.target.files?.[0]);
          e.target.value = ""; // erneute Auswahl derselben Datei ermoeglichen
        }}
      />

      {!hatZiele ? (
        <p className="mt-3 rounded-sm border border-border bg-background p-3 text-sm text-muted-foreground">
          Fuer diesen Antrag sind keine automatisch befuellbaren Felder
          hinterlegt.
        </p>
      ) : phase === "leer" || phase === "fehler" ? (
        <>
          <button
            type="button"
            onClick={oeffneDialog}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragOver) setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            aria-label="Dokument auswaehlen oder hierher ziehen"
            aria-describedby={beschreibungId}
            className={cn(
              "mt-3 flex min-h-[3rem] w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-5 text-center transition-colors motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              dragOver
                ? "border-accent bg-accent/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:border-accent/60 hover:bg-secondary/40",
            )}
          >
            <UploadCloud className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground">
              Dokument hierher ziehen oder auswaehlen
            </span>
            <span className="text-xs text-muted-foreground">
              Per Klick oder Eingabetaste den Datei-Dialog oeffnen
            </span>
          </button>
          {fehler && (
            <p role="alert" className="mt-2 text-sm text-status-block">
              {fehler}
            </p>
          )}
        </>
      ) : (
        <>
          {/* Datei-Kopf + Ersetzen */}
          <div className="mt-3 flex items-center justify-between gap-3 rounded-sm border border-border bg-card p-2.5">
            <span className="flex min-w-0 items-center gap-2.5 text-sm text-foreground">
              <FileUp
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="truncate" title={datei?.name}>
                {datei?.name}
              </span>
              {datei && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatDateiGroesse(datei.groesse)}
                </span>
              )}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={oeffneDialog}
            >
              <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
              Anderes Dokument
            </Button>
          </div>

          {phase === "laeuft" ? (
            <div className="mt-3 flex items-center gap-2 rounded-sm border border-status-info/40 bg-status-info-soft/40 p-3 text-sm font-medium text-foreground">
              <Loader2
                className="h-4 w-4 shrink-0 text-status-info animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              <span>Dokument wird ausgewertet…</span>
            </div>
          ) : (
            <ErgebnisAnsicht
              ergebnis={ergebnis!}
              entwuerfe={entwuerfe}
              uebernommen={uebernommen}
              offeneAnzahl={offeneAnzahl}
              onEntwurf={(feld, wert) =>
                setEntwuerfe((prev) => ({ ...prev, [feld]: wert }))
              }
              onUebernehmen={uebernehmeFeld}
              onUebernehmeAlle={uebernehmeAlle}
            />
          )}
        </>
      )}
    </section>
  );
}

// ── Ergebnis: Quelle + Hinweise + je Feld ein Vorschlag (Konfidenz + editierbarer Wert + Uebernehmen) ──
function ErgebnisAnsicht({
  ergebnis,
  entwuerfe,
  uebernommen,
  offeneAnzahl,
  onEntwurf,
  onUebernehmen,
  onUebernehmeAlle,
}: {
  ergebnis: ExtraktionsErgebnis;
  entwuerfe: Record<string, string>;
  uebernommen: Record<string, string>;
  offeneAnzahl: number;
  onEntwurf: (feld: string, wert: string) => void;
  onUebernehmen: (feld: ExtrahiertesFeld) => void;
  onUebernehmeAlle: () => void;
}): React.ReactElement {
  if (ergebnis.felder.length === 0) {
    return (
      <p className="mt-3 rounded-sm border border-border bg-background p-3 text-sm text-muted-foreground">
        Im Dokument wurden keine Feldwerte erkannt. Bitte tragen Sie die Angaben
        von Hand ein.
      </p>
    );
  }
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Quelle: {ergebnis.quelle}
        </span>
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={onUebernehmeAlle}
          disabled={offeneAnzahl === 0}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Alle uebernehmen
        </Button>
      </div>

      {ergebnis.hinweise && ergebnis.hinweise.length > 0 && (
        <ul role="note" className="mt-2 space-y-1">
          {ergebnis.hinweise.map((h, i) => (
            <li
              key={i}
              className="flex items-start gap-1.5 text-xs text-status-warn"
            >
              <Sparkles
                className="mt-0.5 h-3 w-3 shrink-0"
                aria-hidden="true"
              />
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-3 grid gap-3">
        {ergebnis.felder.map((feld) => (
          <li key={feld.feld}>
            <VorschlagZeile
              feld={feld}
              wert={entwuerfe[feld.feld] ?? feld.wert}
              uebernommenWert={uebernommen[feld.feld]}
              onEntwurf={(w) => onEntwurf(feld.feld, w)}
              onUebernehmen={() => onUebernehmen(feld)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Eine Vorschlag-Zeile: Label + Konfidenz (meter + Text) + Fundstelle + editierbarer Wert + Uebernehmen. */
function VorschlagZeile({
  feld,
  wert,
  uebernommenWert,
  onEntwurf,
  onUebernehmen,
}: {
  feld: ExtrahiertesFeld;
  wert: string;
  uebernommenWert: string | undefined;
  onEntwurf: (wert: string) => void;
  onUebernehmen: () => void;
}): React.ReactElement {
  const id = useId();
  const konfidenzId = `${id}-konfidenz`;
  const istUebernommen = uebernommenWert !== undefined;
  // Wurde der bereits uebernommene Wert danach wieder geaendert? Dann erneutes Uebernehmen anbieten.
  const geaendertNachUebernahme = istUebernommen && uebernommenWert !== wert;

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id} className="text-foreground">
          {feld.label}
        </Label>
        <KonfidenzMeter value={feld.konfidenz} labelledBy={konfidenzId} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          id={id}
          value={wert}
          onChange={(e) => onEntwurf(e.target.value)}
          className="min-w-0 flex-1"
          aria-describedby={feld.fundstelle ? `${id}-why` : undefined}
        />
        {istUebernommen && !geaendertNachUebernahme ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-status-ok">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Uebernommen
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant={geaendertNachUebernahme ? "outline" : "default"}
            onClick={onUebernehmen}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {geaendertNachUebernahme ? "Erneut uebernehmen" : "Uebernehmen"}
          </Button>
        )}
      </div>

      <p id={konfidenzId} className="sr-only">
        KI-Konfidenz fuer {feld.label}
      </p>
      {feld.fundstelle && (
        <p id={`${id}-why`} className="mt-1.5 text-xs text-muted-foreground">
          Fundstelle: {feld.fundstelle}
        </p>
      )}
    </div>
  );
}

/** Konfidenz-Balken (0..1 → %) mit sichtbarem Textwert — Information nie nur ueber Farbe. */
function KonfidenzMeter({
  value,
  labelledBy,
}: {
  value: number;
  labelledBy: string;
}): React.ReactElement {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const tone =
    pct >= 85
      ? "bg-status-ok"
      : pct >= 70
        ? "bg-status-info"
        : "bg-status-warn";
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-labelledby={labelledBy}
        aria-valuetext={`${pct} Prozent`}
      >
        <div
          className={cn("h-full motion-reduce:transition-none", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-xs tabular-nums text-foreground">
        {pct}&nbsp;%
      </span>
    </div>
  );
}
