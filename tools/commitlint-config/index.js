// @ts-check
/** Conventional Commits with the commit types used in this repository (design D-2). */
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'docs', 'chore', 'test', 'build', 'ci', 'perf', 'revert']],
  },
};

export default config;
