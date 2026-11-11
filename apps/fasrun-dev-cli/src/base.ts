// Base class of every command (SF-1 D-10): --json with one envelope on stdout, fixed exit codes, no prompts.
import { Command } from '@oclif/core';
import { describeFailure, failureEnvelope, type SuccessEnvelope } from './errors.js';

export abstract class BaseCommand extends Command {
  static override enableJsonFlag = true;

  /** Progress and notices go to stderr so that stdout stays machine-readable. */
  protected note(message: string): void {
    this.logToStderr(message);
  }

  protected override toSuccessJson(result: unknown): SuccessEnvelope {
    return { ok: true, command: this.id ?? '', result };
  }

  protected override catch(error: Error & { exitCode?: number }): Promise<never> {
    // this.exit() inside run() throws an ExitError; let oclif finish it.
    if (error.constructor.name === 'ExitError') return Promise.reject(error);
    const { exitCode, message } = describeFailure(error);
    if (this.jsonEnabled()) this.logJson(failureEnvelope(this.id ?? '', error));
    else this.logToStderr(`Error: ${message}`);
    this.exit(exitCode);
  }
}
