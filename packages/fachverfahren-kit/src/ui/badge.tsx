// fachverfahren-kit/ui/badge — generisches shadcn/ui-Badge (OSS, Radix-Primitive-Stil), token-getrieben.
// Die Status-Töne mappen 1:1 auf die Design-Tokens (status-ok/warn/info/block/neu) der Referenz-styles.css.
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils.js";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium leading-none",
  {
    variants: {
      tone: {
        neu: "border-border bg-secondary text-foreground",
        info: "border-status-info/30 bg-status-info-soft text-foreground",
        warn: "border-status-warn/40 bg-status-warn-soft text-foreground",
        ok: "border-status-ok/30 bg-status-ok-soft text-foreground",
        block: "border-status-block/30 bg-status-block-soft text-foreground",
      },
    },
    defaultVariants: { tone: "neu" },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

/** Farbiges Badge nach Ton — die Inhalte (Label/Icon) kommen ausschließlich als children. */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { badgeVariants };
