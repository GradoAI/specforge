# SF-1 Helm deployment

D-18 / R-platform-014 / T019 uses three releases in order:

1. Upstream `cloudnative-pg` operator in `cnpg-system`.
2. `fasrun-database` in `fasrun`: one PostgreSQL instance and only the Fasrun application database.
3. `fasrun` in `fasrun`: three services and the blocking migration hook.

`deploy/k3d/up.sh` drives this sequence. The database must be ready, including
managed-role reconciliation, before installing the application release. The
`fasrun_owner` role owns the database, has BYPASSRLS, and runs migrations;
`fasrun_app` has NOBYPASSRLS and supplies the core service. Both are LOGIN roles
with no superuser, CREATEDB, CREATEROLE, REPLICATION or inherited privileges.
CloudNativePG still maintains its required internal administrative roles and
PostgreSQL template databases; those are not additional application databases.

Before installing either local chart, provision `fasrun-owner` and `fasrun-app`
Secrets in the `fasrun` namespace. Each has type `kubernetes.io/basic-auth`, label
`cnpg.io/reload: "true"`, and `username`, `password`, `uri` keys. Usernames must
match the role names. The URI uses the matching role, database `fasrun`, and host
`fasrun-database-rw.fasrun.svc.cluster.local`. Credentials are generated at deploy
time and reused on subsequent runs. Charts only reference Secrets; no password,
random template output, timestamps or Helm revision enters a Pod template.

Supply `images.core`, `images.connect`, `images.portal` and `images.cli` as full
immutable references from the Docker build manifest. Defaults intentionally point
to unconfigured tags. ClusterIP services expose ports 7010, 7011 and 7013 inside
the cluster; local access uses loopback-only port forwarding. Liveness probes use
`/healthz`, readiness probes `/readyz`. Runtime UID/GID remains 65532.

The `fasrun-migrate` Job runs `bin/run.js migrate --json` using the owner's URI.
The `pre-install,pre-upgrade` hook blocks Helm before Deployment changes. A failing
migration stops the upgrade, with no Job retry; its logs are retained for diagnosis.
The next attempt deletes the preceding hook Job before creating a new one.
`keycloak`, `observability`, `tokenHub` and `backup` values are reserved, default
`enabled: false`, and have no templates in M0.

## Pins and upstream evidence

- CNPG operator chart **0.29.1**, operator **1.30.1**, published **2026-09-23**:
  [official chart index](https://cloudnative-pg.io/charts/index.yaml),
  [release](https://github.com/cloudnative-pg/charts/releases/tag/cloudnative-pg-v0.29.1).
  Archive SHA256: `b53d3991fe84bcf38767e7702cae78666265427a127a26fff168ab4207d2b1df`.
  Chart and operator are free Apache-2.0 software.
- PostgreSQL **18.3 minimal trixie**: the chart pins the multi-architecture digest
  `sha256:8d3183ef537b17efbb2e6e6665852a7c0d8dc4a3f3b91c11f0e8a2d056799880`.
  Both architecture configs identify build date **2026-05-11**, upstream revision
  `a855a9ec4c0685169e39222854b442ec236071ea`. Image build definitions are
  [Apache-2.0](https://github.com/cloudnative-pg/postgres-containers), PostgreSQL is
  distributed under the free [PostgreSQL License](https://www.postgresql.org/about/licence/).
  Both selections are older than seven days as of 2026-11-12.
- [CNPG bootstrap](https://cloudnative-pg.io/docs/1.30/bootstrap/) and
  [managed roles](https://cloudnative-pg.io/docs/1.30/declarative_role_management/)
  document the existing basic-auth Secret references and managed privilege fields.
- [Helm hooks](https://helm.sh/docs/topics/charts_hooks/) define blocking Job hooks
  before normal resources are updated.

## Static checks

```sh
helm lint deploy/helm/fasrun deploy/helm/fasrun-database
node --test deploy/helm/verify.test.mjs
```

The tests parse rendered YAML and check role boundaries, service probes, internal
ports, deterministic rendering and migration hook structure. They supplement the
real k3d acceptance cases TC-PLATFORM-042/043/044; they do not claim cluster runtime
or migration failure isolation by static rendering alone. Templates use `.tpl`
extensions because Helm syntax is not raw YAML and must not be reformatted by a
plain YAML formatter.
