import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.ts'], exclude: ['src/**/*.int.test.ts'] } },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.ts'],
          globalSetup: ['@fasrun/test-utils/global-setup'],
          hookTimeout: 180000,
          testTimeout: 60000,
        },
      },
    ],
  },
});
