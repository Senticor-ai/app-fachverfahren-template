import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { KommuneThemeProvider, type KommuneTheme } from "@senticor/fachverfahren-kit";
import { App } from "./App.js";
import { AppErrorBoundary } from "./AppErrorBoundary.js";
import "./styles.css";

// Kommunales Theme (verifiziert, vom governten Build aus dem Fachkonzept ins runtime-config.json geschrieben):
// VOR dem ersten Render laden → KommuneThemeProvider wendet Markenfarben global an (Token-Bridge) und stellt das
// Wappen für die Shell bereit. Best-effort: ohne Theme bleibt das neutrale Default-Kit.
async function loadKommuneTheme(): Promise<KommuneTheme | null> {
  try {
    const r = await fetch("/runtime-config.json", { cache: "no-store", headers: { accept: "application/json" } });
    if (!r.ok) return null;
    const raw = (await r.json()) as { theme?: KommuneTheme };
    return raw.theme ?? null;
  } catch {
    return null;
  }
}

const el = document.getElementById("root");
if (!el) throw new Error("#root nicht gefunden");

void loadKommuneTheme().then((theme) => {
  createRoot(el).render(
    <StrictMode>
      <AppErrorBoundary>
        <BrowserRouter>
          <KommuneThemeProvider theme={theme}>
            <App />
          </KommuneThemeProvider>
        </BrowserRouter>
      </AppErrorBoundary>
    </StrictMode>,
  );
});
