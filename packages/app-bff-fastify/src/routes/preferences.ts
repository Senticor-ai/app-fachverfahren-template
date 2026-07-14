// GET/PUT /api/preferences — Benutzereinstellungen des EIGENEN Kontos. Mandant und
// Actor kommen IMMER aus der Sitzung (nie aus Body/Query, siehe Contracts); der
// Schreibpfad emittiert genau EIN AppDataAuditEvent NACH erfolgreicher Persistenz.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ErrorEnvelopeSchema,
  UserPreferencesDtoSchema,
  UserPreferencesUpdateSchema,
} from "@senticor/app-bff-contracts";
import type { UserPreferences } from "@senticor/app-store-postgres";
import {
  builtInPermissions,
  createAppDataAuditEvent,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";
import { storeUnavailable } from "../store-error.js";

export function registerPreferencesRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const readAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.preferencesRead.permission },
    deps,
  );
  typed.get(
    "/api/preferences",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["preferences"],
        summary: "Eigene Benutzereinstellungen lesen",
        response: {
          200: UserPreferencesDtoSchema,
          401: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let preferences: UserPreferences;
      try {
        preferences = await deps.appStore.getUserPreferences({
          tenantId: session.tenantId,
          actorId: session.actorId,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.send(preferences);
    },
  );

  const writeAuth = bffRouteAuth(
    {
      kind: "rbac",
      permission: builtInPermissions.preferencesWrite.permission,
    },
    deps,
  );
  typed.put(
    "/api/preferences",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["preferences"],
        summary: "Eigene Benutzereinstellungen ändern (partiell)",
        body: UserPreferencesUpdateSchema,
        response: {
          200: UserPreferencesDtoSchema,
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let preferences: UserPreferences;
      try {
        preferences = await deps.appStore.saveUserPreferences({
          tenantId: session.tenantId,
          actorId: session.actorId,
          update: request.body,
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      await deps.auditSink.emit({
        kind: "app-data",
        event: createAppDataAuditEvent({
          eventType: "preferences.updated",
          actorId: session.actorId,
          tenantId: session.tenantId,
          requestId: requestIdOf(request),
          summary: "Benutzereinstellungen aktualisiert",
          resource: { type: "preferences", id: session.actorId },
        }),
      });
      return reply.send(preferences);
    },
  );
}
