import { expect, it } from 'vitest';
import { workflowDefinitionSchema, validateSpecificationTemplate } from './project.js';
it('TC-SF5-SPEC-008 rejects workflow layer shortcuts and templates missing mandatory structure', () => {
  const workflow = {
    id: 'feature',
    definitionVersion: '1',
    classification: 'feature',
    layers: ['requirements', 'design', 'tasks'],
    answerTimeoutHours: 8,
    reviewTimeoutHours: 24,
    replanLimit: 3,
    escalationRoles: ['team_lead', 'organization_admin'],
    terminalState: 'spec_confirmed',
  };
  expect(workflowDefinitionSchema.parse(workflow).layers).toHaveLength(3);
  expect(() => workflowDefinitionSchema.parse({ ...workflow, layers: ['requirements'] })).toThrow();
  expect(
    workflowDefinitionSchema.parse({ ...workflow, classification: 'small_defect', layers: ['requirements'] }).layers,
  ).toHaveLength(1);
  const template = {
    id: 'custom',
    definitionVersion: '1',
    sections: { requirements: [], design: [], tasks: [] },
    files: {
      requirements: '## 目标\n## 范围\n## 用户场景\n### US-1\n独立验证：\n实现它的需求条目：\n## 成功标准\n## 待澄清',
      design: '## 方案\n### D-1\n对应需求：\n## 接口与数据的变化\n## 影响范围\n## 风险与回退\n## 项目长期约束检查',
      tasks: 'T001 对应 R- D- 修改范围 用例 TC- 依赖',
      delta:
        '## ADDED Requirements\n### Requirement:\n#### Scenario:\n- GIVEN\n- WHEN\n- THEN\n## MODIFIED Requirements\n## REMOVED Requirements\n## RENAMED Requirements',
    },
  };
  expect(validateSpecificationTemplate(template)).toEqual(template);
  for (const layer of ['requirements', 'design', 'tasks', 'delta'] as const)
    expect(() =>
      validateSpecificationTemplate({ ...template, files: { ...template.files, [layer]: 'missing structure' } }),
    ).toThrow('required marker');
});
