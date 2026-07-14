// App = die KOMPOSITION. Hier ist NULL fachliche Logik und KEIN verfahrens-spezifischer Screen — nur:
//   1. Die Routen-Deskriptoren (src/app/routes.tsx: Pfad → Gate → Sicht aus src/pages/*).
//   2. Der daraus ABGELEITETE react-router-Baum (src/app/build-routes.tsx): öffentliche
//      Routen, GENAU EIN Session-Gate (RequireSessionOutlet), Arbeitsbereichs- und
//      Permission-Gruppen, Catch-all → Landing. Vertrag in tests/route-gating.guard.test.ts.
//   3. Das First-Run-Gate um alles (Einmal-Setup auf der Landing; Landing und
//      Barrierefreiheit bleiben davor öffentlich erreichbar).
// Alles Fachliche (Antrag-Schritte, Subsumtion, Status-Machine, Arbeitsvorrat-Spalten, Aufsichts-Kennzahlen)
// kommt aus den Kit-Bausteinen + der Config. Tausche die Config (./leistung.config) → dieselbe App, anderes Verfahren.
import { Routes } from "react-router-dom";
import { buildAppRouteChildren } from "./app/build-routes.js";
import { FirstRunGate } from "./app/guards.js";
import { appRoutes } from "./app/routes.js";
import { personaFromPath } from "./app/shell.js";

export function App(): React.JSX.Element {
  return (
    <FirstRunGate>
      <Routes>{buildAppRouteChildren(appRoutes)}</Routes>
    </FirstRunGate>
  );
}

export { personaFromPath };
