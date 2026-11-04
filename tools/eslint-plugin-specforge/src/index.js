// @ts-check
import { dependencyDirection } from './rules/dependency-direction.js';

/** ESLint plugin with the SpecForge repository rules. */
const plugin = {
  meta: { name: '@specforge/eslint-plugin', version: '0.0.0' },
  rules: {
    'dependency-direction': dependencyDirection,
  },
};

export default plugin;
