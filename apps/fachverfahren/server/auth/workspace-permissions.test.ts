import { describe, expect, it } from "vitest";
import {
  hasWorkspacePermission,
  permissionsForRole,
} from "./workspace-permissions.js";

describe("workspace permissions", () => {
  it("grants admins every workspace permission", () => {
    const permissions = permissionsForRole("admin");
    expect(permissions).toContain("users.manage");
    expect(permissions).toContain("boards.manage");
    expect(permissions).toContain("boards.collaborate");
    expect(permissions).toContain("audit.read");
    expect(permissions).toContain("tenant.export");
  });

  it("grants members collaboration only", () => {
    expect(permissionsForRole("member")).toEqual(["boards.collaborate"]);
  });

  it("answers permission checks per role, not per literal role string in routes", () => {
    expect(hasWorkspacePermission("admin", "users.manage")).toBe(true);
    expect(hasWorkspacePermission("member", "users.manage")).toBe(false);
    expect(hasWorkspacePermission("member", "boards.collaborate")).toBe(true);
  });
});
