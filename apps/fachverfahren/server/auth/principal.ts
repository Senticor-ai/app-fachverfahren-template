export interface Principal {
  actorId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}
