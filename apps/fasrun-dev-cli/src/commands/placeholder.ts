// Commands declared now and implemented by later SF-1 tasks (SF-1 D-10): they parse their arguments, then exit
// with code 5 and FASRUN_NOT_IMPLEMENTED naming the task.
import { BaseCommand } from '../base.js';
import { CliError, CliErrorCodes } from '../errors.js';

function notImplemented(command: string, task: string): never {
  throw new CliError(CliErrorCodes.NOT_IMPLEMENTED, `fasrun ${command} is delivered by SF-1 ${task}`);
}

export class Seed extends BaseCommand {
  static override summary = 'Load the example dataset';
  async run(): Promise<never> {
    await this.parse(Seed);
    return notImplemented('seed', 'T017');
  }
}
