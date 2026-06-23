import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicRuntimeConfig } from "@senticor/public-sector-sdk";
import {
  ApplicantIdentity,
  CaseStatus,
  DeadlineIndicator,
  EvidenceList,
  PaymentStatus,
  ServiceHeader,
} from "@senticor/public-sector-ui";
import {
  ArrowUpDown,
  Bell,
  Briefcase,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Filter,
  FileText,
  Inbox,
  LogIn,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  User,
  Users,
  X,
} from "lucide-react";
import {
  loadNotifications,
  loadSession,
  loginMockUser,
  logoutSession,
} from "../api/session.js";
import {
  loadMailbox,
  loadUserPreferences,
  saveUserPreferences,
} from "../api/app-data.js";
import { Button } from "../components/ui/button.js";
import { defaultPublicRuntimeConfig } from "../config/default-runtime.js";
import { loadPublicRuntimeConfig } from "../config/runtime.js";
import { t } from "../i18n/messages.js";
import type {
  MailboxMessage,
  UserPreferences,
  UserPreferencesUpdate,
} from "../../shared/app-contracts.js";
import {
  createLoggedOutSession,
  type MockNotification,
  type MockSessionResponse,
  type MockUser,
} from "../../shared/mock-data.js";

type SessionStatus = "loading" | "ready" | "error";
type WorkspaceSection =
  | "inbox"
  | "assigned"
  | "deadlines"
  | "decisions"
  | "search";
type CitizenSection = "overview" | "cases" | "messages";

interface NavigationItem {
  href: `#${string}`;
  label: string;
}

interface CapabilityMenuItem {
  evidenceId: string;
  label: string;
  source: string;
}

const citizenMockUserId = "citizen-anna-muster";
const caseworkerMockUserId = "caseworker-max-beispiel";

const citizenNavigation: NavigationItem[] = [
  { href: "#overview", label: "Übersicht" },
  { href: "#cases", label: "Meine Vorgänge" },
  { href: "#messages", label: "Nachrichten" },
];

const caseworkerNavigation: NavigationItem[] = [
  { href: "#inbox", label: "Eingang" },
  { href: "#assigned", label: "Zugewiesen" },
  { href: "#deadlines", label: "Fristen" },
  { href: "#decisions", label: "Entscheidungen" },
  { href: "#search", label: "Suche" },
];

const citizenSteps = [
  {
    title: "Angaben prüfen",
    body: "Der Entwurf enthält bereits gespeicherte Angaben. Sie können ihn fortsetzen oder löschen.",
  },
  {
    title: "Unterlagen ergänzen",
    body: "Falls Unterlagen benötigt werden, führt der Vorgang Schritt für Schritt durch den Upload.",
  },
  {
    title: "Rückmeldung erhalten",
    body: "Neue Nachrichten erscheinen hier und im Postfach des Vorgangs.",
  },
];

interface CitizenCaseItem {
  id: string;
  title: string;
  status: string;
  statusTone: "neutral" | "success" | "warning" | "critical";
  nextStep: string;
  updatedAt: string;
}

const citizenCases: CitizenCaseItem[] = [
  {
    id: "FV-2026-0022",
    title: "Neuer generischer Vorgang",
    status: "Neu",
    statusTone: "neutral",
    nextStep: "Anliegen auswählen",
    updatedAt: "2026-06-23",
  },
  {
    id: "FV-2026-0017",
    title: "Neutrales Beispielverfahren",
    status: "Entwurf",
    statusTone: "warning",
    nextStep: "Angaben prüfen",
    updatedAt: "2026-06-23",
  },
  {
    id: "FV-2026-0012",
    title: "Allgemeiner Antrag",
    status: "In Bearbeitung",
    statusTone: "neutral",
    nextStep: "Rückmeldung abwarten",
    updatedAt: "2026-06-21",
  },
  {
    id: "FV-2026-0009",
    title: "Nachreichung",
    status: "Rückfrage offen",
    statusTone: "warning",
    nextStep: "Nachricht beantworten",
    updatedAt: "2026-06-20",
  },
];

interface CaseRow {
  id: string;
  applicant: string;
  procedure: string;
  status: string;
  dueAt: string;
  unit: string;
  assignedTo: string;
  decisionRequired: boolean;
}

const caseRows: CaseRow[] = [
  {
    id: "FV-2026-0017",
    applicant: "Anna Muster",
    procedure: "Neutrales Beispielverfahren",
    status: "Review erforderlich",
    dueAt: "2026-07-02",
    unit: "Team Eingang",
    assignedTo: "Max Beispiel",
    decisionRequired: true,
  },
  {
    id: "FV-2026-0018",
    applicant: "Milan Schmidt",
    procedure: "Allgemeiner Antrag",
    status: "In Bearbeitung",
    dueAt: "2026-07-05",
    unit: "Team Leistungen",
    assignedTo: "Max Beispiel",
    decisionRequired: false,
  },
  {
    id: "FV-2026-0019",
    applicant: "Frau Nguyen",
    procedure: "Nachreichung",
    status: "Wartet auf Antwort",
    dueAt: "2026-07-09",
    unit: "Team Eingang",
    assignedTo: "Team Eingang",
    decisionRequired: false,
  },
  {
    id: "FV-2026-0020",
    applicant: "Lena Hoffmann",
    procedure: "Entscheidungsvorlage",
    status: "Freigabe erforderlich",
    dueAt: "2026-07-01",
    unit: "Team Leistungen",
    assignedTo: "Max Beispiel",
    decisionRequired: true,
  },
  {
    id: "FV-2026-0021",
    applicant: "Amir Yilmaz",
    procedure: "Fristprüfung",
    status: "Frist nah",
    dueAt: "2026-07-04",
    unit: "Team Eingang",
    assignedTo: "Max Beispiel",
    decisionRequired: false,
  },
];

const auditEntries = [
  "Sitzung gestartet",
  "Rolle und Zuständigkeit geprüft",
  "Konfiguration geladen",
];

export function App() {
  const [config, setConfig] = useState<PublicRuntimeConfig>(
    defaultPublicRuntimeConfig,
  );
  const [session, setSession] = useState<MockSessionResponse>(
    createLoggedOutSession(),
  );
  const [notifications, setNotifications] = useState<MockNotification[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [inboxMessages, setInboxMessages] = useState<MailboxMessage[]>([]);
  const [outboxMessages, setOutboxMessages] = useState<MailboxMessage[]>([]);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("loading");

  useEffect(() => {
    void loadPublicRuntimeConfig().then(setConfig);
  }, []);

  useEffect(() => {
    void synchronizeSession();
  }, []);

  useEffect(() => {
    document.documentElement.lang = config.localization.defaultLocale;
    document.title = config.application.displayName;
  }, [config]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncPreferences = () =>
      applyPreferences(preferences, mediaQuery.matches);

    syncPreferences();

    if (preferences?.colorScheme !== "system") {
      return;
    }

    mediaQuery.addEventListener("change", syncPreferences);
    return () => mediaQuery.removeEventListener("change", syncPreferences);
  }, [preferences]);

  const capabilityItems = useMemo<CapabilityMenuItem[]>(
    () =>
      Object.values(config.capabilities).map((capability) => ({
        evidenceId: capability.id,
        label: capability.displayName,
        source: capability.available ? "verfügbar" : "nicht verbunden",
      })),
    [config.capabilities],
  );

  async function synchronizeSession(): Promise<void> {
    setSessionStatus("loading");
    try {
      const nextSession = await loadSession();
      setSession(nextSession);

      if (nextSession.authenticated && nextSession.user) {
        const [
          nextNotifications,
          nextPreferences,
          nextInboxMessages,
          nextOutboxMessages,
        ] = await loadUserExperience(nextSession.user);
        setNotifications([...nextNotifications.notifications]);
        setPreferences(nextPreferences.preferences);
        setInboxMessages([...nextInboxMessages.messages]);
        setOutboxMessages([...nextOutboxMessages.messages]);
      } else {
        setNotifications([]);
        setPreferences(null);
        setInboxMessages([]);
        setOutboxMessages([]);
      }

      setSessionStatus("ready");
    } catch {
      setSession(createLoggedOutSession());
      setNotifications([]);
      setPreferences(null);
      setInboxMessages([]);
      setOutboxMessages([]);
      setSessionStatus("error");
    }
  }

  async function handleLogin(userId: string): Promise<void> {
    setSessionStatus("loading");
    try {
      const nextSession = await loginMockUser(userId);
      if (!nextSession.user) {
        throw new Error("authenticated session has no user");
      }
      const [
        nextNotifications,
        nextPreferences,
        nextInboxMessages,
        nextOutboxMessages,
      ] = await loadUserExperience(nextSession.user);
      setSession(nextSession);
      setNotifications([...nextNotifications.notifications]);
      setPreferences(nextPreferences.preferences);
      setInboxMessages([...nextInboxMessages.messages]);
      setOutboxMessages([...nextOutboxMessages.messages]);
      setSessionStatus("ready");
    } catch {
      setSession(createLoggedOutSession());
      setNotifications([]);
      setPreferences(null);
      setInboxMessages([]);
      setOutboxMessages([]);
      setSessionStatus("error");
    }
  }

  async function handleLogout(): Promise<void> {
    setSessionStatus("loading");
    try {
      const nextSession = await logoutSession();
      setSession(nextSession);
      setNotifications([]);
      setPreferences(null);
      setInboxMessages([]);
      setOutboxMessages([]);
      setSessionStatus("ready");
    } catch {
      setSessionStatus("error");
    }
  }

  const user = session.authenticated ? session.user : null;

  async function handlePreferenceUpdate(
    update: UserPreferencesUpdate,
  ): Promise<void> {
    const nextPreferences = await saveUserPreferences(update);
    setPreferences(nextPreferences.preferences);
  }

  return (
    <div
      className={[
        "app-shell",
        user ? "app-shell--authenticated" : "app-shell--login",
      ].join(" ")}
    >
      <a className="skip-link" href="#main-content">
        {t("app.skipToMain")}
      </a>

      {user ? (
        <AuthenticatedShell
          capabilityItems={capabilityItems}
          config={config}
          inboxMessages={inboxMessages}
          notifications={notifications}
          onLogout={handleLogout}
          onPreferenceUpdate={handlePreferenceUpdate}
          outboxMessages={outboxMessages}
          preferences={preferences}
          sessionStatus={sessionStatus}
          user={user}
        />
      ) : (
        <LoginScreen
          config={config}
          onLogin={handleLogin}
          sessionStatus={sessionStatus}
        />
      )}
    </div>
  );
}

async function loadUserExperience(user: MockUser) {
  const mailboxSurface = user.kind === "caseworker" ? "work" : "me";
  return Promise.all([
    loadNotifications(),
    loadUserPreferences(),
    loadMailbox(mailboxSurface, "posteingang"),
    loadMailbox(mailboxSurface, "ausgang"),
  ]);
}

function applyPreferences(
  preferences: UserPreferences | null,
  systemPrefersDark: boolean,
): void {
  const usesDarkMode =
    preferences?.colorScheme === "dark" ||
    (preferences?.colorScheme === "system" && systemPrefersDark);

  document.documentElement.classList.toggle("dark", usesDarkMode);
  document.documentElement.classList.toggle(
    "a11y-high-contrast",
    preferences?.accessibility.highContrast ?? false,
  );
  document.documentElement.classList.toggle(
    "a11y-large-text",
    preferences?.accessibility.largeText ?? false,
  );
  document.documentElement.classList.toggle(
    "a11y-reduced-motion",
    preferences?.accessibility.reducedMotion ?? false,
  );
  document.documentElement.classList.toggle(
    "a11y-reduced-density",
    preferences?.accessibility.reducedDensity ?? false,
  );
}

function useActiveHash(navigation: readonly NavigationItem[]): `#${string}` {
  const fallbackHash = navigation[0]?.href ?? "#overview";
  const allowedHashes = useMemo(
    () => new Set(navigation.map((item) => item.href)),
    [navigation],
  );
  const [activeHash, setActiveHash] = useState<`#${string}`>(() =>
    normalizeHash(fallbackHash, allowedHashes),
  );

  useEffect(() => {
    const syncHash = () =>
      setActiveHash(normalizeHash(fallbackHash, allowedHashes));

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [allowedHashes, fallbackHash]);

  return activeHash;
}

function normalizeHash(
  fallbackHash: `#${string}`,
  allowedHashes: ReadonlySet<`#${string}`>,
): `#${string}` {
  const currentHash = typeof window === "undefined" ? "" : window.location.hash;
  return allowedHashes.has(currentHash as `#${string}`)
    ? (currentHash as `#${string}`)
    : fallbackHash;
}

function useAutoExpandSidebar(enabled: boolean) {
  const [expanded, setExpanded] = useState(false);
  const pointerInsideRef = useRef(false);
  const focusInsideRef = useRef(false);
  const navigationHoldUntilRef = useRef(0);
  const openTimerRef = useRef<number | undefined>(undefined);
  const closeTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      setExpanded(false);
      clearSidebarTimer(openTimerRef);
      clearSidebarTimer(closeTimerRef);
    }
  }, [enabled]);

  useEffect(
    () => () => {
      clearSidebarTimer(openTimerRef);
      clearSidebarTimer(closeTimerRef);
    },
    [],
  );

  function shouldStayOpen(): boolean {
    return (
      pointerInsideRef.current ||
      focusInsideRef.current ||
      Date.now() < navigationHoldUntilRef.current
    );
  }

  function scheduleOpen(): void {
    if (!enabled) {
      return;
    }
    clearSidebarTimer(closeTimerRef);
    clearSidebarTimer(openTimerRef);
    openTimerRef.current = window.setTimeout(() => {
      if (shouldStayOpen()) {
        setExpanded(true);
      }
    }, 300);
  }

  function scheduleClose(delayMs = 300): void {
    if (!enabled) {
      return;
    }
    clearSidebarTimer(openTimerRef);
    clearSidebarTimer(closeTimerRef);
    closeTimerRef.current = window.setTimeout(() => {
      if (!shouldStayOpen()) {
        setExpanded(false);
      }
    }, delayMs);
  }

  return {
    expanded,
    holdOpenAfterNavigation: () => {
      if (!enabled) {
        return;
      }
      navigationHoldUntilRef.current = Date.now() + 500;
      setExpanded(true);
      scheduleClose(550);
    },
    onBlur: () => {
      if (!enabled) {
        return;
      }
      focusInsideRef.current = false;
      scheduleClose();
    },
    onFocus: () => {
      if (!enabled) {
        return;
      }
      focusInsideRef.current = true;
      scheduleOpen();
    },
    onPointerEnter: () => {
      if (!enabled) {
        return;
      }
      pointerInsideRef.current = true;
      scheduleOpen();
    },
    onPointerLeave: () => {
      if (!enabled) {
        return;
      }
      pointerInsideRef.current = false;
      scheduleClose();
    },
  };
}

function clearSidebarTimer(ref: { current: number | undefined }): void {
  if (ref.current !== undefined) {
    window.clearTimeout(ref.current);
    ref.current = undefined;
  }
}

function caseworkerSectionFromHash(hash: `#${string}`): WorkspaceSection {
  switch (hash) {
    case "#assigned":
      return "assigned";
    case "#deadlines":
      return "deadlines";
    case "#decisions":
      return "decisions";
    case "#search":
      return "search";
    default:
      return "inbox";
  }
}

function citizenSectionFromHash(hash: `#${string}`): CitizenSection {
  switch (hash) {
    case "#cases":
      return "cases";
    case "#messages":
      return "messages";
    default:
      return "overview";
  }
}

interface LoginScreenProps {
  config: PublicRuntimeConfig;
  onLogin: (userId: string) => Promise<void>;
  sessionStatus: SessionStatus;
}

function LoginScreen({ config, onLogin, sessionStatus }: LoginScreenProps) {
  const disabled = sessionStatus === "loading";

  return (
    <>
      <ServiceHeader
        appName={config.application.displayName}
        authorityName={config.authority.displayName}
        jurisdictionLabel={config.jurisdiction.legalProfile}
      />

      <main id="main-content" className="login-screen" tabIndex={-1}>
        <section className="login-panel" aria-labelledby="login-title">
          <p className="eyebrow">Anmeldung erforderlich</p>
          <h2 id="login-title">Anmelden</h2>

          <div className="role-choice" aria-label="Rolle auswählen">
            <button
              className="role-card"
              disabled={disabled}
              onClick={() => void onLogin(citizenMockUserId)}
              type="button"
            >
              <User aria-hidden="true" size={24} />
              <span>
                <strong>Als Bürgerin anmelden</strong>
                <span>Eigene Vorgänge, Nachrichten und nächste Schritte.</span>
              </span>
              <LogIn aria-hidden="true" size={20} />
            </button>

            <button
              className="role-card"
              disabled={disabled}
              onClick={() => void onLogin(caseworkerMockUserId)}
              type="button"
            >
              <Briefcase aria-hidden="true" size={24} />
              <span>
                <strong>Als Sachbearbeitung anmelden</strong>
                <span>Eingang, Fristen, Review und Entscheidungsvorlagen.</span>
              </span>
              <LogIn aria-hidden="true" size={20} />
            </button>
          </div>

          {sessionStatus === "error" ? (
            <p className="status-message status-message--error" role="status">
              Anmeldung ist lokal gerade nicht erreichbar.
            </p>
          ) : null}
        </section>
      </main>
    </>
  );
}

interface AuthenticatedShellProps {
  capabilityItems: CapabilityMenuItem[];
  config: PublicRuntimeConfig;
  inboxMessages: MailboxMessage[];
  notifications: MockNotification[];
  onLogout: () => Promise<void>;
  onPreferenceUpdate: (update: UserPreferencesUpdate) => Promise<void>;
  outboxMessages: MailboxMessage[];
  preferences: UserPreferences | null;
  sessionStatus: SessionStatus;
  user: MockUser;
}

function AuthenticatedShell({
  capabilityItems,
  config,
  inboxMessages,
  notifications,
  onLogout,
  onPreferenceUpdate,
  outboxMessages,
  preferences,
  sessionStatus,
  user,
}: AuthenticatedShellProps) {
  const isCaseworker = user.kind === "caseworker";
  const navigation = isCaseworker ? caseworkerNavigation : citizenNavigation;
  const activeHash = useActiveHash(navigation);
  const activeSection = isCaseworker
    ? caseworkerSectionFromHash(activeHash)
    : "inbox";
  const sidebarAutoExpand = preferences?.navigation.sidebarAutoExpand ?? true;
  const [manualSidebarExpanded, setManualSidebarExpanded] = useState(true);
  const autoSidebar = useAutoExpandSidebar(sidebarAutoExpand);
  const sidebarExpanded = sidebarAutoExpand
    ? autoSidebar.expanded
    : manualSidebarExpanded;

  if (isCaseworker) {
    return (
      <>
        <ServiceHeader
          appName="Fachverfahren"
          authorityName={config.authority.displayName}
          jurisdictionLabel={config.jurisdiction.legalProfile}
        >
          <div className="caseworker-mobile-actions">
            <MobileNavigationDrawer
              activeHash={activeHash}
              navigation={caseworkerNavigation}
              title="Arbeitsbereich"
            />
            <UserMenu
              capabilityItems={capabilityItems}
              notifications={notifications}
              onLogout={onLogout}
              onPreferenceUpdate={onPreferenceUpdate}
              preferences={preferences}
              sessionStatus={sessionStatus}
              user={user}
            />
          </div>
        </ServiceHeader>

        <div className="caseworker-shell">
          <div
            className={[
              "caseworker-sidebar-frame",
              sidebarExpanded
                ? "caseworker-sidebar-frame--expanded"
                : "caseworker-sidebar-frame--collapsed",
              sidebarAutoExpand
                ? "caseworker-sidebar-frame--auto"
                : "caseworker-sidebar-frame--static",
            ].join(" ")}
            onBlur={autoSidebar.onBlur}
            onFocus={autoSidebar.onFocus}
            onPointerEnter={autoSidebar.onPointerEnter}
            onPointerLeave={autoSidebar.onPointerLeave}
          >
            <aside className="caseworker-sidebar" aria-label="Fachnavigation">
              {!sidebarAutoExpand ? (
                <button
                  aria-label={
                    manualSidebarExpanded
                      ? "Seitenleiste einklappen"
                      : "Seitenleiste ausklappen"
                  }
                  aria-pressed={!manualSidebarExpanded}
                  className="caseworker-sidebar__toggle"
                  onClick={() =>
                    setManualSidebarExpanded((isExpanded) => !isExpanded)
                  }
                  type="button"
                >
                  {manualSidebarExpanded ? (
                    <ChevronLeft aria-hidden="true" size={18} />
                  ) : (
                    <ChevronRight aria-hidden="true" size={18} />
                  )}
                </button>
              ) : null}

              <nav className="caseworker-sidebar__nav">
                {caseworkerNavigation.map((item) => (
                  <a
                    aria-current={activeHash === item.href ? "page" : undefined}
                    href={item.href}
                    key={item.href}
                    onClick={autoSidebar.holdOpenAfterNavigation}
                    title={sidebarExpanded ? undefined : item.label}
                  >
                    <CaseworkerNavigationIcon href={item.href} />
                    <span className="caseworker-sidebar__label">
                      {item.label}
                    </span>
                    {caseworkerNavigationCount(item.href) ? (
                      <span className="caseworker-sidebar__count">
                        {caseworkerNavigationCount(item.href)}
                      </span>
                    ) : null}
                  </a>
                ))}
              </nav>

              <div className="caseworker-sidebar__footer">
                <UserMenu
                  capabilityItems={capabilityItems}
                  notifications={notifications}
                  onLogout={onLogout}
                  onPreferenceUpdate={onPreferenceUpdate}
                  preferences={preferences}
                  sessionStatus={sessionStatus}
                  user={user}
                />
              </div>
            </aside>
          </div>

          <main
            id="main-content"
            className="workspace-content workspace-content--caseworker"
            tabIndex={-1}
          >
            <EmployeeWorkspace
              activeSection={activeSection}
              authorityName={config.authority.displayName}
              inboxMessages={inboxMessages}
              outboxMessages={outboxMessages}
            />
          </main>
        </div>
      </>
    );
  }

  return (
    <>
      <ServiceHeader
        appName="Bürgerportal"
        authorityName={config.authority.displayName}
        jurisdictionLabel={config.jurisdiction.legalProfile}
      >
        <MobileNavigationDrawer
          activeHash={activeHash}
          navigation={citizenNavigation}
          title="Arbeitsbereich"
        />
        <UserMenu
          capabilityItems={capabilityItems}
          notifications={notifications}
          onLogout={onLogout}
          onPreferenceUpdate={onPreferenceUpdate}
          preferences={preferences}
          sessionStatus={sessionStatus}
          user={user}
        />
      </ServiceHeader>

      <nav className="workspace-nav" aria-label="Arbeitsbereich">
        {navigation.map((item) => (
          <a
            aria-current={activeHash === item.href ? "page" : undefined}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <main id="main-content" className="workspace-content" tabIndex={-1}>
        <CitizenWorkspace
          activeSection={citizenSectionFromHash(activeHash)}
          authorityName={config.authority.displayName}
          inboxMessages={inboxMessages}
          outboxMessages={outboxMessages}
        />
      </main>
    </>
  );
}

interface MobileNavigationDrawerProps {
  activeHash: `#${string}`;
  navigation: readonly NavigationItem[];
  title: string;
}

function MobileNavigationDrawer({
  activeHash,
  navigation,
  title,
}: MobileNavigationDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [activeHash]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return (
    <div className="mobile-nav no-print">
      <button
        aria-expanded={isOpen}
        aria-label="Navigation öffnen"
        className="mobile-nav__trigger"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <Menu aria-hidden="true" size={18} />
      </button>

      {isOpen ? (
        <>
          <button
            aria-label="Navigation schließen"
            className="mobile-nav__backdrop"
            onClick={() => setIsOpen(false)}
            type="button"
          />
          <aside className="mobile-nav__panel" aria-label={title}>
            <header>
              <strong>{title}</strong>
              <button
                aria-label="Navigation schließen"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <nav>
              {navigation.map((item) => (
                <a
                  aria-current={activeHash === item.href ? "page" : undefined}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
        </>
      ) : null}
    </div>
  );
}

function CaseworkerNavigationIcon({ href }: { href: NavigationItem["href"] }) {
  switch (href) {
    case "#inbox":
      return <Inbox aria-hidden="true" size={18} />;
    case "#assigned":
      return <Briefcase aria-hidden="true" size={18} />;
    case "#deadlines":
      return <ClipboardList aria-hidden="true" size={18} />;
    case "#decisions":
      return <ShieldCheck aria-hidden="true" size={18} />;
    case "#search":
      return <Search aria-hidden="true" size={18} />;
    default:
      return <FileText aria-hidden="true" size={18} />;
  }
}

function caseworkerNavigationCount(href: NavigationItem["href"]) {
  switch (href) {
    case "#inbox":
      return caseRows.length;
    case "#assigned":
      return caseRows.filter((row) => row.assignedTo === "Max Beispiel").length;
    case "#deadlines":
      return caseRows.length;
    case "#decisions":
      return caseRows.filter((row) => row.decisionRequired).length;
    case "#search":
      return null;
    default:
      return null;
  }
}

interface UserMenuProps {
  capabilityItems: CapabilityMenuItem[];
  notifications: MockNotification[];
  onLogout: () => Promise<void>;
  onPreferenceUpdate: (update: UserPreferencesUpdate) => Promise<void>;
  preferences: UserPreferences | null;
  sessionStatus: SessionStatus;
  user: MockUser;
}

function UserMenu({
  capabilityItems,
  notifications,
  onLogout,
  onPreferenceUpdate,
  preferences,
  sessionStatus,
  user,
}: UserMenuProps) {
  const roleLabel = user.kind === "caseworker" ? "Sachbearbeitung" : "Bürgerin";
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        menuRef.current?.querySelector("summary")?.focus();
      }
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <details
      className="user-menu"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
      ref={menuRef}
    >
      <summary aria-expanded={isOpen} aria-label="Benutzermenü öffnen">
        <Menu aria-hidden="true" size={18} />
        <span>
          <strong>{user.displayName}</strong>
          <span>{roleLabel}</span>
        </span>
      </summary>

      <div className="user-menu__panel">
        <section aria-labelledby="notification-title">
          <h2 id="notification-title">
            <Bell aria-hidden="true" size={18} />
            Benachrichtigungen
          </h2>
          {notifications.length > 0 ? (
            <ul className="notification-list" aria-live="polite">
              {notifications.map((notification) => (
                <li
                  className={[
                    "notification-list__item",
                    `notification-list__item--${notification.severity}`,
                  ].join(" ")}
                  key={notification.id}
                >
                  <strong>{notification.title}</strong>
                  <span>{notification.body}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Keine neuen Benachrichtigungen.</p>
          )}
        </section>

        <PreferenceControls
          onPreferenceUpdate={onPreferenceUpdate}
          preferences={preferences}
        />

        <details className="system-disclosure">
          <summary>
            <ShieldCheck aria-hidden="true" size={18} />
            Prüfprotokoll
          </summary>
          <div className="system-disclosure__body">
            <h3>Letzte Ereignisse</h3>
            <ol className="audit-list">
              {auditEntries.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ol>

            <h3>Funktionsstatus</h3>
            <EvidenceList items={capabilityItems} />
          </div>
        </details>

        <Button
          disabled={sessionStatus === "loading"}
          onClick={() => {
            setIsOpen(false);
            void onLogout();
          }}
          type="button"
          variant="secondary"
        >
          <LogOut aria-hidden="true" size={18} />
          Abmelden
        </Button>
      </div>
    </details>
  );
}

interface PreferenceControlsProps {
  onPreferenceUpdate: (update: UserPreferencesUpdate) => Promise<void>;
  preferences: UserPreferences | null;
}

function PreferenceControls({
  onPreferenceUpdate,
  preferences,
}: PreferenceControlsProps) {
  const accessibility = preferences?.accessibility;
  const navigation = preferences?.navigation;

  return (
    <section className="preference-panel" aria-labelledby="preferences-title">
      <h2 id="preferences-title">Einstellungen</h2>
      <fieldset>
        <legend>Darstellung</legend>
        <div className="segmented-control">
          {(["light", "dark", "system"] as const).map((colorScheme) => (
            <button
              aria-pressed={preferences?.colorScheme === colorScheme}
              disabled={!preferences}
              key={colorScheme}
              onClick={() => void onPreferenceUpdate({ colorScheme })}
              type="button"
            >
              {colorScheme === "light"
                ? "Hell"
                : colorScheme === "dark"
                  ? "Dunkel"
                  : "System"}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Bedienung</legend>
        <label>
          <input
            checked={accessibility?.highContrast ?? false}
            disabled={!preferences}
            onChange={(event) =>
              void onPreferenceUpdate({
                accessibility: { highContrast: event.currentTarget.checked },
              })
            }
            type="checkbox"
          />
          Mehr Kontrast
        </label>
        <label>
          <input
            checked={accessibility?.largeText ?? false}
            disabled={!preferences}
            onChange={(event) =>
              void onPreferenceUpdate({
                accessibility: { largeText: event.currentTarget.checked },
              })
            }
            type="checkbox"
          />
          Größere Schrift
        </label>
        <label>
          <input
            checked={accessibility?.reducedMotion ?? false}
            disabled={!preferences}
            onChange={(event) =>
              void onPreferenceUpdate({
                accessibility: { reducedMotion: event.currentTarget.checked },
              })
            }
            type="checkbox"
          />
          Weniger Bewegung
        </label>
        <label>
          <input
            checked={accessibility?.reducedDensity ?? false}
            disabled={!preferences}
            onChange={(event) =>
              void onPreferenceUpdate({
                accessibility: { reducedDensity: event.currentTarget.checked },
              })
            }
            type="checkbox"
          />
          Mehr Abstand
        </label>
      </fieldset>

      <fieldset>
        <legend>Navigation</legend>
        <label>
          <input
            checked={navigation?.sidebarAutoExpand ?? true}
            disabled={!preferences}
            onChange={(event) =>
              void onPreferenceUpdate({
                navigation: {
                  sidebarAutoExpand: event.currentTarget.checked,
                },
              })
            }
            type="checkbox"
          />
          Seitenleiste automatisch ausklappen
        </label>
      </fieldset>
    </section>
  );
}

interface WorkspaceMailboxProps {
  authorityName: string;
  inboxMessages: MailboxMessage[];
  outboxMessages: MailboxMessage[];
}

interface CitizenWorkspaceProps extends WorkspaceMailboxProps {
  activeSection: CitizenSection;
}

interface EmployeeWorkspaceProps extends WorkspaceMailboxProps {
  activeSection: WorkspaceSection;
}

const employeeViewMeta: Record<
  WorkspaceSection,
  {
    title: string;
    description: string;
    listTitle: string;
    listDescription: string;
  }
> = {
  inbox: {
    title: "Eingang und Bearbeitung",
    description:
      "Vorgänge nach Zuständigkeit, Frist und Review-Bedarf priorisieren.",
    listTitle: "Vorgangsliste",
    listDescription: "Sortiert nach Frist und Bearbeitungsstand.",
  },
  assigned: {
    title: "Zugewiesene Vorgänge",
    description: "Vorgänge, die aktuell Ihrer Bearbeitung zugeordnet sind.",
    listTitle: "Meine Zuweisungen",
    listDescription: "Alle zugewiesenen Vorgänge mit nächster Frist.",
  },
  deadlines: {
    title: "Fristen",
    description: "Vorgänge nach nächster Frist und Handlungsbedarf.",
    listTitle: "Fristliste",
    listDescription: "Früheste Fristen zuerst.",
  },
  decisions: {
    title: "Entscheidungen",
    description: "Vorgänge mit Review- oder Freigabebedarf.",
    listTitle: "Entscheidungsvorlagen",
    listDescription: "Vorgänge, die eine fachliche Entscheidung benötigen.",
  },
  search: {
    title: "Suche",
    description: "Generische Suchansicht für Vorgänge im Fachverfahren.",
    listTitle: "Suchergebnisse",
    listDescription: "Treffer aus den fachneutralen Mock-Vorgängen.",
  },
};

function CitizenWorkspace({
  activeSection,
  authorityName,
  inboxMessages,
  outboxMessages,
}: CitizenWorkspaceProps) {
  const [selectedCaseId, setSelectedCaseId] = useState(citizenCases[0]!.id);
  const selectedCase =
    citizenCases.find((caseItem) => caseItem.id === selectedCaseId) ??
    citizenCases[0]!;

  function openCase(caseId: string): void {
    setSelectedCaseId(caseId);
    if (activeSection !== "cases") {
      window.location.hash = "#cases";
    }
  }

  if (activeSection === "messages") {
    return (
      <div className="citizen-workspace">
        <CitizenWorkspaceHeader
          authorityName={authorityName}
          description="Posteingang und Ausgang zu Ihren Vorgängen."
          title="Nachrichten"
        />
        <MailboxPanels
          inboxMessages={inboxMessages}
          onOpenCase={openCase}
          outboxMessages={outboxMessages}
        />
      </div>
    );
  }

  if (activeSection === "cases") {
    return (
      <div className="citizen-workspace">
        <CitizenWorkspaceHeader
          authorityName={authorityName}
          description="Ihre gespeicherten Vorgänge und der nächste Schritt."
          title="Meine Vorgänge"
        />
        <CitizenCaseWorkspace
          inboxMessages={inboxMessages}
          onOpenCase={openCase}
          selectedCase={selectedCase}
          selectedCaseId={selectedCase.id}
        />
      </div>
    );
  }

  return (
    <div className="citizen-workspace">
      <section className="workspace-hero workspace-hero--citizen" id="overview">
        <CitizenWorkspaceHeader
          authorityName={authorityName}
          description="Starten Sie einen Vorgang oder arbeiten Sie an einem gespeicherten Entwurf weiter."
          title="Ihre Vorgänge"
        />
        <Button onClick={() => openCase("FV-2026-0022")} type="button">
          <FileText aria-hidden="true" size={18} />
          Neuen Vorgang starten
        </Button>
      </section>

      <section className="citizen-grid" id="cases" aria-label="Meine Vorgänge">
        <article className="task-card task-card--primary">
          <div className="task-card__header">
            <Inbox aria-hidden="true" size={22} />
            <CaseStatus label="Entwurf" tone="warning" />
          </div>
          <h3>Entwurf fortsetzen</h3>
          <p>
            Vorgang FV-2026-0017 wurde gespeichert. Der nächste Schritt ist die
            Prüfung Ihrer Angaben.
          </p>
          <Button
            onClick={() => openCase("FV-2026-0017")}
            type="button"
            variant="secondary"
          >
            Entwurf öffnen
          </Button>
        </article>

        <article className="task-card">
          <CheckCircle aria-hidden="true" size={22} />
          <h3>Status im Blick</h3>
          <p>
            Neue Rückfragen, Entscheidungen und Zahlungsinformationen werden am
            betroffenen Vorgang angezeigt.
          </p>
        </article>

        <article className="task-card" id="messages">
          <Bell aria-hidden="true" size={22} />
          <h3>Nachrichten</h3>
          <p>
            {inboxMessages.length > 0
              ? `${inboxMessages.length} Nachricht im Posteingang.`
              : "Es liegen aktuell keine offenen Rückfragen der Behörde vor."}
          </p>
          <small>{outboxMessages.length} Nachricht im Ausgang.</small>
        </article>
      </section>

      <section className="guided-steps" aria-labelledby="next-steps-title">
        <h2 id="next-steps-title">So geht es weiter</h2>
        <ol>
          {citizenSteps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

interface CitizenWorkspaceHeaderProps {
  authorityName: string;
  description: string;
  title: string;
}

function CitizenWorkspaceHeader({
  authorityName,
  description,
  title,
}: CitizenWorkspaceHeaderProps) {
  return (
    <div>
      <p className="eyebrow">{authorityName}</p>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}

interface CitizenCaseWorkspaceProps {
  inboxMessages: MailboxMessage[];
  onOpenCase: (caseId: string) => void;
  selectedCase: CitizenCaseItem;
  selectedCaseId: string;
}

function CitizenCaseWorkspace({
  inboxMessages,
  onOpenCase,
  selectedCase,
  selectedCaseId,
}: CitizenCaseWorkspaceProps) {
  const relatedMessages = inboxMessages.filter(
    (message) => message.caseId === selectedCase.id,
  );

  return (
    <div className="citizen-case-workspace">
      <section className="citizen-case-list" aria-labelledby="citizen-cases">
        <h3 id="citizen-cases">Vorgänge</h3>
        <div className="citizen-case-buttons">
          {citizenCases.map((caseItem) => (
            <button
              aria-current={selectedCaseId === caseItem.id ? "true" : undefined}
              className="citizen-case-button"
              key={caseItem.id}
              onClick={() => onOpenCase(caseItem.id)}
              type="button"
            >
              <span>
                <strong>{caseItem.id}</strong>
                <span>{caseItem.title}</span>
              </span>
              <CaseStatus label={caseItem.status} tone={caseItem.statusTone} />
            </button>
          ))}
        </div>
      </section>

      <section className="citizen-case-detail" aria-labelledby="case-detail">
        <header className="panel-header">
          <div>
            <h3 id="case-detail">{selectedCase.id}</h3>
            <p>{selectedCase.title}</p>
          </div>
          <CaseStatus
            label={selectedCase.status}
            tone={selectedCase.statusTone}
          />
        </header>

        <dl className="detail-list">
          <div>
            <dt>Nächster Schritt</dt>
            <dd>{selectedCase.nextStep}</dd>
          </div>
          <div>
            <dt>Aktualisiert</dt>
            <dd>
              <time dateTime={selectedCase.updatedAt}>
                {selectedCase.updatedAt}
              </time>
            </dd>
          </div>
          <div>
            <dt>Nachrichten</dt>
            <dd>{relatedMessages.length}</dd>
          </div>
        </dl>

        <section className="guided-steps" aria-labelledby="case-steps-title">
          <h3 id="case-steps-title">Bearbeitungsstand</h3>
          <ol>
            {citizenSteps.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </li>
            ))}
          </ol>
        </section>
      </section>
    </div>
  );
}

interface MailboxPanelsProps {
  inboxMessages: MailboxMessage[];
  onOpenCase: (caseId: string) => void;
  outboxMessages: MailboxMessage[];
}

function MailboxPanels({
  inboxMessages,
  onOpenCase,
  outboxMessages,
}: MailboxPanelsProps) {
  return (
    <div className="mailbox-grid">
      <MailboxPanel
        emptyText="Es liegen keine neuen Nachrichten vor."
        messages={inboxMessages}
        onOpenCase={onOpenCase}
        title="Posteingang"
      />
      <MailboxPanel
        emptyText="Es wurden noch keine Nachrichten gesendet."
        messages={outboxMessages}
        onOpenCase={onOpenCase}
        title="Ausgang"
      />
    </div>
  );
}

interface MailboxPanelProps {
  emptyText: string;
  messages: MailboxMessage[];
  onOpenCase: (caseId: string) => void;
  title: string;
}

function MailboxPanel({
  emptyText,
  messages,
  onOpenCase,
  title,
}: MailboxPanelProps) {
  return (
    <section className="mailbox-panel" aria-labelledby={`${title}-title`}>
      <h3 id={`${title}-title`}>{title}</h3>
      {messages.length > 0 ? (
        <ul className="message-list">
          {messages.map((message) => (
            <li key={message.messageId}>
              {message.caseId ? (
                <button
                  className="message-item"
                  onClick={() => onOpenCase(message.caseId!)}
                  type="button"
                >
                  <MessageContent message={message} />
                </button>
              ) : (
                <article className="message-card">
                  <MessageContent message={message} />
                </article>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{emptyText}</p>
      )}
    </section>
  );
}

function MessageContent({ message }: { message: MailboxMessage }) {
  return (
    <>
      <span className="message-item__header">
        <strong>{message.subject}</strong>
        <time dateTime={message.createdAt}>
          {message.createdAt.slice(0, 10)}
        </time>
      </span>
      <span>{message.bodyPreview}</span>
      {message.caseId ? <small>{message.caseId}</small> : null}
    </>
  );
}

function rowsForSection(
  activeSection: WorkspaceSection,
  rows: {
    assignedRows: readonly CaseRow[];
    deadlineRows: readonly CaseRow[];
    decisionRows: readonly CaseRow[];
  },
): readonly CaseRow[] {
  switch (activeSection) {
    case "assigned":
      return rows.assignedRows;
    case "deadlines":
      return rows.deadlineRows;
    case "decisions":
      return rows.decisionRows;
    case "search":
    case "inbox":
      return caseRows;
  }
}

function EmployeeWorkspace({
  activeSection,
  authorityName,
}: EmployeeWorkspaceProps) {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const assignedRows = caseRows.filter(
    (row) => row.assignedTo === "Max Beispiel",
  );
  const deadlineRows = [...caseRows].sort((left, right) =>
    left.dueAt.localeCompare(right.dueAt),
  );
  const decisionRows = caseRows.filter((row) => row.decisionRequired);
  const visibleRows = rowsForSection(activeSection, {
    assignedRows,
    deadlineRows,
    decisionRows,
  });
  const selectedCase =
    visibleRows.find((row) => row.id === selectedCaseId) ??
    visibleRows[0] ??
    caseRows[0]!;
  const view = employeeViewMeta[activeSection];

  return (
    <div className="employee-workspace" id={activeSection}>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <a href="#inbox">Vorgänge</a>
        <span aria-hidden="true">/</span>
        <span>{view.title}</span>
        <span aria-hidden="true">/</span>
        <span>{selectedCase.id}</span>
      </nav>

      <section
        className="workspace-hero workspace-hero--employee"
        aria-labelledby="employee-title"
      >
        <div>
          <p className="eyebrow">{authorityName}</p>
          <h2 id="employee-title">{view.title}</h2>
          <p>{view.description}</p>
        </div>
        <div className="quick-actions" aria-label="Schnellzugriffe">
          <a className="quick-action-link" href="#search">
            <Search aria-hidden="true" size={18} />
            Suchen
          </a>
          <Button type="button">
            <ClipboardList aria-hidden="true" size={18} />
            Aufgabe anlegen
          </Button>
        </div>
      </section>

      <section className="employee-metrics" aria-label="Arbeitsvorrat">
        <article>
          <span>Offen</span>
          <strong>{caseRows.length}</strong>
        </article>
        <article>
          <span>Zugewiesen</span>
          <strong>{assignedRows.length}</strong>
        </article>
        <article>
          <span>Frist bis 7 Tage</span>
          <strong>{deadlineRows.length}</strong>
        </article>
        <article>
          <span>Entscheidungen</span>
          <strong>{decisionRows.length}</strong>
        </article>
      </section>

      {activeSection === "search" ? (
        <section className="search-panel" aria-labelledby="search-title">
          <h2 id="search-title">Suche</h2>
          <label>
            <span>Suchbegriff</span>
            <input
              defaultValue="FV-2026"
              type="search"
              aria-describedby="search-result-count"
            />
          </label>
          <p id="search-result-count">{visibleRows.length} Treffer</p>
        </section>
      ) : null}

      <div className="employee-layout">
        <section className="case-list-panel" aria-labelledby="case-list-title">
          <header className="panel-header">
            <div>
              <h2 id="case-list-title">{view.listTitle}</h2>
              <p>{view.listDescription}</p>
            </div>
            <div className="filter-pills" aria-label="Filter">
              <a aria-current={activeSection === "inbox"} href="#inbox">
                Alle
              </a>
              <a aria-current={activeSection === "decisions"} href="#decisions">
                Review
              </a>
              <a aria-current={activeSection === "deadlines"} href="#deadlines">
                Frist
              </a>
            </div>
          </header>

          <div className="case-table-frame">
            <CaseTable
              onSelect={setSelectedCaseId}
              rows={visibleRows}
              selectedCaseId={selectedCase.id}
            />
          </div>
        </section>

        <aside className="case-detail-panel" aria-labelledby="detail-title">
          <div className="panel-header">
            <div>
              <h2 id="detail-title">{selectedCase.id}</h2>
              <p>{selectedCase.procedure}</p>
            </div>
            <CaseStatus
              label={selectedCase.status}
              tone={statusToneForCase(selectedCase)}
            />
          </div>

          <dl className="detail-list">
            <div>
              <dt>Antragstellende Person</dt>
              <dd>
                <ApplicantIdentity
                  identifier="person.local-17"
                  name={selectedCase.applicant}
                />
              </dd>
            </div>
            <div>
              <dt>Frist</dt>
              <dd>
                <DeadlineIndicator
                  dueAt={selectedCase.dueAt}
                  label="Bearbeiten bis"
                />
              </dd>
            </div>
            <div>
              <dt>Gebühr</dt>
              <dd>
                <PaymentStatus label="Nicht erforderlich" tone="neutral" />
              </dd>
            </div>
          </dl>

          <section className="decision-panel" aria-labelledby="decision-title">
            <h3 id="decision-title">
              <Users aria-hidden="true" size={18} />
              {selectedCase.decisionRequired
                ? "Vier-Augen-Review"
                : "Bearbeitung"}
            </h3>
            <p>
              {selectedCase.decisionRequired
                ? "Der Vorgang benötigt eine zweite Freigabe vor der Entscheidung."
                : "Der Vorgang ist der zuständigen Einheit zugeordnet."}
            </p>
            <Button type="button">
              {selectedCase.decisionRequired ? "Review starten" : "Öffnen"}
            </Button>
          </section>
        </aside>
      </div>
    </div>
  );
}

interface CaseTableProps {
  onSelect: (caseId: string) => void;
  rows: readonly CaseRow[];
  selectedCaseId: string;
}

const caseTableColumns = ["Vorgang", "Person", "Status", "Frist", "Einheit"];

function CaseTable({ onSelect, rows, selectedCaseId }: CaseTableProps) {
  return (
    <table className="case-table">
      <thead>
        <tr>
          {caseTableColumns.map((column) => (
            <th key={column} scope="col">
              <span className="case-table__heading">
                <span>{column}</span>
                <span className="case-table__tools" aria-hidden="true">
                  <ArrowUpDown size={14} />
                  <Filter size={14} />
                </span>
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            aria-current={row.id === selectedCaseId ? "true" : undefined}
            aria-label={`Vorgang ${row.id} im Detailbereich öffnen`}
            key={row.id}
            onClick={() => onSelect(row.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(row.id);
              }
            }}
            role="link"
            tabIndex={0}
          >
            <th scope="row">
              <span>{row.id}</span>
              <small>{row.procedure}</small>
            </th>
            <td>{row.applicant}</td>
            <td>
              <CaseStatus label={row.status} tone={statusToneForCase(row)} />
            </td>
            <td className="tabular-nums">
              <time dateTime={row.dueAt}>{row.dueAt}</time>
            </td>
            <td>{row.unit}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function statusToneForCase(
  row: CaseRow,
): "neutral" | "success" | "warning" | "critical" {
  if (row.decisionRequired || row.status.includes("Frist")) {
    return "warning";
  }
  if (row.status.includes("Wartet")) {
    return "neutral";
  }
  return "success";
}
