// Keep the existing data suite and thresholds while covering the new application services.
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globalSetup: ['@fasrun/test-utils/global-setup'],
    coverage: {
      enabled: true,
      provider: 'v8',
      include: [
        'src/application/data/service.ts',
        'src/application/agents/invoker.ts',
        'src/application/agents/output.ts',
        'src/application/steps/catalog.ts',
      ],
      thresholds: { lines: 80, branches: 90 },
    },
  },
});
