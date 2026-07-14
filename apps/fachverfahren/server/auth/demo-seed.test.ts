import {
  InMemoryAuditStore,
  InMemoryAuthStore,
  type AuthStore,
  type UserAccount,
} from "@senticor/app-store-postgres";
import { describe, expect, it } from "vitest";
import { MINIMUM_PASSWORD_LENGTH } from "./bootstrap.js";
import { seedDemoUsers } from "./demo-seed.js";

const password = "correct horse battery staple"; // pragma: allowlist-secret

function makeDeps(authStore: AuthStore = new InMemoryAuthStore()) {
  const auditStore = new InMemoryAuditStore();
  const logs: Array<{
    level: "info" | "error";
    event: string;
    fields: Record<string, unknown>;
  }> = [];
  let id = 0;
  return {
    authStore,
    auditStore,
    now: () => new Date("2026-07-14T08:00:00.000Z"),
    generateId: (prefix: string) => `${prefix}-${++id}`,
    log: (
      level: "info" | "error",
      event: string,
      fields: Record<string, unknown>,
    ) => logs.push({ level, event, fields }),
    logs,
  };
}

describe("seedDemoUsers", () => {
  it("creates the three local demo personas with audit evidence and no boards", async () => {
    const deps = makeDeps();
    const outcome = await seedDemoUsers(deps, {
      tenantId: "default",
      demoMode: true,
      password,
    });

    expect(outcome).toEqual({ created: 3, existing: 0, failed: 0 });
    const users = await deps.authStore.listUsers({ tenantId: "default" });
    expect(
      users.map(({ email, role, localPersonas, personaManagementMode }) => ({
        email,
        role,
        localPersonas,
        personaManagementMode,
      })),
    ).toEqual([
      {
        email: "demo.sachbearbeitung@example.org",
        role: "member",
        localPersonas: ["sachbearbeitung"],
        personaManagementMode: "local",
      },
      {
        email: "demo.aufsicht@example.org",
        role: "member",
        localPersonas: ["aufsicht"],
        personaManagementMode: "local",
      },
      {
        email: "demo.buerger@example.org",
        role: "citizen",
        localPersonas: ["buerger"],
        personaManagementMode: "local",
      },
    ]);

    const events = await deps.auditStore.listEvents({ tenantId: "default" });
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.eventType === "USER_CREATED")).toBe(
      true,
    );
    expect(events.every((event) => event.metadata["via"] === "demo-seed")).toBe(
      true,
    );
    const evidence = JSON.stringify({ events, logs: deps.logs });
    expect(evidence).not.toContain(password);
    expect(evidence).not.toContain("argon2");
  });

  it.each([
    ["demo mode is off", false, password, "disabled"],
    ["the password is missing", true, undefined, "missing-password"],
    [
      "the password is policy-invalid",
      true,
      "x".repeat(MINIMUM_PASSWORD_LENGTH - 1),
      "weak-password",
    ],
  ] as const)(
    "skips all accounts when %s",
    async (_label, demoMode, value, reason) => {
      const deps = makeDeps();
      const outcome = await seedDemoUsers(deps, {
        tenantId: "default",
        demoMode,
        ...(value === undefined ? {} : { password: value }),
      });
      expect(outcome.created).toBe(0);
      expect(await deps.authStore.countUsers({ tenantId: "default" })).toBe(0);
      expect(JSON.stringify(deps.logs)).toContain(reason);
    },
  );

  it("is idempotent and never overwrites an existing demo-email account", async () => {
    const authStore = new InMemoryAuthStore();
    const existing: UserAccount = {
      actorId: "existing-citizen",
      tenantId: "default",
      authorityId: "custom-authority",
      jurisdictionId: "custom-jurisdiction",
      email: "demo.buerger@example.org",
      displayName: "Bestehendes Konto",
      status: "disabled",
      role: "member",
      localPersonas: ["aufsicht"],
      oidcPersonas: [],
      personaManagementMode: "local",
      principalVersion: 7,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    await authStore.createUser(existing);
    const deps = makeDeps(authStore);

    await seedDemoUsers(deps, {
      tenantId: "default",
      demoMode: true,
      password,
    });
    await seedDemoUsers(deps, {
      tenantId: "default",
      demoMode: true,
      password,
    });

    expect(await authStore.countUsers({ tenantId: "default" })).toBe(3);
    expect(
      await authStore.getUserByEmail({
        tenantId: "default",
        email: existing.email,
      }),
    ).toEqual(existing);
    expect(
      await deps.auditStore.listEvents({ tenantId: "default" }),
    ).toHaveLength(2);
  });

  it("continues after one account creation fails", async () => {
    class FailingAuthStore extends InMemoryAuthStore {
      private createCalls = 0;

      override async createLocalUserWithCredential(
        input: Parameters<AuthStore["createLocalUserWithCredential"]>[0],
      ) {
        this.createCalls += 1;
        if (this.createCalls === 2) throw new Error("injected create failure");
        return super.createLocalUserWithCredential(input);
      }
    }

    const deps = makeDeps(new FailingAuthStore());
    const outcome = await seedDemoUsers(deps, {
      tenantId: "default",
      demoMode: true,
      password,
    });
    expect(outcome).toEqual({ created: 2, existing: 0, failed: 1 });
    expect(await deps.authStore.countUsers({ tenantId: "default" })).toBe(2);
    expect(
      (await deps.auditStore.listEvents({ tenantId: "default" })).length,
    ).toBe(2);
    expect(deps.logs).toContainEqual(
      expect.objectContaining({
        level: "error",
        event: "runtime.demo-seed.user-failed",
      }),
    );
  });
});
