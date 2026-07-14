import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import {
  registerServiceWorker,
  StatusRegionProvider,
} from "@senticor/fachverfahren-kit";
import { App } from "./App.js";
import { AppErrorBoundary } from "./AppErrorBoundary.js";
import { deliveryPath } from "./delivery-path.js";
import { SessionProvider } from "./session.js";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root nicht gefunden");

// ROUTER-BASENAME = Vite-Base (import.meta.env.BASE_URL): die App wird unter einem PRÄFIX ausgeliefert, wenn sie
// hinter dem CHOS-Vorschau-Proxy läuft (--base /flow/preview/<sid>/). Ohne `basename` denkt react-router, sie liegt
// unter "/" → navigate("/aufsicht") verlässt das Präfix → die *-Fallback-Route (→ /buerger) rendert, WÄHREND der
// Persona-Umschalter den Pfad als "aufsicht" liest → Umschalter zeigt Aufsicht, Ansicht zeigt Bürger (Persona-
// Einstiege „nicht verdrahtet"). Mit dem Base bleiben alle Navigationen unter dem Präfix — korrekt hinter Proxy UND
// standalone (dort ist BASE_URL "/"). Trailing-Slash entfernen (react-router-Konvention), leere Base → "/".
const routerBase = import.meta.env.BASE_URL.replace(/\/+$/, "") || "/";

createRoot(el).render(
  <StrictMode>
    <AppErrorBoundary>
      <StatusRegionProvider>
        <SessionProvider>
          <BrowserRouter basename={routerBase}>
            <App />
          </BrowserRouter>
        </SessionProvider>
      </StatusRegionProvider>
    </AppErrorBoundary>
  </StrictMode>,
);

void configureBrowserRuntime();

async function configureBrowserRuntime(): Promise<void> {
  try {
    // BASE_URL-relativ wie alle API-Aufrufe (board-client.ts): hinter dem Vorschau-Proxy
    // liegen runtime-config.json und Service-Worker unter dem Präfix, nicht unter "/".
    const response = await fetch(deliveryPath("runtime-config.json"), {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return;
    const config = (await response.json()) as {
      delivery?: { serviceWorkerEnabled?: boolean };
    };
    if (config.delivery?.serviceWorkerEnabled === true) {
      await registerServiceWorker(deliveryPath("service-worker.js"));
    }
  } catch {
    // Die Runtime-Konfiguration ist eine Verbesserung fuer Deployments; die App muss ohne sie starten.
  }
}
