import { useId } from "react";

export type ProcessStepStatus = "done" | "current" | "upcoming" | "blocked";

export interface ProcessStepAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ProcessStep {
  id: string;
  label: string;
  status: ProcessStepStatus;
  description?: string;
  at?: string;
  ownerLabel?: string;
  action?: ProcessStepAction;
}

export interface ProcessTimelineProps {
  title?: string;
  description?: string;
  steps: ProcessStep[];
  emptyLabel?: string;
}

const statusMeta: Record<
  ProcessStepStatus,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  done: { label: "Erledigt", marker: "OK", tone: "success" },
  current: { label: "Aktuell", marker: "i", tone: "neutral" },
  upcoming: { label: "Ausstehend", marker: "…", tone: "warning" },
  blocked: { label: "Blockiert", marker: "!", tone: "critical" },
};

export function ProcessTimeline({
  title = "Verfahrensstand",
  description = "Sehen Sie, welche Schritte erledigt sind, welcher Schritt aktuell ist und was als Nächstes folgt.",
  steps,
  emptyLabel = "Keine Prozessschritte hinterlegt.",
}: ProcessTimelineProps) {
  const titleId = useId();
  const descriptionId = useId();
  const current = steps.find((step) => step.status === "current");
  const blocked = steps.some((step) => step.status === "blocked");

  return (
    <section
      className={
        blocked
          ? "ps-process-timeline ps-process-timeline--blocked"
          : "ps-process-timeline"
      }
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="ps-process-timeline__header">
        <div className="ps-process-timeline__heading">
          <p className="ps-eyebrow">Ablauf</p>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId} className="ps-muted">
            {description}
          </p>
        </div>
        {current ? (
          <span className="ps-process-timeline__current">
            <span>Aktuell</span>
            <strong>{current.label}</strong>
          </span>
        ) : null}
      </header>

      {steps.length === 0 ? (
        <p className="ps-process-timeline__empty" role="status">
          {emptyLabel}
        </p>
      ) : (
        <ol className="ps-process-timeline__list">
          {steps.map((step) => (
            <li
              key={step.id}
              className={`ps-process-timeline__item ps-process-timeline__item--${step.status}`}
              aria-current={step.status === "current" ? "step" : undefined}
            >
              <article className="ps-process-timeline__card">
                <div className="ps-process-timeline__marker" aria-hidden="true">
                  {statusMeta[step.status].marker}
                </div>
                <div className="ps-process-timeline__content">
                  <header className="ps-process-timeline__step-header">
                    <div>
                      <h3>{step.label}</h3>
                      {step.description ? <p>{step.description}</p> : null}
                    </div>
                    <StatusBadge
                      label={statusMeta[step.status].label}
                      marker={statusMeta[step.status].marker}
                      tone={statusMeta[step.status].tone}
                    />
                  </header>

                  {step.at || step.ownerLabel ? (
                    <dl className="ps-process-timeline__meta">
                      {step.at ? (
                        <div>
                          <dt>Zeitpunkt</dt>
                          <dd className="ps-num">
                            <time dateTime={step.at}>{step.at}</time>
                          </dd>
                        </div>
                      ) : null}
                      {step.ownerLabel ? (
                        <div>
                          <dt>Zuständig</dt>
                          <dd>{step.ownerLabel}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}

                  {step.action ? (
                    <div className="ps-process-timeline__actions">
                      <button
                        type="button"
                        className="ps-btn ps-btn--ghost"
                        disabled={step.action.disabled}
                        onClick={step.action.onClick}
                      >
                        {step.action.label}
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function StatusBadge({
  label,
  marker,
  tone,
}: {
  label: string;
  marker: string;
  tone: "neutral" | "success" | "warning" | "critical";
}) {
  return (
    <span className={`ps-badge ps-badge--${tone}`}>
      <span className="ps-badge__icon" aria-hidden="true">
        {marker}
      </span>
      <span>{label}</span>
    </span>
  );
}
