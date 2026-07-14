// auth-forms-password-manager.guard.test.ts — Passwort-Manager-Vertrag der Auth-Formulare.
// 1Password & Co. erkennen Felder über `autocomplete`/`name`; ohne diese Tokens bietet der
// Manager weder Ausfüllen noch Speichern an (Regression aus dem ersten Workspace-Setup).
// Guard auf Quelltext-Ebene, weil das Repo bewusst keine DOM-Render-Testinfrastruktur für die
// App führt (Komponenten-Verhalten läuft über Storybook-/Browser-Tests des Kits).
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const authFormsSource = () =>
  readFile(new URL("../src/auth-forms.tsx", import.meta.url), "utf8");

describe("auth-forms — Passwort-Manager-Attribute", () => {
  it("Login: E-Mail als username, Passwort als current-password", async () => {
    const source = await authFormsSource();
    expect(source).toContain('autoComplete="username"');
    expect(source).toContain('autoComplete="current-password"');
  });

  it("Bootstrap: neues Passwort als new-password, Token als one-time-code, Name als name", async () => {
    const source = await authFormsSource();
    expect(source).toContain('autoComplete="new-password"');
    expect(source).toContain('autoComplete="one-time-code"');
    expect(source).toContain('autoComplete="name"');
  });

  it("alle Eingaben tragen ein name-Attribut (Formular-Semantik für Manager)", async () => {
    const source = await authFormsSource();
    for (const field of ["email", "password", "token", "displayName"]) {
      expect(source).toContain(`name="${field}"`);
    }
  });

  it("Registrierung: neues Passwort als new-password, Name als name, E-Mail als username", async () => {
    const source = await authFormsSource();
    const registerStart = source.indexOf("function RegisterForm");
    expect(registerStart, "RegisterForm fehlt").toBeGreaterThan(-1);
    const registerSource = source.slice(registerStart);
    expect(registerSource).toContain('autoComplete="new-password"');
    expect(registerSource).toContain('autoComplete="username"');
    expect(registerSource).toContain('autoComplete="name"');
  });
});
