// /amt/akte/:id — die 360°-Fall-/Dossier-Sicht EINER Akte (DossierAkte360) über der Fall/Task-API.
// Lädt via casePort getCase + listTasks + getProgress und reicht die (rein präsentierende) Kit-Sicht
// mit den abgebildeten Daten. Analog zum Boards-Muster liegt die Netz-Naht im casePort, das Rendering
// im Kit; hier steckt nur die Lade-Orchestrierung + Lade-/Fehler-/Nicht-gefunden-Zustände.
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileQuestion } from "lucide-react";
import {
  Button,
  DossierAkte360,
  EmptyState,
  ErrorState,
  SkeletonCard,
  type DossierAkte360Props,
} from "@senticor/fachverfahren-kit";
import { casePort } from "../app/case-port.js";
import { Shell } from "../app/shell.js";
import { toAkteProps } from "./case-akte-view.js";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "notFound" }
  | { kind: "ready"; props: DossierAkte360Props };

export function AmtAktePage(): React.JSX.Element {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      // getCase zuerst: fehlt die Akte (bzw. Fremd-Behörde → 404), gilt „nicht gefunden" — die
      // task/progress-Routen antworten dann ebenfalls 404, also gar nicht erst anfragen.
      const caseSummary = await casePort.getCase(id);
      if (!caseSummary) {
        setState({ kind: "notFound" });
        return;
      }
      const [tasks, progress] = await Promise.all([
        casePort.listTasks(id),
        casePort.getProgress(id),
      ]);
      setState({
        kind: "ready",
        props: toAkteProps(caseSummary, tasks, progress),
      });
    } catch {
      setState({ kind: "error" });
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <Shell persona="sachbearbeitung">
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
          <DossierAkte360 {...state.props} />
        )}
      </section>
    </Shell>
  );
}
