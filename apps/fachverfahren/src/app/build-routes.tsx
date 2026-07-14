// build-routes — leitet den react-router-Baum aus den Deskriptoren AB: öffentliche Routen
// vor dem Gate, GENAU EIN RequireSessionOutlet als Layout-Route, darin die Arbeitsbereichs-
// Gruppen (ein RequirePersonaExperience pro Persona), die Permission-Gruppen (ein
// RequirePermissionOutlet pro Permission+Fallback) und die Nur-Session-Routen; am Ende der
// Catch-all → Landing. Der Vertrag ist strukturell getestet
// (tests/route-gating.guard.test.ts inspiziert den gebauten Baum, kein DOM-Rendering).
import { Navigate, Route } from "react-router-dom";
import type { Persona } from "@senticor/fachverfahren-kit";
import {
  RequirePermissionOutlet,
  RequirePersonaExperience,
  RequireSessionOutlet,
} from "./guards.js";
import type { AppRouteDefinition } from "./route-definition.js";

function leaf(route: AppRouteDefinition): React.JSX.Element {
  return <Route key={route.path} path={route.path} element={route.element} />;
}

export function buildAppRouteChildren(
  routes: readonly AppRouteDefinition[],
): React.JSX.Element[] {
  const publicRoutes: AppRouteDefinition[] = [];
  const sessionRoutes: AppRouteDefinition[] = [];
  const personaGroups = new Map<Persona, AppRouteDefinition[]>();
  const permissionGroups = new Map<
    string,
    { permission: string; fallbackTo: string; routes: AppRouteDefinition[] }
  >();
  for (const route of routes) {
    switch (route.gate.kind) {
      case "public":
        publicRoutes.push(route);
        break;
      case "session":
        sessionRoutes.push(route);
        break;
      case "persona": {
        const group = personaGroups.get(route.gate.persona) ?? [];
        group.push(route);
        personaGroups.set(route.gate.persona, group);
        break;
      }
      case "permission": {
        const key = `${route.gate.permission}\t${route.gate.fallbackTo}`;
        const group = permissionGroups.get(key) ?? {
          permission: route.gate.permission,
          fallbackTo: route.gate.fallbackTo,
          routes: [],
        };
        group.routes.push(route);
        permissionGroups.set(key, group);
        break;
      }
    }
  }
  return [
    ...publicRoutes.map(leaf),
    <Route key="session-gate" element={<RequireSessionOutlet />}>
      {[...personaGroups.entries()].map(([persona, group]) => (
        <Route
          key={`persona:${persona}`}
          element={<RequirePersonaExperience persona={persona} />}
        >
          {group.map(leaf)}
        </Route>
      ))}
      {[...permissionGroups.entries()].map(([key, group]) => (
        <Route
          key={`permission:${key}`}
          element={
            <RequirePermissionOutlet
              permission={group.permission}
              fallbackTo={group.fallbackTo}
            />
          }
        >
          {group.routes.map(leaf)}
        </Route>
      ))}
      {sessionRoutes.map(leaf)}
    </Route>,
    <Route key="fallback" path="*" element={<Navigate to="/" replace />} />,
  ];
}
