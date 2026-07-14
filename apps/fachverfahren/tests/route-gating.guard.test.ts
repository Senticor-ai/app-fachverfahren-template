// route-gating.guard.test.ts — Vertrag des Routen-Baums: die Landing ("/") ist die EINZIGE
// unauthentifizierte Route; ALLE Persona- und Workspace-Routen liegen hinter dem
// Session-Gate (RequireSessionOutlet-Layout-Route). Guard auf Quelltext-Ebene, weil das Repo
// bewusst keine DOM-Render-Testinfrastruktur für die App führt (Komponenten-Verhalten läuft
// über Storybook-/Browser-Tests des Kits).
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const appSource = () =>
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

const GATED_PATHS = [
  'path="/buerger"',
  'path="/buerger/anmelden"',
  'path="/buerger/bestaetigung/:id"',
  'path="/amt"',
  'path="/amt/vorgang/:id"',
  'path="/aufsicht"',
  'path="/boards"',
  'path="/boards/:boardId"',
  'path="/admin/users"',
  'path="/konto/passwort"',
];

describe("App-Routen — Session-Gate", () => {
  it("es gibt genau EINE RequireSessionOutlet-Layout-Route", async () => {
    const source = await appSource();
    const markers = source.match(
      /<Route element=\{<RequireSessionOutlet \/>\}>/g,
    );
    expect(markers).toHaveLength(1);
  });

  it("alle Persona- und Workspace-Routen stehen INNERHALB des Gates", async () => {
    const source = await appSource();
    const gateStart = source.indexOf(
      "<Route element={<RequireSessionOutlet />}>",
    );
    const gateEnd = source.indexOf('path="*"');
    expect(gateStart).toBeGreaterThan(-1);
    expect(gateEnd).toBeGreaterThan(gateStart);
    for (const path of GATED_PATHS) {
      const index = source.indexOf(path);
      expect(index, `${path} fehlt`).toBeGreaterThan(gateStart);
      expect(index, `${path} liegt außerhalb des Gates`).toBeLessThan(gateEnd);
    }
  });

  it('die Landing liegt VOR dem Gate und "/login" bleibt nur ein Alias', async () => {
    const source = await appSource();
    const gateStart = source.indexOf(
      "<Route element={<RequireSessionOutlet />}>",
    );
    expect(source.indexOf('path="/"')).toBeGreaterThan(-1);
    expect(source.indexOf('path="/"')).toBeLessThan(gateStart);
    expect(source.indexOf('path="/login"')).toBeLessThan(gateStart);
  });

  it("der alte unauthentifizierte Default-Redirect nach /buerger ist weg", async () => {
    const source = await appSource();
    expect(source).not.toContain('to="/buerger"');
  });

  // Arbeitsbereichs-Gates: Persona-Routen liegen in drei RequirePersonaExperience-
  // Gruppen (NUR Navigation, keine Autorisierungsgrenze) INNERHALB des Session-Gates;
  // der Boards-Workspace verlangt zusätzlich die Permission boards.collaborate.
  it("drei RequirePersonaExperience-Gruppen existieren innerhalb des Session-Gates", async () => {
    const source = await appSource();
    const gateStart = source.indexOf(
      "<Route element={<RequireSessionOutlet />}>",
    );
    for (const persona of ["buerger", "sachbearbeitung", "aufsicht"]) {
      const marker = `<RequirePersonaExperience persona="${persona}" />`;
      const index = source.indexOf(marker);
      expect(index, `${marker} fehlt`).toBeGreaterThan(gateStart);
    }
  });

  it("/boards* verlangt die Permission boards.collaborate", async () => {
    const source = await appSource();
    expect(source).toContain('permission="boards.collaborate"');
  });
});
