// fachverfahren-kit/lib/ki-steuerung — die reine PRÄFERENZ-Schicht der KI-Steuerung („der Mensch schaltet die KI").
//
// Trennt SAUBER zwei Ebenen: die `LeistungConfig.ki` beschreibt, WAS ein Verfahren an KI ANBIETET (Angebot +
// Autonomie-Obergrenze) — die `KiSteuerung` beschreibt, was der/die Bearbeiter:in davon zur Laufzeit AKTIVIERT.
// Effektiv sichtbar/wirksam ist ein KI-Feature nur, wenn BEIDES zusammenkommt: das Verfahren bietet es an UND der
// Mensch hat es eingeschaltet. `humanOversight` ist dabei ein LITERAL `true` — im Typ unabschaltbar: die Freigabe
// durch einen Menschen bleibt strukturell erzwungen (Art. 14 EU-AI-Act, Human-in-the-Loop). Der Mensch kann die
// Autonomie-Schwelle zudem nur STRENGER stellen (siehe `effektiveSchwelle`), nie lockerer.
//
// Rein (kein React/DOM/Netz/Date/Random), damit die Ableitung deterministisch testbar ist. Vendor-neutral, keine
// Domänen-Literale — Feature-Schlüssel und Transparenz-Stufen sind generische Verwaltungs-Begriffe.
import type { LeistungConfig } from "../types.js";

/** Die vier steuerbaren KI-Fähigkeiten. `assist`/`chat`/`voice` spiegeln die `LeistungConfig.ki`-Teil-Configs;
 *  `extraktion` bezieht sein Angebot NICHT aus `config.ki`, sondern aus dem Vorhandensein eines Extraktions-Ports/
 *  Uploads (ein einfaches boolean-Flag im Aufruf). */
export type KiFeature = "assist" | "extraktion" | "chat" | "voice";

/** Transparenz-TIEFE der KI-Kennzeichnung (Art. 50 EU-AI-Act): nur Kennzeichnung (`minimal`), Kennzeichnung +
 *  Quelle + Konfidenz (`standard`) oder zusätzlich Begründung/Fundstellen (`ausfuehrlich`). */
export type TransparenzLevel = "minimal" | "standard" | "ausfuehrlich";

/** Das KI-ANGEBOT eines Verfahrens = die (nicht-optionale Form der) `ki`-Teil-Config: Quelle der anbietbaren
 *  Features (`assist`/`chat`/`voice`) und der Autonomie-Obergrenze (`assist.maxSchwelleAutonom`). */
export type KiAngebot = NonNullable<LeistungConfig["ki"]>;

/**
 * Die Präferenz des Menschen über die KI. `aktiv` ist der Hauptschalter (aus ⇒ NICHTS wirksam); `features` schaltet
 * je Fähigkeit; `schwelleAutonom` ist eine OPTIONALE, nur verschärfende Autonomie-Schwelle; `transparenzLevel`
 * steuert die Kennzeichnungs-Tiefe. `humanOversight` ist das Literal `true` — es kann im Typ nicht auf `false`
 * gesetzt werden, die menschliche Aufsicht bleibt unabschaltbar.
 */
export interface KiSteuerung {
  /** Hauptschalter: ist er aus, ist KEIN Feature wirksam (unabhängig von `features`). */
  aktiv: boolean;
  /** Je Fähigkeit an/aus — wirksam nur, wenn das Verfahren die Fähigkeit auch anbietet. */
  features: { assist: boolean; extraktion: boolean; chat: boolean; voice: boolean };
  /** OPTIONALE, nur VERSCHÄRFENDE Autonomie-Schwelle (0..1). Wirksam wird `max(diese, config.assist.maxSchwelleAutonom)`
   *  — der Mensch kann nur strenger (höher), nie lockerer stellen. Fehlt sie ⇒ es gilt allein die Config-Obergrenze. */
  schwelleAutonom?: number;
  /** Tiefe der KI-Kennzeichnung/Transparenz gegenüber Bürger:in und Prüfsicht. */
  transparenzLevel: TransparenzLevel;
  /** LITERAL `true` — die menschliche Freigabe ist strukturell erzwungen und im Typ nicht abschaltbar. */
  humanOversight: true;
}

/**
 * Der sichere DEFAULT: Hauptschalter an, Assistenz/Extraktion/Chat aktiv, Spracheingabe (Mikrofon) bewusst AUS
 * (Datenschutz — der Mensch aktiviert sie gezielt), Standard-Transparenz, KEINE eigene Schwelle (es gilt die
 * Config-Obergrenze), `humanOversight` immer `true`. Alle Features bleiben durch die Config gegated — ein hier
 * „an"-Feature ist nur wirksam, wenn das Verfahren es auch anbietet (siehe `istFeatureAktiv`).
 */
export function defaultKiSteuerung(): KiSteuerung {
  return {
    aktiv: true,
    features: { assist: true, extraktion: true, chat: true, voice: false },
    transparenzLevel: "standard",
    humanOversight: true,
  };
}

/**
 * Bietet das Verfahren dieses Feature an? Für `assist`/`chat`/`voice` = die jeweilige `config.ki`-Teil-Config ist
 * gesetzt; für `extraktion` = das übergebene `extraktionVerfuegbar`-Flag (das Verfahren hat einen Extraktions-Port/
 * Upload). Reine Angebots-Frage — OHNE Rücksicht auf die menschliche Steuerung.
 */
export function featureAngeboten(
  feature: KiFeature,
  config?: KiAngebot,
  extraktionVerfuegbar = false,
): boolean {
  if (feature === "extraktion") return extraktionVerfuegbar;
  return config?.[feature] != null;
}

/**
 * Ist ein KI-Feature EFFEKTIV wirksam/sichtbar? Genau dann, wenn ALLE drei Bedingungen gelten:
 *  1. das Verfahren bietet es an (`featureAngeboten`),
 *  2. der Hauptschalter ist an (`steuerung.aktiv`),
 *  3. das Feature ist einzeln eingeschaltet (`steuerung.features[feature]`).
 * Damit gated JEDER Port-Aufruf verlässlich an EINER Stelle.
 */
export function istFeatureAktiv(
  steuerung: KiSteuerung,
  feature: KiFeature,
  config?: KiAngebot,
  extraktionVerfuegbar = false,
): boolean {
  return (
    featureAngeboten(feature, config, extraktionVerfuegbar) &&
    steuerung.aktiv &&
    steuerung.features[feature]
  );
}

/**
 * Die EFFEKTIVE Autonomie-Schwelle: `max(config.assist.maxSchwelleAutonom, steuerung.schwelleAutonom)` (fehlende
 * Werte zählen als 0). Der Mensch kann nur STRENGER stellen — eine niedrigere menschliche Schwelle wird durch das
 * Maximum von der Config-Obergrenze „nach oben gehalten". Unterhalb dieser Schwelle bleibt die menschliche Freigabe
 * zwingend (`humanOversight`).
 */
export function effektiveSchwelle(steuerung: KiSteuerung, config?: KiAngebot): number {
  return Math.max(
    config?.assist?.maxSchwelleAutonom ?? 0,
    steuerung.schwelleAutonom ?? 0,
  );
}
