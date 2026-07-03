// fachverfahren-kit/hooks/useKiSteuerung — persistenter Zustands-Hook für die KI-Präferenz des Menschen.
//
// Hält die `KiSteuerung` (siehe lib/ki-steuerung) und persistiert sie robust: bevorzugt in `localStorage`, mit einem
// prozessweiten In-Memory-Fallback, wenn `window`/`localStorage` fehlt oder wirft (SSR, Tests, Privatmodus). KEIN
// Netz, kein Speech/Media — reine Präferenz-Verwaltung. `humanOversight` wird beim Laden IMMER auf `true` normalisiert
// (aus dem Speicher nie abschaltbar); ein neu hinzugekommener Feature-Schlüssel wird gegen den Default aufgefüllt.
//
// Die DB-Persistenz (z. B. `UserPreferences.ki`) ist ein SPÄTERER Schritt — dieser Hook ist die client-seitige
// Wahrheit für die Laufzeit.
import * as React from "react";

import type { KiFeature, KiSteuerung, TransparenzLevel } from "../lib/ki-steuerung.js";
import { defaultKiSteuerung } from "../lib/ki-steuerung.js";

/** Speicher-Schlüssel der Präferenz (ein Eintrag je Nutzer:in/Browser). */
export const KI_STEUERUNG_STORAGE_KEY = "fv:ki-steuerung";

// ── In-Memory-Fallback: prozessweiter Halt, wenn localStorage fehlt/wirft (SSR/Test/Privatmodus) ────────────────
let memoryFallback: string | null = null;

/** Liest den rohen JSON-String — localStorage bevorzugt, sonst der In-Memory-Fallback. Wirft nie. */
function leseRoh(): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(KI_STEUERUNG_STORAGE_KEY);
    }
  } catch {
    /* localStorage nicht verfügbar/blockiert — auf Memory zurückfallen. */
  }
  return memoryFallback;
}

/** Schreibt den rohen JSON-String — localStorage bevorzugt, sonst (oder bei Fehler) in den In-Memory-Fallback. */
function schreibeRoh(wert: string): void {
  memoryFallback = wert;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(KI_STEUERUNG_STORAGE_KEY, wert);
    }
  } catch {
    /* Schreiben blockiert (Quota/Privatmodus) — der In-Memory-Fallback trägt den Wert bereits. */
  }
}

function istBoolean(w: unknown, fallback: boolean): boolean {
  return typeof w === "boolean" ? w : fallback;
}

function istTransparenz(w: unknown): w is TransparenzLevel {
  return w === "minimal" || w === "standard" || w === "ausfuehrlich";
}

/**
 * Führt einen (evtl. veralteten/manipulierten) gespeicherten Teilwert gegen den aktuellen Default zusammen: fehlende
 * Felder werden aufgefüllt, `humanOversight` bleibt IMMER `true`, `schwelleAutonom` nur, wenn es eine Zahl ist.
 */
function normalisiere(teil: Partial<KiSteuerung> | null | undefined): KiSteuerung {
  const basis = defaultKiSteuerung();
  if (!teil || typeof teil !== "object") return basis;
  return {
    aktiv: istBoolean(teil.aktiv, basis.aktiv),
    features: {
      assist: istBoolean(teil.features?.assist, basis.features.assist),
      extraktion: istBoolean(teil.features?.extraktion, basis.features.extraktion),
      chat: istBoolean(teil.features?.chat, basis.features.chat),
      voice: istBoolean(teil.features?.voice, basis.features.voice),
    },
    ...(typeof teil.schwelleAutonom === "number"
      ? { schwelleAutonom: teil.schwelleAutonom }
      : {}),
    transparenzLevel: istTransparenz(teil.transparenzLevel)
      ? teil.transparenzLevel
      : basis.transparenzLevel,
    humanOversight: true,
  };
}

/** Lädt die gespeicherte Präferenz (normalisiert) — oder `null`, wenn nichts/kaputtes gespeichert ist. */
function ladeGespeichert(): KiSteuerung | null {
  const roh = leseRoh();
  if (!roh) return null;
  try {
    return normalisiere(JSON.parse(roh) as Partial<KiSteuerung>);
  } catch {
    return null;
  }
}

/** Die Steuer-API des Hooks — kontrollierte, semantische Setter statt eines rohen `setState`. */
export interface UseKiSteuerungApi {
  /** Die aktuelle Präferenz. */
  steuerung: KiSteuerung;
  /** Ein einzelnes Feature an/aus schalten. */
  setFeature: (feature: KiFeature, on: boolean) => void;
  /** Den Hauptschalter an/aus schalten (aus ⇒ kein Feature wirksam). */
  setAktiv: (on: boolean) => void;
  /** Die Transparenz-Tiefe wählen. */
  setTransparenz: (level: TransparenzLevel) => void;
  /** Die menschliche Autonomie-Schwelle setzen; `undefined` entfernt die Verschärfung (es gilt dann die Config). */
  setSchwelle: (n: number | undefined) => void;
  /** Die gesamte Präferenz ersetzen — die Brücke zum kontrollierten Panel (`<KiSteuerungPanel onChange={ersetze} />`).
   *  Sicher, weil der Typ `KiSteuerung` `humanOversight: true` erzwingt (die Aufsicht kann nie mitgesetzt-abgeschaltet werden). */
  ersetze: (next: KiSteuerung) => void;
  /** Auf den sicheren Default zurücksetzen. */
  zuruecksetzen: () => void;
}

/**
 * Verwaltet die KI-Präferenz mit Persistenz. Der Startwert kommt (in dieser Reihenfolge) aus dem Speicher, dem
 * optionalen `initial`-Seed oder dem Default; jede Änderung wird sofort persistiert.
 *
 * @example
 * const { steuerung, setFeature, setAktiv } = useKiSteuerung();
 * const zeigeChat = istFeatureAktiv(steuerung, "chat", config.ki);
 */
export function useKiSteuerung(initial?: KiSteuerung): UseKiSteuerungApi {
  const [steuerung, setSteuerung] = React.useState<KiSteuerung>(
    () => ladeGespeichert() ?? initial ?? defaultKiSteuerung(),
  );

  // Jede Änderung persistieren (localStorage bzw. In-Memory-Fallback). Läuft nur clientseitig.
  React.useEffect(() => {
    schreibeRoh(JSON.stringify(steuerung));
  }, [steuerung]);

  const setFeature = React.useCallback((feature: KiFeature, on: boolean) => {
    setSteuerung((s) => ({
      ...s,
      features: { ...s.features, [feature]: on },
    }));
  }, []);

  const setAktiv = React.useCallback((on: boolean) => {
    setSteuerung((s) => ({ ...s, aktiv: on }));
  }, []);

  const setTransparenz = React.useCallback((level: TransparenzLevel) => {
    setSteuerung((s) => ({ ...s, transparenzLevel: level }));
  }, []);

  const setSchwelle = React.useCallback((n: number | undefined) => {
    setSteuerung((s) => {
      if (n === undefined) {
        // Verschärfung entfernen — den optionalen Schlüssel wirklich löschen (exactOptionalPropertyTypes).
        const kopie = { ...s };
        delete kopie.schwelleAutonom;
        return kopie;
      }
      return { ...s, schwelleAutonom: n };
    });
  }, []);

  const ersetze = React.useCallback((next: KiSteuerung) => {
    setSteuerung(next);
  }, []);

  const zuruecksetzen = React.useCallback(() => {
    setSteuerung(defaultKiSteuerung());
  }, []);

  return {
    steuerung,
    setFeature,
    setAktiv,
    setTransparenz,
    setSchwelle,
    ersetze,
    zuruecksetzen,
  };
}
