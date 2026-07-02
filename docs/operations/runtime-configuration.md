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

Der Service Worker bleibt per `APP_ENABLE_SERVICE_WORKER=false` deaktiviert,
bis die App den Update-Flow bewusst freischaltet.
