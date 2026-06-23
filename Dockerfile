# syntax=docker/dockerfile:1.7

FROM registry.opencode.de/open-code/oci/nodejs:24 AS build
WORKDIR /app

ENV PNPM_HOME="/home/nonroot/.local/bin"
ENV PATH="${PNPM_HOME}:${PATH}"

COPY package.json pnpm-workspace.yaml .npmrc ./
COPY scripts/setup-husky.mjs scripts/setup-husky.mjs
COPY apps/fachverfahren-template/package.json apps/fachverfahren-template/package.json
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
 && pnpm install --frozen-lockfile=false

COPY . .
RUN pnpm run build:app \
 && pnpm run build:server \
 && pnpm --filter @senticor/app-store-postgres build \
 && pnpm prune --prod

FROM registry.opencode.de/open-code/oci/nodejs:24
ENV NODE_ENV=production
ENV PORT=8080
ENV STATIC_DIR=/app/apps/fachverfahren-template/dist

USER root
WORKDIR /app
COPY --from=build --chown=0:0 /app/node_modules ./node_modules
COPY --from=build --chown=0:0 /app/apps/fachverfahren-template/node_modules ./apps/fachverfahren-template/node_modules
COPY --from=build --chown=0:0 /app/apps/fachverfahren-template/dist ./apps/fachverfahren-template/dist
COPY --from=build --chown=0:0 /app/apps/fachverfahren-template/dist-server ./apps/fachverfahren-template/dist-server
COPY --from=build --chown=0:0 /app/apps/fachverfahren-template/package.json ./apps/fachverfahren-template/package.json
COPY --from=build --chown=0:0 /app/packages/app-store-postgres/node_modules ./packages/app-store-postgres/node_modules
COPY --from=build --chown=0:0 /app/packages/app-store-postgres/dist ./packages/app-store-postgres/dist
COPY --from=build --chown=0:0 /app/packages/app-store-postgres/migrations ./packages/app-store-postgres/migrations
COPY --from=build --chown=0:0 /app/packages/app-store-postgres/package.json ./packages/app-store-postgres/package.json
RUN chmod -R g=rX /app
USER 53111

EXPOSE 8080
CMD ["node", "apps/fachverfahren-template/dist-server/index.js"]
