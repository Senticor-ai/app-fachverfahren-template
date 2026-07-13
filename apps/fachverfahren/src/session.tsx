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
}

interface SessionContextValue extends SessionState {
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [state, setState] = React.useState<SessionState>({
    status: "loading",
    principal: null,
    bootstrapped: false,
    apiAvailable: true,
    registration: "disabled",
    capabilities: {},
  });

  const refresh = React.useCallback(async () => {
    setState(await fetchSessionState());
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await fetch(apiPath("/auth/logout"), {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // API weg (Netzfehler): refresh() unten stellt den Zustand ehrlich dar.
    }
    await refresh();
  }, [refresh]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

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
