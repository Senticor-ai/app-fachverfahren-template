// fachverfahren-kit/components/SprachvariantenText — denselben Inhalt in wählbarer Sprachvariante zeigen.
//
// ERGÄNZT (ersetzt NICHT) den LanguageSwitch: Während der LanguageSwitch die APP-weite Sprach-/Leichte-Sprache-
// Auswahl steuert, rendert diese Komponente einen KONKRETEN Inhalt in mehreren mitgelieferten Varianten
// (z. B. Standardsprache, weitere Sprachen, „Leichte Sprache"). Sie setzt je Variante das korrekte lang-Attribut
// am Inhaltsbereich, damit Screenreader die passende Aussprache wählen.
//
// GENERISCH + DEP-LEICHT: keine Domänen-Literale; Varianten (code/label/text) kommen ausschließlich über Props.
// HINWEIS zum lang-Attribut: `code` ist ein BCP-47-Sprach-Tag und wird als lang gesetzt. „Leichte Sprache" ist
// KEINE eigene Sprache — sie bleibt phonetisch Deutsch; als code eignet sich daher "de" oder ein privater
// Untertag wie "de-x-leicht", damit die Aussprache deutsch bleibt (die Wahl trifft der Aufrufer, nicht der Kit).
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): Umschaltung als echte <button>-Toggle (Button-Primitive, >= 36px, mit
// aria-pressed), aktive Variante mehrkanalig (Farbe + aria-pressed + Text), Inhaltsbereich mit lang + role, Ansage
// über die zentrale StatusRegion, sichtbarer Fokus aus den Primitiven, motion-reduce respektiert.
import * as React from "react";
import { Languages } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { useStatusRegion } from "./StatusRegion.js";

/** Eine Inhalts-Variante. `code` ist ein BCP-47-Sprach-Tag (dient als lang-Attribut). */
export interface TextVariante {
  /** BCP-47-Sprach-Tag (z. B. "de", "en", "tr", "de-x-leicht"). Wird als lang gesetzt. */
  code: string;
  /** Anzeigename der Variante (idealerweise in der Zielsprache, z. B. „English", „Leichte Sprache"). */
  label: string;
  /** Der Inhalt in dieser Variante — reiner Text oder beliebige React-Knoten. */
  text: React.ReactNode;
}

export interface SprachvariantenTextProps {
  /** Verfügbare Varianten (Reihenfolge = Reihenfolge der Umschalt-Buttons). */
  varianten: TextVariante[];
  /** Aktiver Variantencode (kontrolliert, wenn zusammen mit onWechsel genutzt). Default: erste Variante. */
  aktiv?: string | undefined;
  /** Wechsel-Callback. */
  onWechsel?: ((code: string) => void) | undefined;
  /** Optionale Überschrift über der Umschaltleiste. */
  titel?: string | undefined;
  /** Beschriftung der Umschalt-Gruppe (a11y). Default „Sprachvariante wählen". */
  auswahlLabel?: string;
  className?: string;
}

/**
 * Zeigt denselben Inhalt in der gewählten Sprachvariante und setzt das passende lang-Attribut.
 *
 * @example
 * <SprachvariantenText
 *   varianten={[
 *     { code: "de", label: "Standardsprache", text: "…" },
 *     { code: "de-x-leicht", label: "Leichte Sprache", text: "…" },
 *   ]}
 * />
 */
export function SprachvariantenText({
  varianten,
  aktiv,
  onWechsel,
  titel,
  auswahlLabel = "Sprachvariante wählen",
  className,
}: SprachvariantenTextProps): React.JSX.Element | null {
  const { announce } = useStatusRegion();

  // Kontrolliert (aktiv gesetzt) ODER selbstgesteuert (interner Zustand, geimpft mit der ersten Variante).
  const [intern, setIntern] = React.useState<string>(
    () => aktiv ?? varianten[0]?.code ?? "",
  );
  const istKontrolliert = aktiv !== undefined;
  const aktuellerCode = istKontrolliert ? aktiv : intern;

  const wechsle = React.useCallback(
    (variante: TextVariante) => {
      if (!istKontrolliert) setIntern(variante.code);
      onWechsel?.(variante.code);
      announce(`Variante gewechselt zu ${variante.label}.`, "polite");
    },
    [istKontrolliert, onWechsel, announce],
  );

  if (varianten.length === 0) return null;

  // Aktive Variante (Fallback auf die erste, falls der Code nicht (mehr) existiert).
  const aktiveVariante =
    varianten.find((v) => v.code === aktuellerCode) ?? varianten[0]!;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {titel && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Languages
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            {titel}
          </span>
        )}
        {/* Umschalt-Gruppe: echte Toggle-Buttons; aktiver Zustand über aria-pressed + Optik (mehrkanalig). */}
        <div
          role="group"
          aria-label={auswahlLabel}
          className="flex flex-wrap gap-1.5"
        >
          {varianten.map((variante) => {
            const aktivB = variante.code === aktiveVariante.code;
            return (
              <Button
                key={variante.code}
                type="button"
                size="sm"
                variant={aktivB ? "default" : "outline"}
                aria-pressed={aktivB}
                lang={variante.code}
                onClick={() => wechsle(variante)}
              >
                {variante.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Inhaltsbereich mit korrektem lang-Attribut je Variante. */}
      <div
        role="region"
        aria-label={aktiveVariante.label}
        lang={aktiveVariante.code}
        className="whitespace-pre-line text-sm leading-relaxed text-foreground"
      >
        {aktiveVariante.text}
      </div>
    </div>
  );
}
