// fachverfahren-kit/components/AgentTrace — einklappbare Schritt-/Quellen-Liste eines Agenten.
//
// Macht das Vorgehen eines KI-Agenten nachvollziehbar: die einzelnen Schritte (was wurde getan) samt der je
// Schritt herangezogenen Quellen/Belege. Standardmaessig eingeklappt (nutzt ui/collapsible), damit der Trace
// den Fluss nicht dominiert, aber jederzeit einsehbar bleibt. Rein praesentierend, generisch — Inhalte kommen
// ausschliesslich als props (keine Domaenen-Literale).
import { ChevronDown, FileText, ListChecks } from "lucide-react";

import { cn } from "../lib/utils.js";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible.js";

/** Eine Quelle/ein Beleg zu einem Schritt (Norm, Dokument, Datensatz + optionale Fundstelle). */
export interface AgentTraceQuelle {
  /** Anzeigename der Quelle. */
  titel: string;
  /** Optionale Fundstelle (Seite/Absatz/Abschnitt) — als Text, kein Link-Zwang. */
  fundstelle?: string;
}

/** Ein Schritt im Agenten-Trace: Kurzbezeichnung + optionales Detail + optionale Belege. */
export interface AgentTraceSchritt {
  /** Kurzbezeichnung des Schritts (z. B. „Regel geprüft", „Codeliste gelesen"). */
  titel: string;
  /** Optionales Detail zum Schritt. */
  detail?: string;
  /** Optionale Quellen/Belege fuer diesen Schritt. */
  quellen?: AgentTraceQuelle[];
}

export interface AgentTraceProps {
  /** Die Schritte des Agenten in Reihenfolge. */
  schritte: AgentTraceSchritt[];
  /** Beschriftung des Auf/Zu-Schalters. */
  titel?: string;
  /** Startet aufgeklappt (Default: eingeklappt). */
  defaultOffen?: boolean;
  className?: string;
}

/** Einklappbarer Trace: Schritt-Liste mit Belegen. Der Trigger ist fokussierbar und >= 24px hoch. */
export function AgentTrace({
  schritte,
  titel = "Nachvollziehbarkeit",
  defaultOffen = false,
  className,
}: AgentTraceProps) {
  const anzahl = schritte.length;
  return (
    <Collapsible
      defaultOpen={defaultOffen}
      className={cn("rounded-md border border-border bg-card", className)}
    >
      <CollapsibleTrigger className="fv-focus group flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-accent hover:text-accent-foreground motion-reduce:transition-none">
        <span className="inline-flex items-center gap-2">
          <ListChecks
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span>{titel}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {anzahl} {anzahl === 1 ? "Schritt" : "Schritte"}
          </span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ol className="space-y-3 border-t border-border p-3">
          {schritte.map((schritt, i) => (
            <li key={i} className="flex gap-3">
              <span
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold tabular-nums text-muted-foreground"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-foreground">
                  <span className="sr-only">Schritt {i + 1}: </span>
                  {schritt.titel}
                </p>
                {schritt.detail ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {schritt.detail}
                  </p>
                ) : null}
                {schritt.quellen && schritt.quellen.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5 pt-0.5">
                    {schritt.quellen.map((q, qi) => (
                      <li key={qi} className="min-w-0 max-w-full">
                        <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-muted-foreground">
                          <FileText
                            className="h-3 w-3 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="sr-only">Beleg: </span>
                          <span className="truncate">
                            {q.titel}
                            {q.fundstelle ? ` · ${q.fundstelle}` : ""}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  );
}
