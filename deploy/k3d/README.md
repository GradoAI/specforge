# Local Kubernetes deployment (SF-1 T019)

Run `bash deploy/k3d/up.sh` with Docker, Node 24, Helm, k3d, kubectl and curl
available. The script creates `fasrun-dev` when absent, builds the T018 images
with content-derived tags, imports them, and installs three releases in order:
`cnpg` in `cnpg-system`, then `fasrun-database` and `fasrun` in `fasrun`.
It waits for CloudNativePG, the single PostgreSQL instance and managed roles
before running the application's pre-install/pre-upgrade migration hook.

Only the Kubernetes API is published, on `127.0.0.1:6550`; no application or
Ingress ports are mapped. Existing clusters with additional/non-loopback
published ports are rejected. Every kubectl/Helm operation names the
`k3d-fasrun-dev` context and does not change your current context. Service checks
use temporary `kubectl port-forward --address 127.0.0.1` processes and remove
them afterwards. For manual access, use the same binding, for example:

```sh
kubectl --context k3d-fasrun-dev -n fasrun port-forward --address 127.0.0.1 service/fasrun-portal-web 7013:7013
```

Owner and application credentials are generated with Node's cryptographic random
source and sent to Kubernetes through stdin. They are never committed, logged,
or passed in arguments or Helm values. Existing Secrets are reused; running
`up.sh` again does not rotate passwords. Secrets contain basic-auth username and
password plus a `uri` key; only the migration hook receives the owner URI.
No timestamp, random checksum or release revision changes a workload template.
The successful hook Job is retained for inspection and replaced by the next
upgrade; it is not a long-running service Pod.

## Acceptance

`bash deploy/k3d/verify.sh` runs the real cluster acceptance (TC-PLATFORM-042–044):

- Deploy and check the successful migration, all workload Pods and the three
  `/readyz` endpoints. Query the live PostgreSQL role catalog to verify owner
  BYPASSRLS, app NOBYPASSRLS, and neither role being superuser/createdb/createrole.
- Repeat the complete deployment. Compare Pod UIDs, image references,
  Deployment templates and credential hashes; require all nine plugin reports
  to have zero newly executed migrations.
- Build a temporary derivative of the CLI image with an intentionally failing
  SQL migration. Attempt an upgrade with that image and changed service image
  references, assert rejection and unchanged running service Pods/templates,
  then check their readiness. Restore a successful release using the original
  images. No repository migration or business table is altered by the fixture.

The script leaves the development cluster running. CI uses a disposable runner
and removes that cluster after collecting logs. Delete a local development
cluster only when its database is no longer needed:
`k3d cluster delete fasrun-dev`.

## Pinned tools

The Linux amd64 CI installer `install-tools.sh [bin-directory]` downloads
archives/binaries and verifies committed SHA256 values before installation; no
remote installer script is executed. Its default is `$HOME/.local/bin`.
On Actions it appends the directory to `GITHUB_PATH`.

| Tool    | Version     | Upstream release date | License    |
| ------- | ----------- | --------------------- | ---------- |
| Helm    | 3.15.3      | 2024-07-10            | Apache-2.0 |
| k3d     | 5.9.0       | 2026-06-02            | MIT        |
| kubectl | 1.36.1      | 2026-05-12            | Apache-2.0 |
| k3s     | 1.36.4-k3s1 | 2026-08-27            | Apache-2.0 |

All pins predate this change by more than seven days. k3s is explicitly pinned
in `common.sh`; it does not follow the installed k3d binary's default.
CloudNativePG and PostgreSQL pins and licenses are documented in
[the Helm README](../helm/README.md).

Sources: [Helm release](https://github.com/helm/helm/releases/tag/v3.15.3),
[Helm checksum](https://get.helm.sh/helm-v3.15.3-linux-amd64.tar.gz.sha256sum),
[k3d release/checksums](https://github.com/k3d-io/k3d/releases/tag/v5.9.0),
[kubectl release](https://github.com/kubernetes/kubernetes/releases/tag/v1.36.1),
[kubectl checksum](https://dl.k8s.io/release/v1.36.1/bin/linux/amd64/kubectl.sha256),
[k3s release](https://github.com/k3s-io/k3s/releases/tag/v1.36.4%2Bk3s1).
