import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  StoreNotFoundError,
  StoreUnavailableError,
  StoreValidationError,
  type AttachmentId,
  type AttachmentMetadata,
  type AttachmentBody,
  type AttachmentPutResult,
  type AttachmentStore,
  type AuthorityScope,
  type CaseScope,
  type PutAttachmentInput,
} from "@senticor/app-store-contracts";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MEDIA = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

function assertSafeFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[\0]/g, "");
  if (!base || base === "." || base === "..") {
    throw new StoreValidationError("unsafe file name");
  }
  return base;
}

function scopeMatches(
  meta: AttachmentMetadata & {
    tenantId: string;
    authorityId: string;
    jurisdictionId: string;
  },
  scope: AuthorityScope,
): boolean {
  return (
    meta.tenantId === scope.tenantId &&
    meta.authorityId === scope.authorityId &&
    meta.jurisdictionId === scope.jurisdictionId
  );
}

type InternalMeta = AttachmentMetadata & {
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  storageKey: string;
};

async function readBody(body: AttachmentBody): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) {
    chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export class InMemoryAttachmentStore implements AttachmentStore {
  private readonly meta = new Map<string, InternalMeta>();
  private readonly bytes = new Map<string, Uint8Array>();

  async put(
    scope: AuthorityScope,
    input: PutAttachmentInput,
    body: AttachmentBody,
  ): Promise<AttachmentPutResult> {
    const data = await readBody(body);
    if (data.byteLength > MAX_BYTES) {
      throw new StoreValidationError(`attachment exceeds ${MAX_BYTES} bytes`);
    }
    if (!ALLOWED_MEDIA.has(input.mediaType)) {
      throw new StoreValidationError(
        `media type not allowed: ${input.mediaType}`,
      );
    }
    const attachmentId = input.attachmentId ?? randomUUID();
    const fileName = assertSafeFileName(input.fileName);
    const checksum = createHash("sha256").update(data).digest("hex");
    const createdAt = new Date().toISOString();
    const expiresAt =
      input.expiresAt ?? new Date(Date.now() + DEFAULT_TTL_MS).toISOString();
    const metadata: InternalMeta = {
      attachmentId,
      tenantId: scope.tenantId,
      authorityId: scope.authorityId,
      jurisdictionId: scope.jurisdictionId,
      caseId: null,
      purpose: input.purpose,
      fileName,
      mediaType: input.mediaType,
      sizeBytes: data.byteLength,
      checksumSha256: checksum,
      createdBy: input.createdBy,
      createdAt,
      boundAt: null,
      expiresAt,
      storageKey: attachmentId,
    };
    this.meta.set(attachmentId, metadata);
    this.bytes.set(attachmentId, data);
    return { metadata: publicMeta(metadata) };
  }

  async getMetadata(
    scope: CaseScope | AuthorityScope,
    attachmentId: AttachmentId,
  ): Promise<AttachmentMetadata | null> {
    const found = this.meta.get(attachmentId);
    if (!found || !scopeMatches(found, scope)) return null;
    return publicMeta(found);
  }

  async openReadStream(
    scope: CaseScope | AuthorityScope,
    attachmentId: AttachmentId,
  ): Promise<{
    metadata: AttachmentMetadata;
    body: AsyncIterable<Uint8Array>;
  } | null> {
    const found = this.meta.get(attachmentId);
    if (!found || !scopeMatches(found, scope)) return null;
    const data = this.bytes.get(attachmentId);
    if (!data) return null;
    return {
      metadata: publicMeta(found),
      body: (async function* () {
        yield data;
      })(),
    };
  }

  async delete(
    scope: CaseScope | AuthorityScope,
    attachmentId: AttachmentId,
  ): Promise<void> {
    const found = this.meta.get(attachmentId);
    if (!found || !scopeMatches(found, scope)) {
      throw new StoreNotFoundError("attachment", attachmentId);
    }
    this.meta.delete(attachmentId);
    this.bytes.delete(attachmentId);
  }

  async bindToCase(
    scope: CaseScope,
    caseId: string,
    attachmentIds: AttachmentId[],
  ): Promise<AttachmentMetadata[]> {
    const bound: AttachmentMetadata[] = [];
    const now = new Date().toISOString();
    for (const id of attachmentIds) {
      const found = this.meta.get(id);
      if (!found || !scopeMatches(found, scope)) {
        throw new StoreNotFoundError("attachment", id);
      }
      if (found.caseId && found.caseId !== caseId) {
        throw new StoreValidationError(
          `attachment ${id} already bound to another case`,
        );
      }
      found.caseId = caseId;
      found.boundAt = now;
      found.expiresAt = null;
      bound.push(publicMeta(found));
    }
    return bound;
  }

  async purgeExpired(nowIso?: string): Promise<AttachmentId[]> {
    const now = nowIso ?? new Date().toISOString();
    const deleted: AttachmentId[] = [];
    for (const [id, meta] of this.meta) {
      if (meta.caseId === null && meta.expiresAt && meta.expiresAt <= now) {
        this.meta.delete(id);
        this.bytes.delete(id);
        deleted.push(id);
      }
    }
    return deleted;
  }
}

/** DEV / single-node reference adapter — not multi-instance production storage. */
export class LocalFsAttachmentStore implements AttachmentStore {
  private readonly root: string;
  private readonly memory = new InMemoryAttachmentStore();

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  private resolveKey(storageKey: string): string {
    const resolved = path.resolve(this.root, storageKey);
    if (!resolved.startsWith(this.root + path.sep) && resolved !== this.root) {
      throw new StoreValidationError("path traversal rejected");
    }
    return resolved;
  }

  async put(
    scope: AuthorityScope,
    input: PutAttachmentInput,
    body: AttachmentBody,
  ): Promise<AttachmentPutResult> {
    await mkdir(this.root, { recursive: true });
    const result = await this.memory.put(scope, input, body);
    // Re-read bytes from memory via open and write to disk for durability of this process.
    const opened = await this.memory.openReadStream(
      scope,
      result.metadata.attachmentId,
    );
    if (!opened) throw new StoreValidationError("attachment write failed");
    const filePath = this.resolveKey(result.metadata.attachmentId);
    await pipeline(Readable.from(opened.body), createWriteStream(filePath));
    return result;
  }

  async getMetadata(
    scope: CaseScope | AuthorityScope,
    attachmentId: AttachmentId,
  ): Promise<AttachmentMetadata | null> {
    return this.memory.getMetadata(scope, attachmentId);
  }

  async openReadStream(
    scope: CaseScope | AuthorityScope,
    attachmentId: AttachmentId,
  ): Promise<{
    metadata: AttachmentMetadata;
    body: AsyncIterable<Uint8Array>;
  } | null> {
    const meta = await this.memory.getMetadata(scope, attachmentId);
    if (!meta) return null;
    const filePath = this.resolveKey(attachmentId);
    if (!existsSync(filePath)) return null;
    const nodeStream = createReadStream(filePath);
    return {
      metadata: meta,
      body: (async function* () {
        for await (const chunk of nodeStream) {
          yield chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        }
      })(),
    };
  }

  async delete(
    scope: CaseScope | AuthorityScope,
    attachmentId: AttachmentId,
  ): Promise<void> {
    await this.memory.delete(scope, attachmentId);
    const filePath = this.resolveKey(attachmentId);
    if (existsSync(filePath)) await unlink(filePath);
  }

  async bindToCase(
    scope: CaseScope,
    caseId: string,
    attachmentIds: AttachmentId[],
  ): Promise<AttachmentMetadata[]> {
    return this.memory.bindToCase(scope, caseId, attachmentIds);
  }

  async purgeExpired(nowIso?: string): Promise<AttachmentId[]> {
    const deleted = await this.memory.purgeExpired(nowIso);
    for (const id of deleted) {
      const filePath = this.resolveKey(id);
      if (existsSync(filePath)) await unlink(filePath);
    }
    return deleted;
  }
}

export class UnavailableAttachmentStore implements AttachmentStore {
  constructor(private readonly reason: string) {}
  private fail(): never {
    throw new StoreUnavailableError(this.reason);
  }
  put(): Promise<AttachmentPutResult> {
    this.fail();
  }
  getMetadata(): Promise<AttachmentMetadata | null> {
    this.fail();
  }
  openReadStream(): Promise<{
    metadata: AttachmentMetadata;
    body: AsyncIterable<Uint8Array>;
  } | null> {
    this.fail();
  }
  delete(): Promise<void> {
    this.fail();
  }
  bindToCase(): Promise<AttachmentMetadata[]> {
    this.fail();
  }
  purgeExpired(): Promise<AttachmentId[]> {
    this.fail();
  }
}

function publicMeta(meta: InternalMeta): AttachmentMetadata {
  return {
    attachmentId: meta.attachmentId,
    caseId: meta.caseId,
    purpose: meta.purpose,
    fileName: meta.fileName,
    mediaType: meta.mediaType,
    sizeBytes: meta.sizeBytes,
    checksumSha256: meta.checksumSha256,
    createdBy: meta.createdBy,
    createdAt: meta.createdAt,
    boundAt: meta.boundAt,
    expiresAt: meta.expiresAt,
  };
}

export function createAttachmentStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AttachmentStore {
  const mode = env["APP_ATTACHMENT_STORE"] ?? "unavailable";
  if (mode === "memory") return new InMemoryAttachmentStore();
  if (mode === "local-fs") {
    const root = env["APP_ATTACHMENT_ROOT"] ?? ".data/attachments";
    return new LocalFsAttachmentStore(root);
  }
  const databaseUrl = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  if (!databaseUrl) {
    return new UnavailableAttachmentStore(
      "APP_ATTACHMENT_STORE not configured (use memory|local-fs) and no APP_PG_* for later object storage",
    );
  }
  // Postgres object bytes are PLAN — until then use local-fs beside PG for DEV.
  const root = env["APP_ATTACHMENT_ROOT"] ?? ".data/attachments";
  return new LocalFsAttachmentStore(root);
}
