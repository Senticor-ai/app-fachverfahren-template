import { describe, it, expect, beforeAll } from "vitest";
import {
  type AppNotification,
  type NotificationStore,
  InMemoryNotificationStore,
  PostgresNotificationStore,
} from "./notification-store.js";

const uid = () => globalThis.crypto.randomUUID();

function macheNotif(over: Partial<AppNotification> = {}): AppNotification {
  return {
    notificationId: `notif-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    recipientActorId: null,
    eventType: "case.eingegangen",
    title: "Neuer Eingang",
    body: "Ein Vorgang ist eingegangen.",
    caseId: "case-1",
    taskId: null,
    read: false,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

const pgUrl = process.env["APP_PG_DIRECT_URL"] ?? process.env["APP_PG_URL"];
const impls: {
  name: string;
  make: () => NotificationStore;
  enabled: boolean;
}[] = [
  {
    name: "InMemoryNotificationStore",
    make: () => new InMemoryNotificationStore(),
    enabled: true,
  },
  {
    name: "PostgresNotificationStore",
    make: () => new PostgresNotificationStore(pgUrl!),
    enabled: Boolean(pgUrl),
  },
];

for (const impl of impls) {
  describe.skipIf(!impl.enabled)(
    `NotificationStore contract — ${impl.name}`,
    () => {
      let store: NotificationStore;
      beforeAll(() => {
        store = impl.make();
      });

      it("insertNotification IDEMPOTENT (gleiche id → keine Dublette), list neueste-zuerst, mandanten-scoped", async () => {
        const tid = `t-${uid()}`;
        const n1 = macheNotif({
          tenantId: tid,
          notificationId: `n-${uid()}`,
          createdAt: "2026-06-01T00:00:01.000Z",
        });
        const n2 = macheNotif({
          tenantId: tid,
          notificationId: `n-${uid()}`,
          createdAt: "2026-06-01T00:00:02.000Z",
        });
        expect((await store.insertNotification(n1)).inserted).toBe(true);
        // At-least-once-Doppelzustellung abgefangen:
        expect((await store.insertNotification(n1)).inserted).toBe(false);
        expect((await store.insertNotification(n2)).inserted).toBe(true);

        // Neueste zuerst (createdAt DESC).
        const liste = await store.listNotifications({ tenantId: tid });
        expect(liste.map((n) => n.notificationId)).toEqual([
          n2.notificationId,
          n1.notificationId,
        ]);
        // Fremder Mandant sieht NICHTS.
        expect(
          await store.listNotifications({ tenantId: `fremd-${uid()}` }),
        ).toHaveLength(0);
      });

      it("unreadOnly + markRead (mandanten-scoped, idempotent)", async () => {
        const tid = `t-${uid()}`;
        const n = macheNotif({ tenantId: tid, notificationId: `n-${uid()}` });
        await store.insertNotification(n);
        expect(
          await store.listNotifications({ tenantId: tid, unreadOnly: true }),
        ).toHaveLength(1);
        // Falscher Mandant → no-op (kein Fremd-Markieren).
        await store.markRead({
          tenantId: "fremd",
          notificationId: n.notificationId,
        });
        expect(
          await store.listNotifications({ tenantId: tid, unreadOnly: true }),
        ).toHaveLength(1);
        // Richtiger Mandant → gelesen.
        await store.markRead({
          tenantId: tid,
          notificationId: n.notificationId,
        });
        expect(
          await store.listNotifications({ tenantId: tid, unreadOnly: true }),
        ).toHaveLength(0);
      });

      it("recipientActorId-Filter (meine Meldungen)", async () => {
        const tid = `t-${uid()}`;
        await store.insertNotification(
          macheNotif({
            tenantId: tid,
            notificationId: `n-${uid()}`,
            recipientActorId: "sb.a",
          }),
        );
        await store.insertNotification(
          macheNotif({
            tenantId: tid,
            notificationId: `n-${uid()}`,
            recipientActorId: null,
          }),
        );
        expect(
          await store.listNotifications({
            tenantId: tid,
            recipientActorId: "sb.a",
          }),
        ).toHaveLength(1);
      });
    },
  );
}
