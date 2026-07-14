import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { StatusRegionProvider } from "@senticor/fachverfahren-kit";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App.js";
import { AdminOnboardingCard } from "./AdminOnboardingCard.js";
import {
  RuntimeConfigProvider,
  type BrowserRuntimeConfig,
} from "./runtime-config.js";
import { SessionProvider } from "./session.js";
import type { SessionSnapshot } from "./session-state.js";

const unavailable: SessionSnapshot = {
  status: "unauthenticated",
  principal: null,
  bootstrapped: false,
  apiAvailable: true,
  registration: "disabled",
  capabilities: { userPersonas: true },
  demoMode: false,
};

const admin: SessionSnapshot = {
  status: "authenticated",
  principal: {
    actorId: "admin-story",
    tenantId: "default",
    email: "admin@example.org",
    workspaceRole: "admin",
    permissions: ["boards.collaborate", "users.manage"],
    personas: ["sachbearbeitung"],
    personaManagementMode: "local",
  },
  bootstrapped: true,
  apiAvailable: true,
  registration: "disabled",
  capabilities: { userPersonas: true },
  demoMode: false,
};

const runtimeOff: BrowserRuntimeConfig = {
  demoMode: false,
  serviceWorkerEnabled: false,
};

function AppHarness({
  path,
  session = unavailable,
  runtime = runtimeOff,
  fetchImpl,
}: {
  path: string;
  session?: SessionSnapshot;
  runtime?: BrowserRuntimeConfig;
  fetchImpl?: typeof fetch;
}): React.JSX.Element {
  const originalFetch = React.useRef(globalThis.fetch);
  if (fetchImpl) globalThis.fetch = fetchImpl;
  React.useEffect(
    () => () => {
      globalThis.fetch = originalFetch.current;
    },
    [],
  );

  return (
    <StatusRegionProvider>
      <RuntimeConfigProvider initialConfig={runtime}>
        <SessionProvider
          initialSnapshot={session}
          {...(fetchImpl ? { fetchImpl } : {})}
        >
          <MemoryRouter initialEntries={[path]}>
            <App />
          </MemoryRouter>
        </SessionProvider>
      </RuntimeConfigProvider>
    </StatusRegionProvider>
  );
}

const meta = {
  title: "App/Public Service Experience",
  component: AppHarness,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AppHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BarrierefreiheitVorBootstrap: Story = {
  args: {
    path: "/barrierefreiheit?lang=de#kontakt",
    fetchImpl: fn<typeof fetch>(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    await expect(canvas.getAllByRole("banner")).toHaveLength(1);
    await expect(canvas.getAllByRole("main")).toHaveLength(1);
    await expect(canvas.getAllByRole("contentinfo")).toHaveLength(1);
    await expect(
      canvas.getByRole("heading", { name: "Erklärung zur Barrierefreiheit" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("Vorläufige Mustererklärung").closest('[role="alert"]'),
    ).toHaveTextContent("Vorläufige Mustererklärung");
    await expect(args.fetchImpl).not.toHaveBeenCalled();
  },
};

export const KanonischerTrailingSlash: Story = {
  args: {
    path: "/barrierefreiheit/?lang=de#kontakt",
    fetchImpl: fn<typeof fetch>(),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).findByRole("heading", {
        name: "Erklärung zur Barrierefreiheit",
      }),
    ).resolves.toBeInTheDocument();
  },
};

export const AehnlicherPfadBleibtGegated: Story = {
  args: {
    path: "/barrierefreiheit/intern",
    fetchImpl: fn<typeof fetch>(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Workspace einrichten" }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Erklärung zur Barrierefreiheit" }),
    ).not.toBeInTheDocument();
  },
};

export const RuntimeConfigIstBannerAutoritaet: Story = {
  args: {
    path: "/",
    session: { ...unavailable, bootstrapped: true, demoMode: false },
    runtime: { demoMode: true, serviceWorkerEnabled: false },
    fetchImpl: fn<typeof fetch>(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Demo-Modus").closest('[role="status"]'),
    ).toHaveTextContent("Demo-Modus");
    await expect(
      canvas.getByRole("heading", { name: "Anmelden" }),
    ).toBeInTheDocument();
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function boardsFetch(): ReturnType<typeof fn<typeof fetch>> {
  return fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith("/api/v1/users"))
      return json([{ actorId: "admin-story" }]);
    if (url.endsWith("/api/v1/boards")) return json([]);
    if (url.includes("/api/v1/boards/"))
      return json({ error: "not found" }, 404);
    throw new Error(`Unerwarteter Story-Fetch: ${url}`);
  });
}

export const AdminOnboardingNurAufBoardListe: Story = {
  args: { path: "/boards", session: admin, fetchImpl: boardsFetch() },
  beforeEach: () => {
    window.localStorage.removeItem("fv-admin-onboarding-dismissed:admin-story");
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("heading", {
        name: "Erste Schritte im Workspace",
      }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Ausblenden" }));
    await waitFor(() =>
      expect(canvas.getByRole("region", { name: "Boards" })).toHaveFocus(),
    );
    await expect(
      window.localStorage.getItem("fv-admin-onboarding-dismissed:admin-story"),
    ).toBe("1");
    await expect(args.fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/users"),
      expect.objectContaining({ credentials: "include" }),
    );
  },
};

export const BoardDetailEnumeriertKeineBenutzer: Story = {
  args: {
    path: "/boards/board-story",
    session: {
      ...admin,
      principal: { ...admin.principal!, actorId: "detail-story" },
    },
    fetchImpl: boardsFetch(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvas.queryByText("Erste Schritte im Workspace"),
      ).not.toBeInTheDocument(),
    );
    const fetchMock = args.fetchImpl as ReturnType<typeof boardsFetch>;
    const calls = fetchMock.mock.calls as Array<Parameters<typeof fetch>>;
    expect(
      calls.some((call) => String(call[0]).endsWith("/api/v1/users")),
    ).toBe(false);
  },
};

function OnboardingAuthorizationHarness(): React.JSX.Element {
  const fetchImpl = React.useMemo(() => fn<typeof fetch>(), []);
  return (
    <RuntimeConfigProvider initialConfig={runtimeOff}>
      <SessionProvider
        initialSnapshot={{
          ...admin,
          principal: {
            ...admin.principal!,
            actorId: "citizen-story",
            workspaceRole: "citizen",
            permissions: ["boards.collaborate"],
          },
        }}
      >
        <MemoryRouter initialEntries={["/boards"]}>
          <AdminOnboardingCard fetchImpl={fetchImpl} />
          <p data-testid="request-count">{fetchImpl.mock.calls.length}</p>
        </MemoryRouter>
      </SessionProvider>
    </RuntimeConfigProvider>
  );
}

export const OhneUsersManageKeineEnumeration: Story = {
  args: { path: "/boards" },
  render: () => <OnboardingAuthorizationHarness />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId("request-count"),
    ).toHaveTextContent("0");
  },
};

function OnboardingCardHarness({
  fetchImpl,
  storage,
  actorId = "storage-story",
}: {
  fetchImpl: typeof fetch;
  storage: Pick<Storage, "getItem" | "setItem">;
  actorId?: string;
}): React.JSX.Element {
  const boardsRef = React.useRef<HTMLElement>(null);
  return (
    <StatusRegionProvider>
      <SessionProvider
        initialSnapshot={{
          ...admin,
          principal: { ...admin.principal!, actorId },
        }}
      >
        <MemoryRouter initialEntries={["/boards"]}>
          <main>
            <h1>Boards</h1>
            <AdminOnboardingCard
              fetchImpl={fetchImpl}
              storage={storage}
              onDismissed={() => boardsRef.current?.focus()}
            />
            <section ref={boardsRef} aria-label="Boards" tabIndex={-1}>
              Board-Liste
            </section>
          </main>
        </MemoryRouter>
      </SessionProvider>
    </StatusRegionProvider>
  );
}

const failingStorage = {
  getItem: fn(() => null),
  setItem: fn(() => {
    throw new Error("storage unavailable");
  }),
};

export const StorageFehlerBlendetSofortAus: Story = {
  args: { path: "/" },
  render: () => (
    <OnboardingCardHarness fetchImpl={boardsFetch()} storage={failingStorage} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", {
      name: "Erste Schritte im Workspace",
    });
    await userEvent.click(canvas.getByRole("button", { name: "Ausblenden" }));
    await waitFor(() =>
      expect(
        canvas.queryByRole("heading", {
          name: "Erste Schritte im Workspace",
        }),
      ).not.toBeInTheDocument(),
    );
    await expect(failingStorage.setItem).toHaveBeenCalledWith(
      "fv-admin-onboarding-dismissed:storage-story",
      "1",
    );
    await expect(canvas.getByRole("region", { name: "Boards" })).toHaveFocus();
  },
};

function ActorSwitchHarness(): React.JSX.Element {
  const [actorId, setActorId] = React.useState("actor-a");
  const values = React.useRef(new Map<string, string>());
  const storage = React.useMemo(
    () => ({
      getItem: (key: string) => values.current.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.current.set(key, value);
      },
    }),
    [],
  );
  return (
    <main>
      <h1>Boards</h1>
      <button type="button" onClick={() => setActorId("actor-b")}>
        Zu Actor B wechseln
      </button>
      <SessionProvider
        key={actorId}
        initialSnapshot={{
          ...admin,
          principal: { ...admin.principal!, actorId },
        }}
      >
        <MemoryRouter initialEntries={["/boards"]}>
          <AdminOnboardingCard fetchImpl={boardsFetch()} storage={storage} />
        </MemoryRouter>
      </SessionProvider>
    </main>
  );
}

export const ActorWechselVerwendetEigenenSchluessel: Story = {
  args: { path: "/" },
  render: () => <ActorSwitchHarness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", {
      name: "Erste Schritte im Workspace",
    });
    await userEvent.click(canvas.getByRole("button", { name: "Ausblenden" }));
    await waitFor(() =>
      expect(
        canvas.queryByRole("heading", {
          name: "Erste Schritte im Workspace",
        }),
      ).not.toBeInTheDocument(),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Zu Actor B wechseln" }),
    );
    await expect(
      await canvas.findByRole("heading", {
        name: "Erste Schritte im Workspace",
      }),
    ).toBeVisible();
  },
};
