#!/usr/bin/env sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

# GENERISCH: rendert JEDES vorhandene kustomize-Overlay unter apps/*/deploy/k8s/overlays/* — kein App-Name
# hartkodiert. Die Vorlage selbst bringt bewusst KEIN deploy-Gerüst mit (die devops-Phase des governten Builds
# erzeugt es im Projekt); gibt es keine Overlays, ist das Gate ehrlich „nichts zu rendern" und besteht.
overlays="$(find "${repo_root}/apps" -type d -path '*/deploy/k8s/overlays/*' -mindepth 5 -maxdepth 5 2>/dev/null || true)"

if [ -z "${overlays}" ]; then
  echo "kustomize render validation: keine apps/*/deploy/k8s/overlays/* vorhanden — nichts zu rendern"
  exit 0
fi

command -v kubectl >/dev/null 2>&1 || {
  echo "missing required command: kubectl" >&2
  exit 1
}

for overlay in ${overlays}; do
  echo "==> Rendering ${overlay#"${repo_root}"/}"
  KUBECONFIG=/dev/null kubectl kustomize "${overlay}" >/dev/null
done

echo "kustomize render validation passed"
