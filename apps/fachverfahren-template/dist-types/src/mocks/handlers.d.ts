import { type MockUser } from "../../shared/mock-data.js";
export declare function resetMockSessionState(userId?: string | null): void;
export declare function getActiveMockUser(): MockUser | null;
export declare const sessionHandlers: import("msw").HttpHandler[];
export declare const handlers: import("msw").HttpHandler[];
