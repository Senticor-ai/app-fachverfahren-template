import { type ReactNode, useId } from "react";

export type EvidenceReviewStatus =
  "pending" | "accepted" | "rejected" | "missing";

export interface EvidenceReviewItem {
  id: string;
  label: string;
  source: string;
  status: EvidenceReviewStatus;
  description?: string;
  fileName?: string;
  dueAt?: string;
  confidence?: number;
}

export interface EvidenceReviewGridProps {
  title?: string;
  description?: string;
  items: EvidenceReviewItem[];
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onRequest?: (id: string) => void;
  actions?: ReactNode;
  emptyLabel?: string;
}

const statusMeta: Record<
  EvidenceReviewStatus,
  { label: string; tone: "neutral" | "success" | "warning" | "critical" }
> = {
  pending: { label: "Zu prüfen", tone: "neutral" },
  accepted: { label: "Akzeptiert", tone: "success" },
  rejected: { label: "Abgelehnt", tone: "critical" },
  missing: { label: "Fehlt", tone: "warning" },
};

export function EvidenceReviewGrid({
  title = "Nachweise prüfen",
  description = "Prüfen Sie eingereichte und fehlende Nachweise, bevor Sie die Entscheidung vorbereiten.",
  items,
  onAccept,
  onReject,
  onRequest,
  actions,
  emptyLabel = "Keine Nachweise zur Prüfung.",
}: EvidenceReviewGridProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <section
      className="ps-evidence-review"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="ps-evidence-review__header">
        <div>
          <p className="ps-eyebrow">Nachweise</p>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId} className="ps-muted">
            {description}
          </p>
        </div>
        {actions ? (
          <div className="ps-evidence-review__header-actions">{actions}</div>
        ) : null}
      </header>

      {items.length === 0 ? (
        <p className="ps-evidence-review__empty" role="status">
          {emptyLabel}
        </p>
      ) : (
        <ul className="ps-evidence-review__grid">
          {items.map((item) => (
            <li
              key={item.id}
              className={`ps-evidence-review__item ps-evidence-review__item--${item.status}`}
            >
              <EvidenceReviewCard
                item={item}
                {...(onAccept ? { onAccept } : {})}
                {...(onReject ? { onReject } : {})}
                {...(onRequest ? { onRequest } : {})}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EvidenceReviewCard({
  item,
  onAccept,
  onReject,
  onRequest,
}: {
  item: EvidenceReviewItem;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onRequest?: (id: string) => void;
}) {
  const meta = statusMeta[item.status];
  return (
    <article className="ps-evidence-review__card">
      <header className="ps-evidence-review__card-header">
        <div>
          <h3>{item.label}</h3>
          <p className="ps-muted">{item.source}</p>
        </div>
        <span
          className={`ps-badge ps-badge--${meta.tone}`}
          aria-label={`Status: ${meta.label}`}
        >
          <span className="ps-badge__icon" aria-hidden="true">
            {statusIcon(item.status)}
          </span>
          <span>{meta.label}</span>
        </span>
      </header>

      {item.description ? (
        <p className="ps-evidence-review__description">{item.description}</p>
      ) : null}

      <dl className="ps-evidence-review__meta">
        {item.fileName ? (
          <div>
            <dt>Datei</dt>
            <dd>{item.fileName}</dd>
          </div>
        ) : null}
        {item.dueAt ? (
          <div>
            <dt>Frist</dt>
            <dd className="ps-num">
              <time dateTime={item.dueAt}>{item.dueAt}</time>
            </dd>
          </div>
        ) : null}
        {item.confidence !== undefined ? (
          <div>
            <dt>Konfidenz</dt>
            <dd className="ps-num">{formatConfidence(item.confidence)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="ps-evidence-review__actions">
        {onAccept ? (
          <button
            type="button"
            className="ps-btn ps-btn--primary"
            disabled={item.status === "accepted"}
            onClick={() => onAccept(item.id)}
          >
            Akzeptieren
          </button>
        ) : null}
        {onReject ? (
          <button
            type="button"
            className="ps-btn ps-btn--danger"
            disabled={item.status === "rejected"}
            onClick={() => onReject(item.id)}
          >
            Ablehnen
          </button>
        ) : null}
        {onRequest ? (
          <button
            type="button"
            className="ps-btn ps-btn--ghost"
            disabled={item.status === "missing"}
            onClick={() => onRequest(item.id)}
          >
            Nachfordern
          </button>
        ) : null}
      </div>
    </article>
  );
}

function statusIcon(status: EvidenceReviewStatus): string {
  if (status === "accepted") return "OK";
  if (status === "rejected") return "!";
  if (status === "missing") return "?";
  return "i";
}

function formatConfidence(confidence: number): string {
  const clamped = Math.min(1, Math.max(0, confidence));
  return `${Math.round(clamped * 100)} %`;
}
