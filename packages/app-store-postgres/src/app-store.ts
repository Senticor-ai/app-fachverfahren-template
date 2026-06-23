import { createPgClient, type PgClient } from "./client.js";
import { createDefaultUserPreferences } from "./preferences.js";

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

export class PostgresAppStore implements AppStore {
  constructor(private readonly databaseUrl: string) {}

  async getUserPreferences(input: {
    tenantId: string;
    actorId: string;
  }): Promise<UserPreferences> {
    return this.withClient(async (client) => {
      const result = await client.query<UserPreferencesRow>(
        `
          SELECT tenant_id, actor_id, color_scheme, high_contrast, large_text,
                 reduced_motion, reduced_density, navigation_auto_expand,
                 updated_at
          FROM app_user_preferences
          WHERE tenant_id = $1 AND actor_id = $2
        `,
        [input.tenantId, input.actorId],
      );
      const row = result.rows[0];
      return row
        ? userPreferencesFromRow(row)
        : createDefaultUserPreferences(input.actorId, input.tenantId);
    });
  }

  async saveUserPreferences(input: {
    tenantId: string;
    actorId: string;
    update: UserPreferencesUpdate;
  }): Promise<UserPreferences> {
    const current = await this.getUserPreferences(input);
    const next = mergeUserPreferences(current, input.update);

    return this.withClient(async (client) => {
      const result = await client.query<UserPreferencesRow>(
        `
          INSERT INTO app_user_preferences (
            tenant_id, actor_id, color_scheme, high_contrast, large_text,
            reduced_motion, reduced_density, navigation_auto_expand, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
          ON CONFLICT (tenant_id, actor_id) DO UPDATE
          SET color_scheme = EXCLUDED.color_scheme,
              high_contrast = EXCLUDED.high_contrast,
              large_text = EXCLUDED.large_text,
              reduced_motion = EXCLUDED.reduced_motion,
              reduced_density = EXCLUDED.reduced_density,
              navigation_auto_expand = EXCLUDED.navigation_auto_expand,
              updated_at = now()
          RETURNING tenant_id, actor_id, color_scheme, high_contrast,
                    large_text, reduced_motion, reduced_density,
                    navigation_auto_expand, updated_at
        `,
        [
          next.tenantId,
          next.actorId,
          next.colorScheme,
          next.accessibility.highContrast,
          next.accessibility.largeText,
          next.accessibility.reducedMotion,
          next.accessibility.reducedDensity,
          next.navigation.sidebarAutoExpand,
        ],
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error("preferences write returned no row");
      }
      return userPreferencesFromRow(row);
    });
  }

  async listMailboxMessages(query: MailboxQuery): Promise<MailboxMessage[]> {
    return this.withClient(async (client) => {
      const result = await client.query<MailboxMessageRow>(
        `
          SELECT message_id, message_box, audience, tenant_id, authority_id,
                 jurisdiction_id, owner_actor_id, case_id, subject,
                 body_preview, status, created_at
          FROM app_mailbox_messages
          WHERE tenant_id = $1
            AND message_box = $2
            AND audience = $3
            AND (
              ($4 = 'owner' AND owner_actor_id = $5)
              OR ($4 = 'authority' AND authority_id = $6)
            )
          ORDER BY created_at DESC
          LIMIT $7
        `,
        [
          query.tenantId,
          query.box,
          query.audience,
          query.scope,
          query.actorId,
          query.authorityId,
          query.limit ?? 50,
        ],
      );
      return result.rows.map(mailboxMessageFromRow);
    });
  }

  async saveMailboxMessage(message: MailboxMessage): Promise<MailboxMessage> {
    return this.withClient(async (client) => {
      const result = await client.query<MailboxMessageRow>(
        `
          INSERT INTO app_mailbox_messages (
            message_id, tenant_id, authority_id, jurisdiction_id,
            owner_actor_id, case_id, message_box, audience, subject,
            body_preview, status, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (message_id) DO UPDATE
          SET tenant_id = EXCLUDED.tenant_id,
              authority_id = EXCLUDED.authority_id,
              jurisdiction_id = EXCLUDED.jurisdiction_id,
              owner_actor_id = EXCLUDED.owner_actor_id,
              case_id = EXCLUDED.case_id,
              message_box = EXCLUDED.message_box,
              audience = EXCLUDED.audience,
              subject = EXCLUDED.subject,
              body_preview = EXCLUDED.body_preview,
              status = EXCLUDED.status,
              created_at = EXCLUDED.created_at
          RETURNING message_id, message_box, audience, tenant_id, authority_id,
                    jurisdiction_id, owner_actor_id, case_id, subject,
                    body_preview, status, created_at
        `,
        [
          message.messageId,
          message.tenantId,
          message.authorityId,
          message.jurisdictionId,
          message.ownerActorId,
          message.caseId,
          message.box,
          message.audience,
          message.subject,
          message.bodyPreview,
          message.status,
          message.createdAt,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("mailbox message write returned no row");
      }
      return mailboxMessageFromRow(row);
    });
  }

  private async withClient<T>(callback: (client: PgClient) => Promise<T>) {
    const client = await createPgClient(this.databaseUrl);
    await client.connect();
    try {
      return await callback(client);
    } finally {
      await client.end();
    }
  }
}

export class InMemoryAppStore implements AppStore {
  private readonly preferences = new Map<string, UserPreferences>();
  private readonly messages: MailboxMessage[];

  constructor(seed: { messages?: readonly MailboxMessage[] } = {}) {
    this.messages = [...(seed.messages ?? [])];
  }

  async getUserPreferences(input: {
    tenantId: string;
    actorId: string;
  }): Promise<UserPreferences> {
    return (
      this.preferences.get(preferenceKey(input)) ??
      createDefaultUserPreferences(input.actorId, input.tenantId)
    );
  }

  async saveUserPreferences(input: {
    tenantId: string;
    actorId: string;
    update: UserPreferencesUpdate;
  }): Promise<UserPreferences> {
    const current = await this.getUserPreferences(input);
    const next = mergeUserPreferences(current, input.update);
    this.preferences.set(preferenceKey(input), next);
    return next;
  }

  async listMailboxMessages(query: MailboxQuery): Promise<MailboxMessage[]> {
    return this.messages
      .filter((message) => {
        if (
          message.tenantId !== query.tenantId ||
          message.box !== query.box ||
          message.audience !== query.audience
        ) {
          return false;
        }
        return query.scope === "owner"
          ? message.ownerActorId === query.actorId
          : message.authorityId === query.authorityId;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, query.limit ?? 50);
  }

  async saveMailboxMessage(message: MailboxMessage): Promise<MailboxMessage> {
    const existingIndex = this.messages.findIndex(
      (current) => current.messageId === message.messageId,
    );
    if (existingIndex >= 0) {
      this.messages[existingIndex] = message;
    } else {
      this.messages.push(message);
    }
    return message;
  }
}

export class UnavailableAppStore implements AppStore {
  constructor(private readonly reason: string) {}

  async getUserPreferences(): Promise<UserPreferences> {
    throw new Error(this.reason);
  }

  async saveUserPreferences(): Promise<UserPreferences> {
    throw new Error(this.reason);
  }

  async listMailboxMessages(): Promise<MailboxMessage[]> {
    throw new Error(this.reason);
  }

  async saveMailboxMessage(): Promise<MailboxMessage> {
    throw new Error(this.reason);
  }
}

export function createAppStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AppStore {
  const databaseUrl = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  return databaseUrl
    ? new PostgresAppStore(databaseUrl)
    : new UnavailableAppStore(
        "APP_PG_URL or APP_PG_DIRECT_URL is required for app data",
      );
}

interface UserPreferencesRow extends Record<string, unknown> {
  tenant_id: string;
  actor_id: string;
  color_scheme: ColorSchemePreference;
  high_contrast: boolean;
  large_text: boolean;
  reduced_motion: boolean;
  reduced_density: boolean;
  navigation_auto_expand: boolean;
  updated_at: Date | string;
}

interface MailboxMessageRow extends Record<string, unknown> {
  message_id: string;
  message_box: MailboxBox;
  audience: MailboxAudience;
  tenant_id: string;
  authority_id: string;
  jurisdiction_id: string;
  owner_actor_id: string;
  case_id: string | null;
  subject: string;
  body_preview: string;
  status: MailboxMessageStatus;
  created_at: Date | string;
}

function userPreferencesFromRow(row: UserPreferencesRow): UserPreferences {
  return {
    actorId: row.actor_id,
    tenantId: row.tenant_id,
    colorScheme: row.color_scheme,
    accessibility: {
      highContrast: row.high_contrast,
      largeText: row.large_text,
      reducedMotion: row.reduced_motion,
      reducedDensity: row.reduced_density,
    },
    navigation: {
      sidebarAutoExpand: row.navigation_auto_expand,
    },
    updatedAt: toIsoString(row.updated_at),
  };
}

function mailboxMessageFromRow(row: MailboxMessageRow): MailboxMessage {
  return {
    messageId: row.message_id,
    box: row.message_box,
    audience: row.audience,
    tenantId: row.tenant_id,
    authorityId: row.authority_id,
    jurisdictionId: row.jurisdiction_id,
    ownerActorId: row.owner_actor_id,
    caseId: row.case_id,
    subject: row.subject,
    bodyPreview: row.body_preview,
    status: row.status,
    createdAt: toIsoString(row.created_at),
  };
}

function mergeUserPreferences(
  current: UserPreferences,
  update: UserPreferencesUpdate,
): UserPreferences {
  return {
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
}

function preferenceKey(input: { tenantId: string; actorId: string }) {
  return `${input.tenantId}:${input.actorId}`;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}
