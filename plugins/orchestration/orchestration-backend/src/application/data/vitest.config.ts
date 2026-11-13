// Test-only configuration; no production entry imports this file.
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globalSetup: ['@fasrun/test-utils/global-setup'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/application/data/service.ts'],
      thresholds: { lines: 80, branches: 90 },
    },
  },
});
