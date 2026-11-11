import { defineConfig } from 'vitest/config';

// Unit tests run without Docker; integration tests (*.int.test.ts) share one PostgreSQL container.
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.ts'], exclude: ['src/**/*.int.test.ts'] } },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.ts'],
          globalSetup: ['./src/global-setup.ts'],
          hookTimeout: 180_000,
          testTimeout: 60_000,
        },
      },
    ],
  },
});
