// Aufsichts-/Management-Dashboard (Überblick → Drilldown → read-only Audit-Trail). Setzt den
// fachverfahren-ux-contract für die Aufsichts-Persona um: KPI-Kacheln mit Drilldown, optionale
// Filterleiste und ein revisionssicherer (append-only) Audit-Trail mit pseudonymisierten Akteuren
// (z.B. "SB-7f3a") — kein Klartext-PII. Status immer über Text + Icon + Status-Klasse (nie nur Farbe),
// Zahlen mit tabular-nums (ps-num), tastaturbedienbar. Reine, geprüfte Komponenten — der Motor
// komponiert daraus Aufsichts-Screens.

/** Bewertung einer Kennzahl (steuert die Status-Darstellung: Text + Icon + Status-Klasse, nie nur Farbe). */
export type MetricTone = "neutral" | "success" | "warning" | "critical";

export interface DashboardMetric {
  id: string;
  /** Kurzes Label der Kennzahl (z.B. "Offene Vorgänge"). */
  label: string;
  /** Darstellungswert als Zeichenkette (vorformatiert, deterministisch — kein Date.now()/Zufall). */
  value: string;
  /** Bewertung der Kennzahl; ohne Angabe neutral. */
  tone?: MetricTone;
  /** Drilldown auf die Detailansicht; ist sie gesetzt, wird die Kachel zur Schaltfläche. */
  onDrilldown?: () => void;
}

export interface AuditTrailEntry {
  id: string;
  /** Zeitpunkt als ISO-Zeichenkette (deterministisch, kein Date.now()). */
  at: string;
  /** Pseudonymisierter Akteur (z.B. "SB-7f3a") — kein Klartext-PII. */
  actor: string;
  action: string;
}

export interface DashboardFilter {
  label: string;
  value: string;
}

export interface AuditDashboardProps {
  metrics: DashboardMetric[];
  trail: AuditTrailEntry[];
  /** Optionale Filterleiste (z.B. Zeitraum oder Stelle). */
  filters?: DashboardFilter[];
  /** Aktiver Filterwert (kontrolliert). */
  activeFilter?: string;
  onFilter?: (value: string) => void;
}

const toneLabel: Record<MetricTone, string> = {
  neutral: "Normal",
  success: "Im Soll",
  warning: "Beobachten",
  critical: "Kritisch",
};

const toneMarker: Record<MetricTone, string> = {
  neutral: "i",
  success: "OK",
  warning: "!",
  critical: "x",
};

/** Status-Hinweis einer Kennzahl: Icon + Text + Status-Klasse (nie nur Farbe). */
export function MetricStatus({ tone }: { tone: MetricTone }) {
  return (
    <span className={`ps-kpi__status ps-kpi__status--${tone}`}>
      <span className="ps-kpi__status-icon" aria-hidden="true">
        {toneMarker[tone]}
      </span>
      <span>{toneLabel[tone]}</span>
    </span>
  );
}

/**
 * Eine KPI-Kachel: Label, großer Wert (ps-num, tabular-nums) und Status (Text + Icon + Status-Klasse).
 * Ist onDrilldown gesetzt, ist die ganze Kachel eine Schaltfläche (tastaturbedienbar) mit aria-label;
 * andernfalls eine reine Kennzahl-Kachel.
 */
export function MetricCard({ metric }: { metric: DashboardMetric }) {
  const tone: MetricTone = metric.tone ?? "neutral";
  const body = (
    <>
      <span className="ps-kpi__label">{metric.label}</span>
      <span className="ps-kpi__value ps-num">{metric.value}</span>
      <MetricStatus tone={tone} />
    </>
  );

  if (metric.onDrilldown) {
    return (
      <button
        type="button"
        className={`ps-kpi ps-kpi--${tone} ps-kpi--actionable`}
        aria-label={`${metric.label}: ${metric.value} — ${toneLabel[tone]}. Details öffnen.`}
        onClick={metric.onDrilldown}
      >
        {body}
        <span className="ps-kpi__drill" aria-hidden="true">
          Details ›
        </span>
      </button>
    );
  }

  return (
    <div className={`ps-kpi ps-kpi--${tone}`}>
      <span className="ps-visually-hidden">
        {`${metric.label}: ${metric.value} — ${toneLabel[tone]}.`}
      </span>
      {body}
    </div>
  );
}

/**
 * Optionale Filterleiste der Aufsicht (einfachauswahl, kontrolliert). Der aktive Filter ist über
 * aria-pressed ausgezeichnet; ohne onFilter sind die Schalter rein informativ deaktiviert.
 */
export function DashboardFilterBar({
  filters,
  activeFilter,
  onFilter,
}: {
  filters: DashboardFilter[];
  activeFilter?: string;
  onFilter?: (value: string) => void;
}) {
  return (
    <div
      className="ps-dashboard__filters"
      role="group"
      aria-label="Filter der Übersicht"
    >
      {filters.map((filter) => {
        const active = filter.value === activeFilter;
        return (
          <button
            key={filter.value}
            type="button"
            className={
              active
                ? "ps-dashboard__chip ps-dashboard__chip--active"
                : "ps-dashboard__chip"
            }
            aria-pressed={active}
            disabled={!onFilter}
            onClick={onFilter ? () => onFilter(filter.value) : undefined}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Read-only Audit-Trail als Tabelle (append-only-Anmutung): Zeitpunkt, pseudonymisierter Akteur und
 * Aktion. Rein lesend (keine Bearbeitung), pseudonymisiert (kein Klartext-PII), mit sichtbarer
 * Beschriftung und versteckter Caption. Zeigt einen Leerzustand, solange keine Einträge vorliegen.
 */
export function AuditTrail({ trail }: { trail: AuditTrailEntry[] }) {
  return (
    <section className="ps-audit-trail" aria-labelledby="ps-audit-trail__title">
      <header className="ps-audit-trail__header">
        <h2 id="ps-audit-trail__title" className="ps-audit-trail__title">
          Audit-Trail
        </h2>
        <p className="ps-muted">
          Revisionssicher und nur lesend. Akteure sind pseudonymisiert.
        </p>
      </header>
      <div className="ps-audit-trail__scroll">
        <table className="ps-audit-trail__table">
          <caption className="ps-visually-hidden">
            Chronologischer, nur lesender Audit-Trail mit pseudonymisierten
            Akteuren
          </caption>
          <thead className="ps-audit-trail__head">
            <tr>
              <th scope="col" className="ps-audit-trail__col">
                Zeitpunkt
              </th>
              <th scope="col" className="ps-audit-trail__col">
                Akteur (pseudonymisiert)
              </th>
              <th scope="col" className="ps-audit-trail__col">
                Aktion
              </th>
            </tr>
          </thead>
          <tbody>
            {trail.length === 0 ? (
              <tr className="ps-audit-trail__empty-row">
                <td colSpan={3} className="ps-audit-trail__empty">
                  Noch keine Einträge im Audit-Trail.
                </td>
              </tr>
            ) : (
              trail.map((entry) => (
                <tr key={entry.id} className="ps-audit-trail__row">
                  <td className="ps-audit-trail__cell ps-num">
                    <time dateTime={entry.at}>{entry.at}</time>
                  </td>
                  <td className="ps-audit-trail__cell ps-num">{entry.actor}</td>
                  <td className="ps-audit-trail__cell">{entry.action}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Aufsichts-/Management-Dashboard: eine Reihe KPI-Kacheln (mit optionalem Drilldown), eine optionale
 * Filterleiste und ein read-only Audit-Trail. Zeigt einen Leerzustand, solange keine Kennzahlen
 * vorliegen (z.B. während des Ladens). Alle Werte sind pseudonymisiert und deterministisch.
 */
export function AuditDashboard({
  metrics,
  trail,
  filters,
  activeFilter,
  onFilter,
}: AuditDashboardProps) {
  return (
    <section className="ps-dashboard" aria-labelledby="ps-dashboard__title">
      <header className="ps-dashboard__header">
        <p className="ps-eyebrow">Aufsicht</p>
        <h1 id="ps-dashboard__title" className="ps-dashboard__title">
          Überblick & Audit
        </h1>
        <p className="ps-muted">
          Sie sehen aggregierte Kennzahlen und den nur lesenden Audit-Trail.
          Klicken Sie eine Kennzahl an, um in die Details zu springen.
        </p>
      </header>

      {filters && filters.length > 0 ? (
        <DashboardFilterBar
          filters={filters}
          {...(activeFilter !== undefined ? { activeFilter } : {})}
          {...(onFilter ? { onFilter } : {})}
        />
      ) : null}

      {metrics.length === 0 ? (
        // Ohne Kennzahlen KEIN role="list": eine Liste ohne listitem-Kinder verletzt
        // aria-required-children — der Ladehinweis ist eine Statusmeldung, kein Listeneintrag.
        <div className="ps-dashboard__kpis">
          <p className="ps-dashboard__kpis-empty ps-muted" role="status">
            Kennzahlen werden geladen …
          </p>
        </div>
      ) : (
        <div
          className="ps-dashboard__kpis"
          role="list"
          aria-label="Kennzahlen der Übersicht"
        >
          {metrics.map((metric) => (
            <div
              className="ps-dashboard__kpi-slot"
              role="listitem"
              key={metric.id}
            >
              <MetricCard metric={metric} />
            </div>
          ))}
        </div>
      )}

      <AuditTrail trail={trail} />
    </section>
  );
}
