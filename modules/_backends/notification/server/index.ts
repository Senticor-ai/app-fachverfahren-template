// modules/_backends/notification/server — das ERSTE ECHTE Domänen-Backend als ModuleServer (ModuleHost Phase 1b-ii,
// „mehrere Backends für unterschiedliche Bereiche"). Es liefert die In-App-Benachrichtigungs-Routen (bisher im
// Monolithen, domain-api.ts) als FRAMEWORK-AGNOSTISCHE Descriptoren + reine Handler `(ctx) => ModuleResult`.
//
// Der `_backends/`-Ort ist bewusst: der `_`-Präfix lässt `check:domain-contracts` (verlangt für echte Fach-Domänen
// modules/<x> das 9-Dir-Regime + Screen-Contracts) diesen Ordner ÜBERSPRINGEN, während `check:module-boundaries`
// (verbietet in modules/* jeden `pg`/app-store-postgres/Provider-Import) WEITER greift. So bleibt die Modul-Fläche
// framework-/infrastruktur-agnostisch: dieses Modul importiert AUSSCHLIESSLICH den SDK-Vertrag. Der Host
// (apps/*/server/module-host) mountet die Routen, setzt Session/RBAC durch und injiziert den VOR-GESCOPTEN
// NotificationPort (Mandant an die Session gebunden — der Handler kann keinen fremden Mandanten adressieren).
import type {
  ModuleServer,
  NotificationPort,
  RouteDescriptor,
} from "@senticor/public-sector-sdk";

/** Die von diesem Modul verlangten, VOR-GESCOPTEN Ports (der Host baut GENAU diese). */
export interface NotificationModulePorts {
  notification: NotificationPort;
}

const routes: readonly RouteDescriptor<NotificationModulePorts>[] = [
  {
    method: "GET",
    path: "/api/notifications",
    surface: "caseworker",
    operationId: "notification.list",
    requiredPermissions: ["inbox.read"],
    handle: async (ctx) => ({
      ok: true,
      body: {
        notifications: await ctx.ports.notification.list({
          unreadOnly: ctx.query["unread"] === "true",
        }),
      },
    }),
  },
  {
    method: "POST",
    path: "/api/notifications/:id/read",
    surface: "caseworker",
    operationId: "notification.markRead",
    requiredPermissions: ["inbox.read"],
    // markRead ist im Store mandanten-scoped + idempotent (fremde/unbekannte id ⇒ no-op) → immer 204.
    handle: async (ctx) => {
      await ctx.ports.notification.markRead({
        notificationId: ctx.params["id"] ?? "",
      });
      return { ok: true, status: 204 };
    },
  },
];

/** Der Modul-Server (der Host liest `server` ODER `default`; moduleId MUSS dem APP_MODULES-Eintrag entsprechen). */
export const server: ModuleServer<NotificationModulePorts> = {
  moduleId: "notification",
  requiredPorts: ["notification"],
  routes,
};

export default server;
