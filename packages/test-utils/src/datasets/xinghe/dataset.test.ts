import { describe, expect, it } from 'vitest';
import { isId } from '@fasrun/contracts-core';
import { xingheDataset, XINGHE_ULID_TIME } from './index.js';

describe('xinghe prototype dataset', () => {
  it('TC-PLATFORM-036 / R-platform-011.S3 contains the specified entities and deterministic example identifiers', () => {
    expect(xingheDataset.organizations).toHaveLength(1);
    expect(xingheDataset.teams.map(({ name }) => name)).toEqual(['支付平台组', '数据中台组', '移动端组', '风控组']);
    expect(xingheDataset.roles).toHaveLength(14);
    expect(xingheDataset.members).toHaveLength(11);
    expect(xingheDataset.machines).toHaveLength(10);
    expect(xingheDataset.plugins).toHaveLength(6);
    const ids = Object.values(xingheDataset)
      .flat()
      .map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const prefix = id.split('_')[0]!;
      expect(isId(prefix, id), id).toBe(true);
      expect(id.split('_')[1]!.slice(0, 10), id).toBe(XINGHE_ULID_TIME);
    }
  });

  it('TC-PLATFORM-036 keeps SF-1051 attempts, status, timing and cost aligned with B4', () => {
    const work = xingheDataset.works.find(({ key }) => key === 'SF-1051')!;
    const runs = xingheDataset.executions.filter(({ workId }) => workId === work.id);
    expect(runs.map(({ number, status }) => [number, status])).toEqual([
      [1, '已取消'],
      [2, '失败'],
      [3, '等待输入'],
    ]);
    expect(runs.reduce((sum, run) => sum + run.durationSeconds, 0)).toBe(19 * 60 + 45);
    expect(runs.reduce((sum, run) => sum + Math.round(run.costCny * 100), 0)).toBe(930);
    expect(work.costCny).toBe(9.3);
    expect(work.status).toBe(runs.at(-1)!.status);
  });

  it('TC-PLATFORM-036 resolves every explicit entity reference without inventing shared-machine owners', () => {
    const has = (rows: readonly { id: string }[], id: string) =>
      expect(
        rows.some((row) => row.id === id),
        id,
      ).toBe(true);
    for (const org of xingheDataset.organizations) has(xingheDataset.members, org.createdBy);
    for (const team of xingheDataset.teams) has(xingheDataset.organizations, team.orgId);
    for (const assignment of xingheDataset.roleAssignments) {
      has(xingheDataset.members, assignment.memberId);
      has(xingheDataset.roles, assignment.roleId);
    }
    for (const machine of xingheDataset.machines) {
      if (machine.ownerId !== null) has(xingheDataset.members, machine.ownerId);
      else expect(machine.ownerLabel).toBe('团队共享');
      for (const id of machine.teamIds) has(xingheDataset.teams, id);
    }
    for (const work of xingheDataset.works) {
      has(xingheDataset.teams, work.teamId);
      has(xingheDataset.members, work.ownerId);
    }
    for (const run of xingheDataset.executions) {
      has(xingheDataset.works, run.workId);
      has(xingheDataset.machines, run.machineId);
    }
    for (const policy of xingheDataset.securityPolicies) {
      has(xingheDataset.members, policy.proposerId);
      has(xingheDataset.members, policy.confirmerId);
      expect(policy.proposerId).not.toBe(policy.confirmerId);
    }
  });

  it('TC-PLATFORM-036 preserves C6 budget totals and separates subscription usage from API cost', () => {
    const teams = xingheDataset.budgets.filter(({ scope }) => scope === 'team');
    const organization = xingheDataset.budgets.find(({ scope }) => scope === 'organization')!;
    expect(teams.reduce((sum, budget) => sum + budget.amountCny, 0)).toBe(organization.amountCny);
    expect(teams.reduce((sum, budget) => sum + budget.spentCny, 0)).toBe(organization.spentCny);
    expect(xingheDataset.works.find(({ key }) => key === 'SF-1063')!.costCny).toBeNull();
    expect(xingheDataset.securityPolicies.filter(({ category }) => category === 'content')).toHaveLength(6);
    expect(xingheDataset.securityPolicies.find(({ target }) => target === '* 其他域名')!.rule).toBe('拒绝');
  });
});
