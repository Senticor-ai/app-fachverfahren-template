// fachverfahren-kit/components/EvidenceCard — ein Beleg/Zitat + Quelle, aus etablierten Public-Sector-UX-
// Mustern abgeleitet: Kopf mit Quelle + optionaler Stärke-Bewertung, Korpus mit wörtlichem Zitat
// und Fundstelle. GENERISCH: konsumiert NUR Vertragsdaten — die Quelle ist ein `rechtsgrundlagen`-Eintrag
// der `LeistungConfig`, das Zitat z.B. die `Berechnung.begruendung`. KEINE verfahrensspezifischen Literale.
//
// Design-Spec: äußere Ebene = `Card` (border + shadow-sm, EINE Elevation-Quelle, Spec 4.2); Meta-Labels/Chips
// folgen der Typo-Skala mit `text-xs` (12px) als Minimum (Spec 2). Töne ausschließlich
// über `status-*`-Tokens; Stärke trägt zusätzlich Icon + Text (nie nur Farbe, WCAG 2.2 AA / BITV 2.0).
import {
  Quote,
  FileText,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { StatusTone } from "../types.js";
import { cn } from "../lib/utils.js";
import { Card } from "../ui/card.js";

/** Quelle eines Belegs — Form eines `LeistungConfig.rechtsgrundlagen`-Eintrags (Vertrag). */
export interface BelegQuelle {
  norm: string; // z.B. "§ 4 Abs. 1"
  titel: string; // Titel der Norm/Satzung
  satzung?: boolean;
}

export interface EvidenceCardProps {
  /** Wörtliches Zitat / belegte Herleitung (z.B. `Berechnung.begruendung`). */
  zitat: string;
  /** Die Quelle (aus `config.rechtsgrundlagen`). */
  quelle: BelegQuelle;
  /** Optionale konkrete Fundstelle (Dokument/Seite/Absatz). */
  fundstelle?: string;
  /** Optionale Belegstärke — mappt auf die Status-Töne (ok/warn/block). */
  staerke?: Extract<StatusTone, "ok" | "warn" | "block">;
  className?: string;
}

/** Beschriftung + Icon je Belegstärke — generisch über die Status-Töne. */
const STAERKE_META: Record<
  NonNullable<EvidenceCardProps["staerke"]>,
  { label: string; cls: string; Icon: typeof CheckCircle2 }
> = {
  ok: {
    label: "Stark belegt",
    cls: "text-status-ok bg-status-ok-soft",
    Icon: CheckCircle2,
  },
  warn: {
    label: "Plausibel",
    cls: "text-status-warn bg-status-warn-soft",
    Icon: CheckCircle2,
  },
  block: {
    label: "Schwach",
    cls: "text-status-block bg-status-block-soft",
    Icon: ShieldAlert,
  },
};

/** Ein Beleg: Kopf (Quelle + optionale Stärke), Korpus (Zitat + Fundstelle). Rein präsentierend. */
export function EvidenceCard({
  zitat,
  quelle,
  fundstelle,
  staerke,
  className,
}: EvidenceCardProps) {
  const meta = staerke ? STAERKE_META[staerke] : undefined;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles
            className="h-4 w-4 shrink-0 text-status-info"
            aria-hidden="true"
          />
          <span className="truncate text-sm font-semibold text-foreground">
            {quelle.norm}
          </span>
          {quelle.satzung && (
            <span className="shrink-0 rounded-md border border-border bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
              Satzung
            </span>
          )}
        </div>
        {meta && (
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
              meta.cls,
            )}
          >
            <meta.Icon className="h-3 w-3" aria-hidden="true" />
            {meta.label}
          </span>
        )}
      </div>

      <div className="space-y-1.5 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {quelle.titel}
        </p>
        <blockquote className="space-y-1.5 rounded-md bg-surface-2 p-2.5 text-sm">
          <p className="flex gap-1.5 italic text-foreground">
            <Quote
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span>&ldquo;{zitat}&rdquo;</span>
          </p>
          {fundstelle && (
            <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" aria-hidden="true" />
              {fundstelle}
            </div>
          )}
        </blockquote>
      </div>
    </Card>
  );
}
