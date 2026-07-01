#!/usr/bin/env sh
set -eu

if [ -z "${TMPDIR:-}" ]; then
  TMPDIR="$(pwd)/../.tmp-senticor-app-fachverfahren-template"
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

pnpm run check:precommit
pnpm run build:packages
pnpm run build:app
pnpm run build:server
pnpm run test:k8s:render
pnpm run evidence:build
