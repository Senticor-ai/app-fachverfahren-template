# syntax=docker/dockerfile:1.7

FROM registry.opencode.de/open-code/oci/nodejs:24 AS build
USER root
WORKDIR /app

ENV CI=true
ENV PNPM_HOME="/home/nonroot/.local/bin"
ENV PATH="${PNPM_HOME}:${PATH}"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts/setup-husky.mjs scripts/setup-husky.mjs
COPY apps/antragsservice/package.json apps/antragsservice/package.json
COPY packages/fachverfahren-kit/package.json packages/fachverfahren-kit/package.json
COPY packages/platform-contracts/package.json packages/platform-contracts/package.json
COPY packages/public-sector-sdk/package.json packages/public-sector-sdk/package.json
COPY packages/public-sector-ui/package.json packages/public-sector-ui/package.json
COPY packages/provider-local/package.json packages/provider-local/package.json
COPY packages/provider-codesphere/package.json packages/provider-codesphere/package.json
COPY packages/provider-dvc-generic/package.json packages/provider-dvc-generic/package.json
COPY packages/conformance-kit/package.json packages/conformance-kit/package.json
COPY packages/migration-kit/package.json packages/migration-kit/package.json
COPY packages/app-store-postgres/package.json packages/app-store-postgres/package.json
COPY jurisdictions/eu/package.json jurisdictions/eu/package.json
COPY jurisdictions/de/package.json jurisdictions/de/package.json

RUN mkdir -p "${PNPM_HOME}" \
 && corepack enable --install-directory "${PNPM_HOME}" pnpm \
 && corepack prepare "pnpm@11.1.0" --activate \
 && pnpm install --frozen-lockfile

COPY . .
# Die Referenz-App ist ein reines Vite-SPA (KOMPOSITION des Kits): build:packages liefert die
# Workspace-Bausteine, build:app rendert das statische Bundle nach apps/antragsservice/dist.
RUN pnpm run build:packages \
 && pnpm run build:app

FROM registry.opencode.de/open-code/oci/nodejs:24
ENV NODE_ENV=production
ENV PORT=8080
ENV STATIC_DIR=/app/apps/antragsservice/dist

USER root
WORKDIR /app
# Nur das statische Bundle + der abhängigkeitsfreie Static-Server werden ausgeliefert — kein App-Server,
# keine node_modules zur Laufzeit.
COPY --from=build --chown=0:0 /app/apps/antragsservice/dist ./apps/antragsservice/dist
COPY --from=build --chown=0:0 /app/apps/antragsservice/scripts/serve.mts ./apps/antragsservice/scripts/serve.mts
RUN chmod -R g=rX /app
USER 53111

EXPOSE 8080
# TypeScript-Quelle via node type-stripping (Repo-Konvention, vgl. emit:contract) — kein Build-Schritt nötig.
CMD ["node", "--experimental-strip-types", "apps/antragsservice/scripts/serve.mts"]
