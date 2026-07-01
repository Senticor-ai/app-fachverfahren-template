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
    pnpm-lock.yaml|dist/*|dist-types/*|storybook-static/*|test-results/*|node_modules/*|.chos/*|apps/*/dist-types/*)
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
