export const domainRoutePrefix = "/api/v1/modules/replace-with-domain-id";

export function describeDomainRoutes() {
  return {
    prefix: domainRoutePrefix,
    routes: ["GET /cases", "POST /drafts"],
  };
}
