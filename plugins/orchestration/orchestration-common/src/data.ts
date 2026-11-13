import { createHash } from 'node:crypto';
import { dataLabelsSchema, type DataLabels, type DataReference, type Scope } from '@fasrun/contracts-core';

export function canonicalData(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalData).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalData(record[key])}`)
      .join(',')}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error('Invalid canonical data');
  return result;
}
export function containsScope(grant: Scope, requested: Scope): boolean {
  return (
    grant.orgId === requested.orgId &&
    (grant.teamId === undefined || grant.teamId === requested.teamId) &&
    (grant.projectId === undefined || grant.projectId === requested.projectId)
  );
}
export function normalizeLabels(input: DataLabels): DataLabels {
  const labels = dataLabelsSchema.parse(input);
  const scopes = new Map(labels.readScopes.map((scope) => [canonicalData(scope), scope]));
  return {
    ...labels,
    readScopes: [...scopes.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, scope]) => scope),
    excludedChannels: [...new Set(labels.excludedChannels)].sort(),
  };
}
export function referenceVersion(contentHash: string, labels: DataLabels): string {
  if (!/^[a-f0-9]{64}$/.test(contentHash)) throw new Error('Invalid content digest');
  return createHash('sha256')
    .update(canonicalData({ contentHash, labels: normalizeLabels(labels) }))
    .digest('hex');
}
/** No caller-supplied trust upgrade. Exclusions and read restrictions cannot be dropped by a derived result. */
export function derivedLabels(
  requested: DataLabels,
  inputs: readonly DataReference[],
  trustedProducer: boolean,
): DataLabels {
  const labels = normalizeLabels(requested);
  if (labels.confirmation || labels.trust === 'confirmed')
    throw new Error('Confirmation requires a verified current review');
  for (const input of inputs) {
    if (labels.readScopes.some((scope) => !input.labels.readScopes.some((grant) => containsScope(grant, scope))))
      throw new Error('Derived read scope exceeds input');
    if (labels.classification !== input.labels.classification) throw new Error('Derived classification mismatch');
  }
  const trusted =
    labels.source.kind !== 'agent' &&
    labels.source.kind !== 'external' &&
    trustedProducer &&
    inputs.every((ref) => ref.labels.trust !== 'untrusted');
  return {
    ...labels,
    trust: trusted ? 'trusted' : 'untrusted',
    excludedChannels: [
      ...new Set([...labels.excludedChannels, ...inputs.flatMap((ref) => ref.labels.excludedChannels)]),
    ].sort(),
  };
}
export interface DataObject {
  ref: DataReference;
  objectId: string;
  category: string;
  scope: Scope;
  contentHash: string;
  byteLength: number;
  inputRefs: string[];
}
