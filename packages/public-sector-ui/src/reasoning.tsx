// Begründungs-/Transparenz-Cluster für Fachverfahren. Macht die rechtliche Herleitung und KI-Assistenz
// nachvollziehbar: die SubsumtionPanel zeigt die juristische Subsumtion in vier sichtbaren Schritten
// (Obersatz → Tatbestandsmerkmale → Subsumtion → Ergebnis), die KiVorschlag-Komponente setzt den
// HCAI-/EU-AI-Act-Transparenzgedanken um (klar gekennzeichneter Vorschlag, Konfidenz, Modell, "Warum?",
// Mensch entscheidet). Reine, geprüfte Komponenten — der Motor komponiert daraus Begründungs-Screens.
// Status wird nie allein über Farbe transportiert: immer zusätzlich Text + Icon (BITV/WCAG 1.4.1).

/** Erfüllungsstatus eines Tatbestandsmerkmals (steuert Farbe, Icon und Text). */
export type SubsumtionStatus = "erfuellt" | "nicht-erfuellt" | "unklar";

/** Ein Tatbestandsmerkmal mit seinem Subsumtionsergebnis und optionaler Begründung. */
export interface SubsumtionCriterion {
  label: string;
  met: SubsumtionStatus;
  /** Kurze Begründung, warum das Merkmal (nicht) vorliegt. */
  note?: string;
}

export interface SubsumtionPanelProps {
  /** Obersatz: die zu prüfende Rechtsfolge/Frage in einem Satz. */
  obersatz: string;
  /** Die einschlägige Norm als §-Zitat (z.B. "§ 1 Abs. 1 Mustergesetz"). */
  norm: string;
  /** Die Tatbestandsmerkmale mit ihrem jeweiligen Subsumtionsergebnis. */
  criteria: SubsumtionCriterion[];
  /** Das Ergebnis der Subsumtion in einem Satz. */
  ergebnis: string;
  /** Ton des Ergebnisses (steuert Farbe + Icon + Text, nie Farbe allein). */
  ergebnisTone: SubsumtionStatus;
  /** Herangezogene Quellen (Normen, Verwaltungsvorschriften, Urteile). */
  sources?: string[];
}

/** Label, Icon und ARIA-Text je Subsumtionsstatus — Farbe wird nie allein genutzt. */
const subsumtionStatus: Record<
  SubsumtionStatus,
  { label: string; icon: string; aria: string }
> = {
  erfuellt: { label: "Erfüllt", icon: "✓", aria: "Merkmal erfüllt" },
  "nicht-erfuellt": {
    label: "Nicht erfüllt",
    icon: "✗",
    aria: "Merkmal nicht erfüllt",
  },
  unklar: { label: "Unklar", icon: "?", aria: "Merkmal unklar" },
};

/** Eine einzelne Statusmarkierung (Farbe + Icon + Text) für ein Merkmal oder das Ergebnis. */
function SubsumtionStatusBadge({ status }: { status: SubsumtionStatus }) {
  const meta = subsumtionStatus[status];
  return (
    <span
      className={`ps-subsumtion__status ps-subsumtion__status--${status}`}
      aria-label={meta.aria}
    >
      <span className="ps-badge__icon" aria-hidden="true">
        {meta.icon}
      </span>
      <span>{meta.label}</span>
    </span>
  );
}

/**
 * Macht die rechtliche Subsumtion sichtbar (Pattern recht:subsumtion). Zeigt die vier klassischen
 * Schritte des Gutachtenstils klar nummeriert: (1) Obersatz mit §-Zitat, (2) Tatbestandsmerkmale,
 * (3) Subsumtion je Merkmal mit Status (Farbe + Icon + Text, nie Farbe allein) und (4) Ergebnis.
 * Schließt mit den herangezogenen Quellen und einem Hinweis, dass dies keine Rechtsberatung ist.
 */
export function SubsumtionPanel({
  obersatz,
  norm,
  criteria,
  ergebnis,
  ergebnisTone,
  sources,
}: SubsumtionPanelProps) {
  return (
    <section className="ps-subsumtion" aria-labelledby="ps-subsumtion__title">
      <h2 id="ps-subsumtion__title" className="ps-subsumtion__title">
        Rechtliche Subsumtion
      </h2>

      <ol className="ps-subsumtion__steps">
        <li className="ps-subsumtion__step">
          <p className="ps-eyebrow">1. Obersatz</p>
          <p className="ps-subsumtion__obersatz">{obersatz}</p>
          <p className="ps-subsumtion__norm">
            <span className="ps-muted">Maßgebliche Norm: </span>
            <cite>{norm}</cite>
          </p>
        </li>

        <li className="ps-subsumtion__step">
          <p className="ps-eyebrow">2. Tatbestandsmerkmale</p>
          <ul className="ps-subsumtion__criteria">
            {criteria.map((criterion) => (
              <li key={criterion.label}>{criterion.label}</li>
            ))}
          </ul>
        </li>

        <li className="ps-subsumtion__step">
          <p className="ps-eyebrow">3. Subsumtion</p>
          <ul className="ps-subsumtion__check">
            {criteria.map((criterion) => (
              <li
                key={criterion.label}
                className={`ps-subsumtion__item ps-subsumtion__item--${criterion.met}`}
              >
                <div className="ps-subsumtion__item-head">
                  <span className="ps-subsumtion__item-label">
                    {criterion.label}
                  </span>
                  <SubsumtionStatusBadge status={criterion.met} />
                </div>
                {criterion.note ? (
                  <p className="ps-subsumtion__note">{criterion.note}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </li>

        <li className="ps-subsumtion__step">
          <p className="ps-eyebrow">4. Ergebnis</p>
          <div
            className={`ps-subsumtion__ergebnis ps-subsumtion__ergebnis--${ergebnisTone}`}
          >
            <SubsumtionStatusBadge status={ergebnisTone} />
            <p className="ps-subsumtion__ergebnis-text">{ergebnis}</p>
          </div>
        </li>
      </ol>

      {sources && sources.length > 0 ? (
        <div className="ps-subsumtion__sources">
          <p className="ps-eyebrow">Herangezogene Quellen</p>
          <ul className="ps-subsumtion__source-list">
            {sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="ps-subsumtion__disclaimer ps-muted" role="note">
        Hinweis: automatisch erstellte Herleitung zur Nachvollziehbarkeit. Keine
        Rechtsberatung.
      </p>
    </section>
  );
}

export interface KiVorschlagProps {
  /** Worauf sich der Vorschlag bezieht (z.B. "Empfohlene Gebührenstufe"). */
  label: string;
  /** Der vorgeschlagene Wert. */
  value: string;
  /** Konfidenz als Anteil zwischen 0 und 1 (wird als Prozent dargestellt). */
  confidence: number;
  /** Kennung des erzeugenden Modells (Transparenz, EU-AI-Act). */
  modelId: string;
  /** Begründung des Vorschlags in Klartext. */
  rationale: string;
  /** Belege/Quellen, auf die sich der Vorschlag stützt. */
  sources: string[];
  /** Vorschlag übernehmen (Mensch bestätigt). */
  onAccept: () => void;
  /** Vorschlag ablehnen. */
  onReject: () => void;
  /** Vorschlag manuell überschreiben. */
  onOverride: () => void;
}

/** Begrenzt die Konfidenz auf 0–100 % und rundet auf ganze Prozent (deterministisch). */
function toPercent(confidence: number): number {
  const clamped = Math.min(1, Math.max(0, confidence));
  return Math.round(clamped * 100);
}

/**
 * Klar gekennzeichneter KI-Vorschlag (Pattern uxgov:ai-ux-transparency) im Sinne von HCAI und
 * EU-AI-Act: deutlich als KI markiert, mit Wert, Konfidenz (in Prozent), Modell-Kennung und einer
 * "Warum?"-Aufklappung (progressive disclosure) für Begründung und Quellen. Drei Aktionen lassen den
 * Menschen entscheiden: Übernehmen, Ablehnen, Überschreiben. Der Vorschlag ist assistierend — die
 * Entscheidung trifft die sachbearbeitende Person.
 */
export function KiVorschlag({
  label,
  value,
  confidence,
  modelId,
  rationale,
  sources,
  onAccept,
  onReject,
  onOverride,
}: KiVorschlagProps) {
  const percent = toPercent(confidence);
  return (
    <section
      className="ps-ki-vorschlag"
      aria-labelledby="ps-ki-vorschlag__title"
    >
      <header className="ps-ki-vorschlag__header">
        <span className="ps-ki-vorschlag__badge">
          <span className="ps-badge__icon" aria-hidden="true">
            ✨
          </span>
          <span>KI-Vorschlag</span>
        </span>
        <span className="ps-ki-vorschlag__model">
          Modell: <code>{modelId}</code>
        </span>
      </header>

      <h2 id="ps-ki-vorschlag__title" className="ps-ki-vorschlag__label">
        {label}
      </h2>
      <p className="ps-ki-vorschlag__value">{value}</p>

      <p
        className="ps-ki-vorschlag__confidence"
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Konfidenz des Vorschlags"
      >
        <span className="ps-muted">Konfidenz: </span>
        <strong>{percent}&nbsp;%</strong>
      </p>

      <details className="ps-ki-vorschlag__why">
        <summary>Warum dieser Vorschlag?</summary>
        <p className="ps-ki-vorschlag__rationale">{rationale}</p>
        {sources.length > 0 ? (
          <div className="ps-ki-vorschlag__sources">
            <p className="ps-eyebrow">Quellen</p>
            <ul className="ps-ki-vorschlag__source-list">
              {sources.map((source) => (
                <li key={source}>{source}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </details>

      <p className="ps-ki-vorschlag__hint ps-muted" role="note">
        Assistierender Vorschlag — die Entscheidung treffen Sie. Bitte vor
        Übernahme prüfen.
      </p>

      <div className="ps-ki-vorschlag__actions">
        <button
          type="button"
          className="ps-btn ps-btn--primary"
          onClick={onAccept}
        >
          Übernehmen
        </button>
        <button
          type="button"
          className="ps-btn ps-btn--ghost"
          onClick={onReject}
        >
          Ablehnen
        </button>
        <button
          type="button"
          className="ps-btn ps-btn--ghost"
          onClick={onOverride}
        >
          Überschreiben
        </button>
      </div>
    </section>
  );
}
