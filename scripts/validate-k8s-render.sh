#!/usr/bin/env sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

# GENERISCH: rendert jedes vorhandene Helm-Chart unter apps/*/deploy/helm/* und jedes vorhandene
# kustomize-Overlay unter apps/*/deploy/k8s/overlays/* — kein App-Name hartkodiert.
charts="$(find "${repo_root}/apps" -type f -path '*/deploy/helm/*/Chart.yaml' 2>/dev/null || true)"
overlays="$(find "${repo_root}/apps" -type d -path '*/deploy/k8s/overlays/*' -mindepth 5 -maxdepth 5 2>/dev/null || true)"

if [ -z "${charts}" ] && [ -z "${overlays}" ]; then
  echo "k8s render validation: keine Helm-Charts oder kustomize-Overlays vorhanden — nichts zu rendern"
  exit 0
fi

if [ -n "${charts}" ]; then
  command -v helm >/dev/null 2>&1 || {
    echo "missing required command: helm" >&2
    exit 1
  }
  # zeilenweise statt Wort-Splitting: Pfade duerfen Leerzeichen enthalten
  while IFS= read -r chart_file; do
    [ -n "${chart_file}" ] || continue
    chart_dir="$(dirname "${chart_file}")"
    echo "==> Rendering ${chart_dir#"${repo_root}"/}"
    helm template "$(basename "${chart_dir}")" "${chart_dir}" >/dev/null
  done <<CHARTS_EOF
${charts}
CHARTS_EOF
fi

if [ -n "${overlays}" ]; then
  command -v kubectl >/dev/null 2>&1 || {
    echo "missing required command: kubectl" >&2
    exit 1
  }
  while IFS= read -r overlay; do
    [ -n "${overlay}" ] || continue
    echo "==> Rendering ${overlay#"${repo_root}"/}"
    KUBECONFIG=/dev/null kubectl kustomize "${overlay}" >/dev/null
  done <<OVERLAYS_EOF
${overlays}
OVERLAYS_EOF
fi

echo "k8s render validation passed"
