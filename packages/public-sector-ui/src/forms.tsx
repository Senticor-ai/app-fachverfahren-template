import { type ChangeEvent, type ReactNode } from "react";

// Bürger-Formular-Pattern (geführt, mobile-first, ein Fokus pro Schritt). Setzt den fachverfahren-ux-contract
// um: pfadentscheidende Frage zuerst, progressive disclosure, wenige Felder pro Schritt (3–5, ISO 9241-112),
// Inline-Validierung mit err/warn/ok (nur err blockiert), Once-Only-Übernahme (markiert + editierbar),
// Review mit Sprung zur ersten Lücke. Reine, geprüfte Komponenten — der Motor komponiert daraus Screens.

/** err blockiert das Absenden; warn ist sichtbar aber nicht blockierend; ok ist gültig. */
export type FieldState = "ok" | "warn" | "err";

export interface FormFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "date" | "email" | "tel";
  required?: boolean;
  /** Hilfetext (z.B. Format), immer sichtbar. */
  hint?: string;
  /** Validierungsmeldung (mit Korrekturpfad in Klartext). */
  message?: string;
  state?: FieldState;
  autoComplete?: string;
}

/** Ein echtes Formularfeld mit Label, Inline-Validierung (err/warn/ok) und ARIA-Verknüpfung. */
export function FormField({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  hint,
  message,
  state = "ok",
  autoComplete,
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const msgId = message ? `${id}-msg` : undefined;
  const describedBy = [hintId, msgId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`ps-field ps-field--${state}`}>
      <label htmlFor={id} className="ps-field__label">
        {label}
        {required ? (
          <span className="ps-field__required" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className="ps-field__hint">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        className="ps-field__input"
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        aria-invalid={state === "err" ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
      />
      {message ? (
        <p
          id={msgId}
          className={`ps-field__msg ps-field__msg--${state}`}
          role={state === "err" ? "alert" : undefined}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

export interface OnceOnlyFieldProps extends FormFieldProps {
  /** Quelle der übernommenen Angabe (z.B. "Melderegister") — Once-Only, bleibt editierbar. */
  source: string;
}

/** Ein Feld mit aus einem Register übernommener (Once-Only) Vorbefüllung — gekennzeichnet und editierbar. */
export function OnceOnlyField({ source, ...field }: OnceOnlyFieldProps) {
  return (
    <div className="ps-field-once">
      <span className="ps-field-once__badge">
        ✓ Übernommen aus {source} · editierbar
      </span>
      <FormField {...field} />
    </div>
  );
}

export interface FormStepProps {
  title: string;
  description?: string;
  /** Die Felder dieses Schritts (bewusst wenige: 3–5 pro Schritt). */
  children: ReactNode;
}

/** Ein Schritt (ein Bildschirm) des geführten Formulars — ein Fokus, wenige Felder. */
export function FormStep({ title, description, children }: FormStepProps) {
  return (
    <section className="ps-form-step" aria-labelledby="ps-form-step__title">
      <h2 id="ps-form-step__title" className="ps-form-step__title">
        {title}
      </h2>
      {description ? <p className="ps-muted">{description}</p> : null}
      <div className="ps-form-step__fields">{children}</div>
    </section>
  );
}

export interface StepDef {
  id: string;
  title: string;
  /** Render-Helfer (kein verschachtelter Komponententyp) — als Funktionsaufruf genutzt. */
  render: () => ReactNode;
  /** Schritt vollständig + gültig? Steuert das Review-Gate. */
  complete?: boolean;
}

export interface FormStepperProps {
  steps: StepDef[];
  /** Aktiver Schritt (kontrolliert). */
  current: number;
  onNavigate: (index: number) => void;
  onSubmit: () => void;
  /** Absenden erst bei voller Gültigkeit. */
  submitDisabled?: boolean;
}

/** Geführter Stepper: Fortschritt, freie Schrittnavigation, Absenden gated, Sprung zur ersten Lücke. */
export function FormStepper({
  steps,
  current,
  onNavigate,
  onSubmit,
  submitDisabled = false,
}: FormStepperProps) {
  const isLast = current === steps.length - 1;
  const firstIncomplete = steps.findIndex((step) => !step.complete);
  const gapStep = firstIncomplete >= 0 ? steps[firstIncomplete] : undefined;
  const active = steps[current];
  return (
    <div className="ps-form-stepper">
      <ol className="ps-form-stepper__progress" aria-label="Fortschritt">
        {steps.map((step, index) => (
          <li
            key={step.id}
            aria-current={index === current ? "step" : undefined}
            className={
              index === current ? "is-current" : step.complete ? "is-done" : ""
            }
          >
            <button
              type="button"
              className="ps-form-stepper__crumb"
              onClick={() => onNavigate(index)}
            >
              <span aria-hidden="true">{index + 1}.</span> {step.title}
            </button>
          </li>
        ))}
      </ol>

      <div className="ps-form-stepper__body">
        {active ? active.render() : null}
      </div>

      <div className="ps-form-stepper__nav">
        <button
          type="button"
          className="ps-btn ps-btn--ghost"
          disabled={current === 0}
          onClick={() => onNavigate(current - 1)}
        >
          Zurück
        </button>
        {isLast ? (
          <button
            type="button"
            className="ps-btn ps-btn--primary"
            disabled={submitDisabled}
            onClick={onSubmit}
          >
            Absenden
          </button>
        ) : (
          <button
            type="button"
            className="ps-btn ps-btn--primary"
            onClick={() => onNavigate(current + 1)}
          >
            Weiter
          </button>
        )}
      </div>

      {isLast && gapStep ? (
        <p className="ps-form-stepper__gap" role="alert">
          Bitte vervollständigen:{" "}
          <button
            type="button"
            className="ps-link"
            onClick={() => onNavigate(firstIncomplete)}
          >
            Schritt {firstIncomplete + 1} — {gapStep.title}
          </button>
        </p>
      ) : null}
    </div>
  );
}
