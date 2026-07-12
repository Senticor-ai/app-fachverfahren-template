// fachverfahren-kit/hooks/use-step-machine — generische Wizard-/Flow-Maschine (dep-frei, ohne xstate).
//
// Erzwingt den Behörden-Flow-Contract deklarativ: one-thing-per-page → CheckAnswers (Review) →
// Confirmation. `requireReviewBeforeSubmit` ist fix true (WCAG 3.3.4: vor bindender Abgabe prüfen/
// korrigieren). Schritte kommen data-driven aus der Config (keine Domänen-Literale).
// DEP-FREI: nur React. Validierung je Schritt liegt beim Aufrufer (liefert Issues → Block + Fokus).
import * as React from "react";

export interface FlowStep {
  /** Stabile id des Schritts (für goTo/Edit aus dem Review). */
  id: string;
  /** Sichtbares Label (Schritt-Indikator). */
  label: string;
  /** Optionaler Schritt (darf übersprungen werden). */
  optional?: boolean;
}

/** Globale Phase des Flows. */
export type FlowPhase =
  "in-progress" | "review" | "submitting" | "confirmed" | "error";

export interface UseStepMachineOptions {
  steps: FlowStep[];
  /** Vor der Abgabe IMMER ein Review erzwingen (fix true; Parameter nur für Tests/Sonderfälle). */
  requireReviewBeforeSubmit?: boolean;
  /** Validiert einen Schritt; gibt Feld-Issues zurück (leer = gültig → weiter erlaubt). */
  validateStep?: (index: number) => Array<{ feldId: string; text: string }>;
}

export interface StepMachineApi {
  readonly phase: FlowPhase;
  readonly index: number;
  readonly step: FlowStep;
  readonly steps: FlowStep[];
  readonly visited: ReadonlySet<string>;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly isReview: boolean;
  readonly progress: number;
  /** Validiert den aktuellen Schritt; bei Issues KEIN Wechsel (Issues zurückgegeben für Fokus/Summary). */
  next: () => Array<{ feldId: string; text: string }>;
  back: () => void;
  /** Direkt zu einem Schritt (z. B. „Ändern" aus dem Review). */
  goTo: (id: string) => void;
  /** Aus dem Review die bindende Abgabe auslösen. */
  submit: (task: () => Promise<void>) => Promise<void>;
  reset: () => void;
}

/**
 * @example
 * const flow = useStepMachine({ steps, validateStep: (i) => validate(stepData[i]) });
 * <Button onClick={() => { const issues = flow.next(); if (issues.length) focusSummary(issues); }}>Weiter</Button>
 * {flow.isReview && <CheckAnswers onSubmit={() => flow.submit(einreichen)} onEdit={flow.goTo} />}
 */
export function useStepMachine({
  steps,
  requireReviewBeforeSubmit = true,
  validateStep,
}: UseStepMachineOptions): StepMachineApi {
  const [phase, setPhase] = React.useState<FlowPhase>("in-progress");
  const [index, setIndex] = React.useState(0);
  const [visited, setVisited] = React.useState<Set<string>>(
    () => new Set(steps[0] ? [steps[0].id] : []),
  );

  const markVisited = React.useCallback((id: string) => {
    setVisited((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const next = React.useCallback(() => {
    const issues = validateStep?.(index) ?? [];
    if (issues.length > 0) return issues;
    if (index < steps.length - 1) {
      const nextIdx = index + 1;
      setIndex(nextIdx);
      markVisited(steps[nextIdx].id);
    } else if (requireReviewBeforeSubmit) {
      setPhase("review");
    }
    return [];
  }, [index, steps, validateStep, requireReviewBeforeSubmit, markVisited]);

  const back = React.useCallback(() => {
    setPhase((p) => {
      if (p === "review") {
        setIndex(steps.length - 1);
        return "in-progress";
      }
      return p;
    });
    setIndex((i) =>
      phase === "review" ? steps.length - 1 : Math.max(0, i - 1),
    );
  }, [phase, steps.length]);

  const goTo = React.useCallback(
    (id: string) => {
      const i = steps.findIndex((s) => s.id === id);
      if (i >= 0) {
        setIndex(i);
        setPhase("in-progress");
        markVisited(id);
      }
    },
    [steps, markVisited],
  );

  const submit = React.useCallback(async (task: () => Promise<void>) => {
    setPhase("submitting");
    try {
      await task();
      setPhase("confirmed");
    } catch {
      setPhase("error");
    }
  }, []);

  const reset = React.useCallback(() => {
    setPhase("in-progress");
    setIndex(0);
    setVisited(new Set(steps[0] ? [steps[0].id] : []));
  }, [steps]);

  const isReview = phase === "review";
  return {
    phase,
    index,
    step: steps[index] ?? steps[0],
    steps,
    visited,
    isFirst: index === 0,
    isLast: index === steps.length - 1,
    isReview,
    progress:
      steps.length > 0 ? (isReview ? 1 : (index + 1) / (steps.length + 1)) : 0,
    next,
    back,
    goTo,
    submit,
    reset,
  };
}
