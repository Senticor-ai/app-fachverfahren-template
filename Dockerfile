# syntax=docker/dockerfile:1.7

FROM registry.opencode.de/open-code/oci/nodejs:24@sha256:4f6d0ed8aeda0c7d83eee77975b9d335524378f577a81722ada78d2ba1d362b6 AS build
USER root
WORKDIR /app

ENV CI=true
ENV PNPM_HOME="/home/nonroot/.local/bin"
ENV PATH="${PNPM_HOME}:${PATH}"

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts/setup-husky.mjs scripts/setup-husky.mjs
COPY apps/fachverfahren/package.json apps/fachverfahren/package.json
COPY packages/fachverfahren-kit/package.json packages/fachverfahren-kit/package.json
COPY packages/platform-contracts/package.json packages/platform-contracts/package.json
COPY packages/public-sector-sdk/package.json packages/public-sector-sdk/package.json
COPY packages/public-sector-ui/package.json packages/public-sector-ui/package.json
COPY packages/provider-local/package.json packages/provider-local/package.json
COPY packages/provider-local-auth/package.json packages/provider-local-auth/package.json
COPY packages/provider-codesphere/package.json packages/provider-codesphere/package.json
COPY packages/provider-dvc-generic/package.json packages/provider-dvc-generic/package.json
COPY packages/conformance-kit/package.json packages/conformance-kit/package.json
COPY packages/migration-kit/package.json packages/migration-kit/package.json
COPY packages/app-store-postgres/package.json packages/app-store-postgres/package.json
COPY packages/app-runtime-fastify/package.json packages/app-runtime-fastify/package.json
COPY packages/app-bff-contracts/package.json packages/app-bff-contracts/package.json
COPY packages/app-bff-fastify/package.json packages/app-bff-fastify/package.json
COPY jurisdictions/eu/package.json jurisdictions/eu/package.json
COPY jurisdictions/de/package.json jurisdictions/de/package.json

RUN mkdir -p "${PNPM_HOME}" \
 && corepack enable --install-directory "${PNPM_HOME}" pnpm \
 && corepack prepare "pnpm@11.1.0" --activate \
 && pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build:packages \
 && pnpm run build:app \
 && pnpm run build:server \
 && pnpm prune --prod

FROM registry.opencode.de/open-code/oci/nodejs:24@sha256:4f6d0ed8aeda0c7d83eee77975b9d335524378f577a81722ada78d2ba1d362b6
ENV NODE_ENV=production
ENV PORT=8080
ENV INTERNAL_PORT=9090
ENV STATIC_DIR=/app/apps/fachverfahren/dist
ENV APP_ENABLE_SERVICE_WORKER=false

USER root
WORKDIR /app
COPY --from=build --chown=0:0 /app/node_modules ./node_modules
COPY --from=build --chown=0:0 /app/apps/fachverfahren/node_modules ./apps/fachverfahren/node_modules
COPY --from=build --chown=0:0 /app/apps/fachverfahren/dist ./apps/fachverfahren/dist
COPY --from=build --chown=0:0 /app/apps/fachverfahren/dist-server ./apps/fachverfahren/dist-server
COPY --from=build --chown=0:0 /app/apps/fachverfahren/package.json ./apps/fachverfahren/package.json
RUN chmod -R g=rX /app
USER 53111

EXPOSE 8080
EXPOSE 9090
CMD ["node", "apps/fachverfahren/dist-server/index.js"]
