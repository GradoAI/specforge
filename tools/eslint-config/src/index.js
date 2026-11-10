// @ts-check
/**
 * Shared ESLint flat config (design D-2): ESLint recommended rules, typescript-eslint, the SpecForge
 * dependency-direction rule, and eslint-config-prettier last so formatting is left to Prettier.
 */
import js from '@eslint/js';
import specforge from '@specforge/eslint-plugin';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * @param {{ typeChecked?: boolean, tsconfigRootDir?: string }} [options]
 *   typeChecked: enable type-aware rules through the TypeScript project service (needs tsconfig coverage).
 */
export function createConfig(options = {}) {
  const { typeChecked = true, tsconfigRootDir } = options;
  return defineConfig([
    globalIgnores(['**/node_modules/', '**/dist/', '**/coverage/', '**/.turbo/', '**/test/fixtures/']),
    {
      files: ['**/*.{js,mjs,cjs,ts,mts,cts,tsx}'],
      plugins: { js, specforge },
      extends: ['js/recommended'],
      languageOptions: { globals: { ...globals.node } },
      rules: {
        'specforge/dependency-direction': 'error',
      },
    },
    {
      files: ['**/*.{ts,mts,cts,tsx}'],
      extends: typeChecked ? [tseslint.configs.recommendedTypeChecked] : [tseslint.configs.recommended],
      languageOptions: typeChecked
        ? { parserOptions: { projectService: true, ...(tsconfigRootDir ? { tsconfigRootDir } : {}) } }
        : {},
      rules: {
        '@typescript-eslint/consistent-type-imports': 'error',
      },
    },
    prettier,
  ]);
}

export default createConfig;
