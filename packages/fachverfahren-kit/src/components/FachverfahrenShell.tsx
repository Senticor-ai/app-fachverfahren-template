// fachverfahren-kit/components/FachverfahrenShell — die GENERISCHE 3-Personen-App-Shell.
//
// Aus der Referenz-UX (lovable AppHeader + AppSidebar + PersonaSwitcher) 1:1 abgeleitet: gleicher Aufbau
// (Marken-Sidebar links · persona-spezifische Navigation · Persona-Wechsler unten · Inhalts-Main rechts),
// gleicher Look, gleiche a11y (Skip-Link → main-content, Landmarks, aria-current). ABER vollständig DATA-DRIVEN:
//   • Branding (Marke, Kommune, Initialen) kommt aus `config` — NIE aus Literalen.
//   • Die Navigation je Rolle wird aus dem VERTRAG abgeleitet (config.antrag / config.register / statusMachine),
//     niemals aus verfahrens-spezifischen Texten. Ein zweites Verfahren (Gewerbe, Parkausweis, Bauantrag) läuft
//     ohne jede Änderung an dieser Shell.
//   • Router-agnostisch: Nav-Einträge sind Links (href) und/oder ein onNavigate-Callback — die App entscheidet.
//
// de-public-administration: deutschsprachige Verwaltungs-Oberfläche (lang="de"), klare Landmarks
// (banner/navigation/main/contentinfo), Tastatur-erst (Skip-Link), Demo-Transparenz (synthetische Daten).
import {
  Database,
  FileText,
  Home,
  Inbox,
  LineChart,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import type { LeistungConfig } from "../types.js";
import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { useKommuneTheme, KommuneLogo } from "./KommuneTheme.js";
import {
  DEFAULT_PERSONAS,
  PersonaSwitcher,
  type Persona,
  type PersonaDescriptor,
} from "./PersonaSwitcher.js";

/** Ein Navigations-Eintrag der Sidebar — generisch, vom Vertrag abgeleitet. */
export interface ShellNavItem {
  /** Stabiler Schlüssel (auch für aria-current/Aktiv-Vergleich). */
  key: string;
  label: string;
  icon: LucideIcon;
  /** Ziel-Pfad (App-spezifisch). Optional — sonst rein über onNavigate. */
  href?: string;
}

export interface FachverfahrenShellProps<T = Record<string, unknown>> {
  /** Der Leistungs-Vertrag — liefert Branding + leitet die Navigation ab. */
  config: LeistungConfig<T>;
  /** Aktive Rolle (kontrolliert). */
  persona: Persona;
  /** Rollen-Wechsel. */
  onPersonaChange: (persona: Persona) => void;
  /** Seiten-Inhalt (die persona-spezifische Sicht). */
  children: React.ReactNode;
  /** Aktiver Nav-Schlüssel (für Markierung). Default: erster Eintrag der Rolle. */
  activeNavKey?: string;
  /** Optionaler Klick-Interceptor (z.B. für client-seitiges Routing statt Full-Navigation). */
  onNavigate?: (item: ShellNavItem) => void;
  /** Rollen-Beschreibungen für den Switcher (Default: generische DEFAULT_PERSONAS). */
  personas?: readonly PersonaDescriptor[];
}

/** Kurz-Marke (Initialen) aus dem Leistungs-Label ableiten — z.B. „Hundesteuer"→„HU", „Gewerbeanmeldung"→„GE". */
function brandInitials(label: string): string {
  const cleaned = label.trim();
  if (!cleaned) return "FV";
  const words = cleaned.split(/\s+/);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

/**
 * Navigation je Rolle — ausschließlich aus dem Vertrag abgeleitet (keine Verfahrens-Literale):
 *  • buerger:          Start + (falls Antrag definiert) „Antrag stellen".
 *  • sachbearbeitung:  Eingangskorb + (falls Register-Mock vorhanden) „Register".
 *  • aufsicht:         Kennzahlen / Audit.
 * Labels sind generische Verwaltungs-Begriffe; das konkrete Verfahren steckt im Branding, nicht in der Nav.
 */
function navFor<T>(persona: Persona, config: LeistungConfig<T>): ShellNavItem[] {
  switch (persona) {
    case "buerger": {
      const items: ShellNavItem[] = [{ key: "start", label: "Start", icon: Home, href: "/buerger" }];
      // DEFENSIV: eine (agent-generierte) Config kann Felder vermissen/anders geformt sein. Ein fehlendes
      // antrag.steps darf NIE die ganze App weiß-screenen — optionale Verkettung + Default 0.
      if ((config.antrag?.steps?.length ?? 0) > 0) {
        items.push({ key: "antrag", label: "Antrag stellen", icon: FileText, href: "/buerger/antrag" });
      }
      return items;
    }
    case "sachbearbeitung": {
      const items: ShellNavItem[] = [
        { key: "eingang", label: "Eingangskorb", icon: Inbox, href: "/amt" },
      ];
      if ((config.register?.mock?.length ?? 0) > 0) {
        items.push({ key: "register", label: "Register", icon: Database, href: "/amt/register" });
      }
      return items;
    }
    case "aufsicht":
      return [{ key: "kennzahlen", label: "Kennzahlen / Audit", icon: LineChart, href: "/audit" }];
    default:
      return [];
  }
}

/** Generische, verfahrens-neutrale Rollen-Überschrift in der Sidebar. */
const ROLLEN_LABEL: Record<Persona, string> = {
  buerger: "Bürger:in",
  sachbearbeitung: "Sachbearbeitung",
  aufsicht: "Aufsicht",
};

const MAIN_ID = "main-content";

/** Die 3-Personen-Shell: Skip-Link · Marken-Sidebar mit persona-Nav + Switcher · Header · Main-Inhalt. */
export function FachverfahrenShell<T = Record<string, unknown>>({
  config,
  persona,
  onPersonaChange,
  children,
  activeNavKey,
  onNavigate,
  personas = DEFAULT_PERSONAS,
}: FachverfahrenShellProps<T>): React.JSX.Element {
  const nav = navFor(persona, config);
  const activeKey = activeNavKey ?? nav[0]?.key;
  const initials = brandInitials(config.label);
  // Kommunales Wappen (verifiziert, aus dem Fachkonzept via runtime-config → KommuneThemeProvider), wenn vorhanden.
  const kommuneTheme = useKommuneTheme();
  const wappen = kommuneTheme?.logo;

  const handleNav = (item: ShellNavItem) => (e: React.MouseEvent) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(item);
    }
  };

  return (
    // lang="de": deutschsprachige Verwaltungs-Oberfläche; min-h-dvh = volle Höhe.
    <div lang="de" className="flex min-h-dvh w-full bg-background text-foreground">
      {/* a11y: Tastatur-Sprung direkt zum Inhalt (de-public-administration Pflicht). */}
      <a
        href={`#${MAIN_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
      >
        Zum Inhalt springen
      </a>

      {/* ── Marken-Sidebar (banner-/navigation-Landmark) ─────────────────────── */}
      <aside
        className="sticky top-0 z-30 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex"
        aria-label="Hauptnavigation"
      >
        {/* Marke — Branding ausschließlich aus config. */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3" role="banner">
          {wappen ? (
            <KommuneLogo logo={wappen} height={28} className="shrink-0" />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-sidebar-accent text-sidebar-accent-foreground">
              <span className="text-[11px] font-bold tracking-tight">{initials}</span>
            </span>
          )}
          <span className="overflow-hidden leading-tight">
            <span className="block truncate text-sm font-semibold">{config.label}</span>
            <span className="block truncate text-[10px] text-sidebar-muted">{config.kommune}</span>
          </span>
        </div>

        {/* Persona-spezifische Navigation (data-driven). */}
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={`Navigation — ${ROLLEN_LABEL[persona]}`}>
          <div className="mb-4">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
              {ROLLEN_LABEL[persona]}
            </div>
            <ul className="flex flex-col gap-0.5">
              {nav.map((item) => {
                const Icon = item.icon;
                const isActive = item.key === activeKey;
                return (
                  <li key={item.key}>
                    <a
                      href={item.href ?? "#"}
                      aria-current={isActive ? "page" : undefined}
                      onClick={handleNav(item)}
                      className={cn(
                        "flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-sm transition-colors",
                        isActive
                          ? "bg-sidebar-accent/20 font-medium text-sidebar-foreground"
                          : "text-sidebar-muted hover:bg-white/5 hover:text-sidebar-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </nav>

        {/* Rollen-Wechsler (umschaltbar). */}
        <div className="relative border-t border-sidebar-border p-2">
          <PersonaSwitcher persona={persona} onPersonaChange={onPersonaChange} personas={personas} />
        </div>
      </aside>

      {/* ── Inhalts-Spalte: Header + Main ───────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Kopfzeile (banner) — Kommune + Leistung + Demo-Transparenz. */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
          {/* Mobile-Marke (Sidebar ist ab md sichtbar). */}
          <span className="flex items-center gap-2 md:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary text-[10px] font-bold text-primary-foreground">
              {initials}
            </span>
            <span className="text-sm font-semibold">{config.label}</span>
          </span>

          <div className="hidden min-w-0 leading-tight md:block">
            <div className="truncate text-sm font-semibold">{config.label}</div>
            <div className="truncate text-[11px] text-muted-foreground">{config.kommune}</div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Aktive Rolle als ruhiger Kontext-Hinweis. */}
            <Badge tone="info" className="hidden sm:inline-flex">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              {ROLLEN_LABEL[persona]}
            </Badge>
            {/* Demo-/Datenschutz-Transparenz (synthetische Daten — keine Echtdaten). */}
            <Badge tone="neu">Demo · synthetische Daten</Badge>
          </div>
        </header>

        {/* Persona-Wechsler auch im Header (mobil, wo die Sidebar verborgen ist). */}
        <div className="border-b border-border bg-card px-2 py-1.5 md:hidden">
          <PersonaSwitcher persona={persona} onPersonaChange={onPersonaChange} personas={personas} />
        </div>

        {/* Haupt-Inhalt (main-Landmark, Sprungziel des Skip-Links). */}
        <main id={MAIN_ID} tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          {children}
        </main>

        {/* Fußzeile (contentinfo) — Rechtsgrundlage/Kommune, sofern vorhanden. */}
        {config.rechtsgrundlagen.length > 0 && (
          <footer className="border-t border-border bg-card px-4 py-2 text-[11px] text-muted-foreground" role="contentinfo">
            <span className="font-medium text-foreground">{config.kommune}</span>
            {" · "}
            {config.rechtsgrundlagen.map((r) => r.norm).join(" · ")}
          </footer>
        )}
      </div>
    </div>
  );
}
