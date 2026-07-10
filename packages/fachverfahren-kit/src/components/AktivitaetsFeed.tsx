// fachverfahren-kit/components/AktivitaetsFeed — der APPEND-ONLY Aktivitäts-Feed einer Aufgabe.
//
// Zeigt jede Metadaten-/KI-/Kommentar-Aktivität als semantische, append-only Timeline (Zeitstempel + Akteur + Typ).
// CONFIG-/DATEN-getrieben: der Aktivitätstyp ist DATEN; ein optionales `typLabels`-Mapping macht ihn menschenlesbar,
// ohne ein Domänen-Literal in die Komponente zu backen. Barrierefrei (BITV/WCAG 2.2 AA): <ol>/<li> + <time>-Element,
// Ton-getriebenes Badge statt Farbe allein, `prefers-reduced-motion` respektiert.
import { useId, type ReactElement } from "react";
import { Activity } from "lucide-react";

import type { AufgabeAktivitaet } from "../types.js";
import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";

export interface AktivitaetsFeedProps {
  aktivitaeten: AufgabeAktivitaet[];
  /** Optionales Mapping Aktivitätstyp → Anzeigetext (DATEN, kein Literal in der Komponente). */
  typLabels?: Record<string, string>;
  className?: string;
}

function tsText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tsMachine(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString();
}

export function AktivitaetsFeed({
  aktivitaeten,
  typLabels,
  className,
}: AktivitaetsFeedProps): ReactElement {
  const ueberschriftId = useId();
  const chronologisch = [...aktivitaeten].sort((a, b) =>
    a.zeitpunktIso < b.zeitpunktIso ? -1 : 1,
  );

  return (
    <section
      aria-labelledby={ueberschriftId}
      className={cn("flex flex-col gap-3", className)}
    >
      <h3
        id={ueberschriftId}
        className="flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <Activity aria-hidden="true" className="h-4 w-4" />
        Aktivität
        <span className="text-muted-foreground">({chronologisch.length})</span>
      </h3>

      {chronologisch.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Aktivität zu dieser Aufgabe.
        </p>
      ) : (
        <ol className="relative ms-2 border-s border-border ps-6">
          {chronologisch.map((a) => {
            const kiHerkunft = a.payload?.["marking"] === "ki-vorschlag";
            return (
              <li key={a.id} className="relative pb-4 last:pb-0">
                <span
                  aria-hidden="true"
                  className="absolute -start-[1.6875rem] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary"
                />
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <time
                      dateTime={tsMachine(a.zeitpunktIso)}
                      className="font-mono text-xs tabular-nums text-muted-foreground"
                    >
                      {tsText(a.zeitpunktIso)}
                    </time>
                    <span className="font-mono text-xs text-muted-foreground">
                      {a.akteurId}
                    </span>
                    {kiHerkunft && (
                      <Badge tone="info">KI-Vorschlag übernommen</Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {typLabels?.[a.typ] ?? a.typ}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
