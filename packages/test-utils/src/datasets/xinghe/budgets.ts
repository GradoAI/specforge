import type { Budget } from './types.js';

export const xingheBudgets: readonly Budget[] = [
  {
    id: 'budget_00000000000000000000000001',
    scope: 'organization',
    scopeName: '星河科技',
    amountCny: 6500,
    spentCny: 4458,
    rules: ['80% 时通知组织管理员', '100% 时暂停全组织新执行'],
  },
  {
    id: 'budget_00000000000000000000000002',
    scope: 'team',
    scopeName: '支付平台组',
    amountCny: 2000,
    spentCny: 758,
    rules: ['80% 时通知团队负责人', '100% 时暂停新执行'],
  },
  {
    id: 'budget_00000000000000000000000003',
    scope: 'team',
    scopeName: '数据中台组',
    amountCny: 2000,
    spentCny: 1920,
    rules: [
      '80% 时通知团队负责人',
      '超过 95% 时新执行自动改用轻量模型；不允许降级的执行需团队负责人放行',
      '100% 时暂停',
    ],
  },
  {
    id: 'budget_00000000000000000000000004',
    scope: 'team',
    scopeName: '移动端组',
    amountCny: 1500,
    spentCny: 1050,
    rules: [],
  },
  {
    id: 'budget_00000000000000000000000005',
    scope: 'team',
    scopeName: '风控组',
    amountCny: 1000,
    spentCny: 730,
    rules: [],
  },
  {
    id: 'budget_00000000000000000000000006',
    scope: 'project',
    scopeName: 'dw-partition',
    amountCny: 900,
    spentCny: 820,
    rules: ['80% 时通知项目负责人 高远'],
  },
  {
    id: 'budget_00000000000000000000000007',
    scope: 'project',
    scopeName: 'pay-reconcile',
    amountCny: 400,
    spentCny: 212,
    rules: ['单次执行超过 ¥20 时暂停并询问触发人'],
  },
];
