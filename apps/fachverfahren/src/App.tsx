// App = die KOMPOSITION. Hier ist NULL fachliche Logik und KEIN verfahrens-spezifischer Screen — nur:
//   1. Routing (react-router): URL → Persona → Kit-Baustein.
//   2. Die EINE Store-Instanz aus ./store (Kit-Store + LeistungConfig) als `port` an jeden Baustein.
//   3. Persona-Wechsel über die Kit-Shell (Bürger/Sachbearbeitung/Aufsicht), URL-getrieben.
// Alles Fachliche (Antrag-Schritte, Subsumtion, Status-Machine, Arbeitsvorrat-Spalten, Aufsichts-Kennzahlen)
// kommt aus den Kit-Bausteinen + der Config. Tausche die Config (./leistung.config) → dieselbe App, anderes Verfahren.
import { useSyncExternalStore } from "react";
import { Users } from "lucide-react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  AntragStepper,
  Arbeitsvorrat,
  AufsichtDashboard,
  BoardList,
  Button,
  FachverfahrenShell,
  KanbanBoard,
  ReviewWorkspace,
  formatBetragStatus,
  type Persona,
  type ShellNavItem,
  type ShellNavSection,
} from "@senticor/fachverfahren-kit";
import { store } from "./store.js";
import { AdminUsersPage } from "./AdminUsersPage.js";
import { createBoardClient } from "./board-client.js";
import { LoginPage } from "./LoginPage.js";
import { PasswordChangePage } from "./PasswordChangePage.js";
import { useSession } from "./session.js";
import { needsFirstRunSetup } from "./session-state.js";

const boardPort = createBoardClient();

/** Guards `/boards*`: redirects to `/login` until a session exists (kanban plan Gate P0-A). */
function RequireSession({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element | null {
  const { status } = useSession();
  if (status === "loading") return null;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Guards `/admin/*`: prüft eine Workspace-Permission (wie die Server-Routen — nie
 *  Rollen-Literale). Ohne Permission geht es zurück auf /boards statt auf eine Fehlerseite. */
function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}): React.JSX.Element | null {
  const { status, principal } = useSession();
  if (status === "loading") return null;
  if (status === "unauthenticated") return <Navigate to="/login" replace />;
  if (!principal?.permissions?.includes(permission)) {
    return <Navigate to="/boards" replace />;
  }
  return <>{children}</>;
}

/** Workspace-Hülle = DIESELBE Persona-Sidebar wie die Fach-Sichten (FachverfahrenShell), mit
 *  aktivem „Boards"-Eintrag, role-gated „Verwaltung"-Sektion und Konto im Header (Screen-Contract
 *  boards-list: „profile and settings remain reachable from the persistent shell"). Die Boards
 *  zeigen ECHTE Arbeitsdaten — deshalb showDemoBadge=false. */
function BoardsShell({
  activeNavKey,
  children,
}: {
  activeNavKey: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { logout, principal } = useSession();
  const navigate = useNavigate();
  const verwaltung: ShellNavSection[] = principal?.permissions?.includes(
    "users.manage",
  )
    ? [
        {
          label: "Verwaltung",
          items: [
            {
              key: "admin-users",
              label: "Benutzer",
              icon: Users,
              href: "/admin/users",
            },
          ],
        },
      ]
    : [];
  return (
    <FachverfahrenShell
      config={store.config}
      persona="sachbearbeitung"
      onPersonaChange={(next) => navigate(PERSONA_HOME[next])}
      activeNavKey={activeNavKey}
      onNavigate={(item: ShellNavItem) => {
        if (item.href) navigate(item.href);
      }}
      extraNavSections={verwaltung}
      showDemoBadge={false}
      accountSlot={
        <span className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden md:inline">{principal?.email}</span>
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/konto/passwort")}
          >
            Passwort ändern
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void logout()}
          >
            Abmelden
          </Button>
        </span>
      }
    >
      {children}
    </FachverfahrenShell>
  );
}

function BoardsList(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <RequireSession>
      <BoardsShell activeNavKey="boards">
        <BoardList
          port={boardPort}
          onOpen={(id) => navigate(`/boards/${id}`)}
        />
      </BoardsShell>
    </RequireSession>
  );
}

function BoardDetail(): React.JSX.Element {
  const { boardId = "" } = useParams();
  return (
    <RequireSession>
      <BoardsShell activeNavKey="boards">
        <KanbanBoard boardId={boardId} port={boardPort} />
      </BoardsShell>
    </RequireSession>
  );
}

function KontoPasswort(): React.JSX.Element {
  return (
    <RequireSession>
      {/* Kein Sidebar-Eintrag „Konto" — bewusst kein aktiver Nav-Schlüssel. */}
      <BoardsShell activeNavKey="konto">
        <PasswordChangePage />
      </BoardsShell>
    </RequireSession>
  );
}

function AdminUsers(): React.JSX.Element {
  return (
    <RequireSession>
      <RequirePermission permission="users.manage">
        <BoardsShell activeNavKey="admin-users">
          <AdminUsersPage />
        </BoardsShell>
      </RequirePermission>
    </RequireSession>
  );
}

// ── Reaktivität: die Bausteine lesen `port.list()` synchron. Über diesen Hook re-rendert der Routen-Baum,
//    sobald sich der Store ändert (neuer Antrag, Status-Übergang) — der Store bleibt die EINE Quelle. ──
function useStoreVersion(): unknown {
  return useSyncExternalStore(
    (cb) => store.use.subscribe(cb),
    () => store.use.getState().vorgaenge,
    () => store.use.getState().vorgaenge,
  );
}

// ── URL ↔ Persona. Die Shell-Personas hängen am Pfad-Präfix; ein Wechsel navigiert an den Persona-Einstieg. ──
const PERSONA_HOME: Record<Persona, string> = {
  buerger: "/buerger",
  sachbearbeitung: "/amt",
  aufsicht: "/aufsicht",
};

function personaFromPath(pathname: string): Persona {
  if (pathname.startsWith("/amt")) return "sachbearbeitung";
  if (pathname.startsWith("/aufsicht")) return "aufsicht";
  return "buerger";
}

/** Eine Shell-Hülle um jede Route: Branding + Persona-Nav aus der Config, Persona-Wechsel + Nav-Klicks → Router. */
function Shell({
  persona,
  activeNavKey,
  children,
}: {
  persona: Persona;
  activeNavKey?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const navigate = useNavigate();
  const onPersonaChange = (next: Persona) => navigate(PERSONA_HOME[next]);
  const onNavigate = (item: ShellNavItem) => {
    if (item.href) navigate(item.href);
  };
  return (
    <FachverfahrenShell
      config={store.config}
      persona={persona}
      onPersonaChange={onPersonaChange}
      {...(activeNavKey ? { activeNavKey } : {})}
      onNavigate={onNavigate}
    >
      {children}
    </FachverfahrenShell>
  );
}

// ── Routen-Sichten: jede komponiert EINEN Kit-Baustein mit der EINEN Store-Instanz. Kein Domänen-Code. ──

/** /buerger — Einstieg der Bürger:in: direkt der geführte Antrag (der Kit rendert ihn aus der Config). */
function BuergerStart(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <Shell persona="buerger" activeNavKey="start">
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <AntragStepper
          config={store.config}
          port={store}
          onDone={(v) => navigate(`/buerger/bestaetigung/${v.id}`)}
        />
      </div>
    </Shell>
  );
}

/** /buerger/anmelden — derselbe Antrags-Baustein unter dem expliziten „Antrag stellen"-Pfad. */
function BuergerAnmelden(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <Shell persona="buerger" activeNavKey="antrag">
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <AntragStepper
          config={store.config}
          port={store}
          onDone={(v) => navigate(`/buerger/bestaetigung/${v.id}`)}
        />
      </div>
    </Shell>
  );
}

/** /buerger/bestaetigung/:id — Eingangsbestätigung: liest den eben erzeugten Vorgang aus der EINEN Quelle. */
function BuergerBestaetigung(): React.JSX.Element {
  useStoreVersion();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const v = store.get(id);
  return (
    <Shell persona="buerger" activeNavKey="start">
      <div className="mx-auto max-w-2xl p-4 md:p-8">
        {v ? (
          <div className="rounded-lg border border-status-ok/30 bg-status-ok-soft p-6">
            <h1 className="text-lg font-semibold text-foreground">
              Antrag eingegangen
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ihr Vorgang wurde unter der Nummer{" "}
              <span className="font-mono font-medium text-foreground">
                {v.vorgangsnummer}
              </span>{" "}
              aufgenommen und wird geprüft.
            </p>
            {v.berechnung ? (
              <>
                <p className="mt-3 text-sm text-foreground">
                  {v.berechnung.label}: {formatBetragStatus(v.berechnung).text}
                </p>
                {formatBetragStatus(v.berechnung).vorlaeufig ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Vorläufige Angabe — die endgültige Festsetzung erfolgt nach
                    Prüfung; dieser Betrag ist noch nicht verbindlich.
                  </p>
                ) : null}
              </>
            ) : null}
            <button
              type="button"
              onClick={() => navigate("/buerger/anmelden")}
              className="mt-5 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Neuen Antrag stellen
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Vorgang nicht gefunden.
          </p>
        )}
      </div>
    </Shell>
  );
}

/** /amt — Sachbearbeitung: der Arbeitsvorrat (Kit) über der EINEN Quelle; Klick öffnet die Vorgangs-Prüfung. */
function AmtEingang(): React.JSX.Element {
  useStoreVersion();
  const navigate = useNavigate();
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <Arbeitsvorrat
        config={store.config}
        port={store}
        onOpen={(id) => navigate(`/amt/vorgang/${id}`)}
      />
    </Shell>
  );
}

/** /amt/vorgang/:id — die interne Prüf-/Entscheidungs-Sicht (ReviewWorkspace) für EINEN Vorgang. */
function AmtVorgang(): React.JSX.Element {
  useStoreVersion();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <ReviewWorkspace
        config={store.config}
        port={store}
        vorgangId={id}
        rolle="sachbearbeitung"
        // AKTEUR (Person, nicht Rolle): in PROD die angemeldete BundID-Identität. Im DEV-Demo (keine Anmeldung)
        // eine stabile pseudonyme Person, damit die Vier-Augen-Prüfung greift und die History WER-nachweisbar wird
        // (history[].akteur) — der Store erzwingt dann „andere Person als der letzte Akteur" bei vierAugen-Übergängen.
        akteur="sb.angemeldet"
        onClose={() => navigate("/amt")}
      />
    </Shell>
  );
}

/** /aufsicht — die Aufsichts-Kennzahlen / Audit (AufsichtDashboard) über der EINEN Quelle. */
function Aufsicht(): React.JSX.Element {
  useStoreVersion();
  return (
    <Shell persona="aufsicht" activeNavKey="kennzahlen">
      <AufsichtDashboard config={store.config} port={store} />
    </Shell>
  );
}

/** First-Run-Gate: solange der Workspace nicht eingerichtet ist (kein Admin existiert), führt
 *  JEDER Pfad zuerst zum Einmal-Setup — nicht nur /boards. Die Prädikat-Logik (inkl. Preview-
 *  Ausnahme ohne API) lebt testbar in session-state.ts. */
function FirstRunGate({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const session = useSession();
  const location = useLocation();
  if (needsFirstRunSetup(session) && location.pathname !== "/login") {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export function App(): React.JSX.Element {
  return (
    <FirstRunGate>
      <Routes>
        <Route path="/" element={<Navigate to="/buerger" replace />} />
        <Route path="/buerger" element={<BuergerStart />} />
        <Route path="/buerger/anmelden" element={<BuergerAnmelden />} />
        <Route
          path="/buerger/bestaetigung/:id"
          element={<BuergerBestaetigung />}
        />
        <Route path="/amt" element={<AmtEingang />} />
        <Route path="/amt/vorgang/:id" element={<AmtVorgang />} />
        <Route path="/aufsicht" element={<Aufsicht />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/boards" element={<BoardsList />} />
        <Route path="/boards/:boardId" element={<BoardDetail />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/konto/passwort" element={<KontoPasswort />} />
        <Route path="*" element={<Navigate to="/buerger" replace />} />
      </Routes>
    </FirstRunGate>
  );
}

// `personaFromPath` exportiert für etwaige Tests / Deep-Links (URL bleibt die Wahrheit über die aktive Persona).
export { personaFromPath };
