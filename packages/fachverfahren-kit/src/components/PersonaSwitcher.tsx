// fachverfahren-kit/components/PersonaSwitcher — der generische, UMSCHALTBARE Rollen-Wechsler.
//
// Aus etablierten Public-Sector-UX-Mustern abgeleitet: gleicher Aufbau (Avatar + Label/Sub + Chevron),
// gängiger Popup-Look (role="menu" / menuitemradio), gleiche a11y (aria-haspopup/expanded, Esc + Outside-Click).
// ABER entkoppelt: Üblicherweise triggert ein solcher Wechsel eine URL-Navigation (router). Hier ist es eine reine,
// kontrollierte Auswahl über Props (persona/onPersonaChange) — die App entscheidet, ob daraus eine Route wird.
// Domänen-frei: keine Verfahrens-Texte, nur Rollen. Beschriftungen sind generische Defaults bzw. überschreibbar.
import {
  ChevronsUpDown,
  ClipboardCheck,
  LineChart,
  User,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { cn } from "../lib/utils.js";

/** Die drei generischen Rollen jedes kommunalen Fachverfahrens (Antragsteller · Bearbeitung · Aufsicht). */
export type Persona = "buerger" | "sachbearbeitung" | "aufsicht";

/** Anzeige-Beschreibung eines Arbeitsbereichs (rein generisch — keine Leistungs-Inhalte).
 *
 *  Das ist der DATEN-Vertrag der Sichtumschaltung: eine generierende Fabrik leitet diese Liste aus dem Personas-
 *  Artefakt ihres Fachkonzepts ab und liefert sie als `config.personas` — Landing UND Shell rendern die Bereiche
 *  dann NUR hieraus (EINE Wahrheit) statt aus einem hartkodierten Default-Array. Darum ist alles außer `key`/`label`
 *  OPTIONAL und JSON-serialisierbar: eine Config-Naht kann keine React-Komponente transportieren. Fehlende Felder
 *  werden generisch abgeleitet (Initialen aus dem Label) bzw. weggelassen. */
export interface PersonaDescriptor {
  key: Persona;
  /** Anzeigename (verfahrensspezifische Rolle aus dem Fachkonzept, sonst generische Rollenbezeichnung). */
  label: string;
  /** Untertitel/Funktion (z.B. „Sachbearbeitung", oder das Ziel der Persona). Optional. */
  sub?: string;
  /** Avatar-Initialen. Optional — fehlen sie, werden sie aus dem `label` abgeleitet. */
  initials?: string;
  /** Home-Route des Arbeitsbereichs (z.B. `/buerger`). Optional — die App entscheidet, ob/wie daraus Routing wird;
   *  fehlt sie, nutzt die App ihre eigene Routen-Konvention. */
  home?: string;
  /** Kurzbeschreibung für den Bereichs-Einstieg (Landing). Optional — sonst dient `sub` als Beschreibung. */
  beschreibung?: string;
  /** Optionales Icon. Wird vom Switcher aktuell nicht gerendert (Avatar = Initialen) und ist NICHT über eine
   *  Config-Naht transportierbar — daher optional. */
  icon?: LucideIcon;
}

/** Initialen aus einem Label ableiten (2 Zeichen) — damit ein Descriptor OHNE `initials` (z.B. aus einer generierten
 *  Config-Naht) trotzdem einen Avatar bekommt, ohne dass die Fabrik Anzeige-Details liefern muss. Rein + deterministisch. */
export function personaInitials(
  descriptor: Pick<PersonaDescriptor, "label" | "initials">,
): string {
  if (descriptor.initials?.trim()) return descriptor.initials.trim();
  const words = descriptor.label
    .split(/[\s/–—-]+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "AB";
  const raw =
    words.length >= 2 ? `${words[0][0]}${words[1][0]}` : words[0].slice(0, 2);
  return raw.toLocaleUpperCase("de-DE");
}

/** Generische Standard-Rollen — bewusst verfahrens-neutral; per Prop überschreibbar (z.B. mit Demo-Namen). */
export const DEFAULT_PERSONAS: readonly PersonaDescriptor[] = [
  {
    key: "buerger",
    label: "Bürger:in",
    sub: "Antragstellung",
    initials: "BÜ",
    icon: User,
  },
  {
    key: "sachbearbeitung",
    label: "Sachbearbeitung",
    sub: "Bearbeitung / Prüfung",
    initials: "SB",
    icon: ClipboardCheck,
  },
  {
    key: "aufsicht",
    label: "Aufsicht",
    sub: "Kennzahlen / Audit",
    initials: "AU",
    icon: LineChart,
  },
];

/** PER-KEY FAIL-OPEN: die (ggf. TEILWEISE) Persona-Wahrheit der Config über die generischen Defaults legen — je Key.
 *
 *  WURZEL (Sackgasse „partielles Persona-Modell"): die generierende Fabrik leitet jeden Arbeitsbereich EINZELN aus den
 *  Artefakten ab; nennt das Fachkonzept nur die Bürger-Persona, trägt `config.personas` genau EINEN Eintrag. Ein
 *  blosses `config.personas ?? DEFAULT_PERSONAS` machte daraus eine App, in der Sachbearbeitung und Aufsicht
 *  KOMPLETT VERSCHWINDEN — obwohl ihre Routen montiert sind und ihre Rollen zugewiesen werden. Ein Teil-Modell darf
 *  die anderen Sichten nicht mit in den Abgrund reissen: was die Config kennt, FÜHRT; was sie nicht kennt, bleibt
 *  generisch. Reihenfolge = kanonische Default-Reihenfolge (stabil).
 *
 *  Fehlt `personas` ganz (unveränderte Vorlage / Alt-App) oder ist es leer → reine Defaults (unverändertes Verhalten).
 *  Fremde Keys werden ignoriert (der Typ-Vertrag kennt nur die kanonischen Arbeitsbereiche). Rein + deterministisch. */
export function mergePersonas(
  config: readonly PersonaDescriptor[] | undefined,
  defaults: readonly PersonaDescriptor[] = DEFAULT_PERSONAS,
): readonly PersonaDescriptor[] {
  if (!config?.length) return defaults;
  const byKey = new Map(config.map((p) => [p.key, p]));
  return defaults.map((d) => {
    const aus = byKey.get(d.key);
    if (aus === undefined) return d;
    // Feldweise fail-open: ein Eintrag ohne `sub`/`initials` erbt sie vom Default statt sie zu verlieren.
    // Conditional-Spread statt expliziter `undefined`-Zuweisung: unter `exactOptionalPropertyTypes` darf ein
    // optionales Feld ABWESEND oder ein String sein — nie explizit `undefined`.
    const sub = aus.sub ?? d.sub;
    const initials = aus.initials ?? d.initials;
    return {
      ...d,
      ...aus,
      ...(sub !== undefined ? { sub } : {}),
      ...(initials !== undefined ? { initials } : {}),
    };
  });
}

export interface PersonaSwitcherProps {
  /** Aktiv gewählter Arbeitsbereich (kontrolliert). OPTIONAL: der Team-Workspace (Boards)
   *  ist Workspace-Navigation ohne aktive Persona — der Trigger zeigt dann neutral
   *  „Arbeitsbereich wählen" statt eine Rolle vorzutäuschen. */
  persona?: Persona | undefined;
  /** Wechsel-Callback — die App entscheidet über Folgewirkung (z.B. Routing). */
  onPersonaChange: (persona: Persona) => void;
  /** Rollen-Beschreibungen (Reihenfolge = Menü-Reihenfolge). Default: DEFAULT_PERSONAS. */
  personas?: readonly PersonaDescriptor[];
  /** Kompakt = nur Avatar (eingeklappte Sidebar). */
  compact?: boolean;
  className?: string;
}

/** Rollen-Wechsler mit Popup-Menü (Radix-frei, aber Radix-konform in a11y: menu / menuitemradio).
 *  Ohne Einträge (Konto ohne Arbeitsbereiche) rendert er NICHTS — der Aufrufer muss keinen
 *  eigenen Leer-Guard führen. */
export function PersonaSwitcher({
  persona,
  onPersonaChange,
  personas = DEFAULT_PERSONAS,
  compact = false,
  className,
}: PersonaSwitcherProps): React.JSX.Element | null {
  const current = persona ? personas.find((p) => p.key === persona) : undefined;
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Schließen bei Klick außerhalb + Escape (wie Referenz).
  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  if (personas.length === 0) return null;

  return (
    <div className={cn("relative", className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          current
            ? `Arbeitsbereich wechseln — aktuell ${current.label}`
            : "Arbeitsbereich wählen"
        }
        title={
          compact
            ? current
              ? `${current.label} · Arbeitsbereich wechseln`
              : "Arbeitsbereich wählen"
            : undefined
        }
        className={cn(
          // Kanonisches Fokus-Rezept (Spec 3.2): weicher 3px-Ring, EIN Rezept kit-weit.
          "flex w-full items-center gap-2.5 rounded-md text-left hover:bg-white/5",
          "transition-colors ease-out motion-reduce:transition-none",
          "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          // Trigger-Höhe h-10 (40px) im ausgeklappten Zustand; kompakt = quadratischer Avatar-Slot.
          compact ? "h-10 w-10 justify-center p-1.5" : "h-10 px-2 py-1.5",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent/25 text-xs font-bold text-sidebar-foreground">
          {current ? personaInitials(current) : "AB"}
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium text-sidebar-foreground">
                {current?.label ?? "Arbeitsbereich wählen"}
              </span>
              <span className="block truncate text-xs text-sidebar-muted">
                {current?.sub ?? (current ? "" : "Zugewiesene Sichten")}
              </span>
            </span>
            <ChevronsUpDown
              className="h-3.5 w-3.5 shrink-0 text-sidebar-muted"
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Arbeitsbereich wählen"
          className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md"
        >
          <div className="border-b border-border bg-muted/40 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">
            Arbeitsbereich wechseln
          </div>
          {/* a11y (axe aria-required-children): role="menu" darf nur menuitem*-Kinder
              besitzen — die Listen-Container sind rein präsentational. */}
          <ul role="presentation" className="p-1">
            {personas.map((p) => {
              const isActive = p.key === persona;
              return (
                <li role="presentation" key={p.key}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => {
                      setOpen(false);
                      onPersonaChange(p.key);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent/10",
                      "transition-colors ease-out motion-reduce:transition-none",
                      "outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                      isActive && "bg-accent/10",
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-foreground">
                      {personaInitials(p)}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {p.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.sub}
                      </span>
                    </span>
                    {isActive && (
                      <span className="text-xs font-medium uppercase tracking-wide text-accent">
                        aktiv
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
