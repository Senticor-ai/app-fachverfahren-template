// WissensPanel DOM-Test (#20 Phase 3b) — rendert die Komponente in jsdom über `react-dom/client` und prüft den
// Authoring-Fluss (Bearbeiten/Neuanlage → onSpeichern) mit REINEN DOM-Queries. BEWUSST ohne `@testing-library/react`
// (offline nicht im pnpm-Store); jsdom + react-dom reichen. `act()` kommt aus React 19 selbst.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { WissensArtikel } from "../types.js";
import { WissensPanel } from "./WissensPanel.js";

// react-dom braucht dieses Flag, damit `act()` die Updates ohne Warnung synchron flusht.
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;

function render(ui: ReactElement): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(ui);
  });
}

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/** Findet einen Button anhand seines sichtbaren Textes (oder undefined, wenn keiner passt). */
function knopf(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text,
  );
}
function feld(id: string): HTMLInputElement | HTMLTextAreaElement {
  const el = container.querySelector(`#${id}`);
  if (!el) throw new Error(`Feld #${id} fehlt`);
  return el as HTMLInputElement | HTMLTextAreaElement;
}
/** Setzt den Wert eines KONTROLLIERTEN React-Inputs korrekt: nativer Value-Setter + input-Event, damit onChange greift. */
function tippe(el: HTMLInputElement | HTMLTextAreaElement, wert: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) throw new Error("value-Setter fehlt");
  act(() => {
    setter.call(el, wert);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function klick(el: Element): void {
  act(() => {
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
}
function sende(): void {
  const form = container.querySelector("form");
  if (!form) throw new Error("Formular fehlt");
  act(() => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

const ARTIKEL: WissensArtikel[] = [
  {
    id: "handbuch",
    titel: "Handbuch",
    markdown: "alter Inhalt",
    kategorie: "Recht",
    version: 2,
    standIso: "2026-07-01T00:00:00.000Z",
  },
];

describe("WissensPanel — Authoring (#20 Phase 3b, jsdom, dep-frei)", () => {
  it("ohne onSpeichern bleibt es reine Leseansicht (kein Bearbeiten/Neuer Artikel)", () => {
    render(<WissensPanel artikel={ARTIKEL} />);
    expect(knopf("Bearbeiten")).toBeUndefined();
    expect(knopf("Neuer Artikel")).toBeUndefined();
    expect(container.textContent).toContain("Handbuch");
  });

  it("Bearbeiten → Speichern ruft onSpeichern mit expectedVersion = version des Artikels", () => {
    const onSpeichern = vi.fn();
    render(<WissensPanel artikel={ARTIKEL} onSpeichern={onSpeichern} />);
    klick(knopf("Bearbeiten")!);
    // Formular ist mit dem aktiven Artikel vorbefüllt.
    expect((feld("wissen-titel") as HTMLInputElement).value).toBe("Handbuch");
    expect((feld("wissen-markdown") as HTMLTextAreaElement).value).toBe(
      "alter Inhalt",
    );
    tippe(feld("wissen-markdown"), "neuer Inhalt");
    sende();
    expect(onSpeichern).toHaveBeenCalledTimes(1);
    expect(onSpeichern).toHaveBeenCalledWith({
      id: "handbuch",
      titel: "Handbuch",
      markdown: "neuer Inhalt",
      kategorie: "Recht",
      expectedVersion: 2, // die Version des Ausgangsartikels → Optimistic-Lock
    });
  });

  it("Neuer Artikel → abgeleitete Slug-Id (Umlaut transliteriert) + expectedVersion 0", () => {
    const onSpeichern = vi.fn();
    render(<WissensPanel artikel={ARTIKEL} onSpeichern={onSpeichern} />);
    klick(knopf("Neuer Artikel")!);
    tippe(feld("wissen-titel"), "Über Fristen");
    tippe(feld("wissen-markdown"), "# Neu");
    sende();
    expect(onSpeichern).toHaveBeenCalledTimes(1);
    expect(onSpeichern).toHaveBeenCalledWith({
      id: "ueber-fristen", // Ü→ue, kebab-case
      titel: "Über Fristen",
      markdown: "# Neu",
      expectedVersion: 0, // Neuanlage
    });
  });

  it("leerer Titel wird nicht gespeichert (no-op, wie der Server-400)", () => {
    const onSpeichern = vi.fn();
    render(<WissensPanel artikel={ARTIKEL} onSpeichern={onSpeichern} />);
    klick(knopf("Neuer Artikel")!);
    tippe(feld("wissen-markdown"), "ohne Titel");
    sende();
    expect(onSpeichern).not.toHaveBeenCalled();
  });
});
