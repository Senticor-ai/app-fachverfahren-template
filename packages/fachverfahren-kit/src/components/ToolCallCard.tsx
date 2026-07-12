// fachverfahren-kit/components/ToolCallCard — ein geplanter Tool-/Aktionsaufruf mit HITL-Genehmigung.
//
// Ein Agent moechte eine Aktion (Tool-Aufruf) ausfuehren — der Mensch entscheidet ZUERST (Human-in-the-Loop):
// Aktion, Zweck und alle Parameter werden transparent gezeigt, echte Genehmigen/Ablehnen-Buttons (ui/button)
// steuern die Freigabe. Nichts wird autonom ausgefuehrt. Rein praesentierend, generisch — Aktion/Parameter
// kommen ausschliesslich als props (keine Domaenen-Literale). Zustand (genehmigt/abgelehnt) traegt Icon + Text,
// nie nur Farbe (WCAG 1.4.1).
import * as React from "react";
import {
  Wrench,
  Check,
  X,
  ShieldAlert,
  CircleCheck,
  CircleX,
} from "lucide-react";

import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { useStatusRegion } from "./StatusRegion.js";

/** Ein transparent gezeigter Aufruf-Parameter (Schluessel + bereits stringifizierter Wert). */
export interface ToolCallParameter {
  name: string;
  wert: string;
}

/** Entscheidungsstand des Aufrufs. */
export type ToolCallStatus = "ausstehend" | "genehmigt" | "abgelehnt";

export interface ToolCallCardProps {
  /** Name der geplanten Aktion / des Tools. */
  aktion: string;
  /** Optionale, menschenlesbare Beschreibung, was die Aktion bewirkt. */
  beschreibung?: string;
  /** Transparente Parameterliste (Schluessel/Wert). */
  parameter?: ToolCallParameter[];
  /** Entscheidungsstand (Default „ausstehend" → Genehmigen/Ablehnen sichtbar). */
  status?: ToolCallStatus;
  /** Genehmigung durch den Menschen (HITL). Fehlt der Handler, ist der Button deaktiviert. */
  onGenehmigen?: (() => void) | undefined;
  /** Ablehnung durch den Menschen (HITL). Fehlt der Handler, ist der Button deaktiviert. */
  onAblehnen?: (() => void) | undefined;
  className?: string;
}

/** Karte fuer einen geplanten Aktionsaufruf mit menschlicher Freigabe (HITL). */
export function ToolCallCard({
  aktion,
  beschreibung,
  parameter,
  status = "ausstehend",
  onGenehmigen,
  onAblehnen,
  className,
}: ToolCallCardProps) {
  const { announce } = useStatusRegion();
  const reactId = React.useId();
  const titelId = `${reactId}-aktion`;
  const istOffen = status === "ausstehend";

  function handleGenehmigen() {
    if (!onGenehmigen) return;
    onGenehmigen();
    announce(`Aktion „${aktion}" genehmigt`, "polite");
  }

  function handleAblehnen() {
    if (!onAblehnen) return;
    onAblehnen();
    announce(`Aktion „${aktion}" abgelehnt`, "assertive");
  }

  return (
    <section
      role="region"
      aria-labelledby={titelId}
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
    >
      {/* Kopf: Aktion + Entscheidungsstand (Badge trägt Icon + Text, nie nur Farbe) */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border p-3">
        <h3
          id={titelId}
          className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-foreground"
        >
          <span className="inline-flex items-center gap-2">
            <Wrench
              className="h-4 w-4 shrink-0 text-status-info"
              aria-hidden="true"
            />
            Geplante Aktion
          </span>
          <span className="break-all font-mono text-xs font-normal text-muted-foreground">
            {aktion}
          </span>
        </h3>
        {istOffen ? (
          <Badge tone="warn">
            <ShieldAlert className="h-3 w-3" aria-hidden="true" />
            Genehmigung erforderlich
          </Badge>
        ) : status === "genehmigt" ? (
          <Badge tone="ok">
            <CircleCheck className="h-3 w-3" aria-hidden="true" />
            Genehmigt
          </Badge>
        ) : (
          <Badge tone="block">
            <CircleX className="h-3 w-3" aria-hidden="true" />
            Abgelehnt
          </Badge>
        )}
      </div>

      <div className="space-y-3 p-3">
        {beschreibung ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {beschreibung}
          </p>
        ) : null}

        {parameter && parameter.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Parameter
            </p>
            <div className="overflow-x-auto rounded-md border border-border bg-surface-2">
              <dl className="divide-y divide-border text-xs">
                {parameter.map((p) => (
                  <div key={p.name} className="flex gap-3 px-2.5 py-1.5">
                    <dt className="shrink-0 font-medium text-foreground">
                      {p.name}
                    </dt>
                    <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-right font-mono text-muted-foreground">
                      {p.wert}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ) : null}
      </div>

      {/* HITL: der Mensch entscheidet — nichts wird autonom ausgeführt */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
        {istOffen ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={handleGenehmigen}
              disabled={!onGenehmigen}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Genehmigen
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleAblehnen}
              disabled={!onAblehnen}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Ablehnen
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Wird erst nach Ihrer Genehmigung ausgeführt.
            </span>
          </>
        ) : (
          <p
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium",
              status === "genehmigt" ? "text-status-ok" : "text-status-block",
            )}
          >
            {status === "genehmigt" ? (
              <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <CircleX className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {status === "genehmigt"
              ? "Von Ihnen genehmigt – die Aktion darf ausgeführt werden."
              : "Von Ihnen abgelehnt – die Aktion wird nicht ausgeführt."}
          </p>
        )}
      </div>
    </section>
  );
}
