export type ColorSchemePreference = "light" | "dark" | "system";

export interface UserPreferences {
  actorId: string;
  tenantId: string;
  colorScheme: ColorSchemePreference;
  accessibility: {
    highContrast: boolean;
    largeText: boolean;
    reducedMotion: boolean;
    reducedDensity: boolean;
  };
  navigation: {
    sidebarAutoExpand: boolean;
  };
  updatedAt: string;
}

export interface UserPreferencesUpdate {
  colorScheme?: ColorSchemePreference;
  accessibility?: Partial<UserPreferences["accessibility"]>;
  navigation?: Partial<UserPreferences["navigation"]>;
}

export interface UserPreferencesResponse {
  preferences: UserPreferences;
}

export type MailboxBox = "inbox" | "outbox";

export type MailboxAudience = "citizen" | "caseworker";

export type MailboxMessageStatus = "unread" | "read" | "sent" | "archived";

export interface MailboxMessage {
  messageId: string;
  box: MailboxBox;
  audience: MailboxAudience;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  ownerActorId: string;
  caseId: string | null;
  subject: string;
  bodyPreview: string;
  status: MailboxMessageStatus;
  createdAt: string;
}

export interface MailboxResponse {
  box: MailboxBox;
  audience: MailboxAudience;
  messages: MailboxMessage[];
}

export function createDefaultUserPreferences(
  actorId: string,
  tenantId: string,
  updatedAt = new Date().toISOString(),
): UserPreferences {
  return {
    actorId,
    tenantId,
    colorScheme: "light",
    accessibility: {
      highContrast: false,
      largeText: false,
      reducedMotion: false,
      reducedDensity: false,
    },
    navigation: {
      sidebarAutoExpand: true,
    },
    updatedAt,
  };
}
