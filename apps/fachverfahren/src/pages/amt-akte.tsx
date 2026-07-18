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
  CaseAllowedActions,
  CaseAuditEvent,
  CaseSummary,
  CaseTask,
  CaseZielFortschritt,
} from "../case-client.js";
import { Shell } from "../app/shell.js";
import { CaseAktionen } from "./case-aktionen.js";
import { toAkteProps, toVerlauf } from "./case-akte-view.js";
import { VermerkAktionen } from "./vermerk-aktionen.js";

/** Die roh geladenen Akten-Daten (die Sicht hält keinen abgeleiteten Zustand — Props werden im Render gerechnet). */
interface AkteDaten {
  caseSummary: CaseSummary;
  tasks: CaseTask[];
  progress: CaseZielFortschritt[];
  audit: CaseAuditEvent[];
  allowedActions: CaseAllowedActions;
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

  // Alle Akten-Daten holen (OHNE den Lade-Zustand zu setzen) → als LoadState. getCase zuerst: fehlt die Akte
  // (bzw. Fremd-Behörde → 404), gilt „nicht gefunden"; die task/progress/audit/actions-Routen antworten dann
  // ebenfalls 404, also gar nicht erst anfragen.
  const fetchAkte = useCallback(async (): Promise<LoadState> => {
    const caseSummary = await casePort.getCase(id);
    if (!caseSummary) return { kind: "notFound" };
    const [tasks, progress, audit, allowedActions] = await Promise.all([
      casePort.listTasks(id),
      casePort.getProgress(id),
      casePort.listAudit(id),
      casePort.listAllowedActions(id),
    ]);
    return {
      kind: "ready",
      data: { caseSummary, tasks, progress, audit, allowedActions },
    };
  }, [id]);

  // Voll-Reload MIT Skeleton — Erst-Laden + Fehler-Retry.
  const reload = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      setState(await fetchAkte());
    } catch {
      setState({ kind: "error" });
    }
  }, [fetchAkte]);

  // Reload OHNE Skeleton: die Akte + Aktionsleiste bleiben montiert. Nach einer Aktion (Übergang/Abhaken) —
  // damit eine role=alert-Meldung (z. B. 409-Konflikt) nicht durch einen Unmount verschwindet, bevor sie
  // angesagt werden kann, und die Fall-Version für einen erneuten Versuch frisch ist.
  const silentReload = useCallback(async () => {
    try {
      setState(await fetchAkte());
    } catch {
      setState({ kind: "error" });
    }
  }, [fetchAkte]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Einen Schritt abhaken/zurücksetzen: der Server ist die Wahrheit — patchTask schreibt `data.erledigt`,
  // der Fortschritt wird server-seitig neu aggregiert. Danach Tasks + Fortschritt ohne Skeleton neu laden
  // (Checkbox + Balken aktualisieren sich gemeinsam). Bei Fehler (409/503/…) ohne Skeleton resynchronisieren.
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
        await silentReload();
      }
    },
    [id, silentReload],
  );

  // Einen Vermerk erfassen: als Task (taskKind "notiz") anlegen — der Server setzt die Urheber:in aus der
  // Session (data.createdBy). Danach ohne Skeleton neu laden, damit die Notiz in der Sektion erscheint.
  const handleNotizAdd = useCallback(
    async (text: string) => {
      await casePort.createTask(id, { title: text, taskKind: "notiz" });
      await silentReload();
    },
    [id, silentReload],
  );

  // Unveränderlicher Aktenvermerk (append-only im Fall-Audit) — Mensch ODER KI-Entwurf. Danach ohne
  // Skeleton neu laden, damit der Vermerk im Verlauf erscheint (KI-Entwürfe dort als prüfpflichtig).
  const handleVermerkAdd = useCallback(
    async (text: string) => {
      await casePort.createVermerk(id, { text });
      await silentReload();
    },
    [id, silentReload],
  );
  const handleKiVermerk = useCallback(
    async (task: string) => {
      await casePort.createKiVermerk(id, { task });
      await silentReload();
    },
    [id, silentReload],
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
          <>
            <DossierAkte360
              {...toAkteProps(
                state.data.caseSummary,
                state.data.tasks,
                state.data.progress,
              )}
              verlauf={toVerlauf(state.data.audit)}
              onSchrittToggle={handleSchrittToggle}
              onNotizAdd={handleNotizAdd}
              kopfAktion={
                <CaseAktionen
                  caseId={id}
                  state={state.data.allowedActions.state}
                  version={state.data.allowedActions.version}
                  actions={state.data.allowedActions.actions}
                  onDone={silentReload}
                />
              }
            />
            <VermerkAktionen
              onVermerk={handleVermerkAdd}
              onKiVermerk={handleKiVermerk}
            />
          </>
        )}
      </section>
    </Shell>
  );
}
