import { type ReactNode, useId } from "react";

export type CaseContextTone = "neutral" | "success" | "warning" | "critical";

export interface CaseContextStatus {
  label: string;
  tone?: CaseContextTone;
}

export interface CaseContextFact {
  id: string;
  label: string;
  value: string;
  hint?: string;
}

export interface CaseContextSignal {
  id: string;
  label: string;
  value: string;
  tone?: CaseContextTone;
  description?: string;
}

export interface CaseContextAction {
  id: string;
  label: string;
  onClick: () => void;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

export interface CaseContextPanelProps {
  caseId: string;
  title: string;
  applicantLabel: string;
  status: CaseContextStatus;
  subtitle?: string;
  ownerLabel?: string;
  receivedAt?: string;
  dueAt?: string;
  phaseLabel?: string;
  nextStep?: string;
  facts?: CaseContextFact[];
  signals?: CaseContextSignal[];
  actions?: CaseContextAction[];
  children?: ReactNode;
}

const toneMarker: Record<CaseContextTone, string> = {
  neutral: "i",
  success: "OK",
  warning: "!",
  critical: "x",
};

export function CaseContextPanel({
  caseId,
  title,
  applicantLabel,
  status,
  subtitle,
  ownerLabel,
  receivedAt,
  dueAt,
  phaseLabel,
  nextStep,
  facts = [],
  signals = [],
  actions = [],
  children,
}: CaseContextPanelProps) {
  const titleId = useId();
  const subtitleId = useId();
  const statusTone = status.tone ?? "neutral";

  return (
    <section
      className={`ps-case-context ps-case-context--${statusTone}`}
      aria-labelledby={titleId}
      {...(subtitle ? { "aria-describedby": subtitleId } : {})}
    >
      <header className="ps-case-context__header">
        <div className="ps-case-context__heading">
          <p className="ps-eyebrow">Vorgang</p>
          <h2 id={titleId}>{title}</h2>
          {subtitle ? (
            <p id={subtitleId} className="ps-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="ps-case-context__badges">
          <span className={`ps-badge ps-badge--${badgeTone(statusTone)}`}>
            <span className="ps-badge__icon" aria-hidden="true">
              {toneMarker[statusTone]}
            </span>
            <span>{status.label}</span>
          </span>
          <span className="ps-case-context__id ps-num">{caseId}</span>
        </div>
      </header>

      <div className="ps-case-context__primary">
        <div>
          <span>Antragsteller:in</span>
          <strong>{applicantLabel}</strong>
        </div>
        {phaseLabel ? (
          <div>
            <span>Phase</span>
            <strong>{phaseLabel}</strong>
          </div>
        ) : null}
        {ownerLabel ? (
          <div>
            <span>Zuständig</span>
            <strong>{ownerLabel}</strong>
          </div>
        ) : null}
      </div>

      {receivedAt || dueAt || facts.length > 0 ? (
        <dl className="ps-case-context__facts">
          {receivedAt ? (
            <div>
              <dt>Eingang</dt>
              <dd className="ps-num">
                <time dateTime={receivedAt}>{receivedAt}</time>
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
          {facts.map((fact) => (
            <div key={fact.id}>
              <dt>{fact.label}</dt>
              <dd>
                <span>{fact.value}</span>
                {fact.hint ? <small>{fact.hint}</small> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {signals.length > 0 ? (
        <ul className="ps-case-context__signals" aria-label="Vorgangssignale">
          {signals.map((signal) => {
            const tone = signal.tone ?? "neutral";
            return (
              <li
                key={signal.id}
                className={`ps-case-context__signal ps-case-context__signal--${tone}`}
              >
                <div>
                  <span>{signal.label}</span>
                  <strong>{signal.value}</strong>
                </div>
                {signal.description ? <p>{signal.description}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {nextStep ? (
        <p className="ps-case-context__next" role="note">
          <span>Nächster Schritt</span>
          <strong>{nextStep}</strong>
        </p>
      ) : null}

      {children ? (
        <div className="ps-case-context__slot">{children}</div>
      ) : null}

      {actions.length > 0 ? (
        <div
          className="ps-case-context__actions"
          role="group"
          aria-label="Vorgangsaktionen"
        >
          {actions.map((action) => (
            <button
              key={action.id}
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

function badgeTone(tone: CaseContextTone): CaseContextTone {
  if (tone === "critical") return "critical";
  if (tone === "warning") return "warning";
  if (tone === "success") return "success";
  return "neutral";
}

function actionClass(tone: NonNullable<CaseContextAction["tone"]>): string {
  if (tone === "danger") {
    return "ps-btn ps-btn--danger";
  }
  if (tone === "primary") {
    return "ps-btn ps-btn--primary";
  }
  return "ps-btn ps-btn--ghost";
}
