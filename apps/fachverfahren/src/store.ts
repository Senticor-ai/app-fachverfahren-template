// Die EINE Quelle der Wahrheit dieser App: eine einzige Store-Instanz, gebaut aus dem generischen Kit-Store
// + der LeistungConfig. ALLE Bausteine (AntragStepper · Arbeitsvorrat · ReviewWorkspace · AufsichtDashboard)
// konsumieren genau diesen `store` über den `VorgangPort` — keine zweite Datenschicht, kein Screen-spezifischer State.
//
// Das ist der gesamte „fachliche" Code dieser App: NULL. Das Verfahren steckt vollständig in der Config,
// die UX vollständig in den Kit-Bausteinen. Tausche die `leistungConfig` (./leistung.config) gegen eine andere →
// dieselbe App rendert ein anderes Fachverfahren, ohne eine Zeile hier zu ändern.
import {
  createFachverfahrenStore,
  type FachverfahrenStore,
} from "@senticor/fachverfahren-kit";
// Die Config kommt aus DER EINEN Austausch-Naht (./leistung.config) — Default = ein NEUTRALES Demo-Verfahren,
// vom governten CHOS-Build überschrieben mit der aus dem Fachkonzept generierten Config. Die Composition-App bleibt
// VERFAHRENS-AGNOSTISCH: sie reicht eine beliebige LeistungConfig an dieselben Kit-Bausteine.
import { leistungConfig } from "./leistung.config";

export const store: FachverfahrenStore<Record<string, unknown>> =
  createFachverfahrenStore(leistungConfig);
