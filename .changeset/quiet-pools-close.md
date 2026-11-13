---
'@fasrun/test-utils': patch
---

Wait for managed PostgreSQL clients to actually end before test backend shutdown completes, and report cleanup failures without raw driver connection data.
