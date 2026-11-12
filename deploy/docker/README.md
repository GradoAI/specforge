# SF-1 container images (T018)

D-17 / R-platform-013: four production images use a Node 24 Bookworm builder,
`pnpm install --frozen-lockfile`, dependency-ordered builds, `pnpm deploy --prod`,
and the Node 24 distroless nonroot runtime (UID/GID 65532). Production exports
contain application build output and production dependencies. The CLI additionally
carries the core/connect host manifests and each registered backend's migration
directory, which T012 discovers from `/app` without starting a service.

Run `node deploy/docker/build.mjs` from a checkout. Set
`FASRUN_BUILD_PLATFORM=linux/amd64` or `linux/arm64` explicitly for cross builds.
An optional image name builds only that image. `--hash-only` prints the image
references without building. `FASRUN_IMAGE_MANIFEST=/absolute/path/images.json`
writes the same map for scanning and later Helm/k3d consumers.

Tags hash the exact source context and target platform, including pinned base
image digests and Dockerfiles. Git commit IDs, timestamps, local dependencies,
build output and credentials are not inputs. Build context is exported from
tracked/unignored repository input files; it never uploads the complete checkout.
The same source input produces the same tag. Base updates change the tag.
All four tags deliberately share a workspace hash, so cross-package changes
cannot leave an image pointing at stale workspace dependencies.

Service images listen on `0.0.0.0` inside the container. Publish local ports only
on loopback, e.g. `-p 127.0.0.1:7013:7013` for the portal. The CLI entrypoint is
Node; invoke migration with `docker run --rm --env FASRUN_MIGRATE_DATABASE_URL
<cli-image> bin/run.js migrate`. Supply the owner URL through the environment,
never a Dockerfile, build argument or committed file.

For an initialized development or test database, the same CLI image supports
`docker run --rm --env FASRUN_DATABASE_URL --env FASRUN_ENVIRONMENT <cli-image>
bin/run.js seed --dataset xinghe`. Set `FASRUN_DATABASE_URL` to the application-role
connection and `FASRUN_ENVIRONMENT` explicitly to `development` or `test`; never
reuse the migration owner connection for seed. Seed refuses `production` and
repeated runs preserve unchanged organization rows. Supply a Docker network when
the database is another container. The image's `NODE_ENV=production` controls the
Node runtime; the CLI's deployment guard reads `FASRUN_ENVIRONMENT`.

Core requires `FASRUN_CORE_DATABASE_URL` and listens on port 7010. Connect requires
`FASRUN_CONNECT_CORE_URL` and listens on 7011; portal listens on 7013. Use container
DNS and internal ports between services, and loopback-only published ports for
local access. All three expose `/readyz`.

## Scanner and provenance

Trivy 0.76.1 (2026-10-21, Apache-2.0) is pinned by version and release archive
SHA256 in CI. No scanner installer scripts are executed. The `trivy` job runs
for PR, merge group and main. `bash deploy/docker/scan.sh <output-dir>
<image-manifest.json>` scans workspace dependencies and every production image.
Any CRITICAL vulnerability or scanner failure fails the gate. There is no
`--ignore-unfixed`, ignore list or severity exemption. CycloneDX reports are
uploaded even when scanning finds vulnerabilities. No images are pushed by CI.

Upstream references:

- https://github.com/nodejs/docker-node (official Node image)
- https://github.com/GoogleContainerTools/distroless (Apache-2.0 image definitions)
- https://pnpm.io/cli/deploy (pnpm 12.16.1, MIT, existing repository pin)
- https://github.com/aquasecurity/trivy/releases/tag/v0.76.1
- https://github.com/aquasecurity/trivy/releases/download/v0.76.1/trivy_0.76.1_checksums.txt

## Runtime identity acceptance

After building, run `node deploy/docker/verify-runtime.mjs <image-manifest.json>`.
TC-PLATFORM-041 checks all four final production images: Config.User must be
non-root, and the image's own Node executable must report UID 65532. CI executes
this check against the images it subsequently scans. This implements the approved
#41 clarification; no debug image or added operating-system utility is used.
