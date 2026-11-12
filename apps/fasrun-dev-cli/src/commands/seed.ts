import { Flags } from '@oclif/core';
// SF-1 D-10/D-15 require seed to consume this pure dataset export, not the test host.
// eslint-disable-next-line fasrun/dependency-direction
import { xingheOrganizations } from '@fasrun/test-utils/datasets/xinghe';
import { BaseCommand } from '../base.js';
import { seedOrganizations } from '../lib/seed.js';

export default class Seed extends BaseCommand {
  static override summary = 'Load the Xinghe example dataset into currently implemented tables';
  static override description =
    'Uses FASRUN_DATABASE_URL as fasrun_app. Production is refused before any database connection.';
  static override flags = {
    dataset: Flags.string({ options: ['xinghe'], required: true, description: 'Example dataset' }),
  };

  async run() {
    await this.parse(Seed);
    const result = await seedOrganizations({
      environment: process.env.FASRUN_ENVIRONMENT,
      connectionString: process.env.FASRUN_DATABASE_URL,
      organizations: xingheOrganizations,
    });
    if (!this.jsonEnabled()) this.log(`Seeded ${result.organizations} organization(s) from xinghe`);
    return { dataset: 'xinghe', ...result };
  }
}
