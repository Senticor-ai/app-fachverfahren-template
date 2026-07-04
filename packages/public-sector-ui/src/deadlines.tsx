import { type ReactNode, useId } from "react";

export type DeadlineStatus = "open" | "due-soon" | "overdue" | "paused" | "met";

export type DeadlineEscalation = "none" | "review" | "lead" | "external";

export interface DeadlineAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}

export interface DeadlineItem {
  id: string;
  label: string;
  status: DeadlineStatus;
  dueAt: string;
  description?: string;
  caseReference?: string;
  ownerLabel?: string;
  legalBasisLabel?: string;
  remainingLabel?: string;
  escalation?: DeadlineEscalation;
  action?: DeadlineAction;
  secondaryAction?: DeadlineAction;
}

export interface DeadlinePanelAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary";
}

export interface DeadlinePanelProps {
  title?: string;
  description?: string;
  deadlines: DeadlineItem[];
  selectedDeadlineId?: string;
  onSelectDeadline?: (deadline: DeadlineItem) => void;
  statusLabel?: string;
  actions?: DeadlinePanelAction[];
  emptyLabel?: string;
  footer?: ReactNode;
}

const statusMeta: Record<
  DeadlineStatus,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  open: { label: "Offen", marker: "i", tone: "neutral" },
  "due-soon": { label: "Fällig bald", marker: "!", tone: "warning" },
  overdue: { label: "Überfällig", marker: "!!", tone: "critical" },
  paused: { label: "Pausiert", marker: "–", tone: "neutral" },
  met: { label: "Gewahrt", marker: "OK", tone: "success" },
};

const escalationMeta: Record<
  DeadlineEscalation,
  {
    label: string;
    marker: string;
    tone: "neutral" | "warning" | "critical";
  }
> = {
  none: { label: "Keine Eskalation", marker: "i", tone: "neutral" },
  review: { label: "Prüfung nötig", marker: "!", tone: "warning" },
  lead: { label: "Teamleitung", marker: "!!", tone: "critical" },
  external: { label: "Externe Stelle", marker: "→", tone: "warning" },
};

export function DeadlinePanel({
  title = "Fristen steuern",
  description = "Überwachen Sie fällige, überfällige und pausierte Vorgänge mit Zuständigkeit und Eskalationspfad.",
  deadlines,
  selectedDeadlineId,
  onSelectDeadline,
  statusLabel,
  actions = [],
  emptyLabel = "Keine Fristen vorhanden.",
  footer,
}: DeadlinePanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const summary = summarizeDeadlines(deadlines);

  return (
    <section
      className={`ps-deadline-panel ps-deadline-panel--${summary.tone}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="ps-deadline-panel__header">
        <div className="ps-deadline-panel__heading">
          <p className="ps-eyebrow">Fristen</p>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId} className="ps-muted">
            {description}
          </p>
        </div>
        <StatusBadge
          label={statusLabel ?? summary.label}
          marker={summary.marker}
          tone={summary.badgeTone}
        />
      </header>

      <dl className="ps-deadline-panel__summary" aria-label="Fristenübersicht">
        <div>
          <dt>Überfällig</dt>
          <dd className="ps-num">{summary.overdue}</dd>
        </div>
        <div>
          <dt>Fällig bald</dt>
          <dd className="ps-num">{summary.dueSoon}</dd>
        </div>
        <div>
          <dt>Offen</dt>
          <dd className="ps-num">{summary.open}</dd>
        </div>
        <div>
          <dt>Gewahrt</dt>
          <dd className="ps-num">{summary.met}</dd>
        </div>
      </dl>

      {deadlines.length === 0 ? (
        <p className="ps-deadline-panel__empty" role="status">
          {emptyLabel}
        </p>
      ) : (
        <ul className="ps-deadline-panel__list">
          {deadlines.map((deadline) => {
            const isSelected = selectedDeadlineId === deadline.id;
            const meta = statusMeta[deadline.status];
            const escalation = escalationMeta[deadline.escalation ?? "none"];

            return (
              <li
                key={deadline.id}
                className={`ps-deadline-panel__item ps-deadline-panel__item--${deadline.status}`}
              >
                <article
                  className={
                    isSelected
                      ? "ps-deadline-panel__card ps-deadline-panel__card--selected"
                      : "ps-deadline-panel__card"
                  }
                >
                  <header className="ps-deadline-panel__card-header">
                    <div className="ps-deadline-panel__title">
                      {onSelectDeadline ? (
                        <h3>
                          <button
                            type="button"
                            className="ps-deadline-panel__select"
                            aria-pressed={isSelected}
                            onClick={() => onSelectDeadline(deadline)}
                          >
                            {deadline.label}
                          </button>
                        </h3>
                      ) : (
                        <h3>{deadline.label}</h3>
                      )}
                      {deadline.description ? (
                        <p>{deadline.description}</p>
                      ) : null}
                    </div>
                    <div
                      className="ps-deadline-panel__badges"
                      aria-label="Friststatus und Eskalation"
                    >
                      <StatusBadge
                        label={meta.label}
                        marker={meta.marker}
                        tone={meta.tone}
                      />
                      <StatusBadge
                        label={escalation.label}
                        marker={escalation.marker}
                        tone={escalation.tone}
                      />
                    </div>
                  </header>

                  <dl className="ps-deadline-panel__meta">
                    <div>
                      <dt>Fällig am</dt>
                      <dd className="ps-num">
                        <time dateTime={deadline.dueAt}>{deadline.dueAt}</time>
                      </dd>
                    </div>
                    {deadline.remainingLabel ? (
                      <div>
                        <dt>Restzeit</dt>
                        <dd>{deadline.remainingLabel}</dd>
                      </div>
                    ) : null}
                    {deadline.caseReference ? (
                      <div>
                        <dt>Vorgang</dt>
                        <dd>{deadline.caseReference}</dd>
                      </div>
                    ) : null}
                    {deadline.ownerLabel ? (
                      <div>
                        <dt>Zuständig</dt>
                        <dd>{deadline.ownerLabel}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {deadline.legalBasisLabel ? (
                    <p className="ps-deadline-panel__basis">
                      <span>Fristgrundlage</span>
                      <strong>{deadline.legalBasisLabel}</strong>
                    </p>
                  ) : null}

                  {deadline.action || deadline.secondaryAction ? (
                    <div
                      className="ps-deadline-panel__actions"
                      role="group"
                      aria-label={`Aktionen für ${deadline.label}`}
                    >
                      {deadline.secondaryAction ? (
                        <ActionButton action={deadline.secondaryAction} />
                      ) : null}
                      {deadline.action ? (
                        <ActionButton action={deadline.action} />
                      ) : null}
                    </div>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      {footer ? (
        <div className="ps-deadline-panel__footer" role="note">
          {footer}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div
          className="ps-deadline-panel__panel-actions"
          role="group"
          aria-label="Fristenaktionen"
        >
          {actions.map((action) => (
            <ActionButton key={action.label} action={action} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function summarizeDeadlines(deadlines: DeadlineItem[]) {
  const overdue = deadlines.filter(
    (deadline) => deadline.status === "overdue",
  ).length;
  const dueSoon = deadlines.filter(
    (deadline) => deadline.status === "due-soon",
  ).length;
  const paused = deadlines.filter(
    (deadline) => deadline.status === "paused",
  ).length;
  const open = deadlines.filter(
    (deadline) => deadline.status === "open",
  ).length;
  const met = deadlines.filter((deadline) => deadline.status === "met").length;

  if (overdue > 0) {
    return {
      overdue,
      dueSoon,
      paused,
      open,
      met,
      label: `${overdue} überfällig`,
      marker: "!!",
      tone: "critical",
      badgeTone: "critical" as const,
    };
  }

  if (dueSoon > 0) {
    return {
      overdue,
      dueSoon,
      paused,
      open,
      met,
      label: `${dueSoon} fällig bald`,
      marker: "!",
      tone: "warning",
      badgeTone: "warning" as const,
    };
  }

  if (open > 0 || paused > 0) {
    return {
      overdue,
      dueSoon,
      paused,
      open,
      met,
      label: "Fristen im Blick",
      marker: "i",
      tone: "active",
      badgeTone: "neutral" as const,
    };
  }

  return {
    overdue,
    dueSoon,
    paused,
    open,
    met,
    label: "Alle Fristen gewahrt",
    marker: "OK",
    tone: "clear",
    badgeTone: "success" as const,
  };
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
    <span className={`ps-status ps-status--${tone}`}>
      <span aria-hidden="true">{marker}</span>
      {label}
    </span>
  );
}

function ActionButton({ action }: { action: DeadlineAction }) {
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

function actionClass(tone: DeadlineAction["tone"]) {
  if (tone === "primary") {
    return "ps-btn ps-btn--primary";
  }

  if (tone === "danger") {
    return "ps-btn ps-btn--danger";
  }

  return "ps-btn ps-btn--ghost";
}
