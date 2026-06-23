import type { AppStore } from "@senticor/app-store-postgres";
import type { FastifyPluginAsync } from "fastify";
import type { SessionStore } from "../session-store.js";
export interface AppDataRoutesOptions {
    appStore: AppStore;
    sessionStore: SessionStore;
}
export declare const appDataRoutes: FastifyPluginAsync<AppDataRoutesOptions>;
