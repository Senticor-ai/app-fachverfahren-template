import { type ReactNode, useId } from "react";

export type ReadinessGateTone = "pass" | "review" | "block";

export interface ReadinessGateAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ReadinessGate {
  id: string;
  label: string;
  tone: ReadinessGateTone;
  summary: string;
  ownerLabel?: string;
  dueAt?: string;
  details?: string[];
  action?: ReadinessGateAction;
}

export interface ReadinessGatePanelAction {
  label: string;
  onClick: () => void;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}

export interface ReadinessGatePanelProps {
  title?: string;
  description?: string;
  gates: ReadinessGate[];
  statusLabel?: string;
  actions?: ReadinessGatePanelAction[];
  emptyLabel?: string;
  footer?: ReactNode;
}

const gateMeta: Record<
  ReadinessGateTone,
  {
    label: string;
    marker: string;
    badgeTone: "success" | "warning" | "critical";
  }
> = {
  pass: { label: "Erfüllt", marker: "OK", badgeTone: "success" },
  review: { label: "Prüfen", marker: "!", badgeTone: "warning" },
  block: { label: "Blockiert", marker: "x", badgeTone: "critical" },
};

export function ReadinessGatePanel({
  title = "Entscheidungsreife prüfen",
  description = "Prüfen Sie die fachlichen Gates, bevor der Vorgang zur Entscheidung weitergegeben wird.",
  gates,
  statusLabel,
  actions = [],
  emptyLabel = "Keine Prüfpunkte hinterlegt.",
  footer,
}: ReadinessGatePanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const summary = summarize(gates);

  return (
    <section
      className={`ps-readiness-gates ps-readiness-gates--${summary.tone}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="ps-readiness-gates__header">
        <div className="ps-readiness-gates__heading">
          <p className="ps-eyebrow">Prüfstand</p>
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

      <dl className="ps-readiness-gates__summary" aria-label="Zusammenfassung">
        <div>
          <dt>Erfüllt</dt>
          <dd className="ps-num">{summary.pass}</dd>
        </div>
        <div>
          <dt>Prüfen</dt>
          <dd className="ps-num">{summary.review}</dd>
        </div>
        <div>
          <dt>Blockiert</dt>
          <dd className="ps-num">{summary.block}</dd>
        </div>
      </dl>

      {gates.length === 0 ? (
        <p className="ps-readiness-gates__empty" role="status">
          {emptyLabel}
        </p>
      ) : (
        <ul className="ps-readiness-gates__list">
          {gates.map((gate) => (
            <li
              key={gate.id}
              className={`ps-readiness-gates__item ps-readiness-gates__item--${gate.tone}`}
            >
              <article className="ps-readiness-gates__card">
                <header className="ps-readiness-gates__card-header">
                  <div>
                    <h3>{gate.label}</h3>
                    <p>{gate.summary}</p>
                  </div>
                  <StatusBadge
                    label={gateMeta[gate.tone].label}
                    marker={gateMeta[gate.tone].marker}
                    tone={gateMeta[gate.tone].badgeTone}
                  />
                </header>

                {gate.ownerLabel || gate.dueAt ? (
                  <dl className="ps-readiness-gates__meta">
                    {gate.ownerLabel ? (
                      <div>
                        <dt>Zuständig</dt>
                        <dd>{gate.ownerLabel}</dd>
                      </div>
                    ) : null}
                    {gate.dueAt ? (
                      <div>
                        <dt>Frist</dt>
                        <dd className="ps-num">
                          <time dateTime={gate.dueAt}>{gate.dueAt}</time>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}

                {gate.details?.length ? (
                  <details className="ps-readiness-gates__details">
                    <summary>Details anzeigen</summary>
                    <ul>
                      {gate.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                {gate.action ? (
                  <div className="ps-readiness-gates__card-actions">
                    <button
                      type="button"
                      className="ps-btn ps-btn--ghost"
                      disabled={gate.action.disabled}
                      onClick={gate.action.onClick}
                    >
                      {gate.action.label}
                    </button>
                  </div>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      )}

      {footer ? (
        <div className="ps-readiness-gates__footer" role="note">
          {footer}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div
          className="ps-readiness-gates__actions"
          role="group"
          aria-label="Aktionen zur Entscheidungsreife"
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

function summarize(gates: ReadinessGate[]) {
  const pass = gates.filter((gate) => gate.tone === "pass").length;
  const review = gates.filter((gate) => gate.tone === "review").length;
  const block = gates.filter((gate) => gate.tone === "block").length;

  if (block > 0) {
    return {
      pass,
      review,
      block,
      tone: "block" as const,
      label: "Nicht entscheidungsreif",
      marker: "x",
      badgeTone: "critical" as const,
    };
  }

  if (review > 0) {
    return {
      pass,
      review,
      block,
      tone: "review" as const,
      label: "Prüfung erforderlich",
      marker: "!",
      badgeTone: "warning" as const,
    };
  }

  return {
    pass,
    review,
    block,
    tone: "pass" as const,
    label: gates.length === 0 ? "Keine Gates" : "Entscheidungsreif",
    marker: gates.length === 0 ? "i" : "OK",
    badgeTone: gates.length === 0 ? ("warning" as const) : ("success" as const),
  };
}

function StatusBadge({
  label,
  marker,
  tone,
}: {
  label: string;
  marker: string;
  tone: "success" | "warning" | "critical";
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

function actionClass(
  tone: NonNullable<ReadinessGatePanelAction["tone"]>,
): string {
  if (tone === "danger") {
    return "ps-btn ps-btn--danger";
  }
  if (tone === "primary") {
    return "ps-btn ps-btn--primary";
  }
  return "ps-btn ps-btn--ghost";
}
