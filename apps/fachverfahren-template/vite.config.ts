import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

// ROBUSTE MODUL-AUFLÖSUNG (generisch, kein Overfit): vite/esbuild LEHNEN eine explizite `.ts`/`.tsx`-Endung im
// Import-Specifier ab ("Failed to resolve import ../x.ts") — der generierte `modules/<domain>/ui/screens.tsx`
// importiert seine co-located Config aber je nach Generierung mit `.ts`, `.js` (NodeNext) ODER endungslos. Dieser
// Resolver macht relative Imports auf JEDE dieser Formen robust auflösbar → die App rendert unabhängig von der
// geschriebenen Endung. Reine Datei-Auflösung (existiert die Datei?), keine Verfahrens-/Domänen-Annahme.
const resolveModuleExtensions: Plugin = {
  name: "chos-resolve-module-extensions",
  enforce: "pre",
  resolveId(source, importer) {
    if (!importer || !(source.startsWith("./") || source.startsWith("../")))
      return null;
    const base = path.resolve(
      path.dirname(importer.split("?")[0] ?? importer),
      source,
    );
    const bareBase = base.replace(/\.(ts|tsx|js|jsx|mjs)$/, "");
    for (const cand of [
      base,
      `${bareBase}.ts`,
      `${bareBase}.tsx`,
      `${bareBase}.js`,
      `${bareBase}.jsx`,
      `${bareBase}.mjs`,
    ]) {
      try {
        if (fs.statSync(cand).isFile()) return cand;
      } catch {
        /* nächster Kandidat */
      }
    }
    return null;
  },
};

const devHost = process.env["VITE_DEV_HOST"] ?? "127.0.0.1";
const devPort = Number(process.env["VITE_DEV_PORT"] ?? 5173);
const apiProxyTarget = process.env["VITE_API_PROXY_TARGET"];

const appDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appDir, "..", "..");
const sharedDep = (pkg: string) => path.join(appDir, "node_modules", pkg);

// EINE React-Instanz für die AUSSERHALB des App-Pakets liegenden Domain-Module (`../../modules/<domain>/`) UND die
// geteilten @senticor-Workspace-Pakete (Kit/UI/SDK). Ohne diese drei zusammenwirkenden Maßnahmen bleibt der Screen
// WEISS. WICHTIG — was NICHT tun: react/react-dom NICHT auf einen absoluten Pfad aliasen. Ein solcher Alias umginge
// vites Dep-Optimizer → react wird roh serviert, seine JSX-Runtime aber optimiert → ZWEI Instanzen → „Invalid hook
// call · Cannot read properties of null (reading 'useState')". react bleibt allein bei dedupe + optimizeDeps.
// Die @senticor-Pakete werden HINGEGEN aliased — nicht um react zu lenken, sondern damit die out-of-root Domain-Module
// sie beim Dep-Scan überhaupt auflösen (sonst „could not be resolved" → Pre-Bundling übersprungen → 1. Ladeflacker).
// EXAKT-Regex (nur der BARE-Specifier): ein String-Alias würde auch Subpfade wie `@senticor/fachverfahren-kit/styles.css`
// auf einen rohen Verzeichnispfad umschreiben und dabei die `exports`-Map des Pakets umgehen → im Prod-Build
// „ENOENT: styles.css". Mit `/^…$/` bleiben Subpfade (CSS, Tailwind-Quellen) bei der normalen Auflösung; nur die
// bare-Imports der out-of-root Domain-Module werden auf die EINE App-Kopie gelenkt.
const moduleSharedAlias = [
  {
    find: /^@senticor\/fachverfahren-kit$/,
    replacement: sharedDep("@senticor/fachverfahren-kit"),
  },
  {
    find: /^@senticor\/public-sector-ui$/,
    replacement: sharedDep("@senticor/public-sector-ui"),
  },
  {
    find: /^@senticor\/public-sector-sdk$/,
    replacement: sharedDep("@senticor/public-sector-sdk"),
  },
];

export default defineConfig({
  plugins: [resolveModuleExtensions, react(), tailwindcss()],
  resolve: {
    alias: moduleSharedAlias,
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // (1) entries: die Domain-Module (`../../modules/<domain>/ui/screens.tsx`) werden per import.meta.glob DYNAMISCH
    // gemountet → vites Pre-Bundle-Scan sieht sie sonst NICHT → ihr direktes react/jsx-runtime bliebe un-optimiert
    // (rohe 2. Instanz). Als Scan-Entry deklariert ziehen ihre react-Imports in DIESELBE optimierte Kopie wie die App.
    entries: [
      "index.html",
      path.resolve(workspaceRoot, "modules", "*", "ui", "screens.tsx"),
    ],
    // (2) include: react + JSX-/Client-Subpfade werden EINMAL als ESM gebündelt (CJS→ESM-Interop → benannter `jsx`-
    // Export existiert; ohne das: „does not provide an export named 'jsx'"). Die @senticor-Workspace-Pakete werden als
    // QUELLE (packages/*/src) served → ihr PEER-react löst sonst zu einer ZWEITEN un-optimierten Instanz auf. Sie zu
    // includen erzwingt Vor-Bündelung → ihr peer-react kollabiert in die EINE optimierte react-Kopie. Generisch.
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@senticor/fachverfahren-kit",
      "@senticor/public-sector-ui",
      "@senticor/public-sector-sdk",
    ],
  },
  server: {
    host: devHost,
    port: devPort,
    // fs.allow öffnet den Workspace-Baum, damit die out-of-root-Module (`../../modules/<domain>`) served werden.
    fs: { allow: [workspaceRoot] },
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
