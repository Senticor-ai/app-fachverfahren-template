#!/usr/bin/env sh
set -eu

if [ "${HUSKY:-}" = "0" ]; then
  exit 0
fi

COMMIT_MSG_FILE="${1:-}"
[ -n "$COMMIT_MSG_FILE" ] && [ -f "$COMMIT_MSG_FILE" ] || exit 0

COMMIT_MSG="$(sed -n '1p' "$COMMIT_MSG_FILE")"

case "$COMMIT_MSG" in
  Merge\ *|Revert\ *|fixup!\ *|squash!\ *)
    exit 0
    ;;
esac

PATTERN='^(feat|fix|refactor|test|docs|chore|ci|perf|style|build|security)(\([a-z0-9][a-z0-9-]*\))?!?: .{1,120}$'

if ! printf '%s\n' "$COMMIT_MSG" | grep -Eq "$PATTERN"; then
  cat >&2 <<EOF

Commit message rejected.

Expected:
  <type>(optional-scope): <subject>

Allowed types:
  feat, fix, refactor, test, docs, chore, ci, perf, style, build, security

Examples:
  fix(template): keep generated app type-safe
  ci(template): mirror green main to GitLab
  chore(hooks): tighten local quality gates

Got:
  $COMMIT_MSG

EOF
  exit 1
fi

exit 0
