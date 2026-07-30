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
# `test:e2e` gehoert ins KERN-Gate, nicht ins `full`-Profil: es braucht kein Fremdwerkzeug und kein Netz
# (vitest gegen vitest.e2e.config.ts, gemessen 2,6 s) — genau das Kriterium, nach dem `core` geschnitten ist.
#
# WARUM ES HIER GEFEHLT HAT (2026-07-30): die CHOS-Verfassung fuehrt `test:e2e` in `gates.deploy` und sagt damit
# zu, dass ein erzeugtes Verfahren seine End-zu-End-Pruefung faehrt. Gemessen lief sie in KEINEM Tor dieses Repos
# — weder precommit noch ci noch push. Die Zusage stand in CHOS, die Ausfuehrung fehlte hier; niemand konnte die
# Luecke sehen, weil nichts die beiden Repos gegeneinander hielt. Der Riegel dafuer ist jetzt
# `template-gate-kongruenz.test.ts` in CHOS, und er hat genau diesen einen Fund uebrig gelassen.
pnpm run test:e2e

if [ "$CI_PROFILE" = "full" ]; then
  pnpm run test:k8s:render
  pnpm run check:k8s-delivery
  pnpm run test:supply-chain
  pnpm run evidence:build
elif [ "$CI_PROFILE" != "core" ]; then
  echo "unknown CI_PROFILE: $CI_PROFILE (expected 'core' or 'full')" >&2
  exit 1
fi
