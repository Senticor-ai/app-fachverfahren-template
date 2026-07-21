// metrics — prozess-lokale Request-Metriken im Prometheus-Textformat für /internal/metrics: Zähler +
// Latenz-HISTOGRAMM (Buckets + Summe + Count) → p95/p99 via histogram_quantile (Issue #54). Ergänzt die
// OpenTelemetry-Traces (telemetry.ts) um die aggregierte Betriebs-Sicht; beide sind opt-in/leichtgewichtig.
import type { BuildInfo } from "./config.js";

/** Prometheus-Standard-Latenz-Buckets (Sekunden), kumulativ gerendert. */
const DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
] as const;

interface RequestMetric {
  count: number;
  durationSeconds: number;
  /** Kumulierbare Bucket-Treffer, index-gleich zu DURATION_BUCKETS (Beobachtung zählt in jeden Bucket mit le ≥ Dauer). */
  bucketCounts: number[];
}

export class RuntimeMetrics {
  private readonly requests = new Map<string, RequestMetric>();

  observe({
    method,
    route,
    statusCode,
    durationSeconds,
  }: {
    method: string;
    route: string;
    statusCode: number;
    durationSeconds: number;
  }) {
    const key = `${method}\t${route}\t${statusCode}`;
    const current = this.requests.get(key) ?? {
      count: 0,
      durationSeconds: 0,
      bucketCounts: new Array<number>(DURATION_BUCKETS.length).fill(0),
    };
    current.count += 1;
    current.durationSeconds += durationSeconds;
    for (let i = 0; i < DURATION_BUCKETS.length; i += 1) {
      if (durationSeconds <= DURATION_BUCKETS[i]!)
        current.bucketCounts[i]! += 1;
    }
    this.requests.set(key, current);
  }

  render(buildInfo: BuildInfo): string {
    const lines = [
      "# HELP http_requests_total HTTP requests processed by the app runtime.",
      "# TYPE http_requests_total counter",
    ];
    for (const [key, metric] of [...this.requests.entries()].sort()) {
      const [method, route, status] = key.split("\t");
      lines.push(
        `http_requests_total{method="${label(method)}",route="${label(
          route,
        )}",status="${label(status)}"} ${metric.count}`,
      );
    }
    lines.push(
      "# HELP http_request_duration_seconds HTTP request duration (histogram).",
      "# TYPE http_request_duration_seconds histogram",
    );
    for (const [key, metric] of [...this.requests.entries()].sort()) {
      const [method, route, status] = key.split("\t");
      const tags = `method="${label(method)}",route="${label(
        route,
      )}",status="${label(status)}"`;
      DURATION_BUCKETS.forEach((le, i) => {
        lines.push(
          `http_request_duration_seconds_bucket{${tags},le="${le}"} ${metric.bucketCounts[i]}`,
        );
      });
      // +Inf-Bucket = Gesamtzahl (jede Beobachtung liegt unter +Inf).
      lines.push(
        `http_request_duration_seconds_bucket{${tags},le="+Inf"} ${metric.count}`,
        `http_request_duration_seconds_sum{${tags}} ${metric.durationSeconds}`,
        `http_request_duration_seconds_count{${tags}} ${metric.count}`,
      );
    }
    lines.push(
      "# HELP app_build_info Build metadata for the deployed app image.",
      "# TYPE app_build_info gauge",
      `app_build_info{version="${label(buildInfo.version)}",git_sha="${label(
        buildInfo.gitSha,
      )}",image_digest="${label(buildInfo.imageDigest)}"} 1`,
      "",
    );
    return lines.join("\n");
  }
}

export function label(value: string | undefined): string {
  return (value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
