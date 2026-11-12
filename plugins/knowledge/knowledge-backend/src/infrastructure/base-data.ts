import { createHash } from 'node:crypto';
import { isId } from '@fasrun/contracts-core';
import type { BaseDataDefinition } from '@fasrun/backend-defaults';
import type { OrganizationRule, SpecificationTemplate, WorkflowDefinition } from '@fasrun/plugin-knowledge-common';

export const DEFAULT_WORKFLOWS: readonly WorkflowDefinition[] = (
  ['small_defect', 'standard_defect', 'feature'] as const
).map((classification) => ({
  id: classification,
  definitionVersion: '1',
  classification,
  layers: classification === 'small_defect' ? ['requirements'] : ['requirements', 'design', 'tasks'],
  answerTimeoutHours: 8,
  reviewTimeoutHours: 24,
  replanLimit: 3,
  escalationRoles: ['team_lead', 'organization_admin'],
  terminalState: 'spec_confirmed',
}));
export const DEFAULT_TEMPLATE: SpecificationTemplate = {
  id: 'default',
  definitionVersion: '1',
  sections: {
    requirements: ['目标', '范围', '用户场景', '成功标准', '待澄清'],
    design: ['方案', '接口与数据的变化', '影响范围', '风险与回退', '项目长期约束检查'],
    tasks: ['任务编号', '需求与设计追溯', '修改范围', '用例', '依赖'],
  },
  files: {
    requirements:
      '# <工作编号> <标题>\n\n## 目标\n\n## 范围\n\n## 用户场景\n### US-1 <场景>（P1）\n独立验证：\n实现它的需求条目：R-…\n\n## 成功标准\n\n## 待澄清\n',
    design:
      '# 设计：<工作编号> <标题>\n\n## 方案\n### D-1 <设计条目>\n对应需求：R-…\n\n## 接口与数据的变化\n\n## 影响范围\n\n## 风险与回退\n\n## 项目长期约束检查\n',
    tasks:
      '# 任务：<工作编号> <标题>\n\n- [ ] T001 <任务> — 对应 R-…、D-…；修改范围 …；用例 TC-…\n- [ ] T002 [P] <任务> — 依赖 T001；对应 R-…、D-…；修改范围 …；用例 TC-…\n',
    delta:
      '## ADDED Requirements\n### Requirement: R-<能力>-001 <标题>\n系统必须……\n#### Scenario: R-<能力>-001.S1 <场景>\n- GIVEN …\n- WHEN …\n- THEN …\n\n## MODIFIED Requirements\n（写完整条目）\n\n## REMOVED Requirements\n（原因与迁移）\n\n## RENAMED Requirements\n（FROM / TO）\n',
  },
};
export const DEFAULT_ORGANIZATION_RULE: OrganizationRule = {
  id: 'default',
  definitionVersion: '1',
  constraints: {
    version: 1,
    quality_gates: { required_checks: [], coverage: { application_lines: 80, security_branches: 90 } },
    protected_paths: [],
    review_rules: [],
    prior_confirmations: [],
  },
  environment: { templateId: 'default', templateVersion: '1' },
};
function stableId(prefix: string, value: string): string {
  let number = BigInt(`0x${createHash('sha256').update(value).digest('hex').slice(0, 32)}`);
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let encoded = '';
  for (let index = 0; index < 26; index++) {
    encoded = alphabet[Number(number & 31n)]! + encoded;
    number >>= 5n;
  }
  return `${prefix}_${encoded}`;
}
/** Register for an explicitly provisioned tenant with the existing owner migration runner. No global/empty tenant. */
export function knowledgeBaseData(orgId: string, actorId: string): BaseDataDefinition[] {
  if (!isId('org', orgId) || !actorId) throw new Error('Explicit organization and actor are required');
  return (
    [
      ['workflow_definition', 'wfd', DEFAULT_WORKFLOWS],
      ['spec_template', 'spt', [DEFAULT_TEMPLATE]],
      ['organization_rule', 'orl', [DEFAULT_ORGANIZATION_RULE]],
    ] as const
  ).map(([table, prefix, definitions]) => ({
    key: `${orgId}:${table}:defaults`,
    version: 1,
    table,
    keyColumn: 'id',
    customizableColumns: ['snapshot'],
    rows: definitions.map((definition) => ({
      id: stableId(prefix, `${orgId}:${definition.id}@${definition.definitionVersion}`),
      org_id: orgId,
      created_by: actorId,
      definition_key: definition.id,
      definition_version: definition.definitionVersion,
      snapshot: definition,
      is_customized: false,
    })),
  }));
}
