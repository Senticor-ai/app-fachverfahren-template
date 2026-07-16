/** Shared scope and pagination types for provider-neutral app stores. */

export interface TenantScope {
  tenantId: string;
}

export interface AuthorityScope extends TenantScope {
  authorityId: string;
  jurisdictionId: string;
}

export interface CaseScope extends AuthorityScope {
  /** Optional actor for list visibility rules; never trusted from request body as tenant. */
  actorId?: string;
}

export interface VersionedMutation {
  expectedVersion: number;
}

export interface PageInfo {
  /** Opaque cursor for the next page; absent when no more rows. */
  nextCursor?: string;
  /** Total matching rows when cheap to compute; may be omitted. */
  total?: number;
}

export interface Page<T> {
  items: T[];
  page: PageInfo;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
