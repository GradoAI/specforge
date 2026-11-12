import { describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';

describe('migrate required configuration', () => {
  it('TC-PLATFORM-024 rejects missing input without prompting or leaking credentials', async () => {
    await expect(runMigrations('.', undefined)).rejects.toMatchObject({ code: 'FASRUN_USAGE' });
    await expect(runMigrations('.', 'not-a-url')).rejects.toMatchObject({ code: 'FASRUN_CONFIG_INVALID' });
    await expect(runMigrations('.', 'postgres://fasrun_app:secret@127.0.0.1/db')).rejects.toMatchObject({
      code: 'FASRUN_CONFIG_INVALID',
    });
  });
});
