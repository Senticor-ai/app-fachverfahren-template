// fachverfahren-kit/components/KiAssistPanel — transparenter KI-Vorschlag mit allen 5 EU-AI-Act-/DSGVO-Transparenzelementen
// (marking · source · confidence · why · override). Erweitert das Konzept von KiVorschlag.tsx auf EINEN konkreten,
// menschlich entscheidbaren Vorschlag.
//
// GENERISCH: KEINE Domänen-Literale — Wert, Quelle, Konfidenz und Begründung kommen ausschließlich aus props
// (vorschlag/funktionsName). Nutzbar für jedes Fachverfahren (Kommune ↔ HR ↔ Web-App).
//
// BROKER-ONLY: Diese Komponente konsumiert NUR eine fertige Einschätzung (über einen AiAssistPort/Broker erzeugt) —
// sie ruft selbst kein Modell. ASSIST-ONLY: Der Vorschlag ist nie autonom bindend (DSGVO Art. 22) — der Mensch
// entscheidet (HITL) über echte Annehmen/Verwerfen-Buttons. Hochrisiko-Vorschläge fordern eine Annex-III-Prüfung.
//
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): KI-Bereich als <section role="region"> mit verbundener Überschrift,
// SR-Ansage „KI-Vorschlag" über die zentrale StatusRegion; Konfidenz als meter MIT sichtbarem Textwert (nie nur Farbe);
// Risiko zusätzlich textlich (nicht nur Farbe); echte Buttons (Ziel-Größe >= 24px, sichtbarer Fokus),
// dekorative Icons aria-hidden, motion-reduce-fest.
import * as React from "react";
import { Sparkles, AlertTriangle, ShieldAlert, Check, X } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { useStatusRegion } from "./StatusRegion.js";

import type { ReactNode } from "react";

/** Die Risiko-Einstufung des Vorschlags (EU-AI-Act-orientiert) — bestimmt Ton + Pflichthinweis. */
export type KiRisikoklasse = "begrenzt" | "hochrisiko-pruefen";

/** Ein einzelner, transparent dargestellter KI-Vorschlag (Broker-Ergebnis, AiAssistPort). */
export interface KiAssistVorschlag {
  /** Der vorgeschlagene Wert (frei rendernd — Text, Zahl, Auszeichnung). */
  wert: ReactNode;
  /** Herkunft des Vorschlags (Modell/Datenquelle) — Transparenzelement „source". */
  quelle: string;
  /** Konfidenz 0..1 — Transparenzelement „confidence" (wird als Balken UND Textwert gezeigt). */
  konfidenz: number;
  /** Begründung für genau diesen Vorschlag — Transparenzelement „why". */
  begruendung: string;
}

export interface KiAssistPanelProps {
  /** Der darzustellende KI-Vorschlag. */
  vorschlag: KiAssistVorschlag;
  /** Risiko-Einstufung; „hochrisiko-pruefen" erzwingt sichtbaren Annex-III-Hinweis. */
  risikoklasse: KiRisikoklasse;
  /** Übernimmt der Mensch den Vorschlag (HITL-Override „annehmen"). */
  onAnnehmen?: (() => void) | undefined;
  /** Verwirft der Mensch den Vorschlag (HITL-Override „verwerfen"). */
  onVerwerfen?: (() => void) | undefined;
  /** Name der unterstützten Funktion/des Feldes — erscheint in Überschrift und SR-Ansage. */
  funktionsName: string;
  className?: string;
}

/** Konfidenz-Balken (0..1 → %) mit sichtbarem Textwert — Information nie nur über Farbe. */
function KonfidenzBalken({
  value,
  labelledBy,
}: {
  value: number;
  labelledBy: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  // Ton ist rein zusätzlich — der Prozentwert daneben trägt die Information.
  const tone =
    pct >= 85
      ? "bg-status-ok"
      : pct >= 70
        ? "bg-status-info"
        : "bg-status-warn";
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-28 overflow-hidden rounded-full bg-muted"
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

/**
 * Stellt EINEN KI-Vorschlag transparent dar und überlässt die Entscheidung dem Menschen.
 * Rein präsentierend (kein Modell-Aufruf): Sichtbarkeit der Herkunft, Konfidenz, Begründung
 * und die echte Annehmen/Verwerfen-Steuerung machen die KI-Assistenz nachvollziehbar und überstimmbar.
 */
export function KiAssistPanel({
  vorschlag,
  risikoklasse,
  onAnnehmen,
  onVerwerfen,
  funktionsName,
  className,
}: KiAssistPanelProps) {
  const { announce } = useStatusRegion();
  const reactId = React.useId();
  const titleId = `${reactId}-titel`;
  const konfidenzLabelId = `${reactId}-konfidenz-label`;
  const begruendungId = `${reactId}-begruendung`;

  const istHochrisiko = risikoklasse === "hochrisiko-pruefen";

  // Beim Erscheinen den KI-Vorschlag einmal höflich ansagen (Transparenzelement „marking", auch für Screenreader).
  React.useEffect(() => {
    announce(`KI-Vorschlag für ${funktionsName}`, "polite");
  }, [announce, funktionsName]);

  // HITL-Override nur ausführen + ansagen, wenn ein Handler verdrahtet ist —
  // keine Phantom-Entscheidung („angenommen"/„verworfen" ansagen, ohne dass sie irgendwo ankommt).
  function handleAnnehmen() {
    if (!onAnnehmen) return;
    onAnnehmen();
    announce(`KI-Vorschlag für ${funktionsName} angenommen`, "polite");
  }

  function handleVerwerfen() {
    if (!onVerwerfen) return;
    onVerwerfen();
    announce(`KI-Vorschlag für ${funktionsName} verworfen`, "polite");
  }

  return (
    <section
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "rounded-md border border-status-info/30 bg-status-info-soft/40 p-4",
        className,
      )}
    >
      {/* Kopf: Marking (sichtbar als KI gekennzeichnet) + Risiko-Badge */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3
          id={titleId}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground"
        >
          <Sparkles className="h-4 w-4 text-status-info" aria-hidden="true" />
          <span>KI-Vorschlag</span>
          <span className="font-normal text-muted-foreground">
            · {funktionsName}
          </span>
        </h3>
        <Badge tone={istHochrisiko ? "warn" : "info"}>
          {istHochrisiko ? (
            <ShieldAlert className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Sparkles className="h-3 w-3" aria-hidden="true" />
          )}
          {istHochrisiko ? "Hochrisiko – prüfen" : "Begrenztes Risiko"}
        </Badge>
      </div>

      {/* Hochrisiko: Pflichthinweis textlich (nicht nur über Badge-Farbe) */}
      {istHochrisiko && (
        <p
          role="note"
          className="mt-2 flex items-start gap-1.5 rounded-sm bg-status-warn-soft px-2 py-1.5 text-xs text-foreground"
        >
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-warn"
            aria-hidden="true"
          />
          <span>
            Annex-III-Prüfung erforderlich – Vorschlag vor Übernahme fachlich
            prüfen.
          </span>
        </p>
      )}

      {/* Wert: der eigentliche Vorschlag */}
      <div className="mt-3">
        <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground/80">
          Vorschlag
        </span>
        <div className="mt-0.5 text-sm font-medium text-foreground">
          {vorschlag.wert}
        </div>
      </div>

      {/* Source + Confidence */}
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground/80">
            Quelle
          </dt>
          <dd className="mt-0.5 text-xs text-foreground">{vorschlag.quelle}</dd>
        </div>
        <div>
          <dt
            id={konfidenzLabelId}
            className="text-xs font-bold uppercase tracking-wide text-muted-foreground/80"
          >
            Konfidenz
          </dt>
          <dd className="mt-1">
            <KonfidenzBalken
              value={vorschlag.konfidenz}
              labelledBy={konfidenzLabelId}
            />
          </dd>
        </div>
      </dl>

      {/* Why: Begründung je Vorschlag */}
      <div className="mt-3">
        <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground/80">
          Begründung
        </span>
        <p
          id={begruendungId}
          className="mt-0.5 text-xs leading-relaxed text-foreground"
        >
          {vorschlag.begruendung}
        </p>
      </div>

      {/* Override: HITL — der Mensch entscheidet (nie autonom bindend, DSGVO Art. 22) */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={handleAnnehmen}
          disabled={!onAnnehmen}
          aria-describedby={begruendungId}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Annehmen
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleVerwerfen}
          disabled={!onVerwerfen}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Verwerfen
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          Vorschlag der KI – die Entscheidung trifft der Mensch.
        </span>
      </div>
    </section>
  );
}
