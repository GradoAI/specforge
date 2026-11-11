import type { BackendFeature } from '@fasrun/backend-plugin-api';
// The two marked blocks are maintained by `fasrun plugin new` (SF-1 D-6); keep other code outside them.
// fasrun:plugins:begin
import entryPlugin from '@fasrun/plugin-entry-backend';
import environmentPlugin from '@fasrun/plugin-environment-backend';
import governancePlugin from '@fasrun/plugin-governance-backend';
import identityPlugin from '@fasrun/plugin-identity-backend';
import insightPlugin from '@fasrun/plugin-insight-backend';
import knowledgePlugin from '@fasrun/plugin-knowledge-backend';
import orchestrationPlugin from '@fasrun/plugin-orchestration-backend';
import specPlugin from '@fasrun/plugin-spec-backend';
// fasrun:plugins:end

/** Backend plugins and modules this host assembles. */
export const plugins: readonly BackendFeature[] = [
  // fasrun:plugin-list:begin
  entryPlugin,
  environmentPlugin,
  governancePlugin,
  identityPlugin,
  insightPlugin,
  knowledgePlugin,
  orchestrationPlugin,
  specPlugin,
  // fasrun:plugin-list:end
];
