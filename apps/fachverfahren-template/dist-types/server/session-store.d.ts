import { type MockUser } from "../shared/mock-data.js";
export interface SessionStore {
    getActiveUser(): MockUser | null;
    setActiveUserId(userId: string): void;
    clear(): void;
}
export declare function createMemorySessionStore(): SessionStore;
