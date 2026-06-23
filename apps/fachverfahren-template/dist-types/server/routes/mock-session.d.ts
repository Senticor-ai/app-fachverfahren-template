import type { FastifyPluginAsync } from "fastify";
import type { SessionStore } from "../session-store.js";
export interface MockSessionRoutesOptions {
    sessionStore: SessionStore;
}
export declare const mockSessionRoutes: FastifyPluginAsync<MockSessionRoutesOptions>;
