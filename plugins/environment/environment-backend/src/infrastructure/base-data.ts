import { createHash } from 'node:crypto';
import { isId } from '@fasrun/contracts-core';
import type { BaseDataDefinition } from '@fasrun/backend-defaults';
/** No executable capability is granted implicitly; approved tenant templates add explicit capability identifiers. */
export function environmentBaseData(orgId: string, actorId: string): BaseDataDefinition[] {
  if (!isId('org', orgId) || !actorId) throw new Error('Explicit organization and actor are required');
  let number = BigInt(`0x${createHash('sha256').update(`${orgId}:default@1`).digest('hex').slice(0, 32)}`);
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let encoded = '';
  for (let index = 0; index < 26; index++) {
    encoded = alphabet[Number(number & 31n)]! + encoded;
    number >>= 5n;
  }
  return [
    {
      key: `${orgId}:template:defaults`,
      version: 1,
      table: 'template_version',
      keyColumn: 'id',
      customizableColumns: ['snapshot'],
      rows: [
        {
          id: `env_${encoded}`,
          org_id: orgId,
          created_by: actorId,
          definition_key: 'default',
          definition_version: '1',
          snapshot: { version: 1, orgId, templateId: 'default', templateVersion: '1', allowedCapabilities: [] },
          is_customized: false,
        },
      ],
    },
  ];
}
