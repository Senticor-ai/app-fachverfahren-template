import type { AuthorityScope, CaseScope } from "./common.js";

export type AttachmentId = string;

export interface AttachmentMetadata {
  attachmentId: AttachmentId;
  /** Null until bound to a case on einreichen. */
  caseId: string | null;
  purpose: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  checksumSha256: string;
  createdBy: string;
  createdAt: string;
  boundAt: string | null;
  expiresAt: string | null;
}

export interface PutAttachmentInput {
  attachmentId?: AttachmentId;
  purpose: string;
  fileName: string;
  mediaType: string;
  /** Unbound draft TTL; store may enforce a default. */
  expiresAt?: string;
  createdBy: string;
}

export interface AttachmentPutResult {
  metadata: AttachmentMetadata;
}

/** Byte body without Node stream dependency in the contracts package. */
export type AttachmentBody = Uint8Array | AsyncIterable<Uint8Array>;

/**
 * Provider-neutral attachment byte store + metadata.
 * LocalFs is DEV/single-node only. Bytes never appear in case JSON.
 */
export interface AttachmentStore {
  put(
    scope: AuthorityScope,
    input: PutAttachmentInput,
    body: AttachmentBody,
  ): Promise<AttachmentPutResult>;

  getMetadata(
    scope: CaseScope | AuthorityScope,
    attachmentId: AttachmentId,
  ): Promise<AttachmentMetadata | null>;

  openReadStream(
    scope: CaseScope | AuthorityScope,
    attachmentId: AttachmentId,
  ): Promise<{
    metadata: AttachmentMetadata;
    body: AsyncIterable<Uint8Array>;
  } | null>;

  delete(
    scope: CaseScope | AuthorityScope,
    attachmentId: AttachmentId,
  ): Promise<void>;

  /** Bind unbound attachments to a case atomically (used by CaseService on einreichen). */
  bindToCase(
    scope: CaseScope,
    caseId: string,
    attachmentIds: AttachmentId[],
  ): Promise<AttachmentMetadata[]>;

  /** Purge expired unbound attachments; returns deleted ids. */
  purgeExpired(nowIso?: string): Promise<AttachmentId[]>;
}
