# Runtime-Konfiguration

`/runtime-config.json` enthaelt nur oeffentliche Informationen:
Anwendungsname, Behoerde, Rechtsraum, Tenant-Hinweis, Lokalisierung,
Feature-Hinweise und sichtbare Capability-Beschreibungen.

Geheimnisse, interne Upstreams und Provider-Bindings bleiben serverseitig im
`ServerRuntimeConfig`-Modell aus `@senticor/public-sector-sdk`.

Regeln:

- Konfiguration hat eine Schema-Version.
- Unbekannte oder widerspruechliche Kombinationen muessen beim Start fehlschlagen.
- Logs duerfen Konfigurationswerte nur nach Klassifikation ausgeben.
- Feature Flags sind keine Autorisierung.
- Umgebungsvariablen duerfen Konfiguration befuellen, sind aber nicht der
  oeffentliche Vertrag.

Operative Endpunkte:

- `GET /livez`
- `GET /readyz`
- `GET /startupz`
- `GET /runtime-config.json`
- `GET /internal/metrics`

`/internal/metrics` darf nicht oeffentlich geroutet werden.
