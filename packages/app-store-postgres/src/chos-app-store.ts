// chos-app-store — der AppStore-Adapter auf den chos-Graph-Store: Nutzer-Präferenzen (Theme/A11y/Navigation)
// und Postfach-Nachrichten als chos-Entities. Präferenzen = Upsert je (tenant, actor) mit Default-Fallback +
// flachem Merge (dieselbe `mergeUserPreferences`-Wahrheit wie InMemory/Postgres); Postfach = Upsert je
// messageId mit scope-/box-/audience-Filter. Gewählt via APP_STORE_MODE=chos; Postgres bleibt der OSS-Default.
import { type ChosClient } from "./chos-client.js";
import {
  mergeUserPreferences,
  type AppStore,
  type ColorSchemePreference,
  type MailboxAudience,
  type MailboxBox,
  type MailboxMessage,
  type MailboxMessageStatus,
  type MailboxQuery,
  type UserPreferences,
  type UserPreferencesUpdate,
} from "./app-store.js";
import { createDefaultUserPreferences } from "./preferences.js";

const PREFS = "app_user_preferences";
const MAILBOX = "app_mailbox_messages";

function boolOf(value: unknown): boolean {
  return value === true;
}

function prefsToBody(p: UserPreferences): Record<string, unknown> {
  return {
    ...p,
    accessibility: { ...p.accessibility },
    navigation: { ...p.navigation },
  };
}

function bodyToPrefs(body: Record<string, unknown>): UserPreferences {
  const a = (body["accessibility"] ?? {}) as Record<string, unknown>;
  const n = (body["navigation"] ?? {}) as Record<string, unknown>;
  return {
    actorId: String(body["actorId"]),
    tenantId: String(body["tenantId"]),
    colorScheme: String(body["colorScheme"]) as ColorSchemePreference,
    accessibility: {
      highContrast: boolOf(a["highContrast"]),
      largeText: boolOf(a["largeText"]),
      reducedMotion: boolOf(a["reducedMotion"]),
      reducedDensity: boolOf(a["reducedDensity"]),
    },
    navigation: {
      sidebarAutoExpand: boolOf(n["sidebarAutoExpand"]),
    },
    updatedAt: String(body["updatedAt"]),
  };
}

function messageToBody(m: MailboxMessage): Record<string, unknown> {
  return { ...m };
}

function bodyToMessage(body: Record<string, unknown>): MailboxMessage {
  return {
    messageId: String(body["messageId"]),
    box: String(body["box"]) as MailboxBox,
    audience: String(body["audience"]) as MailboxAudience,
    tenantId: String(body["tenantId"]),
    authorityId: String(body["authorityId"]),
    jurisdictionId: String(body["jurisdictionId"]),
    ownerActorId: String(body["ownerActorId"]),
    caseId:
      body["caseId"] === null || body["caseId"] === undefined
        ? null
        : String(body["caseId"]),
    subject: String(body["subject"]),
    bodyPreview: String(body["bodyPreview"]),
    status: String(body["status"]) as MailboxMessageStatus,
    createdAt: String(body["createdAt"]),
  };
}

export class ChosAppStore implements AppStore {
  constructor(private readonly client: ChosClient) {}

  async getUserPreferences(input: {
    tenantId: string;
    actorId: string;
  }): Promise<UserPreferences> {
    const found = await this.client.getEntity({
      collection: PREFS,
      tenantId: input.tenantId,
      id: input.actorId,
    });
    return found
      ? bodyToPrefs(found.body)
      : createDefaultUserPreferences(input.actorId, input.tenantId);
  }

  async saveUserPreferences(input: {
    tenantId: string;
    actorId: string;
    update: UserPreferencesUpdate;
  }): Promise<UserPreferences> {
    const current = await this.getUserPreferences(input);
    const next = mergeUserPreferences(current, input.update);
    await this.client.putEntity({
      collection: PREFS,
      tenantId: input.tenantId,
      id: input.actorId,
      version: 1,
      body: prefsToBody(next),
    });
    return next;
  }

  async listMailboxMessages(query: MailboxQuery): Promise<MailboxMessage[]> {
    const all = await this.client.listEntities({
      collection: MAILBOX,
      tenantId: query.tenantId,
    });
    return all
      .map((e) => bodyToMessage(e.body))
      .filter((message) => {
        if (message.box !== query.box || message.audience !== query.audience)
          return false;
        return query.scope === "owner"
          ? message.ownerActorId === query.actorId
          : message.authorityId === query.authorityId;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, query.limit ?? 50);
  }

  async saveMailboxMessage(message: MailboxMessage): Promise<MailboxMessage> {
    await this.client.putEntity({
      collection: MAILBOX,
      tenantId: message.tenantId,
      id: message.messageId,
      version: 1,
      body: messageToBody(message),
    });
    return message;
  }
}
