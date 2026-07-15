// route-gating.guard.test.ts — Vertrag des Routen-Baums: die Landing ("/") ist die EINZIGE
// unauthentifizierte Route (plus /login-Alias); ALLE Persona- und Workspace-Routen liegen
// hinter GENAU EINEM Session-Gate (RequireSessionOutlet-Layout-Route). Seit Issue #35 ist
// der Vertrag STRUKTURELL statt Quelltext-Grep: die abgenommene Klassifizierung lebt als
// pure Daten in src/app/route-gates.ts, und der aus den Deskriptoren gebaute react-router-
// Baum wird über createRoutesFromChildren inspiziert — weiterhin OHNE DOM-Rendering
// (das Repo führt bewusst keine DOM-Render-Testinfrastruktur für die App; Komponenten-
// Verhalten läuft über Storybook-/Browser-Tests des Kits).
import type { ReactElement } from "react";
import { createRoutesFromChildren, type RouteObject } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { buildAppRouteChildren } from "../src/app/build-routes.js";
import {
  RequirePermissionOutlet,
  RequirePersonaExperience,
  RequireSessionOutlet,
} from "../src/app/guards.js";
import { routeGates } from "../src/app/route-gates.js";
import { appRoutes } from "../src/app/routes.js";

function elementOf(route: RouteObject): ReactElement {
  return route.element as ReactElement;
}

function gateType(route: RouteObject): unknown {
  return elementOf(route)?.type;
}

function childPaths(route: RouteObject): string[] {
  return (route.children ?? []).map((child) => child.path ?? "(layout)");
}

const tree = createRoutesFromChildren(buildAppRouteChildren(appRoutes));

describe("App-Routen — Session-Gate", () => {
  it("die Routen-Tabelle ist die abgenommene Klassifizierung", () => {
    expect(routeGates).toEqual({
      "/": { kind: "public" },
      "/login": { kind: "public" },
      "/buerger": { kind: "persona", persona: "buerger" },
      "/buerger/anmelden": { kind: "persona", persona: "buerger" },
      "/buerger/bestaetigung/:id": { kind: "persona", persona: "buerger" },
      "/amt": { kind: "persona", persona: "sachbearbeitung" },
      "/amt/vorgang/:id": { kind: "persona", persona: "sachbearbeitung" },
      "/amt/akten": { kind: "persona", persona: "sachbearbeitung" },
      "/amt/akte/:id": { kind: "persona", persona: "sachbearbeitung" },
      "/aufsicht": { kind: "persona", persona: "aufsicht" },
      "/boards": {
        kind: "permission",
        permission: "boards.collaborate",
        fallbackTo: "/",
      },
      "/boards/:boardId": {
        kind: "permission",
        permission: "boards.collaborate",
        fallbackTo: "/",
      },
      "/admin/users": { kind: "session" },
      "/konto/passwort": { kind: "session" },
    });
  });

  it("jede klassifizierte Route hat genau eine Sicht (Deskriptor-Vollständigkeit)", () => {
    expect(appRoutes.map((route) => route.path).sort()).toEqual(
      Object.keys(routeGates).sort(),
    );
    for (const route of appRoutes) {
      expect(route.element, route.path).toBeTruthy();
    }
  });

  it("es gibt genau EINE RequireSessionOutlet-Layout-Route — und nur / + /login davor", () => {
    const gates = tree.filter(
      (route) => gateType(route) === RequireSessionOutlet,
    );
    expect(gates).toHaveLength(1);

    const topLevelPaths = tree.map((route) => route.path ?? "(layout)");
    expect(topLevelPaths).toEqual(["/", "/login", "(layout)", "*"]);
  });

  it("alle Persona- und Workspace-Routen stehen INNERHALB des Gates", () => {
    const gate = tree.find((route) => gateType(route) === RequireSessionOutlet);
    const groups = gate?.children ?? [];

    const personaGroups = groups.filter(
      (group) => gateType(group) === RequirePersonaExperience,
    );
    expect(
      personaGroups.map((group) => elementOf(group).props.persona),
    ).toEqual(["buerger", "sachbearbeitung", "aufsicht"]);
    expect(childPaths(personaGroups[0] as RouteObject)).toEqual([
      "/buerger",
      "/buerger/anmelden",
      "/buerger/bestaetigung/:id",
    ]);
    expect(childPaths(personaGroups[1] as RouteObject)).toEqual([
      "/amt",
      "/amt/vorgang/:id",
      "/amt/akten",
      "/amt/akte/:id",
    ]);
    expect(childPaths(personaGroups[2] as RouteObject)).toEqual(["/aufsicht"]);

    const permissionGroups = groups.filter(
      (group) => gateType(group) === RequirePermissionOutlet,
    );
    expect(permissionGroups).toHaveLength(1);
    expect(elementOf(permissionGroups[0] as RouteObject).props).toMatchObject({
      permission: "boards.collaborate",
      // Redirect-Ziel "/" — /boards als Fallback ergäbe hier eine Schleife.
      fallbackTo: "/",
    });
    expect(childPaths(permissionGroups[0] as RouteObject)).toEqual([
      "/boards",
      "/boards/:boardId",
    ]);

    const sessionLeaves = groups.filter((group) => group.path);
    expect(sessionLeaves.map((route) => route.path)).toEqual([
      "/admin/users",
      "/konto/passwort",
    ]);
  });

  it("der Catch-all führt zur Landing — der alte Default-Redirect nach /buerger ist weg", () => {
    const fallback = tree.find((route) => route.path === "*");
    expect(fallback).toBeTruthy();
    expect(elementOf(fallback as RouteObject).props).toMatchObject({
      to: "/",
      replace: true,
    });
  });
});
