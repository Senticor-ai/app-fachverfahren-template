import { type AppStore } from "@senticor/app-store-postgres";
import { type FastifyInstance } from "fastify";
import { type SessionStore } from "./session-store.js";
declare module "fastify" {
    interface FastifyInstance {
        shuttingDown: boolean;
    }
}
export interface BuildAppOptions {
    enableMockAuth?: boolean;
    appStore?: AppStore;
    logger?: boolean;
    sessionStore?: SessionStore;
    staticDir?: string;
    startedAt?: number;
}
export declare function buildApp(options?: BuildAppOptions): Promise<FastifyInstance>;
export declare function resolveStaticDir(env?: NodeJS.ProcessEnv): string;
