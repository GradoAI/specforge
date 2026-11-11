import { Args, Flags } from '@oclif/core';
import { ROLE_HINT } from '@fasrun/cli-templates';
import { BaseCommand } from '../base.js';
import { HOSTS, runPluginNew, type PluginNewResult } from '../lib/plugin-new.js';

export default class PluginNew extends BaseCommand {
  static override summary = 'Create a plugin package from the templates';
  static override description = `Renders plugins/<plugin>/<plugin>-<role> and registers backend roles in a host (connect in fasrun-connect-svc, others in fasrun-core-svc). Roles: ${ROLE_HINT}. Nothing is written when the name, the role or the target is invalid.`;
  static override args = { plugin: Args.string({ description: 'Plugin name, e.g. work', required: true }) };
  static override flags = {
    role: Flags.string({ description: `Package role: ${ROLE_HINT}`, required: true }),
    host: Flags.string({ description: `Host for backend roles: ${HOSTS.join(', ')}` }),
  };

  async run(): Promise<PluginNewResult> {
    const { args, flags } = await this.parse(PluginNew);
    const result = await runPluginNew(process.cwd(), {
      plugin: args.plugin,
      role: flags.role,
      ...(flags.host === undefined ? {} : { host: flags.host }),
    });
    if (!this.jsonEnabled()) {
      this.note(`Created ${result.package} in ${result.directory}/ (${result.files.length} files)`);
      this.note(`Registered in: ${result.registered.join(', ')}`);
      this.note(`Next: ${result.nextSteps.join('; ')}`);
    }
    return result;
  }
}
