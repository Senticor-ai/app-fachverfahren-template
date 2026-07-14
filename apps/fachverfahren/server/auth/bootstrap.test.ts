import {
  InMemoryAuthStore,
  InMemoryKanbanStore,
} from "@senticor/app-store-postgres";
import { describe, expect, it } from "vitest";
import {
  assertBootstrapToken,
  BootstrapError,
  bootstrapWorkspace,
} from "./bootstrap.js";

function makeDeps() {
  return {
    authStore: new InMemoryAuthStore(),
    kanbanStore: new InMemoryKanbanStore(),
  };
}

const validInput = {
  email: "admin@example.org",
  password: "correct horse battery staple", // pragma: allowlist-secret
  displayName: "Admin",
};

describe("assertBootstrapToken", () => {
  // Das Token-Gate gehört der HTTP-Route; der vertrauenswürdige Startup-Pfad
  // (Auto-Bootstrap aus Env-Variablen) ruft bootstrapWorkspace direkt.
  it("rejects when no bootstrap token is configured", () => {
    expect(() => assertBootstrapToken(undefined, "anything")).toThrowError(
      BootstrapError,
    );
    try {
      assertBootstrapToken(undefined, "anything");
    } catch (error) {
      expect(error).toMatchObject({ code: "invalid-token" });
    }
  });

  it("rejects an incorrect token and accepts the correct one", () => {
    expect(() =>
      assertBootstrapToken("correct-token", "wrong-token"),
    ).toThrowError(BootstrapError);
    expect(() =>
      assertBootstrapToken("correct-token", "correct-token"),
    ).not.toThrow();
  });
});

describe("bootstrapWorkspace", () => {
  it("rejects a password shorter than the minimum length", async () => {
    const deps = makeDeps();
    await expect(
      bootstrapWorkspace(deps, { ...validInput, password: "short" }),
    ).rejects.toMatchObject({ code: "weak-password" });
  });

  it("creates the first ADMIN user, a hashed credential, a local identity link, and the team discovery board", async () => {
    const deps = makeDeps();
    const result = await bootstrapWorkspace(deps, validInput);

    expect(result.user.email).toBe("admin@example.org");
    expect(result.user.status).toBe("active");
    expect(result.user.role).toBe("admin");

    const credential = await deps.authStore.getLocalCredential(
      result.user.actorId,
    );
    expect(credential?.passwordHash).toContain("$argon2id$");
    expect(credential?.passwordHash).not.toContain(validInput.password);

    // Identity-Link (Authentifizierung ≠ Autorisierung): der lokale Login ist nur
    // EIN Provider — auch er läuft über das Identity-Mapping.
    expect(
      await deps.authStore.findActorByIdentity({
        tenantId: result.user.tenantId,
        provider: "local",
        subject: result.user.actorId,
      }),
    ).toBe(result.user.actorId);

    expect(result.board.title).toBe("Fachverfahren Discovery Board");
    expect(result.board.visibility).toBe("team");
    expect(result.board.purpose).toBe("requirements-discovery");
    expect(result.board.lifecycleStage).toBe("design");
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

  it("refuses to bootstrap twice", async () => {
    const deps = makeDeps();
    await bootstrapWorkspace(deps, validInput);

    await expect(
      bootstrapWorkspace(deps, {
        ...validInput,
        email: "someone-else@example.org",
      }),
    ).rejects.toMatchObject({ code: "already-bootstrapped" });
  });

  it("rolls the created user back when a later step fails, so a retry succeeds", async () => {
    const deps = makeDeps();
    // Discovery-Board-Seed schlägt fehl (z. B. Migration fehlt) — der schon angelegte
    // Benutzer darf den Tenant NICHT dauerhaft als „bootstrapped" hinterlassen.
    const failingCreateBoard = deps.kanbanStore.createBoard.bind(
      deps.kanbanStore,
    );
    let failNext = true;
    deps.kanbanStore.createBoard = async (board) => {
      if (failNext) {
        failNext = false;
        throw new Error("relation app_boards does not exist");
      }
      return failingCreateBoard(board);
    };

    await expect(bootstrapWorkspace(deps, validInput)).rejects.toThrow(
      "app_boards",
    );
    await expect(
      deps.authStore.countUsers({ tenantId: "default" }),
    ).resolves.toBe(0);

    // Retry mit reparierter Umgebung: läuft durch, statt in "already-bootstrapped" zu enden.
    const retried = await bootstrapWorkspace(deps, validInput);
    expect(retried.user.email).toBe(validInput.email);
    expect(
      await deps.authStore.getLocalCredential(retried.user.actorId),
    ).toBeDefined();
    // Auch der Identity-Link des Fehlversuchs darf den Retry nicht blockieren.
    expect(
      await deps.authStore.findActorByIdentity({
        tenantId: retried.user.tenantId,
        provider: "local",
        subject: retried.user.actorId,
      }),
    ).toBe(retried.user.actorId);
  });
});
