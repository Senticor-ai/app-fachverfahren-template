// telemetry — optionaler OpenTelemetry-Trace-Export (Issue #54). OFF BY DEFAULT: die NodeSDK startet NUR,
// wenn `OTEL_EXPORTER_OTLP_ENDPOINT` gesetzt ist. Ohne die ENV bleibt `@opentelemetry/api` ein No-op-Tracer
// (nahe-null Overhead), und der OSS-/Standalone-Pfad läuft unverändert. Die Traces (verteilte Request-Spans,
// s. hooks.ts) ergänzen das Prometheus-Latenz-Histogramm (metrics.ts) — beide leichtgewichtig + opt-in.
//
// Bewusst MANUELLE Instrumentierung (ein Span je Request in hooks.ts) statt schwerer Auto-Instrumentierungs-
// Pakete: kleinere Abhängigkeit, keine Monkey-Patches, und der Span-Vertrag bleibt in unserem Code sichtbar.
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import type { BuildInfo } from "./config.js";
import { logInfo } from "./logging.js";

export interface TelemetryHandle {
  shutdown(): Promise<void>;
}

/** Startet den OTel-Trace-Export, WENN `OTEL_EXPORTER_OTLP_ENDPOINT` gesetzt ist; sonst `undefined` (No-op).
 *  `service.name` = `OTEL_SERVICE_NAME` oder der übergebene Fallback; `service.version` aus dem BuildInfo.
 *  Der `OTLPTraceExporter` liest Endpoint/Header selbst aus den Standard-`OTEL_EXPORTER_OTLP_*`-Variablen. */
export function startTelemetry(input: {
  serviceName: string;
  buildInfo: BuildInfo;
  env?: NodeJS.ProcessEnv;
}): TelemetryHandle | undefined {
  const env = input.env ?? process.env;
  const endpoint = env["OTEL_EXPORTER_OTLP_ENDPOINT"]?.trim();
  if (!endpoint) return undefined;
  const serviceName = env["OTEL_SERVICE_NAME"]?.trim() || input.serviceName;
  const sdk = new NodeSDK({
    resource: new Resource({
      "service.name": serviceName,
      "service.version": input.buildInfo.version,
    }),
    traceExporter: new OTLPTraceExporter(),
  });
  sdk.start();
  logInfo("runtime.telemetry.started", { serviceName, endpoint });
  return {
    shutdown: async () => {
      await sdk.shutdown();
    },
  };
}
