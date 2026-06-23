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
export declare const defaultMockUserId = "citizen-anna-muster";
export declare const mockIssuedAt = "2026-06-23T08:00:00.000Z";
export declare const mockUsers: readonly [{
    readonly id: "citizen-anna-muster";
    readonly kind: "citizen";
    readonly displayName: "Anna Muster";
    readonly email: "anna.muster@example.invalid";
    readonly roles: readonly ["citizen"];
    readonly authorityId: "authority-musterstadt";
    readonly jurisdictionId: "de-nw-musterstadt";
    readonly locale: "de-DE";
}, {
    readonly id: "caseworker-max-beispiel";
    readonly kind: "caseworker";
    readonly displayName: "Max Beispiel";
    readonly email: "max.beispiel@verwaltung.example.invalid";
    readonly roles: readonly ["caseworker"];
    readonly authorityId: "authority-musterstadt";
    readonly jurisdictionId: "de-nw-musterstadt";
    readonly locale: "de-DE";
}];
export declare function findMockUser(userId: string): MockUser | undefined;
export declare function createAuthenticatedSession(user: MockUser): MockSessionResponse;
export declare function createLoggedOutSession(): MockSessionResponse;
export declare function createWelcomeNotifications(user: MockUser): MockNotificationsResponse;
export declare function createEmptyNotifications(): MockNotificationsResponse;
