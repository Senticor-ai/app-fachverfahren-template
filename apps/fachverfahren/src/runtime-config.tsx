import * as React from "react";
import { registerServiceWorker } from "@senticor/fachverfahren-kit";
import { deliveryPath } from "./delivery-path.js";

export interface BrowserRuntimeConfig {
  demoMode: boolean;
  serviceWorkerEnabled: boolean;
}

export interface BrowserRuntimeState extends BrowserRuntimeConfig {
  status: "loading" | "ready";
}

const DEFAULT_CONFIG: BrowserRuntimeConfig = {
  demoMode: false,
  serviceWorkerEnabled: false,
};

export async function loadBrowserRuntimeConfig(
  fetchImpl: typeof fetch = fetch,
): Promise<BrowserRuntimeConfig> {
  try {
    const response = await fetchImpl(deliveryPath("runtime-config.json"), {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return DEFAULT_CONFIG;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return DEFAULT_CONFIG;
    }
    const value = (await response.json()) as {
      delivery?: { serviceWorkerEnabled?: unknown };
      features?: { demoMode?: unknown };
    };
    return {
      demoMode: value.features?.demoMode === true,
      serviceWorkerEnabled: value.delivery?.serviceWorkerEnabled === true,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

const RuntimeConfigContext = React.createContext<BrowserRuntimeState | null>(
  null,
);

export function RuntimeConfigProvider({
  children,
  fetchImpl = fetch,
  initialConfig,
}: {
  children: React.ReactNode;
  fetchImpl?: typeof fetch;
  initialConfig?: BrowserRuntimeConfig;
}): React.ReactElement {
  const [state, setState] = React.useState<BrowserRuntimeState>(() =>
    initialConfig
      ? { status: "ready", ...initialConfig }
      : { status: "loading", ...DEFAULT_CONFIG },
  );

  React.useEffect(() => {
    if (initialConfig) return;
    let active = true;
    void loadBrowserRuntimeConfig(fetchImpl).then(async (config) => {
      if (!active) return;
      setState({ status: "ready", ...config });
      if (config.serviceWorkerEnabled) {
        await registerServiceWorker(deliveryPath("service-worker.js")).catch(
          () => {
            // Runtime readiness and demo visibility do not depend on SW support.
          },
        );
      }
    });
    return () => {
      active = false;
    };
  }, [fetchImpl, initialConfig]);

  return (
    <RuntimeConfigContext.Provider value={state}>
      {children}
    </RuntimeConfigContext.Provider>
  );
}

export function useRuntimeConfig(): BrowserRuntimeState {
  const value = React.useContext(RuntimeConfigContext);
  if (!value) {
    throw new Error(
      "useRuntimeConfig must be used within a RuntimeConfigProvider",
    );
  }
  return value;
}
