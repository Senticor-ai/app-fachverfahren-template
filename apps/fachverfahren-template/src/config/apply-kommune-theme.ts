// apply-kommune-theme — wendet das (verifizierte) kommunale Design aus runtime-config.json an.
//
// Der governte Build übernimmt Markenfarben + Wappen aus dem Fachkonzept (EINE Quelle) und schreibt sie als
// `theme` ins runtime-config.json. Hier werden die Farben als CSS-Custom-Properties gesetzt — die App wird zur
// Marke der Kommune, ohne Komponenten-Eingriff. Generisch über jede Kommune.
//
// HINWEIS (Token-Plumbing): die App löst Farben über die RESOLVED `--color-*`-Tokens auf (`--color-primary:
// hsl(var(--primary))`, Basis-Token im HSL-Kanal-Format). Ein Hex-Override auf `--primary` würde `hsl(#…)` =
// ungültig erzeugen — deshalb überschreiben wir direkt die `--color-*`-Tokens mit den Markenfarben (beliebige
// gültige CSS-Farbe). Das Theme-DATUM (Hex aus dem Fachkonzept) ist die eine Wahrheit; die Anwendung adaptiert
// an das Token-Plumbing dieser App (im fachverfahren-kit liegt die spiegelbildliche KommuneTheme-Komponente).

export interface RuntimeKommuneTheme {
  name?: string;
  quelle?: { url?: string; verifiziert?: boolean };
  brand?: { primary?: string; accent?: string; ring?: string };
  logo?: { src?: string; alt?: string };
}

/** Parst #rgb/#rrggbb/rgb()/rgba() → [r,g,b] (0..255) oder null. */
function parseColor(c: string): [number, number, number] | null {
  const s = c.trim();
  const hex = s.replace(/^#/, "");
  const m3 = /^([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(hex);
  if (m3)
    return [
      parseInt(m3[1]! + m3[1]!, 16),
      parseInt(m3[2]! + m3[2]!, 16),
      parseInt(m3[3]! + m3[3]!, 16),
    ];
  const m6 = /^([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (m6)
    return [parseInt(m6[1]!, 16), parseInt(m6[2]!, 16), parseInt(m6[3]!, 16)];
  const m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Wählt kontrast-sicheren Vordergrund (schwarz/weiß) nach relativer Luminanz (WCAG / BITV-AA). */
function pickForeground(bg: string): string | null {
  const rgb = parseColor(bg);
  if (!rgb) return null;
  const lin = (v: number): number => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  return luminance > 0.4 ? "#0b0b0b" : "#ffffff";
}

/** Setzt die Markenfarben als CSS-Custom-Properties (resolved `--color-*`). No-op ohne brand/Document. */
export function applyKommuneTheme(
  theme: RuntimeKommuneTheme | null | undefined,
): void {
  if (!theme?.brand || typeof document === "undefined") return;
  const root = document.documentElement;
  const b = theme.brand;
  if (b.primary) {
    root.style.setProperty("--color-primary", b.primary);
    const fg = pickForeground(b.primary);
    if (fg) {
      root.style.setProperty("--color-primary-fg", fg);
      root.style.setProperty("--color-primary-foreground", fg);
    }
    root.style.setProperty("--color-ring", b.ring ?? b.primary);
  }
  if (b.accent) root.style.setProperty("--color-accent", b.accent);
}

/**
 * Lädt runtime-config.json (roh, vor dem getypten Merge) und wendet ein vorhandenes Theme früh an —
 * VOR dem ersten Render, damit kein Farb-Flash entsteht. Best-effort, schlägt nie hart fehl.
 */
export async function bootKommuneTheme(): Promise<void> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}runtime-config.json`, {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!r.ok) return;
    const raw = (await r.json()) as { theme?: RuntimeKommuneTheme };
    applyKommuneTheme(raw.theme ?? null);
  } catch {
    /* Default-Theme bleibt */
  }
}
