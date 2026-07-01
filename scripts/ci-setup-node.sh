#!/usr/bin/env sh
set -eu

: "${CI_PROJECT_DIR:=$(pwd)}"
: "${KUBECTL_VERSION:=v1.34.9}"
: "${PNPM_HOME:=${CI_PROJECT_DIR}/.pnpm}"

if [ -z "${TMPDIR:-}" ]; then
  TMPDIR="${CI_PROJECT_DIR}/../.tmp-senticor-app-fachverfahren-template"
  export TMPDIR
fi

export PNPM_HOME
export PATH="${PNPM_HOME}:${PATH}"

mkdir -p "${PNPM_HOME}" "${TMPDIR}"
chmod 700 "${TMPDIR}"

if [ -n "${GITHUB_PATH:-}" ]; then
  printf "%s\n" "${PNPM_HOME}" >>"${GITHUB_PATH}"
fi

if [ -n "${GITHUB_ENV:-}" ]; then
  {
    printf "CI_PROJECT_DIR=%s\n" "${CI_PROJECT_DIR}"
    printf "KUBECTL_VERSION=%s\n" "${KUBECTL_VERSION}"
    printf "PNPM_HOME=%s\n" "${PNPM_HOME}"
    printf "TMPDIR=%s\n" "${TMPDIR}"
  } >>"${GITHUB_ENV}"
fi

corepack enable --install-directory "${PNPM_HOME}" pnpm
corepack prepare "pnpm@11.1.0" --activate

if ! command -v kubectl >/dev/null 2>&1; then
  os="$(uname -s | tr "[:upper:]" "[:lower:]")"
  arch="$(uname -m)"
  case "${arch}" in
    x86_64 | amd64) arch="amd64" ;;
    aarch64 | arm64) arch="arm64" ;;
    *)
      echo "unsupported kubectl architecture: ${arch}" >&2
      exit 1
      ;;
  esac

  kubectl_url="https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/${os}/${arch}/kubectl"
  wget -q -O "${PNPM_HOME}/kubectl" "${kubectl_url}"
  checksum="$(wget -q -O - "${kubectl_url}.sha256")"
  printf "%s  %s\n" "${checksum}" "${PNPM_HOME}/kubectl" | sha256sum -c -
  chmod +x "${PNPM_HOME}/kubectl"
fi
