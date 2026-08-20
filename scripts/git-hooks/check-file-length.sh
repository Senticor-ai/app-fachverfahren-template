#!/usr/bin/env sh
set -eu

MAX_LINES="${FACHVERFAHREN_MAX_FILE_LINES:-5000}"

if [ "${HUSKY:-}" = "0" ]; then
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  exit 0
fi

TMP_LIST="$(mktemp 2>/dev/null || mktemp -t check-file-length-list)"
trap 'rm -f "$TMP_LIST"' EXIT

git diff --cached --name-only --diff-filter=ACMR 2>/dev/null > "$TMP_LIST" || true

FOUND=""
while IFS= read -r file; do
  [ -n "$file" ] || continue
  [ -f "$file" ] || continue

  case "$file" in
    # ERZEUGTE ARTEFAKTE. Die Zeilenzahl ist hier kein Qualitaetssignal: niemand pflegt diese Dateien von
    # Hand, und „Split large files" ist auf einen Schnappschuss nicht anwendbar — er hat genau die Laenge
    # seiner Quelle. `schemas/openapi.internal.json` gehoert derselben Klasse an wie `pnpm-lock.yaml`:
    # von `check:openapi -- --update` geschrieben, als Vertrag versioniert, nie editiert. GEMESSEN lag sie
    # schon vor dieser Aenderung bei 8274 Zeilen (Grenze 5000) und wurde zuletzt am 2026-07-23 committet —
    # der Riegel besteht seit 2026-07-01. Er hat sie also nie gefasst; die Ausnahme macht das sichtbar,
    # statt sie weiter unbemerkt zu lassen. Die GRENZE bleibt bei 5000: `FACHVERFAHREN_MAX_FILE_LINES` zu
    # heben, damit die eigene Aenderung passt, waere die Aufweichung, die diese Ausnahme gerade vermeidet.
    pnpm-lock.yaml|schemas/openapi.internal.json|dist/*|dist-types/*|storybook-static/*|test-results/*|node_modules/*|.chos/*|apps/*/dist-types/*)
      continue
      ;;
  esac

  LINES="$(wc -l < "$file" | tr -d ' ')"
  if [ "$LINES" -gt "$MAX_LINES" ]; then
    FOUND="${FOUND}
  ${file} (${LINES} lines)"
  fi
done < "$TMP_LIST"

if [ -n "$FOUND" ]; then
  printf "check-file-length: staged files exceed %d lines:\n" "$MAX_LINES" >&2
  printf "%s\n" "$FOUND" >&2
  printf "\nSplit large files or raise the limit with FACHVERFAHREN_MAX_FILE_LINES.\n" >&2
  exit 1
fi

exit 0
