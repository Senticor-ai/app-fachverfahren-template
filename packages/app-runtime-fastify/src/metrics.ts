// metrics — prozess-lokale Request-Zähler im Prometheus-Textformat für /internal/metrics.
// Bewusst ohne Histogramm-Buckets: Zähler + Summendauer reichen für die Betriebsbaseline.
import type { BuildInfo } from "./config.js";

interface RequestMetric {
  count: number;
  durationSeconds: number;
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
    };
    current.count += 1;
    current.durationSeconds += durationSeconds;
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
      "# HELP http_request_duration_seconds_sum Total HTTP request duration.",
      "# TYPE http_request_duration_seconds_sum counter",
    );
    for (const [key, metric] of [...this.requests.entries()].sort()) {
      const [method, route, status] = key.split("\t");
      lines.push(
        `http_request_duration_seconds_sum{method="${label(
          method,
        )}",route="${label(route)}",status="${label(status)}"} ${
          metric.durationSeconds
        }`,
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
