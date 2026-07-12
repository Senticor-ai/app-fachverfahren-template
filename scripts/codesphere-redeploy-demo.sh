#!/usr/bin/env bash
# codesphere-redeploy-demo.sh — rollt den persistenten fachverfahren-demo-Workspace
# (Codesphere vendorportal, Team 119) in place auf den zuletzt gepushten Stand des
# Demo-Konsumenten. Wird vom deploy-demo-consumer-Workflow NACH erfolgreichem Push
# zu GitHub + GitLab-Mirror aufgerufen; lokal genauso nutzbar.
#
# WARUM diese Sequenz (pull → reset → pipeline → kill 1 → verify):
# `cs start pipeline run` ist bei einem gesunden Prozess ein No-op, und `kill 1`
# allein spielt weder `prepare` noch Env-Änderungen ein. `cs git pull` ist
# fetch+merge und akkumuliert Merge-Commits — daher der anschließende
# `git reset --hard origin/main` (rein lokal, braucht keine Remote-Auth).
# Siehe Senticor-ai/infrastructure codesphere-vendorportal/fachverfahren-demo/README.md.
#
# WARUM OHNE --profile-Flag: der Demo-Konsument shippt ein einfaches `ci.yml` —
# genau das sucht flagloses `cs`. `--profile default` erwartet `ci.default.yml`
# und scheitert mit einem irreführenden 400 "Multi Server Deployment".
#
# Env:
#   CS_WORKSPACE   (Pflicht) Workspace-ID des persistenten Demo-Workspace
#   CS_TEAM        Team-ID (Default: 119)
#   EXPECTED_SHA   erwarteter Commit auf origin/main; wenn der Workspace schon
#                  gesund auf diesem Stand läuft, ist der Lauf ein No-op (das
#                  fängt auch Doppel-Deploys ab, falls natives CD je greift)
#   CS_BIN         Pfad zur cs-CLI (Default: cs im PATH)
#
# Exit: 0 ok/no-op | 1 usage | 3 deploy/verify fehlgeschlagen
set -euo pipefail

die()  { printf 'codesphere-redeploy-demo: error: %s\n' "$1" >&2; exit "${2:-1}"; }
note() { printf 'codesphere-redeploy-demo: %s\n' "$*" >&2; }

CS_TEAM="${CS_TEAM:-119}"
CS_WORKSPACE="${CS_WORKSPACE:?CS_WORKSPACE (Workspace-ID) ist Pflicht}"
EXPECTED_SHA="${EXPECTED_SHA:-}"
CS_BIN="${CS_BIN:-$(command -v cs 2>/dev/null || true)}"
[ -n "$CS_BIN" ] || die "cs CLI nicht gefunden (codesphere-cloud/cs-go)"

# Team 119 ist dc-2 (Hetzner): die generische API-Base 307-redirected dorthin und verliert
# den Bearer-Header (401). Ohne explizites CS_API daher die DC-scoped Base verwenden.
export CS_API="${CS_API:-https://2.vendorportal.gtplatforms.org/api}"

ws_head() {
  "$CS_BIN" exec -t "$CS_TEAM" -w "$CS_WORKSPACE" -- "git -C /home/user/app rev-parse HEAD" 2>/dev/null | tail -1
}

readyz_code() {
  "$CS_BIN" curl -t "$CS_TEAM" -w "$CS_WORKSPACE" /readyz --timeout 20s -- -sS -i 2>&1 \
    | grep -E '^HTTP' | awk '{print $2}' | tail -1
}

note "wake-up (falls schlafend) …"
"$CS_BIN" wake-up -t "$CS_TEAM" -w "$CS_WORKSPACE" --timeout 10m 2>&1 || true

# No-op-/Doppel-Deploy-Check VOR dem Pull: läuft der Workspace schon gesund auf
# dem erwarteten Stand, ist nichts zu tun.
if [ -n "$EXPECTED_SHA" ]; then
  current="$(ws_head || true)"
  if [ "$current" = "$EXPECTED_SHA" ] && [ "$(readyz_code || true)" = "200" ]; then
    note "Workspace läuft bereits gesund auf ${EXPECTED_SHA} — no-op."
    exit 0
  fi
fi

note "git pull vom GitLab-Mirror …"
"$CS_BIN" git pull -t "$CS_TEAM" -w "$CS_WORKSPACE" --remote origin --branch main 2>&1 \
  || die "cs git pull fehlgeschlagen" 3
"$CS_BIN" exec -t "$CS_TEAM" -w "$CS_WORKSPACE" -- "git -C /home/user/app reset --hard origin/main" 2>&1 \
  || die "git reset --hard origin/main fehlgeschlagen" 3

if [ -n "$EXPECTED_SHA" ]; then
  got="$(ws_head || true)"
  [ "$got" = "$EXPECTED_SHA" ] \
    || die "Workspace-HEAD ($got) != gepushter Stand ($EXPECTED_SHA) nach pull+reset — Mirror hinkt?" 3
fi

# WICHTIG: --team/--workspace lang ausschreiben — bei `cs start pipeline` ist -t das
# Timeout-Kürzel (CLI-Hilfe: `-t 5m`), nicht das Team.
note "Pipeline prepare → test → run (ohne --profile, 20m Timeout) …"
"$CS_BIN" start pipeline --team "$CS_TEAM" --workspace "$CS_WORKSPACE" --timeout 20m prepare test run 2>&1 \
  || die "Pipeline fehlgeschlagen" 3

note "erzwungener Neustart (kill 1), damit der neue Stand wirklich läuft …"
"$CS_BIN" exec -t "$CS_TEAM" -w "$CS_WORKSPACE" -- "kill 1" 2>&1 \
  || die "kill 1 fehlgeschlagen — Verifikation gegen den alten Prozess wäre wertlos" 3

note "45s Settle (Dev-Domain-429-Schutz), dann /readyz-Verifikation …"
sleep 45
ok=false
for i in $(seq 1 24); do
  code="$(readyz_code || true)"
  if [ "$code" = "200" ]; then ok=true; break; fi
  note "  /readyz noch nicht bereit (${code:-keine Antwort}); Versuch $i/24 …"
  sleep 10
done
[ "$ok" = true ] || die "/readyz wurde nach dem Redeploy nicht 200 — 'cs log -t $CS_TEAM -w $CS_WORKSPACE' prüfen" 3

if [ -n "$EXPECTED_SHA" ]; then
  got="$(ws_head || true)"
  [ "$got" = "$EXPECTED_SHA" ] || die "läuft, aber auf falschem Stand: $got != $EXPECTED_SHA" 3
fi

note "Redeploy ok$([ -n "$EXPECTED_SHA" ] && printf ' @ %s' "$EXPECTED_SHA")."
