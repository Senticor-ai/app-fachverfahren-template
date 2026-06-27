// fachverfahren-kit/components/StatusPill — farbiges Status-Badge, abgeleitet aus der Referenz-`StatusPill`
// (lovable amt.index.tsx), aber GENERISCH: kein hartkodierter Status. Der Pill konsumiert NUR den Vertrag —
// `status` (ein Schlüssel) + die `StatusDef[]` aus `config.statusMachine.states`. Farbe + Icon folgen dem `tone`,
// das Label kommt aus der StatusDef. Ein zweites Verfahren (Gewerbe/Parkausweis/Bauantrag) läuft unverändert.
import type { ComponentType } from "react";
import { AlertTriangle, CheckCircle2, Clock, Info, XCircle } from "lucide-react";
import type { StatusDef, StatusTone } from "../types.js";
import { Badge } from "../ui/badge.js";

/** Icon je Status-Ton — generisch über JEDES Fachverfahren (kein status-spezifisches Mapping). */
const TONE_ICON: Record<StatusTone, ComponentType<{ className?: string }>> = {
  neu: Clock,
  info: Info,
  warn: AlertTriangle,
  ok: CheckCircle2,
  block: XCircle,
};

export interface StatusPillProps {
  /** Status-Schlüssel des Vorgangs (aus `vorgang.status`). */
  status: string;
  /** Die Status-Definitionen der Leistung (aus `config.statusMachine.states`). */
  states: StatusDef[];
  className?: string;
}

/** Rendert den Status als farbiges Badge nach `tone` + passendem Icon; Label aus der StatusDef. */
export function StatusPill({ status, states, className }: StatusPillProps) {
  const def = states.find((s) => s.key === status);
  // Unbekannter Status: neutraler Fallback statt Crash (zeigt den rohen Schlüssel).
  const tone: StatusTone = def?.tone ?? "neu";
  const label = def?.label ?? status;
  const Icon = TONE_ICON[tone];

  return (
    <Badge tone={tone} className={className}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </Badge>
  );
}
