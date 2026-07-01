import { fileURLToPath } from "node:url";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const devHost = process.env["VITE_DEV_HOST"] ?? "127.0.0.1";
const devPort = Number(process.env["VITE_DEV_PORT"] ?? 5173);
const apiProxyTarget = process.env["VITE_API_PROXY_TARGET"];

// Die Fachverfahren-Module liegen unter `../../modules/<domain>/` — AUSSERHALB dieses App-Pakets. Die App mountet
// ihre `ui/screens.tsx` generisch (ModuleHost.tsx, import.meta.glob). Da die Modul-Dateien physisch außerhalb des
// App-node_modules liegen, lösen ihre bare-Imports (react, @senticor/*) sonst nicht auf bzw. ziehen ein zweites
// React. Darum die geteilten Singletons explizit auf die EINE Kopie im App-node_modules aliasen.
// Mount-Vertrag: Domain-Module komponieren primaer @senticor/fachverfahren-kit.
const appDir = path.dirname(fileURLToPath(import.meta.url));
const sharedDep = (pkg: string) => path.join(appDir, "node_modules", pkg);
const moduleSharedAlias = {
  react: sharedDep("react"),
  "react-dom": sharedDep("react-dom"),
  "@senticor/fachverfahren-kit": sharedDep("@senticor/fachverfahren-kit"),
  "@senticor/public-sector-ui": sharedDep("@senticor/public-sector-ui"),
  "@senticor/public-sector-sdk": sharedDep("@senticor/public-sector-sdk"),
  "lucide-react": sharedDep("lucide-react"),
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: moduleSharedAlias,
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: devHost,
    port: devPort,
    ...(apiProxyTarget
      ? {
          proxy: {
            "/api": apiProxyTarget,
            "/runtime-config.json": apiProxyTarget,
          },
        }
      : {}),
  },
});
