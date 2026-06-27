// fachverfahren-kit/ui/form-field — generischer, barrierefreier Feld-Wrapper (shadcn/ui-Stil, dep-frei).
//
// Das a11y-Fundament für JEDES Formularfeld: FormField stellt per Context eine stabile id bereit,
// aus der FormLabel/FormControl/FormDescription/FormMessage automatisch htmlFor/id, aria-describedby
// und aria-invalid ableiten. So sind Label↔Control, Beschreibung und Fehlermeldung IMMER korrekt
// verdrahtet — ohne dass die aufrufende Stelle ids von Hand vergeben muss.
//
// Konventionen: Label OBEN, kein Doppelpunkt. Fehler in destructive-Farbe + role="alert".
// Generisch — alle Inhalte kommen als children/props, keine Domänen-Literale.
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "../lib/utils.js";
import { Label } from "./label.js";

/** Per-Feld abgeleitete ids — eine Quelle der Wahrheit für die a11y-Verdrahtung. */
interface FormFieldContextValue {
  /** Basis-id des Feldes (aus useId), z. B. für htmlFor/id. */
  readonly id: string;
  /** id der Beschreibung (aria-describedby), erst gesetzt, wenn eine Description gerendert wird. */
  readonly formDescriptionId: string;
  /** id der Fehlermeldung — wird bei Fehler an aria-describedby des Controls angehängt. */
  readonly formMessageId: string;
  /** True, wenn das Feld einen Fehler trägt → aria-invalid + destructive-Optik. */
  readonly invalid: boolean;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

function useFormField(): FormFieldContextValue {
  const ctx = React.useContext(FormFieldContext);
  if (ctx === null) {
    throw new Error("useFormField muss innerhalb von <FormField> verwendet werden.");
  }
  return ctx;
}

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Markiert das Feld als fehlerhaft → aria-invalid am Control + FormMessage in destructive. */
  invalid?: boolean;
  /** Optionale, von außen vorgegebene Basis-id (sonst stabil via useId generiert). */
  id?: string;
}

/**
 * Feld-Wrapper. Spannt den Context auf und liefert den vertikalen Feld-Stack (Label oben).
 * Standard-Abstand zwischen Label/Control/Hilfe via gap-2; Felder zueinander mit mb-4 in der App.
 */
const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ className, invalid = false, id, ...props }, ref) => {
    const generatedId = React.useId();
    const baseId = id ?? generatedId;
    const value = React.useMemo<FormFieldContextValue>(
      () => ({
        id: baseId,
        formDescriptionId: `${baseId}-description`,
        formMessageId: `${baseId}-message`,
        invalid,
      }),
      [baseId, invalid],
    );
    return (
      <FormFieldContext.Provider value={value}>
        <div ref={ref} className={cn("flex flex-col gap-2", className)} {...props} />
      </FormFieldContext.Provider>
    );
  },
);
FormField.displayName = "FormField";

export interface FormLabelProps
  extends React.ComponentPropsWithoutRef<typeof Label> {
  /** Hängt ein „* "-Pflichtkennzeichen an (zusätzlich zu aria-required am Control). */
  required?: boolean;
}

/**
 * Label OBEN, kein Doppelpunkt. Verdrahtet htmlFor automatisch auf die Feld-id und färbt
 * sich bei Fehler in destructive. Das Pflicht-Sternchen ist aria-hidden (Bedeutung trägt aria-required).
 */
const FormLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  FormLabelProps
>(({ className, children, required = false, ...props }, ref) => {
  const { id, invalid } = useFormField();
  return (
    <Label
      ref={ref}
      htmlFor={id}
      className={cn("text-foreground", invalid && "text-destructive", className)}
      {...props}
    >
      {children}
      {required ? (
        <span aria-hidden="true" className="ml-1 text-destructive">
          *
        </span>
      ) : null}
    </Label>
  );
});
FormLabel.displayName = "FormLabel";

/**
 * Control-Slot. Reicht id, aria-describedby (Description + ggf. Message) und aria-invalid an das
 * EINE Kind-Element durch (asChild/Slot-Muster) — funktioniert mit Input/Textarea/SelectTrigger usw.
 */
const FormControl = React.forwardRef<
  React.ElementRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { id, formDescriptionId, formMessageId, invalid } = useFormField();
  return (
    <Slot
      ref={ref}
      id={id}
      aria-describedby={invalid ? `${formDescriptionId} ${formMessageId}` : formDescriptionId}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
});
FormControl.displayName = "FormControl";

/** Erläuternder Hilfetext unter dem Control (Caption-Typo), per id mit dem Control verknüpft. */
const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField();
  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  );
});
FormDescription.displayName = "FormDescription";

/**
 * Fehlermeldung in destructive-Farbe, role="alert" für sofortige SR-Ansage. Rendert nur, wenn es
 * Inhalt gibt (children oder ctx.invalid) — sonst null, damit kein leeres Alert im DOM steht.
 * Farbe ist NIE die einzige Bedeutung: das Wording im Text trägt die Information.
 */
const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  const { formMessageId, invalid } = useFormField();
  const body = children;
  if (!body && !invalid) {
    return null;
  }
  return (
    <p
      ref={ref}
      id={formMessageId}
      role="alert"
      className={cn("text-xs font-medium text-destructive", className)}
      {...props}
    >
      {body}
    </p>
  );
});
FormMessage.displayName = "FormMessage";

export {
  FormField,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
};
