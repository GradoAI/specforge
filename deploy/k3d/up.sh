#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
for command in docker k3d kubectl helm node curl; do command -v "$command" >/dev/null; done
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
umask 077
if ! k3d cluster list -o json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(JSON.parse(s).some(c=>c.name==="fasrun-dev")?0:1))'; then
  k3d cluster create fasrun-dev --api-port 127.0.0.1:6550 --kubeconfig-switch-context=false --image "$K3S_IMAGE" \
    --k3s-arg '--disable=traefik@server:*' --k3s-arg '--disable=servicelb@server:*' --wait
fi
# Reject an existing cluster that exposes additional ports or non-loopback bindings.
node "$ROOT/deploy/k3d/check-ports.mjs"
# Use the named context for every operation; never operate on another current context.
k3d kubeconfig merge fasrun-dev --kubeconfig-switch-context=false >/dev/null
FASRUN_IMAGE_MANIFEST="$work/images.json" node "$ROOT/deploy/docker/build.mjs"
node -e 'for(const image of Object.values(require(process.argv[1])))console.log(image)' "$work/images.json" |
  while IFS= read -r image; do k3d image import --cluster fasrun-dev "$image"; done
# Pin the upstream chart archive as well as its version.
curl --fail --location --retry 3 https://github.com/cloudnative-pg/charts/releases/download/cloudnative-pg-v0.29.1/cloudnative-pg-0.29.1.tgz -o "$work/cnpg.tgz"
node -e 'const fs=require("fs"),c=require("crypto");if(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex")!=="b53d3991fe84bcf38767e7702cae78666265427a127a26fff168ab4207d2b1df")process.exit(1)' "$work/cnpg.tgz"
helmc upgrade --install cnpg "$work/cnpg.tgz" --namespace cnpg-system --create-namespace --wait --timeout 5m
kube wait --for=condition=Established crd/clusters.postgresql.cnpg.io --timeout=120s
kube create namespace "$NAMESPACE" --dry-run=client -o yaml | kube apply -f - >/dev/null
for role in owner app; do
  if ! kube -n "$NAMESPACE" get secret "fasrun-$role" >/dev/null 2>&1; then
    # Passwords never appear in process arguments, Helm values, source files or logs.
    node - "$role" <<'NODE' | kube -n "$NAMESPACE" create -f - >/dev/null
const role = process.argv[2];
const username = `fasrun_${role}`;
const password = require('node:crypto').randomBytes(32).toString('hex');
console.log(JSON.stringify({apiVersion:'v1',kind:'Secret',metadata:{name:`fasrun-${role}`,labels:{"cnpg.io/reload":"true"}},type:'kubernetes.io/basic-auth',stringData:{username,password,uri:`postgresql://${username}:${password}@fasrun-database-rw.fasrun.svc.cluster.local:5432/fasrun`}}));
NODE
  fi
done
helmc upgrade --install fasrun-database "$ROOT/deploy/helm/fasrun-database" --namespace "$NAMESPACE" --wait --timeout 5m
kube -n "$NAMESPACE" wait cluster/fasrun-database --for=condition=Ready --timeout=600s
# Wait for reconciliation of both managed roles before starting the owner hook.
for ((attempt=0; attempt<120; attempt++)); do
  if kube -n "$NAMESPACE" get cluster fasrun-database -o json | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).status.managedRolesStatus?.byStatus?.reconciled??[];process.exit(["fasrun_owner","fasrun_app"].every(x=>r.includes(x))?0:1)})'; then break; fi
  [[ $attempt != 119 ]] || { echo 'Managed roles did not reconcile' >&2; exit 1; }
  sleep 2
done
node - "$work/images.json" "$work/values.json" <<'NODE'
const fs=require('node:fs');const images=JSON.parse(fs.readFileSync(process.argv[2]));
fs.writeFileSync(process.argv[3],JSON.stringify({images:{core:images['fasrun-core-svc'],connect:images['fasrun-connect-svc'],portal:images['fasrun-portal-web'],cli:images['fasrun-dev-cli']}}));
NODE
helmc upgrade --install fasrun "$ROOT/deploy/helm/fasrun" --namespace "$NAMESPACE" --values "$work/values.json" --wait --timeout 5m
kube -n "$NAMESPACE" logs job/fasrun-migrate
wait_pods
readyz
