# Agent invocation boundary

`createAgentServices` binds the orchestration-owned pool, current authorization adapter,
T010 data service, versioned step resolver and explicitly configured implementations.
T020 owns real host assembly. This service does not draft specifications itself, approve
reviews, mutate plans or implement a durable workflow runtime.

A call is identified by organization, callId and attempt. The canonical request must
match on retry. Each attempt persists the implementation mode/version, selected step
version and first effective deadline (the earlier of the caller deadline and the
registered step timeout). Retries, polling and process restart do not reset that budget.
Terminal results and earlier attempts remain immutable. Current authorization is checked
even when reading an already completed result. Implementation/version drift fails closed.

The selected step input schema validates the input-reference array. Each referenced
value is also resolved through the actual current-authority T010 read boundary. Output
is projected to the registered schema, fully validated, and stored through T010 as an
untrusted reference. Returned references are resolved and included in the provenance
inputs, so their scopes, classification and excluded channels cannot be discarded.
Only the strictly boolean `replanRequested` is a control request. Explanation or approval
prose belongs to declared output data and remains untrusted; it is never a plan or an
approval command. Stripping audits contain fixed control names and a count, not arbitrary
agent-controlled field names or values.

The transport contract requires idempotent invoke/cancel for callId+attempt. Durable
result CAS does not make a remote operation atomic with a database transaction and does
not provide exactly-once remote dispatch. An invocation rechecks the persisted state
after polling so a cancellation committed during that poll prevents dispatch. A cancel
racing a remote operation cannot undo an already started effect; late results cannot
replace a terminal result or a newer attempt. The actual transport must honor cancellation
and idempotency using those same identifiers. No shell/executor/model adapter is supplied.

Controlled implementations require explicit enablement in `test` or `validation` mode;
production rejects their registration. The tests reuse the two delivered T004 fixtures
through the persistent invoker and record their version/mode. A missing implementation
fails instead of silently using a fixture. This is simulated agent evidence over a real
PostgreSQL control boundary, not evidence of real automatic drafting or GitHub/Keycloak
end-to-end acceptance.
