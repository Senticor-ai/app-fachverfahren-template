import { describe, it, expect, beforeAll } from "vitest";
import {
  type ActorRole,
  type ActorRoleStore,
  InMemoryActorRoleStore,
  PostgresActorRoleStore,
} from "./actor-role-store.js";

const uid = () => globalThis.crypto.randomUUID();

function macheRolle(over: Partial<ActorRole> = {}): ActorRole {
  return {
    tenantId: "t1",
    actorId: `sb-${uid()}`,
    roleKey: "caseworker",
    authorityId: "b1",
    jurisdictionId: "de",
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: null,
    ...over,
  };
}

const pgUrl = process.env["APP_PG_DIRECT_URL"] ?? process.env["APP_PG_URL"];
const impls: { name: string; make: () => ActorRoleStore; enabled: boolean }[] =
  [
    {
      name: "InMemory",
      make: () => new InMemoryActorRoleStore(),
      enabled: true,
    },
    {
      name: "Postgres",
      make: () => new PostgresActorRoleStore(pgUrl!),
      enabled: Boolean(pgUrl),
    },
  ];

for (const impl of impls) {
  describe.skipIf(!impl.enabled)(`ActorRoleStore — ${impl.name}`, () => {
    let store: ActorRoleStore;
    beforeAll(() => {
      store = impl.make();
    });

    it("liest aktive Rollen eines Akteurs (abgelaufene zählen nicht)", async () => {
      const tid = `t-${uid()}`;
      const aktiv = macheRolle({ tenantId: tid, actorId: "sb.a" });
      const abgelaufen = macheRolle({
        tenantId: tid,
        actorId: "sb.a",
        roleKey: "citizen", // seeded role_key (FK app_rbac_roles); die Rolle ist zeitlich abgelaufen
        validFrom: "2026-01-01T00:00:00.000Z",
        validTo: "2026-02-01T00:00:00.000Z",
      });
      await store.insertActorRole(aktiv);
      await store.insertActorRole(abgelaufen);

      const now = "2026-06-01T00:00:00.000Z";
      const roles = await store.listActiveRolesForActor({
        tenantId: tid,
        actorId: "sb.a",
        nowIso: now,
      });
      expect(roles.map((r) => r.roleKey)).toEqual(["caseworker"]);

      // Fremder Mandant sieht nichts.
      expect(
        await store.listActiveRolesForActor({
          tenantId: "t-fremd",
          actorId: "sb.a",
          nowIso: now,
        }),
      ).toHaveLength(0);
    });

    it("ein Akteur kann DIESELBE Rolle in mehreren Behörden halten (kein Kollaps)", async () => {
      const tid = `t-${uid()}`;
      await store.insertActorRole(
        macheRolle({
          tenantId: tid,
          actorId: "sb.multi",
          roleKey: "caseworker",
          authorityId: "b1",
        }),
      );
      await store.insertActorRole(
        macheRolle({
          tenantId: tid,
          actorId: "sb.multi",
          roleKey: "caseworker",
          authorityId: "b2",
        }),
      );
      const roles = await store.listActiveRolesForActor({
        tenantId: tid,
        actorId: "sb.multi",
        nowIso: "2026-06-01T00:00:00.000Z",
      });
      // Beide Behörden bleiben erhalten (die zweite überschreibt die erste NICHT).
      expect(roles.map((r) => r.authorityId).sort()).toEqual(["b1", "b2"]);
    });

    it("liefert aktive Akteure einer Rolle in einer Behörde", async () => {
      const tid = `t-${uid()}`;
      await store.insertActorRole(
        macheRolle({ tenantId: tid, actorId: "sb.a", authorityId: "b1" }),
      );
      await store.insertActorRole(
        macheRolle({ tenantId: tid, actorId: "sb.b", authorityId: "b1" }),
      );
      // Andere Behörde — zählt nicht.
      await store.insertActorRole(
        macheRolle({ tenantId: tid, actorId: "sb.c", authorityId: "b2" }),
      );
      const actors = await store.listActiveActorsForRole({
        tenantId: tid,
        authorityId: "b1",
        roleKey: "caseworker",
        nowIso: "2026-06-01T00:00:00.000Z",
      });
      expect(actors.map((r) => r.actorId).sort()).toEqual(["sb.a", "sb.b"]);
    });
  });
}
