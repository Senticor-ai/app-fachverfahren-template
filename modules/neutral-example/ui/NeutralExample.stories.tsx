import type { Meta, StoryObj } from "@storybook/react";
import {
  useId,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import intakeSchemaJson from "../forms/intake.form.schema.json" with { type: "json" };

const meta = {
  title: "Domain Modules/Neutral Example",
  parameters: {
    docs: {
      description: {
        component:
          "Neutrales Beispiel für ein Fachverfahren-Modul ohne fachliche Spezialisierung.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

interface JsonStringProperty {
  type: "string";
  title?: string;
  description?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

interface JsonBooleanProperty {
  type: "boolean";
  title?: string;
  default?: boolean;
}

interface JsonFormSchema {
  required?: string[];
  properties: Record<string, JsonStringProperty | JsonBooleanProperty>;
}

interface NeutralIntakeValues {
  applicantName: string;
  requestSummary: string;
  contactPostalCode: string;
}

interface SchemaFieldDefinition {
  name: keyof NeutralIntakeValues;
  autoComplete: string;
  inputMode?: "numeric" | "text";
}

const intakeSchema = intakeSchemaJson as JsonFormSchema;

const intakeFields = [
  {
    name: "applicantName",
    autoComplete: "name",
  },
  {
    name: "contactPostalCode",
    autoComplete: "postal-code",
    inputMode: "numeric",
  },
  {
    name: "requestSummary",
    autoComplete: "off",
  },
] as const satisfies SchemaFieldDefinition[];

const cases = [
  {
    id: "NEU-2026-001",
    applicant: "Beispielperson",
    status: "bereit",
    dueAt: "2026-07-15",
  },
  {
    id: "NEU-2026-002",
    applicant: "Beispielorganisation",
    status: "Review",
    dueAt: "2026-07-20",
  },
];

const defaultIntakeValues: NeutralIntakeValues = {
  applicantName: "Beispielperson",
  requestSummary: "Allgemeines Anliegen",
  contactPostalCode: "10115",
};

const invalidPostalCodeValues: NeutralIntakeValues = {
  ...defaultIntakeValues,
  contactPostalCode: "1234",
};

function getStringProperty(fieldName: keyof NeutralIntakeValues) {
  const property = intakeSchema.properties[fieldName];
  if (!property || property.type !== "string") {
    throw new Error(`missing string schema property "${fieldName}"`);
  }
  return property;
}

function isRequired(fieldName: keyof NeutralIntakeValues) {
  return intakeSchema.required?.includes(fieldName) ?? false;
}

function validateIntake(values: NeutralIntakeValues) {
  const errors: Partial<Record<keyof NeutralIntakeValues, string>> = {};

  for (const field of intakeFields) {
    const property = getStringProperty(field.name);
    const value = values[field.name];
    const trimmedValue = value.trim();

    if (isRequired(field.name) && trimmedValue.length === 0) {
      errors[field.name] = "Bitte füllen Sie dieses Pflichtfeld aus.";
      continue;
    }

    if (
      property.minLength !== undefined &&
      trimmedValue.length > 0 &&
      trimmedValue.length < property.minLength
    ) {
      errors[field.name] =
        property.minLength === 1
          ? "Bitte geben Sie einen Wert ein."
          : `Bitte geben Sie mindestens ${property.minLength} Zeichen ein.`;
      continue;
    }

    if (
      property.pattern &&
      trimmedValue.length > 0 &&
      !new RegExp(property.pattern).test(trimmedValue)
    ) {
      errors[field.name] =
        field.name === "contactPostalCode"
          ? "Geben Sie eine fünfstellige Postleitzahl ein."
          : "Prüfen Sie das erwartete Format.";
    }
  }

  return errors;
}

interface SchemaTextFieldProps {
  field: SchemaFieldDefinition;
  property: JsonStringProperty;
  required: boolean;
  value: string;
  error: string | undefined;
  onChange: (name: keyof NeutralIntakeValues, value: string) => void;
}

function SchemaTextField({
  field,
  property,
  required,
  value,
  error,
  onChange,
}: SchemaTextFieldProps) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const describedBy =
    [error ? errorId : undefined, property.description ? hintId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(field.name, event.target.value);
  }

  return (
    <label className="sb-schema-field" htmlFor={fieldId}>
      <span>
        {property.title ?? field.name}
        {required ? <strong aria-label="Pflichtfeld"> *</strong> : null}
      </span>
      <input
        aria-describedby={describedBy}
        aria-invalid={error ? "true" : undefined}
        autoComplete={field.autoComplete}
        id={fieldId}
        inputMode={field.inputMode}
        maxLength={property.maxLength}
        minLength={property.minLength}
        onChange={handleChange}
        pattern={property.pattern}
        required={required}
        value={value}
      />
      {error ? (
        <span className="sb-field-error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
      {property.description ? (
        <span className="sb-field-hint" id={hintId}>
          {property.description}
        </span>
      ) : null}
    </label>
  );
}

interface NeutralIntakeWizardProps {
  initialValues?: NeutralIntakeValues;
}

function NeutralIntakeWizard({
  initialValues = defaultIntakeValues,
}: NeutralIntakeWizardProps) {
  const [values, setValues] = useState<NeutralIntakeValues>(initialValues);
  const [submitted, setSubmitted] = useState(false);
  const errors = useMemo(() => validateIntake(values), [values]);
  const hasErrors = Object.keys(errors).length > 0;

  function updateValue(name: keyof NeutralIntakeValues, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    setSubmitted(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  function renderStep() {
    return (
      <>
        <ol className="sb-stepper">
          <li className="sb-step sb-step--ok">Anliegen</li>
          <li className={hasErrors ? "sb-step sb-step--warning" : "sb-step"}>
            Angaben prüfen
          </li>
          <li className="sb-step">Absenden</li>
        </ol>
        {intakeFields.map((field) => (
          <SchemaTextField
            error={errors[field.name]}
            field={field}
            key={field.name}
            onChange={updateValue}
            property={getStringProperty(field.name)}
            required={isRequired(field.name)}
            value={values[field.name]}
          />
        ))}
      </>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      {renderStep()}
      <p
        className={
          hasErrors ? "sb-validation-note sb-validation-note--error" : ""
        }
      >
        {hasErrors
          ? "Korrigieren Sie die markierten Angaben. Fehler blockieren das Absenden."
          : "Alle Pflichtangaben erfüllen die Regeln aus dem Formularschema."}
      </p>
      <div className="sb-form-actions">
        <button disabled={hasErrors} type="submit">
          Vorgang absenden
        </button>
      </div>
      {submitted && !hasErrors ? (
        <p className="sb-validation-success" role="status">
          Der Entwurf ist bereit für die serverseitige Prüfung.
        </p>
      ) : null}
    </form>
  );
}

export const CitizenReady: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-density-citizen">
        <p className="eyebrow">Bürgerportal</p>
        <h1>Neutrales Beispielverfahren</h1>
        <p>
          Geführter Einstieg für ein generisches Verfahren. Konkrete Fachinhalte
          werden im echten Domain-Modul ersetzt.
        </p>
        <NeutralIntakeWizard />
      </section>
    </main>
  ),
};

export const ClientValidationState: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-density-citizen">
        <p className="eyebrow">Bürgerportal</p>
        <h1>Clientseitige Formularprüfung</h1>
        <p>
          Die Eingaberegeln stammen aus `forms/intake.form.schema.json`. Die
          vierstellige Postleitzahl wird vor dem Absenden mit Recovery-Hinweis
          markiert.
        </p>
        <NeutralIntakeWizard initialValues={invalidPostalCodeValues} />
      </section>
    </main>
  ),
};

export const CaseworkerReady: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-density-caseworker">
        <p className="eyebrow">Sachbearbeitung</p>
        <h1>Beispielvorgänge</h1>
        <div className="sb-table-frame">
          <table className="sb-table">
            <thead>
              <tr>
                <th>Vorgang</th>
                <th>Antragstellende Stelle</th>
                <th>Status</th>
                <th>Frist</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((caseItem) => (
                <tr key={caseItem.id}>
                  <td>{caseItem.id}</td>
                  <td>{caseItem.applicant}</td>
                  <td>{caseItem.status}</td>
                  <td className="tabular-nums">{caseItem.dueAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  ),
};

export const LoadingState: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card" aria-busy="true" aria-live="polite">
        <h1>Beispielvorgänge werden geladen</h1>
        <p>Daten, Rolle und Zuständigkeit werden geprüft.</p>
      </section>
    </main>
  ),
};

export const EmptyState: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-density-citizen">
        <p className="eyebrow">Bürgerportal</p>
        <h1>Noch kein Vorgang vorhanden</h1>
        <p>Starten Sie einen Entwurf, um den ersten Vorgang anzulegen.</p>
        <button type="button">Entwurf starten</button>
      </section>
    </main>
  ),
};

export const ErrorState: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card">
        <h1>Beispielvorgänge nicht erreichbar</h1>
        <p role="alert">
          Die Daten konnten nicht geladen werden. Prüfen Sie die Verbindung oder
          versuchen Sie es erneut.
        </p>
        <button type="button">Erneut laden</button>
      </section>
    </main>
  ),
};

export const SuccessState: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-density-citizen">
        <p className="eyebrow">Bürgerportal</p>
        <h1>Vorgang angelegt</h1>
        <p>Ihre Referenznummer ist NEU-2026-001.</p>
        <button type="button">Zur Übersicht</button>
      </section>
    </main>
  ),
};
