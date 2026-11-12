import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/conditions/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { branches: 90 },
    },
  },
});
