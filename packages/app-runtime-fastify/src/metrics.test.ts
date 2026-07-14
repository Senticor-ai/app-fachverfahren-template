import { describe, expect, it } from "vitest";
import { label, RuntimeMetrics } from "./metrics.js";

const buildInfo = {
  version: "1.2.3",
  gitSha: "abc123",
  buildTime: "unknown",
  imageDigest: "sha256:feed",
};

describe("RuntimeMetrics", () => {
  it("rendert Zähler, Dauer-Summen und app_build_info im Prometheus-Textformat", () => {
    const metrics = new RuntimeMetrics();
    metrics.observe({
      method: "GET",
      route: "/assets/*",
      statusCode: 200,
      durationSeconds: 0.25,
    });
    metrics.observe({
      method: "GET",
      route: "/assets/*",
      statusCode: 200,
      durationSeconds: 0.25,
    });
    metrics.observe({
      method: "GET",
      route: "spa",
      statusCode: 200,
      durationSeconds: 0.1,
    });
    const rendered = metrics.render(buildInfo);
    expect(rendered).toContain(
      'http_requests_total{method="GET",route="/assets/*",status="200"} 2',
    );
    expect(rendered).toContain(
      'http_request_duration_seconds_sum{method="GET",route="/assets/*",status="200"} 0.5',
    );
    expect(rendered).toContain(
      'app_build_info{version="1.2.3",git_sha="abc123",image_digest="sha256:feed"} 1',
    );
    expect(rendered.endsWith("\n")).toBe(true);
  });

  it("escapet Backslashes und Anführungszeichen in Labels", () => {
    expect(label('pfad"mit\\zeichen')).toBe('pfad\\"mit\\\\zeichen');
    expect(label(undefined)).toBe("");
  });
});
