// fachverfahren-kit/components/KiVorschlag — KI-Transparenz-Block, abgeleitet aus etablierten Public-Sector-UX-Mustern
// (KI-Kennzeichnung + Konfidenz-Balken). GENERISCH: konsumiert NUR die `KiEinschaetzung` aus dem Vertrag
// (confidence 0..1 + flags + begründung). Flags sind beliebige Schlüssel der Leistung — NICHTS ist hartkodiert
// (keine verfahrensspezifischen Flag-Schlüssel im Code). KI assistiert, Mensch entscheidet: Konfidenz, Flags und Begründung sichtbar.
import { Sparkles, AlertTriangle, ShieldCheck } from "lucide-react";
import type { KiEinschaetzung } from "../types.js";
import { cn } from "../lib/utils.js";

/** Konfidenz-Balken (0..1 → %); Ton nach Höhe — wie in der Referenz `ConfidenceBar`. */
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  const tone =
    value >= 0.85
      ? "bg-status-ok"
      : value >= 0.7
        ? "bg-accent"
        : "bg-status-warn";
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="KI-Konfidenz"
      >
        <div className={cn("h-full", tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}

/** Ein Flag als weiches KI-Badge (Hinweis aus der Einschätzung) — Beschriftung aus `flagLabel` oder roh. */
function FlagBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-status-info-soft px-1.5 py-0.5 text-xs font-medium text-status-info">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      {children}
    </span>
  );
}

export interface KiVorschlagProps {
  /** Die KI-Einschätzung des Vorgangs (aus `vorgang.ki`). */
  ki: KiEinschaetzung;
  /** Optionale Konfidenz-Schwelle für „autonom-fähig" (aus `config.ki.schwelleAutonom`). */
  schwelleAutonom?: number;
  /** Optionale Übersetzung eines Flag-Schlüssels in einen lesbaren Text (data-driven aus der Leistung). */
  flagLabel?: (flag: string) => string;
  className?: string;
}

/** KI-Transparenz: Konfidenz-Anzeige + Flags + Begründung. Rein präsentierend, keine Domänen-Literale. */
export function KiVorschlag({
  ki,
  schwelleAutonom,
  flagLabel,
  className,
}: KiVorschlagProps) {
  // „Autonom-fähig": hohe Konfidenz UND keine offenen Flags (nur wenn eine Schwelle vorgegeben ist).
  const autonom =
    schwelleAutonom !== undefined &&
    ki.confidence >= schwelleAutonom &&
    ki.flags.length === 0;

  return (
    <div
      className={cn("rounded-md border border-border bg-card p-3", className)}
      aria-label="KI-Vorschlag"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles
            className="h-3.5 w-3.5 text-status-info"
            aria-hidden="true"
          />
          KI-Vorschlag
        </span>
        {autonom && (
          <span className="inline-flex items-center gap-1 rounded-sm bg-status-ok-soft px-1.5 py-0.5 text-xs font-bold text-status-ok">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            autonom-fähig
          </span>
        )}
      </div>

      <div className="mt-2">
        <ConfidenceBar value={ki.confidence} />
      </div>

      {ki.flags.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground/70">
            Hinweise der KI
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ki.flags.map((flag) => (
              <FlagBadge key={flag}>
                {flagLabel ? flagLabel(flag) : flag}
              </FlagBadge>
            ))}
          </div>
        </div>
      )}

      {ki.begruendung && (
        <div className="mt-3 space-y-1">
          <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground/70">
            Begründung
          </span>
          <p className="text-xs leading-relaxed text-foreground">
            {ki.begruendung}
          </p>
        </div>
      )}
    </div>
  );
}
