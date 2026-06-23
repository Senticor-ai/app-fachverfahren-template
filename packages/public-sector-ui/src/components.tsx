import type { ReactNode } from "react";

export interface ServiceHeaderProps {
  appName: string;
  authorityName: string;
  jurisdictionLabel: string;
  children?: ReactNode;
}

export function ServiceHeader({
  appName,
  authorityName,
  jurisdictionLabel,
  children,
}: ServiceHeaderProps) {
  return (
    <header className="ps-service-header">
      <div>
        <p className="ps-eyebrow">{authorityName}</p>
        <h1>{appName}</h1>
        <p className="ps-muted">{jurisdictionLabel}</p>
      </div>
      {children ? (
        <div className="ps-service-header__actions">{children}</div>
      ) : null}
    </header>
  );
}

export interface AuthoritySelectorProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export function AuthoritySelector({
  label,
  value,
  options,
  onChange,
}: AuthoritySelectorProps) {
  return (
    <label className="ps-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface StatusBadgeProps {
  label: string;
  tone?: "neutral" | "success" | "warning" | "critical";
}

const statusMarker: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  neutral: "i",
  success: "OK",
  warning: "!",
  critical: "x",
};

export function CaseStatus({ label, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span className={`ps-badge ps-badge--${tone}`}>
      <span className="ps-badge__icon" aria-hidden="true">
        {statusMarker[tone]}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function DeadlineIndicator({
  label,
  dueAt,
  overdue,
}: {
  label: string;
  dueAt: string;
  overdue?: boolean;
}) {
  return (
    <span
      className={overdue ? "ps-deadline ps-deadline--overdue" : "ps-deadline"}
    >
      <span>{label}</span>
      <time dateTime={dueAt}>{dueAt}</time>
    </span>
  );
}

export function EvidenceList({
  items,
}: {
  items: { evidenceId: string; label: string; source: string }[];
}) {
  return (
    <ul className="ps-evidence-list">
      {items.map((item) => (
        <li key={item.evidenceId}>
          <strong>{item.label}</strong>
          <span>{item.source}</span>
        </li>
      ))}
    </ul>
  );
}

export function DecisionSummary({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="ps-decision-summary" aria-labelledby="decision-summary">
      <h2 id="decision-summary">{title}</h2>
      {children}
    </section>
  );
}

export function OfficialNotice({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="ps-official-notice">
      <h2>{title}</h2>
      {children}
    </article>
  );
}

export function ApplicantIdentity({
  name,
  identifier,
}: {
  name: string;
  identifier?: string;
}) {
  return (
    <span className="ps-applicant-identity">
      <strong>{name}</strong>
      {identifier ? <span>{identifier}</span> : null}
    </span>
  );
}

export function RepresentationBadge({ label }: { label: string }) {
  return <span className="ps-representation-badge">{label}</span>;
}

export function PaymentStatus({ label, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span className={`ps-payment-status ps-payment-status--${tone}`}>
      <span className="ps-badge__icon" aria-hidden="true">
        {statusMarker[tone]}
      </span>
      <span>{label}</span>
    </span>
  );
}

export interface LanguageAccessLinksProps {
  signLanguageHref?: string;
  plainLanguageHref?: string;
}

export function LanguageAccessLinks({
  signLanguageHref,
  plainLanguageHref,
}: LanguageAccessLinksProps = {}) {
  if (!signLanguageHref && !plainLanguageHref) {
    return null;
  }

  return (
    <nav
      aria-label="Alternative Sprachangebote"
      className="ps-language-access-links"
    >
      {signLanguageHref ? <a href={signLanguageHref}>Gebärdensprache</a> : null}
      {plainLanguageHref ? (
        <a href={plainLanguageHref}>Leichte Sprache</a>
      ) : null}
    </nav>
  );
}

export function AccessibilityFeedback({ href }: { href: string }) {
  return (
    <a className="ps-accessibility-feedback" href={href}>
      Barriere melden
    </a>
  );
}

export type GateTone = "pass" | "review" | "block";

export interface GateStatusProps {
  label: string;
  tone: GateTone;
}

const gateMarker: Record<GateTone, string> = {
  pass: "OK",
  review: "!",
  block: "x",
};

export function GateStatus({ label, tone }: GateStatusProps) {
  return (
    <span className={`ps-gate-status ps-gate-status--${tone}`}>
      <span className="ps-badge__icon" aria-hidden="true">
        {gateMarker[tone]}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function GovernanceBar({
  children,
  modeLabel,
  runLabel,
}: {
  children: ReactNode;
  modeLabel: string;
  runLabel: string;
}) {
  return (
    <header className="ps-governance-bar">
      <div>
        <p className="ps-eyebrow">Governance</p>
        <strong>{modeLabel}</strong>
        <span>{runLabel}</span>
      </div>
      <div className="ps-governance-bar__status">{children}</div>
    </header>
  );
}

export function ContextRail({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <aside className="ps-context-rail" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </aside>
  );
}

export function WorkspacePanel({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="ps-workspace-panel" aria-labelledby="workspace-title">
      <h2 id="workspace-title">{title}</h2>
      {children}
    </section>
  );
}

export interface RunCardProps {
  title: string;
  status: string;
  agent: string;
  summary: string;
  inputs: readonly string[];
  children?: ReactNode;
}

export function RunCard({
  agent,
  children,
  inputs,
  status,
  summary,
  title,
}: RunCardProps) {
  return (
    <article className="ps-run-card">
      <header>
        <div>
          <span>{status}</span>
          <h3>{title}</h3>
        </div>
        <strong>{agent}</strong>
      </header>
      <p>{summary}</p>
      <ul aria-label="Genutzte Inputs">
        {inputs.map((input) => (
          <li key={input}>{input}</li>
        ))}
      </ul>
      {children ? <div className="ps-run-card__body">{children}</div> : null}
    </article>
  );
}

export function WorkingTabs({
  tabs,
}: {
  tabs: readonly { id: string; label: string; active?: boolean }[];
}) {
  return (
    <div className="ps-working-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          aria-selected={tab.active ? "true" : "false"}
          key={tab.id}
          role="tab"
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export interface FindingSummaryProps {
  findingId: string;
  source: string;
  owner: string;
  gateImpact: "allow" | "conditional" | "block";
  correction: string;
}

export function FindingSummary({
  correction,
  findingId,
  gateImpact,
  owner,
  source,
}: FindingSummaryProps) {
  return (
    <article className="ps-finding-summary">
      <header>
        <strong>{findingId}</strong>
        <GateStatus
          label={gateImpact}
          tone={
            gateImpact === "block"
              ? "block"
              : gateImpact === "allow"
                ? "pass"
                : "review"
          }
        />
      </header>
      <dl>
        <div>
          <dt>Quelle</dt>
          <dd>{source}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{owner}</dd>
        </div>
        <div>
          <dt>Korrektur</dt>
          <dd>{correction}</dd>
        </div>
      </dl>
    </article>
  );
}
