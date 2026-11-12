#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
CONTEXT=k3d-fasrun-dev
NAMESPACE=fasrun
K3S_IMAGE=rancher/k3s:v1.36.4-k3s1
kube() { kubectl --context "$CONTEXT" "$@"; }
helmc() { helm --kube-context "$CONTEXT" "$@"; }
# Completed hook Pods are not long-running workloads and cannot become Ready.
wait_pods() {
  for namespace in kube-system cnpg-system "$NAMESPACE"; do
    kube -n "$namespace" wait pod --all --field-selector=status.phase!=Succeeded --for=condition=Ready --timeout=300s
  done
}
readyz() {
  local service port log pid result
  for service in fasrun-core-svc fasrun-connect-svc fasrun-portal-web; do
    case "$service" in fasrun-core-svc) port=7010;; fasrun-connect-svc) port=7011;; *) port=7013;; esac
    log=$(mktemp)
    kube -n "$NAMESPACE" port-forward --address 127.0.0.1 "service/$service" ":$port" >"$log" 2>&1 &
    pid=$!
    result=1
    for ((attempt=0; attempt<100; attempt++)); do
      local_port=$(sed -nE 's/^Forwarding from 127\.0\.0\.1:([0-9]+).*/\1/p' "$log" | head -1)
      if [[ -n "$local_port" ]] && curl --fail --silent --max-time 5 "http://127.0.0.1:$local_port/readyz" >/dev/null; then result=0; break; fi
      if ! kill -0 "$pid" 2>/dev/null; then break; fi
      sleep 0.2
    done
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    rm -f "$log"
    [[ $result == 0 ]] || { echo "$service /readyz failed" >&2; return 1; }
    echo "$service /readyz: 200"
  done
}
