// CaseAktionen — die (server-autoritative) Aktionsleiste einer Fallakte: die im aktuellen Zustand
// ERLAUBTEN Übergänge als Buttons. Die erlaubten Aktionen kommen aus dem Verfahren (GET /allowed-actions);
// ein Klick löst POST /transitions aus (Zielzustand/Rechtsgrundlage server-seitig, nie aus dem Client).
// Die Governance ist server-erzwungen: Vier-Augen (403), Optimistic-Locking (409), unzulässig (400) — hier
// wird sie nur MENSCHLICH LESBAR gemacht, nicht dupliziert. Rein über den casePort, kein `fetch`.
import { useState } from "react";
import { Badge, Button } from "@senticor/fachverfahren-kit";
import { casePort } from "../app/case-port.js";
import { CaseRequestError, type CaseAllowedAction } from "../case-client.js";

/** „aktivieren" → „Aktivieren" (nur Erst-Großschreibung; die Aktion bleibt verfahrensdefiniert, kein Literal-Mapping). */
function aktionLabel(action: string): string {
  return action.length > 0
    ? action.charAt(0).toUpperCase() + action.slice(1)
    : action;
}

export interface CaseAktionenProps {
  caseId: string;
  /** Aktueller Zustand (für die Anzeige rechts in der Kopfzeile). */
  state: string;
  /** Fall-Version für das Optimistic-Locking des Übergangs. */
  version: number;
  /** Die im aktuellen Zustand erlaubten Aktionen (aus dem Verfahren). */
  actions: readonly CaseAllowedAction[];
  /** Nach erfolgreichem (oder konfligierendem) Übergang: die Akte neu laden. */
  onDone: () => void | Promise<void>;
}

/** Statuspille + erlaubte Übergänge als Buttons; server-erzwungene Governance wird lesbar gemeldet. */
export function CaseAktionen({
  caseId,
  state,
  version,
  actions,
  onDone,
}: CaseAktionenProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function ausfuehren(action: string): Promise<void> {
    setBusy(true);
    setFehler(null);
    try {
      await casePort.transitionCase(caseId, {
        action,
        expectedVersion: version,
      });
      await onDone();
    } catch (error) {
      if (error instanceof CaseRequestError) {
        if (error.status === 403) {
          setFehler(
            "Freigabe erforderlich: Dieser Schritt muss von einer zweiten Person ausgelöst werden (Vier-Augen-Prinzip).",
          );
        } else if (error.status === 409) {
          setFehler(
            "Der Fall wurde zwischenzeitlich geändert. Er wird neu geladen — bitte erneut versuchen.",
          );
          await onDone();
        } else if (error.status === 400) {
          setFehler("Diese Aktion ist im aktuellen Zustand nicht möglich.");
        } else {
          setFehler("Aktion fehlgeschlagen. Bitte erneut versuchen.");
        }
      } else {
        setFehler("Aktion fehlgeschlagen. Bitte erneut versuchen.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">
          <span className="font-normal text-muted-foreground">Zustand:</span>{" "}
          {state}
        </Badge>
        {actions.map((aktion) => (
          <Button
            key={aktion.action}
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            aria-busy={busy}
            title={
              aktion.requiresFourEyes
                ? "Vier-Augen-Prinzip: Freigabe durch eine zweite Person erforderlich"
                : undefined
            }
            onClick={() => void ausfuehren(aktion.action)}
          >
            {aktionLabel(aktion.action)}
            {aktion.requiresFourEyes && (
              <span className="ml-1 text-muted-foreground">(Vier-Augen)</span>
            )}
          </Button>
        ))}
      </div>
      {fehler !== null && (
        <p role="alert" className="max-w-xs text-xs text-destructive">
          {fehler}
        </p>
      )}
    </div>
  );
}
