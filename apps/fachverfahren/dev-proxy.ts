// dev-proxy — die Pfade, die der Vite-Dev-Server an die lokale Fastify-Runtime weiterreicht.
// Ohne diesen Proxy beantwortet der SPA-Fallback JEDEN API-Pfad mit index.html (HTTP 200,
// text/html) → „Unexpected token '<' … is not valid JSON" auf /boards. Die Pfad-Liste ist der
// Client-Vertrag der Runtime (apps/fachverfahren/server): Auth, Board-/User-/Audit-API und die
// öffentliche Runtime-Config. Ziel-Default = PORT-Default der Runtime (8080, server/index.ts);
// abweichende Setups übersteuern mit VITE_DEV_API_PROXY_TARGET.
//
// Bewusst NICHT proxied: /healthz & Co. (nur für Orchestrierung) und die Preview-Base-Pfade —
// hinter dem einbettenden Preview-Proxy (APP_PREVIEW_BASE, siehe vite.config.ts) gibt es keine
// lokale Runtime; dort fangen session-state/board-client die Nicht-JSON-Antworten sauber ab.
const DEV_API_PROXY_PATHS = ["/auth", "/api", "/runtime-config.json"] as const;

export function devApiProxy(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const target = env["VITE_DEV_API_PROXY_TARGET"] ?? "http://127.0.0.1:8080";
  return Object.fromEntries(DEV_API_PROXY_PATHS.map((path) => [path, target]));
}
