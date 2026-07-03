// fachverfahren-kit/components/AgentStatusIndicator — kompakter Agenten-Status (idle/denkt/handelt/fehler).
//
// Zeigt den aktuellen Zustand eines KI-Agenten mehrkanalig: Icon PLUS Text (nie nur Farbe, WCAG 1.4.1) und
// ein sr-only-Praefix, das die Bedeutung fuer Screenreader traegt. Rein praesentierend, generisch — kein
// Domaenen-Literal. Zielgroesse >= 24px (SC 2.5.8); Bewegung (denkt/handelt) wird unter prefers-reduced-motion still.
import { Loader2, Cog, CircleDot, AlertTriangle, type LucideIcon } from "lucide-react";

import { cn } from "../lib/utils.js";

/** Der Zustandsraum eines Agenten in der UI. */
export type AgentStatus = "idle" | "denkt" | "handelt" | "fehler";

interface StatusMeta {
  /** Standard-Beschriftung (ueberschreibbar via `label`). */
  label: string;
  Icon: LucideIcon;
  /** Token-getriebene Vordergrundfarbe (nur zusaetzlich — der Text traegt die Information). */
  toneClass: string;
  /** Dreht das Icon (nur denkt/handelt) — motion-reduce schaltet es still. */
  spinnt: boolean;
}

const STATUS_META: Record<AgentStatus, StatusMeta> = {
  idle: {
    label: "Bereit",
    Icon: CircleDot,
    toneClass: "text-muted-foreground",
    spinnt: false,
  },
  denkt: {
    label: "Denkt nach …",
    Icon: Loader2,
    toneClass: "text-status-info",
    spinnt: true,
  },
  handelt: {
    label: "Führt aus …",
    Icon: Cog,
    toneClass: "text-status-info",
    spinnt: true,
  },
  fehler: {
    label: "Fehler",
    Icon: AlertTriangle,
    toneClass: "text-status-block",
    spinnt: false,
  },
};

export interface AgentStatusIndicatorProps {
  /** Der darzustellende Agenten-Status. */
  status: AgentStatus;
  /** Optionale, eigene Beschriftung statt des Standardtexts. */
  label?: string;
  className?: string;
}

/** Kompakter, barrierefreier Status-Chip fuer einen KI-Agenten. */
export function AgentStatusIndicator({
  status,
  label,
  className,
}: AgentStatusIndicatorProps) {
  const meta = STATUS_META[status];
  const text = label ?? meta.label;
  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
        meta.toneClass,
        className,
      )}
    >
      <meta.Icon
        className={cn(
          "h-4 w-4 shrink-0",
          meta.spinnt && "animate-spin motion-reduce:animate-none",
        )}
        aria-hidden="true"
      />
      {/* Bedeutung mehrkanalig — das Praefix + der sichtbare Text tragen sie, nicht die Farbe. */}
      <span className="sr-only">Status des Assistenten: </span>
      <span>{text}</span>
    </span>
  );
}
