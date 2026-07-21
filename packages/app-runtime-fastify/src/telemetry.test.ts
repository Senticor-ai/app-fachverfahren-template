// telemetry.test — der OTel-Trace-Export ist opt-in (Issue #54): ohne OTEL_EXPORTER_OTLP_ENDPOINT bleibt er
// aus (undefined → No-op), mit Endpoint liefert er einen abschaltbaren Handle. So bleibt der Standalone-Pfad
// garantiert unberührt.
import { describe, expect, it } from "vitest";
import { startTelemetry } from "./telemetry.js";

const buildInfo = {
  version: "1.2.3",
  gitSha: "abc",
  buildTime: "unknown",
  imageDigest: "sha256:x",
};

describe("startTelemetry (opt-in)", () => {
  it("OHNE OTEL_EXPORTER_OTLP_ENDPOINT → undefined (No-op, Standalone unberührt)", () => {
    expect(
      startTelemetry({
        serviceName: "svc",
        buildInfo,
        env: {} as NodeJS.ProcessEnv,
      }),
    ).toBeUndefined();
  });

  it("MIT Endpoint → abschaltbarer Handle (shutdown resolviert)", async () => {
    const handle = startTelemetry({
      serviceName: "svc",
      buildInfo,
      env: {
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
      } as NodeJS.ProcessEnv,
    });
    expect(handle).toBeDefined();
    await expect(handle!.shutdown()).resolves.toBeUndefined();
  });
});
