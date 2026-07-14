import { type ReactNode, useId } from "react";

export type AssumptionValidationStatus =
  "unverified" | "in-review" | "validated" | "invalid";

export type AssumptionImpact = "info" | "decision" | "blocking";

export interface AssumptionAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}

export interface AssumptionItem {
  id: string;
  label: string;
  status: AssumptionValidationStatus;
  impact: AssumptionImpact;
  summary: string;
  valueLabel?: string;
  sourceLabel?: string;
  affectedAreaLabel?: string;
  ownerLabel?: string;
  dueAt?: string;
  details?: string[];
  action?: AssumptionAction;
  secondaryAction?: AssumptionAction;
}

export interface AssumptionRegisterAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}

export interface AssumptionRegisterPanelProps {
  title?: string;
  description?: string;
  assumptions: AssumptionItem[];
  statusLabel?: string;
  actions?: AssumptionRegisterAction[];
  emptyLabel?: string;
  footer?: ReactNode;
}

const statusMeta: Record<
  AssumptionValidationStatus,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  unverified: { label: "Zu validieren", marker: "?", tone: "warning" },
  "in-review": { label: "In Prüfung", marker: "i", tone: "neutral" },
  validated: { label: "Validiert", marker: "OK", tone: "success" },
  invalid: { label: "Nicht verwendbar", marker: "x", tone: "critical" },
};

const impactMeta: Record<
  AssumptionImpact,
  {
    label: string;
    marker: string;
    tone: "neutral" | "warning" | "critical";
  }
> = {
  info: { label: "Hinweis", marker: "i", tone: "neutral" },
  decision: { label: "Entscheidungsrelevant", marker: "!", tone: "warning" },
  blocking: { label: "Blockierend", marker: "x", tone: "critical" },
};

export function AssumptionRegisterPanel({
  title = "Annahmen validieren",
  description = "Halten Sie offen, welche Fachwerte, Quellen oder Regeln noch zu prüfen sind, bevor ein Fachverfahren freigegeben wird.",
  assumptions,
  statusLabel,
  actions = [],
  emptyLabel = "Keine offenen Annahmen hinterlegt.",
  footer,
}: AssumptionRegisterPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const summary = summarizeAssumptions(assumptions);

  return (
    <section
      className={`ps-assumption-register ps-assumption-register--${summary.tone}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="ps-assumption-register__header">
        <div className="ps-assumption-register__heading">
          <p className="ps-eyebrow">Validierung</p>
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

      <dl
        className="ps-assumption-register__summary"
        aria-label="Annahmenübersicht"
      >
        <div>
          <dt>Offen</dt>
          <dd className="ps-num">{summary.unverified}</dd>
        </div>
        <div>
          <dt>In Prüfung</dt>
          <dd className="ps-num">{summary.inReview}</dd>
        </div>
        <div>
          <dt>Validiert</dt>
          <dd className="ps-num">{summary.validated}</dd>
        </div>
        <div>
          <dt>Blockierend</dt>
          <dd className="ps-num">{summary.blocking}</dd>
        </div>
      </dl>

      {assumptions.length === 0 ? (
        <p className="ps-assumption-register__empty" role="status">
          {emptyLabel}
        </p>
      ) : (
        <ul className="ps-assumption-register__list">
          {assumptions.map((assumption) => (
            <li
              key={assumption.id}
              className={`ps-assumption-register__item ps-assumption-register__item--${assumption.status} ps-assumption-register__item--${assumption.impact}`}
            >
              <article className="ps-assumption-register__card">
                <header className="ps-assumption-register__card-header">
                  <div>
                    <h3>{assumption.label}</h3>
                    <p>{assumption.summary}</p>
                  </div>
                  <div
                    className="ps-assumption-register__badges"
                    aria-label="Annahmenstatus"
                  >
                    <StatusBadge
                      label={statusMeta[assumption.status].label}
                      marker={statusMeta[assumption.status].marker}
                      tone={statusMeta[assumption.status].tone}
                    />
                    <StatusBadge
                      label={impactMeta[assumption.impact].label}
                      marker={impactMeta[assumption.impact].marker}
                      tone={impactMeta[assumption.impact].tone}
                    />
                  </div>
                </header>

                <dl className="ps-assumption-register__meta">
                  {assumption.valueLabel ? (
                    <div>
                      <dt>Annahme</dt>
                      <dd>{assumption.valueLabel}</dd>
                    </div>
                  ) : null}
                  {assumption.sourceLabel ? (
                    <div>
                      <dt>Quelle</dt>
                      <dd>{assumption.sourceLabel}</dd>
                    </div>
                  ) : null}
                  {assumption.affectedAreaLabel ? (
                    <div>
                      <dt>Betroffener Bereich</dt>
                      <dd>{assumption.affectedAreaLabel}</dd>
                    </div>
                  ) : null}
                  {assumption.ownerLabel ? (
                    <div>
                      <dt>Zuständig</dt>
                      <dd>{assumption.ownerLabel}</dd>
                    </div>
                  ) : null}
                  {assumption.dueAt ? (
                    <div>
                      <dt>Frist</dt>
                      <dd className="ps-num">
                        <time dateTime={assumption.dueAt}>
                          {assumption.dueAt}
                        </time>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {assumption.details?.length ? (
                  <details className="ps-assumption-register__details">
                    <summary>Validierungshinweise anzeigen</summary>
                    <ul>
                      {assumption.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                {assumption.action || assumption.secondaryAction ? (
                  <div
                    className="ps-assumption-register__actions"
                    role="group"
                    aria-label={`Aktionen für ${assumption.label}`}
                  >
                    {assumption.secondaryAction ? (
                      <ActionButton action={assumption.secondaryAction} />
                    ) : null}
                    {assumption.action ? (
                      <ActionButton action={assumption.action} />
                    ) : null}
                  </div>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      )}

      {footer ? (
        <div className="ps-assumption-register__footer" role="note">
          {footer}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div
          className="ps-assumption-register__panel-actions"
          role="group"
          aria-label="Annahmenaktionen"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={actionClass(action.tone ?? "secondary")}
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

function summarizeAssumptions(assumptions: AssumptionItem[]) {
  const unverified = assumptions.filter(
    (assumption) => assumption.status === "unverified",
  ).length;
  const inReview = assumptions.filter(
    (assumption) => assumption.status === "in-review",
  ).length;
  const validated = assumptions.filter(
    (assumption) => assumption.status === "validated",
  ).length;
  const invalid = assumptions.filter(
    (assumption) => assumption.status === "invalid",
  ).length;
  const blocking = assumptions.filter(
    (assumption) =>
      assumption.impact === "blocking" && assumption.status !== "validated",
  ).length;

  if (invalid > 0 || blocking > 0) {
    return {
      unverified,
      inReview,
      validated,
      blocking,
      tone: "block" as const,
      label:
        invalid > 0 ? `${invalid} nicht verwendbar` : `${blocking} blockieren`,
      marker: "x",
      badgeTone: "critical" as const,
    };
  }

  if (unverified > 0 || inReview > 0) {
    return {
      unverified,
      inReview,
      validated,
      blocking,
      tone: "review" as const,
      label: `${unverified + inReview} zu prüfen`,
      marker: "!",
      badgeTone: "warning" as const,
    };
  }

  return {
    unverified,
    inReview,
    validated,
    blocking,
    tone: "clear" as const,
    label: assumptions.length === 0 ? "Keine Annahmen" : "Validiert",
    marker: assumptions.length === 0 ? "i" : "OK",
    badgeTone:
      assumptions.length === 0 ? ("warning" as const) : ("success" as const),
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

function ActionButton({ action }: { action: AssumptionAction }) {
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

function actionClass(
  tone: NonNullable<
    AssumptionAction["tone"] | AssumptionRegisterAction["tone"]
  >,
) {
  if (tone === "primary") {
    return "ps-btn ps-btn--primary";
  }

  if (tone === "danger") {
    return "ps-btn ps-btn--danger";
  }

  return "ps-btn ps-btn--ghost";
}
