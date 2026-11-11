// @ts-check
import { dependencyDirection } from './rules/dependency-direction.js';

/** ESLint plugin with the Fasrun repository rules. */
const plugin = {
  meta: { name: '@fasrun/eslint-plugin', version: '0.0.0' },
  rules: {
    'dependency-direction': dependencyDirection,
  },
};

export default plugin;
