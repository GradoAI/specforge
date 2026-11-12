import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../base.js';
import { runSpecArchive } from '../lib/spec-archive.js';

export default class SpecArchive extends BaseCommand {
  static override summary = 'Merge a delivered change into the current specs and archive it';
  static override args = { change: Args.string({ description: 'Change directory', required: true }) };
  static override flags = { date: Flags.string({ description: 'Archive date YYYY-MM-DD (default: today, UTC)' }) };
  async run() {
    const { args, flags } = await this.parse(SpecArchive);
    const result = await runSpecArchive(args.change, flags.date);
    if (!this.jsonEnabled()) this.note(`Archived ${result.archived}`);
    return result;
  }
}
