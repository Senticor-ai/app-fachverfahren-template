#!/usr/bin/env sh
# codesphere-toolchain.sh — stellt Node 24 + pnpm 11 (via corepack) PERSISTENT unter
# <app>/.local bereit. Nur für Codesphere-Workspaces (ci.yml prepare); im
# GitHub-CI/Docker-Build übernimmt das actions/setup-node bzw. das Dockerfile.
#
# WARUM SO (Erkenntnisse von der Codesphere-Plattform, siehe
# Senticor-ai/infrastructure codesphere-vendorportal/fachverfahren-demo/README.md):
# - Das Base-Image shippt Node v18.5.0 + pnpm 8 (als root-eigene Symlinks in
#   /usr/local/bin): zu alt für pnpm 11/Vite, und `corepack enable` scheitert
#   dort mit EACCES.
# - `nix-env`-Installationen überleben KEINEN Pod-Restart (nur <app> ist
#   persistent) und nix-Node vertraut dem System-CA-Store statt der
#   Node-eigenen Mozilla-Liste (SELF_SIGNED_CERT_IN_CHAIN-Falle).
# - Daher: offizielles Node-Tarball (gebündelte CAs), checksummen-geprüft,
#   nach <app>/.local — untracked, übersteht `git reset --hard` UND Restarts.
#
# Idempotent: bereits passende Installation → sofortiger Exit 0.
#
# Env (bewusst TOOLCHAIN_-präfixiert: das Codesphere-Workspace-Env definiert selbst
# ein NODE_VERSION ohne v-Präfix, das sonst den Default kapert — live passiert):
#   TOOLCHAIN_NODE_VERSION  Default v24.12.0
#   TOOLCHAIN_PNPM_VERSION  Default 11.1.0 (muss zum packageManager-Feld passen)
#   TOOLDIR                 Default $PWD/.local (ci.yml läuft mit cwd=<app>)
set -eu

NODE_VERSION="${TOOLCHAIN_NODE_VERSION:-v24.12.0}"
case "$NODE_VERSION" in v*) ;; *) NODE_VERSION="v$NODE_VERSION" ;; esac
PNPM_VERSION="${TOOLCHAIN_PNPM_VERSION:-11.1.0}"
TOOLDIR="${TOOLDIR:-$PWD/.local}"
NODE_DIR="$TOOLDIR/node24"
export COREPACK_HOME="$TOOLDIR/corepack"

case "$(uname -m)" in
  x86_64) ARCH=x64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *)
    echo "codesphere-toolchain: unsupported arch $(uname -m)" >&2
    exit 1
    ;;
esac
TARBALL="node-${NODE_VERSION}-linux-${ARCH}.tar.xz"

if [ -x "$NODE_DIR/bin/node" ] && [ "$("$NODE_DIR/bin/node" --version)" = "$NODE_VERSION" ] \
  && [ -x "$NODE_DIR/bin/pnpm" ]; then
  echo "codesphere-toolchain: Node $NODE_VERSION + pnpm bereits unter $NODE_DIR — nichts zu tun"
  exit 0
fi

echo "codesphere-toolchain: installiere Node $NODE_VERSION (linux-$ARCH) nach $NODE_DIR"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/${TARBALL}" -o "$workdir/$TARBALL"
curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt" -o "$workdir/SHASUMS256.txt"
(cd "$workdir" && grep " ${TARBALL}\$" SHASUMS256.txt | sha256sum -c -)

rm -rf "$NODE_DIR"
mkdir -p "$NODE_DIR"
tar -xJf "$workdir/$TARBALL" --strip-components=1 -C "$NODE_DIR"

# pnpm über corepack: Cache persistent in COREPACK_HOME, Shim neben node
# (user-writable — im Gegensatz zu /usr/local/bin). PATH-Prefix ist PFLICHT:
# corepack ist ein JS-Launcher mit `#!/usr/bin/env node` und liefe sonst unter
# dem Image-Node 18.5 (Type Error: URL.canParse is not a function — live passiert).
PATH="$NODE_DIR/bin:$PATH" "$NODE_DIR/bin/corepack" prepare "pnpm@${PNPM_VERSION}" --activate
PATH="$NODE_DIR/bin:$PATH" "$NODE_DIR/bin/corepack" enable pnpm --install-directory "$NODE_DIR/bin"

echo "codesphere-toolchain: OK — $("$NODE_DIR/bin/node" --version), pnpm $(PATH="$NODE_DIR/bin:$PATH" pnpm --version)"
echo "codesphere-toolchain: Nutzung in ci.yml-Steps: export PATH=$NODE_DIR/bin:\$PATH COREPACK_HOME=$COREPACK_HOME"
