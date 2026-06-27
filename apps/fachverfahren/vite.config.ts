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

export default defineConfig({
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
  },
});
