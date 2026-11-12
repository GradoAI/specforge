import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      enabled: true,
      include: ['src/constraints.ts', 'src/paths.ts', 'src/project.ts'],
      thresholds: { lines: 80, branches: 90 },
    },
  },
});
