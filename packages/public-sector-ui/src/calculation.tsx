import { useId } from "react";

export type CalculationResultStatus = "final" | "provisional" | "blocked";

export type CalculationStepStatus =
  "applied" | "skipped" | "assumption" | "blocked";

export interface CalculationInput {
  id: string;
  label: string;
  value: string;
  source?: string;
  onceOnly?: boolean;
}

export interface CalculationStep {
  id: string;
  label: string;
  status: CalculationStepStatus;
  value: string;
  formula?: string;
  note?: string;
  references?: string[];
}

export interface CalculationAssumption {
  id: string;
  label: string;
  value: string;
  validationHint: string;
}

export interface CalculationTraceProps {
  title?: string;
  description?: string;
  resultLabel: string;
  resultValue: string;
  resultStatus?: CalculationResultStatus;
  inputs?: CalculationInput[];
  steps: CalculationStep[];
  assumptions?: CalculationAssumption[];
  sources?: string[];
  emptyLabel?: string;
}

const resultMeta: Record<
  CalculationResultStatus,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  final: { label: "Final", marker: "OK", tone: "success" },
  provisional: { label: "Vorläufig", marker: "!", tone: "warning" },
  blocked: { label: "Nicht berechenbar", marker: "x", tone: "critical" },
};

const stepMeta: Record<
  CalculationStepStatus,
  {
    label: string;
    marker: string;
    tone: "neutral" | "success" | "warning" | "critical";
  }
> = {
  applied: { label: "Angewendet", marker: "OK", tone: "success" },
  skipped: { label: "Nicht angewendet", marker: "i", tone: "neutral" },
  assumption: { label: "Annahme", marker: "?", tone: "warning" },
  blocked: { label: "Blockiert", marker: "!", tone: "critical" },
};

export function CalculationTrace({
  title = "Berechnung nachvollziehen",
  description = "Prüfen Sie Eingabewerte, Rechenschritte, Annahmen und Quellen der Berechnung.",
  resultLabel,
  resultValue,
  resultStatus = "provisional",
  inputs = [],
  steps,
  assumptions = [],
  sources = [],
  emptyLabel = "Keine Rechenschritte dokumentiert.",
}: CalculationTraceProps) {
  const titleId = useId();
  const descriptionId = useId();
  const status = resultMeta[resultStatus];

  return (
    <section
      className={`ps-calculation-trace ps-calculation-trace--${resultStatus}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className="ps-calculation-trace__header">
        <div className="ps-calculation-trace__heading">
          <p className="ps-eyebrow">Berechnung</p>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId} className="ps-muted">
            {description}
          </p>
        </div>
        <StatusBadge
          label={status.label}
          marker={status.marker}
          tone={status.tone}
        />
      </header>

      <div className="ps-calculation-trace__result">
        <span>Ergebnis</span>
        <strong className="ps-num">{resultValue}</strong>
        <p>{resultLabel}</p>
      </div>

      {inputs.length > 0 ? (
        <section className="ps-calculation-trace__panel">
          <h3>Eingabewerte</h3>
          <dl className="ps-calculation-trace__inputs">
            {inputs.map((input) => (
              <div key={input.id} className="ps-calculation-trace__input">
                <dt>{input.label}</dt>
                <dd>
                  <span className="ps-num">{input.value}</span>
                  {input.source ? <small>{input.source}</small> : null}
                  {input.onceOnly ? (
                    <span className="ps-badge ps-badge--success">
                      <span className="ps-badge__icon" aria-hidden="true">
                        OK
                      </span>
                      <span>Übernommen</span>
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="ps-calculation-trace__panel">
        <h3>Rechenschritte</h3>
        {steps.length === 0 ? (
          <p className="ps-calculation-trace__empty" role="status">
            {emptyLabel}
          </p>
        ) : (
          <ol className="ps-calculation-trace__steps">
            {steps.map((step) => (
              <CalculationStepItem key={step.id} step={step} />
            ))}
          </ol>
        )}
      </section>

      {assumptions.length > 0 ? (
        <section className="ps-calculation-trace__panel ps-calculation-trace__panel--assumptions">
          <h3>Annahmen zu validieren</h3>
          <ul className="ps-calculation-trace__assumptions">
            {assumptions.map((assumption) => (
              <li
                key={assumption.id}
                className="ps-calculation-trace__assumption"
              >
                <div>
                  <strong>{assumption.label}</strong>
                  <span className="ps-num">{assumption.value}</span>
                </div>
                <p>{assumption.validationHint}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sources.length > 0 ? (
        <section className="ps-calculation-trace__sources">
          <h3>Quellen</h3>
          <ul>
            {sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

function CalculationStepItem({ step }: { step: CalculationStep }) {
  const meta = stepMeta[step.status];
  return (
    <li
      className={`ps-calculation-trace__step ps-calculation-trace__step--${step.status}`}
    >
      <article>
        <header className="ps-calculation-trace__step-header">
          <div>
            <h4>{step.label}</h4>
            <strong className="ps-num">{step.value}</strong>
          </div>
          <StatusBadge
            label={meta.label}
            marker={meta.marker}
            tone={meta.tone}
          />
        </header>

        {step.note ? <p>{step.note}</p> : null}

        {step.formula || step.references?.length ? (
          <details className="ps-calculation-trace__details">
            <summary>Herleitung anzeigen</summary>
            {step.formula ? (
              <p className="ps-calculation-trace__formula ps-num">
                {step.formula}
              </p>
            ) : null}
            {step.references?.length ? (
              <ul>
                {step.references.map((reference) => (
                  <li key={reference}>{reference}</li>
                ))}
              </ul>
            ) : null}
          </details>
        ) : null}
      </article>
    </li>
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
