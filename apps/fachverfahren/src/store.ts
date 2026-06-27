// Die EINE Quelle der Wahrheit dieser App: eine einzige Store-Instanz, gebaut aus dem generischen Kit-Store
// + der Hundesteuer-Config. ALLE Bausteine (AntragStepper · Arbeitsvorrat · ReviewWorkspace · AufsichtDashboard)
// konsumieren genau diesen `store` über den `VorgangPort` — keine zweite Datenschicht, kein Screen-spezifischer State.
//
// Das ist der gesamte „fachliche" Code dieser App: NULL. Hundesteuer steckt vollständig in der Config,
// die UX vollständig in den Kit-Bausteinen. Tausche `hundesteuerConfig` gegen eine andere LeistungConfig →
// dieselbe App rendert ein anderes Fachverfahren, ohne eine Zeile hier zu ändern.
import {
  createFachverfahrenStore,
  type FachverfahrenStore,
  type LeistungConfig,
} from "@senticor/fachverfahren-kit";
import { hundesteuerConfig } from "@senticor/fachverfahren-kit/leistungen/hundesteuer";

// Die Composition-App ist VERFAHRENS-AGNOSTISCH: sie kennt nur den generischen Vertrag (VorgangPort/LeistungConfig),
// nie den leistungs-spezifischen Antragstyp (HundesteuerAntrag). Genau das ist der Beweis-Punkt — die App reicht eine
// beliebige `LeistungConfig` an dieselben Bausteine. Darum wird die typisierte Hundesteuer-Config an der EINEN Grenze
// hier auf die generische Record-Form angehoben; jedes Verfahren passt ohne App-Änderung.
const config = hundesteuerConfig as unknown as LeistungConfig;

export const store: FachverfahrenStore<Record<string, unknown>> = createFachverfahrenStore(config);
