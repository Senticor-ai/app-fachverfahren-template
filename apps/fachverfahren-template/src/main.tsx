import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";
import { enableMocking } from "./mocks/enable-mocking.js";
import { bootKommuneTheme } from "./config/apply-kommune-theme.js";
import "./styles/index.css";

async function bootstrap(): Promise<void> {
  await enableMocking();
  // Kommunales Design (verifiziert, aus dem Fachkonzept via runtime-config) VOR dem Render anwenden — kein Farb-Flash.
  await bootKommuneTheme();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
