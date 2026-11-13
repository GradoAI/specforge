# FASRUN-DEV-CLI

## Archive a delivered specification change

```sh
fasrun spec validate fasrun/
fasrun spec archive fasrun/changes/<work-id>-<description> --date YYYY-MM-DD
fasrun check
```

`--date` is optional and defaults to the current UTC date. `--json` uses the normal
CLI result/error envelope. Archive accepts an active change directory immediately
under the specification root's `changes/` directory.

The archive planner validates the whole specification tree before merging ADDED,
MODIFIED, REMOVED and RENAMED entries in memory, and validates the proposed tree
again. Current capability files must exist. Duplicate additions, missing targets,
rename title mismatches and an existing archive destination fail without writes.
RENAMED keeps the requirement ID and scenarios. This writer supports the D-12 skeleton with one `## Requirements` section. Extra
auxiliary headings are explicitly rejected before writing because this implementation
cannot preserve them during rewriting. Such files may still pass `spec validate`;
validation success does not imply this writer supports every document structure.
Header text in supported current specs and
all change-directory artifacts are retained.

The CLI stages file contents, backs up and replaces affected current spec files,
then moves the complete change directory to
`changes/archive/<UTC-date>-<original-directory-name>/`. A reported write or rename
failure restores previous files and removes temporary artifacts. Symlinks in the
specification tree are rejected. This rollback protects failures during execution;
it is not a crash-recovery journal or a concurrent-edit protocol. Run archive with
exclusive access to the specification directory.

M1 programmatic callers use only `createAuthorizedSpecArchiver` from
`src/lib/spec-archive.ts`. A trusted host fixes the canonical repository location,
repository ID and repository-relative specification root, and supplies an
`ArchiveAuthority` adapter over existing identity/authorization services. Its
`resolveContext` must authenticate and authorize reading that exact repository,
project and spec root before preparation reads any contents. Its `authorize`
resolves the existing immutable authorization record, current revocation and role
state, and applicable scope/capability intersection; it returns a projection bound
to the current context and SHA-256 digest of the complete operation. Neither a
caller-provided JSON record, `true`, nor a system actor grants permission. This is a
trusted host seam, not a new identity system or a sandbox against arbitrary local
code execution; production host binding remains T020 work.

The M1 facade exposes only `prepare(change, date)` and `execute(operation)`.
Preparation uses the existing planner and binds the repository/spec root, active
change, date, ordered writes with full contents, final directory move, and the
complete specification tree (including binary attachments and empty directories).
Execution recomputes that plan and snapshot, checks current authorization, and
rechecks inputs after awaiting authorization, before creating even a staging
file. A denied, revoked, altered or stale operation fails without a fallback.
The original manual `runSpecArchive`/`fasrun spec archive` remains available to M0
human operators with the same parameters, error codes and JSON; it must never be
registered as an M1 agent command or execution port. M1 does not execute repository
shell commands. Both entry points use the same writer and preflight/rollback.
The caller must retain exclusive workspace access throughout: this does not add a
cross-process lock, remove the race with external edits after the last check, or
provide crash recovery. M1 still ends at specification PR confirmation; this seam
does not introduce a full archive business workflow.

SF-1 itself is archived only by its later T020 completion task. T016 supplies and
tests this command against isolated fixtures; it does not archive unfinished work.

## Example dataset (SF-1 T017)

`fasrun seed --dataset xinghe` uses `FASRUN_DATABASE_URL` as `fasrun_app` with
NOBYPASSRLS, and the existing `withOrg` transaction API for every organization.
`FASRUN_ENVIRONMENT` defaults to `development`; `test` and `staging` are also
accepted. `production` is refused before constructing a database connection.
Run `fasrun migrate` separately with the migration role first.

At M0, only `identity.organization` is written. Other prototype entities remain
version-controlled dataset definitions; this command does not create later business
tables. Repeating it leaves unchanged organization rows untouched. Changed example
values update name/slug and the row timestamp/version. The JSON result reports
the dataset and organization count. No credentials or raw database errors are printed.
