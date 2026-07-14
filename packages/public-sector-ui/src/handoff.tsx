import { type ReactNode, useId } from "react";

export type HandoffStatus =
  "draft" | "requested" | "accepted" | "returned" | "blocked";

export type HandoffStepStatus = "done" | "current" | "open" | "blocked";

export interface HandoffAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}

export interface HandoffParticipant {
  label: string;
  roleLabel?: string;
  unitLabel?: string;
}

export interface HandoffStep {
  id: string;
  label: string;
  status: HandoffStepStatus;
  description?: string;
  at?: string;
}

export interface HandoffPanelProps {
  title?: string;
  description?: string;
  status: HandoffStatus;
  statusLabel?: string;
  subjectLabel: string;
  from: HandoffParticipant;
  to: HandoffParticipant;
  requestedAt?: string;
  dueAt?: string;
  reason?: string;
  requirements?: string[];
  steps?: HandoffStep[];
  auditNote?: ReactNode;
  footer?: ReactNode;
  primaryAction?: HandoffAction;
  secondaryActions?: HandoffAction[];
  emptyRequirementsLabel?: string;
}

const statusMeta: Record<
  HandoffStatus,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  draft: { label: "Entwurf", marker: "i", tone: "neutral" },
  requested: { label: "Angefragt", marker: "→", tone: "warning" },
  accepted: { label: "Übernommen", marker: "OK", tone: "success" },
  returned: { label: "Zurückgegeben", marker: "!", tone: "warning" },
  blocked: { label: "Blockiert", marker: "x", tone: "critical" },
};

const stepMeta: Record<
  HandoffStepStatus,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  done: { label: "Erledigt", marker: "OK", tone: "success" },
  current: { label: "Aktuell", marker: "i", tone: "neutral" },
  open: { label: "Offen", marker: "…", tone: "warning" },
  blocked: { label: "Blockiert", marker: "!", tone: "critical" },
};

export function HandoffPanel({
  title = "Übergabe steuern",
  description = "Dokumentieren Sie, wer den Vorgang übergibt, wer übernimmt und welche Prüfschritte offen sind.",
  status,
  statusLabel,
  subjectLabel,
  from,
  to,
  requestedAt,
  dueAt,
  reason,
  requirements = [],
  steps = [],
  auditNote,
  footer,
  primaryAction,
  secondaryActions = [],
  emptyRequirementsLabel = "Keine Übergabeanforderungen hinterlegt.",
}: HandoffPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const meta = statusMeta[status];

  return (
    <section
      className={`ps-handoff-panel ps-handoff-panel--${status}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="ps-handoff-panel__header">
        <div className="ps-handoff-panel__heading">
          <p className="ps-eyebrow">Übergabe</p>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId} className="ps-muted">
            {description}
          </p>
        </div>
        <StatusBadge
          label={statusLabel ?? meta.label}
          marker={meta.marker}
          tone={meta.tone}
        />
      </header>

      <div className="ps-handoff-panel__subject">
        <span>Gegenstand</span>
        <strong>{subjectLabel}</strong>
      </div>

      <div className="ps-handoff-panel__route" aria-label="Übergabeweg">
        <ParticipantCard title="Von" participant={from} />
        <div className="ps-handoff-panel__route-marker" aria-hidden="true">
          →
        </div>
        <ParticipantCard title="An" participant={to} />
      </div>

      {requestedAt || dueAt ? (
        <dl className="ps-handoff-panel__dates">
          {requestedAt ? (
            <div>
              <dt>Angefragt</dt>
              <dd className="ps-num">
                <time dateTime={requestedAt}>{requestedAt}</time>
              </dd>
            </div>
          ) : null}
          {dueAt ? (
            <div>
              <dt>Frist</dt>
              <dd className="ps-num">
                <time dateTime={dueAt}>{dueAt}</time>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {reason ? (
        <section className="ps-handoff-panel__reason">
          <h3>Begründung</h3>
          <p>{reason}</p>
        </section>
      ) : null}

      <section className="ps-handoff-panel__requirements">
        <h3>Übergabeanforderungen</h3>
        {requirements.length === 0 ? (
          <p className="ps-handoff-panel__empty" role="status">
            {emptyRequirementsLabel}
          </p>
        ) : (
          <ul>
            {requirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
        )}
      </section>

      {steps.length > 0 ? (
        <ol className="ps-handoff-panel__steps" aria-label="Übergabeschritte">
          {steps.map((step) => (
            <li
              key={step.id}
              className={`ps-handoff-panel__step ps-handoff-panel__step--${step.status}`}
              aria-current={step.status === "current" ? "step" : undefined}
            >
              <article>
                <header className="ps-handoff-panel__step-header">
                  <div>
                    <h3>{step.label}</h3>
                    {step.description ? <p>{step.description}</p> : null}
                  </div>
                  <StatusBadge
                    label={stepMeta[step.status].label}
                    marker={stepMeta[step.status].marker}
                    tone={stepMeta[step.status].tone}
                  />
                </header>
                {step.at ? (
                  <p className="ps-handoff-panel__step-time ps-num">
                    <time dateTime={step.at}>{step.at}</time>
                  </p>
                ) : null}
              </article>
            </li>
          ))}
        </ol>
      ) : null}

      {auditNote ? (
        <div className="ps-handoff-panel__audit-note" role="note">
          {auditNote}
        </div>
      ) : null}

      {footer ? (
        <div className="ps-handoff-panel__footer" role="note">
          {footer}
        </div>
      ) : null}

      {primaryAction || secondaryActions.length > 0 ? (
        <div
          className="ps-handoff-panel__actions"
          role="group"
          aria-label="Übergabeaktionen"
        >
          {secondaryActions.map((action) => (
            <ActionButton key={action.label} action={action} />
          ))}
          {primaryAction ? <ActionButton action={primaryAction} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function ParticipantCard({
  title,
  participant,
}: {
  title: string;
  participant: HandoffParticipant;
}) {
  return (
    <section className="ps-handoff-panel__participant" aria-label={title}>
      <span>{title}</span>
      <strong>{participant.label}</strong>
      {participant.roleLabel || participant.unitLabel ? (
        <p>
          {[participant.roleLabel, participant.unitLabel]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
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

function ActionButton({ action }: { action: HandoffAction }) {
  return (
    <button
      type="button"
      className={actionClass(action.tone ?? "secondary")}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {action.label}
    </button>
  );
}

function actionClass(tone: NonNullable<HandoffAction["tone"]>) {
  if (tone === "primary") {
    return "ps-btn ps-btn--primary";
  }

  if (tone === "danger") {
    return "ps-btn ps-btn--danger";
  }

  return "ps-btn ps-btn--ghost";
}
