// route-gating.guard.test.ts — struktureller Vertrag des abgeleiteten Routen-Baums.
// Gerenderte First-Run-/Session-Szenarien laufen zusätzlich in der App-Story; dieser
// Test prüft Metadaten statt Quelltext-Reihenfolge und bleibt damit refactoring-stabil.
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
import { isPublicPath } from "../src/landing-state.js";

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
      "/barrierefreiheit": { kind: "public" },
      "/buerger": { kind: "persona", persona: "buerger" },
      "/buerger/anmelden": { kind: "persona", persona: "buerger" },
      "/buerger/bestaetigung/:id": { kind: "persona", persona: "buerger" },
      "/amt": { kind: "persona", persona: "sachbearbeitung" },
      "/amt/vorgang/:id": { kind: "persona", persona: "sachbearbeitung" },
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

  it("jede klassifizierte Route hat genau eine Sicht", () => {
    expect(appRoutes.map((route) => route.path).sort()).toEqual(
      Object.keys(routeGates).sort(),
    );
    for (const route of appRoutes)
      expect(route.element, route.path).toBeTruthy();
  });

  it("besitzt genau ein Session-Gate hinter den drei öffentlichen Deskriptoren", () => {
    const gates = tree.filter(
      (route) => gateType(route) === RequireSessionOutlet,
    );
    expect(gates).toHaveLength(1);
    expect(tree.map((route) => route.path ?? "(layout)")).toEqual([
      "/",
      "/login",
      "/barrierefreiheit",
      "(layout)",
      "*",
    ]);
  });

  it("alle Persona- und Workspace-Routen stehen innerhalb des Gates", () => {
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
    ]);
    expect(childPaths(personaGroups[2] as RouteObject)).toEqual(["/aufsicht"]);

    const permissionGroups = groups.filter(
      (group) => gateType(group) === RequirePermissionOutlet,
    );
    expect(permissionGroups).toHaveLength(1);
    expect(elementOf(permissionGroups[0] as RouteObject).props).toMatchObject({
      permission: "boards.collaborate",
      fallbackTo: "/",
    });
    expect(childPaths(permissionGroups[0] as RouteObject)).toEqual([
      "/boards",
      "/boards/:boardId",
    ]);
    expect(
      groups.filter((group) => group.path).map((route) => route.path),
    ).toEqual(["/admin/users", "/konto/passwort"]);
  });

  it.each([
    "/buerger",
    "/boards",
    "/barrierefreiheit/",
    "/barrierefreiheit/intern",
    "/Barrierefreiheit",
    "//barrierefreiheit",
  ])("%s ist kein exakter öffentlicher Pfad", (pathname) => {
    expect(isPublicPath(pathname)).toBe(false);
  });

  it("der Catch-all führt zur Landing", () => {
    const fallback = tree.find((route) => route.path === "*");
    expect(elementOf(fallback as RouteObject).props).toMatchObject({
      to: "/",
      replace: true,
    });
  });
});
