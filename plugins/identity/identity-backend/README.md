# Identity owner service (SF-5 T006)

`createIdentityServices` binds the identity repository to its own PostgreSQL pool and exposes `identityServiceRef`, concrete configuration operations and a tenant-bound outbox. T020 installs these factories in CORE; this package does not open a database or change the existing status host automatically. Entry adapters use the shared service for HTTP/MCP authentication and authorization, never a caller plugin's database.

The trusted host supplies issuer/audience/client configuration, current object relationships, governance policy checks, admission evidence and audit delivery. These facts must come from owner services, not request bodies or agent claims. Browser login uses Keycloak's authorization-code flow with PKCE, one-use browser-bound state, nonce, server-side session digests, secure cookies and Origin/CSRF checks. The requested organization is checked against the verified `(issuer, subject)` membership. Account links use immutable external IDs; unresolved events remain queryable for authorized association and replay.

The 14-role matrix is versioned base data (`identityBaseData`) with organization customizations preserved. Effective-permission queries return conditions awaiting current-object evaluation. Each action rechecks current member state, roles, rules, scope and revocation. Authorization snapshots are immutable; revocations are separate records. Mutations and their audit delivery intents commit together in the identity outbox. The host must connect `governance.audit.requested` to the governance consumer; no successful mutation relies on a fallible post-commit audit call.

M1 internal agents retain a distinct `actorId`. The trusted `agentIdentity` resolver must bind that actor to an existing authorization and its original triggering member. Current member permissions, the persisted task authorization, project permissions and environment permissions all constrain the decision; agents cannot approve. No resolver, mismatched actor/member/authorization, revoked authorization or expanded scope fails closed. This is an internal control-plane invocation contract; signed M2 node authentication and the T020 host binding are separate tasks.

Credentials are never audit payloads. Adapter errors are replaced by fixed public errors; audit diagnostics include only bounded identifiers/reasons. The host remains responsible for supplying trusted adapters and for secret redaction in its own diagnostics. The test suites use ephemeral dedicated credentials, never personal Keycloak or model accounts.

## Verification boundaries

`identity-common` independently compares the approved 2.17 matrix fixture and tests duties, scope, dynamic conditions and agent restrictions. Backend unit tests exercise real RSA JWT validation against a loopback JWKS endpoint, including key rotation and rejection. Backend integration tests use real PostgreSQL and a real dedicated Keycloak container. Governance/admission/object-fact ports are controlled test inputs; these component suites are not the T024 external acceptance environment. Application line coverage must be at least 80% and permission/validation branch coverage at least 90%.

On Colima, the direct package entry requires `DOCKER_HOST`, `TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE` and `TESTCONTAINERS_HOST_OVERRIDE` to be forwarded. A direct Vitest pass does not prove that the repository's Turborepo standard entry forwards these variables; the existing #17 environment limitation remains separate.

## Dependency evidence

- `jose` 6.2.15, MIT, released 2026-11-01 (npm registry timestamp `2026-11-01T22:28:55.912Z`): [official changelog](https://github.com/panva/jose/blob/v6.2.15/CHANGELOG.md), [license](https://github.com/panva/jose/blob/v6.2.15/LICENSE.md), [registry metadata](https://registry.npmjs.org/jose).
- Integration fixture image `quay.io/keycloak/keycloak:26.8.2`, Apache-2.0, released 2026-11-05: [official release](https://www.keycloak.org/2026/11/keycloak-2682-released), [license](https://github.com/keycloak/keycloak/blob/26.8.2/LICENSE.txt). This is a test image; no production deployment image changes here.
- `testcontainers` 12.2.1 reuses the already locked test infrastructure version. New packages are free/open source and the two newly selected versions were older than seven days at selection (2026-11-13).
