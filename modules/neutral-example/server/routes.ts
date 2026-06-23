export const neutralExampleRoutePrefix = "/api/v1/modules/neutral-example";

export function describeNeutralExampleRoutes() {
  return {
    prefix: neutralExampleRoutePrefix,
    routes: ["GET /cases", "POST /drafts"],
  };
}
