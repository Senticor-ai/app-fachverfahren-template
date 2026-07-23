// delivery-path.test.ts — Vertrag der BASE_URL-relativen Auslieferungspfade: hinter dem
// Vorschau-Proxy (--base /flow/preview/<sid>/) müssen runtime-config.json und Service-Worker
// unter dem Präfix geladen werden. Root-absolute Pfade gingen am Präfix vorbei (echter Bug
// in Präfix-Deploys). Quelltext-Guard nach dem Muster von route-gating.guard.test.ts, weil
// das Repo bewusst keine DOM-Render-Testinfrastruktur für die App führt.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { deliveryPath } from "../src/delivery-path.js";

describe("deliveryPath — BASE_URL-relative Auslieferungspfade", () => {
  it("präfixiert unter einer Vorschau-Proxy-Base", () => {
    expect(deliveryPath("runtime-config.json", "/flow/preview/abc/")).toBe(
      "/flow/preview/abc/runtime-config.json",
    );
    expect(deliveryPath("service-worker.js", "/flow/preview/abc/")).toBe(
      "/flow/preview/abc/service-worker.js",
    );
  });

  it("liefert root-absolute Pfade bei Standalone-Base", () => {
    expect(deliveryPath("runtime-config.json", "/")).toBe(
      "/runtime-config.json",
    );
    expect(deliveryPath("runtime-config.json", "")).toBe(
      "/runtime-config.json",
    );
  });

  it("toleriert führende Slashes im Pfad und mehrfache Trailing-Slashes in der Base", () => {
    expect(deliveryPath("/runtime-config.json", "/praefix//")).toBe(
      "/praefix/runtime-config.json",
    );
  });
});

describe("Auslieferungspfade — keine root-absoluten Pfade", () => {
  const read = (rel: string) => readFile(new URL(rel, import.meta.url), "utf8");

  it("runtime-config.json wird im geteilten Lader (runtime-config.ts) über deliveryPath geladen", async () => {
    // Seit dem EINEN memoisierten Lader lebt der Fetch in runtime-config.ts (main.tsx + der Zonen-Filter teilen ihn).
    const source = await read("../src/runtime-config.ts");
    expect(source).not.toContain('fetch("/runtime-config.json"');
    expect(source).toContain('deliveryPath("runtime-config.json")');
  });

  it("main.tsx lädt den Service-Worker über deliveryPath (kein root-absoluter Pfad)", async () => {
    const source = await read("../src/main.tsx");
    expect(source).not.toContain('registerServiceWorker("/service-worker.js")');
    expect(source).toContain('deliveryPath("service-worker.js")');
  });
});
