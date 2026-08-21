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
# DER PNPM-CONTENT-STORE IST BAU-CACHE, KEIN REPO-INHALT: inhaltsadressierte Kopien fremder Pakete.
# GEMESSEN im CI-Lauf 32453967186 meldete der secret-Scanner dort einen OpenSSH-Privatschluessel —
# ein Test-Fixture einer Abhaengigkeit, nicht unser Geheimnis. Unsere Geheimnisse koennen dort
# strukturell nicht liegen (der Store enthaelt ausschliesslich heruntergeladene Paketdateien), und
# der vuln-Scanner liest ohnehin das Lockfile statt den Store. `node_modules` ist aus genau diesem
# Grund seit jeher ausgenommen; der Store ist dieselbe Klasse, nur eine Ebene darunter.
trivy fs \
  --scanners vuln,secret,misconfig \
  --severity HIGH,CRITICAL \
  --exit-code 1 \
  --ignore-unfixed \
  --skip-dirs node_modules \
  --skip-dirs .pnpm \
  --skip-dirs .pnpm-store \
  --skip-dirs apps/fachverfahren/dist \
  .
