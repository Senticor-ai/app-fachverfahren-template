// fachverfahren-kit/components/SummaryList — Zusammenfassungs-/Prüf-Muster (Angaben prüfen).
//
// Zweck: Vor dem Absenden zeigt der Bürger-Antrag je Angabe Label + Wert + einen „Ändern"-Link zurück zum
// jeweiligen Schritt; dasselbe Muster trägt Bescheid-Positions-/Tenor-Aufstellungen (Label + Betrag, ohne
// Ändern-Aktion). Ersetzt die handgebauten inline-`dl` im Antrags-Review und in der Bescheid-Ansicht
// durch EINE Quelle der Wahrheit.
//
// GENERISCH & VENDOR-/DOMÄNEN-NEUTRAL: kein Domänen-Literal, alle Zeilen kommen als props. Dep-frei
// (nur React + Tailwind + lucide-react). Token-only (Spec `check:css-tokens`): Elevation über `shadow-sm`
// (Spec 3.1), Typo über die verbindliche Skala (Spec 2), Card-Ebene `rounded-lg border-border bg-card`
// (Spec 4.2). Barrierefrei (BITV 2.0 / WCAG 2.2 AA):
//   • Semantisches `<dl>` mit `<dt>`/`<dd>` — Zuordnung Label↔Wert ist strukturell, nicht nur visuell.
//   • Der „Ändern"-Link/-Button trägt den Label-Kontext als `sr-only`-Suffix, damit Screenreader-Nutzer
//     wissen, WAS geändert wird (Kernanforderung des Prüf-Musters — sonst lauter identische „Ändern"-Links).
//   • Kanonisches 3px-Fokus-Rezept (Spec 3.2) über die `fv-focus`-Utility, Tastaturbedienung nativ.
//   • Optionaler Titel als `<h2>` (Spec-Typo), per `aria-labelledby` mit der Liste verdrahtet.
//   • `prefers-reduced-motion` respektiert (`motion-reduce:transition-none`).
import * as React from "react";
import { cn } from "../lib/utils.js";

/** Eine Zeile der Zusammenfassung: Label, Wert und optionale „Ändern"-Aktion zurück zum Schritt. */
export interface SummaryListRow {
  /** Stabiler Schlüssel für React (z.B. Feld-/Positions-Id). */
  key: string;
  /** Beschriftung der Angabe (linke Spalte, `<dt>`). */
  label: React.ReactNode;
  /** Anzeigewert der Angabe (mittlere Spalte, `<dd>`). */
  value: React.ReactNode;
  /**
   * Ziel für die „Ändern"-Aktion als Link (z.B. `#schritt-2` oder eine Route). Wird `changeHref`
   * gesetzt, rendert ein `<a>`. Für rein präsentierende Aufstellungen (Bescheid) weglassen.
   */
  changeHref?: string;
  /**
   * Klick-Handler für die „Ändern"-Aktion als Button (z.B. `goToStep(2)` im Stepper). Ohne `changeHref`
   * rendert ein `<button type="button">`. Wird zusammen mit `changeHref` gesetzt, ergänzt er den Link.
   */
  onChange?: () => void;
  /**
   * Sichtbarer Text der „Ändern"-Aktion. Default: „Ändern". Der Label-Kontext wird zusätzlich als
   * `sr-only`-Suffix angehängt, sodass die Aktion für Screenreader eindeutig bleibt.
   */
  changeLabel?: string;
}

export interface SummaryListProps {
  /** Die Zeilen. Ist die Liste leer, rendert die Komponente nichts. */
  rows: SummaryListRow[];
  /** Optionale Überschrift über der Liste (`<h2>` nach der Typo-Skala). */
  title?: React.ReactNode;
  className?: string;
}

/** Barrierefreier Text der Ändern-Aktion: sichtbarer Text + `sr-only`-Kontext (nur wenn Label ein String ist). */
function ChangeContent({
  changeLabel,
  label,
}: {
  changeLabel: string;
  label: React.ReactNode;
}): React.ReactElement {
  return (
    <>
      <span aria-hidden={typeof label === "string" ? true : undefined}>
        {changeLabel}
      </span>
      {typeof label === "string" && <span className="sr-only"> {label}</span>}
    </>
  );
}

/** Gemeinsames Klassen-Rezept für Link/Button der Ändern-Aktion — EINE Wahrheit, kanonischer Fokus. */
const CHANGE_ACTION_CLASSES = cn(
  "rounded-sm text-sm font-medium text-primary underline decoration-1 underline-offset-2 fv-focus",
  "transition-colors ease-out hover:text-primary/80 motion-reduce:transition-none",
);

/**
 * Zusammenfassungs-/Prüf-Muster (Angaben prüfen). Rein präsentierend.
 *
 *   <SummaryList
 *     title="Ihre Angaben"
 *     rows={[
 *       { key: "name", label: "Name", value: antrag.name, onChange: () => goToStep(0) },
 *       { key: "datum", label: "Datum", value: formatiertesDatum, changeHref: "#schritt-1" },
 *     ]}
 *   />
 */
export function SummaryList({
  rows,
  title,
  className,
}: SummaryListProps): React.ReactElement | null {
  const titleId = React.useId();
  if (rows.length === 0) return null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm",
        className,
      )}
    >
      {title != null && (
        <h2
          id={titleId}
          className="border-b border-border px-6 py-4 text-lg font-semibold text-foreground"
        >
          {title}
        </h2>
      )}
      <dl
        aria-labelledby={title != null ? titleId : undefined}
        className="divide-y divide-border"
      >
        {rows.map((row) => {
          const changeLabel = row.changeLabel ?? "Ändern";
          const hasAction = row.changeHref != null || row.onChange != null;
          return (
            <div
              key={row.key}
              className="grid grid-cols-1 gap-x-6 gap-y-1 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] sm:items-baseline"
            >
              <dt className="text-sm font-medium text-foreground">
                {row.label}
              </dt>
              <dd className="min-w-0 break-words text-sm text-muted-foreground">
                {row.value}
              </dd>
              <dd className="text-sm sm:justify-self-end sm:text-right">
                {hasAction &&
                  (row.changeHref != null ? (
                    <a
                      href={row.changeHref}
                      onClick={row.onChange}
                      className={CHANGE_ACTION_CLASSES}
                    >
                      <ChangeContent
                        changeLabel={changeLabel}
                        label={row.label}
                      />
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={row.onChange}
                      className={CHANGE_ACTION_CLASSES}
                    >
                      <ChangeContent
                        changeLabel={changeLabel}
                        label={row.label}
                      />
                    </button>
                  ))}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
