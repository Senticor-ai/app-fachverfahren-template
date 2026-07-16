import fastifyCookie from "@fastify/cookie";
import {
  InMemoryAttachmentStore,
  InMemoryAuditStore,
  InMemoryAuthStore,
  InMemoryKanbanStore,
} from "@senticor/app-store-postgres";
import fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerAuthRoutes } from "../auth/routes.js";
import { registerAttachmentRoutes } from "./routes.js";

const bootstrapBody = {
  token: "test-bootstrap-token",
  email: "attach@example.org",
  password: "correct horse battery staple", // pragma: allowlist-secret
  displayName: "Attach User",
};

function extractCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") throw new Error("missing cookie");
  return value.split(";")[0] ?? "";
}

describe("attachment routes", () => {
  it("uploads and downloads bytes with checksum", async () => {
    const authStore = new InMemoryAuthStore();
    const kanbanStore = new InMemoryKanbanStore();
    const auditStore = new InMemoryAuditStore();
    const attachmentStore = new InMemoryAttachmentStore();
    const app = fastify({ logger: false });
    await app.register(fastifyCookie);
    registerAuthRoutes(app, {
      authStore,
      kanbanStore,
      auditStore,
      bootstrapToken: "test-bootstrap-token",
    });
    registerAttachmentRoutes(app, { authStore, attachmentStore });
    await app.ready();

    const boot = await app.inject({
      method: "POST",
      url: "/auth/bootstrap",
      payload: bootstrapBody,
    });
    const cookie = extractCookie(boot);

    const upload = await app.inject({
      method: "POST",
      url: "/api/v1/attachments",
      headers: {
        cookie,
        "content-type": "application/pdf",
        "x-file-name": encodeURIComponent("beleg.pdf"),
        "x-attachment-purpose": "nachweis",
      },
      payload: Buffer.from("%PDF-demo"),
    });
    expect(upload.statusCode).toBe(201);
    const meta = upload.json();
    expect(meta.fileName).toBe("beleg.pdf");
    expect(meta.checksumSha256).toHaveLength(64);
    expect(meta.caseId).toBeNull();

    const download = await app.inject({
      method: "GET",
      url: `/api/v1/attachments/${meta.attachmentId}`,
      headers: { cookie },
    });
    expect(download.statusCode).toBe(200);
    expect(download.body).toContain("%PDF-demo");

    await app.close();
  });
});
