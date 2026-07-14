import {
  InMemoryAuditStore,
  InMemoryAuthStore,
  InMemoryKanbanStore,
} from "@senticor/app-store-postgres";
import { describe, expect, it } from "vitest";
import { buildPublicServer } from "../index.js";
import { autoBootstrapAdminFromEnv } from "./auto-bootstrap.js";

describe("seeded citizen authorization", () => {
  it("can authenticate but receives 403 for Boards read and write operations", async () => {
    const password = "correct horse battery staple"; // pragma: allowlist-secret
    const authStore = new InMemoryAuthStore();
    const kanbanStore = new InMemoryKanbanStore();
    const auditStore = new InMemoryAuditStore();
    await autoBootstrapAdminFromEnv({
      authStore,
      kanbanStore,
      auditStore,
      env: {
        AUTH_BOOTSTRAP_ADMIN_EMAIL: "admin@example.org",
        AUTH_BOOTSTRAP_ADMIN_PASSWORD: password,
        DEMO_MODE: "true",
        DEMO_USER_PASSWORD: password,
      },
    });

    const app = buildPublicServer({ authStore, kanbanStore, auditStore });
    try {
      await app.ready();
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "demo.buerger@example.org", password },
      });
      expect(login.statusCode).toBe(200);
      const cookie = String(login.headers["set-cookie"]).split(";")[0];

      const read = await app.inject({
        method: "GET",
        url: "/api/v1/boards",
        headers: { cookie },
      });
      const write = await app.inject({
        method: "POST",
        url: "/api/v1/boards",
        headers: { cookie },
        payload: { title: "Nicht erlaubt" },
      });
      expect(read.statusCode).toBe(403);
      expect(write.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});
