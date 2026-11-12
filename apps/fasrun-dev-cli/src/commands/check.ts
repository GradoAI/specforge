import { BaseCommand } from '../base.js';
import { runCheck } from '../lib/spec.js';

export default class Check extends BaseCommand {
  static override summary = 'Run spec validation and the Fasfile and fasrun.yaml schema checks';
  async run() {
    await this.parse(Check);
    const result = await runCheck(process.cwd());
    if (!this.jsonEnabled()) this.note(`Passed: ${result.checks.join(', ')}`);
    return result;
  }
}
