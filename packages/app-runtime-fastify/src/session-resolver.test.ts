import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import {
  createDevSessionResolverFromEnv,
  NoSessionResolver,
} from "./session-resolver.js";

function fakeRequest(headers: Record<string, string> = {}): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

describe("SessionResolver", () => {
  it("NoSessionResolver ist deny-by-default (immer null)", async () => {
    const resolver = new NoSessionResolver();
    expect(await resolver.resolve(fakeRequest())).toBeNull();
  });

  it("Dev-Resolver ist ohne APP_DEV_SESSION=true INERT (null statt Resolver)", () => {
    expect(createDevSessionResolverFromEnv({})).toBeNull();
    expect(
      createDevSessionResolverFromEnv({ APP_DEV_SESSION: "1" }),
    ).toBeNull();
    expect(
      createDevSessionResolverFromEnv({ APP_DEV_SESSION: "yes" }),
    ).toBeNull();
  });

  it("liefert Actor und Rollen aus der Env; ohne APP_DEV_ROLES fail-closed leer", async () => {
    const resolver = createDevSessionResolverFromEnv({
      APP_DEV_SESSION: "true",
      APP_DEV_ACTOR_ID: "dev-actor-7",
      APP_DEV_ROLES: "citizen, caseworker",
    });
    expect(resolver).not.toBeNull();
    const session = await resolver?.resolve(fakeRequest());
    expect(session?.actorId).toBe("dev-actor-7");
    expect(session?.rbacRoles).toEqual(["citizen", "caseworker"]);

    const leer = createDevSessionResolverFromEnv({ APP_DEV_SESSION: "true" });
    const leereSession = await leer?.resolve(fakeRequest());
    expect(leereSession?.rbacRoles).toEqual([]);
  });

  it("ignoriert Header-Overrides OHNE APP_TRUST_DEV_SESSION_HEADERS=true", async () => {
    const resolver = createDevSessionResolverFromEnv({
      APP_DEV_SESSION: "true",
      APP_DEV_ACTOR_ID: "dev-actor",
      APP_DEV_ROLES: "citizen",
    });
    const session = await resolver?.resolve(
      fakeRequest({ "x-dev-actor-id": "boese", "x-dev-roles": "caseworker" }),
    );
    expect(session?.actorId).toBe("dev-actor");
    expect(session?.rbacRoles).toEqual(["citizen"]);
  });

  it("erlaubt Header-Overrides NUR mit APP_TRUST_DEV_SESSION_HEADERS=true", async () => {
    const resolver = createDevSessionResolverFromEnv({
      APP_DEV_SESSION: "true",
      APP_DEV_ACTOR_ID: "dev-actor",
      APP_DEV_ROLES: "citizen",
      APP_TRUST_DEV_SESSION_HEADERS: "true",
    });
    const session = await resolver?.resolve(
      fakeRequest({ "x-dev-actor-id": "actor-9", "x-dev-roles": "caseworker" }),
    );
    expect(session?.actorId).toBe("actor-9");
    expect(session?.rbacRoles).toEqual(["caseworker"]);

    const ohneHeader = await resolver?.resolve(fakeRequest());
    expect(ohneHeader?.actorId).toBe("dev-actor");
  });
});
