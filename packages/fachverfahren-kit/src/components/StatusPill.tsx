// fachverfahren-kit/components/StatusPill — farbiges Status-Badge, aus etablierten Public-Sector-UX-Mustern
// abgeleitet, aber GENERISCH: kein hartkodierter Status. Der Pill konsumiert NUR den Vertrag —
// `status` (ein Schlüssel) + die `StatusDef[]` aus `config.statusMachine.states`. Farbe + Icon folgen dem `tone`,
// das Label kommt aus der StatusDef. Ein zweites Verfahren (Gewerbe/Parkausweis/Bauantrag) läuft unverändert.
//
// Design-Spec (Abschnitt 6): Ton IMMER über `status-*`-Tokens (via Badge). Größe über `size` (sm/md) statt
// Ad-hoc-Klassen; `text-xs` (12px) ist das Minimum der Typo-Skala. Information nie nur über Farbe —
// jedes Signal trägt zusätzlich ein Icon + das textliche Label. (WCAG 2.2 AA / BITV 2.0)
import type { ComponentType } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  XCircle,
} from "lucide-react";
import type { StatusDef, StatusTone } from "../types.js";
import { cn } from "../lib/cn.js";
import { Badge } from "../ui/badge.js";

/** Icon je Status-Ton — generisch über JEDES Fachverfahren (kein status-spezifisches Mapping). */
const TONE_ICON: Record<StatusTone, ComponentType<{ className?: string }>> = {
  neu: Clock,
  info: Info,
  warn: AlertTriangle,
  ok: CheckCircle2,
  block: XCircle,
};

/** Größenvariante — `text-xs` ist das Minimum der Typo-Skala (Spec 2). */
export type StatusPillSize = "sm" | "md";

/** Icon-Kantenlänge je Größe (dekorativ, aria-hidden). */
const SIZE_ICON: Record<StatusPillSize, string> = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
};

/** Zusatz-Geometrie je Größe (Badge bringt bereits text-xs + Padding mit; md gönnt etwas Luft). */
const SIZE_BOX: Record<StatusPillSize, string> = {
  sm: "",
  md: "px-2.5 py-1",
};

export interface StatusPillProps {
  /** Status-Schlüssel des Vorgangs (aus `vorgang.status`). */
  status: string;
  /** Die Status-Definitionen der Leistung (aus `config.statusMachine.states`). */
  states: StatusDef[];
  /** Größe des Pills. Default: `sm`. */
  size?: StatusPillSize;
  className?: string;
}

/** Rendert den Status als farbiges Badge nach `tone` + passendem Icon; Label aus der StatusDef. */
export function StatusPill({
  status,
  states,
  size = "sm",
  className,
}: StatusPillProps) {
  const def = states.find((s) => s.key === status);
  // Unbekannter Status: neutraler Fallback statt Crash (zeigt den rohen Schlüssel).
  const tone: StatusTone = def?.tone ?? "neu";
  const label = def?.label ?? status;
  const Icon = TONE_ICON[tone];

  return (
    <Badge tone={tone} className={cn(SIZE_BOX[size], className)}>
      <Icon className={cn("shrink-0", SIZE_ICON[size])} aria-hidden="true" />
      {label}
    </Badge>
  );
}
