import { describe, expect, it } from "vitest";
import { InMemoryAttachmentStore } from "./attachment-store.js";

const scope = {
  tenantId: "t1",
  authorityId: "a1",
  jurisdictionId: "de",
};

describe("InMemoryAttachmentStore", () => {
  it("round-trips bytes with server checksum", async () => {
    const store = new InMemoryAttachmentStore();
    const body = new TextEncoder().encode("hello-nachweis");
    const put = await store.put(
      scope,
      {
        purpose: "nachweis",
        fileName: "beleg.pdf",
        mediaType: "application/pdf",
        createdBy: "citizen.1",
      },
      body,
    );
    expect(put.metadata.sizeBytes).toBe(body.byteLength);
    expect(put.metadata.checksumSha256).toHaveLength(64);
    expect(put.metadata.caseId).toBeNull();
    const opened = await store.openReadStream(scope, put.metadata.attachmentId);
    expect(opened).toBeTruthy();
    const chunks: Buffer[] = [];
    for await (const chunk of opened!.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString("utf8")).toBe("hello-nachweis");
  });

  it("binds unbound tokens and rejects cross-tenant reads", async () => {
    const store = new InMemoryAttachmentStore();
    const put = await store.put(
      scope,
      {
        purpose: "nachweis",
        fileName: "x.png",
        mediaType: "image/png",
        createdBy: "citizen.1",
      },
      new Uint8Array([1, 2, 3]),
    );
    const bound = await store.bindToCase(scope, "case-1", [
      put.metadata.attachmentId,
    ]);
    expect(bound[0]?.caseId).toBe("case-1");
    expect(bound[0]?.expiresAt).toBeNull();
    const other = await store.getMetadata(
      { ...scope, tenantId: "other" },
      put.metadata.attachmentId,
    );
    expect(other).toBeNull();
  });

  it("purges expired unbound attachments", async () => {
    const store = new InMemoryAttachmentStore();
    const put = await store.put(
      scope,
      {
        purpose: "nachweis",
        fileName: "old.pdf",
        mediaType: "application/pdf",
        createdBy: "citizen.1",
        expiresAt: "2020-01-01T00:00:00.000Z",
      },
      new Uint8Array([9]),
    );
    const deleted = await store.purgeExpired("2026-01-01T00:00:00.000Z");
    expect(deleted).toContain(put.metadata.attachmentId);
    expect(
      await store.getMetadata(scope, put.metadata.attachmentId),
    ).toBeNull();
  });

  it("rejects path-like unsafe names", async () => {
    const store = new InMemoryAttachmentStore();
    await expect(
      store.put(
        scope,
        {
          purpose: "nachweis",
          fileName: "../etc/passwd",
          mediaType: "application/pdf",
          createdBy: "citizen.1",
        },
        new Uint8Array([1]),
      ),
    ).resolves.toMatchObject({
      metadata: { fileName: "passwd" },
    });
  });
});
