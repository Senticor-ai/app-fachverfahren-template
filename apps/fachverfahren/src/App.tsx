// App = die KOMPOSITION. Hier ist NULL fachliche Logik und KEIN verfahrens-spezifischer Screen — nur:
//   1. Routing (react-router): URL → Persona → Kit-Baustein (Sichten in src/pages/*).
//   2. Guards/Hüllen in src/app/* (Session-Gate, Permission-/Arbeitsbereichs-Gates, Shells).
//   3. Das Session-Gate: die Landing ("/") ist die EINZIGE unauthentifizierte Route — ALLE
//      Persona- und Workspace-Routen liegen hinter RequireSessionOutlet (Storybook bleibt die
//      login-freie Demo; Vertrag in tests/route-gating.guard.test.ts).
// Alles Fachliche (Antrag-Schritte, Subsumtion, Status-Machine, Arbeitsvorrat-Spalten, Aufsichts-Kennzahlen)
// kommt aus den Kit-Bausteinen + der Config. Tausche die Config (./leistung.config) → dieselbe App, anderes Verfahren.
import { Navigate, Route, Routes } from "react-router-dom";
import {
  FirstRunGate,
  RequirePermissionOutlet,
  RequirePersonaExperience,
  RequireSessionOutlet,
} from "./app/guards.js";
import { personaFromPath } from "./app/shell.js";
import { LandingPage } from "./LandingPage.js";
import { AdminUsersRoute } from "./pages/admin-users.js";
import { AmtEingangPage } from "./pages/amt-eingang.js";
import { AmtVorgangPage } from "./pages/amt-vorgang.js";
import { AufsichtPage } from "./pages/aufsicht.js";
import { BoardDetailPage } from "./pages/board-detail.js";
import { BoardsListPage } from "./pages/boards-list.js";
import { BuergerAnmeldenPage } from "./pages/buerger-anmelden.js";
import { BuergerBestaetigungPage } from "./pages/buerger-bestaetigung.js";
import { BuergerStartPage } from "./pages/buerger-start.js";
import { KontoPasswortPage } from "./pages/konto-passwort.js";

export function App(): React.JSX.Element {
  return (
    <FirstRunGate>
      <Routes>
        {/* Die Landing ist die EINZIGE unauthentifizierte Route; /login bleibt nur als Alias
            für Bookmarks und Doku bestehen. */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route element={<RequireSessionOutlet />}>
          {/* Arbeitsbereichs-Gates (nur Erlebnis/Navigation, keine Autorisierung). */}
          <Route element={<RequirePersonaExperience persona="buerger" />}>
            <Route path="/buerger" element={<BuergerStartPage />} />
            <Route path="/buerger/anmelden" element={<BuergerAnmeldenPage />} />
            <Route
              path="/buerger/bestaetigung/:id"
              element={<BuergerBestaetigungPage />}
            />
          </Route>
          <Route
            element={<RequirePersonaExperience persona="sachbearbeitung" />}
          >
            <Route path="/amt" element={<AmtEingangPage />} />
            <Route path="/amt/vorgang/:id" element={<AmtVorgangPage />} />
          </Route>
          <Route element={<RequirePersonaExperience persona="aufsicht" />}>
            <Route path="/aufsicht" element={<AufsichtPage />} />
          </Route>
          {/* Team-Workspace: echte Autorisierung (Permission), Redirect-Ziel "/" —
              /boards als Fallback ergäbe hier eine Schleife. */}
          <Route
            element={
              <RequirePermissionOutlet
                permission="boards.collaborate"
                fallbackTo="/"
              />
            }
          >
            <Route path="/boards" element={<BoardsListPage />} />
            <Route path="/boards/:boardId" element={<BoardDetailPage />} />
          </Route>
          <Route path="/admin/users" element={<AdminUsersRoute />} />
          <Route path="/konto/passwort" element={<KontoPasswortPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </FirstRunGate>
  );
}

// `personaFromPath` re-exportiert für etwaige Tests / Deep-Links (URL bleibt die Wahrheit
// über die aktive Persona; die Implementierung lebt in src/app/shell.tsx).
export { personaFromPath };
