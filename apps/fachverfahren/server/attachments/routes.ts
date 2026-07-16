import type { AttachmentStore } from "@senticor/app-store-contracts";
import {
  StoreNotFoundError,
  StoreUnavailableError,
  StoreValidationError,
} from "@senticor/app-store-contracts";
import type { AuthStore } from "@senticor/app-store-postgres";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import "../auth/principal.js";
import { routeAuth } from "../auth/authorization.js";

export interface AttachmentRouteDeps {
  authStore: AuthStore;
  attachmentStore: AttachmentStore;
}

function scopeFrom(request: FastifyRequest) {
  const p = request.principal!;
  return {
    tenantId: p.tenantId,
    authorityId: p.authorityId,
    jurisdictionId: p.jurisdictionId,
    actorId: p.actorId,
  };
}

function mapError(reply: FastifyReply, err: unknown): boolean {
  if (err instanceof StoreUnavailableError) {
    void reply.code(503).send({ error: err.message });
    return true;
  }
  if (err instanceof StoreNotFoundError) {
    void reply.code(404).send({ error: err.message });
    return true;
  }
  if (err instanceof StoreValidationError) {
    void reply.code(400).send({ error: err.message });
    return true;
  }
  return false;
}

export function registerAttachmentRoutes(
  app: FastifyInstance,
  deps: AttachmentRouteDeps,
): void {
  const requireSession = routeAuth({ kind: "authenticated" }, deps);
  const store = deps.attachmentStore;

  // Binary upload body (not JSON). Registered once per app instance.
  if (
    !(app as FastifyInstance & { __attachmentParser?: boolean })
      .__attachmentParser
  ) {
    app.addContentTypeParser(
      [
        "application/octet-stream",
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "text/plain",
      ],
      { parseAs: "buffer" },
      (_req, body, done) => {
        done(null, body);
      },
    );
    (
      app as FastifyInstance & { __attachmentParser?: boolean }
    ).__attachmentParser = true;
  }

  app.post(
    "/api/v1/attachments",
    { ...requireSession },
    async (request, reply) => {
      try {
        // Multipart would be ideal; accept raw body + headers for streaming readiness.
        const mediaType =
          (request.headers["content-type"] as string | undefined)?.split(
            ";",
          )[0] ?? "application/octet-stream";
        const fileNameHeader = request.headers["x-file-name"];
        const fileNameRaw = Array.isArray(fileNameHeader)
          ? fileNameHeader[0]
          : fileNameHeader;
        const purposeHeader = request.headers["x-attachment-purpose"];
        const purposeRaw = Array.isArray(purposeHeader)
          ? purposeHeader[0]
          : purposeHeader;
        const fileName =
          typeof fileNameRaw === "string" && fileNameRaw.trim()
            ? decodeURIComponent(fileNameRaw)
            : "upload.bin";
        const purpose =
          typeof purposeRaw === "string" && purposeRaw.trim()
            ? purposeRaw
            : "nachweis";
        const body = request.body;
        let bytes: Uint8Array;
        if (body instanceof Uint8Array) {
          bytes = body;
        } else if (typeof body === "string") {
          bytes = new TextEncoder().encode(body);
        } else if (Buffer.isBuffer(body)) {
          bytes = new Uint8Array(body);
        } else {
          return reply.code(400).send({ error: "binary body required" });
        }
        // Lazy orphan cleanup on upload
        await store.purgeExpired();
        const result = await store.put(
          scopeFrom(request),
          {
            purpose,
            fileName,
            mediaType,
            createdBy: request.principal!.actorId,
          },
          bytes,
        );
        return reply.code(201).send(result.metadata);
      } catch (err) {
        if (mapError(reply, err)) return;
        throw err;
      }
    },
  );

  app.get(
    "/api/v1/attachments/:attachmentId",
    { ...requireSession },
    async (request, reply) => {
      try {
        const { attachmentId } = request.params as { attachmentId: string };
        const opened = await store.openReadStream(
          scopeFrom(request),
          attachmentId,
        );
        if (!opened) {
          return reply.code(404).send({ error: "attachment not found" });
        }
        reply.header("Content-Type", opened.metadata.mediaType);
        reply.header(
          "Content-Disposition",
          `attachment; filename="${opened.metadata.fileName.replace(/"/g, "")}"`,
        );
        reply.header("X-Checksum-Sha256", opened.metadata.checksumSha256);
        const chunks: Uint8Array[] = [];
        for await (const chunk of opened.body) {
          chunks.push(chunk);
        }
        const total = chunks.reduce((n, c) => n + c.byteLength, 0);
        const out = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          out.set(c, offset);
          offset += c.byteLength;
        }
        return reply.send(Buffer.from(out));
      } catch (err) {
        if (mapError(reply, err)) return;
        throw err;
      }
    },
  );

  app.delete(
    "/api/v1/attachments/:attachmentId",
    { ...requireSession },
    async (request, reply) => {
      try {
        const { attachmentId } = request.params as { attachmentId: string };
        await store.delete(scopeFrom(request), attachmentId);
        return reply.code(204).send();
      } catch (err) {
        if (mapError(reply, err)) return;
        throw err;
      }
    },
  );
}
