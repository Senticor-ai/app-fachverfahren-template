// NeueAkteForm — legt eine neue Fallakte an: Verfahren wählen (aus der server-seitigen Registry) + eine
// synthetische Kennung der/des Beteiligten. Der Startzustand ist der erste `allowedState` des Verfahrens
// (Konvention: der Eingangszustand). Rein über den casePort; Server validiert Verfahren/Zustand.
import { useEffect, useState } from "react";
import { Button } from "@senticor/fachverfahren-kit";
import { casePort } from "../app/case-port.js";
import { CaseRequestError, type ProcedureSummary } from "../case-client.js";

export interface NeueAkteFormProps {
  /** Nach erfolgreicher Anlage: die neue caseId (der Aufrufer navigiert zur Akte). */
  onCreated: (caseId: string) => void;
  onCancel: () => void;
}

const inputClass =
  "w-full rounded-md border border-input bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function NeueAkteForm({
  onCreated,
  onCancel,
}: NeueAkteFormProps): React.JSX.Element {
  const [procedures, setProcedures] = useState<ProcedureSummary[] | null>(null);
  const [procKey, setProcKey] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    casePort
      .listProcedures()
      .then((geladen) => {
        if (!alive) return;
        setProcedures(geladen);
        const first = geladen[0];
        if (first) setProcKey(`${first.procedureId}:${first.version}`);
      })
      .catch(() => {
        if (alive) setFehler("Verfahren konnten nicht geladen werden.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const selected = procedures?.find(
    (p) => `${p.procedureId}:${p.version}` === procKey,
  );

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (busy || selected === undefined) return;
    const subjectId = subject.trim();
    if (subjectId === "") {
      setFehler("Bitte eine Kennung der/des Beteiligten angeben.");
      return;
    }
    const initialState = selected.allowedStates[0];
    if (initialState === undefined) {
      setFehler("Das gewählte Verfahren hat keinen Zustand.");
      return;
    }
    setBusy(true);
    setFehler(null);
    try {
      const created = await casePort.createCase({
        procedureId: selected.procedureId,
        procedureVersion: selected.version,
        state: initialState,
        subjectIds: [subjectId],
      });
      onCreated(created.caseId);
    } catch (error) {
      setFehler(
        error instanceof CaseRequestError
          ? "Akte konnte nicht angelegt werden (Verfahren/Zustand prüfen)."
          : "Anlegen fehlgeschlagen. Bitte erneut versuchen.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="rounded-lg border border-border bg-card p-5"
      aria-label="Neue Akte anlegen"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="neue-akte-verfahren" className="text-sm font-medium">
            Verfahren
          </label>
          <select
            id="neue-akte-verfahren"
            value={procKey}
            onChange={(event) => setProcKey(event.target.value)}
            disabled={procedures === null || procedures.length === 0}
            className={inputClass}
          >
            {procedures === null ? (
              <option>Lädt …</option>
            ) : procedures.length === 0 ? (
              <option>Kein Verfahren registriert</option>
            ) : (
              procedures.map((p) => (
                <option
                  key={`${p.procedureId}:${p.version}`}
                  value={`${p.procedureId}:${p.version}`}
                >
                  {p.procedureId} · {p.version}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="neue-akte-subject" className="text-sm font-medium">
            Beteiligte:r (Kennung)
          </label>
          <input
            id="neue-akte-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="z. B. subject.42"
            className={inputClass}
          />
        </div>
      </div>

      {selected !== undefined && (
        <p className="mt-2 text-xs text-muted-foreground">
          Startzustand:{" "}
          <span className="font-medium">{selected.allowedStates[0]}</span>
        </p>
      )}
      {fehler !== null && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {fehler}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={busy || selected === undefined || subject.trim() === ""}
          aria-busy={busy}
        >
          Akte anlegen
        </Button>
      </div>
    </form>
  );
}
