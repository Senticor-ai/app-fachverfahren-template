import {
  InMemoryAuthStore,
  InMemoryKanbanStore,
} from "@senticor/app-store-postgres";
import { describe, expect, it } from "vitest";
import { BootstrapError, bootstrapWorkspace } from "./bootstrap.js";

interface MakeDepsOptions {
  bootstrapToken: string | undefined;
}

// Deliberately no default parameter value here: `makeDeps(undefined)` must
// mean "no token configured", not silently fall back to a default — a
// default parameter would trigger on an explicit `undefined` argument too
// and mask exactly the case this suite needs to exercise.
function makeDeps(options: MakeDepsOptions) {
  return {
    authStore: new InMemoryAuthStore(),
    kanbanStore: new InMemoryKanbanStore(),
    bootstrapToken: options.bootstrapToken,
  };
}

const validInput = {
  token: "correct-token",
  email: "admin@example.org",
  password: "correct horse battery staple", // pragma: allowlist-secret
  displayName: "Admin",
};

describe("bootstrapWorkspace", () => {
  it("rejects when no bootstrap token is configured", async () => {
    const deps = makeDeps({ bootstrapToken: undefined });
    await expect(bootstrapWorkspace(deps, validInput)).rejects.toMatchObject({
      code: "invalid-token",
    });
  });

  it("rejects an incorrect token", async () => {
    const deps = makeDeps({ bootstrapToken: "correct-token" });
    await expect(
      bootstrapWorkspace(deps, { ...validInput, token: "wrong-token" }),
    ).rejects.toMatchObject({ code: "invalid-token" });
  });

  it("rejects a password shorter than the minimum length", async () => {
    const deps = makeDeps({ bootstrapToken: "correct-token" });
    await expect(
      bootstrapWorkspace(deps, { ...validInput, password: "short" }),
    ).rejects.toMatchObject({ code: "weak-password" });
  });

  it("creates the first admin user, a hashed credential, and a seeded board", async () => {
    const deps = makeDeps({ bootstrapToken: "correct-token" });
    const result = await bootstrapWorkspace(deps, validInput);

    expect(result.user.email).toBe("admin@example.org");
    expect(result.user.status).toBe("active");

    const credential = await deps.authStore.getLocalCredential(
      result.user.actorId,
    );
    expect(credential?.passwordHash).toContain("$argon2id$");
    expect(credential?.passwordHash).not.toContain(validInput.password);

    expect(result.board.title).toBe("Build the Fachverfahren");
    expect(result.board.ownerActorId).toBe(result.user.actorId);

    const columns = await deps.kanbanStore.listColumns({
      tenantId: result.user.tenantId,
      boardId: result.board.boardId,
    });
    expect(columns.length).toBeGreaterThanOrEqual(5);
    expect(columns.map((column) => column.title)).toContain("Inbox / Fragen");

    const cards = await deps.kanbanStore.listCards({
      tenantId: result.user.tenantId,
      boardId: result.board.boardId,
    });
    expect(cards.length).toBeGreaterThanOrEqual(10);
    expect(cards.every((card) => card.sourceKey)).toBe(true);
  });

  it("refuses to bootstrap twice — the second attempt is rejected even with a valid token", async () => {
    const deps = makeDeps({ bootstrapToken: "correct-token" });
    await bootstrapWorkspace(deps, validInput);

    await expect(
      bootstrapWorkspace(deps, {
        ...validInput,
        email: "someone-else@example.org",
      }),
    ).rejects.toMatchObject({ code: "already-bootstrapped" });
  });

  it("throws a plain BootstrapError instance callers can distinguish by code", async () => {
    const deps = makeDeps({ bootstrapToken: undefined });
    try {
      await bootstrapWorkspace(deps, validInput);
      expect.unreachable("expected bootstrapWorkspace to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BootstrapError);
    }
  });
});
