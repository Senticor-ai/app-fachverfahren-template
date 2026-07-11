// portale — die PORTAL-Registry (Skalierungsplan #21): „mehrere Bürger-Applikationen aus EINER Verfahrens-Registry".
//
// Ein PORTAL ist eine eigenständige Bürger-/Amts-Anwendung über der gemeinsamen `verfahren.registry`: es bündelt die
// bisher VERSTREUTEN Portal-Knöpfe — die Verfahren-Teilmenge (bisher nur `VITE_ENABLED_PROCEDURES`), die Marke/das
// Wappen (bisher `portalMarke`) und die Start-Persona (bisher hart in `App.tsx`) — zu EINEM generierbaren DATA-Objekt.
// So lassen sich N Portale deklarieren und eines per `VITE_PORTAL_ID` (Build-/Runtime-Naht) auswählen: dieselbe
// Codebasis, dieselbe Registry, aber z. B. ein schlankes „Bescheinigungs-Portal" mit eigener Marke neben dem vollen
// Bürgerdienste-Portal. Rückwärtskompatibel: ohne `VITE_PORTAL_ID` gilt das erste (Default-)Portal — byte-stabil.
import type { KommuneTheme, Persona } from "@senticor/fachverfahren-kit";
import { beispielConfig } from "./leistung.config.beispiel.js";
import {
  istUnveraendertesVorlagenDemo,
  portalMarke,
} from "./verfahren.registry.js";

/** Ein Portal = eine Applikation über der Verfahrens-Registry. Alle Felder ausser id/name sind optional (Default =
 *  volles Portal): so ist der Default byte-stabil und ein generierender Build braucht nur die Marke zu ersetzen. */
export interface PortalConfig {
  /** Stabile technische Id — die Auswahl erfolgt über `VITE_PORTAL_ID`. */
  id: string;
  /** Anzeigename (Doku/Diagnose; die SICHTBARE Marke kommt aus `marke`). */
  name: string;
  /** Verfahren-Teilmenge dieses Portals (procedureIds). Fehlt ⇒ ALLE Verfahren der Registry. */
  enabledProcedures?: string[];
  /** Build-Zeit-Marke (Wappen/Farbe). Fehlt ⇒ Default `portalMarke`. Ein Server-`APP_BRAND_*` schlägt sie zur Laufzeit. */
  marke?: KommuneTheme;
  /** Start-Persona (Landing an „/"). Fehlt ⇒ „buerger". */
  startPersona?: Persona;
}

/** Das Default-Portal: der volle Bürgerdienste-Zugang über ALLE Verfahren mit der Standard-Marke. Byte-stabil zum
 *  bisherigen Verhalten (kein `enabledProcedures` ⇒ alle; `portalMarke`; Start „buerger"). */
const buergerdienste: PortalConfig = {
  id: "buergerdienste",
  name: portalMarke.name ?? "Bürgerdienste",
  marke: portalMarke,
  startPersona: "buerger",
};

/** 2. DEMO-Portal (nur im unveränderten Vorlagen-Zustand): ein schlankes Portal über NUR dem Bescheinigungs-Verfahren
 *  mit EIGENER Marke — belegt live, dass mehrere Bürger-Apps aus einer Registry entstehen. Ein generierender Build
 *  (echte Verfahren-id) lässt es automatisch weg. SYNTHETISCH: die Marke ist kein echtes Hoheitszeichen. */
const bescheinigungsPortal: PortalConfig = {
  id: "bescheinigungen",
  name: "Bescheinigungen Musterstadt (Demo)",
  enabledProcedures: [beispielConfig.id],
  marke: {
    name: "Bescheinigungen Musterstadt",
    // Deutlich anderer Farbton (Indigo) als das Default-Portal (Teal) — sichtbarer White-Label-Beleg je Portal.
    brand: { primary: "hsl(245 58% 51%)" },
    logo: {
      src: `${import.meta.env.BASE_URL}demo-wappen.svg`,
      alt: "Wappen Bescheinigungen Musterstadt (Demo)",
    },
  },
  startPersona: "buerger",
};

/** Die deklarierten Portale. Das erste ist der Default. Das Demo-Portal erscheint nur in der unveränderten Vorlage. */
export const portale: PortalConfig[] = [
  buergerdienste,
  ...(istUnveraendertesVorlagenDemo ? [bescheinigungsPortal] : []),
];

/** Wählt das Portal per Id (fail-safe: unbekannte/leere Id ⇒ Default-Portal — nie ein leeres/kaputtes Portal). */
export function waehlePortal(id: string | undefined): PortalConfig {
  if (id) {
    const treffer = portale.find((p) => p.id === id);
    if (treffer) return treffer;
  }
  return portale[0]!;
}

/** Das AKTIVE Portal dieses Builds (`VITE_PORTAL_ID`, statisch zur Build-Zeit eingesetzt — wie die übrigen VITE_*-Nähte).
 *  Ohne die Variable gilt das Default-Portal (byte-stabil). */
export const aktivesPortal = waehlePortal(
  import.meta.env.VITE_PORTAL_ID as string | undefined,
);
