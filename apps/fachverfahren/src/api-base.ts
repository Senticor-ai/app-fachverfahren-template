// api-base — DIE EINE WAHRHEIT, wie das Frontend die Basis seiner API-Aufrufe auflöst. Zuvor war
// `apiPath` in board-client UND case-client identisch dupliziert (zwei Wahrheiten); hier zentralisiert.
//
// ZWEI DEPLOY-MODI (M5-Schnitt: Bürger-App/Frontend + geteiltes Backend):
//  1. MITGELIEFERT/EIN-DEPLOY (Default): Frontend und BFF liegen hinter DERSELBEN Origin (der
//     app-runtime-fastify serviert beides). Dann ist die API-Basis der Auslieferungs-Präfix `BASE_URL`
//     (Standalone `/`, hinter dem Vorschau-Proxy ein Sub-Pfad) — same-origin, `credentials`-tragend.
//  2. GETRENNTE DEPLOYS: Die Bürger-App wird als eigenes Frontend-Projekt gebaut und zeigt auf ein
//     geteiltes Backend auf EIGENER Origin. Der Build setzt dann `VITE_API_BASE` auf diese Backend-Origin
//     (absolute URL, z. B. „https://backend.example"); die API-Aufrufe gehen dorthin, nicht same-origin.
//
// Die Auflösung ist BUILD-ZEIT-statisch (Vite inlined `import.meta.env.*`) — synchron und ohne Netz, damit
// die Client-Module ihre Pfade wie bisher synchron bilden. Fehlt `VITE_API_BASE`, ist das Verhalten exakt
// wie zuvor (same-origin über `BASE_URL`) — non-breaking. Die HARTE Zonen-/Segmentierungsgrenze bleibt das
// BFF-Route-Gate + die k8s-NetworkPolicy; dies ist nur die Adress-Naht des Frontends.

/** Die aufgelöste API-Basis (ohne abschließenden Slash). `VITE_API_BASE` (getrennte Deploys) hat Vorrang,
 *  sonst der Auslieferungs-Präfix `BASE_URL` (Ein-Deploy, same-origin — heutiges Verhalten). Exportiert für den
 *  Test (die live-gelesene Auflösungs-Logik); die Client-Module nutzen das beim Laden fixierte `apiPath`. */
export function resolveApiBase(): string {
  const override = import.meta.env.VITE_API_BASE;
  const base =
    typeof override === "string" && override.length > 0
      ? override
      : import.meta.env.BASE_URL;
  return base.replace(/\/+$/, "");
}

const API_BASE = resolveApiBase();

/** Präfixiert einen root-absoluten API-Pfad mit der aufgelösten API-Basis (siehe Modi oben). */
export function apiPath(path: string): string {
  return `${API_BASE}${path}`;
}
