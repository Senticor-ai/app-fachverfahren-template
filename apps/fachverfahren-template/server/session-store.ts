import { findMockUser, type MockUser } from "../shared/mock-data.js";

export interface SessionStore {
  getActiveUser(): MockUser | null;
  setActiveUserId(userId: string): void;
  clear(): void;
}

export function createMemorySessionStore(): SessionStore {
  let activeUserId: string | null = null;

  return {
    getActiveUser() {
      return activeUserId ? (findMockUser(activeUserId) ?? null) : null;
    },
    setActiveUserId(userId: string) {
      activeUserId = userId;
    },
    clear() {
      activeUserId = null;
    },
  };
}
