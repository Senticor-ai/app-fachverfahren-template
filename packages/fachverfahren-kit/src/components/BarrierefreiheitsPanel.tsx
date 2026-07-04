// fachverfahren-kit/components/BarrierefreiheitsPanel — das interaktive EINSTELL-Panel für die a11y-Präferenzen.
//
// NICHT die Barrierefreiheits-ERKLÄRUNG (das ist `Barrierefreiheitserklaerung`), sondern der Bedien-Schalter: ein
// <fieldset> mit je einem Switch für Größere Schrift / Hoher Kontrast / Bewegung reduzieren / Kompakte Darstellung,
// Statuszusammenfassung und Reset-Aktion. Der Zustand liegt in `useA11ySettings` (schaltet die Klassen an <html> +
// persistiert). GENERISCH, dep-frei (React + Bestands-Primitive Switch + ps-Token-Klassen).
//
// Barrierefreiheit (WCAG 2.2 AA / BITV 2.0 / EN 301 549):
//  - gruppiert als <fieldset>/<legend> (semantische Gruppe mit Namen),
//  - jeder Switch trägt seinen Namen über aria-labelledby und seine Erläuterung über aria-describedby,
//  - Signal nie nur über Farbe: Beschriftung + Zustand werden textlich getragen (Switch = role="switch"),
//  - jede Umschaltung wird über die zentrale StatusRegion angesagt (aria-live),
//  - Zielgröße (SC 2.5.8): großzügige Zeilen und ein separater Switch; Status wird zusätzlich textlich angezeigt.
import { useId } from "react";

import { cn } from "../lib/utils.js";
import { Switch } from "../ui/switch.js";
import { useA11ySettings, type A11yOption } from "../hooks/useA11ySettings.js";
import { useStatusRegion } from "./StatusRegion.js";

/** Beschriftung + Erläuterung je Präferenz — generische Verwaltungssprache, kein Domänen-Literal. */
const OPTIONEN: {
  key: A11yOption;
  label: string;
  beschreibung: string;
  wirkung: string;
}[] = [
  {
    key: "largeText",
    label: "Größere Schrift",
    beschreibung: "Vergrößert die Textgröße für bessere Lesbarkeit.",
    wirkung: "Text wird um eine Stufe angehoben.",
  },
  {
    key: "highContrast",
    label: "Hoher Kontrast",
    beschreibung: "Verstärkt Farb- und Randkontraste.",
    wirkung: "Flächen, Ränder und Fokus werden stärker getrennt.",
  },
  {
    key: "reduceMotion",
    label: "Bewegung reduzieren",
    beschreibung: "Deaktiviert Animationen und Übergänge.",
    wirkung: "Übergänge werden auf ein Minimum reduziert.",
  },
  {
    key: "compact",
    label: "Kompakte Darstellung",
    beschreibung: "Verringert Abstände für mehr Inhalt auf einen Blick.",
    wirkung: "Arbeitsflächen werden dichter dargestellt.",
  },
];

export interface BarrierefreiheitsPanelProps {
  /** Überschrift der Gruppe (Default: „Anzeige und Bedienung"). */
  titel?: string;
  /** Kurzbeschreibung unter der Überschrift. */
  beschreibung?: string;
  className?: string;
}

/**
 * Einstell-Panel für die a11y-Präferenzen. Liest/schreibt über `useA11ySettings` (Klassen an <html> + Persistenz)
 * und sagt jede Umschaltung über die zentrale `StatusRegion` an.
 */
export function BarrierefreiheitsPanel({
  titel = "Anzeige und Bedienung",
  beschreibung = "Passen Sie Darstellung und Bewegung für dieses Gerät an. Die Auswahl wird lokal gespeichert.",
  className,
}: BarrierefreiheitsPanelProps) {
  const { settings, setOption, reset, isDefault } = useA11ySettings();
  const { announce } = useStatusRegion();
  const baseId = useId();
  const descriptionId = `${baseId}-description`;
  const activeCount = OPTIONEN.filter((option) => settings[option.key]).length;
  const summary =
    activeCount === 0
      ? "Standarddarstellung aktiv"
      : `${activeCount} Anpassungen aktiv`;

  return (
    <fieldset
      className={cn("ps-accessibility-settings", className)}
      aria-describedby={descriptionId}
    >
      <legend className="ps-accessibility-settings__legend">{titel}</legend>
      <div className="ps-accessibility-settings__header">
        <p id={descriptionId} className="ps-muted">
          {beschreibung}
        </p>
        <span
          className={
            isDefault
              ? "ps-status ps-status--neutral"
              : "ps-status ps-status--success"
          }
        >
          <span aria-hidden="true">{isDefault ? "i" : "OK"}</span>
          {summary}
        </span>
      </div>

      <div className="ps-accessibility-settings__options">
        {OPTIONEN.map((o) => {
          const labelId = `${baseId}-${o.key}-label`;
          const descId = `${baseId}-${o.key}-desc`;
          const impactId = `${baseId}-${o.key}-impact`;
          const aktiv = settings[o.key];
          return (
            <div key={o.key} className="ps-accessibility-settings__option">
              <div className="ps-accessibility-settings__copy">
                <span id={labelId}>{o.label}</span>
                <p id={descId} className="ps-muted">
                  {o.beschreibung}
                </p>
                <p id={impactId}>{o.wirkung}</p>
              </div>
              <span
                className={
                  aktiv
                    ? "ps-accessibility-settings__state ps-accessibility-settings__state--active"
                    : "ps-accessibility-settings__state"
                }
              >
                {aktiv ? "Aktiv" : "Aus"}
              </span>
              <Switch
                checked={aktiv}
                aria-labelledby={labelId}
                aria-describedby={`${descId} ${impactId}`}
                onCheckedChange={(v) => {
                  setOption(o.key, v);
                  announce(`${o.label} ${v ? "aktiviert" : "deaktiviert"}`);
                }}
                className="ps-accessibility-settings__switch"
              />
            </div>
          );
        })}
      </div>

      <div className="ps-accessibility-settings__actions">
        <button
          type="button"
          className="ps-btn ps-btn--ghost"
          disabled={isDefault}
          onClick={() => {
            reset();
            announce("Anzeige und Bedienung auf Standard zurückgesetzt.");
          }}
        >
          Standard wiederherstellen
        </button>
      </div>
    </fieldset>
  );
}
