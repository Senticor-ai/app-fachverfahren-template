import { fileURLToPath } from "node:url";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Referenz-App = reine KOMPOSITION des Kits. Tailwind v4 via Plugin (das Kit liefert die Tokens in styles.css,
// das wir in src/styles.css importieren). React + react-dom werden dedupliziert, damit der Kit und die App
// garantiert dieselbe React-Kopie nutzen (eine Live-Instanz, keine doppelten Hooks/Contexts).
const appDir = path.dirname(fileURLToPath(import.meta.url));
const sharedDep = (pkg: string) => path.join(appDir, "node_modules", pkg);

// Wird die App hinter einem einbettenden Preview-Proxy unter /flow/preview/<session>/ gehostet, MUSS vite mit genau diesem
// `base` laufen — sonst serviert der Dev-Server alle Modul-/Dep-/HMR-Pfade ROOT-absolut (/@vite, /src,
// /node_modules/.vite) OHNE Präfix; der Proxy kann nur HTML-Attribute (nicht die JS-import-Strings) umschreiben
// → 404 → WEISSER SCHIRM im Builder. Mit base=<previewPath> präfixiert vite ALLE Pfade → jeder Request trägt
// /flow/preview/<session>/ → der Proxy trifft ihn. Der einbettende Host reicht den Wert über die stabile
// Umgebungsvariable CHOS_FLOW_PREVIEW_BASE durch; lokal/standalone bleibt es "/" (kein Regress).
const previewBase = process.env["CHOS_FLOW_PREVIEW_BASE"] || "/";

export default defineConfig({
  base: previewBase,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      react: sharedDep("react"),
      "react-dom": sharedDep("react-dom"),
      "lucide-react": sharedDep("lucide-react"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: process.env["VITE_DEV_HOST"] ?? "127.0.0.1",
    port: Number(process.env["VITE_DEV_PORT"] ?? 5174),
    // Hinter dem Preview-Proxy ist die App eine Snapshot-Vorschau — der HMR-WebSocket ließe sich durch den
    // GET/HEAD-Proxy ohnehin nicht upgraden (Handshake-Lärm in der Konsole). Standalone bleibt HMR an.
    ...(previewBase !== "/" ? { hmr: false as const } : {}),
  },
});
