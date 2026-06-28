// fachverfahren-kit/components/KommuneTheme — kommunales White-Labeling über die Token-Bridge.
//
// Eine Kommune im Prompt → ihr Webauftritt wird (von der Fabrik) per WebSearch gefunden, als ECHTE
// Kommune verifiziert, dann Markenfarben (CSS) + Wappen extrahiert. Dieser Layer nimmt das fertige
// `KommuneTheme` als DATEN entgegen und injiziert es in genau die CSS-Custom-Properties, aus denen das
// ganze Kit seine Farben zieht — kein Komponenten-Eingriff, EINE Wahrheit. Generisch: funktioniert für
// JEDE Kommune (oder Behörde/Unternehmen), ohne Code-Änderung.
//
// COMPLIANCE: das Wappen ist ein HOHEITSZEICHEN — Nutzung nur im eigenen Behörden-Dienst zulässig.
// Daher trägt das Theme Provenienz (Quelle + Prüfdatum + verifiziert-Flag); KommuneLogo macht die
// Quelle als title/Provenienz sichtbar. BITV-AA: fehlt eine Vordergrundfarbe, wird ein kontrast-
// sicherer Wert (schwarz/weiß) aus der Luminanz der Markenfarbe abgeleitet.
import * as React from "react";

import { cn } from "../lib/utils.js";

/** Markenfarben aus dem kommunalen Webauftritt (beliebige gültige CSS-Farbwerte). */
export interface KommuneBrand {
  primary?: string;
  primaryForeground?: string;
  accent?: string;
  accentForeground?: string;
  ring?: string;
  surface?: string;
  rail?: string;
}

/** Logo/Wappen mit Provenienz (Hoheitszeichen). */
export interface KommuneLogoAsset {
  /** Bild-URL oder Daten-URL (von der Fabrik geladen + im Projekt abgelegt). */
  src: string;
  /** Pflicht-Textalternative (z. B. „Wappen der Stadt Musterstadt"). */
  alt: string;
  /** Optionaler Link zum offiziellen Webauftritt. */
  href?: string;
}

export interface KommuneTheme {
  /** Anzeigename (z. B. „Stadt Musterstadt"). */
  name: string;
  brand?: KommuneBrand;
  logo?: KommuneLogoAsset;
  /** Herkunfts-/Verifikations-Nachweis des Webauftritts (Provenienz). */
  quelle?: {
    /** Offizielle Website, aus der Design + Wappen stammen. */
    url: string;
    /** ISO-Datum der Prüfung. */
    geprueftAm?: string;
    /** True, wenn als echte Kommune/Behörde verifiziert (Impressum/Domain geprüft). */
    verifiziert?: boolean;
  };
}

// ── Farb-Hilfen (kontrast-sicherer Vordergrund, BITV-AA) ────────────────────────────────────────

/** Parst #rgb/#rrggbb/rgb()/rgba() → [r,g,b] (0..255) oder null. */
function parseColor(c: string): [number, number, number] | null {
  const s = c.trim();
  const hex = s.replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return [hex[0], hex[1], hex[2]].map((h) => parseInt(h + h, 16)) as [number, number, number];
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((h) => parseInt(h, 16)) as [number, number, number];
  }
  const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

/** Wählt schwarz/weiß als Vordergrund nach relativer Luminanz (WCAG). Fällt auf null zurück. */
export function pickForeground(bg: string): string | null {
  const rgb = parseColor(bg);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? "#0b0b0b" : "#ffffff";
}

/** Baut die CSS-Custom-Property-Overrides aus einem Theme (nur gesetzte Werte). */
export function themeToCssVars(theme: KommuneTheme): Record<string, string> {
  const b = theme.brand ?? {};
  const vars: Record<string, string> = {};
  if (b.primary) {
    vars["--primary"] = b.primary;
    vars["--primary-foreground"] = b.primaryForeground ?? pickForeground(b.primary) ?? "var(--primary-foreground)";
    vars["--ring"] = b.ring ?? b.primary;
  }
  if (b.accent) {
    vars["--accent"] = b.accent;
    vars["--accent-foreground"] = b.accentForeground ?? pickForeground(b.accent) ?? "var(--accent-foreground)";
  }
  if (b.surface) vars["--surface"] = b.surface;
  if (b.rail) vars["--rail"] = b.rail;
  return vars;
}

/** Wendet ein Theme auf ein Element an (Default: <html>) — für ganzseitiges Theming. */
export function applyKommuneTheme(theme: KommuneTheme, target?: HTMLElement): () => void {
  const el = target ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return () => undefined;
  const vars = themeToCssVars(theme);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  return () => {
    for (const k of Object.keys(vars)) el.style.removeProperty(k);
  };
}

// ── Provider + Hook ─────────────────────────────────────────────────────────────────────────────

const KommuneThemeContext = React.createContext<KommuneTheme | null>(null);

/** Liefert das aktive Kommune-Theme (oder null) — für Logo/Name in Shell/PageHeader. */
export function useKommuneTheme(): KommuneTheme | null {
  return React.useContext(KommuneThemeContext);
}

export interface KommuneThemeProviderProps {
  theme: KommuneTheme | null | undefined;
  children: React.ReactNode;
  /** Theme zusätzlich auf <html> anwenden (ganzseitig). Default true. */
  global?: boolean;
}

/**
 * Stellt das Theme per Context bereit und (optional) ganzseitig auf <html>. Genau einmal nahe der
 * App-Wurzel rendern. Ohne theme = neutrales Default-Kit.
 */
export function KommuneThemeProvider({ theme, children, global = true }: KommuneThemeProviderProps) {
  React.useEffect(() => {
    if (!global || !theme) return;
    return applyKommuneTheme(theme);
  }, [global, theme]);

  return <KommuneThemeContext.Provider value={theme ?? null}>{children}</KommuneThemeContext.Provider>;
}

// ── Logo/Wappen ─────────────────────────────────────────────────────────────────────────────────

export interface KommuneLogoProps {
  /** Überschreibt das Logo aus dem Theme (sonst aus useKommuneTheme()). */
  logo?: KommuneLogoAsset;
  /** Höhe in px (Default 40). */
  height?: number;
  className?: string;
}

/**
 * Rendert Wappen/Logo der Kommune mit Pflicht-alt + Provenienz (Quelle als title). Hoheitszeichen:
 * die Herkunft bleibt nachvollziehbar. Ohne Logo wird nichts gerendert (kein Platzhalter-Rauschen).
 */
export function KommuneLogo({ logo, height = 40, className }: KommuneLogoProps) {
  const theme = useKommuneTheme();
  const asset = logo ?? theme?.logo;
  if (!asset) return null;
  const provenance = theme?.quelle?.url ? `Quelle: ${theme.quelle.url}` : undefined;
  const img = (
    <img
      src={asset.src}
      alt={asset.alt}
      height={height}
      style={{ height }}
      title={provenance}
      className={cn("w-auto object-contain", className)}
    />
  );
  return asset.href ? (
    <a href={asset.href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center">
      {img}
    </a>
  ) : (
    img
  );
}
