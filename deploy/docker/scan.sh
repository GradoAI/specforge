#!/usr/bin/env bash
set -euo pipefail
# Trivy must be installed by the caller at the pinned version documented in README.md.
out="${1:?usage: scan.sh output-directory image-manifest.json}"
manifest="${2:?image manifest is required}"
mkdir -p "$out"
images=$(mktemp)
trap 'rm -f "$images"' EXIT
node --input-type=module - "$manifest" > "$images" <<'NODE'
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const app of ['fasrun-core-svc', 'fasrun-connect-svc', 'fasrun-portal-web', 'fasrun-dev-cli']) {
  const image = manifest[app];
  if (typeof image !== 'string' || !image.match(new RegExp(`^${app}:[a-f0-9]{64}$`))) {
    throw new Error(`Missing or invalid image reference: ${app}`);
  }
  console.log(image);
}
NODE
failed=0
trivy fs --include-dev-deps --scanners vuln --severity CRITICAL --exit-code 1 --skip-dirs node_modules --skip-dirs .git . || failed=1
trivy fs --include-dev-deps --format cyclonedx --scanners vuln --skip-dirs node_modules --skip-dirs .git --output "$out/dependencies.cdx.json" . || failed=1
while IFS= read -r image; do
  name="${image%%:*}"
  trivy image --scanners vuln --severity CRITICAL --exit-code 1 "$image" || failed=1
  trivy image --format cyclonedx --scanners vuln --output "$out/$name.cdx.json" "$image" || failed=1
done < "$images"
exit "$failed"
