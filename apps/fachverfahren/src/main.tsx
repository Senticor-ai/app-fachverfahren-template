import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import { AppErrorBoundary } from "./AppErrorBoundary.js";
import { KommuneBranding, RuntimeConfigProvider } from "./runtime-config.js";
import { aktivesPortal } from "./portale.js";
import { portalMarke } from "./verfahren.registry.js";
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
      <BrowserRouter basename={routerBase}>
        {/* RuntimeConfigProvider lädt `/runtime-config.json` EINMAL (application/tenant/branding/delivery + SW);
            KommuneBranding speist deren `branding` (bzw. die Marke des AKTIVEN Portals als Build-Zeit-Fallback) in den
            KommuneThemeProvider → Wappen + Markenfarben. Ohne VITE_PORTAL_ID ist das die Default-`portalMarke`. */}
        <RuntimeConfigProvider>
          <KommuneBranding fallback={aktivesPortal.marke ?? portalMarke}>
            <App />
          </KommuneBranding>
        </RuntimeConfigProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);
