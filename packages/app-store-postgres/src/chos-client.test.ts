import { describe, expect, it } from "vitest";
import {
  ChosConflictError,
  ChosEntityNotFoundError,
  HttpChosClient,
  InMemoryChosClient,
} from "./chos-client.js";

const coll = "app_cases";
const t = "tenant-1";

describe("InMemoryChosClient — Graph-Semantik (Fake für DEV/Tests)", () => {
  it("put/get/list + jsonb-Parität (Roundtrip liefert ein fremdes Objekt)", async () => {
    const c = new InMemoryChosClient();
    const body = { state: "a", nested: { n: 1 } };
    await c.putEntity({
      collection: coll,
      tenantId: t,
      id: "x",
      version: 1,
      body,
    });
    // Caller-Mutation nach dem Put darf den Store NICHT erreichen.
    body.nested.n = 999;
    const got = await c.getEntity({ collection: coll, tenantId: t, id: "x" });
    expect(got?.version).toBe(1);
    expect((got?.body["nested"] as { n: number }).n).toBe(1);
    const list = await c.listEntities({ collection: coll, tenantId: t });
    expect(list).toHaveLength(1);
  });

  it("mutateEntityWithEvent: atomarer CAS + Ereignis; Konflikt/NotFound werfen typisiert", async () => {
    const c = new InMemoryChosClient();
    await c.putEntity({
      collection: coll,
      tenantId: t,
      id: "x",
      version: 1,
      body: { state: "a" },
    });
    const updated = await c.mutateEntityWithEvent({
      collection: coll,
      tenantId: t,
      id: "x",
      expectedVersion: 1,
      nextBody: { state: "b" },
      event: {
        stream: "x",
        id: "e1",
        occurredAt: "2026-01-01T00:00:00.000Z",
        body: { k: "v" },
      },
    });
    expect(updated.version).toBe(2);
    expect(updated.body["state"]).toBe("b");
    const events = await c.listEvents({ tenantId: t, stream: "x" });
    expect(events).toHaveLength(1);

    // Falsche expectedVersion → Konflikt (der Knoten wird NICHT verändert, kein Ereignis dazu).
    await expect(
      c.mutateEntityWithEvent({
        collection: coll,
        tenantId: t,
        id: "x",
        expectedVersion: 1,
        nextBody: { state: "c" },
        event: {
          stream: "x",
          id: "e2",
          occurredAt: "2026-01-01T00:00:01.000Z",
          body: {},
        },
      }),
    ).rejects.toBeInstanceOf(ChosConflictError);
    expect(await c.listEvents({ tenantId: t, stream: "x" })).toHaveLength(1);

    await expect(
      c.mutateEntityWithEvent({
        collection: coll,
        tenantId: t,
        id: "fehlt",
        expectedVersion: 1,
        nextBody: {},
        event: {
          stream: "fehlt",
          id: "e",
          occurredAt: "2026-01-01T00:00:02.000Z",
          body: {},
        },
      }),
    ).rejects.toBeInstanceOf(ChosEntityNotFoundError);
  });

  it("mutateEntity: CAS OHNE Ereignis (reiner Patch — kein Lineage-Eintrag)", async () => {
    const c = new InMemoryChosClient();
    await c.putEntity({
      collection: coll,
      tenantId: t,
      id: "x",
      version: 1,
      body: { a: 1 },
    });
    const updated = await c.mutateEntity({
      collection: coll,
      tenantId: t,
      id: "x",
      expectedVersion: 1,
      nextBody: { a: 2 },
    });
    expect(updated.version).toBe(2);
    expect(updated.body["a"]).toBe(2);
    // Anders als mutateEntityWithEvent: KEIN Ereignis.
    expect(await c.listEvents({ tenantId: t, stream: "x" })).toHaveLength(0);
    await expect(
      c.mutateEntity({
        collection: coll,
        tenantId: t,
        id: "x",
        expectedVersion: 1,
        nextBody: {},
      }),
    ).rejects.toBeInstanceOf(ChosConflictError);
  });

  it("listEvents ist chronologisch aufsteigend und stream-/mandanten-scoped", async () => {
    const c = new InMemoryChosClient();
    const ev = (stream: string, id: string, occurredAt: string) =>
      c.appendEvent({ tenantId: t, stream, id, occurredAt, body: { id } });
    await ev("s1", "b", "2026-01-02T00:00:00.000Z");
    await ev("s1", "a", "2026-01-01T00:00:00.000Z");
    await ev("s2", "z", "2026-01-03T00:00:00.000Z");
    await c.appendEvent({
      tenantId: "anderer",
      stream: "s1",
      id: "fremd",
      occurredAt: "2026-01-01T00:00:00.000Z",
      body: {},
    });
    const s1 = await c.listEvents({ tenantId: t, stream: "s1" });
    expect(s1.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

/** Minimaler Fake für globalThis.fetch — beweist die Draht-Abbildung + Fehler-Übersetzung des HttpChosClient
 *  OHNE laufendes chos. */
function fakeFetch(
  handler: (
    url: string,
    init: RequestInit,
  ) => { status: number; body?: unknown },
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const { status, body } = handler(url, init ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as typeof fetch;
}

describe("HttpChosClient — Draht-Abbildung + Fehler-Übersetzung (fail-safe)", () => {
  it("baut mandanten-partitionierte Pfade und Methoden", async () => {
    const calls: { url: string; method: string }[] = [];
    const client = new HttpChosClient({
      baseUrl: "https://chos.example/api/",
      token: "secret",
      fetchImpl: fakeFetch((url, init) => {
        calls.push({ url, method: String(init.method) });
        return {
          status: 200,
          body: {
            collection: coll,
            tenantId: t,
            id: "x",
            version: 1,
            body: {},
          },
        };
      }),
    });
    await client.putEntity({
      collection: coll,
      tenantId: t,
      id: "x",
      version: 1,
      body: {},
    });
    await client.getEntity({ collection: coll, tenantId: t, id: "x" });
    expect(calls[0]).toEqual({
      url: "https://chos.example/api/v1/tenants/tenant-1/entities/app_cases/x",
      method: "PUT",
    });
    expect(calls[1]!.method).toBe("GET");
  });

  it("404 → getEntity liefert undefined (kein Fehler auf dem Lesepfad)", async () => {
    const client = new HttpChosClient({
      baseUrl: "https://chos.example",
      fetchImpl: fakeFetch(() => ({ status: 404 })),
    });
    expect(
      await client.getEntity({ collection: coll, tenantId: t, id: "weg" }),
    ).toBeUndefined();
  });

  it("409 → ChosConflictError, 404 auf mutate → ChosEntityNotFoundError", async () => {
    const conflict = new HttpChosClient({
      baseUrl: "https://chos.example",
      fetchImpl: fakeFetch(() => ({ status: 409 })),
    });
    await expect(
      conflict.mutateEntityWithEvent({
        collection: coll,
        tenantId: t,
        id: "x",
        expectedVersion: 1,
        nextBody: {},
        event: {
          stream: "x",
          id: "e",
          occurredAt: "2026-01-01T00:00:00.000Z",
          body: {},
        },
      }),
    ).rejects.toBeInstanceOf(ChosConflictError);

    const missing = new HttpChosClient({
      baseUrl: "https://chos.example",
      fetchImpl: fakeFetch(() => ({ status: 404 })),
    });
    await expect(
      missing.mutateEntityWithEvent({
        collection: coll,
        tenantId: t,
        id: "x",
        expectedVersion: 1,
        nextBody: {},
        event: {
          stream: "x",
          id: "e",
          occurredAt: "2026-01-01T00:00:00.000Z",
          body: {},
        },
      }),
    ).rejects.toBeInstanceOf(ChosEntityNotFoundError);
  });

  it("mutateEntity: PATCH-Methode; 409 → ChosConflictError", async () => {
    let method = "";
    const ok = new HttpChosClient({
      baseUrl: "https://chos.example",
      fetchImpl: fakeFetch((_url, init) => {
        method = String(init.method);
        return {
          status: 200,
          body: {
            collection: coll,
            tenantId: t,
            id: "x",
            version: 2,
            body: {},
          },
        };
      }),
    });
    await ok.mutateEntity({
      collection: coll,
      tenantId: t,
      id: "x",
      expectedVersion: 1,
      nextBody: {},
    });
    expect(method).toBe("PATCH");

    const conflict = new HttpChosClient({
      baseUrl: "https://chos.example",
      fetchImpl: fakeFetch(() => ({ status: 409 })),
    });
    await expect(
      conflict.mutateEntity({
        collection: coll,
        tenantId: t,
        id: "x",
        expectedVersion: 1,
        nextBody: {},
      }),
    ).rejects.toBeInstanceOf(ChosConflictError);
  });

  it("sonstiger Nicht-2xx wirft (kein stiller Teilzustand)", async () => {
    const client = new HttpChosClient({
      baseUrl: "https://chos.example",
      fetchImpl: fakeFetch(() => ({ status: 500 })),
    });
    await expect(
      client.appendEvent({
        tenantId: t,
        stream: "s",
        id: "e",
        occurredAt: "2026-01-01T00:00:00.000Z",
        body: {},
      }),
    ).rejects.toThrow(/HTTP 500/);
  });
});
