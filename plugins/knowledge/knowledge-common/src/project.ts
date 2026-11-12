import { z } from 'zod';
import { fasfileSchema, fasrunConfigSchema } from '@fasrun/plugin-spec-common';
import { projectContextSchema } from './control-plane.js';

export const workflowDefinitionSchema = z
  .strictObject({
    id: z.string().min(1),
    definitionVersion: z.string().min(1),
    classification: z.enum(['small_defect', 'standard_defect', 'feature']),
    layers: z.array(z.enum(['requirements', 'design', 'tasks'])).min(1),
    answerTimeoutHours: z.number().positive(),
    reviewTimeoutHours: z.number().positive(),
    replanLimit: z.number().int().nonnegative(),
    escalationRoles: z.tuple([z.literal('team_lead'), z.literal('organization_admin')]),
    terminalState: z.literal('spec_confirmed'),
  })
  .refine(
    (workflow) =>
      JSON.stringify(workflow.layers) ===
      JSON.stringify(
        workflow.classification === 'small_defect' ? ['requirements'] : ['requirements', 'design', 'tasks'],
      ),
    'Workflow must preserve the approved layer sequence',
  );
export const specificationTemplateSchema = z.strictObject({
  id: z.string().min(1),
  definitionVersion: z.string().min(1),
  files: z.strictObject({
    requirements: z.string().min(1),
    design: z.string().min(1),
    tasks: z.string().min(1),
    delta: z.string().min(1),
  }),
  sections: z.strictObject({
    requirements: z.array(z.string().min(1)),
    design: z.array(z.string().min(1)),
    tasks: z.array(z.string().min(1)),
  }),
});
const requiredTemplateMarkers = {
  requirements: [
    '## 目标',
    '## 范围',
    '## 用户场景',
    '### US-',
    '独立验证：',
    '实现它的需求条目：',
    '## 成功标准',
    '## 待澄清',
  ],
  design: [
    '## 方案',
    '### D-',
    '对应需求：',
    '## 接口与数据的变化',
    '## 影响范围',
    '## 风险与回退',
    '## 项目长期约束检查',
  ],
  tasks: ['T001', '对应 R-', 'D-', '修改范围', '用例 TC-', '依赖'],
  delta: [
    '## ADDED Requirements',
    '### Requirement:',
    '#### Scenario:',
    '- GIVEN',
    '- WHEN',
    '- THEN',
    '## MODIFIED Requirements',
    '## REMOVED Requirements',
    '## RENAMED Requirements',
  ],
} as const;
export function validateSpecificationTemplate(value: SpecificationTemplate): SpecificationTemplate {
  const template = specificationTemplateSchema.parse(value);
  for (const [layer, markers] of Object.entries(requiredTemplateMarkers)) {
    const body = template.files[layer as keyof typeof template.files];
    for (const marker of markers)
      if (!body.includes(marker)) throw new Error(`Template ${layer} omits required marker: ${marker}`);
  }
  return template;
}
export const organizationRuleSchema = z.strictObject({
  id: z.string().min(1),
  definitionVersion: z.string().min(1),
  constraints: fasfileSchema,
  environment: z.strictObject({ templateId: z.string().min(1), templateVersion: z.string().min(1) }),
});
export const pinnedProjectSchema = z.strictObject({
  context: projectContextSchema,
  config: fasrunConfigSchema,
  sourceRules: fasfileSchema.optional(),
  effectiveRules: fasfileSchema,
  organizationRule: organizationRuleSchema,
  workflows: z.array(workflowDefinitionSchema).length(3),
  template: specificationTemplateSchema,
  environment: z.strictObject({
    templateId: z.string().min(1),
    templateVersion: z.string().min(1),
    allowedCapabilities: z.array(z.string().min(1)),
  }),
});
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type SpecificationTemplate = z.infer<typeof specificationTemplateSchema>;
export type OrganizationRule = z.infer<typeof organizationRuleSchema>;
export type PinnedProject = z.infer<typeof pinnedProjectSchema>;

export const projectSourceSchema = z.strictObject({
  orgId: z.string().min(1),
  projectId: z.string().min(1),
  repositoryId: z.string().min(1),
  baseCommit: z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/),
  config: fasrunConfigSchema,
  sourceRules: fasfileSchema.optional(),
});
export type ProjectSource = z.infer<typeof projectSourceSchema>;
