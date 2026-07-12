import { describe, expect, it } from "vitest";
import fastify, { type FastifyInstance } from "fastify";
import {
  InMemoryNotificationStore,
  type AppNotification,
} from "@senticor/app-store-postgres";
import type {
  CaseworkerSession,
  ModuleScope,
  ModuleServer,
  NotificationPort,
} from "@senticor/public-sector-sdk";
import {
  assertModuleRoutesUnique,
  buildModulePorts,
  discoverModules,
  mountModule,
  type ModuleHostDeps,
} from "./module-host.js";

// Beweist die ModuleHost-Mount-Naht (Phase 1a) end-to-end per Fastify-inject: der Host reproduziert das server-
// autoritative Enforcement (401/Tenant-Pinning/RBAC) und injiziert VOR-GESCOPTE Ports — ein Modul-Handler kann
// PHYSISCH keinen fremden Mandanten adressieren (der Port ist an die Session gebunden, nicht an Query/Body).

function macheNotification(
  over: Partial<AppNotification> = {},
): AppNotification {
  return {
    notificationId: "n1",
    tenantId: "t1",
    authorityId: "b1",
    recipientActorId: null,
    eventType: "case.eingegangen",
    title: "Neuer Vorgang",
    body: "Vorgang c1 eingegangen.",
    caseId: "c1",
    taskId: null,
    read: false,
    createdAt: "2026-07-10T00:00:00.000Z",
    ...over,
  };
}

function macheSession(
  over: Partial<CaseworkerSession> = {},
): CaseworkerSession {
  return {
    actorId: "sb.eins",
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    permissions: ["inbox.read"],
    ...over,
  };
}

/** Fixture-Modul: reine Descriptoren + Handler, die NUR den (vor-gescopten) NotificationPort + ctx.scope nutzen. */
const fixtureModule: ModuleServer = {
  moduleId: "test-notif",
  requiredPorts: ["notification"],
  routes: [
    {
      method: "GET",
      path: "/api/test/notifications",
      surface: "caseworker",
      operationId: "listTestNotifications",
      requiredPermissions: ["inbox.read"],
      handle: async (ctx) => {
        const ports = ctx.ports as { notification: NotificationPort };
        return {
          ok: true,
          body: {
            tenant: ctx.scope.tenantId,
            notifications: await ports.notification.list({
              unreadOnly: ctx.query["unread"] === "true",
            }),
          },
        };
      },
    },
    {
      method: "POST",
      path: "/api/test/notifications/:id/read",
      surface: "caseworker",
      operationId: "readTestNotification",
      requiredPermissions: ["inbox.read"],
      handle: async (ctx) => {
        const ports = ctx.ports as { notification: NotificationPort };
        await ports.notification.markRead({
          notificationId: ctx.params["id"] ?? "",
        });
        return { ok: true, status: 204 };
      },
    },
  ],
};

async function baueApp(
  store: InMemoryNotificationStore,
  resolveSession: () => CaseworkerSession | undefined,
): Promise<FastifyInstance> {
  const app = fastify({ logger: false });
  const deps: ModuleHostDeps = { resolveSession, notificationStore: store };
  mountModule(app, fixtureModule, deps);
  await app.ready();
  return app;
}

describe("mountModule — server-autoritatives Enforcement der Modul-Routen", () => {
  it("ohne Sitzung ⇒ 401", async () => {
    const app = await baueApp(new InMemoryNotificationStore(), () => undefined);
    const res = await app.inject({
      method: "GET",
      url: "/api/test/notifications",
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("fehlendes Recht ⇒ 403 mit Grund", async () => {
    const app = await baueApp(new InMemoryNotificationStore(), () =>
      macheSession({ permissions: [] }),
    );
    const res = await app.inject({
      method: "GET",
      url: "/api/test/notifications",
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: "forbidden",
      reason: "missing permission inbox.read",
    });
    await app.close();
  });

  it("gültige Sitzung ⇒ 200 + die Meldungen des SESSION-Mandanten", async () => {
    const store = new InMemoryNotificationStore();
    await store.insertNotification(macheNotification({ tenantId: "t1" }));
    const app = await baueApp(store, () => macheSession({ tenantId: "t1" }));
    const res = await app.inject({
      method: "GET",
      url: "/api/test/notifications",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      tenant: string;
      notifications: AppNotification[];
    };
    expect(body.tenant).toBe("t1");
    expect(body.notifications.map((n) => n.notificationId)).toEqual(["n1"]);
    await app.close();
  });

  it("SCOPE-ISOLATION: eine Sitzung eines FREMDEN Mandanten sieht die t1-Meldung NICHT (Port ist session-gebunden)", async () => {
    const store = new InMemoryNotificationStore();
    await store.insertNotification(macheNotification({ tenantId: "t1" }));
    // Sitzung für t2 — der vor-gescopte Port fragt IMMER t2 ab, egal was Request/Query trägt.
    const app = await baueApp(store, () => macheSession({ tenantId: "t2" }));
    const res = await app.inject({
      method: "GET",
      url: "/api/test/notifications?tenantId=t1",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { tenant: string; notifications: unknown[] };
    expect(body.tenant).toBe("t2");
    expect(body.notifications).toEqual([]); // KEIN Fremd-Mandanten-Leak
    await app.close();
  });

  it("markRead ⇒ 204 + mandanten-scoped (die Meldung ist danach gelesen)", async () => {
    const store = new InMemoryNotificationStore();
    await store.insertNotification(macheNotification({ tenantId: "t1" }));
    const app = await baueApp(store, () => macheSession({ tenantId: "t1" }));
    const read = await app.inject({
      method: "POST",
      url: "/api/test/notifications/n1/read",
    });
    expect(read.statusCode).toBe(204);
    const unread = await app.inject({
      method: "GET",
      url: "/api/test/notifications?unread=true",
    });
    expect(
      (unread.json() as { notifications: unknown[] }).notifications,
    ).toEqual([]);
    await app.close();
  });
});

describe("mountModule — Härtungen (Adversarial-Review)", () => {
  it("ZONEN-TRENNUNG: eine internal-Route wird auf dem Public-Server NICHT gemountet (404)", async () => {
    const internalModule: ModuleServer = {
      moduleId: "test-internal",
      requiredPorts: [],
      routes: [
        {
          method: "GET",
          path: "/api/internal/reindex",
          surface: "internal",
          operationId: "reindex",
          requiredPermissions: ["inbox.read"],
          handle: () => ({ ok: true }),
        },
      ],
    };
    const app = fastify({ logger: false });
    mountModule(app, internalModule, {
      resolveSession: () => macheSession(),
    }); // Default = nur Public-Zonen
    await app.ready();
    const res = await app.inject({
      method: "GET",
      url: "/api/internal/reindex",
    });
    expect(res.statusCode).toBe(404); // nicht registriert
    await app.close();
    // Explizit für die interne Zone gemountet ⇒ erreichbar.
    const intern = fastify({ logger: false });
    mountModule(
      intern,
      internalModule,
      { resolveSession: () => macheSession() },
      { surfaces: ["internal"] },
    );
    await intern.ready();
    expect(
      (await intern.inject({ method: "GET", url: "/api/internal/reindex" }))
        .statusCode,
    ).toBe(200);
    await intern.close();
  });

  it("RBAC fail-CLOSED: ein Leerstring-Recht verweigert (kein Fail-Open)", async () => {
    const modul: ModuleServer = {
      moduleId: "test-empty-perm",
      requiredPorts: [],
      routes: [
        {
          method: "GET",
          path: "/api/test/leer",
          surface: "caseworker",
          operationId: "leer",
          requiredPermissions: [""],
          handle: () => ({ ok: true }),
        },
      ],
    };
    const app = fastify({ logger: false });
    mountModule(app, modul, { resolveSession: () => macheSession() });
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/api/test/leer" });
    expect(res.statusCode).toBe(403); // "" nicht in permissions ⇒ deny
    await app.close();
  });
});

describe("Scope-Härtung (Adversarial-Review)", () => {
  it("buildNotificationPort fixiert den Mandanten zum Build-Zeitpunkt (spätere scope-Mutation wirkt NICHT)", async () => {
    const store = new InMemoryNotificationStore();
    await store.insertNotification(macheNotification({ tenantId: "t1" }));
    const scope = {
      tenantId: "t1",
      authorityId: "b1",
      jurisdictionId: "de",
      actorId: "a",
      permissions: [] as readonly string[],
    };
    const ports = buildModulePorts(
      ["notification"],
      { resolveSession: () => undefined, notificationStore: store },
      scope,
    ) as { notification: NotificationPort };
    // Angreifer/Bug mutiert den Scope NACH dem Bau — der Port bleibt an t1 gebunden.
    (scope as { tenantId: string }).tenantId = "t2";
    expect((await ports.notification.list({})).length).toBe(1); // weiterhin t1
  });
});

describe("discoverModules — APP_MODULES-Allowlist, fail-closed (Phase 1b)", () => {
  // Je Modul eine EIGENE Route (unique path) — sonst greift zu Recht assertModuleRoutesUnique.
  const ladeFixture = async (id: string): Promise<unknown> => ({
    moduleId: id,
    requiredPorts: [],
    routes: [
      {
        method: "GET",
        path: `/api/${id}`,
        surface: "caseworker",
        operationId: `op-${id}`,
        requiredPermissions: [],
        handle: () => ({ ok: true }),
      },
    ],
  });

  it("ohne APP_MODULES ⇒ [] (Monolith unverändert)", async () => {
    expect(await discoverModules({}, { load: ladeFixture })).toEqual([]);
    expect(
      await discoverModules({ APP_MODULES: "  " }, { load: ladeFixture }),
    ).toEqual([]);
  });

  it("lädt die gelisteten Module (Allowlist, getrimmt)", async () => {
    const mods = await discoverModules(
      { APP_MODULES: "notification, andere" },
      { load: ladeFixture },
    );
    expect(mods.map((m) => m.moduleId)).toEqual(["notification", "andere"]);
  });

  it("FAIL-CLOSED: nicht ladbares Modul ⇒ wirft (kein stiller Skip)", async () => {
    await expect(
      discoverModules(
        { APP_MODULES: "kaputt" },
        {
          load: async () => {
            throw new Error("boom");
          },
        },
      ),
    ).rejects.toThrow(/nicht ladbar/);
  });

  it("FAIL-CLOSED: ungültige Form ⇒ wirft", async () => {
    await expect(
      discoverModules({ APP_MODULES: "x" }, { load: async () => ({ foo: 1 }) }),
    ).rejects.toThrow(/gültigen ModuleServer/);
  });

  it("FAIL-CLOSED: abweichende moduleId ⇒ wirft", async () => {
    await expect(
      discoverModules(
        { APP_MODULES: "notification" },
        { load: async () => fixtureModule }, // moduleId = "test-notif"
      ),
    ).rejects.toThrow(/abweichende moduleId/);
  });
});

describe("assertModuleRoutesUnique", () => {
  it("wirft bei doppelter method+path über Module", () => {
    const a: ModuleServer = { ...fixtureModule, moduleId: "a" };
    const b: ModuleServer = { ...fixtureModule, moduleId: "b" };
    expect(() => assertModuleRoutesUnique([a, b])).toThrow(/doppelte Route/);
  });
});

describe("buildModulePorts — fail-closed", () => {
  const scope: ModuleScope = {
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    actorId: "a",
    permissions: [],
  };

  it("verlangter notification-Port ohne Store ⇒ wirft (kein stiller undefined-Port)", () => {
    expect(() =>
      buildModulePorts(
        ["notification"],
        { resolveSession: () => undefined },
        scope,
      ),
    ).toThrow(/notification/);
  });

  it("unbekannter Port ⇒ wirft", () => {
    expect(() =>
      buildModulePorts(
        ["gibt-es-nicht"],
        {
          resolveSession: () => undefined,
          notificationStore: new InMemoryNotificationStore(),
        },
        scope,
      ),
    ).toThrow(/unbekannter Port/);
  });

  it("vor-gescopter Port bindet den Mandanten (list fragt scope.tenantId)", async () => {
    const store = new InMemoryNotificationStore();
    await store.insertNotification(macheNotification({ tenantId: "t9" }));
    const ports = buildModulePorts(
      ["notification"],
      { resolveSession: () => undefined, notificationStore: store },
      { ...scope, tenantId: "t9" },
    ) as {
      notification: NotificationPort;
    };
    expect((await ports.notification.list({})).length).toBe(1);
    const fremd = buildModulePorts(
      ["notification"],
      { resolveSession: () => undefined, notificationStore: store },
      { ...scope, tenantId: "t1" },
    ) as {
      notification: NotificationPort;
    };
    expect((await fremd.notification.list({})).length).toBe(0);
  });
});

describe("discoverModules + mountModule — das ECHTE notification-Modul e2e (1b-ii)", () => {
  // Lädt die MODUL-QUELLE per DYNAMISCHEM import (exakt wie defaultModuleLoad; ein `import(...)` — KEIN `from`-Import —
  // triggert die module-boundaries-Regex NICHT). Der einzige Unterschied zur PROD-Laufzeit: dort lädt der Default-Loader
  // das GEBAUTE dist-domain-servers/<id>/…; hier die .ts-Quelle (identischer Code, via vitest transpiliert).
  const ladeEchtesModul = async (id: string): Promise<unknown> => {
    const url = new URL(
      `../../../modules/_backends/${id}/server/index.ts`,
      import.meta.url,
    ).href;
    const mod = (await import(/* @vite-ignore */ url)) as {
      server?: unknown;
      default?: unknown;
    };
    return mod.server ?? mod.default;
  };

  async function baueEchtModulApp(
    store: InMemoryNotificationStore,
    session: CaseworkerSession | undefined,
  ): Promise<FastifyInstance> {
    const modules = await discoverModules(
      { APP_MODULES: "notification" },
      { load: ladeEchtesModul },
    );
    expect(modules.map((m) => m.moduleId)).toEqual(["notification"]);
    const app = fastify({ logger: false });
    const deps: ModuleHostDeps = {
      resolveSession: () => session,
      notificationStore: store,
    };
    for (const m of modules) mountModule(app, m, deps);
    await app.ready();
    return app;
  }

  it("serviert GET /api/notifications mandanten-scoped über den vor-gescopten Port", async () => {
    const store = new InMemoryNotificationStore();
    await store.insertNotification(macheNotification({ notificationId: "n1" }));
    await store.insertNotification(
      macheNotification({ notificationId: "n2", tenantId: "fremd" }),
    );
    const app = await baueEchtModulApp(store, macheSession());
    try {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        notifications: { notificationId: string }[];
      };
      // NUR der eigene Mandant (der Port ist an die Session gebunden — kein fremder Mandant erreichbar).
      expect(body.notifications.map((n) => n.notificationId)).toEqual(["n1"]);
    } finally {
      await app.close();
    }
  });

  it("403 ohne inbox.read — das Host-RBAC greift auch für das echte Modul", async () => {
    const app = await baueEchtModulApp(
      new InMemoryNotificationStore(),
      macheSession({ permissions: [] }),
    );
    try {
      const res = await app.inject({
        method: "GET",
        url: "/api/notifications",
      });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("POST /api/notifications/:id/read markiert gelesen → 204", async () => {
    const store = new InMemoryNotificationStore();
    await store.insertNotification(
      macheNotification({ notificationId: "n1", read: false }),
    );
    const app = await baueEchtModulApp(store, macheSession());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/notifications/n1/read",
      });
      expect(res.statusCode).toBe(204);
      const ungelesen = await store.listNotifications({
        tenantId: "t1",
        unreadOnly: true,
      });
      expect(ungelesen.map((n) => n.notificationId)).not.toContain("n1");
    } finally {
      await app.close();
    }
  });
});
