#!/usr/bin/env sh
set -eu

if [ "${HUSKY:-}" = "0" ]; then
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  exit 0
fi

if git diff --cached --quiet --exit-code 2>/dev/null; then
  exit 0
fi

git diff --cached --check
sh scripts/git-hooks/check-file-length.sh
sh scripts/git-hooks/check-new-env-vars.sh
sh scripts/git-hooks/check-secrets.sh
