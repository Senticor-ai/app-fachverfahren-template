// session — Client-seitiger Session-Zustand: wer ist angemeldet, ist das Board-Workspace schon
// eingerichtet (bootstrapped)? EIN Hook, den LoginPage und die geschützten Routen gemeinsam nutzen.
import * as React from "react";
import { apiPath } from "./board-client.js";

export interface SessionPrincipal {
  actorId: string;
  email: string;
  displayName?: string;
  /** Workspace-Rolle + Permissions aus dem App-Identity-Modell (GET /auth/session).
   *  UI-Guards prüfen Permissions, nie Rollen-Literale — wie die Server-Routen. */
  role?: "admin" | "member";
  permissions?: string[];
}

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

interface SessionState {
  status: SessionStatus;
  principal: SessionPrincipal | null;
  bootstrapped: boolean;
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
  });

  const refresh = React.useCallback(async () => {
    const statusResponse = await fetch(apiPath("/auth/status"), {
      credentials: "include",
    });
    const { bootstrapped } = (await statusResponse.json()) as {
      bootstrapped: boolean;
    };

    const sessionResponse = await fetch(apiPath("/auth/session"), {
      credentials: "include",
    });
    if (sessionResponse.ok) {
      const principal = (await sessionResponse.json()) as SessionPrincipal;
      setState({ status: "authenticated", principal, bootstrapped });
    } else {
      setState({ status: "unauthenticated", principal: null, bootstrapped });
    }
  }, []);

  const logout = React.useCallback(async () => {
    await fetch(apiPath("/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
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
