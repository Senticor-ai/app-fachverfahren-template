// notification-store — die Persistenz der In-App-Benachrichtigungen (#18). Ein Notification-PROJEKTOR (das ZWEITE
// Backend über der Fan-out-Naht #24) konsumiert getypte Domänen-Events und schreibt daraus dauerhafte Meldungen;
// dieser Store liefert die Bausteine: idempotent einfügen, „meine (ungelesenen) Meldungen" lesen, gelesen markieren.
//
// Trennung wie bei case-/task-/automation-store: node-safe (kein React/Kit), zwei Laufzeiten mit IDENTISCHER Semantik
// (In-Memory für Tests/DEV, Postgres für PROD), überall mandanten-scoped. IDEMPOTENZ: die notification_id ist
// DETERMINISTISCH aus der event_id abgeleitet → eine at-least-once-Doppelzustellung des Fan-outs erzeugt KEINE
// Dublette (PK-Konflikt → DO NOTHING / In-Memory-Guard).
import { createPooledPgClient } from "./client.js";

export interface AppNotification {
  notificationId: string;
  tenantId: string;
  authorityId: string;
  /** Empfänger (actor_id) oder `null` = an die zuständige Stelle (rollen-/zuständigkeitsbasiert im Client aufgelöst). */
  recipientActorId: string | null;
  eventType: string;
  title: string;
  body: string;
  caseId: string | null;
  taskId: string | null;
  read: boolean;
  createdAt: string;
}

export interface ListNotificationsQuery {
  tenantId: string;
  recipientActorId?: string;
  unreadOnly?: boolean;
  limit?: number;
}

export interface NotificationStore {
  /** Idempotent: gleiche `notificationId` (deterministisch aus event_id) ⇒ keine Dublette. `inserted=false` ⇒ das
   *  Event wurde schon projiziert (at-least-once-Doppelzustellung abgefangen). */
  insertNotification(n: AppNotification): Promise<{ inserted: boolean }>;
  listNotifications(query: ListNotificationsQuery): Promise<AppNotification[]>;
  markRead(input: { tenantId: string; notificationId: string }): Promise<void>;
}

/** Default-Zeilenobergrenze für `listNotifications` OHNE explizites `limit` — EINE Wahrheit für beide Laufzeiten,
 *  damit InMemory und Postgres nie divergieren (Lehre aus #24). */
const NOTIFICATION_LIST_DEFAULT_LIMIT = 200;

// ── In-Memory ─────────────────────────────────────────────────────────────────────────────────────
export class InMemoryNotificationStore implements NotificationStore {
  private readonly items = new Map<string, AppNotification>();

  async insertNotification(n: AppNotification): Promise<{ inserted: boolean }> {
    if (this.items.has(n.notificationId)) return { inserted: false };
    this.items.set(n.notificationId, { ...n });
    return { inserted: true };
  }

  async listNotifications(
    query: ListNotificationsQuery,
  ): Promise<AppNotification[]> {
    const out = [...this.items.values()]
      .filter(
        (n) =>
          n.tenantId === query.tenantId &&
          (query.recipientActorId === undefined ||
            n.recipientActorId === query.recipientActorId) &&
          (query.unreadOnly !== true || !n.read),
      )
      // Neueste zuerst (createdAt DESC) — TIE-STABIL über notification_id, damit InMemory und PG bei gleicher
      // createdAt (der Projektor stempelt viele Meldungen mit derselben occurredAt) DIESELBE Reihenfolge liefern.
      .sort((a, b) =>
        a.createdAt > b.createdAt
          ? -1
          : a.createdAt < b.createdAt
            ? 1
            : a.notificationId < b.notificationId
              ? -1
              : 1,
      );
    return out.slice(0, query.limit ?? NOTIFICATION_LIST_DEFAULT_LIMIT);
  }

  async markRead(input: {
    tenantId: string;
    notificationId: string;
  }): Promise<void> {
    const n = this.items.get(input.notificationId);
    if (!n || n.tenantId !== input.tenantId) return; // mandanten-scoped + idempotent
    this.items.set(input.notificationId, { ...n, read: true });
  }
}

// ── Postgres ──────────────────────────────────────────────────────────────────────────────────────
export class PostgresNotificationStore implements NotificationStore {
  constructor(private readonly databaseUrl: string) {}

  async insertNotification(n: AppNotification): Promise<{ inserted: boolean }> {
    return this.withClient(async (c) => {
      const r = await c.query<{ notification_id: string }>(
        `INSERT INTO app_notifications
           (notification_id, tenant_id, authority_id, recipient_actor_id, event_type, title, body,
            case_id, task_id, read, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (notification_id) DO NOTHING
         RETURNING notification_id`,
        [
          n.notificationId,
          n.tenantId,
          n.authorityId,
          n.recipientActorId,
          n.eventType,
          n.title,
          n.body,
          n.caseId,
          n.taskId,
          n.read,
          n.createdAt,
        ],
      );
      // RETURNING liefert genau dann eine Zeile, wenn NEU eingefügt (bei PK-Konflikt DO NOTHING → 0 Zeilen).
      return { inserted: r.rows.length > 0 };
    });
  }

  async listNotifications(
    query: ListNotificationsQuery,
  ): Promise<AppNotification[]> {
    return this.withClient(async (c) => {
      const r = await c.query<NotificationRow>(
        `SELECT notification_id, tenant_id, authority_id, recipient_actor_id, event_type, title, body,
                case_id, task_id, read, created_at
         FROM app_notifications
         WHERE tenant_id = $1
           AND ($2::text IS NULL OR recipient_actor_id = $2)
           AND ($3::boolean IS NULL OR read = false)
         ORDER BY created_at DESC, notification_id ASC
         LIMIT $4`,
        [
          query.tenantId,
          query.recipientActorId ?? null,
          query.unreadOnly ? true : null,
          query.limit ?? NOTIFICATION_LIST_DEFAULT_LIMIT,
        ],
      );
      return r.rows.map(notificationFromRow);
    });
  }

  async markRead(input: {
    tenantId: string;
    notificationId: string;
  }): Promise<void> {
    await this.withClient((c) =>
      c.query(
        `UPDATE app_notifications SET read = true WHERE notification_id = $1 AND tenant_id = $2`,
        [input.notificationId, input.tenantId],
      ),
    );
  }

  private async withClient<T>(
    cb: (c: import("./client.js").PgClient) => Promise<T>,
  ): Promise<T> {
    const client = await createPooledPgClient(this.databaseUrl);
    await client.connect();
    try {
      return await cb(client);
    } finally {
      await client.end();
    }
  }
}

interface NotificationRow extends Record<string, unknown> {
  notification_id: string;
  tenant_id: string;
  authority_id: string;
  recipient_actor_id: string | null;
  event_type: string;
  title: string;
  body: string;
  case_id: string | null;
  task_id: string | null;
  read: boolean;
  created_at: Date | string;
}

function notificationFromRow(r: NotificationRow): AppNotification {
  return {
    notificationId: r.notification_id,
    tenantId: r.tenant_id,
    authorityId: r.authority_id,
    recipientActorId: r.recipient_actor_id,
    eventType: r.event_type,
    title: r.title,
    body: r.body,
    caseId: r.case_id,
    taskId: r.task_id,
    read: Boolean(r.read),
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}
