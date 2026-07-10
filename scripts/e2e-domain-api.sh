#!/usr/bin/env bash
#
# REAL end-to-end test of the fachliche Domain-API against a running server + real Postgres.
# Seeds a case, starts the BUILT server on a socket, drives /api/cases over HTTP (curl), and asserts
# status codes, the Vier-Augen separation, append-only audit growth and the resulting DB state.
#
# Voraussetzungen (explizite Ausbaustufe):
#   - APP_PG_DIRECT_URL zeigt auf ein Postgres mit ausgeführten Migrationen (pnpm db:migrate).
#   - Der Server ist gebaut: pnpm run build:app && pnpm run build:server.
#
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG="${APP_PG_DIRECT_URL:?APP_PG_DIRECT_URL is required (migrated Postgres)}"
PORT="${E2E_PORT:-8899}"
INTERNAL_PORT="${E2E_INTERNAL_PORT:-8900}"
BASE="http://127.0.0.1:$PORT"
CID="e2e-$(psql "$PG" -tAc "select gen_random_uuid()" | tr -d ' ')"
FAIL=0

echo "== seed case $CID =="
psql "$PG" -tAc "INSERT INTO app_cases (case_id, tenant_id, authority_id, jurisdiction_id, procedure_id, procedure_version, state, version, subject_ids) VALUES ('$CID','t1','b1','de','musterantrag','1','eingegangen',1,'[]'::jsonb)" >/dev/null || exit 2

echo "== seed actor role (für KI-Zuständigkeitsprüfung) =="
psql "$PG" -tAc "INSERT INTO app_actor_roles (tenant_id, actor_id, role_key, authority_id, jurisdiction_id) VALUES ('t1','sb.assignee','caseworker','b1','de') ON CONFLICT DO NOTHING" >/dev/null

echo "== start server (mit LIVE Automations-Poller) =="
HOST=127.0.0.1 PORT="$PORT" INTERNAL_PORT="$INTERNAL_PORT" \
  STATIC_DIR="$ROOT/apps/fachverfahren/dist" \
  APP_LEISTUNG_CONTRACT="$ROOT/apps/fachverfahren/leistung.contract.json" \
  APP_PG_DIRECT_URL="$PG" APP_PROCEDURE_VERSION=1 \
  APP_AUTOMATION_POLL_MS=300 \
  node "$ROOT/apps/fachverfahren/dist-server/index.js" > /tmp/fv-e2e-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

for _ in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/livez" 2>/dev/null)" = "200" ] && break
  sleep 1
done

A=(-H "x-actor-id: sb.a" -H "x-tenant-id: t1" -H "x-authority-id: b1" -H "x-permissions: case.read,case.transition,case.decide")
B=(-H "x-actor-id: sb.b" -H "x-tenant-id: t1" -H "x-authority-id: b1" -H "x-permissions: case.read,case.transition,case.decide")
AUD=(-H "x-actor-id: sb.a" -H "x-tenant-id: t1" -H "x-authority-id: b1" -H "x-permissions: audit.read")
JGET() { node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const d=JSON.parse(s);console.log($1)})"; }
check() { if [ "$2" = "$3" ]; then echo "  PASS $1 ($3)"; else echo "  FAIL $1 (expected $2, got $3)"; FAIL=1; fi; }

POST() { curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/cases/$CID/transitions" "$@" -H 'content-type: application/json'; }

check "401 without session" 401 "$(POST -d '{"action":"in_pruefung","expectedVersion":1}')"
check "200 eingegangen->in_pruefung (sb.a)" 200 "$(POST "${A[@]}" -d '{"action":"in_pruefung","expectedVersion":1}')"
check "state==in_pruefung" in_pruefung "$(curl -s "$BASE/api/cases/$CID" "${A[@]}" | JGET 'd.case.state')"
check "403 four-eyes (sb.a is preparer)" 403 "$(POST "${A[@]}" -d '{"action":"festgesetzt","expectedVersion":2}')"
check "200 four-eyes (sb.b differs)" 200 "$(POST "${B[@]}" -d '{"action":"festgesetzt","expectedVersion":2}')"
check "audit has 2 events" 2 "$(curl -s "$BASE/api/cases/$CID/audit" "${AUD[@]}" | JGET 'd.events.length')"
check "DB state==festgesetzt" festgesetzt "$(psql "$PG" -tAc "select state from app_cases where case_id='$CID'" | tr -d ' ')"
check "DB version==3" 3 "$(psql "$PG" -tAc "select version from app_cases where case_id='$CID'" | tr -d ' ')"

echo "== triage inbox flow =="
IID="intake-$(psql "$PG" -tAc "select gen_random_uuid()" | tr -d ' ')"
psql "$PG" -tAc "INSERT INTO app_intake_items (intake_id, tenant_id, authority_id, jurisdiction_id, procedure_id, source, triage_status, subject, raw_data) VALUES ('$IID','t1','b1','de','musterantrag','antrag','pending','E2E-Eingang','{}'::jsonb)" >/dev/null

TP=(-H "x-actor-id: sb.a" -H "x-tenant-id: t1" -H "x-authority-id: b1" -H "x-permissions: task.read,task.write,inbox.read,inbox.triage")
check "inbox contains the pending item" true "$(curl -s "$BASE/api/inbox?status=pending" "${TP[@]}" | JGET "d.items.some(i=>i.intakeId==='$IID')")"

ACCEPT=$(curl -s -X POST "$BASE/api/inbox/$IID/accept" "${TP[@]}")
TASKID=$(echo "$ACCEPT" | JGET 'd.task.taskId')
NEWCASE=$(echo "$ACCEPT" | JGET 'd.case.state')
check "accept -> case state eingegangen" eingegangen "$NEWCASE"
check "task visible in /api/tasks" true "$(curl -s "$BASE/api/tasks" "${TP[@]}" | JGET "d.tasks.some(t=>t.taskId==='$TASKID')")"

pcode=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/tasks/$TASKID" "${TP[@]}" -H 'content-type: application/json' -d '{"priorityKey":"hoch","assigneeActorId":"sb.a"}')
check "PATCH task priority/assignee 200" 200 "$pcode"
check "DB task priority==hoch" hoch "$(psql "$PG" -tAc "select priority_key from app_tasks where task_id='$TASKID'" | tr -d ' ')"
check "DB intake accepted" accepted "$(psql "$PG" -tAc "select triage_status from app_intake_items where intake_id='$IID'" | tr -d ' ')"

echo "== PRODUKTIVE AUTOMATION: Regel anlegen -> Eingang -> LIVE-Poller feuert Effekt =="
AU=(-H "x-actor-id: sb.a" -H "x-tenant-id: t1" -H "x-authority-id: b1" -H "x-permissions: automation.read,automation.write")
# Regel: beim-eingang (musterantrag) -> Priorität "eilig-hoch", mit trivial erfüllter Bedingung (kein fail-closed).
RULE=$(curl -s -X POST "$BASE/api/automations" "${AU[@]}" -H 'content-type: application/json' \
  -d '{"procedureId":"musterantrag","triggerEvent":"beim-eingang","condition":{"feld":"$procedureId","op":"==","wert":"musterantrag"},"actions":[{"art":"setze-prioritaet","wert":"eilig-hoch"}]}')
RULEID=$(echo "$RULE" | JGET 'd.rule.ruleId')
check "Regel angelegt (keine Konfig-Probleme)" 0 "$(echo "$RULE" | JGET 'd.probleme.length')"

# simulate ist REIN (keine Mutation): würde feuern.
SIM=$(curl -s -X POST "$BASE/api/automations/$RULEID/simulate" "${AU[@]}" -H 'content-type: application/json' -d '{"daten":{"$procedureId":"musterantrag"}}')
check "simulate: würde feuern" true "$(echo "$SIM" | JGET 'd.wuerdefeuern')"

# Neuer Eingang -> accept -> ATOMAR ein beim-eingang-Event in-TX -> der LIVE-Poller verarbeitet es.
IID2="intake-$(psql "$PG" -tAc "select gen_random_uuid()" | tr -d ' ')"
psql "$PG" -tAc "INSERT INTO app_intake_items (intake_id, tenant_id, authority_id, jurisdiction_id, procedure_id, source, triage_status, subject, raw_data) VALUES ('$IID2','t1','b1','de','musterantrag','antrag','pending','Auto-Eingang','{}'::jsonb)" >/dev/null
ACCEPT2=$(curl -s -X POST "$BASE/api/inbox/$IID2/accept" "${TP[@]}")
TASKID2=$(echo "$ACCEPT2" | JGET 'd.task.taskId')

# Auf den Poller warten: die Priorität wird von der Automation gesetzt (echter Roundtrip, kein Mock).
PRIO=""
for _ in $(seq 1 30); do
  PRIO=$(psql "$PG" -tAc "select coalesce(priority_key,'') from app_tasks where task_id='$TASKID2'" | tr -d ' ')
  [ "$PRIO" = "eilig-hoch" ] && break
  sleep 0.4
done
check "LIVE-Poller setzt Priorität via Automation" eilig-hoch "$PRIO"
check "Automations-Lauf ist 'applied'" applied "$(curl -s "$BASE/api/automations/$RULEID/runs" "${AU[@]}" | JGET "d.runs[0]?.status")"

echo "== beim-uebergang wird ATOMAR emittiert =="
EVBEFORE=$(psql "$PG" -tAc "select count(*) from app_automation_events where trigger_event='beim-uebergang'" | tr -d ' ')
curl -s -o /dev/null -X POST "$BASE/api/cases/$CID/transitions" "${A[@]}" -H 'content-type: application/json' -d '{"action":"in_pruefung","expectedVersion":3}' 2>/dev/null || true
# (Der Fall $CID ist bereits festgesetzt/terminal -> Übergang evtl. 400; wir prüfen die Emission an einem frischen Fall.)
CID2=$(echo "$ACCEPT2" | JGET 'd.case.caseId')
curl -s -o /dev/null -X POST "$BASE/api/cases/$CID2/transitions" "${A[@]}" -H 'content-type: application/json' -d '{"action":"in_pruefung","expectedVersion":1}'
EVAFTER=$(psql "$PG" -tAc "select count(*) from app_automation_events where trigger_event='beim-uebergang' and case_id='$CID2'" | tr -d ' ')
check "menschlicher Übergang emittiert ein beim-uebergang-Event (in-TX)" 1 "$EVAFTER"

echo "== Vermerke + Aktivität =="
CO=(-H "x-actor-id: sb.a" -H "x-tenant-id: t1" -H "x-authority-id: b1" -H "x-permissions: task.read,comment.read,comment.write")
ccode=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tasks/$TASKID2/comments" "${CO[@]}" -H 'content-type: application/json' -d '{"body":"Bitte Nachweis prüfen."}')
check "Vermerk anlegen 201" 201 "$ccode"
check "Vermerk lesbar (append-only)" 1 "$(curl -s "$BASE/api/tasks/$TASKID2/comments" "${CO[@]}" | JGET 'd.comments.length')"
check "Aktivität enthält task.commented" true "$(curl -s "$BASE/api/tasks/$TASKID2/activity" -H 'x-actor-id: sb.a' -H 'x-tenant-id: t1' -H 'x-authority-id: b1' -H 'x-permissions: task.read' | JGET "d.activity.some(a=>a.activityType==='task.commented')")"

echo "== Gespeicherte Ansichten =="
VW=(-H "x-actor-id: sb.a" -H "x-tenant-id: t1" -H "x-authority-id: b1" -H "x-permissions: view.read,view.write")
VIEW=$(curl -s -X POST "$BASE/api/views" "${VW[@]}" -H 'content-type: application/json' -d '{"label":"Meine eiligen","layout":"board"}')
VIEWID=$(echo "$VIEW" | JGET 'd.view.viewId')
check "Ansicht enthalten" true "$(curl -s "$BASE/api/views" "${VW[@]}" | JGET "d.views.some(v=>v.viewId==='$VIEWID')")"
check "Ansicht löschbar 204" 204 "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/views/$VIEWID" "${VW[@]}")"

echo "== KI-Assistenz (assistiv, Zuständigkeitsfilter) =="
KI=(-H "x-actor-id: sb.a" -H "x-tenant-id: t1" -H "x-authority-id: b1" -H "x-permissions: task.read,task.write,ai.assist")
AS=$(curl -s -X POST "$BASE/api/tasks/$TASKID2/ai/assist" "${KI[@]}" -H 'content-type: application/json' -d '{}')
check "assist: Vorschlag ist ki-vorschlag" ki-vorschlag "$(echo "$AS" | JGET 'd.vorschlag.marking')"
check "apply an NICHT-Zuständigen -> 422" 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tasks/$TASKID2/ai/apply" "${KI[@]}" -H 'content-type: application/json' -d '{"zuweisenAn":"sb.unbekannt"}')"
check "apply an Zuständigen -> 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/tasks/$TASKID2/ai/apply" "${KI[@]}" -H 'content-type: application/json' -d '{"zuweisenAn":"sb.assignee"}')"
check "DB: Aufgabe an sb.assignee zugewiesen" sb.assignee "$(psql "$PG" -tAc "select coalesce(assignee_actor_id,'') from app_tasks where task_id='$TASKID2'" | tr -d ' ')"

if [ "$FAIL" = "0" ]; then echo "E2E DOMAIN-API: ALL PASS"; else echo "E2E DOMAIN-API: FAILURES"; tail -25 /tmp/fv-e2e-server.log; fi
exit $FAIL
