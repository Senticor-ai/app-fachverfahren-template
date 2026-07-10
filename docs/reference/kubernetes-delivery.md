# Kubernetes-Delivery-Vertrag

Die kanonische Deploy-Form generierter Apps ist ein Helm-Chart unter
`apps/<domain>/deploy/helm/<domain>`.

## Runtime-Schnittstellen

- Public Port: `PORT`, Default `8080`
- Internal Port: `INTERNAL_PORT`, Default `9090`
- Public Endpunkte: `/`, SPA-Routen, `/runtime-config.json`, `/livez`,
  `/readyz`, `/startupz`
- Interne Endpunkte: `/internal/metrics`, `/internal/build-info`

`/internal/*` darf nie über den public Ingress geroutet werden. Der Chart
rendert deshalb einen separaten internen Service.

## Probes

- `/startupz`: Server gebootet, Konfiguration geparst, statisches Bundle
  lesbar.
- `/livez`: Event Loop und Prozess reagieren; keine Dependency-Prüfung.
- `/readyz`: false während Shutdown; prüft nur deklarierte erforderliche
  Upstreams.

Die Runtime behandelt `SIGTERM` als Shutdown-Signal, setzt Readiness auf false,
stoppt neue Requests und wartet innerhalb `APP_SHUTDOWN_TIMEOUT_MS` auf
laufende Requests.

## Pod- und Container-Härtung

Der Chart setzt:

- `runAsNonRoot`
- `readOnlyRootFilesystem`
- `allowPrivilegeEscalation: false`
- `capabilities.drop: [ALL]`
- `seccompProfile: RuntimeDefault`
- `automountServiceAccountToken: false`
- writable `emptyDir` nur für `/tmp`

Secrets werden nur referenziert. Nicht geheime Runtime-Werte liegen in einer
ConfigMap.

## Verfügbarkeit und Rollout

- Default `replicaCount: 2`
- Rolling Update mit `maxUnavailable: 0`, `maxSurge: 1`
- PodDisruptionBudget
- HorizontalPodAutoscaler
- Topology Spread und Anti-Affinity
- Ressourcen-Requests und Limits

Nach Rollout gehören Smoke-Tests gegen `/readyz`, `/runtime-config.json` und
eine echte SPA-Route zum Betriebsablauf. Rollback-Kriterium ist jedes
fehlschlagende Health-, Header- oder Login-Smoke-Ergebnis.

## CI-Gates

`pnpm run check:k8s-delivery` rendert den Helm-Chart, prüft Pflichtobjekte und
läuft gegen `kubeconform` und `conftest`. `pnpm run test:supply-chain`
erzeugt ein SBOM mit Syft und blockiert High/Critical-Funde mit Trivy.

Cosign-Signaturen sind als Release-Schritt vorgesehen, aber nicht Teil des
ersten Pflicht-Gates, solange Registry/OIDC-Bindings nicht überall verfügbar
sind.
