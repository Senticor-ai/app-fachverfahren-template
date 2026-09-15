// fehler-flaeche — THE NAMED SITUATION WITH A WAY ON.
//
// Every surface in this application that can fail needs the same three things, and they were missing in
// different combinations across five pages (see `ladelage.ts` for the measurement):
//   1. it says WHAT happened — and says it as an alert, so someone looking for their document does not have to
//      notice the line by chance;
//   2. it says what it does NOT mean — "we could not find out" is not "it does not exist", and on the notice
//      page that difference is an appeal deadline;
//   3. it OFFERS the remedy it names. "Bitte erneut versuchen" without a control is a dead end with text; two
//      pages did exactly that.
//
// The technical cause travels along behind a disclosure: it belongs to whoever can act on it, and it must not
// stand in the way of the person who cannot.
import type { ReactNode } from "react";
import { Button } from "@senticor/fachverfahren-kit";

export function FehlerFlaeche({
  /** What could not be loaded, as a sentence a citizen reads first. */
  titel,
  /** What the failure does NOT mean. Omit only where no false conclusion is available to draw. */
  klarstellung,
  /** The raw cause. Rendered behind a disclosure, never as the headline. */
  grund,
  /** HTTP status when the client layer carried one; `null` stays unknown rather than becoming a guess. */
  status = null,
  /** Runs the same load again. Without it the named remedy would have no control. */
  erneut,
  className,
  children,
}: {
  titel: string;
  klarstellung?: string;
  grund?: string;
  status?: number | null;
  erneut?: () => void;
  className?: string;
  children?: ReactNode;
}): React.JSX.Element {
  const abgemeldet = status === 401 || status === 403;
  return (
    <div className={`space-y-3 ${className ?? ""}`} role="alert">
      <p className="text-sm text-destructive">
        {titel}
        {abgemeldet
          ? " — Ihre Anmeldung ist abgelaufen oder Sie sind für diesen Bereich nicht berechtigt."
          : ""}
      </p>
      {klarstellung ? (
        <p className="text-sm text-muted-foreground">{klarstellung}</p>
      ) : null}
      {children}
      {grund ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Technische Ursache</summary>
          <p className="mt-1">
            {status ? `HTTP ${status} — ` : ""}
            {grund}
          </p>
        </details>
      ) : null}
      {erneut ? (
        <Button type="button" variant="secondary" onClick={erneut}>
          Erneut laden
        </Button>
      ) : null}
    </div>
  );
}
