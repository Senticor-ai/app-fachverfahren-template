// components/Banner — das GENERISCHE Hinweis-/System-Banner für seitenweite Meldungen.
//
// Vier semantische Varianten (info / warn / success / error), die 1:1 auf die Status-Tokens der
// Referenz-styles.css mappen (status-info / status-warn / status-ok / status-block + -soft). Optional
// schließbar; ein passendes Lucide-Icon je Variante; beliebige Aktions-Slots (Buttons/Links) rechts.
// Vollständig dep-frei: nur React + Tailwind + lucide + cva + cn. KEIN Domänen-Literal — Titel/Text/Aktionen
// kommen ausschließlich über props/children.
//
// Barrierefreiheit (BITV 2.0 / WCAG 2.2 AA):
//  - role="alert" + aria-live="assertive" für error/warn (sofortige Ansage), role="status" + aria-live="polite"
//    für info/success (unaufdringliche Ansage)
//  - Farbe ist NIE alleiniger Bedeutungsträger: jede Variante trägt ein eigenes Icon + sichtbaren Titel
//  - Schließen-Knopf: echtes <button> mit aria-label, sichtbarer Fokus-Ring, Zielgröße >= 24px
//  - Icons sind dekorativ → aria-hidden; Kontrast über token-getriebene Vorder-/Rahmenfarben (>= 4.5:1)
//  - keine verspielte Bewegung; etwaige Übergänge respektieren prefers-reduced-motion
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../lib/utils.js";

const bannerVariants = cva(
  "relative flex items-start gap-3 rounded-lg border p-4 text-sm transition-colors duration-150 ease-out motion-reduce:transition-none",
  {
    variants: {
      variant: {
        info: "border-status-info/30 bg-status-info-soft text-foreground",
        warn: "border-status-warn/40 bg-status-warn-soft text-foreground",
        success: "border-status-ok/30 bg-status-ok-soft text-foreground",
        error: "border-status-block/30 bg-status-block-soft text-foreground",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

/** Akzent-Farbe des Icons je Variante — token-getrieben (kein Hardcode). */
const iconToneClass: Record<NonNullable<BannerVariant>, string> = {
  info: "text-status-info",
  warn: "text-status-warn",
  success: "text-status-ok",
  error: "text-status-block",
};

/** Standard-Icon je Variante — überschreibbar via `icon`-Prop. */
const variantIcon: Record<NonNullable<BannerVariant>, LucideIcon> = {
  info: Info,
  warn: AlertTriangle,
  success: CheckCircle2,
  error: XCircle,
};

type BannerVariant = VariantProps<typeof bannerVariants>["variant"];

export interface BannerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof bannerVariants> {
  /** Optionaler fettgedruckter Titel über dem Fließtext. */
  title?: React.ReactNode;
  /** Eigenes Icon statt des Varianten-Standards. `null` blendet das Icon aus. */
  icon?: LucideIcon | null;
  /** Ob das Banner schließbar ist (zeigt einen X-Knopf rechts oben). */
  dismissible?: boolean;
  /** Wird beim Schließen gerufen. Das Banner selbst bleibt kontrolliert — der Aufrufer entfernt es. */
  onDismiss?: () => void;
  /** Beschriftung des Schließen-Knopfs (Screenreader). Default: „Hinweis schließen". */
  dismissLabel?: string;
  /** Optionale Aktions-Slots (Buttons/Links) — werden unter dem Text ausgerichtet. */
  actions?: React.ReactNode;
}

/**
 * Token-getriebenes Hinweis-/System-Banner. Die Variante bestimmt Farbton, Standard-Icon UND die ARIA-Rolle
 * (status vs. alert), damit Bedeutung nicht allein über Farbe transportiert wird.
 */
export const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
  (
    {
      variant = "info",
      title,
      icon,
      dismissible = false,
      onDismiss,
      dismissLabel = "Hinweis schließen",
      actions,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const aktiveVariante = (variant ?? "info") as NonNullable<BannerVariant>;
    // error/warn = dringlich → assertive/alert; info/success = ruhig → polite/status.
    const dringlich = aktiveVariante === "error" || aktiveVariante === "warn";
    const IconComp = icon === null ? null : icon ?? variantIcon[aktiveVariante];

    return (
      <div
        ref={ref}
        role={dringlich ? "alert" : "status"}
        aria-live={dringlich ? "assertive" : "polite"}
        className={cn(bannerVariants({ variant }), className)}
        {...props}
      >
        {IconComp && (
          <IconComp
            className={cn("mt-0.5 h-5 w-5 shrink-0", iconToneClass[aktiveVariante])}
            aria-hidden="true"
          />
        )}

        <div className="min-w-0 flex-1">
          {title && (
            <p className="text-sm font-semibold text-foreground">{title}</p>
          )}
          {children && (
            <div
              className={cn(
                "text-sm leading-relaxed text-muted-foreground",
                title ? "mt-1" : undefined,
              )}
            >
              {children}
            </div>
          )}
          {actions && (
            <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>

        {dismissible && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={dismissLabel}
            className={cn(
              "-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground",
              "transition-colors duration-150 ease-out hover:bg-accent hover:text-accent-foreground motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  },
);
Banner.displayName = "Banner";

export { bannerVariants };
