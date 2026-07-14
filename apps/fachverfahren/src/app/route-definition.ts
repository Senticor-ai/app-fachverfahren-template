// route-definition — der Routen-Deskriptor-VERTRAG der App (Issue #35): jede Route
// deklariert ihren Pfad, ihr Gate und ihre Sicht an EINER Stelle (routes.tsx); der
// Baum-Bau (Gruppierung unter dem einen Session-Gate) ist daraus ABGELEITET
// (build-routes.tsx) — Deklaration und Durchsetzung teilen dieselbe Quelle, wie beim
// Server-Muster routeAuth/bffRouteAuth. Laufzeit-pur bis auf Typ-Importe — die
// Gate-Tabelle (route-gates.ts) bleibt dadurch ohne React-Rendering testbar.
import type { Persona } from "@senticor/fachverfahren-kit";

export type AppRouteGate =
  | { kind: "public" }
  | { kind: "session" }
  | { kind: "persona"; persona: Persona }
  | { kind: "permission"; permission: string; fallbackTo: string };

export interface AppRouteDefinition {
  path: string;
  gate: AppRouteGate;
  element: React.JSX.Element;
}

export const publicGate: AppRouteGate = { kind: "public" };
export const sessionGate: AppRouteGate = { kind: "session" };

export function personaGate(persona: Persona): AppRouteGate {
  return { kind: "persona", persona };
}

export function permissionGate(
  permission: string,
  fallbackTo: string,
): AppRouteGate {
  return { kind: "permission", permission, fallbackTo };
}
