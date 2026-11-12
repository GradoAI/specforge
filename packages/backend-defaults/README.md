# Backend defaults

## Migrations (SF-1 T012 / D-8)

`migrateDatabase({ connectionString, plugins })` runs an ordered `MigrationPlugin[]` using a dedicated
`fasrun_owner` connection with BYPASSRLS. Each descriptor supplies `schema`, `migrationsDirectory`, and
optional `baseData: BaseDataDefinition[]`. The caller can pass a plugin's exported versioned definitions.
The executor holds a session advisory lock until migrations and base data synchronization finish.

Each schema owns `schema_migration` (filename, SHA-256 content hash, execution timestamp) and
`base_data_sync` (definition key, version, synchronization timestamp). These metadata tables are private
to the owner; `fasrun_app` receives schema usage and business-table DML privileges, including default
privileges for future tables. Plugins do not embed grants in migration SQL.

Migrations follow `meta/_journal.json`, one file per transaction. Applied files cannot change or disappear,
and unapplied files cannot be inserted ahead of applied history. Unregistered SQL fails closed. A failed
file rolls back; earlier commits remain. Base data runs only after every plugin migration succeeds.
Empty scaffold migration directories are supported; missing directories and malformed journals fail.

A definition is `{ key, version, table, keyColumn, rows, customizableColumns }`. Version is a positive
integer and must increase to synchronize changed definitions. Unchanged versions are skipped. Table and
column names are local SQL identifiers, not schema-qualified names. Rows are parameterized SQL values;
`keyColumn` must have a unique constraint. Only supplied keys are upserted; other rows are left untouched.
Fasrun-managed columns update on conflict. Customizable columns update only when the existing row has
`is_customized = false`; the synchronization never resets that marker. Each definition and its version
record commit atomically. Tests demonstrate this with a test-only catalog in `@fasrun/test-utils`.

The CLI reads optional `migrations/base-data.json` arrays as the on-disk representation of these exported
definitions. This allows packaged plugins to supply base data without starting their backend services.
No production plugin has example base-data tables. Production plugins may also pass typed definitions
directly to the library API.

```sh
FASRUN_MIGRATE_DATABASE_URL='postgresql://fasrun_owner:REPLACE_ME@127.0.0.1:5432/fasrun' \
  fasrun migrate --root /path/to/fasrun --json
```

The CLI reads the core/connect host dependency manifests, deduplicates and sorts backend plugin package
names, then uses each `plugins/<name>/<name>-backend/migrations` directory. The distribution must include
those host manifests and migration assets; `--root` defaults to the working directory. The JSON result
lists applied migrations and synchronized definitions per schema. Without `--json`, an empty migration
run prints `没有待执行的迁移`. Missing database input exits 2, invalid configuration/authentication 3,
unreachable database 4, and migration errors 5. Database URLs and raw SQL are not printed on failures.
