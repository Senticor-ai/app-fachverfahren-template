import { http, HttpResponse } from "msw";
import {
  createDefaultUserPreferences,
  type MailboxMessage,
  type UserPreferences,
  type UserPreferencesUpdate,
} from "../../shared/app-contracts.js";
import {
  createAuthenticatedSession,
  createEmptyNotifications,
  createLoggedOutSession,
  createWelcomeNotifications,
  defaultMockUserId,
  findMockUser,
  type LoginRequest,
  type MockUser,
} from "../../shared/mock-data.js";

let activeUserId: string | null = null;
const preferencesByUserId = new Map<string, UserPreferences>();

export function resetMockSessionState(userId: string | null = null): void {
  activeUserId = userId;
  preferencesByUserId.clear();
}

export function getActiveMockUser(): MockUser | null {
  return activeUserId ? (findMockUser(activeUserId) ?? null) : null;
}

export const sessionHandlers = [
  http.get("*/api/v1/session", () => {
    const user = getActiveMockUser();
    return HttpResponse.json(
      user ? createAuthenticatedSession(user) : createLoggedOutSession(),
    );
  }),

  http.post("*/api/v1/session/login", async ({ request }) => {
    const body = await readLoginRequest(request);
    const user = findMockUser(body.userId ?? defaultMockUserId);

    if (!user) {
      return HttpResponse.json(
        { error: "mock_user_not_found" },
        { status: 404 },
      );
    }

    activeUserId = user.id;
    return HttpResponse.json(createAuthenticatedSession(user));
  }),

  http.post("*/api/v1/session/logout", () => {
    resetMockSessionState();
    return HttpResponse.json(createLoggedOutSession());
  }),

  http.get("*/api/v1/notifications", () => {
    const user = getActiveMockUser();
    return HttpResponse.json(
      user ? createWelcomeNotifications(user) : createEmptyNotifications(),
    );
  }),

  http.get("*/api/v1/me/preferences", () => {
    const user = getActiveMockUser();
    if (!user) {
      return HttpResponse.json(
        { ok: false, error: "authentication_required" },
        { status: 401 },
      );
    }
    return HttpResponse.json({
      preferences: preferencesForUser(user),
    });
  }),

  http.put("*/api/v1/me/preferences", async ({ request }) => {
    const user = getActiveMockUser();
    if (!user) {
      return HttpResponse.json(
        { ok: false, error: "authentication_required" },
        { status: 401 },
      );
    }

    const update = await readPreferencesUpdate(request);
    const current = preferencesForUser(user);
    const next: UserPreferences = {
      ...current,
      ...(update.colorScheme ? { colorScheme: update.colorScheme } : {}),
      accessibility: {
        ...current.accessibility,
        ...update.accessibility,
      },
      navigation: {
        ...current.navigation,
        ...update.navigation,
      },
      updatedAt: new Date().toISOString(),
    };
    preferencesByUserId.set(user.id, next);
    return HttpResponse.json({ preferences: next });
  }),

  http.get("*/api/v1/me/posteingang", () =>
    mailboxResponse("citizen", "inbox", "owner"),
  ),

  http.get("*/api/v1/me/ausgang", () =>
    mailboxResponse("citizen", "outbox", "owner"),
  ),

  http.get("*/api/v1/work/posteingang", () =>
    mailboxResponse("caseworker", "inbox", "authority"),
  ),

  http.get("*/api/v1/work/ausgang", () =>
    mailboxResponse("caseworker", "outbox", "authority"),
  ),
];

export const handlers = [...sessionHandlers];

async function readLoginRequest(request: Request): Promise<LoginRequest> {
  try {
    const body: unknown = await request.json();
    if (isLoginRequest(body)) {
      return body;
    }
  } catch {
    return {};
  }
  return {};
}

function isLoginRequest(value: unknown): value is LoginRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as { userId?: unknown };
  return !("userId" in candidate) || typeof candidate.userId === "string";
}

async function readPreferencesUpdate(
  request: Request,
): Promise<UserPreferencesUpdate> {
  try {
    const body: unknown = await request.json();
    if (isPreferencesUpdate(body)) {
      return body;
    }
  } catch {
    return {};
  }
  return {};
}

function isPreferencesUpdate(value: unknown): value is UserPreferencesUpdate {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as {
    colorScheme?: unknown;
    accessibility?: unknown;
    navigation?: unknown;
  };
  const validColor =
    !("colorScheme" in candidate) ||
    candidate.colorScheme === "light" ||
    candidate.colorScheme === "dark" ||
    candidate.colorScheme === "system";
  const validAccessibility =
    !("accessibility" in candidate) ||
    isAccessibilityUpdate(candidate.accessibility);
  const validNavigation =
    !("navigation" in candidate) || isNavigationUpdate(candidate.navigation);
  return validColor && validAccessibility && validNavigation;
}

function isAccessibilityUpdate(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return ["highContrast", "largeText", "reducedMotion", "reducedDensity"].every(
    (key) => !(key in candidate) || typeof candidate[key] === "boolean",
  );
}

function isNavigationUpdate(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    !("sidebarAutoExpand" in candidate) ||
    typeof candidate["sidebarAutoExpand"] === "boolean"
  );
}

function preferencesForUser(user: MockUser): UserPreferences {
  const tenantId = tenantIdFor(user);
  return (
    preferencesByUserId.get(user.id) ??
    createDefaultUserPreferences(user.id, tenantId)
  );
}

function mailboxResponse(
  audience: "citizen" | "caseworker",
  box: "inbox" | "outbox",
  scope: "owner" | "authority",
) {
  const user = getActiveMockUser();
  if (!user) {
    return HttpResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 },
    );
  }

  const hasMailboxRole =
    audience === "citizen"
      ? user.roles.includes("citizen")
      : user.roles.includes("caseworker");

  if (!hasMailboxRole) {
    return HttpResponse.json(
      { ok: false, error: "permission_denied" },
      { status: 403 },
    );
  }

  const messages = mockMailboxMessages.filter((message) => {
    if (
      message.audience !== audience ||
      message.box !== box ||
      message.tenantId !== tenantIdFor(user)
    ) {
      return false;
    }
    return scope === "owner"
      ? message.ownerActorId === user.id
      : message.authorityId === user.authorityId;
  });

  return HttpResponse.json({ box, audience, messages });
}

function tenantIdFor(user: MockUser): string {
  return `${user.authorityId}:${user.jurisdictionId}`;
}

const mockMailboxMessages: MailboxMessage[] = [
  {
    messageId: "msg.citizen.inbox",
    box: "inbox",
    audience: "citizen",
    tenantId: "authority-musterstadt:de-nw-musterstadt",
    authorityId: "authority-musterstadt",
    jurisdictionId: "de-nw-musterstadt",
    ownerActorId: defaultMockUserId,
    caseId: "FV-2026-0017",
    subject: "Rückfrage zu Ihrem Vorgang",
    bodyPreview: "Bitte prüfen Sie die gespeicherten Angaben.",
    status: "unread",
    createdAt: "2026-06-23T10:00:00.000Z",
  },
  {
    messageId: "msg.citizen.outbox",
    box: "outbox",
    audience: "citizen",
    tenantId: "authority-musterstadt:de-nw-musterstadt",
    authorityId: "authority-musterstadt",
    jurisdictionId: "de-nw-musterstadt",
    ownerActorId: defaultMockUserId,
    caseId: "FV-2026-0017",
    subject: "Antwort gesendet",
    bodyPreview: "Ihre Antwort wurde gespeichert.",
    status: "sent",
    createdAt: "2026-06-23T10:10:00.000Z",
  },
  {
    messageId: "msg.caseworker.inbox",
    box: "inbox",
    audience: "caseworker",
    tenantId: "authority-musterstadt:de-nw-musterstadt",
    authorityId: "authority-musterstadt",
    jurisdictionId: "de-nw-musterstadt",
    ownerActorId: "caseworker-max-beispiel",
    caseId: null,
    subject: "Neuer Vorgang im Eingang",
    bodyPreview: "Ein Vorgang wartet auf Sichtung.",
    status: "unread",
    createdAt: "2026-06-23T10:20:00.000Z",
  },
  {
    messageId: "msg.caseworker.outbox",
    box: "outbox",
    audience: "caseworker",
    tenantId: "authority-musterstadt:de-nw-musterstadt",
    authorityId: "authority-musterstadt",
    jurisdictionId: "de-nw-musterstadt",
    ownerActorId: "caseworker-max-beispiel",
    caseId: null,
    subject: "Rückfrage versendet",
    bodyPreview: "Die Rückfrage wurde an die Bürgerin gesendet.",
    status: "sent",
    createdAt: "2026-06-23T10:30:00.000Z",
  },
];
