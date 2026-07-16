#!/usr/bin/env sh
set -eu

if [ -z "${TMPDIR:-}" ]; then
  sibling="$(pwd)/../.tmp-senticor-app-fachverfahren-template"
  if mkdir -p "$sibling" 2>/dev/null; then
    TMPDIR="$sibling"
  else
    # Cloud/CI sandboxes may not allow writing next to the checkout (e.g. /workspace → /).
    TMPDIR="${TMPDIR:-/tmp}/.tmp-senticor-app-fachverfahren-template-$$"
    mkdir -p "$TMPDIR"
  fi
  export TMPDIR
fi

mkdir -p "$TMPDIR"

repo_root="$(pwd -P)"
tmp_root="$(cd "$TMPDIR" && pwd -P)"
case "$tmp_root" in
  "$repo_root"/*)
    echo "TMPDIR must be outside the repository checkout: $TMPDIR" >&2
    exit 1
    ;;
esac

# CI_PROFILE steuert den Umfang. `full` (Default) ist das VOLLE Gate wie bisher — die reale
# GitLab-Pipeline bleibt unverändert. `core` lässt die Schritte weg, die schwere Extra-Werkzeuge
# (kubeconform/conftest/syft/trivy) und Netz brauchen; es bleibt das schnelle Health-Gate
# (Vorlage/Konsument-Checks, Builds, Web-Delivery), das der Scaffolded-App-CI-Harness pro PR fährt.
CI_PROFILE="${CI_PROFILE:-full}"

pnpm run check:precommit
pnpm run check:dockerfile-paths
pnpm run build:packages
pnpm run build:app
pnpm run build:server
pnpm run check:web-delivery
pnpm run check:openapi
pnpm run smoke:runtime

if [ "$CI_PROFILE" = "full" ]; then
  pnpm run test:k8s:render
  pnpm run check:k8s-delivery
  pnpm run test:supply-chain
  pnpm run evidence:build
elif [ "$CI_PROFILE" != "core" ]; then
  echo "unknown CI_PROFILE: $CI_PROFILE (expected 'core' or 'full')" >&2
  exit 1
fi
