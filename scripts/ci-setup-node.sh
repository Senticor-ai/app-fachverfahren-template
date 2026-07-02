#!/usr/bin/env sh
set -eu

: "${CI_PROJECT_DIR:=$(pwd)}"
: "${KUBECTL_VERSION:=v1.34.9}"
: "${HELM_VERSION:=v3.15.4}"
: "${KUBECONFORM_VERSION:=v0.6.7}"
: "${CONFTEST_VERSION:=v0.56.0}"
: "${SYFT_VERSION:=v1.20.0}"
: "${TRIVY_VERSION:=v0.72.0}"
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
    printf "HELM_VERSION=%s\n" "${HELM_VERSION}"
    printf "KUBECONFORM_VERSION=%s\n" "${KUBECONFORM_VERSION}"
    printf "CONFTEST_VERSION=%s\n" "${CONFTEST_VERSION}"
    printf "SYFT_VERSION=%s\n" "${SYFT_VERSION}"
    printf "TRIVY_VERSION=%s\n" "${TRIVY_VERSION}"
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

os="$(uname -s | tr "[:upper:]" "[:lower:]")"
case "${os}" in
  linux) title_os="Linux" ;;
  darwin) title_os="Darwin" ;;
  *)
    echo "unsupported tool OS: ${os}" >&2
    exit 1
    ;;
esac
arch="$(uname -m)"
case "${arch}" in
  x86_64 | amd64)
    arch="amd64"
    conftest_arch="x86_64"
    trivy_arch="64bit"
    ;;
  aarch64 | arm64)
    arch="arm64"
    conftest_arch="arm64"
    trivy_arch="ARM64"
    ;;
  *)
    echo "unsupported tool architecture: ${arch}" >&2
    exit 1
    ;;
esac

download_tar_binary() {
  url="$1"
  member="$2"
  binary="$3"
  tmp_archive="${TMPDIR}/${binary}.tar.gz"
  tmp_extract="${TMPDIR}/${binary}-extract"
  rm -rf "${tmp_extract}"
  mkdir -p "${tmp_extract}"
  wget -q -O "${tmp_archive}" "${url}"
  tar -xzf "${tmp_archive}" -C "${tmp_extract}"
  cp "${tmp_extract}/${member}" "${PNPM_HOME}/${binary}"
  chmod +x "${PNPM_HOME}/${binary}"
}

if ! command -v helm >/dev/null 2>&1; then
  download_tar_binary \
    "https://get.helm.sh/helm-${HELM_VERSION}-${os}-${arch}.tar.gz" \
    "${os}-${arch}/helm" \
    "helm"
fi

if ! command -v kubeconform >/dev/null 2>&1; then
  download_tar_binary \
    "https://github.com/yannh/kubeconform/releases/download/${KUBECONFORM_VERSION}/kubeconform-${os}-${arch}.tar.gz" \
    "kubeconform" \
    "kubeconform"
fi

if ! command -v conftest >/dev/null 2>&1; then
  download_tar_binary \
    "https://github.com/open-policy-agent/conftest/releases/download/${CONFTEST_VERSION}/conftest_${CONFTEST_VERSION#v}_${title_os}_${conftest_arch}.tar.gz" \
    "conftest" \
    "conftest"
fi

if ! command -v syft >/dev/null 2>&1; then
  download_tar_binary \
    "https://github.com/anchore/syft/releases/download/${SYFT_VERSION}/syft_${SYFT_VERSION#v}_${os}_${arch}.tar.gz" \
    "syft" \
    "syft"
fi

if ! command -v trivy >/dev/null 2>&1; then
  download_tar_binary \
    "https://github.com/aquasecurity/trivy/releases/download/${TRIVY_VERSION}/trivy_${TRIVY_VERSION#v}_${title_os}-${trivy_arch}.tar.gz" \
    "trivy" \
    "trivy"
fi
