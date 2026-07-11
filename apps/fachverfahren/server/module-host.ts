// server/module-host — der ModuleHost (Skalierungsplan „mehrere Backends für unterschiedliche Bereiche", Phase 1a).
//
// Mountet die HTTP-Routen eines FRAMEWORK-AGNOSTISCHEN Modul-Servers (reine Descriptoren + Handler, s.
// @senticor/public-sector-sdk `ModuleServer`) auf Fastify und reproduziert dabei EXAKT das server-autoritative
// Enforcement des Monolithen über die gehobenen http-guards: Session (401) → Tenant-Pinning (403) →
// requiredPermissions (403) → VOR-GESCOPTE Ports → handle → ModuleResult→HTTP. Der Host lebt in `apps/` (darf
// Fastify/Stores), das Modul NICHT — so bleibt die Modul-Fläche framework-agnostisch (module-boundaries).
//
// Phase 1a = die MOUNT-NAHT + der VOR-GESCOPTE NotificationPort, bewiesen per Fastify-inject (Fixture). Discovery
// (APP_MODULES + dynamischer import gebauter Module), das echte modules/notification, der Cutover und die
// Consumer-/Migrations-Registrierung folgen in Phase 1b/2 (s. modulehost-design.md).
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { NotificationStore } from "@senticor/app-store-postgres";
import type {
  ModuleResult,
  ModuleScope,
  ModuleServer,
  ModuleSurface,
  NotificationPort,
} from "@senticor/public-sector-sdk";
import {
  forbidden,
  NO_STORE,
  requireSession,
  scopeFromSession,
  type SessionGuardDeps,
} from "./http-guards.js";

/** Die Host-Naht: die Session-Guards (für `requireSession`) plus die (optionalen) Stores, aus denen der Host je Request
 *  die VOR-GESCOPTEN Ports baut. `DomainApiDeps` erfüllt sie strukturell. */
export interface ModuleHostDeps extends SessionGuardDeps {
  notificationStore?: NotificationStore;
}

/** VOR-GESCOPTER NotificationPort: der Mandant ist an die Session gebunden (Closure) — der Handler kann keinen fremden
 *  Mandanten adressieren, weil die Port-Methoden `tenantId` gar nicht annehmen (Fix-First #1). Die Meldungen bleiben
 *  opak (Server-Objekte durchgereicht) → das Modul importiert keinen Store-Typ. */
export function buildNotificationPort(
  store: NotificationStore,
  scope: ModuleScope,
): NotificationPort {
  // Mandant EINMAL zum Build-Zeitpunkt fixieren (nicht lazy aus `scope` lesen) — selbst wenn ein Handler `ctx.scope`
  // umschriebe, bliebe der Port an DIESEN Mandanten gebunden (Adversarial-Review-Härtung zu Fix-First #1).
  const tenantId = scope.tenantId;
  return {
    list: (input) =>
      store.listNotifications({
        tenantId,
        ...(input.unreadOnly ? { unreadOnly: true } : {}),
      }),
    markRead: (input) =>
      store.markRead({
        tenantId,
        notificationId: input.notificationId,
      }),
  };
}

/** Baut GENAU die in `required` genannten, VOR-GESCOPTEN Ports. Fail-closed: ein Modul, das einen nicht verfügbaren
 *  (oder unbekannten) Port verlangt, scheitert HIER — nie ein stiller `undefined`-Port. */
export function buildModulePorts(
  required: readonly string[],
  deps: ModuleHostDeps,
  scope: ModuleScope,
): Record<string, unknown> {
  const ports: Record<string, unknown> = {};
  for (const name of required) {
    if (name === "notification") {
      if (!deps.notificationStore)
        throw new Error(
          'module-host: Port "notification" verlangt, aber kein notificationStore konfiguriert',
        );
      ports[name] = buildNotificationPort(deps.notificationStore, scope);
    } else {
      throw new Error(
        `module-host: unbekannter Port "${name}" (Phase 1a kennt nur "notification")`,
      );
    }
  }
  return ports;
}

/** Übersetzt ein `ModuleResult` in eine HTTP-Antwort (immer `no-store`, wie der Monolith). */
function sendResult(reply: FastifyReply, result: ModuleResult): FastifyReply {
  reply.header("Cache-Control", NO_STORE);
  if (result.ok) {
    reply.code(result.status ?? 200);
    return result.body === undefined ? reply.send() : reply.send(result.body);
  }
  return reply.code(result.status).send({
    error: result.error,
    ...(result.reason ? { reason: result.reason } : {}),
  });
}

/** Zonen, die auf den PUBLIC-Server gehören. `internal` ist bewusst ausgeschlossen (gehört auf den internen Server —
 *  `/internal/*` darf nie über den Public-Ingress erreichbar sein). */
const PUBLIC_SURFACES: readonly ModuleSurface[] = [
  "citizen",
  "caseworker",
  "audit",
];

/** Mountet die Routen EINES Moduls, GEFILTERT auf die erlaubten Zonen (Default: die Public-Zonen ohne `internal`).
 *  Je Route: der volle Guard-Pfad, dann PRO REQUEST die vor-gescopten Ports (Scope aus DIESER Session) und der reine
 *  Handler. Eine Route einer nicht erlaubten Zone wird NICHT registriert (Zonen-Trennung, Adversarial-Review-Härtung). */
export function mountModule(
  app: FastifyInstance,
  module: ModuleServer,
  deps: ModuleHostDeps,
  opts: { surfaces?: readonly ModuleSurface[] } = {},
): void {
  const surfaces = opts.surfaces ?? PUBLIC_SURFACES;
  for (const route of module.routes ?? []) {
    if (!surfaces.includes(route.surface)) continue; // Zonen-Routing: falsche Zone ⇒ hier nicht mounten
    const handler = async (request: FastifyRequest, reply: FastifyReply) => {
      const session = requireSession(deps, request, reply);
      if (!session) return reply; // 401 / Tenant-Pinning-403 bereits gesendet
      // RBAC-UND: ALLE Rechte müssen vorliegen. `!== undefined` (nicht `if(missing)`) — sonst fiele ein Leerstring-Recht
      // fail-OPEN durch (Adversarial-Review-Härtung).
      const missing = route.requiredPermissions.find(
        (p) => !session.permissions.includes(p),
      );
      if (missing !== undefined)
        return forbidden(reply, `missing permission ${missing}`);
      const scope = scopeFromSession(session);
      const ports = buildModulePorts(module.requiredPorts, deps, scope);
      const result = await route.handle({
        scope,
        params: (request.params ?? {}) as Record<string, string>,
        query: (request.query ?? {}) as Record<string, string>,
        body: request.body,
        requestId: request.id,
        ports,
      });
      return sendResult(reply, result);
    };
    // Explizites Dispatch (typsicher) statt dynamischem app[method].
    switch (route.method) {
      case "GET":
        app.get(route.path, handler);
        break;
      case "POST":
        app.post(route.path, handler);
        break;
      case "PATCH":
        app.patch(route.path, handler);
        break;
      case "DELETE":
        app.delete(route.path, handler);
        break;
    }
  }
}

/** Mountet mehrere Module (Reihenfolge = Discovery-Reihenfolge; Routen-Kollision fällt Fastify-seitig fail-closed). */
export function mountModules(
  app: FastifyInstance,
  modules: readonly ModuleServer[],
  deps: ModuleHostDeps,
  opts: { surfaces?: readonly ModuleSurface[] } = {},
): void {
  for (const m of modules) mountModule(app, m, deps, opts);
}
