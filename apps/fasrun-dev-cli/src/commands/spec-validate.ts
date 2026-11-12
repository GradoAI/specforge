import { resolve } from 'node:path';
import { Args } from '@oclif/core';
import { BaseCommand } from '../base.js';
import { runSpecValidate } from '../lib/spec.js';

export default class SpecValidate extends BaseCommand {
  static override summary = 'Validate the specs and change directories';
  static override args = { root: Args.string({ description: 'Spec root (default: fasrun/)' }) };
  async run() {
    const { args } = await this.parse(SpecValidate);
    const result = await runSpecValidate(resolve(args.root ?? 'fasrun/'));
    if (!this.jsonEnabled()) this.note(`Specifications valid (${result.files} files)`);
    return result;
  }
}
