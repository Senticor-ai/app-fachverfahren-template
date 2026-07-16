// guards — die Routen-Wächter der App (verbatim aus App.tsx extrahiert, Semantik
// unverändert): EIN Session-Gate als Layout-Route, Workspace-Permissions wie auf dem
// Server (nie Rollen-Literale), Arbeitsbereichs-Gates als reine Navigations-Filter und
// das First-Run-Gate. Vertrag in tests/route-gating.guard.test.ts.
import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { Persona } from "@senticor/fachverfahren-kit";
import { allowedPersonas, personaHome } from "../personas.js";
import { useSession } from "../session.js";
import { needsFirstRunSetup } from "../session-state.js";
import { store } from "../store.js";

/** Das EINE Session-Gate (Layout-Route): jede Route außer der Landing braucht eine Session.
 *  Unangemeldet geht es mit `state.from` zur Landing — nach dem Login kehrt die Landing auf
 *  den angeforderten Deep-Link zurück (postLoginRedirect in landing-state.ts). */
export function RequireSessionOutlet(): React.JSX.Element | null {
  const { status } = useSession();
  const location = useLocation();
  if (status === "loading") return null;
  if (status === "unauthenticated") {
    return (
      <Navigate
        to="/"
        state={{ from: location.pathname + location.search + location.hash }}
        replace
      />
    );
  }
  return <Outlet />;
}

/** Guards für Workspace-Bereiche: prüft eine Workspace-Permission (wie die Server-Routen —
 *  nie Rollen-Literale). Ohne Permission geht es an `fallbackTo` (Default /boards; für den
 *  Boards-Bereich selbst "/" — sonst entstünde eine Redirect-Schleife). */
export function RequirePermission({
  permission,
  fallbackTo = "/boards",
  children,
}: {
  permission: string;
  fallbackTo?: string;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const { status, principal } = useSession();
  if (status === "loading") return null;
  if (status === "unauthenticated") return <Navigate to="/" replace />;
  if (!principal?.permissions?.includes(permission)) {
    return <Navigate to={fallbackTo} replace />;
  }
  return <>{children}</>;
}

/** Layout-Variante von RequirePermission für Routen-Gruppen (Boards-Workspace). */
export function RequirePermissionOutlet({
  permission,
  fallbackTo,
}: {
  permission: string;
  fallbackTo: string;
}): React.JSX.Element {
  return (
    <RequirePermission permission={permission} fallbackTo={fallbackTo}>
      <Outlet />
    </RequirePermission>
  );
}

/** Arbeitsbereichs-Gate: steuert NUR Navigation/Produkt-Erlebnis — KEINE
 *  Autorisierungsgrenze (die trifft der Server über Workspace-Permissions bzw. künftig
 *  Resource-Autorisierung). Ein nicht zugewiesener Arbeitsbereich leitet auf den eigenen
 *  Einstieg um (personaHome: erste eigene Persona → Boards nur mit Permission → Landing). */
export function RequirePersonaExperience({
  persona,
}: {
  persona: Persona;
}): React.JSX.Element | null {
  const { status, principal, capabilities } = useSession();
  if (status === "loading") return null;
  if (status === "unauthenticated") return <Navigate to="/" replace />;
  const allowed = allowedPersonas(principal, capabilities);
  if (!allowed.includes(persona)) {
    return (
      <Navigate
        to={personaHome(allowed, principal?.permissions, store.config)}
        replace
      />
    );
  }
  return <Outlet />;
}

/** First-Run-Gate: solange der Workspace nicht eingerichtet ist (kein Admin existiert), führt
 *  JEDER Pfad zuerst zum Einmal-Setup auf der Landing — die zeigt dann das Bootstrap-Formular.
 *  Die Prädikat-Logik (inkl. Preview-Ausnahme ohne API) lebt testbar in session-state.ts. */
export function FirstRunGate({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const session = useSession();
  const location = useLocation();
  if (needsFirstRunSetup(session) && location.pathname !== "/") {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
