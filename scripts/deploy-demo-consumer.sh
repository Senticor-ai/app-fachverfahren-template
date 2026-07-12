#!/usr/bin/env sh
# Demo-Consumer-Deploy: hält einen ECHTEN gescaffoldeten Konsumenten (TARGET_DIR) auf dem aktuellen
# Stand dieser Vorlage — entweder per Update-Pfad (MODE=update, Default: prüft den Upgrade-Pfad
# EINES bestehenden Konsumenten inkl. Datenmigrationen gegen bereits migrierte Daten) oder per
# Neu-Scaffold (MODE=rescaffold). Nur bei GRÜNEM Health-Gate (Migrationen + Build + Runtime-Smoke)
# wird committet und gepusht — Codesphere beobachtet TARGET_DIRs `main` per nativem Continuous
# Deployment und deployt daraufhin automatisch neu (siehe ci.yml). Kein Push bei Rot: der Live-Stand
# bleibt stabil.
#
# Env:
#   TARGET_DIR     Pfad zum Checkout des Demo-Konsumenten (Pflicht; muss ein Git-Repo sein).
#   TEMPLATE_DIR   Pfad zum Vorlagen-Checkout (Default: aktuelles Arbeitsverzeichnis).
#   MODE           update (Default) | rescaffold
#   DOMAIN         Domain-Slug des Demo-Konsumenten (Default: beispiel)
#   DISPLAY_NAME   Anzeigename beim (Re-)Scaffold (Default: aus DOMAIN abgeleitet)
#   PUSH           1 = bei Erfolg committen+pushen (CI). Sonst: nur validieren (lokaler Trockenlauf).
#   APP_PG_DIRECT_URL / APP_PG_URL   Verbindung zur Postgres-Instanz für die Migrations-Gates
#                                    (für MODE=rescaffold sollte sie leer sein; für MODE=update ist
#                                    es GERADE der Witz, dass sie den Vor-Update-Stand trägt).
set -eu

TARGET_DIR="${TARGET_DIR:?TARGET_DIR muss auf den Checkout des Demo-Konsumenten zeigen}"
TEMPLATE_DIR="${TEMPLATE_DIR:-$(pwd -P)}"
MODE="${MODE:-update}"
DOMAIN="${DOMAIN:-beispiel}"
DISPLAY_NAME="${DISPLAY_NAME:-}"
PUSH="${PUSH:-0}"

case "$MODE" in
  update | rescaffold) ;;
  *)
    echo "unknown MODE: $MODE (expected update|rescaffold)" >&2
    exit 1
    ;;
esac

if [ ! -d "$TARGET_DIR/.git" ]; then
  echo "refuse: TARGET_DIR=$TARGET_DIR ist kein Git-Repo (Aufrufer muss es vorher klonen/init'en)" >&2
  exit 1
fi

TEMPLATE_DIR="$(cd "$TEMPLATE_DIR" && pwd -P)"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd -P)"
TEMPLATE_VERSION="$(node -e "console.log(require(process.argv[1]).version)" "${TEMPLATE_DIR}/package.json")"
TEMPLATE_SHA="$(git -C "$TEMPLATE_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"

echo "=================================================================="
echo "deploy-demo-consumer: mode=${MODE} domain=${DOMAIN} target=${TARGET_DIR}"
echo "  template=${TEMPLATE_DIR}@${TEMPLATE_SHA} (v${TEMPLATE_VERSION})"
echo "=================================================================="

# Reinstalliert + baut Packages und fährt das DB-Migrations-Gate GEGEN DEN AKTUELLEN TARGET_DIR-Stand
# (vor jedem Aufruf entscheidet der Kontext — Pre- oder Post-Update —, WELCHER Stand das ist).
run_migration_gate() {
  label="$1"
  (
    cd "$TARGET_DIR" || exit 1
    pnpm install --frozen-lockfile || exit 1
    pnpm run build:packages || exit 1
    pnpm --filter @senticor/app-store-postgres db:migrate || exit 1
  ) || {
    echo "deploy-demo-consumer: ${label} migration gate FAILED — kein Push" >&2
    exit 1
  }
}

do_rescaffold() {
  echo "deploy-demo-consumer: (re)scaffolding ${DOMAIN} aus dem Vorlagen-HEAD"
  # renderDomainApp() löscht TARGET_DIR bei --force KOMPLETT (inkl. .git — Remote, Auth, Historie),
  # sobald es bereits existiert (render.ts: `targetExists && options.force`). Ohne Sicherung ginge
  # jedes Mal die Push-Authentifizierung UND die Historie des Demo-Konsumenten verloren. Daher: .git
  # vor dem Scaffold sichern, danach zurücklegen — Remote/Auth/Historie bleiben erhalten, der Commit
  # zeigt den vollen Unterschied wie ein normales Update.
  git_backup=""
  if [ -d "$TARGET_DIR/.git" ]; then
    git_backup="$(mktemp -d)/git-backup"
    mv "$TARGET_DIR/.git" "$git_backup"
  fi

  if [ -n "$DISPLAY_NAME" ]; then
    (cd "$TEMPLATE_DIR" && pnpm run scaffold:domain-app -- --domain "$DOMAIN" --display-name "$DISPLAY_NAME" --target "$TARGET_DIR" --force --allow-dirty) || exit 1
  else
    (cd "$TEMPLATE_DIR" && pnpm run scaffold:domain-app -- --domain "$DOMAIN" --target "$TARGET_DIR" --force --allow-dirty) || exit 1
  fi

  if [ -n "$git_backup" ]; then
    mv "$git_backup" "$TARGET_DIR/.git"
  else
    git -C "$TARGET_DIR" init -q -b main
  fi

  run_migration_gate "rescaffold"
}

do_update() {
  if [ ! -f "$TARGET_DIR/.template/lock.json" ]; then
    echo "deploy-demo-consumer: kein .template/lock.json in TARGET_DIR — noch kein Konsument, falle auf rescaffold zurück"
    do_rescaffold
    return 0
  fi

  echo "deploy-demo-consumer: pre-update migrate (bestehender Schema-Stand vor dem Update)"
  run_migration_gate "pre-update"

  echo "deploy-demo-consumer: template:update --to ${TEMPLATE_VERSION}"
  if ! (cd "$TARGET_DIR" && pnpm run template:update -- --to "$TEMPLATE_VERSION" --template-source-dir "$TEMPLATE_DIR"); then
    echo "deploy-demo-consumer: template:update konnte nicht konfliktfrei angewendet werden — falle auf rescaffold zurück"
    do_rescaffold
    return 0
  fi

  # template:update kann package.json strukturell mergen (neue/angehobene Dependencies der
  # Vorlage) — pnpm-lock.yaml ist bewusst NICHT template-managed (Konsumenten-Lockfiles
  # divergieren legitim). Ein EINMALIGES ungefrorenes Install bringt das Lockfile in Sync;
  # es wird mit dem Update-Commit gepusht, damit auch die Konsumenten-CI (frozen) grün bleibt.
  # Die Gates selbst bleiben frozen und fangen echte Drift damit weiterhin ab.
  echo "deploy-demo-consumer: lockfile-refresh nach template:update"
  (cd "$TARGET_DIR" && pnpm install --no-frozen-lockfile) || {
    echo "deploy-demo-consumer: lockfile refresh FAILED — kein Push" >&2
    exit 1
  }

  echo "deploy-demo-consumer: post-update migrate (gegen DIESELBE, bereits migrierte Datenbank)"
  run_migration_gate "post-update"
}

if [ "$MODE" = "rescaffold" ]; then
  do_rescaffold
else
  do_update
fi

echo "deploy-demo-consumer: build + runtime smoke"
(
  cd "$TARGET_DIR" || exit 1
  pnpm install --frozen-lockfile || exit 1
  pnpm run build:packages || exit 1
  pnpm run build:app || exit 1
  pnpm run build:server || exit 1
  DOMAIN="$DOMAIN" sh scripts/smoke-generated-app.sh || exit 1
) || {
  echo "deploy-demo-consumer: build/smoke gate FAILED — kein Push" >&2
  exit 1
}

# Maschinenlesbares Push-Signal für nachgelagerte Workflow-Schritte (GitLab-Mirror-Push,
# Codesphere-Redeploy): ohne Push darf downstream nichts passieren.
emit_pushed() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "pushed=$1" >>"$GITHUB_OUTPUT"
    if [ -n "${2:-}" ]; then
      echo "pushed_sha=$2" >>"$GITHUB_OUTPUT"
    fi
  fi
}

if [ "$PUSH" != "1" ]; then
  echo "deploy-demo-consumer: PUSH!=1 — Trockenlauf, kein Commit/Push"
  emit_pushed false
  exit 0
fi

if [ -z "$(git -C "$TARGET_DIR" status --porcelain)" ]; then
  echo "deploy-demo-consumer: keine Änderungen — nichts zu pushen"
  emit_pushed false
  exit 0
fi

git -C "$TARGET_DIR" add -A
# --no-verify auf commit UND push: `pnpm install` im Migrations-Gate installiert die Husky-Hooks
# des Konsumenten (prepare-Script). Dessen pre-commit scheitert am initialen Voll-Commit
# (check-new-env-vars sieht ALLE Env-Vars als "neu"), dessen pre-push lädt Trivy (~100 MiB) und
# wiederholt die komplette CI — beides gehört dem Konsumenten-Entwickler, nicht diesem Deploy:
# das Gate für diesen Push sind die Migrations-/Build-/Smoke-Prüfungen oben.
git -C "$TARGET_DIR" \
  -c user.name="app-fachverfahren-template demo-deploy" \
  -c user.email="app-fachverfahren-template-demo-deploy@users.noreply.github.com" \
  commit -q --no-verify -m "chore: sync from app-fachverfahren-template@${TEMPLATE_SHA} (${MODE})"
git -C "$TARGET_DIR" push --no-verify origin HEAD:main
emit_pushed true "$(git -C "$TARGET_DIR" rev-parse HEAD)"
# Codesphere auf dem vendorportal beobachtet KEINEN Git-Push von selbst (Git-Integration ist
# GitLab-only, natives CD ungetestet) — den Redeploy stößt der Workflow explizit an:
# Mirror-Push nach gitlab.opencode.de + redeploy-codesphere-Job (scripts/codesphere-redeploy-demo.sh).
echo "deploy-demo-consumer: pushed — Mirror-Push + Codesphere-Redeploy übernehmen die Folge-Jobs"
