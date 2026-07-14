// session — Client-seitiger Session-Zustand: wer ist angemeldet, ist das Board-Workspace schon
// eingerichtet (bootstrapped)? EIN Hook, den die Landing und die geschützten Routen gemeinsam nutzen.
// Das eigentliche Laden (inkl. „API nicht erreichbar"-Fällen) lebt testbar in ./session-state.
import * as React from "react";
import { apiPath } from "./board-client.js";
import {
  fetchSessionState,
  type RegistrationMode,
  type SessionCapabilities,
  type SessionPrincipal,
  type SessionSnapshot,
  type SessionStatus,
} from "./session-state.js";

export type {
  SessionCapabilities,
  SessionPrincipal,
  SessionStatus,
} from "./session-state.js";

interface SessionState {
  status: SessionStatus;
  principal: SessionPrincipal | null;
  bootstrapped: boolean;
  /** false = API-Server antwortet nicht mit JSON (down/kein Dev-Proxy) — siehe session-state. */
  apiAvailable: boolean;
  registration: RegistrationMode;
  capabilities: SessionCapabilities;
  demoMode: boolean;
}

interface SessionContextValue extends SessionState {
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
  fetchImpl = fetch,
  initialSnapshot,
}: {
  children: React.ReactNode;
  fetchImpl?: typeof fetch;
  initialSnapshot?: SessionSnapshot;
}): React.ReactElement {
  const [state, setState] = React.useState<SessionState>(
    initialSnapshot ?? {
      status: "loading",
      principal: null,
      bootstrapped: false,
      apiAvailable: true,
      registration: "disabled",
      capabilities: {},
      demoMode: false,
    },
  );

  const refresh = React.useCallback(async () => {
    setState(await fetchSessionState(fetchImpl));
  }, [fetchImpl]);

  const logout = React.useCallback(async () => {
    try {
      await fetchImpl(apiPath("/auth/logout"), {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // API weg (Netzfehler): refresh() unten stellt den Zustand ehrlich dar.
    }
    await refresh();
  }, [fetchImpl, refresh]);

  React.useEffect(() => {
    if (initialSnapshot) return;
    void refresh();
  }, [initialSnapshot, refresh]);

  const value = React.useMemo<SessionContextValue>(
    () => ({ ...state, refresh, logout }),
    [state, refresh, logout],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
