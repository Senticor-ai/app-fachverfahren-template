// fachverfahren-kit/ui/alert — statische Hinweis-/Status-Box (shadcn/ui-Stil), token-getrieben.
// Die Varianten mappen 1:1 auf die semantischen Status-Tokens der Referenz-styles.css
// (default = neutral/Card, destructive = block/err, warn = warn, success = ok). Keine Ad-hoc-Farben.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";

import { cn } from "../lib/utils.js";

const alertVariants = cva(
  "relative flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground [&>svg]:text-muted-foreground",
        destructive:
          "border-status-block/30 bg-status-block-soft text-foreground [&>svg]:text-status-block",
        warn: "border-status-warn/40 bg-status-warn-soft text-foreground [&>svg]:text-status-warn",
        success:
          "border-status-ok/30 bg-status-ok-soft text-foreground [&>svg]:text-status-ok",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

/** Default-Icon je Variante — kann per `icon`-Prop überschrieben (oder mit `null` unterdrückt) werden. */
const defaultIconFor: Record<NonNullable<AlertVariant>, LucideIcon> = {
  default: Info,
  destructive: AlertCircle,
  warn: AlertTriangle,
  success: CheckCircle2,
};

type AlertVariant = VariantProps<typeof alertVariants>["variant"];

export interface AlertProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">,
    VariantProps<typeof alertVariants> {
  /** Überschrift der Box (optional). */
  title?: React.ReactNode;
  /** Beschreibungstext (optional — alternativ über children). */
  description?: React.ReactNode;
  /**
   * Eigenes Icon (Lucide-Komponente). Standard ist variantenabhängig.
   * `null` unterdrückt das Icon vollständig.
   */
  icon?: LucideIcon | null;
}

/**
 * Statische Alert-/Hinweis-Box. Trägt `role="alert"` bei warnenden/destruktiven Tönen
 * (assertive Bedeutung), sonst `role="status"` (höflich, nicht unterbrechend).
 * Bedeutung wird nie allein über Farbe transportiert — Icon + Text tragen sie mit.
 */
export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, title, description, icon, children, role, ...props }, ref) => {
    const effectiveVariant: NonNullable<AlertVariant> = variant ?? "default";
    const Icon = icon === null ? null : (icon ?? defaultIconFor[effectiveVariant]);
    const computedRole =
      role ??
      (effectiveVariant === "destructive" || effectiveVariant === "warn" ? "alert" : "status");

    return (
      <div ref={ref} role={computedRole} className={cn(alertVariants({ variant }), className)} {...props}>
        {Icon ? <Icon aria-hidden="true" /> : null}
        <div className="flex min-w-0 flex-col gap-1">
          {title ? (
            <AlertTitle>{title}</AlertTitle>
          ) : null}
          {description ? <AlertDescription>{description}</AlertDescription> : null}
          {children}
        </div>
      </div>
    );
  },
);
Alert.displayName = "Alert";

/** Überschrift einer Alert-Box — text-base/semibold, ruhig. */
export const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn("text-base font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = "AlertTitle";

/** Beschreibungstext einer Alert-Box — text-sm, gedämpfter Ton bei neutraler Variante. */
export const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm leading-relaxed [&_p]:leading-relaxed", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { alertVariants };
