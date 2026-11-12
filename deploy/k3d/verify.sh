#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
work=$(mktemp -d)
restore_needed=false
cleanup() {
  local code=$?
  if [[ $restore_needed == true ]]; then
    helmc upgrade fasrun "$ROOT/deploy/helm/fasrun" --namespace "$NAMESPACE" --values "$work/restored-values.json" --wait --timeout 5m || code=1
  fi
  if [[ -n ${failure_image:-} ]]; then docker image rm "$failure_image" >/dev/null 2>&1 || true; fi
  rm -rf "$work"
  exit "$code"
}
trap cleanup EXIT
bash "$ROOT/deploy/k3d/up.sh"
node "$ROOT/deploy/k3d/snapshot.mjs" > "$work/before.json"
echo 'TC-PLATFORM-042: deployment, migration, Pods and three readyz checks passed'
# Verify managed roles in the live PostgreSQL catalog, not only rendered YAML.
kube -n "$NAMESPACE" exec fasrun-database-1 -- psql -U postgres -d fasrun -Atc \
  "SELECT rolname||':'||rolbypassrls||':'||rolsuper||':'||rolcreatedb||':'||rolcreaterole FROM pg_roles WHERE rolname IN ('fasrun_owner','fasrun_app') ORDER BY rolname" > "$work/roles"
printf 'fasrun_app:false:false:false:false\nfasrun_owner:true:false:false:false\n' > "$work/expected-roles"
cmp "$work/roles" "$work/expected-roles"
bash "$ROOT/deploy/k3d/up.sh"
node "$ROOT/deploy/k3d/snapshot.mjs" > "$work/after.json"
cmp "$work/before.json" "$work/after.json"
kube -n "$NAMESPACE" logs job/fasrun-migrate > "$work/repeated-migration.json"
node - "$work/repeated-migration.json" <<'NODE'
const r=JSON.parse(require('node:fs').readFileSync(process.argv[2]));
if(!r.ok || r.result.plugins.length !== 9 || r.result.plugins.some(p=>p.migrations.length))throw Error('Expected all nine plugins and zero pending migrations');
NODE
echo 'TC-PLATFORM-043: identical images/configuration, stable Pods/Secrets, zero pending migrations'
# Derive a test-only image. Real migration directories in the checkout remain untouched.
node "$ROOT/deploy/docker/build.mjs" --hash-only > "$work/images.json"
cli=$(node -p 'require(process.argv[1])["fasrun-dev-cli"]' "$work/images.json")
failure_image="fasrun-migration-failure:$(date +%s)-$$"
printf "DO \$\$ BEGIN RAISE EXCEPTION 'TC-PLATFORM-044 intentional migration failure'; END \$\$;\n" > "$work/9999_failure.sql"
docker run --rm "$cli" -e 'process.stdout.write(require("node:fs").readFileSync("/app/plugins/identity/identity-backend/migrations/meta/_journal.json"))' > "$work/_journal.json"
node - "$work/_journal.json" <<'NODE'
const fs=require('node:fs'),path=process.argv[2],j=JSON.parse(fs.readFileSync(path));
j.entries.push({idx:j.entries.length,version:'7',when:Date.now(),tag:'9999_failure',breakpoints:true});
fs.writeFileSync(path,JSON.stringify(j));
NODE
printf 'FROM %s\nCOPY --chown=65532:65532 9999_failure.sql /app/plugins/identity/identity-backend/migrations/9999_failure.sql\nCOPY --chown=65532:65532 _journal.json /app/plugins/identity/identity-backend/migrations/meta/_journal.json\n' "$cli" > "$work/Dockerfile"
docker build --tag "$failure_image" "$work"
k3d image import --cluster fasrun-dev "$failure_image"
helmc get values fasrun --namespace "$NAMESPACE" -o json > "$work/restored-values.json"
cp "$work/restored-values.json" "$work/failed-values.json"
node - "$work/failed-values.json" "$failure_image" <<'NODE'
const fs=require('node:fs'),path=process.argv[2],v=JSON.parse(fs.readFileSync(path));
v.images.cli=process.argv[3];
// If Helm were to update services before migration, changed image refs expose the bug.
for(const name of ['core','connect','portal'])v.images[name]+='-must-not-deploy';
fs.writeFileSync(path,JSON.stringify(v));
NODE
restore_needed=true
failure_started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if helmc upgrade fasrun "$ROOT/deploy/helm/fasrun" --namespace "$NAMESPACE" --values "$work/failed-values.json" --wait --timeout 5m; then
  echo 'Expected failed migration to reject upgrade' >&2; exit 1
fi
kube -n "$NAMESPACE" get job fasrun-migrate -o json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{if(!JSON.parse(s).status.failed)process.exit(1)})'
kube -n "$NAMESPACE" logs job/fasrun-migrate > "$work/failed-migration.json"
node - "$work/failed-migration.json" <<'NODE'
const r=JSON.parse(require('node:fs').readFileSync(process.argv[2]));if(r.ok!==false)throw Error('Migration did not report failure');
NODE
# Prove the SQL reached PostgreSQL: the CLI deliberately sanitizes database errors.
kube -n "$NAMESPACE" logs fasrun-database-1 --container postgres --since-time "$failure_started" > "$work/database-failure.log"
rg_check='TC-PLATFORM-044 intentional migration failure'
grep -F "$rg_check" "$work/database-failure.log" >/dev/null
node "$ROOT/deploy/k3d/snapshot.mjs" > "$work/failed.json"
cmp "$work/before.json" "$work/failed.json"
readyz
echo 'TC-PLATFORM-044: real failing migration rejected upgrade; all service Pods/templates remain unchanged and ready'
# Restore release status with the original values; EXIT also restores if an assertion fails.
helmc upgrade fasrun "$ROOT/deploy/helm/fasrun" --namespace "$NAMESPACE" --values "$work/restored-values.json" --wait --timeout 5m
restore_needed=false
