import { describe, expect, it } from "vitest";
import {
  builtInRbacRegistry,
  extendRbacRegistry,
  hasPermission,
  resolvePermissionsForRoles,
} from "./rbac.js";

describe("public sector RBAC registry", () => {
  it("resolves Bürger and Sachbearbeitung permissions", () => {
    expect(hasPermission(["citizen"], "mailbox.own.read")).toBe(true);
    expect(hasPermission(["citizen"], "mailbox.authority.read")).toBe(false);

    expect(hasPermission(["caseworker"], "mailbox.authority.read")).toBe(true);
    expect(hasPermission(["caseworker"], "case.decision.prepare")).toBe(true);
  });

  it("trennt Mailbox-SCHREIBRECHTE nach eigenem vs. behördlichem Postfach", () => {
    // Schreiben reitet NIE auf einem Leserecht: POST /api/mailbox verlangt
    // eigene Write-Permissions (Issue #11, Design-Constraint).
    expect(hasPermission(["citizen"], "mailbox.own.write")).toBe(true);
    expect(hasPermission(["citizen"], "mailbox.authority.write")).toBe(false);

    expect(hasPermission(["caseworker"], "mailbox.authority.write")).toBe(true);
    expect(hasPermission(["caseworker"], "mailbox.own.write")).toBe(false);

    expect(resolvePermissionsForRoles(["citizen"])).toContain(
      "mailbox.own.write",
    );
    expect(resolvePermissionsForRoles(["caseworker"])).toContain(
      "mailbox.authority.write",
    );
  });

  it("fails closed for unknown roles", () => {
    expect(() => resolvePermissionsForRoles(["unknown-role"])).toThrow(
      /unknown role/,
    );
    expect(hasPermission(["unknown-role"], "case.read")).toBe(false);
  });

  it("can be extended with a new role without changing built-ins", () => {
    const registry = extendRbacRegistry([
      {
        roleKey: "auditor",
        displayName: "Revision",
        description: "Liest prüfbare Vorgänge und Audit-Hinweise.",
        permissions: [
          {
            permission: "audit.read",
            description: "Audit-Hinweise lesen",
          },
        ],
        builtIn: false,
      },
    ]);

    expect(registry.roles).toHaveLength(builtInRbacRegistry.roles.length + 1);
    expect(hasPermission(["auditor"], "audit.read", registry)).toBe(true);
  });
});
