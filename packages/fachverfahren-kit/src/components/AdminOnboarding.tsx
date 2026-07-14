import { CheckCircle2 } from "lucide-react";
import * as React from "react";
import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardHeader } from "../ui/card.js";

export interface AdminOnboardingStep {
  key: string;
  titel: string;
  beschreibung: string;
  done?: boolean;
  href?: string;
  linkLabel?: string;
}

export interface AdminOnboardingProps {
  schritte: readonly AdminOnboardingStep[];
  onNavigate?: (href: string) => void;
  onDismiss: () => void;
  titel?: string;
  className?: string;
}

/** Reine, wiederverwendbare Checkliste. Laden, Berechtigungen und Persistenz
 *  bleiben in der App-Komposition; der Kit rendert nur den übergebenen Zustand. */
export function AdminOnboarding({
  schritte,
  onNavigate,
  onDismiss,
  titel = "Erste Schritte im Workspace",
  className,
}: AdminOnboardingProps): React.ReactElement {
  const titleId = React.useId();

  return (
    <section aria-labelledby={titleId} className={cn("w-full", className)}>
      <Card>
        <CardHeader>
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            {titel}
          </h2>
        </CardHeader>
        <CardContent className="space-y-5">
          <ol className="space-y-4">
            {schritte.map((step, index) => (
              <li key={step.key} className="flex items-start gap-3">
                {step.done ? (
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-status-ok"
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-foreground"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      {step.titel}
                    </h3>
                    {step.done && (
                      <span className="text-xs font-medium text-status-ok">
                        Erledigt
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.beschreibung}
                  </p>
                  {step.href && step.linkLabel && (
                    <a
                      href={step.href}
                      onClick={(event) => {
                        if (!onNavigate) return;
                        event.preventDefault();
                        onNavigate(step.href ?? "");
                      }}
                      className="mt-2 inline-flex min-h-11 items-center rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {step.linkLabel}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={onDismiss}>
              Ausblenden
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
