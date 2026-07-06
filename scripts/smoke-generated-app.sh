#!/usr/bin/env sh
# Runtime-Smoke für eine generierte React+BFF-App: bootet den gebauten Fastify-Server und prüft, dass
# er wirklich hochkommt (Liveness/Readiness) UND das gebaute Frontend ausliefert. Build-Erfolg allein
# beweist das nicht. Zusätzlich: KEIN Server-Secret darf im Client-Bundle landen (Vite exponiert nur
# `VITE_`-präfixierte Variablen an den Client — alles andere im Bundle wäre ein Leak).
#
# Aufruf:  DOMAIN=<slug> scripts/smoke-generated-app.sh   (CWD = Wurzel der generierten App)
# Voraussetzung: `pnpm run build:app` und `pnpm run build:server` sind bereits gelaufen.
set -eu

DOMAIN="${DOMAIN:?DOMAIN muss gesetzt sein (App-Slug, z.B. beispiel)}"
APP_DIR="apps/${DOMAIN}"
SERVER_ENTRY="${APP_DIR}/dist-server/index.js"
STATIC_DIR="${APP_DIR}/dist"

if [ ! -f "$SERVER_ENTRY" ]; then
  echo "smoke: Server-Bundle fehlt ($SERVER_ENTRY) — vorher build:server ausführen" >&2
  exit 1
fi
if [ ! -d "$STATIC_DIR" ]; then
  echo "smoke: Client-Bundle fehlt ($STATIC_DIR) — vorher build:app ausführen" >&2
  exit 1
fi

# Client-Bundle-Leak-Gate: gängige Server-Secret-Namen dürfen NICHT im ausgelieferten JS auftauchen.
if grep -rlIF \
  -e "APP_PG_URL" \
  -e "APP_PG_DIRECT_URL" \
  -e "APP_SESSION_SECRET" \
  -e "postgres://" \
  "$STATIC_DIR" 2>/dev/null; then
  echo "smoke: Server-Secret im Client-Bundle gefunden (nur VITE_-Variablen dürfen client-seitig sein)" >&2
  exit 1
fi

# Freie, unwahrscheinlich belegte Ports (deterministisch, kein Zufall — Harness läuft seriell).
PORT="${SMOKE_PORT:-43187}"
INTERNAL_PORT="${SMOKE_INTERNAL_PORT:-43188}"

export PORT INTERNAL_PORT STATIC_DIR
export APP_ENABLE_MOCK_AUTH=true
export APP_CSP_MODE=enforce
export APP_ALLOWED_HOSTS="127.0.0.1:${PORT},localhost:${PORT}"
node "$SERVER_ENTRY" &
server_pid=$!

cleanup() {
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Bis zu 45s auf Liveness warten.
i=0
until curl -fsS "http://127.0.0.1:${PORT}/livez" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 45 ]; then
    echo "smoke: Server wurde nicht innerhalb von 45s live (/livez)" >&2
    exit 1
  fi
  sleep 1
done

# Readiness (200) + Frontend-Root wird ausgeliefert (index.html der gebauten App).
curl -fsS "http://127.0.0.1:${PORT}/readyz" >/dev/null
curl -fsS "http://127.0.0.1:${PORT}/" | grep -qiE "<!doctype html|<html" \
  || {
    echo "smoke: Frontend-Root lieferte kein HTML" >&2
    exit 1
  }

echo "smoke: OK — Server live, readyz=200, Frontend ausgeliefert, kein Secret-Leak im Bundle"
