---
'@fasrun/plugin-connect-backend': patch
---

Use an explicitly expired PostgreSQL timestamp in the outbox retry regression test, preserving all retry and lease assertions without depending on host/database clock alignment.
