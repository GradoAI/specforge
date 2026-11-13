import { createHash } from 'node:crypto';
import { z } from 'zod';
import { jsonValueSchema, type JsonValue } from '@fasrun/contracts-core';
import { canonicalData } from '@fasrun/plugin-orchestration-common';
import type { StepDefinition, StepRegistry } from '@fasrun/plugin-orchestration-node';

export interface StepExecution {
  output: JsonValue;
  metadata?: JsonValue;
}
export type SystemStep = (input: JsonValue) => Promise<StepExecution>;
export interface VerifiedStep {
  definition: StepDefinition;
  execute: SystemStep;
}
const key = (step: Pick<StepDefinition, 'plugin' | 'name' | 'implementationVersion'>) =>
  JSON.stringify([step.plugin, step.name, step.implementationVersion]);
function immutable(value: object, seen = new WeakSet<object>()) {
  if (seen.has(value)) return;
  seen.add(value);
  if (value instanceof z.ZodType) {
    // Zod lazily binds public methods; materialize them before freezing the schema.
    for (
      let proto: object | null = Object.getPrototypeOf(value) as object | null;
      proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto) as object | null
    )
      for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto)))
        if (descriptor.get) Reflect.get(value, name);
    immutable(value.def, seen);
    // Parsing caches stay writable, while the actual schema definition cannot be replaced.
    Object.defineProperty(value._zod, 'def', { value: value.def, writable: false, configurable: false });
    Object.freeze(value);
    return;
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    const child: unknown = descriptor.value;
    if (child !== null && typeof child === 'object') immutable(child, seen);
  }
  Object.freeze(value);
}
/** Process-local version-pinned catalog; evidence is a private capability, not caller-supplied metadata. */
export function createStepCatalog() {
  const entries = new Map<string, StepDefinition>();
  const implementations = new Map<string, SystemStep>();
  type Evidence = { execute: SystemStep; inputs: JsonValue[]; implementationHash: string };
  const verified = new WeakMap<StepDefinition, Evidence>();
  const evidence = new Map<string, Evidence>();
  function snapshot(definition: StepDefinition): StepDefinition {
    if (
      !definition.plugin ||
      !definition.name ||
      !definition.implementationVersion ||
      !definition.outputSchemaVersion ||
      !['system', 'agent'].includes(definition.kind) ||
      !Number.isFinite(definition.cost) ||
      definition.cost < 0 ||
      !Number.isSafeInteger(definition.maxAttempts) ||
      definition.maxAttempts < 1 ||
      !Number.isSafeInteger(definition.timeoutMs) ||
      definition.timeoutMs < 1 ||
      definition.permissions.some((permission) => typeof permission !== 'string' || !permission)
    )
      throw new Error('Invalid step definition');
    z.toJSONSchema(definition.input);
    z.toJSONSchema(definition.output);
    const copy = {
      ...definition,
      permissions: [...definition.permissions],
      ...(definition.determinismEvidence ? { determinismEvidence: { ...definition.determinismEvidence } } : {}),
    };
    immutable(copy);
    return copy;
  }
  const registry: StepRegistry = {
    register(definition) {
      const id = key(definition);
      if (entries.has(id)) throw new Error('Step version already registered');
      const proof = verified.get(definition);
      if (definition.kind === 'system' && !proof) throw new Error('System step requires verified determinism evidence');
      const registered = snapshot(definition);
      entries.set(id, registered);
      if (proof) {
        implementations.set(id, proof.execute);
        evidence.set(id, proof);
      }
    },
  };
  async function verify(
    definition: StepDefinition,
    execute: SystemStep,
    inputs: readonly JsonValue[],
  ): Promise<VerifiedStep> {
    if (definition.kind !== 'system' || !definition.determinismEvidence?.testId || inputs.length === 0)
      throw new Error('System determinism cases required');
    const frozen = snapshot(definition);
    const implementationHash = createHash('sha256').update(execute.toString()).digest('hex');
    if (frozen.determinismEvidence!.implementationHash !== implementationHash)
      throw new Error('Implementation evidence mismatch');
    const cases = structuredClone([...inputs]);
    for (const input of cases) {
      const parsed = jsonValueSchema.parse(frozen.input.parse(structuredClone(input)));
      const first = await execute(structuredClone(parsed));
      const second = await execute(structuredClone(parsed));
      const a = jsonValueSchema.parse(frozen.output.parse(first.output));
      const b = jsonValueSchema.parse(frozen.output.parse(second.output));
      if (canonicalData(a) !== canonicalData(b))
        throw new Error(`Non-deterministic business output: ${frozen.plugin}.${frozen.name}`);
    }
    verified.set(frozen, { execute, inputs: cases, implementationHash });
    return Object.freeze({ definition: frozen, execute });
  }
  function registered(definition: StepDefinition) {
    if (entries.get(key(definition)) !== definition) throw new Error('Unregistered step identity');
    return key(definition);
  }
  return {
    ...registry,
    verify,
    resolve(plugin: string, name: string, version: string) {
      const found = entries.get(key({ plugin, name, implementationVersion: version }));
      if (!found) throw new Error('Unknown step version');
      return found;
    },
    list: () => [...entries.values()],
    systemImplementation(definition: StepDefinition) {
      const execute = implementations.get(registered(definition));
      if (!execute) throw new Error('No registered system implementation');
      return execute;
    },
    verification(definition: StepDefinition) {
      const result = evidence.get(registered(definition));
      if (!result) throw new Error('No determinism evidence');
      return { inputs: structuredClone(result.inputs), implementationHash: result.implementationHash };
    },
  };
}
