// ProzessEditor DOM-Test — rendert den a11y-Editor in jsdom (react-dom/client, ohne @testing-library, wie
// WissensPanel.dom.test) und prueft den Autoren-Fluss: Knoten/Kanten hinzufuegen/entfernen (inkl. Kaskade),
// Live-Validierung. MermaidView ist gemockt (die Mermaid-Laufzeit ist hier nicht Gegenstand).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { StatusMachine } from "../types.js";
import type { ProzessDefinition } from "../lib/process-ir.js";
import { ProzessEditor } from "./ProzessEditor.js";

vi.mock("./MermaidView.js", () => ({ MermaidView: () => null }));

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

function knopf(text: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
}

const sm: StatusMachine = {
  initial: "eingegangen",
  states: [
    { key: "eingegangen", label: "Eingegangen", tone: "neu" },
    { key: "geprueft", label: "Geprüft", tone: "ok", terminal: true },
  ],
  transitions: [
    { from: "eingegangen", to: "geprueft", label: "Prüfen", rollen: ["sb"] },
  ],
};

function def(over: Partial<ProzessDefinition> = {}): ProzessDefinition {
  return { id: "p1", version: 1, knoten: [], kanten: [], ...over };
}

describe("ProzessEditor (DOM, a11y-Autorenpfad)", () => {
  it("fuegt einen Knoten hinzu -> beiAenderung mit +1 Knoten (userTask-Default)", () => {
    const beiAenderung = vi.fn();
    render(
      <ProzessEditor
        wert={def()}
        statusMachine={sm}
        beiAenderung={beiAenderung}
      />,
    );
    act(() => {
      knopf("Knoten hinzufügen")?.click();
    });
    expect(beiAenderung).toHaveBeenCalledTimes(1);
    const next = beiAenderung.mock.calls[0]![0] as ProzessDefinition;
    expect(next.knoten).toHaveLength(1);
    expect(next.knoten[0]!.typ).toBe("userTask");
  });

  it("entfernt einen Knoten samt referenzierender Kanten (kein verwaister Flow)", () => {
    const beiAenderung = vi.fn();
    const d = def({
      knoten: [
        { id: "k1", typ: "start" },
        { id: "k2", typ: "ende" },
      ],
      kanten: [{ id: "e1", von: "k1", nach: "k2" }],
    });
    render(
      <ProzessEditor wert={d} statusMachine={sm} beiAenderung={beiAenderung} />,
    );
    act(() => {
      knopf("Knoten k1 entfernen")?.click();
    });
    const next = beiAenderung.mock.calls[0]![0] as ProzessDefinition;
    expect(next.knoten.map((k) => k.id)).toEqual(["k2"]);
    expect(next.kanten).toHaveLength(0);
  });

  it("rendert eine aria-live-Validierungsregion (fail-closed gegen die StatusMachine)", () => {
    const d = def({ knoten: [{ id: "k1", typ: "start" }], kanten: [] });
    render(
      <ProzessEditor wert={d} statusMachine={sm} beiAenderung={vi.fn()} />,
    );
    const status = container.querySelector('[role="status"]');
    expect(status).toBeTruthy();
    expect(status?.getAttribute("aria-live")).toBe("polite");
    // Ein Start ohne Ausgang/Ende ist ungueltig -> die Region nennt Fehler (nicht "gueltig").
    expect(status?.textContent).toMatch(/Validierungsfehler/);
  });

  it("nurLesen blendet die Edit-Controls aus (kein Hinzufuegen-Button)", () => {
    render(
      <ProzessEditor
        wert={def({ knoten: [{ id: "k1", typ: "start" }] })}
        statusMachine={sm}
        beiAenderung={vi.fn()}
        nurLesen
      />,
    );
    expect(knopf("Knoten hinzufügen")).toBeUndefined();
  });
});
