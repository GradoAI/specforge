import { describe, expect, it, vi } from 'vitest';
import type { OperationContext } from '@fasrun/contracts-core';
import { newId } from '@fasrun/contracts-core';
import type { ProjectSource } from '@fasrun/plugin-knowledge-common';
import { createProjectContextService, type ProjectContextDependencies } from './project-context.js';
import { DEFAULT_ORGANIZATION_RULE, DEFAULT_TEMPLATE, DEFAULT_WORKFLOWS } from '../infrastructure/base-data.js';
const orgId = newId('org');
const context: OperationContext = {
  actor: {
    version: 1,
    actorId: 'member',
    actorKind: 'member',
    orgId,
    clientId: 'test',
    source: 'internal',
    traceId: 'trace',
  },
  scope: { orgId, projectId: 'project' },
  permission: 'knowledge.read',
  object: { type: 'repository', id: 'repo' },
};
const request = { repositoryId: 'repo', baseCommit: 'a'.repeat(40) };
function fixture() {
  const entries = new Map<string, ProjectSource>();
  const deps = {
    audit: {
      audit: vi.fn<ProjectContextDependencies['audit']['audit']>((event) =>
        Promise.resolve({ eventId: event.eventId, sequence: 1, hash: 'a'.repeat(64) }),
      ),
    },
    authorize: vi.fn<ProjectContextDependencies['authorize']>(() => Promise.resolve(true)),
    files: {
      read: vi.fn<ProjectContextDependencies['files']['read']>((_context, input) =>
        Promise.resolve({
          ...input,
          projectId: 'project',
          fasrunYaml: 'version: 1\nspec_root: fasrun/\nspec_template: default@1\n',
        }),
      ),
    },
    members: {
      resolveMembers: vi.fn<ProjectContextDependencies['members']['resolveMembers']>((_context, ids) =>
        Promise.resolve(ids.map((id) => ({ id, orgId, active: true }))),
      ),
    },
    environment: {
      snapshot: vi.fn<ProjectContextDependencies['environment']['snapshot']>(() =>
        Promise.resolve({
          version: 1,
          orgId,
          templateId: 'default',
          templateVersion: '1',
          allowedCapabilities: ['test'],
        }),
      ),
    },
    repository: {
      cached: vi.fn<ProjectContextDependencies['repository']['cached']>((_context, repositoryId, baseCommit) =>
        Promise.resolve(entries.get(`${repositoryId}:${baseCommit}`)),
      ),
      cache: vi.fn<ProjectContextDependencies['repository']['cache']>((_context, project) => {
        const key = `${project.repositoryId}:${project.baseCommit}`;
        entries.set(key, entries.get(key) ?? structuredClone(project));
        return Promise.resolve(entries.get(key)!);
      }),
      catalog: vi.fn<ProjectContextDependencies['repository']['catalog']>(() =>
        Promise.resolve({
          organizationRule: structuredClone(DEFAULT_ORGANIZATION_RULE),
          workflows: structuredClone([...DEFAULT_WORKFLOWS]),
          template: structuredClone(DEFAULT_TEMPLATE),
          environment: { templateId: 'default', templateVersion: '1' },
        }),
      ),
    },
  } satisfies ProjectContextDependencies;
  return { deps, entries, service: createProjectContextService(deps) };
}
describe('TC-SF5-SPEC-008 pinned project application', () => {
  it('pins A despite later defaults, captures B separately, and selects only the pinned workflow', async () => {
    const f = fixture();
    f.deps.environment.snapshot.mockImplementation((_context, selection) =>
      Promise.resolve({ version: 1, orgId, ...selection, allowedCapabilities: ['test'] }),
    );
    const first = await f.service.loadProjectContext(context, request);
    const originalCatalog = await f.deps.repository.catalog(context);
    const newerCatalog = {
      organizationRule: {
        ...DEFAULT_ORGANIZATION_RULE,
        definitionVersion: '2',
        environment: { templateId: 'default', templateVersion: '2' },
      },
      workflows: DEFAULT_WORKFLOWS.map((w) => ({ ...w, definitionVersion: '2' })),
      template: DEFAULT_TEMPLATE,
      environment: { templateId: 'default', templateVersion: '2' },
    };
    f.deps.repository.catalog.mockImplementation((_ctx, _template, pin) =>
      Promise.resolve(pin?.policyVersion === 'default@1' ? originalCatalog : newerCatalog),
    );
    expect((await f.service.readProject(context, { ...request, pin: first })).context).toEqual(first);
    const sameCommitNewWork = await f.service.loadProjectContext(context, request);
    expect(sameCommitNewWork.policyVersion).toBe('default@2');
    expect(f.deps.environment.snapshot).toHaveBeenLastCalledWith(context, {
      templateId: 'default',
      templateVersion: '2',
    });
    const oldWork = await f.service.readProject(context, { ...request, pin: first });
    expect(oldWork.environment.templateVersion).toBe('1');
    expect(sameCommitNewWork.configRef.id).not.toBe(first.configRef.id);
    const next = await f.service.loadProjectContext(context, { ...request, baseCommit: 'b'.repeat(40) });
    expect(next.policyVersion).toBe('default@2');
    expect(next.configRef.versionHash).not.toBe(first.configRef.versionHash);
    expect(await f.service.selectWorkflow(context, { project: first, classification: 'small_defect' })).toEqual({
      workflowVersion: 'small_defect@1',
      templateVersion: 'default@1',
    });
    expect(await f.service.selectWorkflow(context, { project: next, classification: 'feature' })).toEqual({
      workflowVersion: 'feature@2',
      templateVersion: 'default@1',
    });
    await expect(
      f.service.selectWorkflow(context, { project: { ...first, policyVersion: 'forged' }, classification: 'feature' }),
    ).rejects.toThrow('immutable capture');
    expect(f.deps.files.read).toHaveBeenCalledTimes(2);
    const data = await f.service.readProject(context, request);
    expect(data.effectiveRules.quality_gates?.coverage?.application_lines).toBe(80);
    expect(data.effectiveRules.agent?.commands).toEqual(['test']);
    data.effectiveRules.agent!.commands.push('forged');
    expect((await f.service.readProject(context, request)).effectiveRules.agent?.commands).toEqual(['test']);
  });
  it('requires current identity members on capture and cache reads', async () => {
    const f = fixture();
    vi.mocked(f.deps.files.read).mockResolvedValue({
      ...request,
      projectId: 'project',
      fasrunYaml: 'version: 1\nspec_root: fasrun/',
      fasfile:
        'version: 1\nprior_confirmations:\n  - id: cost\n    domains: [cost]\n    reviewer_member_ids: [reviewer]\n    layers: [requirements]\n',
    });
    const first = await f.service.loadProjectContext(context, request);
    expect(first.baseCommit).toBe(request.baseCommit);
    for (const rows of [
      [],
      [{ id: 'reviewer', orgId, active: false }],
      [{ id: 'reviewer', orgId: newId('org'), active: true }],
      [{ id: 'other', orgId, active: true }],
    ]) {
      vi.mocked(f.deps.members.resolveMembers).mockResolvedValue(rows);
      await expect(f.service.loadProjectContext(context, request)).rejects.toThrow('confirmation member');
    }
  });
  it('fails closed for unpinned sources, mismatches, malformed rules and revoked authorization', async () => {
    const f = fixture();
    await expect(f.service.loadProjectContext(context, { ...request, baseCommit: 'main' })).rejects.toThrow(
      'immutable',
    );
    vi.mocked(f.deps.authorize).mockResolvedValue(false);
    await expect(f.service.loadProjectContext(context, request)).rejects.toThrow('denied');
    expect(f.deps.files.read).not.toHaveBeenCalled();
    expect(f.deps.audit.audit).toHaveBeenLastCalledWith(
      expect.objectContaining({ outcome: 'denied', action: 'knowledge.project_context.read' }),
    );
    vi.mocked(f.deps.authorize).mockResolvedValue(true);
    vi.mocked(f.deps.files.read).mockResolvedValue({
      ...request,
      baseCommit: 'b'.repeat(40),
      projectId: 'project',
      fasrunYaml: 'version: 1\nspec_root: fasrun/',
    });
    await expect(f.service.loadProjectContext(context, request)).rejects.toThrow('source identity');
    vi.mocked(f.deps.files.read).mockResolvedValue({
      ...request,
      projectId: 'project',
      fasrunYaml: 'version: 1\nspec_root: fasrun/',
      fasfile: 'version: 1\nunknown: true',
    });
    await expect(f.service.loadProjectContext(context, request)).rejects.toThrow();
    vi.mocked(f.deps.files.read).mockResolvedValue({
      ...request,
      projectId: 'project',
      fasrunYaml: 'version: 1\nspec_root: fasrun/',
    });
    vi.mocked(f.deps.environment.snapshot).mockResolvedValue({
      version: 1,
      orgId,
      templateId: 'wrong',
      templateVersion: '1',
      allowedCapabilities: [],
    });
    await expect(f.service.loadProjectContext(context, request)).rejects.toThrow('Environment snapshot');
  });
  it('persists access intent before reading and never returns provider secrets or revoked data', async () => {
    const f = fixture();
    f.deps.audit.audit.mockRejectedValueOnce(new Error('postgres://user:secret@private/db'));
    await expect(f.service.readProject(context, request)).rejects.toThrow('invalid or unavailable');
    expect(f.deps.repository.cached).not.toHaveBeenCalled();
    f.deps.files.read.mockRejectedValueOnce(new Error('Bearer hidden-token'));
    await expect(f.service.readProject(context, request)).rejects.toThrow('invalid or unavailable');
    f.deps.authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(f.service.readProject(context, request)).rejects.toThrow('denied');
    expect(f.deps.audit.audit).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: 'denied' }));
  });
});
