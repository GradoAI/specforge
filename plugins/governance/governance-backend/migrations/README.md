# Governance persistence

`0000_faithful_ares.sql` and its Drizzle snapshot declare the six owner-managed tables. `0001_governance-integrity.sql` adds FORCE RLS, catalog comments, and immutable-record triggers. Both migrations are forward-only and use the existing migration runner; they do not alter identity or another plugin schema.

The repository receives a non-owner `fasrun_app` pool and sets `fasrun.org_id` transaction-locally. A caller registers an explicitly tenant-bound outbox port; the platform forwards events only through that port. It never discovers tenants or scans this schema. Producer writes, outbox insertion, consumer receipts and consumer business writes share the owner's transaction. Claiming uses SKIP LOCKED; unpredictable lease tokens fence expired workers, and retry timestamps are checked against the database clock. Polling does not depend on NOTIFY.

Policy versions, budget snapshots, audit records, chain checkpoints and consumer receipts reject UPDATE, DELETE and TRUNCATE. The app role cannot disable triggers or truncate tables; the existing migration runner grants ordinary DML and the triggers enforce append-only behavior even with those grants. A database administrator capable of disabling triggers remains outside this guarantee.

Audit append takes a transaction-scoped organization lock and stores the event plus its checkpoint atomically. The checkpoint table is local recovery evidence, **not** the independent reference: the application publishes a head to the separately configured checkpoint store. Verification compares all records to that independent sequence and hash, including empty or truncated copies. A checkpoint publication failure prevents sensitive reads. Repository DTOs contain only public contracts; database rows stay in infrastructure.

Composite uniqueness uses named unique indexes with organization as the leading column. This preserves PostgreSQL `ON CONFLICT (org_id, event_id)` inference and avoids the pinned Drizzle Kit constraint introspector collecting composite UNIQUE columns without ordinal ordering. The schema checker remains unchanged and still compares the complete declared indexes to the live catalog.
