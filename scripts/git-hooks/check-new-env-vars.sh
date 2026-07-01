#!/usr/bin/env sh
set -eu

if [ "${HUSKY:-}" = "0" ]; then
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  exit 0
fi

SOURCE_FILES="$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null \
  | grep -E '^(apps|packages|jurisdictions|modules|scripts|tooling)/.*\.(ts|tsx|js|jsx|mjs|cjs|mts)$|^(vite|vitest|eslint)\.config\.(ts|js|mjs)$' \
  | grep -vE '/(node_modules|dist|dist-types|storybook-static|test-results)/' || true)"

if [ -z "$SOURCE_FILES" ]; then
  exit 0
fi

# shellcheck disable=SC2086
ADDED_LINES="$(git diff --cached --diff-filter=d -U0 -- $SOURCE_FILES \
  | grep '^+' | grep -v '^+++' || true)"

if [ -z "$ADDED_LINES" ]; then
  exit 0
fi

DOT_VARS="$(printf '%s\n' "$ADDED_LINES" \
  | grep -oE '(process\.env\.|import\.meta\.env\.)([A-Z][A-Z0-9_]+)' \
  | sed -E 's/^(process\.env\.|import\.meta\.env\.)//' || true)"

BRACKET_VARS="$(printf '%s\n' "$ADDED_LINES" \
  | sed -nE "s/.*process\.env\[[[:space:]]*['\"]([A-Z][A-Z0-9_]*)['\"][[:space:]]*\].*/\1/p" || true)"

NEW_VARS="$(printf '%s\n%s\n' "$DOT_VARS" "$BRACKET_VARS" \
  | sed '/^$/d' \
  | sort -u || true)"

if [ -z "$NEW_VARS" ]; then
  exit 0
fi

ENV_EXAMPLE="$(git show :.env.example 2>/dev/null || cat .env.example 2>/dev/null || true)"

UNDOCUMENTED=""
TRULY_NEW=""
for var in $NEW_VARS; do
  case "$var" in
    CI|GITHUB_*|RUNNER_*|NODE_ENV|PATH|HOME|SHELL)
      continue
      ;;
  esac

  if git grep -q "\(process\.env\.${var}\|import\.meta\.env\.${var}\)" HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.mts' 2>/dev/null; then
    continue
  fi

  if git grep -Eq "process\.env\[[[:space:]]*['\"]${var}['\"][[:space:]]*\]" HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs' '*.mts' 2>/dev/null; then
    continue
  fi

  TRULY_NEW="${TRULY_NEW}
  ${var}"
  if ! printf '%s\n' "$ENV_EXAMPLE" | grep -qE "(^|[^A-Z0-9_])${var}(=|$|[^A-Z0-9_])"; then
    UNDOCUMENTED="${UNDOCUMENTED}
  ${var}"
  fi
done

if [ -z "$TRULY_NEW" ]; then
  exit 0
fi

printf "\ncheck-new-env-vars: new environment variables in this commit:\n" >&2
printf "%s\n" "$TRULY_NEW" >&2

if [ -n "$UNDOCUMENTED" ]; then
  printf "\ncheck-new-env-vars: these are missing from .env.example:\n" >&2
  printf "%s\n" "$UNDOCUMENTED" >&2
  printf "\nDocument new runtime configuration in .env.example in the same commit.\n" >&2
  exit 1
fi

exit 0
