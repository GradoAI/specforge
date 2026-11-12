import { createHash } from 'node:crypto';
import type { AuditEvent } from '@fasrun/plugin-governance-common';
export const GENESIS_HASH = '0'.repeat(64);
/** Sorted object keys and JSON values produce a stable, unambiguous digest input. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const result = JSON.stringify(value);
    if (result === undefined) throw new Error('Non JSON audit value');
    return result;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}
export function auditHash(previousHash: string, event: AuditEvent): string {
  return createHash('sha256').update(canonicalJson({ previousHash, event })).digest('hex');
}
