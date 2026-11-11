import { resolve } from 'node:path';
import { Args } from '@oclif/core';
import { BaseCommand } from '../base.js';
import { runInit, type InitResult } from '../lib/init.js';

export default class Init extends BaseCommand {
  static override summary = 'Set up Fasrun in a repository';
  static override description =
    'Creates fasrun.yaml, a Fasfile template and the fasrun/specs/ and fasrun/changes/ directories, creates AGENTS.md when it is missing, and makes sure CLAUDE.md has one "@AGENTS.md" line. Existing files are not rewritten; CLAUDE.md only gains that one line. Lists the created and modified files when done.';
  static override args = { directory: Args.string({ description: 'Repository root (default: current directory)' }) };

  async run(): Promise<InitResult> {
    const { args } = await this.parse(Init);
    const result = await runInit(resolve(args.directory ?? '.'));
    if (!this.jsonEnabled()) {
      const list = (files: string[]) => (files.length > 0 ? files.join(', ') : 'none');
      this.note(`Created: ${list(result.created)}`);
      this.note(`Modified: ${list(result.modified)}`);
    }
    return result;
  }
}
