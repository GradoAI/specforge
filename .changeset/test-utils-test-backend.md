---
'@fasrun/test-utils': minor
---

Test backend and PostgreSQL helpers (SF-1 T009): `startTestBackend` assembles plugins in memory with mock services, `mockServices` provides config, an assertable logger and a database service, and `@fasrun/test-utils/global-setup` starts PostgreSQL with Testcontainers, creates the fasrun_owner and fasrun_app roles and a template database that `createTestDatabase` clones per test file.
