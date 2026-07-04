import { type ReactNode, useId } from "react";

export type SourceCoverageStatus =
  | "covered"
  | "missing"
  | "review"
  | "stale"
  | "conflict";

export interface SourceCoverageAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}

export interface SourceCoverageItem {
  id: string;
  label: string;
  status: SourceCoverageStatus;
  summary: string;
  requirementId?: string;
  sourceLabel?: string;
  sourceTypeLabel?: string;
  affectedAreaLabel?: string;
  ownerLabel?: string;
  lastCheckedAt?: string;
  details?: string[];
  action?: SourceCoverageAction;
  secondaryAction?: SourceCoverageAction;
}

export interface SourceCoveragePanelAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}

export interface SourceCoveragePanelProps {
  title?: string;
  description?: string;
  sources: SourceCoverageItem[];
  statusLabel?: string;
  actions?: SourceCoveragePanelAction[];
  emptyLabel?: string;
  footer?: ReactNode;
}

const statusMeta: Record<
  SourceCoverageStatus,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  covered: { label: "Belegt", marker: "OK", tone: "success" },
  missing: { label: "Quelle fehlt", marker: "?", tone: "warning" },
  review: { label: "Zu prüfen", marker: "i", tone: "neutral" },
  stale: { label: "Veraltet", marker: "!", tone: "warning" },
  conflict: { label: "Widerspruch", marker: "x", tone: "critical" },
};

export function SourceCoveragePanel({
  title = "Quellenabdeckung",
  description = "Prüfen Sie, welche Anforderungen durch belastbare Quellen belegt sind und welche Punkte eine fachliche Klärung brauchen.",
  sources,
  statusLabel,
  actions = [],
  emptyLabel = "Keine Quellenanforderungen hinterlegt.",
  footer,
}: SourceCoveragePanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const summary = summarizeSources(sources);

  return (
    <section
      className={`ps-source-coverage ps-source-coverage--${summary.tone}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="ps-source-coverage__header">
        <div className="ps-source-coverage__heading">
          <p className="ps-eyebrow">Quellen</p>
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

      <dl className="ps-source-coverage__summary" aria-label="Quellenstatus">
        <div>
          <dt>Belegt</dt>
          <dd className="ps-num">{summary.covered}</dd>
        </div>
        <div>
          <dt>Offen</dt>
          <dd className="ps-num">{summary.missing}</dd>
        </div>
        <div>
          <dt>Prüfen</dt>
          <dd className="ps-num">{summary.review}</dd>
        </div>
        <div>
          <dt>Blockierend</dt>
          <dd className="ps-num">{summary.blocking}</dd>
        </div>
      </dl>

      {sources.length === 0 ? (
        <p className="ps-source-coverage__empty" role="status">
          {emptyLabel}
        </p>
      ) : (
        <ul className="ps-source-coverage__list">
          {sources.map((source) => (
            <li
              key={source.id}
              className={`ps-source-coverage__item ps-source-coverage__item--${source.status}`}
            >
              <article className="ps-source-coverage__card">
                <header className="ps-source-coverage__card-header">
                  <div>
                    <h3>{source.label}</h3>
                    <p>{source.summary}</p>
                  </div>
                  <StatusBadge
                    label={statusMeta[source.status].label}
                    marker={statusMeta[source.status].marker}
                    tone={statusMeta[source.status].tone}
                  />
                </header>

                <dl className="ps-source-coverage__meta">
                  {source.requirementId ? (
                    <div>
                      <dt>Anforderung</dt>
                      <dd>{source.requirementId}</dd>
                    </div>
                  ) : null}
                  {source.sourceLabel ? (
                    <div>
                      <dt>Quelle</dt>
                      <dd>{source.sourceLabel}</dd>
                    </div>
                  ) : null}
                  {source.sourceTypeLabel ? (
                    <div>
                      <dt>Quelltyp</dt>
                      <dd>{source.sourceTypeLabel}</dd>
                    </div>
                  ) : null}
                  {source.affectedAreaLabel ? (
                    <div>
                      <dt>Bereich</dt>
                      <dd>{source.affectedAreaLabel}</dd>
                    </div>
                  ) : null}
                  {source.ownerLabel ? (
                    <div>
                      <dt>Zuständig</dt>
                      <dd>{source.ownerLabel}</dd>
                    </div>
                  ) : null}
                  {source.lastCheckedAt ? (
                    <div>
                      <dt>Geprüft am</dt>
                      <dd className="ps-num">
                        <time dateTime={source.lastCheckedAt}>
                          {source.lastCheckedAt}
                        </time>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {source.details?.length ? (
                  <details className="ps-source-coverage__details">
                    <summary>Quellhinweise anzeigen</summary>
                    <ul>
                      {source.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                {source.action || source.secondaryAction ? (
                  <div
                    className="ps-source-coverage__actions"
                    role="group"
                    aria-label={`Aktionen für ${source.label}`}
                  >
                    {source.secondaryAction ? (
                      <ActionButton action={source.secondaryAction} />
                    ) : null}
                    {source.action ? (
                      <ActionButton action={source.action} />
                    ) : null}
                  </div>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      )}

      {footer ? (
        <div className="ps-source-coverage__footer" role="note">
          {footer}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div
          className="ps-source-coverage__panel-actions"
          role="group"
          aria-label="Quellenaktionen"
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

function summarizeSources(sources: SourceCoverageItem[]) {
  const covered = sources.filter(
    (source) => source.status === "covered",
  ).length;
  const missing = sources.filter(
    (source) => source.status === "missing",
  ).length;
  const review = sources.filter((source) => source.status === "review").length;
  const stale = sources.filter((source) => source.status === "stale").length;
  const conflict = sources.filter(
    (source) => source.status === "conflict",
  ).length;
  const blocking = missing + stale + conflict;

  if (conflict > 0) {
    return {
      covered,
      missing,
      review,
      blocking,
      tone: "block" as const,
      label: `${conflict} Widerspruch`,
      marker: "x",
      badgeTone: "critical" as const,
    };
  }

  if (blocking > 0) {
    return {
      covered,
      missing,
      review,
      blocking,
      tone: "review" as const,
      label: `${blocking} offen`,
      marker: "!",
      badgeTone: "warning" as const,
    };
  }

  if (review > 0) {
    return {
      covered,
      missing,
      review,
      blocking,
      tone: "review" as const,
      label: `${review} zu prüfen`,
      marker: "i",
      badgeTone: "neutral" as const,
    };
  }

  return {
    covered,
    missing,
    review,
    blocking,
    tone: "clear" as const,
    label: sources.length === 0 ? "Keine Quellen" : "Abgedeckt",
    marker: sources.length === 0 ? "i" : "OK",
    badgeTone:
      sources.length === 0 ? ("warning" as const) : ("success" as const),
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

function ActionButton({ action }: { action: SourceCoverageAction }) {
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
    SourceCoverageAction["tone"] | SourceCoveragePanelAction["tone"]
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
