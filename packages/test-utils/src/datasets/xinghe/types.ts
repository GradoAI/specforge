/** Prototype records, not database row types or future business schemas. */
export interface Organization {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly createdBy: string;
}
export interface Team {
  readonly id: string;
  readonly orgId: string;
  readonly name: string;
}
export interface Member {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly occupation: string;
  readonly source: string;
  readonly status: string;
}
export interface Role {
  readonly id: string;
  readonly name: string;
  readonly scope: 'platform' | 'organization' | 'team' | 'project' | 'personal';
}
export interface RoleAssignment {
  readonly id: string;
  readonly memberId: string;
  readonly roleId: string;
  readonly scopeLabel: string;
}
export interface Machine {
  readonly id: string;
  readonly name: string;
  readonly ownerId: string | null;
  readonly ownerLabel: string;
  readonly teamIds: readonly string[];
  readonly platform: string;
  readonly architecture: string;
  readonly nodeVersion: string;
  readonly status: string;
  readonly invocation: string;
}
export interface Work {
  readonly id: string;
  readonly key: string;
  readonly teamId: string;
  readonly title: string;
  readonly repository: string;
  readonly status: string;
  readonly ownerId: string;
  readonly costCny: number | null;
}
export interface Execution {
  readonly id: string;
  readonly workId: string;
  readonly number: number;
  readonly machineId: string;
  readonly executor: string;
  readonly invocation: string;
  readonly status: string;
  readonly stage: string;
  readonly durationSeconds: number;
  readonly costCny: number;
  readonly tokens: number;
  readonly startTime: string;
}
export interface Budget {
  readonly id: string;
  readonly scope: 'organization' | 'team' | 'project';
  readonly scopeName: string;
  readonly amountCny: number;
  readonly spentCny: number;
  readonly rules: readonly string[];
}
export interface SecurityPolicy {
  readonly id: string;
  readonly category: 'content' | 'provider' | 'mcp' | 'egress';
  readonly target: string;
  readonly scope: string;
  readonly rule: string;
  readonly proposerId: string;
  readonly confirmerId: string;
}
export interface Plugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly scope: string;
  readonly permissions: readonly string[];
  readonly status: string;
  readonly compatibility: string;
}
