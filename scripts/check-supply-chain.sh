#!/usr/bin/env sh
set -eu

command -v syft >/dev/null 2>&1 || {
  echo "missing required command: syft" >&2
  exit 1
}
command -v trivy >/dev/null 2>&1 || {
  echo "missing required command: trivy" >&2
  exit 1
}

mkdir -p dist/evidence
syft dir:. -o cyclonedx-json=dist/evidence/sbom.cdx.json
trivy fs \
  --scanners vuln,secret,misconfig \
  --severity HIGH,CRITICAL \
  --exit-code 1 \
  --ignore-unfixed \
  --skip-dirs node_modules \
  --skip-dirs apps/antragsservice/dist \
  .
