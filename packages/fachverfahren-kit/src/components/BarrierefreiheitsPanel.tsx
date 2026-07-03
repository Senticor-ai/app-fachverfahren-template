// fachverfahren-kit/components/BarrierefreiheitsPanel — das interaktive EINSTELL-Panel für die a11y-Präferenzen.
//
// NICHT die Barrierefreiheits-ERKLÄRUNG (das ist `Barrierefreiheitserklaerung`), sondern der Bedien-Schalter: ein
// <fieldset> mit je einem Switch für Größere Schrift / Hoher Kontrast / Bewegung reduzieren / Kompakte Darstellung.
// Der Zustand liegt in `useA11ySettings` (schaltet die Klassen an <html> + persistiert). GENERISCH, dep-frei
// (React + Bestands-Primitive Switch + Token-Klassen).
//
// Barrierefreiheit (WCAG 2.2 AA / BITV 2.0 / EN 301 549):
//  - gruppiert als <fieldset>/<legend> (semantische Gruppe mit Namen),
//  - jeder Switch trägt seinen Namen über aria-labelledby und seine Erläuterung über aria-describedby,
//  - Signal nie nur über Farbe: Beschriftung + Zustand werden textlich getragen (Switch = role="switch"),
//  - jede Umschaltung wird über die zentrale StatusRegion angesagt (aria-live),
//  - Zielgröße (SC 2.5.8): großzügige Zeilen (py-3 ⇒ ≥ 24px Abstand zwischen den Schaltern), zusätzlich ist die
//    Beschriftung Teil des klickbaren Zeilen-Layouts.
import { useId } from "react";

import { cn } from "../lib/utils.js";
import { Switch } from "../ui/switch.js";
import {
  useA11ySettings,
  type A11yOption,
} from "../hooks/useA11ySettings.js";
import { useStatusRegion } from "./StatusRegion.js";

/** Beschriftung + Erläuterung je Präferenz — generische Verwaltungssprache, kein Domänen-Literal. */
const OPTIONEN: { key: A11yOption; label: string; beschreibung: string }[] = [
  {
    key: "largeText",
    label: "Größere Schrift",
    beschreibung: "Vergrößert die Textgröße für bessere Lesbarkeit.",
  },
  {
    key: "highContrast",
    label: "Hoher Kontrast",
    beschreibung: "Verstärkt Farb- und Randkontraste.",
  },
  {
    key: "reduceMotion",
    label: "Bewegung reduzieren",
    beschreibung: "Deaktiviert Animationen und Übergänge.",
  },
  {
    key: "compact",
    label: "Kompakte Darstellung",
    beschreibung: "Verringert Abstände für mehr Inhalt auf einen Blick.",
  },
];

export interface BarrierefreiheitsPanelProps {
  /** Überschrift der Gruppe (Default: „Anzeige und Bedienung"). */
  titel?: string;
  className?: string;
}

/**
 * Einstell-Panel für die a11y-Präferenzen. Liest/schreibt über `useA11ySettings` (Klassen an <html> + Persistenz)
 * und sagt jede Umschaltung über die zentrale `StatusRegion` an.
 */
export function BarrierefreiheitsPanel({
  titel = "Anzeige und Bedienung",
  className,
}: BarrierefreiheitsPanelProps) {
  const { settings, setOption } = useA11ySettings();
  const { announce } = useStatusRegion();
  const baseId = useId();

  return (
    <fieldset
      className={cn(
        "rounded-lg border border-border bg-card p-4 text-card-foreground",
        className,
      )}
    >
      <legend className="px-1 text-base font-semibold text-foreground">
        {titel}
      </legend>
      <p className="mb-1 text-sm text-muted-foreground">
        Diese Einstellungen werden auf diesem Gerät gespeichert.
      </p>
      <div className="divide-y divide-border">
        {OPTIONEN.map((o) => {
          const labelId = `${baseId}-${o.key}-label`;
          const descId = `${baseId}-${o.key}-desc`;
          const aktiv = settings[o.key];
          return (
            <div
              key={o.key}
              className="flex items-start justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <span
                  id={labelId}
                  className="block text-sm font-medium text-foreground"
                >
                  {o.label}
                </span>
                <p id={descId} className="mt-0.5 text-sm text-muted-foreground">
                  {o.beschreibung}
                </p>
              </div>
              <Switch
                checked={aktiv}
                aria-labelledby={labelId}
                aria-describedby={descId}
                onCheckedChange={(v) => {
                  setOption(o.key, v);
                  announce(`${o.label} ${v ? "aktiviert" : "deaktiviert"}`);
                }}
                className="mt-0.5 shrink-0"
              />
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
