// components/HilfePanel — das GENERISCHE Hilfe-/FAQ-Panel der Bürger-Sicht.
//
// Dep-freies, zugängliches Accordion nach dem WAI-ARIA Disclosure-Pattern: je Eintrag ein <button> mit
// aria-expanded + aria-controls, das ein Panel (region) auf-/zuklappt. Voll tastaturbedienbar (Enter/Space
// über native Button-Semantik), sichtbarer Fokus-Ring, ausreichende Zielgröße (min-h-11 = 44px).
// Optional ein Umschalter „Leichte Sprache", der einen alternativen Einträge-Satz anzeigt.
//
// KEINE Domänen-Literale: Fragen/Antworten/Titel kommen ausschließlich aus props. Kein npm-Dep —
// nur React + Tailwind + lucide-react. Respektiert prefers-reduced-motion (kein erzwungenes Motion).
import { useId, useState, type ReactElement } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

import { cn } from "../lib/utils.js";

export interface HilfeEintrag {
  frage: string;
  antwort: string;
}

export interface HilfePanelProps {
  /** Die Hilfe-/FAQ-Einträge in Standardsprache. */
  eintraege: HilfeEintrag[];
  /** Überschrift des Panels — fällt generisch auf „Hilfe & häufige Fragen" zurück. */
  titel?: string;
  /** Optionaler Einträge-Satz in Leichter Sprache; aktiviert den Umschalter, wenn vorhanden/nicht leer. */
  leichteSprache?: HilfeEintrag[];
  /**
   * `single` (Default): höchstens ein Eintrag offen (Akkordeon).
   * `multiple`: mehrere Einträge gleichzeitig offen.
   */
  modus?: "single" | "multiple";
  className?: string;
}

/** Hilfe-/FAQ-Panel — zugängliches Disclosure-Accordion mit optionalem Leichte-Sprache-Umschalter. */
export function HilfePanel({
  eintraege,
  titel = "Hilfe & häufige Fragen",
  leichteSprache,
  modus = "single",
  className,
}: HilfePanelProps): ReactElement {
  const baseId = useId();
  const hatLeichteSprache = Array.isArray(leichteSprache) && leichteSprache.length > 0;
  const [leicht, setLeicht] = useState(false);

  // Aktiver Einträge-Satz — Leichte Sprache nur, wenn vorhanden UND angewählt.
  const aktiveEintraege = leicht && hatLeichteSprache ? leichteSprache! : eintraege;

  // Offene Indizes als Set (deckt single + multiple generisch ab).
  const [offen, setOffen] = useState<Set<number>>(() => new Set());

  const toggle = (index: number) =>
    setOffen((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        if (modus === "single") next.clear();
        next.add(index);
      }
      return next;
    });

  // Beim Wechsel des Satzes (Leichte Sprache) offene Indizes zurücksetzen — sonst zeigen Indizes ins Leere.
  const setLeichtMode = (wert: boolean) => {
    setLeicht(wert);
    setOffen(new Set());
  };

  return (
    <section
      className={cn("rounded-md border border-border bg-card", className)}
      aria-labelledby={`${baseId}-titel`}
    >
      {/* Kopf — Titel + optionaler Leichte-Sprache-Umschalter */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2
          id={`${baseId}-titel`}
          className="flex items-center gap-2 text-base font-semibold text-foreground"
        >
          <HelpCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {titel}
        </h2>

        {hatLeichteSprache && (
          <SpracheUmschalter
            id={`${baseId}-sprache`}
            leicht={leicht}
            onChange={setLeichtMode}
          />
        )}
      </div>

      {aktiveEintraege.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          Zurzeit sind keine Hilfe-Einträge hinterlegt.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {aktiveEintraege.map((eintrag, index) => {
            const istOffen = offen.has(index);
            const triggerId = `${baseId}-trigger-${index}`;
            const panelId = `${baseId}-panel-${index}`;
            return (
              <li key={`${index}-${eintrag.frage}`}>
                <h3 className="m-0">
                  <button
                    type="button"
                    id={triggerId}
                    aria-expanded={istOffen}
                    aria-controls={panelId}
                    onClick={() => toggle(index)}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm font-medium text-foreground transition-colors",
                      "hover:bg-secondary/50",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-inset",
                    )}
                  >
                    <span>{eintrag.frage}</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
                        istOffen && "rotate-180",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={triggerId}
                  hidden={!istOffen}
                  className="px-5 pb-4 pt-0"
                >
                  <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {eintrag.antwort}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── Leichte-Sprache-Umschalter (zugänglicher Switch über role=switch) ───────────────────────────
function SpracheUmschalter({
  id,
  leicht,
  onChange,
}: {
  id: string;
  leicht: boolean;
  onChange: (wert: boolean) => void;
}): ReactElement {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-[12px]">
      <span className="text-muted-foreground">Leichte Sprache</span>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={leicht}
        aria-label="Leichte Sprache anzeigen"
        onClick={() => onChange(!leicht)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-card",
          leicht ? "border-accent bg-accent" : "border-border bg-secondary",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-card shadow transition-transform duration-200 motion-reduce:transition-none",
            leicht ? "translate-x-6" : "translate-x-1",
          )}
          aria-hidden="true"
        />
      </button>
    </label>
  );
}
