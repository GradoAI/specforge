import type { Role } from './types.js';

export const xingheRoles: readonly Role[] = [
  {
    id: 'role_00000000000000000000000001',
    name: '平台管理员',
    scope: 'platform',
  },
  {
    id: 'role_00000000000000000000000002',
    name: '平台审计员',
    scope: 'platform',
  },
  {
    id: 'role_00000000000000000000000003',
    name: '组织管理员',
    scope: 'organization',
  },
  {
    id: 'role_00000000000000000000000004',
    name: '预算管理员',
    scope: 'organization',
  },
  {
    id: 'role_00000000000000000000000005',
    name: '安全管理员',
    scope: 'organization',
  },
  {
    id: 'role_00000000000000000000000006',
    name: '环境模板管理员',
    scope: 'organization',
  },
  {
    id: 'role_00000000000000000000000007',
    name: '运维',
    scope: 'organization',
  },
  {
    id: 'role_00000000000000000000000008',
    name: '团队负责人',
    scope: 'team',
  },
  {
    id: 'role_00000000000000000000000009',
    name: '成员',
    scope: 'team',
  },
  {
    id: 'role_00000000000000000000000010',
    name: '观察者',
    scope: 'team',
  },
  {
    id: 'role_00000000000000000000000011',
    name: '需求评审人',
    scope: 'project',
  },
  {
    id: 'role_00000000000000000000000012',
    name: '设计评审人',
    scope: 'project',
  },
  {
    id: 'role_00000000000000000000000013',
    name: '合并审批人',
    scope: 'project',
  },
  {
    id: 'role_00000000000000000000000014',
    name: '机器主人',
    scope: 'personal',
  },
];
