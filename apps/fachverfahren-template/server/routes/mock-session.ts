import type { FastifyPluginAsync } from "fastify";
import {
  createAuthenticatedSession,
  createEmptyNotifications,
  createLoggedOutSession,
  createWelcomeNotifications,
  defaultMockUserId,
  findMockUser,
  type LoginRequest,
} from "../../shared/mock-data.js";
import type { SessionStore } from "../session-store.js";

const sessionResponseSchema = {
  type: "object",
  required: ["authenticated", "user", "issuedAt"],
  properties: {
    authenticated: { type: "boolean" },
    user: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          required: [
            "id",
            "kind",
            "displayName",
            "email",
            "roles",
            "authorityId",
            "jurisdictionId",
            "locale",
          ],
          properties: {
            id: { type: "string" },
            kind: { type: "string" },
            displayName: { type: "string" },
            email: { type: "string" },
            roles: { type: "array", items: { type: "string" } },
            authorityId: { type: "string" },
            jurisdictionId: { type: "string" },
            locale: { type: "string" },
          },
        },
      ],
    },
    issuedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
} as const;

const notificationResponseSchema = {
  type: "object",
  required: ["notifications"],
  properties: {
    notifications: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "severity", "title", "body", "createdAt", "readAt"],
        properties: {
          id: { type: "string" },
          severity: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
          createdAt: { type: "string" },
          readAt: { anyOf: [{ type: "string" }, { type: "null" }] },
        },
      },
    },
  },
} as const;

const loginBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    userId: { type: "string" },
  },
} as const;

export interface MockSessionRoutesOptions {
  sessionStore: SessionStore;
}

export const mockSessionRoutes: FastifyPluginAsync<
  MockSessionRoutesOptions
> = async (app, options) => {
  const { sessionStore } = options;

  app.get(
    "/api/v1/session",
    {
      schema: {
        tags: ["Auth"],
        summary: "Get local mock session",
        response: { 200: sessionResponseSchema },
      },
    },
    async () => {
      const user = sessionStore.getActiveUser();
      return user ? createAuthenticatedSession(user) : createLoggedOutSession();
    },
  );

  app.post<{ Body: LoginRequest }>(
    "/api/v1/session/login",
    {
      schema: {
        tags: ["Auth"],
        summary: "Create local mock session",
        body: loginBodySchema,
        response: {
          200: sessionResponseSchema,
          404: {
            type: "object",
            required: ["error"],
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (request, reply) => {
      const user = findMockUser(request.body?.userId ?? defaultMockUserId);

      if (!user) {
        reply.code(404);
        return { error: "mock_user_not_found" };
      }

      sessionStore.setActiveUserId(user.id);
      return createAuthenticatedSession(user);
    },
  );

  app.post(
    "/api/v1/session/logout",
    {
      schema: {
        tags: ["Auth"],
        summary: "Clear local mock session",
        response: { 200: sessionResponseSchema },
      },
    },
    async () => {
      sessionStore.clear();
      return createLoggedOutSession();
    },
  );

  app.get(
    "/api/v1/notifications",
    {
      schema: {
        tags: ["Auth"],
        summary: "Get local mock notifications",
        response: { 200: notificationResponseSchema },
      },
    },
    async () => {
      const user = sessionStore.getActiveUser();
      return user
        ? createWelcomeNotifications(user)
        : createEmptyNotifications();
    },
  );
};
