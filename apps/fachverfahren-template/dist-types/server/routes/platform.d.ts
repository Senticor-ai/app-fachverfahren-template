import type { FastifyPluginAsync } from "fastify";
export interface PlatformRoutesOptions {
    startedAt: number;
}
export declare const platformRoutes: FastifyPluginAsync<PlatformRoutesOptions>;
