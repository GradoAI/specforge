#!/usr/bin/env bash
set -euo pipefail
# CI-only Linux amd64 installer; no upstream installer scripts are executed.
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'Requires Linux amd64' >&2; exit 2; }
destination=${1:-"$HOME/.local/bin"}
mkdir -p "$destination"
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
fetch() {
  curl --fail --location --retry 3 "$1" -o "$temporary/$2"
  (cd "$temporary" && printf '%s  %s\n' "$3" "$2" | sha256sum --check --status)
}
fetch https://get.helm.sh/helm-v3.15.3-linux-amd64.tar.gz helm.tgz ad871aecb0c9fd96aa6702f6b79e87556c8998c2e714a4959bf71ee31282ac9c
tar -xzf "$temporary/helm.tgz" -C "$temporary" linux-amd64/helm
install -m 0755 "$temporary/linux-amd64/helm" "$destination/helm"
fetch https://github.com/k3d-io/k3d/releases/download/v5.9.0/k3d-linux-amd64 k3d 06d8f25bc3a971c4eb29e0ff08429b180402db0f4dec838c9eac427e296800a0
install -m 0755 "$temporary/k3d" "$destination/k3d"
fetch https://dl.k8s.io/release/v1.36.1/bin/linux/amd64/kubectl kubectl 629d3f410e09bf49b64ae7079f7f0bda1191efed311f7d37fdbab0ad5b0ec2b7
install -m 0755 "$temporary/kubectl" "$destination/kubectl"

if [[ -n ${GITHUB_PATH:-} ]]; then printf '%s\n' "$destination" >> "$GITHUB_PATH"; fi
