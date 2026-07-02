import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerServiceWorker } from "@senticor/fachverfahren-kit";
import { App } from "./App.js";
import { AppErrorBoundary } from "./AppErrorBoundary.js";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root nicht gefunden");

createRoot(el).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);

void configureBrowserRuntime();

async function configureBrowserRuntime(): Promise<void> {
  try {
    const response = await fetch("/runtime-config.json", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return;
    const config = (await response.json()) as {
      delivery?: { serviceWorkerEnabled?: boolean };
    };
    if (config.delivery?.serviceWorkerEnabled === true) {
      await registerServiceWorker("/service-worker.js");
    }
  } catch {
    // Die Runtime-Konfiguration ist eine Verbesserung fuer Deployments; die App muss ohne sie starten.
  }
}
