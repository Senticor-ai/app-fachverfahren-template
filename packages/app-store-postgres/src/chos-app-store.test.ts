// chos-app-store.test — der AppStore-chos-Adapter (Präferenzen + Postfach) über den Fake-Graph.
import { describe, expect, it } from "vitest";
import { ChosAppStore } from "./chos-app-store.js";
import { InMemoryChosClient } from "./chos-client.js";
import type { MailboxMessage } from "./app-store.js";

function msg(
  over: Partial<MailboxMessage> & Pick<MailboxMessage, "messageId">,
): MailboxMessage {
  return {
    box: "inbox",
    audience: "citizen",
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    ownerActorId: "owner1",
    caseId: null,
    subject: "s",
    bodyPreview: "p",
    status: "unread",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("ChosAppStore — Präferenzen", () => {
  it("Default-Fallback ohne Eintrag; Merge-Upsert überlebt den Roundtrip", async () => {
    const s = new ChosAppStore(new InMemoryChosClient());
    const def = await s.getUserPreferences({ tenantId: "t1", actorId: "a1" });
    expect(def.actorId).toBe("a1");
    const saved = await s.saveUserPreferences({
      tenantId: "t1",
      actorId: "a1",
      update: { colorScheme: "dark", accessibility: { highContrast: true } },
    });
    expect(saved.colorScheme).toBe("dark");
    expect(saved.accessibility.highContrast).toBe(true);
    const reread = await s.getUserPreferences({
      tenantId: "t1",
      actorId: "a1",
    });
    expect(reread.colorScheme).toBe("dark");
    expect(reread.accessibility.highContrast).toBe(true);
    // Merge: eine spätere Teiländerung lässt die zuvor gesetzten Felder stehen.
    const merged = await s.saveUserPreferences({
      tenantId: "t1",
      actorId: "a1",
      update: { navigation: { sidebarAutoExpand: true } },
    });
    expect(merged.colorScheme).toBe("dark");
    expect(merged.navigation.sidebarAutoExpand).toBe(true);
  });
});

describe("ChosAppStore — Postfach", () => {
  it("Upsert + scope/box/audience-Filter + absteigend sortiert", async () => {
    const s = new ChosAppStore(new InMemoryChosClient());
    await s.saveMailboxMessage(
      msg({ messageId: "m1", createdAt: "2026-01-01T00:00:00.000Z" }),
    );
    await s.saveMailboxMessage(
      msg({ messageId: "m2", createdAt: "2026-01-02T00:00:00.000Z" }),
    );
    await s.saveMailboxMessage(
      msg({ messageId: "m3", ownerActorId: "anderer" }),
    );
    const query = {
      box: "inbox" as const,
      audience: "citizen" as const,
      tenantId: "t1",
      authorityId: "b1",
      actorId: "owner1",
      scope: "owner" as const,
    };
    const owned = await s.listMailboxMessages(query);
    expect(owned.map((m) => m.messageId)).toEqual(["m2", "m1"]);
    // Upsert (kein Insert): dieselbe messageId ändert nur den Status.
    await s.saveMailboxMessage(msg({ messageId: "m1", status: "read" }));
    const after = await s.listMailboxMessages(query);
    expect(after).toHaveLength(2);
    expect(after.find((m) => m.messageId === "m1")?.status).toBe("read");
  });
});
