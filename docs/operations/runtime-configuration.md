# Runtime-Konfiguration

`/runtime-config.json` enthält nur öffentliche Informationen:
Anwendungsname, Behörde, Rechtsraum, Tenant-Hinweis, Lokalisierung,
Feature-Hinweise und sichtbare Capability-Beschreibungen.

Geheimnisse, interne Upstreams und Provider-Bindings bleiben serverseitig im
`ServerRuntimeConfig`-Modell aus `@senticor/public-sector-sdk`.

Regeln:

- Konfiguration hat eine Schema-Version.
- Unbekannte oder widersprüchliche Kombinationen müssen beim Start fehlschlagen.
- Logs dürfen Konfigurationswerte nur nach Klassifikation ausgeben.
- Feature Flags sind keine Autorisierung.
- Umgebungsvariablen dürfen Konfiguration befüllen, sind aber nicht der
  öffentliche Vertrag.

Operative Endpunkte:

- `GET /livez`
- `GET /readyz`
- `GET /startupz`
- `GET /runtime-config.json`
- `GET /internal/metrics`
- `GET /internal/build-info`

`/runtime-config.json` ist ein Public-Endpunkt auf `PORT` und wird mit
`Cache-Control: no-store` ausgeliefert. `/internal/metrics` und
`/internal/build-info` laufen auf `INTERNAL_PORT` und dürfen nicht öffentlich
geroutet werden.

## Observability (Issue #54)

Zwei komplementäre, leichtgewichtige Ebenen:

- **Metriken** — `GET /internal/metrics` (Prometheus-Textformat): `http_requests_total`
  (Counter), `http_request_duration_seconds` als **Histogramm** (`_bucket`/`_sum`/`_count`
  → p95/p99 via `histogram_quantile`) und `app_build_info`. Immer an, prozess-lokal.
- **Traces (OpenTelemetry)** — **opt-in**: gesetzt `OTEL_EXPORTER_OTLP_ENDPOINT`, startet die
  Runtime die OTel-NodeSDK und exportiert je Request einen Span (OTLP/HTTP) mit
  `http.request.method`/`http.route`/`http.response.status_code` (ERROR ab 5xx). Optional
  `OTEL_SERVICE_NAME` (Default: `APP_APPLICATION_ID`); Endpoint/Header über die Standard-
  `OTEL_EXPORTER_OTLP_*`-Variablen. OHNE die ENV bleibt `@opentelemetry/api` ein No-op-Tracer
  (nahe-null Overhead) — der Standalone-/OSS-Pfad läuft unverändert. Attribute enthalten
  **keine PII** (nur pseudonyme Kennungen); `http.route` statt roher URL hält die Kardinalität niedrig.

Der Service Worker bleibt per `APP_ENABLE_SERVICE_WORKER=false` deaktiviert,
bis die App den Update-Flow bewusst freischaltet.
