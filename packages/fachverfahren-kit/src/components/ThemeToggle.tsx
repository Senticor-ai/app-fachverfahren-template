// fachverfahren-kit/components/ThemeToggle — 3-Wege-Umschalter Hell / Dunkel / System.
//
// Bedient `useTheme` (setzt/entfernt die Klasse „dark" an <html>, folgt bei „system" der Systemeinstellung und
// persistiert). GENERISCH, dep-frei (React + Bestands-Button + lucide + Token-Klassen). Rein präsentierend.
//
// Barrierefreiheit (WCAG 2.2 AA / BITV 2.0 / EN 301 549):
//  - als benannte Gruppe (role="group" + aria-label) gebündelt,
//  - drei Umschalt-Buttons mit aria-pressed (der aktive Zustand wird nicht nur über die Farbe getragen: Icon + Text
//    + aria-pressed) und aussagekräftigem aria-label (bei „System" mit dem aktuell aufgelösten Schema),
//  - Zielgröße (SC 2.5.8): der Bestands-Button erfüllt sie (size „sm" ⇒ 36px),
//  - die Wahl wird über die zentrale StatusRegion angesagt (aria-live).
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { useTheme, type Theme } from "../hooks/useTheme.js";
import { useStatusRegion } from "./StatusRegion.js";

/** Die drei Wahlmöglichkeiten mit Icon + Text. */
const OPTIONEN: { value: Theme; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Hell", Icon: Sun },
  { value: "dark", label: "Dunkel", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export interface ThemeToggleProps {
  /** Zugängliche Beschriftung der Gruppe (Default: „Farbschema"). */
  label?: string;
  className?: string;
}

/** 3-Wege-Farbschema-Umschalter. Der aktive Wert ist per aria-pressed + Text markiert (nie nur Farbe). */
export function ThemeToggle({
  label = "Farbschema",
  className,
}: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { announce } = useStatusRegion();

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex items-center gap-1", className)}
    >
      {OPTIONEN.map((o) => {
        const aktiv = theme === o.value;
        const systemHinweis =
          o.value === "system"
            ? ` (folgt System, aktuell ${resolvedTheme === "dark" ? "dunkel" : "hell"})`
            : "";
        return (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={aktiv ? "default" : "outline"}
            aria-pressed={aktiv}
            aria-label={`${label}: ${o.label}${systemHinweis}`}
            onClick={() => {
              setTheme(o.value);
              announce(`${label}: ${o.label} gewählt`);
            }}
          >
            <o.Icon aria-hidden="true" />
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}
