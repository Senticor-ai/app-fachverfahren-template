// routes — bindet jede klassifizierte Route (route-gates.ts) an ihre Sicht (src/pages/*).
// Record<AppRoutePath, …> erzwingt Vollständigkeit in beide Richtungen: ein Gate ohne
// Sicht oder eine Sicht ohne Gate ist ein Typfehler, kein Laufzeit-Loch.
import { Navigate } from "react-router-dom";
import { LandingPage } from "../LandingPage.js";
import { AdminUsersRoute } from "../pages/admin-users.js";
import { AmtAktePage } from "../pages/amt-akte.js";
import { AmtAktenPage } from "../pages/amt-akten.js";
import { AmtEingangPage } from "../pages/amt-eingang.js";
import { AmtVorgangPage } from "../pages/amt-vorgang.js";
import { AufsichtPage } from "../pages/aufsicht.js";
import { BoardDetailPage } from "../pages/board-detail.js";
import { BoardsListPage } from "../pages/boards-list.js";
import { BuergerAnmeldenPage } from "../pages/buerger-anmelden.js";
import { BuergerAntragPage } from "../pages/buerger-antrag.js";
import { BuergerAntraegePage } from "../pages/buerger-antraege.js";
import { BuergerBestaetigungPage } from "../pages/buerger-bestaetigung.js";
import { BuergerStartPage } from "../pages/buerger-start.js";
import { KontoPasswortPage } from "../pages/konto-passwort.js";
import type { AppRouteDefinition } from "./route-definition.js";
import { routeGates, type AppRoutePath } from "./route-gates.js";

const routeElements: Record<AppRoutePath, React.JSX.Element> = {
  "/": <LandingPage />,
  "/login": <Navigate to="/" replace />,
  "/buerger": <BuergerStartPage />,
  "/buerger/anmelden": <BuergerAnmeldenPage />,
  "/buerger/bestaetigung/:id": <BuergerBestaetigungPage />,
  "/buerger/antraege": <BuergerAntraegePage />,
  "/buerger/antrag/:id": <BuergerAntragPage />,
  "/amt": <AmtEingangPage />,
  "/amt/vorgang/:id": <AmtVorgangPage />,
  "/amt/akten": <AmtAktenPage />,
  "/amt/akte/:id": <AmtAktePage />,
  "/aufsicht": <AufsichtPage />,
  "/boards": <BoardsListPage />,
  "/boards/:boardId": <BoardDetailPage />,
  "/admin/users": <AdminUsersRoute />,
  "/konto/passwort": <KontoPasswortPage />,
};

export const appRoutes: readonly AppRouteDefinition[] = (
  Object.keys(routeGates) as AppRoutePath[]
).map((path) => ({
  path,
  gate: routeGates[path],
  element: routeElements[path],
}));
