import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['src/application/identity.ts', 'src/infrastructure/auth/keycloak.ts'],
      thresholds: { lines: 80, branches: 90 },
    },
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.ts'], exclude: ['src/**/*.int.test.ts'] } },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.ts'],
          globalSetup: ['@fasrun/test-utils/global-setup'],
          hookTimeout: 180_000,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
