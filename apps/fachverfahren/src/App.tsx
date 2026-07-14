// App = die KOMPOSITION. Hier ist NULL fachliche Logik und KEIN verfahrens-spezifischer Screen — nur:
//   1. Routing (react-router): URL → Persona → Kit-Baustein.
//   2. Der EINE Workspace-Store aus ./store (verfahrensübergreifend) — pro Verfahren ein `VorgangPort`
//      (workspace.portFor), verfahrensübergreifend der `WorkspacePort` selbst.
//   3. Persona-Wechsel über die Kit-Shell (Bürger/Sachbearbeitung/Aufsicht), URL-getrieben.
//   4. Das Session-Gate: die Landing ("/") ist die EINZIGE unauthentifizierte Route — ALLE
//      Persona- und Workspace-Routen liegen hinter RequireSessionOutlet (Storybook bleibt die
//      login-freie Demo; Vertrag in tests/route-gating.guard.test.ts).
// Alles Fachliche (Antrag-Schritte, Subsumtion, Status-Machine, Arbeitsvorrat-Spalten, Aufsichts-Kennzahlen)
// kommt aus den Kit-Bausteinen + den Configs. Ein weiteres Verfahren = ein weiterer Registry-Eintrag.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Users } from "lucide-react";
import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  AKTIVITAET_TYP_LABELS,
  AktivitaetsFeed,
  BEZIEHUNGS_TYP_LABELS,
  AntragStepper,
  Arbeitsvorrat,
  AufsichtDashboard,
  BenutzerEinstellungen,
  BoardList,
  Button,
  FachverfahrenShell,
  FristenKalender,
  KanbanBoard,
  KiSidecar,
  KommentarThread,
  RelationPanel,
  NotificationCenter,
  RegelwerkPanel,
  ReviewWorkspace,
  StatCard,
  VerfahrenInspektor,
  WissensPanel,
  leiteWorkspaceBenachrichtigungen,
  StatusRegionProvider,
  TriageInbox,
  createStubAiAssistPort,
  formatBetragStatus,
  type BenutzerPraeferenzen,
  type Persona,
  type ShellNavItem,
  type ShellNavSection,
} from "@senticor/fachverfahren-kit";
import {
  config,
  primaryProcedureId,
  setWorkspaceAufgabeAngenommen,
  setWorkspaceFehlerSenke,
  store,
  workspace,
} from "./store.js";
import {
  notificationsUeberApi,
  usePersistierteBenachrichtigungen,
} from "./notifications.js";
import { sachbearbeitungNav } from "./verfahren.registry.js";
import { WorkspaceListe } from "./WorkspaceListe.js";
import { VorgangBoard } from "./VorgangBoard.js";
import {
  AkteurProvider,
  AkteurWechsler,
  DEV_AKTEURE,
  useAkteur,
} from "./akteur.js";
import { AdminUsersPage } from "./AdminUsersPage.js";
import { createBoardClient } from "./board-client.js";
import { LandingPage } from "./LandingPage.js";
import { PasswordChangePage } from "./PasswordChangePage.js";
import {
  allowedPersonas,
  PERSONA_HOME,
  personaDescriptors,
  personaHome,
} from "./personas.js";
import { useSession } from "./session.js";
import { needsFirstRunSetup } from "./session-state.js";

const boardPort = createBoardClient();

/** Das EINE Session-Gate (Layout-Route): jede Route außer der Landing braucht eine Session.
 *  Unangemeldet geht es mit `state.from` zur Landing — nach dem Login kehrt die Landing auf
 *  den angeforderten Deep-Link zurück (postLoginRedirect in landing-state.ts). */
function RequireSessionOutlet(): React.JSX.Element | null {
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
function RequirePermission({
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
function RequirePermissionOutlet({
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
function RequirePersonaExperience({
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
      <Navigate to={personaHome(allowed, principal?.permissions)} replace />
    );
  }
  return <Outlet />;
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
  const { logout, principal, capabilities } = useSession();
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
      config={config}
      // Boards = WORKSPACE-Navigation, keine Persona: keine aktive Rolle vortäuschen
      // (Boards-only-Konten haben ggf. gar keinen Arbeitsbereich). Der Wechsler zeigt
      // die zugewiesenen Arbeitsbereiche als Einstiege.
      onPersonaChange={(next) => navigate(PERSONA_HOME[next])}
      personas={personaDescriptors(
        allowedPersonas(principal, capabilities),
        config,
      )}
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

// Die Session-Pflicht liegt zentral auf der RequireSessionOutlet-Layout-Route — die einzelnen
// Sichten prüfen nur noch ihre Permissions.
function BoardsList(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <BoardsShell activeNavKey="boards">
      <BoardList port={boardPort} onOpen={(id) => navigate(`/boards/${id}`)} />
    </BoardsShell>
  );
}

function BoardDetail(): React.JSX.Element {
  const { boardId = "" } = useParams();
  return (
    <BoardsShell activeNavKey="boards">
      <KanbanBoard boardId={boardId} port={boardPort} />
    </BoardsShell>
  );
}

function KontoPasswort(): React.JSX.Element {
  // Kein Sidebar-Eintrag „Konto" — bewusst kein aktiver Nav-Schlüssel.
  return (
    <BoardsShell activeNavKey="konto">
      <PasswordChangePage />
    </BoardsShell>
  );
}

function AdminUsers(): React.JSX.Element {
  return (
    <RequirePermission permission="users.manage">
      <BoardsShell activeNavKey="admin-users">
        <AdminUsersPage />
      </BoardsShell>
    </RequirePermission>
  );
}

// ── Reaktivität: die Bausteine lesen ihren Port synchron. Über diesen Hook re-rendert der Routen-Baum, sobald sich
//    IRGENDEIN Verfahren ODER die Task-Metadaten ändern — der Workspace-Store bleibt die EINE Quelle. ──
function useStoreVersion(): number {
  return useSyncExternalStore(
    (cb) => workspace.subscribe(cb),
    () => workspace.snapshot(),
    () => workspace.snapshot(),
  );
}

// ── URL ↔ Persona. Die Shell-Personas hängen am Pfad-Präfix (PERSONA_HOME in personas.ts). ──
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
  const { principal, capabilities } = useSession();
  const onPersonaChange = (next: Persona) => navigate(PERSONA_HOME[next]);
  const onNavigate = (item: ShellNavItem) => {
    if (item.href) navigate(item.href);
  };
  return (
    <>
      {/* DEV-Identitätsband nur in der Sachbearbeitung — dort greift Vier-Augen (Vorbereiter ≠ Freigeber). */}
      {persona === "sachbearbeitung" ? <AkteurWechsler /> : null}
      <FachverfahrenShell
        config={config}
        persona={persona}
        onPersonaChange={onPersonaChange}
        {...(activeNavKey ? { activeNavKey } : {})}
        onNavigate={onNavigate}
        // Der Wechsler zeigt NUR zugewiesene Arbeitsbereiche (bei ≤1 blendet ihn die
        // Shell aus) — Erlebnis-Filter, keine Autorisierung.
        personas={personaDescriptors(
          allowedPersonas(principal, capabilities),
          config,
        )}
      >
        {children}
      </FachverfahrenShell>
    </>
  );
}

/** App-lokale Sub-Navigation der Sachbearbeitung: zwischen dem verfahrensübergreifenden Workspace und dem
 *  Einzel-Verfahren-Eingangskorb umschalten. (Die verfahrensübergreifende Nav wandert in Phase 7 in die Shell.) */
function AmtSubNav(): React.JSX.Element {
  const { pathname } = useLocation();
  // Daten-getrieben (#22): die Reiter kommen aus der Config (verfahren.registry), nicht mehr aus einer hartkodierten
  // Liste hier — ein generierender Build passt die Nav in der Config an.
  return (
    <nav
      aria-label="Sachbearbeitung"
      className="mx-auto flex max-w-6xl gap-1 px-4 pt-4 md:px-6"
    >
      {sachbearbeitungNav.map((it) => {
        const aktiv = pathname === it.href;
        return (
          <Link
            key={it.href}
            to={it.href}
            aria-current={aktiv ? "page" : undefined}
            className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium ${
              aktiv
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ── Routen-Sichten: jede komponiert EINEN Kit-Baustein mit dem passenden Port. Kein Domänen-Code. ──

/** /buerger — Einstieg der Bürger:in: direkt der geführte Antrag (der Kit rendert ihn aus der Config). */
function BuergerStart(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <Shell persona="buerger" activeNavKey="start">
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <AntragStepper
          config={config}
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
          config={config}
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

/** /amt/liste — die verfahrensÜBERGREIFENDE Aufgabenliste (Workspace) über ALLE Verfahren. Enthält oben ein Feld, um
 *  eine VERFAHRENS-FREIE Aufgabe anzulegen (generisches Projekt-/Workflow-Item ohne Fachverfahren/Vorgang). */
function AmtWorkspace(): React.JSX.Element {
  useStoreVersion();
  const navigate = useNavigate();
  const akteur = useAkteur();
  const [neuerTitel, setNeuerTitel] = useState("");
  const [anlegeFehler, setAnlegeFehler] = useState<string | null>(null);
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <AmtSubNav />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = neuerTitel.trim();
          if (!t) return;
          // createFreieAufgabe kann in einer nicht-unterstützten Datenquelle (HTTP-PROD: app_tasks.procedure_id ist
          // NOT NULL) werfen — im Event-Handler fängt das KEINE React-Error-Boundary. Also hier abfangen, die Eingabe
          // NUR bei Erfolg leeren und den Grund sichtbar melden (statt eines uncaught window.onerror).
          try {
            workspace.createFreieAufgabe(t);
            setNeuerTitel("");
            setAnlegeFehler(null);
          } catch (err) {
            setAnlegeFehler(
              err instanceof Error ? err.message : "Anlegen fehlgeschlagen.",
            );
          }
        }}
        className="mx-auto flex max-w-6xl flex-col gap-1 px-4 pt-4 md:px-6"
      >
        <div className="flex items-center gap-2">
          <input
            value={neuerTitel}
            onChange={(e) => setNeuerTitel(e.target.value)}
            placeholder="Neue Aufgabe (ohne Verfahren) …"
            aria-label="Titel der neuen verfahrens-freien Aufgabe"
            className="h-9 flex-1 rounded-md border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" size="sm" disabled={!neuerTitel.trim()}>
            Aufgabe anlegen
          </Button>
        </div>
        {anlegeFehler ? (
          <p role="alert" className="text-xs text-destructive">
            {anlegeFehler}
          </p>
        ) : null}
      </form>
      <WorkspaceListe
        workspace={workspace}
        aktuellerAkteur={akteur}
        onOpen={(procedureId, vorgangId) =>
          navigate(
            `/amt/vorgang/${encodeURIComponent(`${procedureId}::${vorgangId}`)}`,
          )
        }
      />
    </Shell>
  );
}

/** /amt/inbox — die verfahrensÜBERGREIFENDE Triage-Inbox: offene Eingänge annehmen (→ Vorgang) oder triagieren. */
function AmtInbox(): React.JSX.Element {
  useStoreVersion();
  const navigate = useNavigate();
  const akteur = useAkteur();
  // Im HTTP-Modus liefert acceptInbox die neue Id NICHT synchron (die Annahme ist server-atomar/async) → sie kommt
  // über diesen Haken; im In-Memory-DEV kommt sie synchron als Rückgabewert (unten). Beide Pfade navigieren gleich.
  useEffect(() => {
    setWorkspaceAufgabeAngenommen((taskId) =>
      navigate(`/amt/vorgang/${encodeURIComponent(taskId)}`),
    );
    return () => setWorkspaceAufgabeAngenommen(undefined);
  }, [navigate]);
  const verfahrenLabel = (procedureId: string) =>
    workspace.configFor(procedureId)?.label ?? procedureId;
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <AmtSubNav />
      <div className="pt-2">
        <TriageInbox
          eingaenge={workspace.listInbox()}
          verfahrenLabel={verfahrenLabel}
          quelleLabel={{
            antrag: "Antrag",
            email: "E-Mail",
            formular: "Formular",
            register: "Register",
          }}
          onAnnehmen={(id) => {
            const taskId = workspace.acceptInbox(id, akteur);
            // Nach Annahme direkt in die Prüf-/Entscheidungssicht des neu erzeugten Vorgangs.
            if (taskId) navigate(`/amt/vorgang/${encodeURIComponent(taskId)}`);
          }}
          onTriage={(id, status) => workspace.triageInbox(id, status)}
        />
      </div>
    </Shell>
  );
}

/** /amt/board — das Kanban-Board (Drag&Drop + Tastatur-Aktionsmenü) über alle Verfahren des Workspace. */
function AmtBoard(): React.JSX.Element {
  useStoreVersion();
  const navigate = useNavigate();
  const akteur = useAkteur();
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <AmtSubNav />
      <VorgangBoard
        workspace={workspace}
        aktuellerAkteur={akteur}
        zuweisbareAkteure={DEV_AKTEURE}
        onOpen={(procedureId, vorgangId) =>
          navigate(
            `/amt/vorgang/${encodeURIComponent(`${procedureId}::${vorgangId}`)}`,
          )
        }
      />
    </Shell>
  );
}

/** /amt — Einzel-Verfahren-Eingangskorb (Arbeitsvorrat) des primären Verfahrens; Klick öffnet die Prüfung. */
function AmtEingang(): React.JSX.Element {
  useStoreVersion();
  const navigate = useNavigate();
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <AmtSubNav />
      <div className="pt-2">
        <Arbeitsvorrat
          config={config}
          port={store}
          onOpen={(id) =>
            navigate(
              `/amt/vorgang/${encodeURIComponent(`${primaryProcedureId}::${id}`)}`,
            )
          }
        />
      </div>
    </Shell>
  );
}

// DEV-KI-Assistenz: ein deterministischer Stub-Port (KEIN Modell, KEIN Netz). In PROD dockt ein echter LLM/Broker an
// DENSELBEN `KiAssistPort` an (server: /api/tasks/:id/ai/assist). Der Vorschlag ist rein ASSISTIV; der Mensch
// entscheidet (HITL, EU-AI-Act Art. 50) — die KI ist NIE eines der zwei Augen einer Vier-Augen-Entscheidung.
const kiAssist = createStubAiAssistPort({
  quelle: "Fristen-/Vorprüfungs-Heuristik (Demo-Stub)",
  standardKonfidenz: 0.72,
  generator: (eingabe) => {
    const konfidenz = Number(
      (eingabe.kontext as { konfidenz?: number } | undefined)?.konfidenz ?? 1,
    );
    const prio = konfidenz < 0.7 ? "hoch" : "normal";
    return {
      wert: prio,
      begruendung: `KI-Einschätzung der Vorprüfung (Konfidenz ${Math.round(konfidenz * 100)} %): Vorschlag Priorität „${prio}". Die Entscheidung liegt bei Ihnen.`,
    };
  },
});

/** /amt/vorgang/:id — die interne Prüf-/Entscheidungs-Sicht (ReviewWorkspace) + das assistive KI-Sidecar. Verfahren
 *  wird aus der Aufgabe aufgelöst (verfahrensübergreifend korrekt); Fallback auf das primäre Verfahren. */
function AmtVorgang(): React.JSX.Element {
  useStoreVersion();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const akteur = useAkteur();
  // Der Routen-Parameter ist die verfahrens-qualifizierte Aufgaben-Id (`procedureId::vorgangId`) — global eindeutig,
  // daher kein mehrdeutiges `resolveTaskId`. Verfahren + ROHE Vorgangs-Id werden daraus abgeleitet; die
  // Prüf-Sicht arbeitet gegen den Sub-Store des richtigen Verfahrens. Fallback auf das primäre Verfahren
  // (z. B. alte Lesezeichen mit roher, eindeutiger Id).
  const task = workspace.getTask(id);
  const procedureId = task?.procedureId ?? primaryProcedureId;
  const cfg = workspace.configFor(procedureId) ?? config;
  const port = workspace.portFor(procedureId) ?? store;
  const vorgangId = task?.vorgangId ?? id;
  const vorgang = port.get(vorgangId);
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-4 md:px-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <ReviewWorkspace
            config={cfg}
            port={port}
            vorgangId={vorgangId}
            rolle="sachbearbeitung"
            akteur={akteur}
            onClose={() => navigate("/amt")}
          />
          {/* Zusammenarbeit an der Aufgabe: interne Vermerke (append-only), Aktivitäts-Feed, Beziehungen —
              dieselben WorkspacePort-Methoden wie im Board-Drawer, hier in der vollen Prüf-/Detailsicht. */}
          {task ? (
            <div className="mt-8 flex flex-col gap-8">
              <KommentarThread
                kommentare={workspace.listKommentare(task.id)}
                schreibenErlaubt
                onVermerk={(text) =>
                  workspace.addKommentar(task.id, text, akteur)
                }
              />
              <AktivitaetsFeed
                aktivitaeten={workspace.listAktivitaet(task.id)}
                typLabels={AKTIVITAET_TYP_LABELS}
              />
              <RelationPanel
                beziehungen={workspace.listBeziehungen(task.id)}
                bearbeitenErlaubt
                typLabels={BEZIEHUNGS_TYP_LABELS}
                aufgabenTitel={Object.fromEntries(
                  workspace.listTasks().map((a) => [a.id, a.titel]),
                )}
                anlegbareAufgaben={workspace
                  .listTasks()
                  .filter((a) => a.id !== task.id)
                  .map((a) => ({ id: a.id, titel: a.titel }))}
                onAnlegen={(zielId, typ) =>
                  workspace.addBeziehung(task.id, zielId, typ, akteur)
                }
                onEntfernen={(rid) => workspace.entferneBeziehung(task.id, rid)}
              />
            </div>
          ) : null}
        </div>
        {task ? (
          <StatusRegionProvider>
            <div className="lg:w-80 lg:shrink-0">
              <KiSidecar
                kiAssist={kiAssist}
                eingabe={{
                  text: `Vorgang ${vorgang?.vorgangsnummer ?? vorgangId} — ${cfg.label}`,
                  kontext: {
                    konfidenz: vorgang?.ki?.confidence ?? 1,
                    flags: vorgang?.ki?.flags ?? [],
                  },
                }}
                funktionsName="Priorisierung"
                // HITL: der Mensch übernimmt → nicht-autoritative Metadaten setzen UND die KI-Herkunft protokollieren
                // (`task.ki-uebernommen`, marking "ki-vorschlag"). KEIN Vier-Augen-Gate; server-autoritativ /ai/apply.
                onUebernahme={(ergebnis) =>
                  workspace.uebernehmeKiVorschlag(
                    task.id,
                    { prioritaet: ergebnis.wert },
                    akteur,
                  )
                }
              />
            </div>
          </StatusRegionProvider>
        ) : null}
      </div>
    </Shell>
  );
}

/** /aufsicht — die Aufsichts-Kennzahlen / Audit (AufsichtDashboard) über dem primären Verfahren. */
function Aufsicht(): React.JSX.Element {
  useStoreVersion();
  return (
    <Shell persona="aufsicht" activeNavKey="kennzahlen">
      <AufsichtDashboard config={config} port={store} />
    </Shell>
  );
}

// Persönliche Präferenzen — DEV: localStorage (SSR-/Privatmodus-sicher, wirft nie). In PROD kommen sie über den
// server-seitigen Preferences-Store (/api/preferences, app_user_preferences); die Naht ist dieselbe (value + onChange).
const PRAEF_KEY = "fv.praeferenzen";
const STANDARD_PRAEF: BenutzerPraeferenzen = {
  standardansicht: "inbox",
  kompakteListen: false,
};
function ladePraeferenzen(): BenutzerPraeferenzen {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const roh = window.localStorage.getItem(PRAEF_KEY);
      if (roh) return { ...STANDARD_PRAEF, ...JSON.parse(roh) };
    }
  } catch {
    /* localStorage blockiert/fehlt — Default */
  }
  return STANDARD_PRAEF;
}

/** /amt/einstellungen — persönliche Nutzer-Einstellungen (Farbschema + Startansicht + Darstellung), lokal persistiert. */
function AmtEinstellungen(): React.JSX.Element {
  const [prefs, setPrefs] = useState<BenutzerPraeferenzen>(ladePraeferenzen);
  useEffect(() => {
    try {
      window.localStorage?.setItem(PRAEF_KEY, JSON.stringify(prefs));
    } catch {
      /* Persistenz best-effort */
    }
  }, [prefs]);
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <AmtSubNav />
      <div className="px-4 pt-4 md:px-6">
        <StatusRegionProvider>
          <BenutzerEinstellungen
            praeferenzen={prefs}
            ansichten={[
              { wert: "inbox", label: "Eingang" },
              { wert: "liste", label: "Alle Verfahren" },
              { wert: "board", label: "Board" },
            ]}
            onChange={(patch) => setPrefs((p) => ({ ...p, ...patch }))}
          />
        </StatusRegionProvider>
      </div>
    </Shell>
  );
}

/** /amt/dashboard — verfahrensÜBERGREIFENDE Kennzahlen der Sachbearbeitung (StatCard-Raster). Rein data-driven aus
 *  dem Workspace-Store (alle Verfahren), kein Verfahrens-Literal. */
function AmtDashboard(): React.JSX.Element {
  useStoreVersion();
  const alle = workspace.listTasks();
  const nichtZugewiesen = alle.filter((t) => !t.zugewiesenAn).length;
  const hochPrio = alle.filter(
    (t) => t.prioritaet === "dringend" || t.prioritaet === "hoch",
  ).length;
  const jeVerfahren = workspace.verfahren().map((e) => ({
    label: workspace.configFor(e.procedureId)?.label ?? e.procedureId,
    count: alle.filter((t) => t.procedureId === e.procedureId).length,
  }));
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <AmtSubNav />
      <div className="mx-auto max-w-6xl px-4 pt-4 md:px-6">
        <h1 className="text-lg font-semibold text-foreground">
          Übersicht (verfahrensübergreifend)
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kennzahlen über alle {jeVerfahren.length} Verfahren des Workspace.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Offene Aufgaben"
            value={alle.length}
            hint="über alle Verfahren"
          />
          <StatCard
            label="Nicht zugewiesen"
            value={nichtZugewiesen}
            hint="warten auf Zuweisung"
          />
          <StatCard
            label="Dringend / Hoch"
            value={hochPrio}
            hint="priorisierte Aufgaben"
          />
          <StatCard
            label="Aktive Verfahren"
            value={jeVerfahren.length}
            hint="im Workspace"
          />
        </div>
        <h2 className="mt-6 text-sm font-semibold text-foreground">
          Je Verfahren
        </h2>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jeVerfahren.map((v) => (
            <StatCard
              key={v.label}
              label={v.label}
              value={v.count}
              hint="Aufgaben"
            />
          ))}
        </div>
      </div>
    </Shell>
  );
}

/** /amt/kalender — verfahrensÜBERGREIFENDE Fristen-Übersicht: die aus der Config (fristenTypen) abgeleiteten
 *  Fälligkeiten aller offenen Aufgaben als Kalender. Data-driven; keine frei gesetzten Fristen. */
function AmtKalender(): React.JSX.Element {
  useStoreVersion();
  const eintraege = workspace
    .listTasks()
    .filter((t) => t.faelligIso)
    .map((t) => ({
      datum: t.faelligIso!.slice(0, 10),
      label: t.titel,
      art: "frist" as const,
    }));
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <AmtSubNav />
      <div className="mx-auto max-w-3xl px-4 pt-4 md:px-6">
        <FristenKalender
          eintraege={eintraege}
          titel="Fristen (verfahrensübergreifend)"
          beschreibung="Aus den Bearbeitungsfristen der Verfahren abgeleitete Fälligkeiten aller offenen Aufgaben."
        />
      </div>
    </Shell>
  );
}

/** /amt/regeln — das WORKFLOW-/REGELWERK: die deklarativen Automations-/Hook-Regeln (workspace-weit + je Verfahren)
 *  als DATEN, mit reinem Trockenlauf gegen den ersten Beispiel-Vorgang. Die Ausführung bleibt server-autoritativ. */
function AmtRegeln(): React.JSX.Element {
  useStoreVersion();
  const regeln = [
    ...(workspace.config.automationenGlobal ?? []),
    ...workspace.verfahren().flatMap((v) => v.config.automationen ?? []),
  ];
  const ersteAufgabe = workspace
    .listTasks()
    .find((a) => a.vorgangId && a.procedureId);
  const vorgang =
    ersteAufgabe?.procedureId && ersteAufgabe.vorgangId
      ? workspace.portFor(ersteAufgabe.procedureId)?.get(ersteAufgabe.vorgangId)
      : undefined;
  const beispiel = ersteAufgabe
    ? { aufgabe: ersteAufgabe, ...(vorgang ? { vorgang } : {}) }
    : undefined;
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <AmtSubNav />
      <RegelwerkPanel
        regeln={regeln}
        prioritaeten={workspace.config.prioritaeten}
        {...(beispiel ? { beispiel } : {})}
      />
    </Shell>
  );
}

/** /amt/wissen — die interne WISSENSBASIS/WIKI: die `wissen`-Artikel (DATEN) des Workspace als Master-Detail
 *  (kategorisierte Navigation + Markdown-Ansicht). Neutrale Arbeitshilfen zum System selbst. */
function AmtWissen(): React.JSX.Element {
  useStoreVersion();
  // #20: SYNCHRON aus dem Port (kein await im Render) — DEV liefert das Config-Wissen, PROD seedet daraus und lädt
  // die versionierte Wissensbasis per /api/wiki nach (der Snapshot-Bump rendert dann neu, kein Leerflackern).
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <AmtSubNav />
      <WissensPanel
        artikel={workspace.listWissen()}
        onSpeichern={(input) => workspace.speichereWissen(input)}
        revisionen={(id) => workspace.listWissenRevisionen(id)}
      />
    </Shell>
  );
}

/** /amt/verfahren — der VERFAHREN-INSPEKTOR: die eine Naht (`LeistungConfig`) je aktivem Verfahren browsbar +
 *  strukturell validierbar (Steckbrief · Befunde · Kennzahlen · Prozess-Diagramm). Hilft beim Entwickeln neuer und
 *  Integrieren bestehender Fachverfahren. */
function AmtVerfahren(): React.JSX.Element {
  useStoreVersion();
  const verfahren = workspace.verfahren();
  const [gewaehlt, setGewaehlt] = useState(verfahren[0]?.procedureId ?? "");
  const eintrag =
    verfahren.find((v) => v.procedureId === gewaehlt) ?? verfahren[0];
  const automationen = [
    ...(workspace.config.automationenGlobal ?? []),
    ...(eintrag?.config.automationen ?? []),
  ];
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <AmtSubNav />
      {verfahren.length > 1 ? (
        <div className="mx-auto flex max-w-4xl flex-wrap gap-2 px-4 pt-4 md:px-6">
          {verfahren.map((v) => (
            <Button
              key={v.procedureId}
              type="button"
              variant={
                v.procedureId === (eintrag?.procedureId ?? "")
                  ? "default"
                  : "outline"
              }
              size="sm"
              onClick={() => setGewaehlt(v.procedureId)}
            >
              {v.config.label}
            </Button>
          ))}
        </div>
      ) : null}
      {eintrag ? (
        <VerfahrenInspektor
          config={eintrag.config}
          automationen={automationen}
        />
      ) : (
        <p className="mx-auto max-w-4xl p-6 text-sm text-muted-foreground">
          Kein aktives Verfahren im Workspace.
        </p>
      )}
    </Shell>
  );
}

/** /amt/benachrichtigungen — Collaboration/Meldungen im generischen NotificationCenter.
 *  PROD (`VITE_API_BASE_URL` gesetzt): die vom Notification-Projektor (2. Fan-out-Backend, #18) PERSISTIERTEN
 *  Meldungen aus `/api/notifications` — server-autoritativ, über Prozess-Neustarts hinweg, gelesen via POST.
 *  DEV (ohne API): die aus dem Aufgabenbestand ABGELEITETEN Meldungen (Ihnen zugewiesen · Fristwarnungen) mit
 *  lokalem Gelesen-Zustand — byte-stabil unverändert. Beide Hooks laufen unbedingt (Regeln der Hooks); je nach
 *  Naht wird nur das eine ODER das andere Ergebnis angezeigt. */
function AmtBenachrichtigungen(): React.JSX.Element {
  useStoreVersion();
  const akteur = useAkteur();
  // Persistierte Meldungen (nur aktiv, wenn eine API-Basis konfiguriert ist — sonst leer/inert).
  const persistiert = usePersistierteBenachrichtigungen();
  // „Jetzt" EINMAL beim Mounten festhalten (kein Date.now() im Render → keine Hydration-Diskrepanz, stabile Sortierung).
  const [nowIso] = useState(() => new Date().toISOString());
  const [gelesen, setGelesen] = useState<Set<string>>(new Set());
  const roh = leiteWorkspaceBenachrichtigungen({
    aufgaben: workspace.listTasks(),
    aktuellerAkteur: akteur,
    nowIso,
  });
  const abgeleitet = roh.map((b) => ({
    ...b,
    gelesen: gelesen.has(b.id),
  }));
  const benachrichtigungen = notificationsUeberApi
    ? persistiert.benachrichtigungen
    : abgeleitet;
  const onMarkiereGelesen = notificationsUeberApi
    ? persistiert.markiere
    : (id: string) => setGelesen((s) => new Set(s).add(id));
  const onAlleGelesen = notificationsUeberApi
    ? persistiert.markiereAlle
    : () => setGelesen(new Set(roh.map((b) => b.id)));
  return (
    <Shell persona="sachbearbeitung" activeNavKey="eingang">
      <AmtSubNav />
      <div className="mx-auto max-w-3xl p-4 md:p-6">
        <NotificationCenter
          benachrichtigungen={benachrichtigungen}
          onMarkiereGelesen={onMarkiereGelesen}
          onAlleGelesen={onAlleGelesen}
        />
      </div>
    </Shell>
  );
}

/** Globaler Fehler-Toast: registriert die Workspace-Fehler-Senke (server-autoritative Fehler des HTTP-Ports —
 *  403/409/Vier-Augen/Netz) und zeigt sie sichtbar + als `role="alert"` an, statt sie still zu schlucken. Im
 *  In-Memory-DEV-Modus feuert die Senke nie (dort ist alles synchron, Fehler werfen direkt). */
function WorkspaceFehlerToast(): React.JSX.Element | null {
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    setWorkspaceFehlerSenke((f) =>
      setFehler(f instanceof Error ? f.message : String(f)),
    );
    return () => setWorkspaceFehlerSenke(undefined);
  }, []);
  if (!fehler) return null;
  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-2 rounded-md border border-destructive/40 bg-card px-4 py-3 text-sm text-foreground shadow-lg"
    >
      <span className="mt-0.5 shrink-0 text-destructive" aria-hidden="true">
        ⚠
      </span>
      <p className="flex-1">{fehler}</p>
      <button
        type="button"
        onClick={() => setFehler(null)}
        aria-label="Meldung schließen"
        className="text-muted-foreground hover:text-foreground"
      >
        ×
      </button>
    </div>
  );
}

/** First-Run-Gate: solange der Workspace nicht eingerichtet ist (kein Admin existiert), führt
 *  JEDER Pfad zuerst zum Einmal-Setup auf der Landing — die zeigt dann das Bootstrap-Formular.
 *  Die Prädikat-Logik (inkl. Preview-Ausnahme ohne API) lebt testbar in session-state.ts. */
function FirstRunGate({
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

export function App(): React.JSX.Element {
  return (
    <AkteurProvider>
      <WorkspaceFehlerToast />
      <FirstRunGate>
        <Routes>
          {/* Die Landing ist die EINZIGE unauthentifizierte Route; /login bleibt nur als Alias
              für Bookmarks und Doku bestehen. */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route element={<RequireSessionOutlet />}>
            {/* Arbeitsbereichs-Gates (nur Erlebnis/Navigation, keine Autorisierung). */}
            <Route element={<RequirePersonaExperience persona="buerger" />}>
              <Route path="/buerger" element={<BuergerStart />} />
              <Route path="/buerger/anmelden" element={<BuergerAnmelden />} />
              <Route
                path="/buerger/bestaetigung/:id"
                element={<BuergerBestaetigung />}
              />
            </Route>
            {/* Sachbearbeitung: ihr Persona-Gate + UNSERE vollen /amt/*-Sichten. */}
            <Route
              element={<RequirePersonaExperience persona="sachbearbeitung" />}
            >
              <Route path="/amt" element={<AmtEingang />} />
              <Route path="/amt/inbox" element={<AmtInbox />} />
              <Route path="/amt/liste" element={<AmtWorkspace />} />
              <Route path="/amt/board" element={<AmtBoard />} />
              <Route path="/amt/vorgang/:id" element={<AmtVorgang />} />
              <Route path="/amt/dashboard" element={<AmtDashboard />} />
              <Route path="/amt/kalender" element={<AmtKalender />} />
              <Route path="/amt/regeln" element={<AmtRegeln />} />
              <Route path="/amt/verfahren" element={<AmtVerfahren />} />
              <Route path="/amt/wissen" element={<AmtWissen />} />
              <Route
                path="/amt/benachrichtigungen"
                element={<AmtBenachrichtigungen />}
              />
              <Route path="/amt/einstellungen" element={<AmtEinstellungen />} />
            </Route>
            <Route element={<RequirePersonaExperience persona="aufsicht" />}>
              <Route path="/aufsicht" element={<Aufsicht />} />
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
              <Route path="/boards" element={<BoardsList />} />
              <Route path="/boards/:boardId" element={<BoardDetail />} />
            </Route>
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/konto/passwort" element={<KontoPasswort />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </FirstRunGate>
    </AkteurProvider>
  );
}

// `personaFromPath` exportiert für etwaige Tests / Deep-Links (URL bleibt die Wahrheit über die aktive Persona).
export { personaFromPath };
