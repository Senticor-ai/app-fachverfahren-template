// fachverfahren-kit/components/LanguageSwitch — i18n- + Leichte-Sprache-Umschaltung (Zugänglichkeits-Bedienleiste).
//
// Drei entkoppelte, kontrollierte Stellschrauben: (1) Sprach-Dropdown (Radix-Select), (2) Toggle „Leichte
// Sprache" (Radix-Switch), (3) optionaler Link auf ein Gebärdensprache-Video. Die App entscheidet über die
// Folgewirkung (App-Sprache umschalten, Inhalte in Leichter Sprache laden) — diese Komponente liefert nur die
// Auswahl-Events. Jeder Wechsel wird über die zentrale Ansage (useStatusRegion) höflich angesagt.
//
// GENERISCH + DEP-FREI: Die Sprachliste kommt vollständig aus `sprachen` (props) — keine fest verdrahteten
// Sprachen, keine Domänen-Literale. Lediglich die Bedien-Beschriftungen (überschreibbar) sind deutsch.
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): echtes <button>/<a>, aria-label am Trigger nennt die aktuelle Sprache,
// die aktive Option ist im Menü gekennzeichnet (nicht nur über Farbe → zusätzlich Häkchen/Text), der
// Gebärden-Link ist ein echtes <a> mit aria-label, Icons rein dekorativ (aria-hidden), Ziel-Größe >= 24px,
// sichtbarer Fokus (focus-visible:ring) erbt aus den ui-Primitiven, motion-reduce wird respektiert.
// HINWEIS lang-Attribut: Diese Komponente steuert NUR die Auswahl. Das gewählte `aktiv`-Kürzel sollte von der
// App als BCP-47-`lang`-Attribut an die Inhalts-Wurzel (z.B. <html lang> oder den Inhaltsbereich) gesetzt
// werden, damit Screenreader die korrekte Aussprache wählen. Das `code` der Sprachen ist also ein lang-Tag.
import { Accessibility, Globe, HandMetal } from "lucide-react";
import * as React from "react";

import { cn } from "../lib/utils.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";
import { Switch } from "../ui/switch.js";
import { useStatusRegion } from "./StatusRegion.js";

/** Eine wählbare Sprache. `code` ist ein BCP-47-Sprach-Tag (z.B. "de", "en", "tr") → taugt als lang-Attribut. */
export interface SprachOption {
  /** BCP-47-Sprach-Tag, dient als Wert UND als lang-Attribut-Vorlage für die App. */
  code: string;
  /** Anzeigename der Sprache (idealerweise in der jeweiligen Sprache, z.B. „English", „Türkçe"). */
  label: string;
}

export interface LanguageSwitchProps {
  /** Verfügbare Sprachen (Reihenfolge = Menü-Reihenfolge). Vollständig aus props — keine Defaults. */
  sprachen: SprachOption[];
  /** Aktiv gewählter Sprach-Code (kontrolliert). */
  aktiv: string;
  /** Wechsel-Callback — die App schaltet die Anzeige-Sprache um. */
  onWechsel: (code: string) => void;
  /** Ob „Leichte Sprache" aktiv ist (kontrolliert). Ohne `onLeichteSprache` wird der Toggle nicht gezeigt. */
  leichteSprache?: boolean;
  /** Umschalt-Callback für Leichte Sprache. Nur wenn gesetzt, erscheint der Toggle. */
  onLeichteSprache?: ((an: boolean) => void) | undefined;
  /** Optionale URL zu einem Gebärdensprache-Video (DGS). Nur wenn gesetzt, erscheint der Link. */
  gebaerdenVideoUrl?: string | undefined;
  /** Beschriftung des Sprach-Felds (a11y-Label des Triggers ergänzt um die aktuelle Sprache). Default: „Sprache". */
  sprachLabel?: string;
  /** Beschriftung des Leichte-Sprache-Toggles. Default: „Leichte Sprache". */
  leichteSpracheLabel?: string;
  /** Beschriftung des Gebärden-Links. Default: „Gebärdensprache (Video)". */
  gebaerdenLabel?: string;
  /** Layout: Kompakt = nur Sprach-Dropdown (z.B. mobile Kopfzeile), Rest entfällt. */
  compact?: boolean;
  className?: string;
}

const SPRACHE_LABEL_DEFAULT = "Sprache";
const LEICHTE_SPRACHE_LABEL_DEFAULT = "Leichte Sprache";
const GEBAERDEN_LABEL_DEFAULT = "Gebärdensprache (Video)";

/**
 * Zugänglichkeits-Bedienleiste: Sprache wählen, Leichte Sprache umschalten, Gebärden-Video öffnen.
 *
 * @example
 * <LanguageSwitch
 *   sprachen={[{ code: "de", label: "Deutsch" }, { code: "en", label: "English" }]}
 *   aktiv={lang}
 *   onWechsel={setLang}
 *   leichteSprache={ls}
 *   onLeichteSprache={setLs}
 *   gebaerdenVideoUrl="/dgs/start.mp4"
 * />
 */
export function LanguageSwitch({
  sprachen,
  aktiv,
  onWechsel,
  leichteSprache = false,
  onLeichteSprache,
  gebaerdenVideoUrl,
  sprachLabel = SPRACHE_LABEL_DEFAULT,
  leichteSpracheLabel = LEICHTE_SPRACHE_LABEL_DEFAULT,
  gebaerdenLabel = GEBAERDEN_LABEL_DEFAULT,
  compact = false,
  className,
}: LanguageSwitchProps): React.JSX.Element {
  const { announce } = useStatusRegion();
  const reactId = React.useId();
  const switchId = `${reactId}-leichte-sprache`;
  const switchLabelId = `${reactId}-leichte-sprache-label`;

  const aktiveSprache = sprachen.find((s) => s.code === aktiv);
  const aktiverName = aktiveSprache?.label ?? aktiv;

  const handleSprache = React.useCallback(
    (code: string) => {
      const ziel = sprachen.find((s) => s.code === code);
      onWechsel(code);
      announce(`Sprache gewechselt zu ${ziel?.label ?? code}.`, "polite");
    },
    [sprachen, onWechsel, announce],
  );

  const handleLeichteSprache = React.useCallback(
    (an: boolean) => {
      onLeichteSprache?.(an);
      announce(
        an
          ? "Leichte Sprache eingeschaltet."
          : "Leichte Sprache ausgeschaltet.",
        "polite",
      );
    },
    [onLeichteSprache, announce],
  );

  return (
    <div
      className={cn("flex flex-wrap items-center gap-3", className)}
      role="group"
      aria-label="Sprache und Zugänglichkeit"
    >
      {/* (1) Sprach-Dropdown */}
      <div className="flex items-center gap-2">
        <Globe
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <Select value={aktiv} onValueChange={handleSprache}>
          <SelectTrigger
            className="h-9 min-h-[36px] w-auto min-w-[8rem] gap-2"
            aria-label={`${sprachLabel} — aktuell ${aktiverName}`}
          >
            <SelectValue placeholder={sprachLabel} />
          </SelectTrigger>
          <SelectContent>
            {sprachen.map((s) => (
              // lang-Attribut am Eintrag → korrekte Aussprache des Sprachnamens durch den Screenreader.
              <SelectItem key={s.code} value={s.code} lang={s.code}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!compact && onLeichteSprache && (
        <>
          {/* (2) Toggle Leichte Sprache */}
          <div className="flex items-center gap-2">
            <Accessibility
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <label
              id={switchLabelId}
              htmlFor={switchId}
              className="cursor-pointer select-none text-sm font-medium text-foreground"
            >
              {leichteSpracheLabel}
            </label>
            <Switch
              id={switchId}
              checked={leichteSprache}
              onCheckedChange={handleLeichteSprache}
              aria-labelledby={switchLabelId}
              // WCAG 2.2 AA (2.5.8 Target Size): den 20px-Schalter auf >=24px Ziel-Höhe anheben.
              className="my-0.5 min-h-[24px]"
            />
            {/* Status zusätzlich als Text — Information nie nur über Position/Farbe des Schalters. */}
            <span className="text-xs text-muted-foreground" aria-hidden="true">
              {leichteSprache ? "Ein" : "Aus"}
            </span>
          </div>
        </>
      )}

      {!compact && gebaerdenVideoUrl && (
        // (3) Gebärdensprache-Video — echtes <a>, neuer Tab mit Sicherheits-rel, dekoratives Icon.
        <a
          href={gebaerdenVideoUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${gebaerdenLabel} (öffnet in neuem Tab)`}
          className={cn(
            "inline-flex min-h-[36px] items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-primary",
            "underline-offset-4 hover:underline",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "transition-colors motion-reduce:transition-none",
          )}
        >
          <HandMetal className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{gebaerdenLabel}</span>
        </a>
      )}
    </div>
  );
}
