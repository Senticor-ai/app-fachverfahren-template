// components/Callout — eingebettete Hinweis-/Notiz-Box IM Inhaltsfluss.
//
// Bewusst LEICHTER als das seitenweite `Banner` (kein dismiss, keine live-region, kein Aktions-Slot)
// und SCHÄRFER abgegrenzt als eine flächige Alert-Box: schmaler Akzentbalken links (border-l-4) +
// dezente Soft-Fläche. Deckt Rechtshinweise/Erläuterungen im Formular ab. Fünf Töne
// (info / warn / success / error / neutral), die 1:1 auf die Status-Tokens der styles.css mappen;
// `neutral` nutzt die ruhigen Basis-Tokens (border/muted), da es kein eigenes Status-Token braucht.
//
// Vollständig dep-frei: nur React + Tailwind + lucide-react + cva + cn. KEIN Domänen-Literal —
// Titel/Text/Icon kommen ausschließlich über props/children.
//
// Barrierefreiheit (BITV 2.0 / WCAG 2.2 AA):
//  - Bedeutung NIE allein über Farbe: jeder Ton trägt ein eigenes Icon PLUS ein sr-only-Präfix
//    („Hinweis:" / „Warnung:" / „Erfolg:" / „Fehler:" / „Notiz:"), das der Screenreader vorliest.
//  - Als eingebetteter, nicht-dringlicher Inhalt bewusst OHNE role="alert"/aria-live (das ist Sache
//    des seitenweiten `Banner`). Ein optionaler Titel wird über aria-labelledby mit der Box verknüpft.
//  - Icons sind dekorativ → aria-hidden; Kontrast über token-getriebene Vorder-/Rahmenfarben.
//  - Keine verspielte Bewegung; Farbübergänge respektieren prefers-reduced-motion.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  StickyNote,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../lib/utils.js";

const calloutVariants = cva(
  "relative flex items-start gap-3 rounded-md border border-l-4 p-4 text-sm transition-colors duration-150 ease-out motion-reduce:transition-none",
  {
    variants: {
      tone: {
        info: "border-status-info/30 border-l-status-info bg-status-info-soft text-foreground",
        warn: "border-status-warn/40 border-l-status-warn bg-status-warn-soft text-foreground",
        success:
          "border-status-ok/30 border-l-status-ok bg-status-ok-soft text-foreground",
        error:
          "border-status-block/30 border-l-status-block bg-status-block-soft text-foreground",
        neutral:
          "border-border border-l-muted-foreground/50 bg-surface-2 text-foreground",
      },
    },
    defaultVariants: { tone: "info" },
  },
);

type CalloutTone = NonNullable<VariantProps<typeof calloutVariants>["tone"]>;

/** Akzent-Farbe des Icons je Ton — token-getrieben (kein Hardcode). */
const iconToneClass: Record<CalloutTone, string> = {
  info: "text-status-info",
  warn: "text-status-warn",
  success: "text-status-ok",
  error: "text-status-block",
  neutral: "text-muted-foreground",
};

/** Standard-Icon je Ton — überschreibbar via `icon`-Prop. */
const toneIcon: Record<CalloutTone, LucideIcon> = {
  info: Info,
  warn: AlertTriangle,
  success: CheckCircle2,
  error: XCircle,
  neutral: StickyNote,
};

/**
 * sr-only-Präfix je Ton: trägt die Bedeutung für Screenreader, damit sie nicht nur über Farbe/Icon
 * transportiert wird (WCAG 1.4.1 — Information nicht allein über Farbe).
 */
const toneSrPrefix: Record<CalloutTone, string> = {
  info: "Hinweis:",
  warn: "Warnung:",
  success: "Erfolg:",
  error: "Fehler:",
  neutral: "Notiz:",
};

export interface CalloutProps
  extends
    Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof calloutVariants> {
  /** Optionaler fettgedruckter Titel über dem Fließtext. */
  title?: React.ReactNode;
  /**
   * Eigenes Icon statt des Ton-Standards. `null` blendet das Icon aus (das sr-only-Präfix bleibt,
   * damit die Bedeutung erhalten bleibt).
   */
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

let calloutTitleSeq = 0;

/**
 * Token-getriebene, eingebettete Hinweis-Box. Der Ton bestimmt Farbton, Standard-Icon UND das
 * sr-only-Präfix, damit die Bedeutung mehrkanalig (Farbe + Icon + Text) getragen wird.
 */
export const Callout = React.forwardRef<HTMLDivElement, CalloutProps>(
  ({ tone = "info", title, icon, className, children, ...props }, ref) => {
    const aktiverTon = (tone ?? "info") as CalloutTone;
    const DefaultIcon = toneIcon[aktiverTon];

    // Stabile, hydration-sichere ID für aria-labelledby (nur wenn ein Titel gesetzt ist).
    const reactId = React.useId?.();
    const fallbackId = React.useMemo(
      () => `fv-callout-${++calloutTitleSeq}`,
      [],
    );
    const titleId = title ? (reactId ?? fallbackId) : undefined;

    // icon === null → kein Icon; icon gesetzt → eigenes; sonst Ton-Standard.
    const iconNode =
      icon === null ? null : icon !== undefined ? (
        <span
          className={cn("mt-0.5 shrink-0", iconToneClass[aktiverTon])}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : (
        <DefaultIcon
          className={cn("mt-0.5 h-5 w-5 shrink-0", iconToneClass[aktiverTon])}
          aria-hidden="true"
        />
      );

    return (
      <div
        ref={ref}
        role="note"
        aria-labelledby={titleId}
        className={cn(calloutVariants({ tone }), className)}
        {...props}
      >
        {/* Präfix trägt die Bedeutung für assistive Technik — nie nur Farbe/Icon. */}
        <span className="sr-only">{toneSrPrefix[aktiverTon]}</span>

        {iconNode}

        <div className="min-w-0 flex-1">
          {title && (
            <p id={titleId} className="text-base font-semibold text-foreground">
              {title}
            </p>
          )}
          <div
            className={cn(
              "text-sm leading-relaxed text-muted-foreground",
              title ? "mt-1" : undefined,
            )}
          >
            {children}
          </div>
        </div>
      </div>
    );
  },
);
Callout.displayName = "Callout";

export { calloutVariants };
