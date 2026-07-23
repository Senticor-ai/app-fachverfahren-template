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
  // Die Landing ist die EINZIGE unauthentifizierte Route; /login bleibt nur als Alias
  // für Bookmarks und Doku bestehen.
  "/": publicGate,
  "/login": publicGate,
  // Doku-Wiki: die komplette Repo-Doku im laufenden Template — oeffentlich (Doku ist nicht sensibel),
  // fuer Mensch UND KI-Agent. Lazy geladen (grosses Manifest).
  "/hilfe": publicGate,
  // Arbeitsbereichs-Gates (nur Erlebnis/Navigation, keine Autorisierung).
  "/buerger": personaGate("buerger"),
  "/buerger/anmelden": personaGate("buerger"),
  "/buerger/bestaetigung/:id": personaGate("buerger"),
  // „Meine Anträge": die eigenen, server-persistierten Vorgänge — Liste + Status-Detail.
  "/buerger/antraege": personaGate("buerger"),
  "/buerger/antrag/:id": personaGate("buerger"),
  // Der eigene, eingefrorene Bescheid (owner-scoped; Abruf = Bekanntgabe).
  "/buerger/bescheid/:id": personaGate("buerger"),
  // Das eigene Postfach: Bescheide/Nachrichten der Behörde (owner-scoped).
  "/buerger/postfach": personaGate("buerger"),
  "/amt": personaGate("sachbearbeitung"),
  "/amt/vorgang/:id": personaGate("sachbearbeitung"),
  // Fall/Dossier-Sicht (ADR-0001): Akten-Liste + 360°-Detail über der Fall/Task-API.
  "/amt/akten": personaGate("sachbearbeitung"),
  "/amt/akte/:id": personaGate("sachbearbeitung"),
  // Verfahrens-Wiki: generelles Wissen + Fähigkeiten EINES Verfahrens (verfahrens-scoped).
  "/amt/verfahren/:procedureId/:version/wiki": personaGate("sachbearbeitung"),
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
