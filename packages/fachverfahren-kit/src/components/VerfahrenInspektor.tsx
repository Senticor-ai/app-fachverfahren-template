// components/VerfahrenInspektor — macht die EINE Naht (`LeistungConfig`) in-app browsbar + validierbar. Der Baustein
// für den „Builder"-Aspekt: beim ENTWICKELN neuer und beim INTEGRIEREN bestehender Fachverfahren zeigt er die
// Struktur (Antrag/StatusMachine/Fristen/Detail) + strukturelle Befunde auf einen Blick. Komponiert das bestehende
// `WorkflowDiagramm` (StatusMachine → Mermaid) und die reinen Prüfer. Rein präsentierend, generisch, vendor-neutral.
import { useMemo, type ReactElement } from "react";
import { FileText, ListChecks, ScrollText } from "lucide-react";

import type { LeistungConfig } from "../types.js";
import {
  pruefeLeistungConfig,
  verfahrenKennzahlen,
} from "../lib/verfahren-pruefung.js";
import { Badge } from "../ui/badge.js";
import { WorkflowDiagramm } from "./WorkflowDiagramm.js";

export interface VerfahrenInspektorProps<T = Record<string, unknown>> {
  /** Die zu inspizierende Verfahrens-Config (die Naht). */
  config: LeistungConfig<T>;
}

interface KennzahlProps {
  label: string;
  wert: number;
}
function Kennzahl({ label, wert }: KennzahlProps): ReactElement {
  return (
    <div className="rounded-md border border-border bg-card p-3 text-center">
      <div className="text-2xl font-semibold tabular-nums text-foreground">
        {wert}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * Rendert den Verfahrens-Steckbrief: Kopf (Leistung/Kommune/Rechtsgrundlagen/FIM), strukturelle Befunde, Kennzahlen
 * und das Workflow-Diagramm der StatusMachine. Alles aus der Config abgeleitet — kein Domänen-Literal.
 */
export function VerfahrenInspektor<T = Record<string, unknown>>({
  config,
}: VerfahrenInspektorProps<T>): ReactElement {
  const befunde = useMemo(() => pruefeLeistungConfig(config), [config]);
  const k = useMemo(() => verfahrenKennzahlen(config), [config]);
  const fehler = befunde.filter((b) => b.schwere === "fehler");
  const hinweise = befunde.filter((b) => b.schwere === "hinweis");

  return (
    <section className="mx-auto max-w-4xl p-4 md:p-6">
      <header className="mb-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-foreground" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-foreground">
            {config.label}
          </h1>
          <Badge tone="info">{config.id}</Badge>
          {config.fimLeistung ? (
            <Badge tone="neu">FIM {config.fimLeistung.id}</Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {config.kommune} · Verfahrens-Steckbrief (die eine Naht als DATEN)
        </p>
      </header>

      {/* Strukturelle Befunde */}
      {befunde.length === 0 ? (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-status-ok/40 bg-status-ok-soft/40 p-3 text-sm text-foreground">
          <ListChecks className="h-4 w-4 text-status-ok" aria-hidden="true" />
          Strukturell wohlgeformt — keine Befunde.
        </p>
      ) : (
        <div
          role="alert"
          className="mb-4 space-y-1 rounded-md border border-status-warn/40 bg-status-warn-soft/40 p-3 text-sm"
        >
          <div className="font-medium text-foreground">
            {fehler.length} Fehler · {hinweise.length} Hinweise
          </div>
          <ul className="list-disc pl-6 text-muted-foreground">
            {befunde.map((b, i) => (
              <li key={i}>
                <span
                  className={
                    b.schwere === "fehler"
                      ? "text-status-block"
                      : "text-status-warn"
                  }
                >
                  [{b.bereich}]
                </span>{" "}
                {b.meldung}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Kennzahlen */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <Kennzahl label="Schritte" wert={k.schritte} />
        <Kennzahl label="Felder" wert={k.felder} />
        <Kennzahl label="Status" wert={k.status} />
        <Kennzahl label="Übergänge" wert={k.uebergaenge} />
        <Kennzahl label="Fristen" wert={k.fristen} />
        <Kennzahl label="Detail" wert={k.detailSektionen} />
        <Kennzahl label="Normen" wert={k.rechtsgrundlagen} />
      </div>

      {/* Rechtsgrundlagen */}
      {config.rechtsgrundlagen.length > 0 ? (
        <div className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            Rechtsgrundlagen
          </h2>
          <ul className="space-y-1 text-sm">
            {config.rechtsgrundlagen.map((r, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="font-medium text-foreground">{r.norm}</span> —{" "}
                {r.titel}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Workflow-Diagramm der StatusMachine (bestehender Baustein) */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Prozess (StatusMachine)
        </h2>
        <div className="rounded-lg border border-border bg-card p-2">
          <WorkflowDiagramm statusMachine={config.statusMachine} />
        </div>
      </div>
    </section>
  );
}
