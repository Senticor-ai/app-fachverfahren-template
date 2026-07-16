// store.async.test.ts — proves that VorgangPort methods are async (Promise-returning).
// A store created with delayMs:20 means synchronous assumptions fail: the methods return
// Promises, not values. These tests verify the contract established by the async VorgangPort.
import { describe, expect, it } from "vitest";
import { createFachverfahrenStore } from "./store.js";
import type { LeistungConfig } from "./types.js";

// Minimal config sufficient for store operations (no Fachinhalt required).
const minimalConfig: LeistungConfig = {
  id: "test",
  label: "Test",
  kommune: "Test-Stadt",
  rechtsgrundlagen: [],
  antrag: {
    steps: [
      {
        id: "schritt1",
        titel: "Schritt 1",
        felder: [{ name: "name", label: "Name", typ: "text", required: true }],
      },
    ],
  },
  statusMachine: {
    initial: "eingegangen",
    states: [
      { key: "eingegangen", label: "Eingegangen", tone: "neu" },
      {
        key: "abgeschlossen",
        label: "Abgeschlossen",
        tone: "ok",
        terminal: true,
      },
    ],
    transitions: [
      {
        from: "eingegangen",
        to: "abgeschlossen",
        label: "Abschließen",
        rollen: ["sachbearbeitung"],
      },
    ],
  },
  register: { suchfelder: ["name"] },
  detailSektionen: [
    { titel: "Angaben", felder: [{ pfad: "name", label: "Name" }] },
  ],
};

describe("createFachverfahrenStore (async contract)", () => {
  it("list() returns a Promise, not a synchronous array", () => {
    const store = createFachverfahrenStore(minimalConfig, { delayMs: 20 });
    const result = store.list();
    // A sync assumption would read result as an array — this verifies it is a Promise.
    expect(result).toBeInstanceOf(Promise);
  });

  it("get() returns a Promise", () => {
    const store = createFachverfahrenStore(minimalConfig, { delayMs: 20 });
    const result = store.get("nonexistent-id");
    expect(result).toBeInstanceOf(Promise);
  });

  it("einreichen() returns a Promise", () => {
    const store = createFachverfahrenStore(minimalConfig, { delayMs: 20 });
    const result = store.einreichen({ name: "Max Mustermann" });
    expect(result).toBeInstanceOf(Promise);
  });

  it("await list() returns the seeded vorgaenge", async () => {
    const store = createFachverfahrenStore(minimalConfig, { delayMs: 20 });
    const rows = await store.list();
    expect(Array.isArray(rows)).toBe(true);
  });

  it("await einreichen() creates a Vorgang with the correct initial status", async () => {
    const store = createFachverfahrenStore(minimalConfig, { delayMs: 20 });
    const vorgang = await store.einreichen({ name: "Erika Musterfrau" });
    expect(vorgang.status).toBe("eingegangen");
    expect(vorgang.antragsdaten).toMatchObject({ name: "Erika Musterfrau" });
  });

  it("a sync attempt to use the list result as an array fails (proves async boundary)", () => {
    const store = createFachverfahrenStore(minimalConfig, { delayMs: 20 });
    const result = store.list();
    // Sync access: result is a Promise, not an array — length is undefined.
    expect((result as unknown as { length?: number }).length).toBeUndefined();
  });

  it("idempotent einreichen: same key returns same Vorgang", async () => {
    const store = createFachverfahrenStore(minimalConfig, { delayMs: 0 });
    const key = "test-idem-key";
    const v1 = await store.einreichen({ name: "Test" }, undefined, {
      idempotencyKey: key,
    });
    const v2 = await store.einreichen({ name: "Test" }, undefined, {
      idempotencyKey: key,
    });
    expect(v1.id).toBe(v2.id);
  });

  it("await uebergang() returns the updated Vorgang", async () => {
    const store = createFachverfahrenStore(minimalConfig, { delayMs: 20 });
    const vorgang = await store.einreichen({ name: "Test-Person" });
    const updated = await store.uebergang(
      vorgang.id,
      "abgeschlossen",
      "sachbearbeitung",
    );
    expect(updated.status).toBe("abgeschlossen");
    expect(updated.id).toBe(vorgang.id);
  });

  it("await get() returns the Vorgang after einreichen", async () => {
    const store = createFachverfahrenStore(minimalConfig, { delayMs: 20 });
    const vorgang = await store.einreichen({ name: "Lookup-Person" });
    const fetched = await store.get(vorgang.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(vorgang.id);
  });
});
