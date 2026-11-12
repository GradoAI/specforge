import { Flags } from '@oclif/core';
import { BaseCommand } from '../base.js';
import { runMigrations } from '../lib/migrate.js';

export default class Migrate extends BaseCommand {
  static override summary = 'Run plugin migrations and synchronize versioned base data as fasrun_owner';
  static override description =
    'Requires FASRUN_MIGRATE_DATABASE_URL. Reads backend plugin manifests and migration files from the repository root.';
  static override flags = { root: Flags.string({ description: 'Fasrun repository root', default: '.' }) };

  async run() {
    const { flags } = await this.parse(Migrate);
    const report = await runMigrations(flags.root, process.env.FASRUN_MIGRATE_DATABASE_URL);
    if (!this.jsonEnabled()) {
      const migrations = report.plugins.flatMap((plugin) =>
        plugin.migrations.map((file) => `${plugin.schema}/${file}`),
      );
      this.log(migrations.length ? migrations.join('\n') : '没有待执行的迁移');
    }
    return report;
  }
}
