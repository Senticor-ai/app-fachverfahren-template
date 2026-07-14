// route-gates — die abgenommene KLASSIFIZIERUNG aller App-Routen (Pfad → Gate), bewusst
// als PURES Datenmodul ohne React-Importe: tests/route-gating.guard.test.ts importiert
// diese Tabelle direkt und prüft den Vertrag strukturell. Eine neue Route entsteht hier
// (Gate) und in routes.tsx (Sicht) — sonst nirgends.
import {
  permissionGate,
  personaGate,
  publicGate,
  sessionGate,
  type AppRouteGate,
} from "./route-definition.js";

export const routeGates = {
  // Landing und Erklärung sind öffentliche Inhalte; /login bleibt nur ein Alias.
  "/": publicGate,
  "/login": publicGate,
  "/barrierefreiheit": publicGate,
  // Arbeitsbereichs-Gates (nur Erlebnis/Navigation, keine Autorisierung).
  "/buerger": personaGate("buerger"),
  "/buerger/anmelden": personaGate("buerger"),
  "/buerger/bestaetigung/:id": personaGate("buerger"),
  "/amt": personaGate("sachbearbeitung"),
  "/amt/vorgang/:id": personaGate("sachbearbeitung"),
  "/aufsicht": personaGate("aufsicht"),
  // Team-Workspace: echte Autorisierung (Permission), Redirect-Ziel "/" —
  // /boards als Fallback ergäbe hier eine Schleife.
  "/boards": permissionGate("boards.collaborate", "/"),
  "/boards/:boardId": permissionGate("boards.collaborate", "/"),
  // Nur-Session: /admin/users trägt seine users.manage-Prüfung IN der Sicht
  // (Fallback /boards — als Routen-Gruppe entstünde dieselbe Schleifen-Gefahr nicht,
  // aber der Fallback unterscheidet sich vom Boards-Gate).
  "/admin/users": sessionGate,
  "/konto/passwort": sessionGate,
} as const satisfies Record<string, AppRouteGate>;

export type AppRoutePath = keyof typeof routeGates;
