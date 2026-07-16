// /amt/akte/:id — die 360°-Fall-/Dossier-Sicht EINER Akte (DossierAkte360) über der Fall/Task-API.
// Lädt via casePort getCase + listTasks + getProgress + listAudit und reicht die (rein präsentierende)
// Kit-Sicht mit den abgebildeten Daten. Analog zum Boards-Muster liegt die Netz-Naht im casePort, das
// Rendering im Kit; hier steckt die Lade-Orchestrierung, die Lade-/Fehler-/Nicht-gefunden-Zustände UND
// das interaktive Abhaken eines Schritts (patchTask → Fortschritt server-seitig neu gerechnet → neu geladen).
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileQuestion } from "lucide-react";
import {
  Button,
  DossierAkte360,
  EmptyState,
  ErrorState,
  SkeletonCard,
} from "@senticor/fachverfahren-kit";
import { casePort } from "../app/case-port.js";
import type {
  CaseAuditEvent,
  CaseSummary,
  CaseTask,
  CaseZielFortschritt,
} from "../case-client.js";
import { Shell } from "../app/shell.js";
import { toAkteProps, toVerlauf } from "./case-akte-view.js";

/** Die roh geladenen Akten-Daten (die Sicht hält keinen abgeleiteten Zustand — Props werden im Render gerechnet). */
interface AkteDaten {
  caseSummary: CaseSummary;
  tasks: CaseTask[];
  progress: CaseZielFortschritt[];
  audit: CaseAuditEvent[];
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "notFound" }
  | { kind: "ready"; data: AkteDaten };

export function AmtAktePage(): React.JSX.Element {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      // getCase zuerst: fehlt die Akte (bzw. Fremd-Behörde → 404), gilt „nicht gefunden" — die
      // task/progress/audit-Routen antworten dann ebenfalls 404, also gar nicht erst anfragen.
      const caseSummary = await casePort.getCase(id);
      if (!caseSummary) {
        setState({ kind: "notFound" });
        return;
      }
      const [tasks, progress, audit] = await Promise.all([
        casePort.listTasks(id),
        casePort.getProgress(id),
        casePort.listAudit(id),
      ]);
      setState({
        kind: "ready",
        data: { caseSummary, tasks, progress, audit },
      });
    } catch {
      setState({ kind: "error" });
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Einen Schritt abhaken/zurücksetzen: der Server ist die Wahrheit — patchTask schreibt `data.erledigt`,
  // der Fortschritt wird server-seitig neu aggregiert. Danach Tasks + Fortschritt ohne Skeleton neu laden
  // (Checkbox + Balken aktualisieren sich gemeinsam). Bei Fehler (409/503/…) die Akte vollständig resynchronisieren.
  const handleSchrittToggle = useCallback(
    async (_zielId: string, schrittId: string, erledigt: boolean) => {
      try {
        await casePort.patchTask(schrittId, { dataPatch: { erledigt } });
        const [tasks, progress] = await Promise.all([
          casePort.listTasks(id),
          casePort.getProgress(id),
        ]);
        setState((prev) =>
          prev.kind === "ready"
            ? { kind: "ready", data: { ...prev.data, tasks, progress } }
            : prev,
        );
      } catch {
        await reload();
      }
    },
    [id, reload],
  );

  return (
    <Shell persona="sachbearbeitung" activeNavKey="akten">
      <section className="mx-auto w-full max-w-5xl px-6 py-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-4"
          onClick={() => navigate("/amt/akten")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Zur Aktenliste
        </Button>

        {state.kind === "loading" ? (
          <div
            role="status"
            aria-label="Akte wird geladen"
            className="space-y-4"
          >
            <SkeletonCard className="h-24" />
            <SkeletonCard className="h-64" />
          </div>
        ) : state.kind === "error" ? (
          <ErrorState
            title="Akte konnte nicht geladen werden"
            description="Bitte erneut versuchen. Besteht das Problem fort, ist die Sitzung ggf. abgelaufen."
            onRetry={() => void reload()}
          />
        ) : state.kind === "notFound" ? (
          <EmptyState
            icon={FileQuestion}
            title="Akte nicht gefunden"
            description="Die angeforderte Akte existiert nicht oder liegt außerhalb Ihrer Behörde."
            action={{
              label: "Zur Aktenliste",
              onClick: () => navigate("/amt/akten"),
            }}
          />
        ) : (
          <DossierAkte360
            {...toAkteProps(
              state.data.caseSummary,
              state.data.tasks,
              state.data.progress,
            )}
            verlauf={toVerlauf(state.data.audit)}
            onSchrittToggle={handleSchrittToggle}
          />
        )}
      </section>
    </Shell>
  );
}
