import { describe, expect, expectTypeOf, it } from 'vitest';
import * as ports from './index.js';
import type { OrchestrationService, DurableRuntime } from './index.js';
import { readFileSync } from 'node:fs';
describe('TC-SF5-CONTRACT-001 orchestration public service ports', () => {
  it('imports the public registration API with owner-bound root scope', () => {
    expect(ports.orchestrationServiceRef).toMatchObject({ id: 'orchestration.service', scope: 'root' });
    expectTypeOf<'db' extends keyof OrchestrationService ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'repository' extends keyof OrchestrationService ? true : false>().toEqualTypeOf<false>();
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(
      Object.keys(manifest.dependencies).filter((dependency) => /-backend(?:-|$)|drizzle|^pg$/.test(dependency)),
    ).toEqual([]);
  });
});

it('TC-SF5-CONTRACT-001 durable adapter carries original deadlines, recovery and drain version', async () => {
  const calls: unknown[] = [];
  const runtime: DurableRuntime = {
    startWorkflow(request) {
      calls.push(request);
      return Promise.resolve(request);
    },
    runStep(request) {
      calls.push(request);
      return Promise.resolve(null);
    },
    send(request) {
      calls.push(request);
      return Promise.resolve();
    },
    receiveUntil(request) {
      calls.push(request);
      return Promise.resolve({ status: 'deadline' });
    },
    recover(request) {
      calls.push(request);
      return Promise.resolve({ recoveredWorkflowIds: ['work-1'] });
    },
    drain(request) {
      calls.push(request);
      return Promise.resolve({ acceptingNewWork: false, inflight: 1 });
    },
    result(workflowId) {
      calls.push(workflowId);
      return Promise.resolve(null);
    },
  };
  const wait = {
    workflowId: 'work-1',
    topic: 'review:requirements',
    gateInstanceId: 'gate-1',
    deadlineAt: '2026-11-12T00:00:00Z',
  };
  await runtime.startWorkflow({ workflowId: 'work-1', implementationVersion: 'v1', input: null });
  await runtime.runStep({
    workflowId: 'work-1',
    stepRunId: 'step-1',
    idempotencyKey: 'effect-1',
    plugin: 'spec',
    stepName: 'check',
    implementationVersion: 'v1',
    input: null,
  });
  await runtime.receiveUntil(wait);
  await runtime.recover({ implementationVersion: 'v1' });
  await runtime.receiveUntil(wait);
  expect(calls[2]).toEqual(calls[4]);
  expect(await runtime.drain({ implementationVersion: 'v1' })).toEqual({ acceptingNewWork: false, inflight: 1 });
});
