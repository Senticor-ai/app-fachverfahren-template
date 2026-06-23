import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";
import { enableMocking } from "./mocks/enable-mocking.js";
import "./styles/index.css";

async function bootstrap(): Promise<void> {
  await enableMocking();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
