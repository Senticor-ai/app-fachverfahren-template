// fachverfahren-kit/hooks/useTheme — Hell/Dunkel/System als getypter Zustand + Klasse „dark" an <html>.
//
// styles.css nutzt `@custom-variant dark (&:is(.dark *))` — dieser Hook ist der Schalter dafür: bei „system" folgt er
// `prefers-color-scheme` (und reagiert live auf Systemwechsel), sonst der expliziten Wahl. Er setzt/entfernt genau die
// Klasse „dark" auf `document.documentElement` und persistiert die Wahl in `localStorage`. SSR-/Test-sicher (jeder
// window/document/matchMedia/localStorage-Zugriff ist defensiv geguardet). GENERISCH, dep-frei (nur React).
import * as React from "react";

/** Die Nutzer-Wahl: explizit hell/dunkel oder der Systemeinstellung folgen. */
export type Theme = "light" | "dark" | "system";

/** Das effektiv angewandte Schema (System aufgelöst). */
export type ResolvedTheme = "light" | "dark";

const SPEICHER_SCHLUESSEL = "fv-theme";

/** Liest die gespeicherte Wahl defensiv (SSR/Test-sicher); Default „system". */
function leseGespeichert(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const w = window.localStorage.getItem(SPEICHER_SCHLUESSEL);
    if (w === "light" || w === "dark" || w === "system") return w;
  } catch {
    /* Speicher nicht verfügbar */
  }
  return "system";
}

/** Fragt die Systemeinstellung ab (SSR/Test-sicher; ohne matchMedia gilt „hell"). */
function systemIstDunkel(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

export interface UseThemeResult {
  /** Die Nutzer-Wahl (light | dark | system). */
  theme: Theme;
  /** Das effektiv angewandte Schema (System aufgelöst) — für Icons/Ansagen. */
  resolvedTheme: ResolvedTheme;
  /** Setzt die Wahl (persistiert). */
  setTheme: (theme: Theme) => void;
}

/**
 * Verwaltet das Farbschema: initialisiert aus localStorage, verfolgt den Systemwert (für „system"), leitet daraus das
 * effektive Schema ab und spiegelt es als Klasse „dark" an <html>.
 */
export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = React.useState<Theme>(() => leseGespeichert());
  const [systemDunkel, setSystemDunkel] = React.useState<boolean>(() =>
    systemIstDunkel(),
  );

  // Systemwechsel live verfolgen (nur bei „system" wirksam, aber das Lauschen ist günstig und robust).
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDunkel(e.matches);
    // Moderner Weg; ältere Safari kennen nur add/removeListener.
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, []);

  const resolvedTheme: ResolvedTheme =
    theme === "system" ? (systemDunkel ? "dark" : "light") : theme;

  // Effektives Schema → Klasse „dark" an <html> (defensiv für SSR/Test).
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SPEICHER_SCHLUESSEL, next);
    } catch {
      /* Speicher nicht verfügbar — Wahl gilt für die Sitzung. */
    }
  }, []);

  return { theme, resolvedTheme, setTheme };
}
