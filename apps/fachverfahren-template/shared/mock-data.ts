export type MockUserKind = "citizen" | "caseworker";

export type MockUserRole = "citizen" | "caseworker";

export type MockNotificationSeverity = "info" | "success" | "warning";

export interface MockUser {
  id: string;
  kind: MockUserKind;
  displayName: string;
  email: string;
  roles: readonly MockUserRole[];
  authorityId: string;
  jurisdictionId: string;
  locale: string;
}

export interface MockSessionResponse {
  authenticated: boolean;
  user: MockUser | null;
  issuedAt: string | null;
}

export interface MockNotification {
  id: string;
  severity: MockNotificationSeverity;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface MockNotificationsResponse {
  notifications: readonly MockNotification[];
}

export interface LoginRequest {
  userId?: string;
}

export const defaultMockUserId = "citizen-anna-muster";

export const mockIssuedAt = "2026-06-23T08:00:00.000Z";

export const mockUsers = [
  {
    id: defaultMockUserId,
    kind: "citizen",
    displayName: "Anna Muster",
    email: "anna.muster@example.invalid",
    roles: ["citizen"],
    authorityId: "authority-musterstadt",
    jurisdictionId: "de-nw-musterstadt",
    locale: "de-DE",
  },
  {
    id: "caseworker-max-beispiel",
    kind: "caseworker",
    displayName: "Max Beispiel",
    email: "max.beispiel@verwaltung.example.invalid",
    roles: ["caseworker"],
    authorityId: "authority-musterstadt",
    jurisdictionId: "de-nw-musterstadt",
    locale: "de-DE",
  },
] as const satisfies readonly MockUser[];

export function findMockUser(userId: string): MockUser | undefined {
  return mockUsers.find((user) => user.id === userId);
}

export function createAuthenticatedSession(
  user: MockUser,
): MockSessionResponse {
  return {
    authenticated: true,
    user,
    issuedAt: mockIssuedAt,
  };
}

export function createLoggedOutSession(): MockSessionResponse {
  return {
    authenticated: false,
    user: null,
    issuedAt: null,
  };
}

export function createWelcomeNotifications(
  user: MockUser,
): MockNotificationsResponse {
  const workspaceMessage =
    user.kind === "caseworker"
      ? "Ihr Eingang und die zugewiesenen Vorgänge sind geladen."
      : "Ihre Vorgänge und Nachrichten sind geladen.";

  return {
    notifications: [
      {
        id: `welcome-${user.id}`,
        severity: "success",
        title: "Willkommen",
        body: "Sie sind angemeldet und können den Arbeitsbereich nutzen.",
        createdAt: mockIssuedAt,
        readAt: null,
      },
      {
        id: `profile-${user.id}`,
        severity: "info",
        title: "Arbeitsbereich geladen",
        body: workspaceMessage,
        createdAt: mockIssuedAt,
        readAt: null,
      },
    ],
  };
}

export function createEmptyNotifications(): MockNotificationsResponse {
  return { notifications: [] };
}
