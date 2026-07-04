import { type FormEvent, type ReactNode, useId } from "react";

export type CommunicationKind = "message" | "request" | "notice" | "decision";

export type CommunicationDirection = "inbound" | "outbound" | "internal";

export type CommunicationStatus = "unread" | "read" | "sent" | "draft";

export interface CommunicationAttachment {
  id: string;
  label: string;
  href?: string;
}

export interface CommunicationMessage {
  id: string;
  subject: string;
  body: string;
  authorLabel: string;
  at: string;
  direction: CommunicationDirection;
  status: CommunicationStatus;
  kind?: CommunicationKind;
  channelLabel?: string;
  dueAt?: string;
  attachments?: CommunicationAttachment[];
}

export interface CommunicationDraft {
  subject: string;
  body: string;
  dueAt?: string;
  subjectLabel?: string;
  bodyLabel?: string;
  dueAtLabel?: string;
  submitLabel?: string;
  disabled?: boolean;
  statusLabel?: string;
  onSubjectChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onDueAtChange?: (value: string) => void;
  onSubmit: () => void;
}

export interface CommunicationThreadProps {
  title?: string;
  description?: string;
  messages: CommunicationMessage[];
  draft?: CommunicationDraft;
  actions?: ReactNode;
  emptyLabel?: string;
  onMarkRead?: (id: string) => void;
  onReply?: (id: string) => void;
}

const kindLabel: Record<CommunicationKind, string> = {
  message: "Nachricht",
  request: "Nachforderung",
  notice: "Hinweis",
  decision: "Entscheidung",
};

const statusMeta: Record<
  CommunicationStatus,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  unread: { label: "Ungelesen", marker: "!", tone: "warning" },
  read: { label: "Gelesen", marker: "OK", tone: "success" },
  sent: { label: "Gesendet", marker: "OK", tone: "success" },
  draft: { label: "Entwurf", marker: "i", tone: "neutral" },
};

const directionLabel: Record<CommunicationDirection, string> = {
  inbound: "Eingang",
  outbound: "Ausgang",
  internal: "Intern",
};

export function CommunicationThread({
  title = "Kommunikation",
  description = "Verfolgen Sie Nachrichten, Nachforderungen, Antworten und Entwürfe im Vorgang.",
  messages,
  draft,
  actions,
  emptyLabel = "Keine Kommunikation im Vorgang.",
  onMarkRead,
  onReply,
}: CommunicationThreadProps) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <section
      className="ps-communication-thread"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="ps-communication-thread__header">
        <div className="ps-communication-thread__heading">
          <p className="ps-eyebrow">Kommunikation</p>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId} className="ps-muted">
            {description}
          </p>
        </div>
        {actions ? (
          <div className="ps-communication-thread__actions">{actions}</div>
        ) : null}
      </header>

      {messages.length === 0 ? (
        <p className="ps-communication-thread__empty" role="status">
          {emptyLabel}
        </p>
      ) : (
        <ol className="ps-communication-thread__list">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`ps-communication-thread__item ps-communication-thread__item--${message.direction}`}
            >
              <CommunicationCard
                message={message}
                {...(onMarkRead ? { onMarkRead } : {})}
                {...(onReply ? { onReply } : {})}
              />
            </li>
          ))}
        </ol>
      )}

      {draft ? <CommunicationDraftForm draft={draft} /> : null}
    </section>
  );
}

function CommunicationCard({
  message,
  onMarkRead,
  onReply,
}: {
  message: CommunicationMessage;
  onMarkRead?: (id: string) => void;
  onReply?: (id: string) => void;
}) {
  const status = statusMeta[message.status];
  const kind = kindLabel[message.kind ?? "message"];

  return (
    <article className="ps-communication-thread__card">
      <header className="ps-communication-thread__card-header">
        <div>
          <p className="ps-communication-thread__meta">
            <span>{directionLabel[message.direction]}</span>
            <span>{kind}</span>
            {message.channelLabel ? <span>{message.channelLabel}</span> : null}
          </p>
          <h3>{message.subject}</h3>
          <p className="ps-muted">
            {message.authorLabel} ·{" "}
            <time dateTime={message.at}>{message.at}</time>
          </p>
        </div>
        <StatusBadge
          label={status.label}
          marker={status.marker}
          tone={status.tone}
        />
      </header>

      <p className="ps-communication-thread__body">{message.body}</p>

      {message.dueAt ? (
        <p className="ps-communication-thread__deadline">
          <span>Frist</span>
          <time dateTime={message.dueAt} className="ps-num">
            {message.dueAt}
          </time>
        </p>
      ) : null}

      {message.attachments?.length ? (
        <ul
          className="ps-communication-thread__attachments"
          aria-label="Anhänge"
        >
          {message.attachments.map((attachment) => (
            <li key={attachment.id}>
              {attachment.href ? (
                <a href={attachment.href}>{attachment.label}</a>
              ) : (
                <span>{attachment.label}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {onMarkRead || onReply ? (
        <div
          className="ps-communication-thread__card-actions"
          role="group"
          aria-label={`Aktionen zu ${message.subject}`}
        >
          {onMarkRead ? (
            <button
              type="button"
              className="ps-btn ps-btn--ghost"
              disabled={message.status !== "unread"}
              onClick={() => onMarkRead(message.id)}
            >
              Als gelesen markieren
            </button>
          ) : null}
          {onReply ? (
            <button
              type="button"
              className="ps-btn ps-btn--primary"
              onClick={() => onReply(message.id)}
            >
              Antworten
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function CommunicationDraftForm({ draft }: { draft: CommunicationDraft }) {
  const subjectId = useId();
  const bodyId = useId();
  const dueAtId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    draft.onSubmit();
  }

  return (
    <form className="ps-communication-thread__draft" onSubmit={submit}>
      <header>
        <p className="ps-eyebrow">Entwurf</p>
        <h3>Nachricht vorbereiten</h3>
        {draft.statusLabel ? (
          <p className="ps-muted" role="status">
            {draft.statusLabel}
          </p>
        ) : null}
      </header>

      <label className="ps-communication-thread__field" htmlFor={subjectId}>
        <span>{draft.subjectLabel ?? "Betreff"}</span>
        <input
          id={subjectId}
          type="text"
          value={draft.subject}
          onChange={(event) => draft.onSubjectChange(event.target.value)}
        />
      </label>

      <label className="ps-communication-thread__field" htmlFor={bodyId}>
        <span>{draft.bodyLabel ?? "Nachricht"}</span>
        <textarea
          id={bodyId}
          value={draft.body}
          rows={5}
          onChange={(event) => draft.onBodyChange(event.target.value)}
        />
      </label>

      {draft.onDueAtChange ? (
        <label className="ps-communication-thread__field" htmlFor={dueAtId}>
          <span>{draft.dueAtLabel ?? "Frist"}</span>
          <input
            id={dueAtId}
            type="date"
            value={draft.dueAt ?? ""}
            onChange={(event) => draft.onDueAtChange?.(event.target.value)}
          />
        </label>
      ) : null}

      <div className="ps-communication-thread__draft-actions">
        <button
          type="submit"
          className="ps-btn ps-btn--primary"
          disabled={draft.disabled}
        >
          {draft.submitLabel ?? "Nachricht senden"}
        </button>
      </div>
    </form>
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
