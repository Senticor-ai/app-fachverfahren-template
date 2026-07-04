import { type ReactNode, useId } from "react";

export type DecisionOutcome =
  | "approved"
  | "partially-approved"
  | "rejected"
  | "deferred";

export type DecisionRequirementStatus = "met" | "open" | "blocked";

export type DecisionGateStatus = "ready" | "needs-review" | "blocked";

export interface DecisionRequirement {
  id: string;
  label: string;
  status: DecisionRequirementStatus;
  note?: string;
}

export interface DecisionCondition {
  id: string;
  label: string;
  description?: string;
}

export interface DecisionComposerAction {
  id: string;
  label: string;
  onClick: () => void;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

export interface DecisionComposerProps {
  title?: string;
  description?: string;
  outcome: DecisionOutcome;
  decisionLabel: string;
  summary: string;
  requirements?: DecisionRequirement[];
  conditions?: DecisionCondition[];
  legalBasis?: string[];
  reasonDraft?: string;
  reasonLabel?: string;
  reasonHint?: string;
  onReasonDraftChange?: (value: string) => void;
  gateStatus?: DecisionGateStatus;
  gateLabel?: string;
  auditNote?: ReactNode;
  primaryAction?: DecisionComposerAction;
  secondaryActions?: DecisionComposerAction[];
  actionsLabel?: string;
}

const outcomeMeta: Record<
  DecisionOutcome,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  approved: { label: "Bewilligung", marker: "OK", tone: "success" },
  "partially-approved": {
    label: "Teilbewilligung",
    marker: "!",
    tone: "warning",
  },
  rejected: { label: "Ablehnung", marker: "x", tone: "critical" },
  deferred: { label: "Zurückstellen", marker: "i", tone: "neutral" },
};

const requirementMeta: Record<
  DecisionRequirementStatus,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  met: { label: "Erfüllt", marker: "OK", tone: "success" },
  open: { label: "Offen", marker: "?", tone: "warning" },
  blocked: { label: "Blockiert", marker: "!", tone: "critical" },
};

const gateMeta: Record<
  DecisionGateStatus,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  ready: { label: "Entscheidungsreif", marker: "OK", tone: "success" },
  "needs-review": {
    label: "Vier-Augen-Prüfung",
    marker: "!",
    tone: "warning",
  },
  blocked: { label: "Gesperrt", marker: "x", tone: "critical" },
};

export function DecisionComposer({
  title = "Entscheidung vorbereiten",
  description = "Fassen Sie Ergebnis, Prüfstatus und Begründung vor der verbindlichen Entscheidung zusammen.",
  outcome,
  decisionLabel,
  summary,
  requirements = [],
  conditions = [],
  legalBasis = [],
  reasonDraft,
  reasonLabel = "Begründung",
  reasonHint = "Formulieren Sie nachvollziehbar, welche Tatsachen und Rechtsgrundlagen die Entscheidung tragen.",
  onReasonDraftChange,
  gateStatus = "ready",
  gateLabel,
  auditNote,
  primaryAction,
  secondaryActions = [],
  actionsLabel = "Entscheidungsaktionen",
}: DecisionComposerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const reasonId = useId();
  const outcomeStatus = outcomeMeta[outcome];
  const gateStatusMeta = gateMeta[gateStatus];

  return (
    <section
      className={`ps-decision-composer ps-decision-composer--${outcome}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="ps-decision-composer__header">
        <div className="ps-decision-composer__heading">
          <p className="ps-eyebrow">Entscheidung</p>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId} className="ps-muted">
            {description}
          </p>
        </div>
        <div className="ps-decision-composer__badges">
          <StatusBadge
            label={outcomeStatus.label}
            marker={outcomeStatus.marker}
            tone={outcomeStatus.tone}
          />
          <StatusBadge
            label={gateLabel ?? gateStatusMeta.label}
            marker={gateStatusMeta.marker}
            tone={gateStatusMeta.tone}
          />
        </div>
      </header>

      <div className="ps-decision-composer__summary">
        <span className="ps-decision-composer__summary-label">Ergebnis</span>
        <strong>{decisionLabel}</strong>
        <p>{summary}</p>
      </div>

      <div className="ps-decision-composer__body">
        {requirements.length > 0 ? (
          <section className="ps-decision-composer__panel">
            <h3>Prüfpunkte</h3>
            <ul className="ps-decision-composer__requirements">
              {requirements.map((requirement) => (
                <li
                  key={requirement.id}
                  className={`ps-decision-composer__requirement ps-decision-composer__requirement--${requirement.status}`}
                >
                  <div className="ps-decision-composer__requirement-head">
                    <span>{requirement.label}</span>
                    <StatusBadge
                      label={requirementMeta[requirement.status].label}
                      marker={requirementMeta[requirement.status].marker}
                      tone={requirementMeta[requirement.status].tone}
                    />
                  </div>
                  {requirement.note ? <p>{requirement.note}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {conditions.length > 0 ? (
          <section className="ps-decision-composer__panel">
            <h3>Auflagen</h3>
            <ul className="ps-decision-composer__conditions">
              {conditions.map((condition) => (
                <li
                  key={condition.id}
                  className="ps-decision-composer__condition"
                >
                  <strong>{condition.label}</strong>
                  {condition.description ? (
                    <p>{condition.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {legalBasis.length > 0 ? (
          <section className="ps-decision-composer__panel">
            <h3>Rechtsgrundlagen</h3>
            <ul className="ps-decision-composer__legal-basis">
              {legalBasis.map((basis) => (
                <li key={basis}>{basis}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {onReasonDraftChange ? (
        <label
          className="ps-decision-composer__reason-field"
          htmlFor={reasonId}
        >
          <span>{reasonLabel}</span>
          <textarea
            id={reasonId}
            value={reasonDraft ?? ""}
            rows={5}
            onChange={(event) => onReasonDraftChange(event.target.value)}
          />
          <span className="ps-muted">{reasonHint}</span>
        </label>
      ) : reasonDraft ? (
        <section className="ps-decision-composer__reason-readonly">
          <h3>{reasonLabel}</h3>
          <p>{reasonDraft}</p>
        </section>
      ) : null}

      {auditNote ? (
        <div className="ps-decision-composer__audit-note" role="note">
          {auditNote}
        </div>
      ) : null}

      {primaryAction || secondaryActions.length > 0 ? (
        <div
          className="ps-decision-composer__actions"
          role="group"
          aria-label={actionsLabel}
        >
          {secondaryActions.map((action) => (
            <ActionButton key={action.id} action={action} />
          ))}
          {primaryAction ? <ActionButton action={primaryAction} /> : null}
        </div>
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

function ActionButton({ action }: { action: DecisionComposerAction }) {
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
  tone: NonNullable<DecisionComposerAction["tone"]>,
): string {
  if (tone === "danger") {
    return "ps-btn ps-btn--danger";
  }
  if (tone === "primary") {
    return "ps-btn ps-btn--primary";
  }
  return "ps-btn ps-btn--ghost";
}
