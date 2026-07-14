import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { StatusRegionProvider } from "@senticor/fachverfahren-kit";
import { App } from "./App.js";
import { AppErrorBoundary } from "./AppErrorBoundary.js";
import { RuntimeConfigProvider } from "./runtime-config.js";
import { SessionProvider } from "./session.js";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root nicht gefunden");

const routerBase = import.meta.env.BASE_URL.replace(/\/+$/, "") || "/";

createRoot(el).render(
  <StrictMode>
    <AppErrorBoundary>
      <StatusRegionProvider>
        <RuntimeConfigProvider>
          <SessionProvider>
            <BrowserRouter basename={routerBase}>
              <App />
            </BrowserRouter>
          </SessionProvider>
        </RuntimeConfigProvider>
      </StatusRegionProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
