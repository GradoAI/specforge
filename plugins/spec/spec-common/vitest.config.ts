import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/validation.ts', 'src/archive.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { branches: 90 },
    },
  },
});
