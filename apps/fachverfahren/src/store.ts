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
import { createHttpVorgangPersistence } from "./antrag-client.js";
// Die Config kommt aus DER EINEN Austausch-Naht (./leistung.config) — Default = ein NEUTRALES Demo-Verfahren,
// von einem generierenden Build überschrieben mit der aus dem Fachkonzept generierten Config. Die Composition-App bleibt
// VERFAHRENS-AGNOSTISCH: sie reicht eine beliebige LeistungConfig an dieselben Kit-Bausteine.
import { leistungConfig } from "./leistung.config";

// PERSISTENZ: Bürger-Anträge gehen server-seitig an /api/buerger/antraege (owner-scoped, aus der
// Sitzung). Damit überlebt ein Antrag den Reload — vorher lebte er nur im Browser. Die procedureId
// entspricht leistungConfig.id; der Server kennt das Verfahren als antragProcedure (drift-gesichert
// gegen genau diese Config). Der Config-`seed` bleibt der ANFANGSBESTAND (die SB-Arbeitsvorrat-Sicht
// zeigt ihn, ohne zu hydrieren); `store.laden()` ersetzt ihn durch die eigenen Server-Anträge.
export const store: FachverfahrenStore<Record<string, unknown>> =
  createFachverfahrenStore(leistungConfig, {
    persistence: createHttpVorgangPersistence({
      procedureId: leistungConfig.id,
      procedureVersion: "1",
    }),
  });
