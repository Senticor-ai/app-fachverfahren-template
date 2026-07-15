// case-port — die EINE CasePort-Instanz der App (HTTP-Client gegen /api/cases*). Analog zu
// board-port.ts: die Fall/Dossier-Sichten konsumieren genau diese Instanz, nie `fetch` direkt.
import { createHttpCasePort } from "../case-client.js";

export const casePort = createHttpCasePort();
