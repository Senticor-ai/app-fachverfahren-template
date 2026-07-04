// fachverfahren-kit/hooks/useA11ySettings — schaltet die a11y-Nutzer-Präferenzen als Klassen an <html>.
//
// Die Klassen (`large-text`, `high-contrast`, `reduce-motion`, `compact`) sind in styles.css bereits definiert; dieser
// Hook ist NUR der Schalter + die Persistenz. Er hält die vier Präferenzen als getypten Zustand, spiegelt sie auf
// `document.documentElement` und persistiert sie in `localStorage` — SSR-/Test-sicher (jeder Zugriff auf window/
// document/localStorage ist defensiv geguardet). GENERISCH, dep-frei (nur React), keine Domänen-Literale.
import * as React from "react";

/** Die vier umschaltbaren Präferenzen (1:1 zu den styles.css-Klassen). */
export interface A11ySettings {
  /** Größere Schrift (`large-text`). */
  largeText: boolean;
  /** Hoher Kontrast (`high-contrast`). */
  highContrast: boolean;
  /** Bewegung reduzieren (`reduce-motion`). */
  reduceMotion: boolean;
  /** Kompakte Darstellung (`compact`). */
  compact: boolean;
}

/** Schlüssel einer einzelnen Präferenz. */
export type A11yOption = keyof A11ySettings;

/** Zuordnung Präferenz → CSS-Klasse an <html>. EINE Wahrheit — kein verstreutes Klassen-Literal. */
const KLASSEN: Record<A11yOption, string> = {
  largeText: "large-text",
  highContrast: "high-contrast",
  reduceMotion: "reduce-motion",
  compact: "compact",
};

const STANDARD: A11ySettings = {
  largeText: false,
  highContrast: false,
  reduceMotion: false,
  compact: false,
};

const SPEICHER_SCHLUESSEL = "fv-a11y";

/** Liest die gespeicherten Präferenzen defensiv (SSR/Test-sicher, tolerant gegen defektes JSON). */
function lese(): A11ySettings {
  if (typeof window === "undefined") return { ...STANDARD };
  try {
    const roh = window.localStorage.getItem(SPEICHER_SCHLUESSEL);
    if (!roh) return { ...STANDARD };
    const geparst = JSON.parse(roh) as Partial<A11ySettings>;
    return {
      largeText: !!geparst.largeText,
      highContrast: !!geparst.highContrast,
      reduceMotion: !!geparst.reduceMotion,
      compact: !!geparst.compact,
    };
  } catch {
    return { ...STANDARD };
  }
}

export interface UseA11ySettingsResult {
  /** Der aktuelle Präferenz-Zustand. */
  settings: A11ySettings;
  /** Alle Präferenzen explizit setzen. */
  setSettings: (next: A11ySettings) => void;
  /** Eine Präferenz explizit setzen. */
  setOption: (key: A11yOption, value: boolean) => void;
  /** Eine Präferenz umschalten. */
  toggle: (key: A11yOption) => void;
  /** Auf Standarddarstellung zurücksetzen. */
  reset: () => void;
  /** Sind alle Präferenzen im Standardzustand? */
  isDefault: boolean;
}

/**
 * Verwaltet die a11y-Präferenzen: initialisiert aus localStorage, spiegelt jede Änderung als Klasse an <html> und
 * persistiert sie. Mehrfaches Mounten ist unkritisch (idempotentes classList.toggle je Präferenz).
 */
export function useA11ySettings(): UseA11ySettingsResult {
  const [settings, setSettings] = React.useState<A11ySettings>(() => lese());

  // Präferenzen → Klassen an <html> spiegeln (defensiv für SSR/Test).
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const wurzel = document.documentElement;
    (Object.keys(KLASSEN) as A11yOption[]).forEach((k) => {
      wurzel.classList.toggle(KLASSEN[k], settings[k]);
    });
  }, [settings]);

  const persistiere = React.useCallback((next: A11ySettings) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(next));
    } catch {
      /* Speicher nicht verfügbar (z. B. privater Modus) — Präferenz gilt für die Sitzung. */
    }
  }, []);

  const setAllSettings = React.useCallback(
    (next: A11ySettings) => {
      setSettings(next);
      persistiere(next);
    },
    [persistiere],
  );

  const setOption = React.useCallback(
    (key: A11yOption, value: boolean) => {
      setSettings((s) => {
        const next = { ...s, [key]: value };
        persistiere(next);
        return next;
      });
    },
    [persistiere],
  );

  const toggle = React.useCallback(
    (key: A11yOption) => {
      setSettings((s) => {
        const next = { ...s, [key]: !s[key] };
        persistiere(next);
        return next;
      });
    },
    [persistiere],
  );

  const reset = React.useCallback(() => {
    const next = { ...STANDARD };
    setSettings(next);
    persistiere(next);
  }, [persistiere]);

  const isDefault = (Object.keys(STANDARD) as A11yOption[]).every(
    (key) => settings[key] === STANDARD[key],
  );

  return {
    settings,
    setSettings: setAllSettings,
    setOption,
    toggle,
    reset,
    isDefault,
  };
}
