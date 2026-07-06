#!/usr/bin/env sh
# Scaffolded-App-CI-Harness: beweist, dass `pnpm run scaffold:domain-app -- --domain <d> --target <t>`
# eine GESUNDE App erzeugt — indem sie scaffoldet und in der generierten App deren EIGENES
# scripts/ci-validate.sh fährt (die exakte Quelle, die auch die reale GitLab-Pipeline nutzt). Damit
# kann die Vorlage nie wieder grün sein, während eine frisch gescaffoldete App rot pusht.
#
# Profile (PROFILE):
#   core     (Default) CI_PROFILE=core im generierten App: schnelles Gate ohne k8s/Supply-Chain-Werkzeug.
#   runtime  wie core + Runtime-Smoke (Server bootet, /readyz, Frontend, kein Secret-Leak).
#   full     CI_PROFILE=full (volle Parität zur GitLab-Pipeline) + Runtime-Smoke; braucht ci-setup-node.sh.
# MATRIX=1   iteriert eine kleine Domain-Matrix (kebab/Ziffern/Schutzbegriff), statt nur `beispiel`.
# Env: DOMAIN, TARGET, KEEP=1 (Zielverzeichnis behalten), SKIP_SCAFFOLD_CI=1 (lokal überspringen).
set -eu

# --- Selbst-Skip: NUR in der Vorlage laufen, nie in einem generierten Konsumenten -------------------
# Ein generierter Konsument trägt .template/lock.json; die pristine Vorlage nicht. Da precommit:check
# und .gitlab-ci.yml in Konsumenten mitkopiert werden, würde die Harness sich sonst dort rekursiv
# selbst scaffolden. Zusätzlich ein Rekursions-Guard über eine Env-Marke.
if [ -f .template/lock.json ]; then
  echo "skip: generated consumer app detected via .template/lock.json"
  exit 0
fi
if [ "${SCAFFOLD_GENERATED_APP_CI_RUNNING:-0}" = "1" ]; then
  echo "skip: recursive generated-app CI invocation"
  exit 0
fi
export SCAFFOLD_GENERATED_APP_CI_RUNNING=1
# SKIP_SCAFFOLD_CI ist ein LOKALER Escape-Hatch — in CI (GitHub/GitLab setzen CI=true) NICHT
# honorieren, sonst könnte eine gesetzte Repo-/Gruppen-CI-Variable das Gate still abschalten.
if [ "${SKIP_SCAFFOLD_CI:-0}" = "1" ]; then
  if [ "${CI:-}" = "true" ]; then
    echo "warn: SKIP_SCAFFOLD_CI=1 in CI ignoriert — das Gate läuft trotzdem." >&2
  else
    echo "skip: SKIP_SCAFFOLD_CI=1 (lokaler Escape-Hatch; CI erzwingt es weiterhin)"
    exit 0
  fi
fi

PROFILE="${PROFILE:-core}"
case "$PROFILE" in
  core) CI_PROFILE=core; RUNTIME=0 ;;
  runtime) CI_PROFILE=core; RUNTIME=1 ;;
  full) CI_PROFILE=full; RUNTIME=1 ;;
  *) echo "unknown PROFILE: $PROFILE (expected core|runtime|full)" >&2; exit 1 ;;
esac

REPO_ROOT="$(pwd -P)"

# TMPDIR außerhalb des Repos erzwingen (wie ci-validate.sh) — Scaffold-Ziele dürfen nicht im Checkout liegen.
if [ -z "${TMPDIR:-}" ]; then
  TMPDIR="${REPO_ROOT}/../.tmp-generated-app-ci"
fi
mkdir -p "$TMPDIR"
TMPDIR="$(cd "$TMPDIR" && pwd -P)"
case "$TMPDIR" in
  "$REPO_ROOT" | "$REPO_ROOT"/*)
    echo "TMPDIR muss außerhalb des Repos liegen: $TMPDIR" >&2
    exit 1
    ;;
esac
export TMPDIR

# Prettier-Binary der Vorlage (die generierte App hat noch keine node_modules) — für keine der
# delegierten Schritte nötig, aber ci-setup-node.sh braucht Node/pnpm; das stellt der Aufrufer bereit.

if [ "${MATRIX:-0}" = "1" ]; then
  # Domains, die unterschiedliche Umschreib-Flächen stressen: Bindestrich, Ziffern, Schutzbegriff.
  DOMAINS="beispiel hundesteuer kfz-steuer verwaltung2026 fachverfahren-demo"
else
  DOMAINS="${DOMAIN:-beispiel}"
fi

run_one() {
  domain="$1"
  # Sicheres, kollisionsfreies Zielverzeichnis (mktemp), außer der Aufrufer gibt TARGET explizit vor
  # (z.B. TARGET=/tmp/app-beispiel, um das exakte User-Kommando zu reproduzieren).
  # Unsicher ist ein Ziel, das leer/`/` ist, IM Repo liegt ODER ein VORFAHR des Repos ist — sonst
  # löschte `TARGET=$PWD`, `TARGET=..` oder `TARGET=apps/x` vor jedem Guard Checkout-Inhalte.
  target_is_unsafe() {
    case "$1" in
      "" | "/" | "$REPO_ROOT" | "$REPO_ROOT"/*) return 0 ;;
    esac
    # Vorfahr des Repos? (REPO_ROOT liegt unterhalb von $1)
    case "$REPO_ROOT" in
      "$1"/*) return 0 ;;
    esac
    return 1
  }

  # TARGET auf einen ABSOLUTEN, physischen Pfad auflösen (relativ, `..`, Symlinks), BEVOR geprüft/
  # gelöscht wird — die rohe Zeichenkette allein umginge den Guard (Codex P2).
  resolve_target() {
    _rt_parent="$(dirname -- "$1")"
    _rt_base="$(basename -- "$1")"
    _rt_absparent="$(cd "$_rt_parent" 2>/dev/null && pwd -P)" || return 1
    printf '%s/%s\n' "$_rt_absparent" "$_rt_base"
  }

  if [ -n "${TARGET:-}" ] && [ "${MATRIX:-0}" != "1" ]; then
    target="$(resolve_target "$TARGET")" || {
      echo "refuse: TARGET=$TARGET — Elternverzeichnis existiert nicht" >&2
      return 1
    }
    if target_is_unsafe "$target"; then
      echo "refuse: TARGET=$TARGET (-> $target) ist leer/'/'/im Repo/Repo-Vorfahr — außerhalb des Checkouts wählen" >&2
      return 1
    fi
    rm -rf "$target"
  else
    target="$(mktemp -d "${TMPDIR}/generated-${domain}.XXXXXX")"
  fi

  cleanup_target() {
    [ "${KEEP:-0}" = "1" ] && return 0
    if target_is_unsafe "$1"; then
      echo "refuse to delete unsafe TARGET=$1" >&2
    else
      rm -rf "$1"
    fi
  }

  echo "=================================================================="
  echo "generated-app-ci: domain=${domain} profile=${PROFILE} (CI_PROFILE=${CI_PROFILE})"
  echo "  target=${target}"
  echo "=================================================================="

  # 1) Scaffold — exakt wie der User es tut.
  pnpm run scaffold:domain-app -- --domain "$domain" --target "$target" --allow-dirty --force

  # 2) No-Residue: keine alte Vorlagen-Identität im generierten App (außerhalb der verbatim Engine).
  # `apps/fachverfahren` nur als GANZES Segment werten (gefolgt von Nicht-[-A-Za-z0-9] oder Zeilenende),
  # sonst schlägt eine Domain wie `fachverfahren-demo` fälschlich an (apps/fachverfahren-demo ist korrekt).
  if grep -rIlE "apps/fachverfahren([^-A-Za-z0-9]|$)|@senticor/fachverfahren[\"/]|senticor-app-fachverfahren-template|senticor\.fachverfahren([^-A-Za-z0-9]|$)|app\.kubernetes\.io/part-of: *fachverfahren([^-A-Za-z0-9]|$)" "$target" \
    --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.template --exclude-dir=template 2>/dev/null; then
    echo "generated-app-ci: Residue der Basis-Vorlagen-Identität gefunden (siehe Dateien oben)" >&2
    cleanup_target "$target"
    return 1
  fi
  # 3) Health-Gate im generierten App über DESSEN eigenes ci-validate.sh (Single Source of Truth).
  # WICHTIG: JEDER Schritt trägt `|| exit 1`. Ein Subshell `( … )` als Operand von `||`/`if` schaltet
  # `set -e` INTERN ab (POSIX) — ohne die expliziten `|| exit 1` liefe die Subshell über einen
  # ci-validate-Fehler HINWEG weiter und meldete am Ende fälschlich OK (False Green).
  # Prüfsummen statt Baseline-Commit für die No-Mutation-Prüfung: `cksum` ist POSIX und braucht kein
  # Repo. Das GitLab-Node-Image (registry.opencode.de/open-code/oci/nodejs) hat KEIN `git` installiert.
  snapshot_metadata_files() {
    for f in package.json pnpm-lock.yaml pnpm-workspace.yaml; do
      if [ -f "$f" ]; then
        cksum -- "$f" || exit 1
      fi
    done
  }

  if (
    cd "$target" || exit 1
    baseline="$(snapshot_metadata_files)" || exit 1

    # check:git-hygiene (Teil von check:precommit) erkennt fehlendes `git` selbst (`command -v git`)
    # und überspringt sich dann sauber — ABER nur, wenn es gar nicht erst versucht, `git diff --cached`
    # gegen ein nicht-existentes Repo zu fahren. Ist `git` vorhanden (GitHub-Runner, lokal), braucht es
    # ein echtes Repo mit HEAD, sonst scheitert `git diff --cached` mit "unknown option" statt zu skippen.
    # Daher: Baseline-Commit NUR anlegen, wenn `git` überhaupt da ist; fehlt es (GitLab), bleibt der
    # generierte App absichtlich ohne .git — check:git-hygiene skippt dann über seinen eigenen Guard.
    if command -v git >/dev/null 2>&1; then
      git init -q || exit 1
      git add -A || exit 1
      git -c user.email=ci@example.invalid -c user.name=ci commit -qm "generated baseline" || exit 1
    fi

    pnpm install --frozen-lockfile || exit 1
    CI_PROFILE="$CI_PROFILE" scripts/ci-validate.sh || exit 1

    # 4) No-Mutation: das Gate darf Metadaten/Lockfile nicht still umschreiben.
    after="$(snapshot_metadata_files)" || exit 1
    [ "$baseline" = "$after" ] \
      || { echo "generated-app-ci: Gate hat package.json/pnpm-lock/workspace verändert" >&2; exit 1; }

    # 5) Optionaler Runtime-Smoke (Server bootet, /readyz, Frontend, Secret-Leak).
    if [ "$RUNTIME" = "1" ]; then
      DOMAIN="$domain" sh "${REPO_ROOT}/scripts/smoke-generated-app.sh" || exit 1
    fi
  ); then
    cleanup_target "$target"
    echo "generated-app-ci: domain=${domain} OK ✅"
    return 0
  else
    cleanup_target "$target"
    echo "generated-app-ci: domain=${domain} health gate FAILED ❌" >&2
    return 1
  fi
}

status=0
for d in $DOMAINS; do
  if ! run_one "$d"; then
    status=1
    echo "generated-app-ci: domain=${d} FAILED ❌"
    [ "${MATRIX:-0}" = "1" ] || exit 1
  fi
done
exit "$status"
