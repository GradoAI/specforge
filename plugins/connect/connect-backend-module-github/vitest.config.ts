import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      enabled: true,
      include: ['src/application/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/ports.ts'],
      thresholds: { lines: 80, branches: 90 },
    },
  },
});
