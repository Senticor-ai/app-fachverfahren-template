// health — Startup-/Readiness-Bausteine: Static-Dir-Lesbarkeit (Liveness bleibt davon
// unberührt) und optionale Upstream-Checks (HEAD, 1500ms-Timeout) für /readyz.
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { RuntimeConfig } from "./config.js";

export async function assertStaticDir(config: RuntimeConfig) {
  await access(path.join(config.staticDir, "index.html"), constants.R_OK);
}

export async function staticDirIsReadable(
  config: RuntimeConfig,
): Promise<boolean> {
  try {
    await assertStaticDir(config);
    return true;
  } catch {
    return false;
  }
}

export async function checkRequiredUpstreams(
  upstreams: URL[],
): Promise<string[]> {
  const failures = [];
  for (const upstream of upstreams) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(upstream, {
        method: "HEAD",
        signal: controller.signal,
      });
      if (!response.ok) {
        failures.push(`${upstream.origin}: ${response.status}`);
      }
    } catch (error) {
      failures.push(`${upstream.origin}: ${String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  return failures;
}
