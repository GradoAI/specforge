import { xingheOrganizations } from './organizations.js';
import { xingheTeams } from './teams.js';
import { xingheMembers } from './members.js';
import { xingheRoles } from './roles.js';
import { xingheRoleAssignments } from './role-assignments.js';
import { xingheMachines } from './machines.js';
import { xingheWorks } from './works.js';
import { xingheExecutions } from './executions.js';
import { xingheBudgets } from './budgets.js';
import { xingheSecurityPolicies } from './security-policies.js';
import { xinghePlugins } from './plugins.js';

export type * from './types.js';
export { xingheOrganizations } from './organizations.js';
export { xingheTeams } from './teams.js';
export { xingheMembers } from './members.js';
export { xingheRoles } from './roles.js';
export { xingheRoleAssignments } from './role-assignments.js';
export { xingheMachines } from './machines.js';
export { xingheWorks } from './works.js';
export { xingheExecutions } from './executions.js';
export { xingheBudgets } from './budgets.js';
export { xingheSecurityPolicies } from './security-policies.js';
export { xinghePlugins } from './plugins.js';

/** ULID timestamp component reserved for the reproducible example dataset. */
export const XINGHE_ULID_TIME = '0000000000';

export const xingheDataset = {
  organizations: xingheOrganizations,
  teams: xingheTeams,
  members: xingheMembers,
  roles: xingheRoles,
  roleAssignments: xingheRoleAssignments,
  machines: xingheMachines,
  works: xingheWorks,
  executions: xingheExecutions,
  budgets: xingheBudgets,
  securityPolicies: xingheSecurityPolicies,
  plugins: xinghePlugins,
} as const;
