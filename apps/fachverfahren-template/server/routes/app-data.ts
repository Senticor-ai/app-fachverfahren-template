import type {
  AppStore,
  MailboxAudience,
  MailboxBox,
} from "@senticor/app-store-postgres";
import { hasPermission } from "@senticor/public-sector-sdk";
import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
} from "fastify";
import type {
  UserPreferences,
  UserPreferencesUpdate,
} from "../../shared/app-contracts.js";
import type { MockUser } from "../../shared/mock-data.js";
import type { SessionStore } from "../session-store.js";

export interface AppDataRoutesOptions {
  appStore: AppStore;
  sessionStore: SessionStore;
}

const preferencesResponseSchema = {
  type: "object",
  required: ["preferences"],
  properties: {
    preferences: {
      type: "object",
      required: [
        "actorId",
        "tenantId",
        "colorScheme",
        "accessibility",
        "navigation",
        "updatedAt",
      ],
      properties: {
        actorId: { type: "string" },
        tenantId: { type: "string" },
        colorScheme: { type: "string", enum: ["light", "dark", "system"] },
        accessibility: {
          type: "object",
          required: [
            "highContrast",
            "largeText",
            "reducedMotion",
            "reducedDensity",
          ],
          properties: {
            highContrast: { type: "boolean" },
            largeText: { type: "boolean" },
            reducedMotion: { type: "boolean" },
            reducedDensity: { type: "boolean" },
          },
        },
        navigation: {
          type: "object",
          required: ["sidebarAutoExpand"],
          properties: {
            sidebarAutoExpand: { type: "boolean" },
          },
        },
        updatedAt: { type: "string" },
      },
    },
  },
} as const;

const preferencesUpdateSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    colorScheme: { type: "string", enum: ["light", "dark", "system"] },
    accessibility: {
      type: "object",
      additionalProperties: false,
      properties: {
        highContrast: { type: "boolean" },
        largeText: { type: "boolean" },
        reducedMotion: { type: "boolean" },
        reducedDensity: { type: "boolean" },
      },
    },
    navigation: {
      type: "object",
      additionalProperties: false,
      properties: {
        sidebarAutoExpand: { type: "boolean" },
      },
    },
  },
} as const;

const mailboxResponseSchema = {
  type: "object",
  required: ["box", "audience", "messages"],
  properties: {
    box: { type: "string", enum: ["inbox", "outbox"] },
    audience: { type: "string", enum: ["citizen", "caseworker"] },
    messages: {
      type: "array",
      items: {
        type: "object",
        required: [
          "messageId",
          "box",
          "audience",
          "tenantId",
          "authorityId",
          "jurisdictionId",
          "ownerActorId",
          "caseId",
          "subject",
          "bodyPreview",
          "status",
          "createdAt",
        ],
        properties: {
          messageId: { type: "string" },
          box: { type: "string" },
          audience: { type: "string" },
          tenantId: { type: "string" },
          authorityId: { type: "string" },
          jurisdictionId: { type: "string" },
          ownerActorId: { type: "string" },
          caseId: { anyOf: [{ type: "string" }, { type: "null" }] },
          subject: { type: "string" },
          bodyPreview: { type: "string" },
          status: { type: "string" },
          createdAt: { type: "string" },
        },
      },
    },
  },
} as const;

const errorResponseSchema = {
  type: "object",
  required: ["ok", "error"],
  properties: {
    ok: { type: "boolean" },
    error: { type: "string" },
    requestId: { type: "string" },
  },
} as const;

export const appDataRoutes: FastifyPluginAsync<AppDataRoutesOptions> = async (
  app,
  options,
) => {
  const { appStore, sessionStore } = options;

  app.get(
    "/api/v1/me/preferences",
    {
      schema: {
        tags: ["User Preferences"],
        summary: "Get user preferences",
        response: {
          200: preferencesResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const user = requireUser(sessionStore, reply);
      if (!user) {
        return reply;
      }
      if (!allow(user, "preferences.read", reply)) {
        return reply;
      }

      return {
        preferences: await appStore.getUserPreferences({
          tenantId: tenantIdFor(user),
          actorId: user.id,
        }),
      };
    },
  );

  app.put<{ Body: UserPreferencesUpdate }>(
    "/api/v1/me/preferences",
    {
      schema: {
        tags: ["User Preferences"],
        summary: "Update user preferences",
        body: preferencesUpdateSchema,
        response: {
          200: preferencesResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = requireUser(sessionStore, reply);
      if (!user) {
        return reply;
      }
      if (!allow(user, "preferences.write", reply)) {
        return reply;
      }

      return {
        preferences: await appStore.saveUserPreferences({
          tenantId: tenantIdFor(user),
          actorId: user.id,
          update: request.body,
        }),
      } satisfies { preferences: UserPreferences };
    },
  );

  registerMailboxRoute(app, {
    methodPath: "/api/v1/me/posteingang",
    box: "inbox",
    audience: "citizen",
    permission: "mailbox.own.read",
    scope: "owner",
    sessionStore,
    appStore,
    summary: "Get citizen Posteingang",
  });
  registerMailboxRoute(app, {
    methodPath: "/api/v1/me/ausgang",
    box: "outbox",
    audience: "citizen",
    permission: "mailbox.own.read",
    scope: "owner",
    sessionStore,
    appStore,
    summary: "Get citizen Ausgang",
  });
  registerMailboxRoute(app, {
    methodPath: "/api/v1/work/posteingang",
    box: "inbox",
    audience: "caseworker",
    permission: "mailbox.authority.read",
    scope: "authority",
    sessionStore,
    appStore,
    summary: "Get caseworker Posteingang",
  });
  registerMailboxRoute(app, {
    methodPath: "/api/v1/work/ausgang",
    box: "outbox",
    audience: "caseworker",
    permission: "mailbox.authority.read",
    scope: "authority",
    sessionStore,
    appStore,
    summary: "Get caseworker Ausgang",
  });
};

interface RegisterMailboxRouteOptions {
  methodPath: string;
  box: MailboxBox;
  audience: MailboxAudience;
  permission: string;
  scope: "owner" | "authority";
  sessionStore: SessionStore;
  appStore: AppStore;
  summary: string;
}

function registerMailboxRoute(
  app: FastifyInstance,
  options: RegisterMailboxRouteOptions,
) {
  app.get(
    options.methodPath,
    {
      schema: {
        tags: ["Mailbox"],
        summary: options.summary,
        response: {
          200: mailboxResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const user = requireUser(options.sessionStore, reply);
      if (!user) {
        return reply;
      }
      if (!allow(user, options.permission, reply)) {
        return reply;
      }

      return {
        box: options.box,
        audience: options.audience,
        messages: await options.appStore.listMailboxMessages({
          tenantId: tenantIdFor(user),
          authorityId: user.authorityId,
          actorId: user.id,
          audience: options.audience,
          box: options.box,
          scope: options.scope,
        }),
      };
    },
  );
}

function requireUser(
  sessionStore: SessionStore,
  reply: FastifyReply,
): MockUser | null {
  const user = sessionStore.getActiveUser();
  if (!user) {
    reply.code(401).send({ ok: false, error: "authentication_required" });
    return null;
  }
  return user;
}

function allow(
  user: MockUser,
  permission: string,
  reply: FastifyReply,
): boolean {
  if (hasPermission(user.roles, permission)) {
    return true;
  }

  reply.code(403).send({ ok: false, error: "permission_denied" });
  return false;
}

function tenantIdFor(user: MockUser): string {
  return `${user.authorityId}:${user.jurisdictionId}`;
}
