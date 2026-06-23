#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
overlays=(
  "apps/fachverfahren-template/deploy/k8s/overlays/local"
)

command -v kubectl >/dev/null 2>&1 || {
  echo "missing required command: kubectl" >&2
  exit 1
}

for overlay in "${overlays[@]}"; do
  echo "==> Rendering ${overlay}"
  KUBECONFIG=/dev/null kubectl kustomize "${repo_root}/${overlay}" >/dev/null
done

echo "kustomize render validation passed"
