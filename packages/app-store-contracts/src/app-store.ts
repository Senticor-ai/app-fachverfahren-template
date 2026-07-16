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

export interface MailboxQuery {
  box: MailboxBox;
  audience: MailboxAudience;
  tenantId: string;
  authorityId: string;
  actorId: string;
  scope: "owner" | "authority";
  limit?: number;
}

/** Provider-neutral preferences + mailbox store. */
export interface AppStore {
  getUserPreferences(input: {
    tenantId: string;
    actorId: string;
  }): Promise<UserPreferences>;
  saveUserPreferences(input: {
    tenantId: string;
    actorId: string;
    update: UserPreferencesUpdate;
  }): Promise<UserPreferences>;
  listMailboxMessages(query: MailboxQuery): Promise<MailboxMessage[]>;
  saveMailboxMessage(message: MailboxMessage): Promise<MailboxMessage>;
}
