/** Cursor-based page request; `cursor` is opaque to clients. */
export interface PageRequest {
  limit: number;
  cursor?: string;
}

/** One page of results; `nextCursor` is absent on the last page. */
export interface Page<T> {
  items: readonly T[];
  nextCursor?: string;
}

/** Who did what, on behalf of which organisation, written into every audit record. */
export interface AuditContext {
  orgId: string;
  /** Member, service account or agent identity that performed the action. */
  actorId: string;
  requestId: string;
  /** Set when the action went through the assistant (tech plan 2.19). */
  viaAssistant?: boolean;
}
