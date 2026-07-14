import {
  InMemoryAuditStore,
  InMemoryAuthStore,
  InMemoryKanbanStore,
  UnavailableAuditStore,
  UnavailableAuthStore,
  UnavailableKanbanStore,
} from "@senticor/app-store-postgres";
import { describe, expect, it } from "vitest";
import { autoBootstrapAdminFromEnv } from "./auto-bootstrap.js";

const configuredEnv = {
  AUTH_BOOTSTRAP_ADMIN_EMAIL: "admin@example.org",
  AUTH_BOOTSTRAP_ADMIN_PASSWORD: "correct horse battery staple", // pragma: allowlist-secret
} as NodeJS.ProcessEnv;

function makeDeps(env: NodeJS.ProcessEnv) {
  const logs: Array<{ level: string; event: string; fields: unknown }> = [];
  return {
    authStore: new InMemoryAuthStore(),
    kanbanStore: new InMemoryKanbanStore(),
    auditStore: new InMemoryAuditStore(),
    env,
    log: (level: "info" | "error", event: string, fields: unknown) => {
      logs.push({ level, event, fields });
    },
    logs,
  };
}

describe("autoBootstrapAdminFromEnv", () => {
  it("creates the admin (role admin) and the team board on an empty store", async () => {
    const deps = makeDeps(configuredEnv);
    const outcome = await autoBootstrapAdminFromEnv(deps);
    expect(outcome).toBe("created");

    const user = await deps.authStore.getUserByEmail({
      tenantId: "default",
      email: "admin@example.org",
    });
    expect(user?.role).toBe("admin");
    const boards = await deps.kanbanStore.listBoards({
      tenantId: "default",
      actorId: user?.actorId ?? "",
    });
    expect(boards[0]?.visibility).toBe("team");
    // Auch der Env-Bootstrap hinterlässt Audit-Evidenz für das erste privilegierte Konto.
    const events = await deps.auditStore.listEvents({ tenantId: "default" });
    expect(events.map((event) => event.eventType)).toContain("USER_CREATED");
    // Das Passwort taucht in KEINEM Logfeld auf.
    expect(JSON.stringify(deps.logs)).not.toContain(
      configuredEnv["AUTH_BOOTSTRAP_ADMIN_PASSWORD"],
    );
  });

  it("creates three demo accounts only during a fresh environment bootstrap", async () => {
    const deps = makeDeps({
      ...configuredEnv,
      DEMO_MODE: "true",
      DEMO_USER_PASSWORD: "demo password with sufficient length", // pragma: allowlist-secret
    });
    expect(await autoBootstrapAdminFromEnv(deps)).toBe("created");
    expect(await deps.authStore.countUsers({ tenantId: "default" })).toBe(4);

    const admin = await deps.authStore.getUserByEmail({
      tenantId: "default",
      email: "admin@example.org",
    });
    const boards = await deps.kanbanStore.listBoards({
      tenantId: "default",
      actorId: admin?.actorId ?? "",
    });
    expect(boards).toHaveLength(1);
    expect(boards[0]?.visibility).toBe("team");

    expect(await autoBootstrapAdminFromEnv(deps)).toBe("skipped-existing");
    expect(await deps.authStore.countUsers({ tenantId: "default" })).toBe(4);
    const events = await deps.auditStore.listEvents({ tenantId: "default" });
    expect(
      events.filter((event) => event.eventType === "USER_CREATED"),
    ).toHaveLength(4);
  });

  it("is idempotent: a second start skips without touching the store", async () => {
    const deps = makeDeps(configuredEnv);
    await autoBootstrapAdminFromEnv(deps);
    const outcome = await autoBootstrapAdminFromEnv(deps);
    expect(outcome).toBe("skipped-existing");
    expect(await deps.authStore.countUsers({ tenantId: "default" })).toBe(1);
  });

  it("skips silently when no bootstrap env is configured", async () => {
    const deps = makeDeps({} as NodeJS.ProcessEnv);
    expect(await autoBootstrapAdminFromEnv(deps)).toBe("skipped-unconfigured");
  });

  it("fails loudly (without throwing) when only one of the two variables is set", async () => {
    const deps = makeDeps({
      AUTH_BOOTSTRAP_ADMIN_EMAIL: "admin@example.org",
    } as NodeJS.ProcessEnv);
    expect(await autoBootstrapAdminFromEnv(deps)).toBe("failed");
    expect(deps.logs.some((entry) => entry.level === "error")).toBe(true);
  });

  it("fails loudly (without throwing) when the password is too weak", async () => {
    const deps = makeDeps({
      AUTH_BOOTSTRAP_ADMIN_EMAIL: "admin@example.org",
      AUTH_BOOTSTRAP_ADMIN_PASSWORD: "kurz",
    } as NodeJS.ProcessEnv);
    expect(await autoBootstrapAdminFromEnv(deps)).toBe("failed");
    expect(await deps.authStore.countUsers({ tenantId: "default" })).toBe(0);
  });

  it("never throws even when the stores are unavailable (PG down)", async () => {
    const outcome = await autoBootstrapAdminFromEnv({
      authStore: new UnavailableAuthStore("db down"),
      kanbanStore: new UnavailableKanbanStore("db down"),
      auditStore: new UnavailableAuditStore("db down"),
      env: configuredEnv,
    });
    expect(outcome).toBe("failed");
  });
});
