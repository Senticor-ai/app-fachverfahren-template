import { type ReactNode, useId } from "react";

export type DocumentChecklistStatus =
  | "available"
  | "missing"
  | "expired"
  | "review"
  | "optional";

export type DocumentRequirement = "required" | "optional";

export interface DocumentChecklistAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
}

export interface DocumentChecklistItem {
  id: string;
  label: string;
  requirement: DocumentRequirement;
  status: DocumentChecklistStatus;
  description?: string;
  sourceLabel?: string;
  fileName?: string;
  receivedAt?: string;
  validUntil?: string;
  action?: DocumentChecklistAction;
  secondaryAction?: DocumentChecklistAction;
}

export interface DocumentChecklistPanelAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary";
}

export interface DocumentChecklistPanelProps {
  title?: string;
  description?: string;
  documents: DocumentChecklistItem[];
  statusLabel?: string;
  actions?: DocumentChecklistPanelAction[];
  emptyLabel?: string;
  footer?: ReactNode;
}

const statusMeta: Record<
  DocumentChecklistStatus,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  available: { label: "Vorhanden", marker: "OK", tone: "success" },
  missing: { label: "Fehlt", marker: "?", tone: "warning" },
  expired: { label: "Abgelaufen", marker: "!", tone: "critical" },
  review: { label: "Zu prüfen", marker: "i", tone: "neutral" },
  optional: { label: "Optional", marker: "·", tone: "neutral" },
};

const requirementMeta: Record<
  DocumentRequirement,
  {
    label: string;
    marker: string;
    tone: "neutral" | "warning";
  }
> = {
  required: { label: "Pflicht", marker: "!", tone: "warning" },
  optional: { label: "Optional", marker: "·", tone: "neutral" },
};

export function DocumentChecklistPanel({
  title = "Dokumente und Nachweise",
  description = "Prüfen Sie, welche Unterlagen vorliegen, fehlen oder wegen Gültigkeit erneut benötigt werden.",
  documents,
  statusLabel,
  actions = [],
  emptyLabel = "Keine Dokumentanforderungen hinterlegt.",
  footer,
}: DocumentChecklistPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const summary = summarizeDocuments(documents);

  return (
    <section
      className={`ps-document-checklist ps-document-checklist--${summary.tone}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="ps-document-checklist__header">
        <div className="ps-document-checklist__heading">
          <p className="ps-eyebrow">Unterlagen</p>
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
        className="ps-document-checklist__summary"
        aria-label="Dokumentstatus"
      >
        <div>
          <dt>Vorhanden</dt>
          <dd className="ps-num">{summary.available}</dd>
        </div>
        <div>
          <dt>Fehlt</dt>
          <dd className="ps-num">{summary.missing}</dd>
        </div>
        <div>
          <dt>Abgelaufen</dt>
          <dd className="ps-num">{summary.expired}</dd>
        </div>
        <div>
          <dt>Prüfen</dt>
          <dd className="ps-num">{summary.review}</dd>
        </div>
      </dl>

      {documents.length === 0 ? (
        <p className="ps-document-checklist__empty" role="status">
          {emptyLabel}
        </p>
      ) : (
        <ul className="ps-document-checklist__list">
          {documents.map((document) => (
            <li
              key={document.id}
              className={`ps-document-checklist__item ps-document-checklist__item--${document.status}`}
            >
              <article className="ps-document-checklist__card">
                <header className="ps-document-checklist__card-header">
                  <div>
                    <h3>{document.label}</h3>
                    {document.description ? (
                      <p>{document.description}</p>
                    ) : null}
                  </div>
                  <div
                    className="ps-document-checklist__badges"
                    aria-label="Dokumentstatus"
                  >
                    <StatusBadge
                      label={statusMeta[document.status].label}
                      marker={statusMeta[document.status].marker}
                      tone={statusMeta[document.status].tone}
                    />
                    <StatusBadge
                      label={requirementMeta[document.requirement].label}
                      marker={requirementMeta[document.requirement].marker}
                      tone={requirementMeta[document.requirement].tone}
                    />
                  </div>
                </header>

                <dl className="ps-document-checklist__meta">
                  {document.sourceLabel ? (
                    <div>
                      <dt>Quelle</dt>
                      <dd>{document.sourceLabel}</dd>
                    </div>
                  ) : null}
                  {document.fileName ? (
                    <div>
                      <dt>Datei</dt>
                      <dd>{document.fileName}</dd>
                    </div>
                  ) : null}
                  {document.receivedAt ? (
                    <div>
                      <dt>Eingang</dt>
                      <dd className="ps-num">
                        <time dateTime={document.receivedAt}>
                          {document.receivedAt}
                        </time>
                      </dd>
                    </div>
                  ) : null}
                  {document.validUntil ? (
                    <div>
                      <dt>Gültig bis</dt>
                      <dd className="ps-num">
                        <time dateTime={document.validUntil}>
                          {document.validUntil}
                        </time>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {document.action || document.secondaryAction ? (
                  <div
                    className="ps-document-checklist__actions"
                    role="group"
                    aria-label={`Aktionen für ${document.label}`}
                  >
                    {document.secondaryAction ? (
                      <ActionButton action={document.secondaryAction} />
                    ) : null}
                    {document.action ? (
                      <ActionButton action={document.action} />
                    ) : null}
                  </div>
                ) : null}
              </article>
            </li>
          ))}
        </ul>
      )}

      {footer ? (
        <div className="ps-document-checklist__footer" role="note">
          {footer}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div
          className="ps-document-checklist__panel-actions"
          role="group"
          aria-label="Dokumentaktionen"
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

function summarizeDocuments(documents: DocumentChecklistItem[]) {
  const available = documents.filter(
    (document) => document.status === "available",
  ).length;
  const missing = documents.filter(
    (document) => document.status === "missing",
  ).length;
  const expired = documents.filter(
    (document) => document.status === "expired",
  ).length;
  const review = documents.filter(
    (document) => document.status === "review",
  ).length;

  if (expired > 0) {
    return {
      available,
      missing,
      expired,
      review,
      tone: "expired" as const,
      label: `${expired} abgelaufen`,
      marker: "!",
      badgeTone: "critical" as const,
    };
  }

  if (missing > 0) {
    return {
      available,
      missing,
      expired,
      review,
      tone: "missing" as const,
      label: `${missing} fehlen`,
      marker: "?",
      badgeTone: "warning" as const,
    };
  }

  if (review > 0) {
    return {
      available,
      missing,
      expired,
      review,
      tone: "review" as const,
      label: `${review} zu prüfen`,
      marker: "i",
      badgeTone: "neutral" as const,
    };
  }

  return {
    available,
    missing,
    expired,
    review,
    tone: "complete" as const,
    label: documents.length === 0 ? "Keine Anforderungen" : "Vollständig",
    marker: documents.length === 0 ? "i" : "OK",
    badgeTone:
      documents.length === 0 ? ("warning" as const) : ("success" as const),
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

function ActionButton({ action }: { action: DocumentChecklistAction }) {
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

function actionClass(tone: NonNullable<DocumentChecklistAction["tone"]>) {
  if (tone === "primary") {
    return "ps-btn ps-btn--primary";
  }

  if (tone === "danger") {
    return "ps-btn ps-btn--danger";
  }

  return "ps-btn ps-btn--ghost";
}

function panelActionClass(
  tone: NonNullable<DocumentChecklistPanelAction["tone"]>,
) {
  return tone === "primary" ? "ps-btn ps-btn--primary" : "ps-btn ps-btn--ghost";
}
