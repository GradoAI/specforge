// FASRUN-DEV-CLI entry (SF-1 D-10): oclif with explicitly listed commands, plus --version and error handling
// for problems found before a command runs.
import { readFileSync } from 'node:fs';
import { flush, run } from '@oclif/core';
import Init from './commands/init.js';
import Login from './commands/login.js';
import { Check, Migrate, PluginNew, Seed, SpecArchive, SpecValidate } from './commands/placeholder.js';
import { describeFailure, ExitCode, failureEnvelope } from './errors.js';

export const COMMANDS = {
  check: Check,
  init: Init,
  login: Login,
  migrate: Migrate,
  'plugin:new': PluginNew,
  seed: Seed,
  'spec:archive': SpecArchive,
  'spec:validate': SpecValidate,
};

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/** Runs the command line and returns the exit code; writes only to stdout and stderr, never reads stdin. */
export async function main(argv: readonly string[]): Promise<number> {
  const json = argv.includes('--json');
  if (argv.includes('--version') || (argv.length === 1 && argv[0] === '-v')) {
    process.stdout.write(
      json ? `${JSON.stringify({ ok: true, command: 'version', result: { version } })}\n` : `fasrun ${version}\n`,
    );
    return ExitCode.OK;
  }
  try {
    await run([...argv], import.meta.url);
    await flush();
    return ExitCode.OK;
  } catch (error) {
    const exit = (error as { oclif?: { exit?: number }; constructor: { name: string } }) ?? {};
    // Commands report their own failures and end with an ExitError carrying the code.
    if (exit.constructor.name === 'ExitError') return exit.oclif?.exit ?? ExitCode.OTHER;
    const { exitCode, message } = describeFailure(error);
    if (json) process.stdout.write(`${JSON.stringify(failureEnvelope(argv[0] ?? '', error))}\n`);
    else process.stderr.write(`Error: ${message}\n`);
    return exitCode;
  }
}
