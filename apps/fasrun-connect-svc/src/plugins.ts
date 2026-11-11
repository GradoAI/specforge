import type { BackendFeature } from '@fasrun/backend-plugin-api';
// The two marked blocks are maintained by `fasrun plugin new` (SF-1 D-6); keep other code outside them.
// fasrun:plugins:begin
import connectPlugin from '@fasrun/plugin-connect-backend';
// fasrun:plugins:end

/** Backend plugins and modules this host assembles. */
export const plugins: readonly BackendFeature[] = [
  // fasrun:plugin-list:begin
  connectPlugin,
  // fasrun:plugin-list:end
];
