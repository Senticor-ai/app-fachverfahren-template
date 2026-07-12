// Test des ECHTEN notification-Modul-Servers (ModuleHost Phase 1b-ii): prüft die reinen Handler gegen einen
// Mock-NotificationPort + die Modul-Metadaten. Boundary-sicher — importiert nur den Modul-Code + den SDK-Vertrag
// (kein Store/pg/Framework). Die Mount-/RBAC-/Scoping-Naht ist separat im Host getestet (module-host.test.ts);
// zusammen mit der strukturellen ModuleServer-Typisierung ist die Komposition damit belegt.
import { describe, it, expect, vi } from "vitest";
import type {
  ModuleRequestContext,
  NotificationPort,
} from "@senticor/public-sector-sdk";
import { server, type NotificationModulePorts } from "./index.js";

function macheCtx(
  port: NotificationPort,
  over: Partial<ModuleRequestContext<NotificationModulePorts>> = {},
): ModuleRequestContext<NotificationModulePorts> {
  return {
    scope: {
      tenantId: "t1",
      authorityId: "b1",
      jurisdictionId: "de",
      actorId: "sb.a",
      permissions: ["inbox.read"],
    },
    params: {},
    query: {},
    body: undefined,
    requestId: "req-1",
    ports: { notification: port },
    ...over,
  };
}

const route = (operationId: string) => {
  const r = server.routes?.find((x) => x.operationId === operationId);
  if (!r) throw new Error(`Route ${operationId} fehlt`);
  return r;
};

describe("notification-Modul-Server (#1b-ii) — echtes Domänen-Backend als ModuleServer", () => {
  it("deklariert Id/Ports/Zonen/Rechte korrekt", () => {
    expect(server.moduleId).toBe("notification");
    expect(server.requiredPorts).toEqual(["notification"]);
    for (const r of server.routes ?? []) {
      expect(r.surface).toBe("caseworker"); // Public-Zone (kein internal)
      expect(r.requiredPermissions).toContain("inbox.read");
    }
    // Zwei Routen: Liste + gelesen-markieren.
    expect(server.routes?.map((r) => r.operationId).sort()).toEqual([
      "notification.list",
      "notification.markRead",
    ]);
  });

  it("GET /api/notifications listet über den vor-gescopten Port (unread-Filter aus der Query)", async () => {
    const list = vi.fn().mockResolvedValue([{ notificationId: "n1" }]);
    const port: NotificationPort = { list, markRead: vi.fn() };
    const res = await route("notification.list").handle(
      macheCtx(port, { query: { unread: "true" } }),
    );
    expect(list).toHaveBeenCalledWith({ unreadOnly: true });
    expect(res).toEqual({
      ok: true,
      body: { notifications: [{ notificationId: "n1" }] },
    });
  });

  it("GET ohne unread=true liest ALLE (unreadOnly nicht gesetzt)", async () => {
    const list = vi.fn().mockResolvedValue([]);
    await route("notification.list").handle(
      macheCtx({ list, markRead: vi.fn() }),
    );
    expect(list).toHaveBeenCalledWith({ unreadOnly: false });
  });

  it("POST /api/notifications/:id/read markiert gelesen → 204", async () => {
    const markRead = vi.fn().mockResolvedValue(undefined);
    const res = await route("notification.markRead").handle(
      macheCtx({ list: vi.fn(), markRead }, { params: { id: "n9" } }),
    );
    expect(markRead).toHaveBeenCalledWith({ notificationId: "n9" });
    expect(res).toEqual({ ok: true, status: 204 });
  });
});
