# Migration checks (SF-1 T013 / D-9)

From the repository root, after `pnpm install --frozen-lockfile`:

```sh
pnpm --filter @fasrun/migration-check... build
pnpm --dir tools/migration-check check
```

Docker is required. The command starts a disposable PostgreSQL 18 container, provisions `fasrun_owner` / `fasrun_app`, invokes the real `fasrun migrate` CLI, inspects it, and removes the container. It never connects to the application's configured database. It returns nonzero on any issue, including missing tools, migration failure, introspection error, malformed diff output or timeout. Squawk, Drizzle and catalog stages aggregate their diagnostics; an SQL lint failure does not skip the database checks.

On Colima, export `DOCKER_HOST` and `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE` as required by your local setup. For whole-repository tests, the standard Turbo entry currently filters these variables; the separate `--env-mode=loose` run is an alternative, not a fix for the outstanding environment issue tracked in issue #17.

## Scope and diagnostics

Host package manifests define the plugin schemas. Every SQL migration is linted, including files that a malformed journal would fail to register. Schema modules at `plugins/<name>/<name>-backend/src/infrastructure/schema/index.ts` are bundled before checking. Missing bundles fail if source exists. Declarations may export `tableExceptions: Record<tableName, { appendOnly?: boolean; platform?: boolean }>` beside the table; unknown table names, keys or nonboolean flags fail. These D-9 exceptions affect only the documented standard-column/RLS rules.

Only the two exact names `schema_migration` and `base_data_sync` inside manifest plugin schemas are separated from business Drizzle/convention checks. Each is independently required and checked for complete columns, built-in PostgreSQL types (domains cannot impersonate them), non-nullability, exact primary key, owner and effective `fasrun_app` privileges. This includes PUBLIC, inherited roles, column grants and PostgreSQL 18 MAINTAIN. Diagnostics point to `packages/backend-defaults/src/migrate.ts`. Every other actual table is included in Drizzle diff and business checks; undeclared tables fail and identify the absence of a creating migration. Known tables point to their creating SQL file.

Business checks inspect pg_catalog, not SQL text: standard columns, types, comments, key/index names, exact ID format constraint, ENABLE/FORCE RLS and organization policy. SQL string literals are preserved during normalization. Additional permissive policies must not weaken the organization boundary.

## Pinned tools and narrow compatibility handling

- [Squawk 2.71.0](https://github.com/sbdchd/squawk/releases/tag/v2.71.0), released 2026-10-29, Apache-2.0 OR MIT, free CLI. `prepare.mjs` verifies official macOS arm64 / Linux x64 SHA256 assets. [CLI documentation](https://squawkhq.com/docs/cli/). `--assume-in-transaction` matches D-8's atomic per-file execution and correctly permits an index on a table newly created in the same transaction. Existing-table nonconcurrent indexes still fail (TC-PLATFORM-028).
- `.squawk.toml` documents exclusions: D-7 explicitly requires integer versions; D-8 provides journal-based repeatability; existing immutable M0 migrations predate a specified lock/statement timeout policy. Timeout-setting recommendations are excluded, not claimed fixed. Unsafe operation rules remain enabled. No historical migration hash is rewritten.
- [drizzle-kit 0.31.9](https://www.npmjs.com/package/drizzle-kit/v/0.31.9), released 2026-02-09, MIT. The isolated `runtime/package-lock.json` pins its complete dependency tree; installation uses `npm ci --ignore-scripts`, without changing workspace `allowBuilds`. All existing workspace dependencies retain their pinned versions. `prepare.mjs` caches installation against the lock digest and verifies the Squawk binary on every run.
- [Drizzle push](https://orm.drizzle.team/docs/drizzle-kit-push) introspects actual tables and computes the SQL difference. We use the API's `statementsToExecute`, never `apply`, in a PostgreSQL read-only transaction. A separate worker has a 30-second deadline so unexpected upstream interactive rename prompts fail instead of hanging CI.
- The fixed 0.31.9 API drops `params` before executing introspection SQL (its composite-primary-key query uses `$1` / `$2`). `prepare.mjs` checks the unique exact PostgreSQL `pushSchema` source section and changes only its query adapter to `pg.Client.query(query, params)`. Upstream source mismatch fails installation; the original package file is unchanged and the derived adapter is regenerated identically.
- 0.31.9 also represents named single-column primary keys differently in database snapshots and explicit Drizzle declarations. The worker removes only a paired DROP/ADD whose exact constraint name and ordered columns match the actual ordinary nondeferrable pg_catalog key. It preserves every other statement. Actual renamed keys, changed key columns and missing business columns fail; a real undeclared composite-key table exercises parameter forwarding and exact internal-table filtering.

## Verification / traceability

`pnpm --dir tools/migration-check test` prepares tools and runs unit plus real PostgreSQL integration tests. TC-PLATFORM-028 tests Squawk's unsafe index diagnostic; 029 covers catalog violations and policy bypasses; 030 covers missing columns and primary-key drift without applying suggestions; 031 checks the real nine-plugin migration baseline and all 18 executor tables; 068 covers missing/altered internal tables, strict types, owner, effective grants and undeclared tables. Fixtures are created only in test-owned databases or temporary SQL files.

The `migration-check` CI job runs for PRs, main pushes and merge groups. After the PR and merge-group checks pass, PontusAI should add the `migration-check` check context to protect-main; this task does not modify branch protection or approve/merge itself.
