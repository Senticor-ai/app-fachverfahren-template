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
import { createHttpAmtVorgangPersistence } from "./amt-client.js";
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

// ── DIE AMTS-SICHT: EIGENE Store-Instanz gegen /api/cases ────────────────────────────────────────────
// WARUM ZWEI INSTANZEN UND NICHT EINE: Bürger- und Amts-Sicht sehen NICHT dasselbe. Der Bürger sieht
// seine eigenen Anträge (owner-scoped), das Amt die Fälle seiner Stelle (behörden-scoped). Eine
// gemeinsame Instanz hätte genau eine Wahrheit haben können — und die andere Sicht hätte sie
// weggezogen. Der Schnitt liegt deshalb an der ROUTE (zwei Nähte), nicht an einer `scope`-Fahne.
//
// KEIN DEMO-SEED: die Amts-Sicht zeigt, was der Server hat — auch wenn das NICHTS ist. Ein Demo-
// Bestand, der aussieht wie echte Arbeit, ist die schlimmere Lüge als ein ehrlich leerer Eingangskorb.
const { seed: _demoSeed, ...ohneSeed } = leistungConfig;
const amtConfig = ohneSeed as typeof leistungConfig;

export const amtStore: FachverfahrenStore<Record<string, unknown>> =
  createFachverfahrenStore(amtConfig, {
    persistence: createHttpAmtVorgangPersistence(leistungConfig),
  });
