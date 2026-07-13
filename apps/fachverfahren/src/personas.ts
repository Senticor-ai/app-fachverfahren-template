// personas — die Client-Logik der ARBEITSBEREICHE (Personas) als PURE Funktionen
// (Muster landing-state.ts, tests/personas.test.ts). Personas steuern NUR das
// Produkt-Erlebnis (Navigation, sichtbare Sichten) — sie sind KEINE Autorisierung;
// die trifft der Server über Workspace-Permissions.
import {
  DEFAULT_PERSONAS,
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

/** Home-Route je Arbeitsbereich (URL bleibt die Wahrheit über die aktive Persona). */
export const PERSONA_HOME: Record<Persona, string> = {
  buerger: "/buerger",
  sachbearbeitung: "/amt",
  aufsicht: "/aufsicht",
};

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
): string {
  const first = PERSONA_KEYS.find((persona) => allowed.includes(persona));
  if (first) return PERSONA_HOME[first];
  if (permissions?.includes("boards.collaborate")) return "/boards";
  return "/";
}

/** Descriptor-Liste für die Shell: Config-Personas (verfahrensspezifische Labels)
 *  bzw. Kit-Defaults, gefiltert auf die zugewiesenen Keys — bei ≤1 Eintrag blendet
 *  die Shell den Wechsler aus. */
export function personaDescriptors(
  allowed: readonly Persona[],
  config: Pick<LeistungConfig, "personas">,
): PersonaDescriptor[] {
  const source = config.personas ?? DEFAULT_PERSONAS;
  return source.filter((descriptor) => allowed.includes(descriptor.key));
}
