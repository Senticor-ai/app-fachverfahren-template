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

/** hsl (h Grad, s/l 0..1) → [r,g,b] 0..255. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = (((h % 360) + 360) % 360) / 60;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((hh % 2) - 1));
  const m = l - chroma / 2;
  let r, g, b;
  if (hh < 1) [r, g, b] = [chroma, x, 0];
  else if (hh < 2) [r, g, b] = [x, chroma, 0];
  else if (hh < 3) [r, g, b] = [0, chroma, x];
  else if (hh < 4) [r, g, b] = [0, x, chroma];
  else if (hh < 5) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** [r,g,b] 0..255 → hsl (h Grad, s/l 0..1). */
function rgbToHsl([r0, g0, b0]: [number, number, number]): [
  number,
  number,
  number,
] {
  const r = r0 / 255,
    g = g0 / 255,
    b = b0 / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((((g - b) / d) % 6) + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

/** Relative Luminanz (WCAG) aus [r,g,b] 0..255. */
function relLuminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Parst #rgb/#rrggbb/rgb()/rgba()/hsl()/hsla() → [r,g,b] (0..255) oder null. */
function parseColor(c: string): [number, number, number] | null {
  const s = c.trim();
  const hex = s.replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return [hex[0], hex[1], hex[2]].map((h) => parseInt(h + h, 16)) as [
      number,
      number,
      number,
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((h) =>
      parseInt(h, 16),
    ) as [number, number, number];
  }
  const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  // hsl()/hsla() — WICHTIG fuer die Kontrast-Ableitung: Markenfarben liegen oft als hsl vor (z. B.
  // die Default-Kommune). Ohne hsl-Support liefert pickForeground null -> KEIN --primary-foreground
  // injiziert -> im Dark-Mode faellt der Token-Wert (dunkel) ein und der Marken-Hintergrund traegt
  // dunklen Text (BITV-Verstoss).
  const hslM = s.match(
    /hsla?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%/i,
  );
  if (hslM) {
    return hslToRgb(
      Number(hslM[1]),
      Math.min(1, Math.max(0, Number(hslM[2]) / 100)),
      Math.min(1, Math.max(0, Number(hslM[3]) / 100)),
    );
  }
  return null;
}

/**
 * Wählt schwarz/weiß als Vordergrund nach relativer Luminanz (WCAG). Fällt auf null zurück.
 * Schwelle = korrekter WCAG-Schwarz/Weiß-Übergang: (L+0.05)² = 1.05·0.05 → L ≈ 0.179. Darüber gibt
 * Schwarz besseren Kontrast, darunter Weiß. (Der frühere Wert 0.4 wählte für mittelhelle Farben
 * fälschlich Weiß — z. B. eine im Dark-Mode aufgehellte Marken-Primary (L≈0.34) bekam Weiß mit nur
 * 2.76:1 statt Schwarz mit 7.8:1.)
 */
export function pickForeground(bg: string): string | null {
  const rgb = parseColor(bg);
  if (!rgb) return null;
  return relLuminance(rgb) > 0.179 ? "#0b0b0b" : "#ffffff";
}

/**
 * Dark-Mode-Variante der Marken-Primary: hellt die Lightness an, bis die Farbe als TEXT auf der
 * hellsten dunklen Flaeche (--card ≈ #2e3542) ≥ 4.6:1 erreicht (WCAG AA + Marge). Hue/Saettigung
 * bleiben — die Marke bleibt erkennbar. Schon helle Marken bleiben unveraendert. null bei nicht
 * parsebarer Farbe (dann kein Dark-Override → Basis-Token greift).
 */
function darkModePrimary(brand: string): string | null {
  const rgb = parseColor(brand);
  if (!rgb) return null;
  const [h, s, l0] = rgbToHsl(rgb);
  const bgLum = relLuminance([46, 53, 66]);
  let l = l0;
  for (let i = 0; i <= 60; i += 1) {
    l = Math.min(0.9, l0 + i * 0.01);
    const lum = relLuminance(hslToRgb(h, s, l));
    const ratio = (Math.max(lum, bgLum) + 0.05) / (Math.min(lum, bgLum) + 0.05);
    if (ratio >= 4.6 || l >= 0.9) break;
  }
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

/** Baut die CSS-Custom-Property-Overrides aus einem Theme (nur gesetzte Werte). */
export function themeToCssVars(theme: KommuneTheme): Record<string, string> {
  const b = theme.brand ?? {};
  const vars: Record<string, string> = {};
  if (b.primary) {
    vars["--primary"] = b.primary;
    // Nur setzen, wenn ein konkreter Wert vorliegt — sonst bleibt der Default-Token (kein var()-Fallback).
    const fg = b.primaryForeground ?? pickForeground(b.primary);
    if (fg) vars["--primary-foreground"] = fg;
    vars["--ring"] = b.ring ?? b.primary;
  }
  if (b.accent) {
    vars["--accent"] = b.accent;
    const accentFg = b.accentForeground ?? pickForeground(b.accent);
    if (accentFg) vars["--accent-foreground"] = accentFg;
  }
  if (b.surface) vars["--surface"] = b.surface;
  if (b.rail) vars["--rail"] = b.rail;
  return vars;
}

/**
 * Wendet ein Theme auf ein Element an (Default: <html>) — für ganzseitiges Theming.
 *
 * Nicht-Primary-Marken-Variablen (accent/surface/rail) werden inline gesetzt (unverändertes
 * Verhalten). Das Primary-Trio (--primary/-foreground/--ring) läuft über ein injiziertes
 * Stylesheet mit :root- UND .dark-Regeln: inline würde die .dark-Regel per Inline-Spezifität
 * schlagen, sodass kein theme-abhängiger Wert möglich wäre. Im Dark-Mode wird die Marken-Primary
 * aufgehellt (darkModePrimary), damit sie als text-primary auf dunklen Flächen lesbar bleibt
 * (BITV-AA) — sonst blieb die dunkle Markenfarbe als Text auf dunkler Card bei ~1.95:1.
 */
export function applyKommuneTheme(
  theme: KommuneTheme,
  target?: HTMLElement,
): () => void {
  const el =
    target ??
    (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return () => undefined;
  const vars = themeToCssVars(theme);
  const PRIMARY_KEYS = new Set(["--primary", "--primary-foreground", "--ring"]);
  const inlineKeys: string[] = [];
  for (const [k, v] of Object.entries(vars)) {
    if (PRIMARY_KEYS.has(k)) continue;
    el.style.setProperty(k, v);
    inlineKeys.push(k);
  }
  let styleEl: HTMLStyleElement | null = null;
  const primary = vars["--primary"];
  const doc =
    el.ownerDocument ?? (typeof document !== "undefined" ? document : null);
  if (primary && doc) {
    const fg = vars["--primary-foreground"];
    const ring = vars["--ring"] ?? primary;
    const rules = [
      `:root{--primary:${primary};${fg ? `--primary-foreground:${fg};` : ""}--ring:${ring}}`,
    ];
    const dark = darkModePrimary(primary);
    if (dark) {
      const darkFg = pickForeground(dark) ?? "#0b0b0b";
      rules.push(
        `.dark{--primary:${dark};--primary-foreground:${darkFg};--ring:${dark}}`,
      );
    }
    styleEl = doc.createElement("style");
    styleEl.setAttribute("data-kommune-theme", "");
    styleEl.textContent = rules.join("");
    doc.head.appendChild(styleEl);
  }
  return () => {
    for (const k of inlineKeys) el.style.removeProperty(k);
    styleEl?.remove();
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
export function KommuneThemeProvider({
  theme,
  children,
  global = true,
}: KommuneThemeProviderProps) {
  React.useEffect(() => {
    if (!global || !theme) return;
    return applyKommuneTheme(theme);
  }, [global, theme]);

  return (
    <KommuneThemeContext.Provider value={theme ?? null}>
      {children}
    </KommuneThemeContext.Provider>
  );
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
export function KommuneLogo({
  logo,
  height = 40,
  className,
}: KommuneLogoProps) {
  const theme = useKommuneTheme();
  const asset = logo ?? theme?.logo;
  if (!asset) return null;
  const provenance = theme?.quelle?.url
    ? `Quelle: ${theme.quelle.url}`
    : undefined;
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
    <a
      href={asset.href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center"
    >
      {img}
    </a>
  ) : (
    img
  );
}
