#!/usr/bin/env sh
set -eu

if [ "${HUSKY:-}" = "0" ]; then
  exit 0
fi

SCANNABLE_PATTERN='\.(js|jsx|ts|tsx|mjs|cjs|mts|json|yaml|yml|env|sh|bash|zsh|py|toml|ini|conf|properties|pem|key|crt)$'
ALLOWLIST_MARKER='allowlist-secret'

is_scannable() {
  base="$(basename "$1")"
  case "$1" in
    *.md|*.markdown|*.lock|*.snap|*.svg|*.png|*.jpg|*.jpeg|*.gif|*.ico|*.pdf)
      return 1
      ;;
    node_modules/*|dist/*|dist-types/*|storybook-static/*|test-results/*|.chos/*|apps/*/dist-types/*)
      return 1
      ;;
  esac
  case "$base" in
    .env|.env.*)
      return 0
      ;;
  esac
  printf '%s' "$1" | grep -Eq "$SCANNABLE_PATTERN"
}

read_patterns() {
  cat <<'PATTERNS_EOF'
AKIA[0-9A-Z]{16}
ghp_[A-Za-z0-9]{36}
gho_[A-Za-z0-9]{36}
ghu_[A-Za-z0-9]{36}
ghs_[A-Za-z0-9]{36}
ghr_[A-Za-z0-9]{36}
github_pat_[A-Za-z0-9_]{60,}
glpat-[A-Za-z0-9_-]{16,}
sk-or-v1-[A-Za-z0-9_-]{24,}
xox[baprs]-[0-9A-Za-z-]{10,}
-----BEGIN [A-Z ]*PRIVATE KEY-----
PATTERNS_EOF
}

PASSWORD_REGEX='(password|passwd|secret)[[:space:]]*[:=][[:space:]]*"[^"$]{10,}"' # pragma: allowlist-secret

scan_file() {
  file="$1"
  [ -f "$file" ] || return 0
  is_scannable "$file" || return 0

  filtered="$(grep -v "$ALLOWLIST_MARKER" "$file" 2>/dev/null || true)"
  [ -n "$filtered" ] || return 0

  hit=0
  pat_tmp="$(mktemp 2>/dev/null || mktemp -t check-secrets-patterns)"
  read_patterns > "$pat_tmp"
  while IFS= read -r pattern; do
    [ -n "$pattern" ] || continue
    if printf '%s\n' "$filtered" | grep -E -e "$pattern" >/dev/null 2>&1; then
      printf 'check-secrets: %s matched %s\n' "$file" "$pattern" >&2
      hit=1
    fi
  done < "$pat_tmp"
  rm -f "$pat_tmp"

  matched_pwd="$(printf '%s\n' "$filtered" | grep -Ei "$PASSWORD_REGEX" || true)"
  if [ -n "$matched_pwd" ]; then
    real="$(printf '%s\n' "$matched_pwd" | grep -Ev '(process\.env|import\.meta\.env|\$env:|os\.environ|getenv|config\.|cfg\.|dotenv\.|env\.)' || true)"
    if [ -n "$real" ]; then
      printf 'check-secrets: %s has a hardcoded password/secret literal\n' "$file" >&2
      hit=1
    fi
  fi

  return "$hit"
}

TMP_LIST="$(mktemp 2>/dev/null || mktemp -t check-secrets-list)"
trap 'rm -f "$TMP_LIST"' EXIT

if [ "$#" -gt 0 ]; then
  for arg in "$@"; do
    printf '%s\n' "$arg" >> "$TMP_LIST"
  done
else
  git diff --cached --name-only --diff-filter=ACMR 2>/dev/null > "$TMP_LIST" || true
fi

[ -s "$TMP_LIST" ] || exit 0

EXIT=0
while IFS= read -r file; do
  [ -n "$file" ] || continue
  if ! scan_file "$file"; then
    EXIT=1
  fi
done < "$TMP_LIST"

if [ "$EXIT" -ne 0 ]; then
  printf '\ncheck-secrets: blocking commit. Add " pragma: allowlist-secret" only for deliberate fixtures.\n' >&2
fi

exit "$EXIT"
