// dev-proxy.test.ts — der Vite-Dev-Server MUSS die Runtime-Pfade (/auth, /api, …) an den lokalen
// Fastify-Server weiterreichen. Ohne Proxy beantwortet der SPA-Fallback jeden API-Pfad mit
// index.html (HTTP 200, text/html) → „Unexpected token '<' … is not valid JSON" auf /boards.
import { describe, expect, it } from "vitest";

import { devApiProxy } from "../dev-proxy.ts";
import viteConfig from "../vite.config.ts";

describe("devApiProxy", () => {
  it("leitet Auth-, API- und Runtime-Config-Pfade an den Runtime-Server (Port 8080)", () => {
    const proxy = devApiProxy({});
    expect(proxy["/auth"]).toBe("http://127.0.0.1:8080");
    expect(proxy["/api"]).toBe("http://127.0.0.1:8080");
    expect(proxy["/runtime-config.json"]).toBe("http://127.0.0.1:8080");
  });

  it("respektiert VITE_DEV_API_PROXY_TARGET (z. B. anderer Port)", () => {
    const proxy = devApiProxy({
      VITE_DEV_API_PROXY_TARGET: "http://127.0.0.1:9999",
    });
    expect(proxy["/auth"]).toBe("http://127.0.0.1:9999");
    expect(proxy["/api"]).toBe("http://127.0.0.1:9999");
  });
});

describe("vite.config", () => {
  it("verdrahtet den Dev-Proxy im Vite-Dev-Server", () => {
    const server = (viteConfig as { server?: { proxy?: unknown } }).server;
    expect(server?.proxy).toEqual(devApiProxy(process.env));
  });
});
