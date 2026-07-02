# CI-Image-Builds

Dieses Repository liefert `.gitlab-ci.yml` als GitLab-/opencode.de-Referenz für
Validierung und Container-Image-Builds.

## Runner-Vertrag

opencode.de-Runner sind unprivilegierte Kubernetes-Pods. Sie haben keinen
Docker-Socket und dürfen keine privilegierten Sidecars starten. `docker:dind`
und `docker build` sind deshalb kein belastbarer Standard.

Container-Images werden mit Kaniko gebaut. Die Vorlage nutzt:

```yaml
.kaniko-base:
  image:
    name: gcr.io/kaniko-project/executor:debug
    entrypoint: [""]
  before_script:
    - mkdir -p /kaniko/.docker
    - 'echo "{\"auths\":{\"${CI_REGISTRY}\":{\"auth\":\"$(printf "%s:%s" "${CI_REGISTRY_USER}" "${CI_REGISTRY_PASSWORD}" | base64 | tr -d "\n")\"}}}" > /kaniko/.docker/config.json'
```

Der Image-Job ruft anschließend `/kaniko/executor` mit Repository-Kontext,
Dockerfile, Ziel-Tag und Registry-Cache auf.

## Dockerfile-Vertrag

Das opencode.de-Node-Image startet in der Build-Stage nicht zwingend als Root.
Der Template-Dockerfile setzt deshalb explizit:

```dockerfile
USER root
ENV CI=true
```

`USER root` verhindert Rechtefehler beim Anlegen von `node_modules`.
`ENV CI=true` sorgt dafür, dass nichtinteraktive pnpm-Schritte wie
`pnpm prune --prod` in Kaniko stabil laufen.

Basis-Images werden mit Digest gepinnt. Der Runtime-Container laeuft als
nicht-root Benutzer und erwartet ein read-only Root-Filesystem; Kubernetes
stellt nur `/tmp` als beschreibbares `emptyDir` bereit.

Die Build-Reihenfolge ist verbindlich:

```bash
pnpm run build:packages
pnpm run build:app
pnpm run build:server
```

So existieren die `dist/`-Artefakte und TypeScript-Deklarationen der
Workspace-Pakete, bevor App und Fastify-Runtime kompiliert werden.

## Delivery-Gates

Die CI validiert zusaetzlich:

```bash
pnpm run check:web-delivery
pnpm run test:k8s:render
pnpm run check:k8s-delivery
pnpm run test:supply-chain
```

`check:web-delivery` prueft Cache- und Security-Header-Vertrag,
Service-Worker-Opt-in und Standards-Assets. `check:k8s-delivery` rendert den
Helm-Chart und prueft ihn mit `kubeconform` und `conftest`. `test:supply-chain`
erzeugt ein Syft-SBOM und blockiert High/Critical-Funde mit Trivy.

## pnpm-Filter

Filter stehen bei pnpm vor `run`. Diese Form ist korrekt:

```bash
pnpm --filter "./packages/**" run --if-present build
```

Diese Form ist nicht zulässig, weil Flags an das unterliegende Script
weitergereicht werden können:

```bash
pnpm -r build --if-present --filter "./packages/**"
```

## Lokale Datenbank

Lokale PostgreSQL-Entwicklung nutzt `dev/postgres.yaml` statt Docker Compose.
Das Manifest läuft mit Rancher Desktop auf containerd/k3s und mit Docker
Desktop, wenn Kubernetes aktiviert ist. Details und die (PLAN-)Komfort-Scripts
stehen in `docs/reference/db-migrations.md`.
