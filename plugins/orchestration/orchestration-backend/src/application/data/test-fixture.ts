import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, inject } from 'vitest';
// eslint-disable-next-line fasrun/dependency-direction -- Test-only lifecycle helper, imported exclusively by colocated integration tests.
import { createTestDatabase, type TestDatabase } from '@fasrun/test-utils';
import { migrateDatabase, createContentAddressedStorage } from '@fasrun/backend-defaults';
import { newId, type OperationContext } from '@fasrun/contracts-core';
import type { AuditEvent } from '@fasrun/plugin-governance-common';
import { createDataRepository } from '../../infrastructure/data/repository.js';
import { createDataService, type RegisterData } from './service.js';
import type { DataDependencies } from './ports.js';
import { testPool, closeTestPools } from './test-pools.js';
export function dataFixture() {
  const orgId = newId('org'),
    context: OperationContext = {
      actor: {
        version: 1,
        actorId: newId('mem'),
        actorKind: 'member',
        orgId,
        clientId: 'fixture',
        source: 'http',
        traceId: 'fixture',
        authorizationId: newId('auth'),
      },
      permission: 'work.create',
      scope: { orgId },
      object: { type: 'work', id: newId('wrk') },
    };
  const fixture = {
    context,
    revoked: false,
    auditFails: false,
    trusted: false,
    policyAllowed: true,
    audits: [] as AuditEvent[],
    producerHashes: [] as string[],
    database: undefined as TestDatabase | undefined,
    root: '',
    owner: undefined as ReturnType<typeof testPool> | undefined,
    pool: undefined as ReturnType<typeof testPool> | undefined,
    deps: undefined as DataDependencies | undefined,
    service: undefined as ReturnType<typeof createDataService> | undefined,
  };
  beforeAll(async () => {
    fixture.database = await createTestDatabase(inject('fasrunPostgres'));
    fixture.owner = testPool({ connectionString: fixture.database.ownerUrl });
    fixture.pool = testPool({ connectionString: fixture.database.appUrl });
    await migrateDatabase({
      connectionString: fixture.database.ownerUrl,
      plugins: [
        {
          schema: 'orchestration',
          migrationsDirectory: fileURLToPath(new URL('../../../migrations/', import.meta.url)),
        },
      ],
    });
    fixture.root = await mkdtemp(path.join(tmpdir(), 'reference-data-'));
    const storage = await createContentAddressedStorage(fixture.root);
    fixture.deps = {
      repository: createDataRepository(fixture.pool),
      storage,
      authorize: () => Promise.resolve({ allowed: !fixture.revoked }),
      audit: (event) => {
        if (fixture.auditFails) return Promise.reject(new Error('postgres://private:credential@host'));
        fixture.audits.push(event);
        return Promise.resolve();
      },
      policy: () => Promise.resolve({ allowed: fixture.policyAllowed }),
      trustedProducer: (_context, output) => {
        fixture.producerHashes.push(output.contentHash);
        return Promise.resolve(fixture.trusted);
      },
      confirmation: (actor, original, headCommit) =>
        Promise.resolve({
          memberId: actor.actor.actorId,
          headCommit,
          originalRef: original.id,
          basis: 'current human review fixture',
          permission: 'spec.approve_requirements',
        }),
    };
    fixture.service = createDataService(fixture.deps);
  }, 30000);
  afterAll(async () => {
    try {
      await closeTestPools(fixture.owner, fixture.pool);
    } finally {
      await fixture.database?.drop();
      if (fixture.root) await rm(fixture.root, { recursive: true, force: true });
    }
  }, 15000);
  function request(extra: Partial<RegisterData> = {}): RegisterData {
    return {
      objectId: newId('obj'),
      category: 'document',
      scope: { orgId },
      value: { text: 'same content' },
      labels: {
        source: { kind: 'external', id: 'issue' },
        trust: 'untrusted',
        readScopes: [{ orgId }],
        classification: 'repository',
        excludedChannels: [],
      },
      inputs: [],
      ...extra,
    };
  }
  return { fixture, request };
}
