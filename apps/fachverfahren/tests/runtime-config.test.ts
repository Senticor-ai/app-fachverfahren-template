import { describe, expect, it, vi } from "vitest";

import { loadBrowserRuntimeConfig } from "../src/runtime-config.js";

function response(body: unknown, init?: ResponseInit): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("loadBrowserRuntimeConfig", () => {
  it("reads demo mode and service-worker activation from one response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        features: { demoMode: true },
        delivery: { serviceWorkerEnabled: true },
      }),
    );

    await expect(loadBrowserRuntimeConfig(fetchImpl)).resolves.toEqual({
      demoMode: true,
      serviceWorkerEnabled: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing", {}],
    ["malformed", { features: { demoMode: "true" } }],
    ["non-json", "<!doctype html>"],
  ])("defaults %s values to a ready false state", async (_label, body) => {
    const result = await loadBrowserRuntimeConfig(
      vi.fn<typeof fetch>().mockResolvedValue(response(body)),
    );
    expect(result).toEqual({
      demoMode: false,
      serviceWorkerEnabled: false,
    });
  });

  it("defaults an unavailable endpoint to a ready false state", async () => {
    await expect(
      loadBrowserRuntimeConfig(
        vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
      ),
    ).resolves.toEqual({ demoMode: false, serviceWorkerEnabled: false });
  });
});
