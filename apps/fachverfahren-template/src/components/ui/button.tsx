import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[hsl(var(--foreground))] text-[hsl(var(--background))] hover:opacity-90 focus-visible:outline-[hsl(var(--ring))]",
        secondary:
          "border-[hsl(var(--border))] bg-[hsl(var(--surface))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--status-info-soft))] focus-visible:outline-[hsl(var(--ring))]",
        destructive:
          "border-transparent bg-[hsl(var(--status-block))] text-white hover:opacity-90 focus-visible:outline-[hsl(var(--ring))]",
        ghost:
          "border-transparent bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--status-info-soft))] focus-visible:outline-[hsl(var(--ring))]",
      },
      size: {
        default: "h-10",
        sm: "h-9 px-3",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
