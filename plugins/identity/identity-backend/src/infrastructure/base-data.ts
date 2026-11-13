import { createHash } from 'node:crypto';
import type { BaseDataDefinition } from '@fasrun/backend-defaults';
import { defaultRules } from '@fasrun/plugin-identity-common';
/** Host calls this per explicitly provisioned organization; migrate owns the write role and preserves customization. */
export function identityBaseData(orgId: string, createdBy: string): BaseDataDefinition[] {
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const id = (key: string) => {
    const bytes = createHash('sha256').update(`${orgId}:${key}`).digest();
    let result = '0';
    for (let i = 0; i < 25; i++) result += alphabet[bytes[i]! % 32];
    return `rul_${result}`;
  };
  return [
    {
      key: `identity.permissions.${orgId}`,
      version: 1,
      table: 'permission_rule',
      keyColumn: 'id',
      customizableColumns: ['definition'],
      rows: defaultRules(orgId).map((rule) => ({
        id: id(rule.id),
        org_id: orgId,
        created_by: createdBy,
        rule_key: rule.id,
        definition: rule,
        is_customized: false,
      })),
    },
  ];
}
