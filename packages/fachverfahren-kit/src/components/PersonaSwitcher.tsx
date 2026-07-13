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

/** Anzeige-Beschreibung einer Rolle (rein generisch — keine Leistungs-Inhalte). */
export interface PersonaDescriptor {
  key: Persona;
  /** Anzeigename (Demo-Persona oder generische Rollenbezeichnung). */
  label: string;
  /** Untertitel/Funktion (z.B. „Sachbearbeitung"). */
  sub: string;
  /** Avatar-Initialen. */
  initials: string;
  icon: LucideIcon;
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
          {current?.initials ?? "AB"}
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium text-sidebar-foreground">
                {current?.label ?? "Arbeitsbereich wählen"}
              </span>
              <span className="block truncate text-xs text-sidebar-muted">
                {current?.sub ?? "Zugewiesene Sichten"}
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
                      {p.initials}
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
