// Commands declared now and implemented by later SF-1 tasks (SF-1 D-10): they parse their arguments, then exit
// with code 5 and FASRUN_NOT_IMPLEMENTED naming the task.
import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../base.js';
import { CliError, CliErrorCodes } from '../errors.js';

function notImplemented(command: string, task: string): never {
  throw new CliError(CliErrorCodes.NOT_IMPLEMENTED, `fasrun ${command} is delivered by SF-1 ${task}`);
}

export class SpecValidate extends BaseCommand {
  static override summary = 'Validate the specs and change directories';
  static override args = { root: Args.string({ description: 'Spec root (default: fasrun/)' }) };
  async run(): Promise<never> {
    await this.parse(SpecValidate);
    return notImplemented('spec validate', 'T014');
  }
}

export class SpecArchive extends BaseCommand {
  static override summary = 'Merge a delivered change into the current specs and archive it';
  static override args = { change: Args.string({ description: 'Change directory', required: true }) };
  static override flags = { date: Flags.string({ description: 'Archive date YYYY-MM-DD (default: today, UTC)' }) };
  async run(): Promise<never> {
    await this.parse(SpecArchive);
    return notImplemented('spec archive', 'T015');
  }
}

export class Migrate extends BaseCommand {
  static override summary = 'Run the database migrations of every plugin';
  async run(): Promise<never> {
    await this.parse(Migrate);
    return notImplemented('migrate', 'T012');
  }
}

export class Seed extends BaseCommand {
  static override summary = 'Load the example dataset';
  async run(): Promise<never> {
    await this.parse(Seed);
    return notImplemented('seed', 'T017');
  }
}

export class Check extends BaseCommand {
  static override summary = 'Run spec validation and the fasrun.yaml and Fasfile schema checks';
  async run(): Promise<never> {
    await this.parse(Check);
    return notImplemented('check', 'T014');
  }
}
