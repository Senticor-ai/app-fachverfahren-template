// fachverfahren-kit/components/ViewStateBoundary — verdrahtet den 5+-Zustands-Vertrag deklarativ.
//
// Nimmt einen ViewState (aus useViewState) und rendert den korrekten Slot: loading→Skeleton,
// empty→EmptyState, fehler-artig→ErrorState, hat-Daten→children(data). Sagt jede Transition
// zentral an (StatusRegion). So ist „kein stiller Wechsel" strukturell erzwungen statt je Komponente
// nachgebaut. EINE Wahrheit für das Render-Verhalten aller listen-/detail-ladenden Komponenten.
//
// GENERISCH + DEP-FREI. BARRIEREFREI: Skeleton dekorativ, Fehler/Empty als Live-Region angesagt.
import * as React from "react";
import type { ReactNode } from "react";

import { EmptyState } from "./EmptyState.js";
import { ErrorState } from "./ErrorState.js";
import { useStatusRegion } from "./StatusRegion.js";
import { SkeletonCard } from "../ui/skeleton.js";
import { announcePoliteness } from "../hooks/use-view-state.js";
import type { ViewState } from "../hooks/use-view-state.js";

/** Zustände, in denen Daten vorliegen und children gerendert werden. */
const DATA_STATES = new Set(["ready", "success", "readOnly", "partialSuccess"]);
/** Zustände, die als Fehler-Block mit Recovery dargestellt werden. */
const ERROR_STATES = new Set(["error", "offline", "forbidden", "sessionExpired", "conflict"]);

export interface ViewStateBoundaryProps<T, E = unknown> {
  /** Der Zustand (aus useViewState().state). */
  state: ViewState<T, E>;
  /** Render-Funktion für vorhandene Daten (ready/success/readOnly/partialSuccess). */
  children: (data: T) => ReactNode;
  /** Lade-Platzhalter (Default: SkeletonCard). */
  loading?: ReactNode;
  /** Leer-Slot (Default: EmptyState mit emptyTitle). */
  empty?: ReactNode;
  /** Titel des Standard-Leerzustands. */
  emptyTitle?: string;
  /** Recovery-Aktion für Fehlerzustände (Wiederholen / erneut laden). */
  onRetry?: () => void;
  /** Zusätzliche Recovery-Affordances im Fehlerfall (z. B. „Neu anmelden" bei sessionExpired). */
  errorActions?: ReactNode;
  /** Zentrale Ansage der Meldung aktivieren (Default true). */
  announce?: boolean;
  className?: string;
}

/**
 * @example
 * <ViewStateBoundary state={view.state} emptyTitle="Keine Vorgänge" onRetry={() => view.run(load)}>
 *   {(vorgaenge) => <DataTable rows={vorgaenge} … />}
 * </ViewStateBoundary>
 */
export function ViewStateBoundary<T, E = unknown>({
  state,
  children,
  loading,
  empty,
  emptyTitle = "Keine Einträge vorhanden",
  onRetry,
  errorActions,
  announce = true,
  className,
}: ViewStateBoundaryProps<T, E>) {
  const { announce: announceFn } = useStatusRegion();

  React.useEffect(() => {
    if (announce && state.message) announceFn(state.message, announcePoliteness(state.status));
  }, [announce, announceFn, state.status, state.message]);

  if (state.status === "idle" || state.status === "loading") {
    return <div className={className}>{loading ?? <SkeletonCard />}</div>;
  }
  if (state.status === "empty") {
    return <div className={className}>{empty ?? <EmptyState title={emptyTitle} description={state.message} />}</div>;
  }
  if (ERROR_STATES.has(state.status)) {
    return (
      <div className={className}>
        <ErrorState
          title={state.message ?? "Es ist ein Fehler aufgetreten"}
          onRetry={onRetry}
          actions={errorActions}
        />
      </div>
    );
  }
  if (DATA_STATES.has(state.status) && state.data !== undefined) {
    return <div className={className}>{children(state.data as T)}</div>;
  }
  return null;
}
