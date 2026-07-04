import { type ReactNode, useId } from "react";

export type TaskQueueItemStatus = "open" | "in-progress" | "blocked" | "done";
export type TaskQueueItemPriority = "normal" | "urgent" | "critical";

export interface TaskQueueItemAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}

export interface TaskQueueItem {
  id: string;
  title: string;
  status: TaskQueueItemStatus;
  description?: string;
  priority?: TaskQueueItemPriority;
  caseReference?: string;
  groupLabel?: string;
  ownerLabel?: string;
  dueAt?: string;
  requirementLabel?: string;
  tags?: string[];
  action?: TaskQueueItemAction;
  secondaryAction?: TaskQueueItemAction;
}

export interface TaskQueuePanelAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary";
}

export interface TaskQueuePanelProps {
  title?: string;
  description?: string;
  tasks: TaskQueueItem[];
  selectedTaskId?: string;
  onSelectTask?: (task: TaskQueueItem) => void;
  statusLabel?: string;
  actions?: TaskQueuePanelAction[];
  emptyLabel?: string;
  footer?: ReactNode;
}

const statusMeta: Record<
  TaskQueueItemStatus,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  open: { label: "Offen", marker: "i", tone: "warning" },
  "in-progress": { label: "In Bearbeitung", marker: "→", tone: "neutral" },
  blocked: { label: "Blockiert", marker: "!", tone: "critical" },
  done: { label: "Erledigt", marker: "OK", tone: "success" },
};

const priorityMeta: Record<
  TaskQueueItemPriority,
  {
    label: string;
    marker: string;
    tone: "neutral" | "warning" | "critical";
  }
> = {
  normal: { label: "Normal", marker: "·", tone: "neutral" },
  urgent: { label: "Dringend", marker: "!", tone: "warning" },
  critical: { label: "Kritisch", marker: "!!", tone: "critical" },
};

export function TaskQueuePanel({
  title = "Aufgaben",
  description = "Priorisieren Sie die nächsten Arbeitsschritte nach Status, Frist und Zuständigkeit.",
  tasks,
  selectedTaskId,
  onSelectTask,
  statusLabel,
  actions = [],
  emptyLabel = "Keine Aufgaben vorhanden.",
  footer,
}: TaskQueuePanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const summary = summarizeTasks(tasks);

  return (
    <section
      className={`ps-task-queue ps-task-queue--${summary.tone}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="ps-task-queue__header">
        <div className="ps-task-queue__heading">
          <p className="ps-eyebrow">Arbeitssteuerung</p>
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

      <dl className="ps-task-queue__summary" aria-label="Aufgabenübersicht">
        <div>
          <dt>Offen</dt>
          <dd className="ps-num">{summary.open}</dd>
        </div>
        <div>
          <dt>In Arbeit</dt>
          <dd className="ps-num">{summary.inProgress}</dd>
        </div>
        <div>
          <dt>Blockiert</dt>
          <dd className="ps-num">{summary.blocked}</dd>
        </div>
        <div>
          <dt>Erledigt</dt>
          <dd className="ps-num">{summary.done}</dd>
        </div>
      </dl>

      {tasks.length === 0 ? (
        <p className="ps-task-queue__empty" role="status">
          {emptyLabel}
        </p>
      ) : (
        <ul className="ps-task-queue__list">
          {tasks.map((task) => {
            const isSelected = selectedTaskId === task.id;

            return (
              <li
                key={task.id}
                className={`ps-task-queue__item ps-task-queue__item--${task.status}`}
              >
                <article
                  className={
                    isSelected
                      ? "ps-task-queue__card ps-task-queue__card--selected"
                      : "ps-task-queue__card"
                  }
                >
                  <header className="ps-task-queue__card-header">
                    <div className="ps-task-queue__title">
                      {onSelectTask ? (
                        <h3>
                          <button
                            type="button"
                            className="ps-task-queue__select"
                            aria-pressed={isSelected}
                            onClick={() => onSelectTask(task)}
                          >
                            {task.title}
                          </button>
                        </h3>
                      ) : (
                        <h3>{task.title}</h3>
                      )}
                      {task.description ? <p>{task.description}</p> : null}
                    </div>
                    <div
                      className="ps-task-queue__badges"
                      aria-label="Status und Priorität"
                    >
                      <StatusBadge
                        label={statusMeta[task.status].label}
                        marker={statusMeta[task.status].marker}
                        tone={statusMeta[task.status].tone}
                      />
                      <PriorityBadge priority={task.priority ?? "normal"} />
                    </div>
                  </header>

                  <dl className="ps-task-queue__meta">
                    {task.caseReference ? (
                      <div>
                        <dt>Vorgang</dt>
                        <dd>{task.caseReference}</dd>
                      </div>
                    ) : null}
                    {task.groupLabel ? (
                      <div>
                        <dt>Bereich</dt>
                        <dd>{task.groupLabel}</dd>
                      </div>
                    ) : null}
                    {task.ownerLabel ? (
                      <div>
                        <dt>Zuständig</dt>
                        <dd>{task.ownerLabel}</dd>
                      </div>
                    ) : null}
                    {task.dueAt ? (
                      <div>
                        <dt>Frist</dt>
                        <dd className="ps-num">
                          <time dateTime={task.dueAt}>{task.dueAt}</time>
                        </dd>
                      </div>
                    ) : null}
                  </dl>

                  {task.requirementLabel || task.tags?.length ? (
                    <div className="ps-task-queue__detail-row">
                      {task.requirementLabel ? (
                        <p className="ps-task-queue__requirement">
                          <span>Anforderung</span>
                          <strong>{task.requirementLabel}</strong>
                        </p>
                      ) : null}
                      {task.tags?.length ? (
                        <ul
                          className="ps-task-queue__tags"
                          aria-label="Aufgabenmarkierungen"
                        >
                          {task.tags.map((tag) => (
                            <li key={tag}>{tag}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  {task.action || task.secondaryAction ? (
                    <div
                      className="ps-task-queue__actions"
                      role="group"
                      aria-label={`Aktionen für ${task.title}`}
                    >
                      {task.secondaryAction ? (
                        <ActionButton action={task.secondaryAction} />
                      ) : null}
                      {task.action ? (
                        <ActionButton action={task.action} />
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
        <div className="ps-task-queue__footer" role="note">
          {footer}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div
          className="ps-task-queue__panel-actions"
          role="group"
          aria-label="Aufgabenaktionen"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={panelActionClass(action.tone ?? "secondary")}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function summarizeTasks(tasks: TaskQueueItem[]) {
  const open = tasks.filter((task) => task.status === "open").length;
  const inProgress = tasks.filter(
    (task) => task.status === "in-progress",
  ).length;
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const done = tasks.filter((task) => task.status === "done").length;
  const critical = tasks.filter((task) => task.priority === "critical").length;

  if (blocked > 0) {
    return {
      open,
      inProgress,
      blocked,
      done,
      tone: "blocked" as const,
      label: `${blocked} blockiert`,
      marker: "!",
      badgeTone: "critical" as const,
    };
  }

  if (critical > 0) {
    return {
      open,
      inProgress,
      blocked,
      done,
      tone: "critical" as const,
      label: `${critical} kritisch`,
      marker: "!!",
      badgeTone: "critical" as const,
    };
  }

  if (open + inProgress > 0) {
    return {
      open,
      inProgress,
      blocked,
      done,
      tone: "active" as const,
      label: `${open + inProgress} aktiv`,
      marker: "i",
      badgeTone: "neutral" as const,
    };
  }

  return {
    open,
    inProgress,
    blocked,
    done,
    tone: "clear" as const,
    label: tasks.length === 0 ? "Keine Aufgaben" : "Alles erledigt",
    marker: tasks.length === 0 ? "i" : "OK",
    badgeTone: tasks.length === 0 ? ("warning" as const) : ("success" as const),
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
    <span className={`ps-badge ps-badge--${tone}`}>
      <span className="ps-badge__icon" aria-hidden="true">
        {marker}
      </span>
      <span>{label}</span>
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TaskQueueItemPriority }) {
  const meta = priorityMeta[priority];

  return (
    <span className={`ps-badge ps-badge--${meta.tone}`}>
      <span className="ps-badge__icon" aria-hidden="true">
        {meta.marker}
      </span>
      <span>{meta.label}</span>
    </span>
  );
}

function ActionButton({ action }: { action: TaskQueueItemAction }) {
  return (
    <button
      type="button"
      className={taskActionClass(action.tone ?? "secondary")}
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {action.label}
    </button>
  );
}

function taskActionClass(tone: NonNullable<TaskQueueItemAction["tone"]>) {
  if (tone === "primary") {
    return "ps-btn ps-btn--primary";
  }

  if (tone === "danger") {
    return "ps-btn ps-btn--danger";
  }

  return "ps-btn ps-btn--ghost";
}

function panelActionClass(tone: NonNullable<TaskQueuePanelAction["tone"]>) {
  return tone === "primary" ? "ps-btn ps-btn--primary" : "ps-btn ps-btn--ghost";
}
