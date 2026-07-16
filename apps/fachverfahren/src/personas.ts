// personas — die Client-Logik der ARBEITSBEREICHE (Personas) als PURE Funktionen
// (Muster landing-state.ts, tests/personas.test.ts). Personas steuern NUR das
// Produkt-Erlebnis (Navigation, sichtbare Sichten) — sie sind KEINE Autorisierung;
// die trifft der Server über Workspace-Permissions.
import {
  mergePersonas,
  type LeistungConfig,
  type Persona,
  type PersonaDescriptor,
} from "@senticor/fachverfahren-kit";
import type { SessionCapabilities, SessionPrincipal } from "./session-state.js";

/** Kanonische Reihenfolge — identisch zu USER_PERSONAS im Store-Paket. */
export const PERSONA_KEYS: readonly Persona[] = [
  "buerger",
  "sachbearbeitung",
  "aufsicht",
];

/** Home-Route je Arbeitsbereich (URL bleibt die Wahrheit über die aktive Persona) — die ROUTEN-KONVENTION dieser App
 *  (routes.tsx montiert genau diese Präfixe). Sie ist der FALLBACK: trägt ein Config-Persona eine eigene `home`, führt
 *  DIESE (die Config ist die eine Wahrheit); nur wo sie fehlt, greift die Konvention. */
export const PERSONA_HOME: Record<Persona, string> = {
  buerger: "/buerger",
  sachbearbeitung: "/amt",
  aufsicht: "/aufsicht",
};

/** Die Home-Route eines Arbeitsbereichs AUS DER CONFIG (fällt auf die App-Routen-Konvention zurück). Eine Route muss
 *  absolut sein (`/…`) — sonst wäre sie kein montierbarer Einstieg und wird ignoriert (fail-open statt toter Link). */
export function personaRoute(
  persona: Persona,
  config: Pick<LeistungConfig, "personas">,
): string {
  const home = config.personas?.find((p) => p.key === persona)?.home?.trim();
  return home?.startsWith("/") ? home : PERSONA_HOME[persona];
}

/** Zugewiesene Arbeitsbereiche des Principals — capability-gesteuerter Fallback:
 *  NUR ein Alt-Server OHNE userPersonas-Capability bekommt den Legacy-Fallback
 *  „alle drei" (rollendes Upgrade); meldet der Server die Capability und liefert
 *  trotzdem keine personas, gilt fail closed LEER — ein Server-Bug darf nicht
 *  alle Sichten aufreißen. Unbekannte Werte werden gefiltert. */
export function allowedPersonas(
  principal: SessionPrincipal | null,
  capabilities: SessionCapabilities | undefined,
): Persona[] {
  if (!principal) return [];
  if (principal.personas === undefined) {
    return capabilities?.userPersonas === true ? [] : [...PERSONA_KEYS];
  }
  return PERSONA_KEYS.filter((persona) =>
    principal.personas?.includes(persona),
  );
}

/** Wohin nach Login/Bounce? Erster zugewiesener Arbeitsbereich (kanonische
 *  Reihenfolge) → sonst der Boards-Workspace NUR mit boards.collaborate →
 *  sonst die Landing (zeigt den Null-Arbeitsbereiche-Hinweis). */
export function personaHome(
  allowed: readonly Persona[],
  permissions: readonly string[] | undefined,
  config: Pick<LeistungConfig, "personas"> = {},
): string {
  const first = PERSONA_KEYS.find((persona) => allowed.includes(persona));
  if (first) return personaRoute(first, config);
  if (permissions?.includes("boards.collaborate")) return "/boards";
  return "/";
}

/** Descriptor-Liste für die Shell: die Config-Personas (verfahrensspezifische Labels) PER KEY über die Kit-Defaults
 *  gelegt (mergePersonas — ein TEIL-Modell lässt die übrigen Arbeitsbereiche generisch stehen statt sie zu
 *  verschlucken), gefiltert auf die zugewiesenen Keys — bei ≤1 Eintrag blendet die Shell den Wechsler aus. */
export function personaDescriptors(
  allowed: readonly Persona[],
  config: Pick<LeistungConfig, "personas">,
): PersonaDescriptor[] {
  return mergePersonas(config.personas).filter((descriptor) =>
    allowed.includes(descriptor.key),
  );
}

/** Ein Bereichs-Einstieg der Landing. */
export interface Bereich {
  href: string;
  label: string;
  beschreibung: string;
  /** Arbeitsbereich-Einstieg (persona-gefiltert) — fehlt bei Workspace-Einstiegen (Boards). */
  persona?: Persona;
  /** Permission-gegateter Workspace-Einstieg (echte Daten) — fehlt bei Arbeitsbereichen. */
  permission?: string;
}

/** Die Workspace-Einstiege der Landing, die KEINE Arbeitsbereiche sind: Boards ist ein permission-gegateter
 *  Team-Workspace mit ECHTEN Daten, keine Persona-Sicht des Verfahrens — er lebt daher außerhalb von `config.personas`
 *  (die Personas-Wahrheit soll ihn nicht kennen müssen). */
const WORKSPACE_BEREICHE: readonly Bereich[] = [
  {
    href: "/boards",
    label: "Boards",
    beschreibung: "Team-Arbeitsbereich mit echten Arbeitsdaten",
    permission: "boards.collaborate",
  },
];

/** DIE BEREICHS-EINSTIEGE DER LANDING — abgeleitet aus DER EINEN WAHRHEIT `config.personas` (die die Fabrik aus dem
 *  Personas-Artefakt des Fachkonzepts schreibt), NICHT aus einem hartkodierten Bereichs-Array. So zeigt die Landing die
 *  Arbeitsbereiche DIESES Verfahrens („Antragsteller:in — Gewerbe an-/um-/abmelden…") statt der generischen
 *  Kit-Rollen — genau der beanstandete generische Start-Screen.
 *
 *  FAIL-OPEN (per Key, s. mergePersonas): fehlt `config.personas` (unveränderte Vorlage / Alt-App), greifen die
 *  generischen DEFAULT_PERSONAS; ist nur EIN Arbeitsbereich abgeleitet, bleiben die übrigen generisch stehen — sie
 *  verschwinden NICHT (ihre Routen sind montiert, ihre Rollen zuweisbar). Reihenfolge = kanonisch. */
export function personaBereiche(
  config: Pick<LeistungConfig, "personas">,
): Bereich[] {
  const aus = mergePersonas(config.personas).map((descriptor) => ({
    href: personaRoute(descriptor.key, config),
    label: descriptor.label,
    // Beschreibung aus den DATEN: explizite `beschreibung` > `sub` (Untertitel/Ziel) > neutraler Hinweis.
    beschreibung:
      descriptor.beschreibung ?? descriptor.sub ?? "Arbeitsbereich öffnen",
    persona: descriptor.key,
  }));
  return [...aus, ...WORKSPACE_BEREICHE];
}

/** Die SICHTBAREN Bereichs-Einstiege: unangemeldet alle (jeder Klick bounct durchs Session-Gate), angemeldet gefiltert
 *  auf die zugewiesenen Arbeitsbereiche + die Workspace-Permissions des Kontos. */
export function sichtbareBereiche(
  bereiche: readonly Bereich[],
  angemeldet: boolean,
  principal: SessionPrincipal | null,
  capabilities: SessionCapabilities | undefined,
): Bereich[] {
  if (!angemeldet) return [...bereiche];
  const allowed = allowedPersonas(principal, capabilities);
  return bereiche.filter((bereich) => {
    if (bereich.persona) return allowed.includes(bereich.persona);
    if (bereich.permission)
      return !!principal?.permissions?.includes(bereich.permission);
    return true;
  });
}
