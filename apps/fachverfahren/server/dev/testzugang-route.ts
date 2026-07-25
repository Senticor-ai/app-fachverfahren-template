// testzugang-route — die Auskunft „welche TESTKONTEN hat dieser Entwicklungsstand vorprovisioniert?".
//
// FAIL-CLOSED ZWEIFACH:
//  1. Im Produktivbetrieb (NODE_ENV=production) wird die Route GAR NICHT REGISTRIERT — sie existiert
//     dort nicht, ein Aufruf endet im normalen 404. Das ist stärker als eine Prüfung im Handler:
//     was nicht registriert ist, kann auch keine Prüfung vergessen.
//  2. Ist sie registriert, antwortet sie nur dann mit Zugangsdaten, wenn der Ausweis (testzugang.ts)
//     aktiv ist — sonst EHRLICH mit dem Grund der Sperre, damit die Oberfläche nicht rät.
//
// Bewusst NICHT unter /auth oder /api: es ist kein Authentisierungs- und kein Fach-Endpunkt, sondern
// die Selbstauskunft eines Entwicklungsstands über sich selbst.
import type { FastifyInstance } from "fastify";
import { testzugangAusweis, type TestzugangAusweis } from "./testzugang.js";

export const TESTZUGANG_ROUTE = "/dev/testzugang";

/** Wahr, wenn dieser Prozess die Selbstauskunft überhaupt anbieten darf. */
export function testzugangRouteErlaubt(env: NodeJS.ProcessEnv): boolean {
  return env["NODE_ENV"] !== "production";
}

/** Registriert die Selbstauskunft — im Produktivbetrieb ein No-op (die Route entsteht nicht). */
export function registerTestzugangRoute(
  app: FastifyInstance,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!testzugangRouteErlaubt(env)) return;
  app.get(TESTZUGANG_ROUTE, async (): Promise<TestzugangAusweis> => {
    return testzugangAusweis(env);
  });
}
