// Exit codes and error codes of the command line (SF-1 D-10, tech plan 2.7). Both are fixed once released.
export const ExitCode = {
  OK: 0,
  CHECK_FAILED: 1,
  USAGE: 2,
  CONFIG_OR_AUTH: 3,
  UNREACHABLE: 4,
  OTHER: 5,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export const CliErrorCodes = {
  CHECK_FAILED: 'FASRUN_CHECK_FAILED',
  USAGE: 'FASRUN_USAGE',
  CONFIG_INVALID: 'FASRUN_CONFIG_INVALID',
  AUTH_DENIED: 'FASRUN_AUTH_DENIED',
  AUTH_EXPIRED: 'FASRUN_AUTH_EXPIRED',
  UNREACHABLE: 'FASRUN_UNREACHABLE',
  INTERNAL: 'FASRUN_INTERNAL',
  NOT_IMPLEMENTED: 'FASRUN_NOT_IMPLEMENTED',
} as const;

export type CliErrorCode = (typeof CliErrorCodes)[keyof typeof CliErrorCodes];

const EXIT_BY_CODE: Record<CliErrorCode, ExitCode> = {
  FASRUN_CHECK_FAILED: ExitCode.CHECK_FAILED,
  FASRUN_USAGE: ExitCode.USAGE,
  FASRUN_CONFIG_INVALID: ExitCode.CONFIG_OR_AUTH,
  FASRUN_AUTH_DENIED: ExitCode.CONFIG_OR_AUTH,
  FASRUN_AUTH_EXPIRED: ExitCode.CONFIG_OR_AUTH,
  FASRUN_UNREACHABLE: ExitCode.UNREACHABLE,
  FASRUN_INTERNAL: ExitCode.OTHER,
  FASRUN_NOT_IMPLEMENTED: ExitCode.OTHER,
};

/** An expected failure with a stable error code; the exit code follows from the error code. */
export class CliError extends Error {
  readonly code: CliErrorCode;
  constructor(code: CliErrorCode, message: string) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }

  get exitCode(): ExitCode {
    return EXIT_BY_CODE[this.code];
  }
}

export interface FailureEnvelope {
  ok: false;
  command: string;
  error: { code: CliErrorCode; message: string };
}

export interface SuccessEnvelope {
  ok: true;
  command: string;
  result: unknown;
}

/** oclif reports argument and flag problems as CLIParseError, unknown commands as CLIError; both are usage errors. */
function isUsageError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  for (
    let proto = Object.getPrototypeOf(error) as object | null;
    proto;
    proto = Object.getPrototypeOf(proto) as object | null
  ) {
    const name = (proto as { constructor?: { name?: string } }).constructor?.name;
    if (name === 'CLIParseError' || name === 'CLIError') return true;
  }
  return false;
}

/** Maps any error to the error code, message and exit code reported to the caller. */
export function describeFailure(error: unknown): { code: CliErrorCode; message: string; exitCode: ExitCode } {
  if (error instanceof CliError) return { code: error.code, message: error.message, exitCode: error.exitCode };
  const message = (error instanceof Error ? error.message : String(error)).replace(/\nSee more help with --help$/, '');
  if (isUsageError(error)) return { code: CliErrorCodes.USAGE, message, exitCode: ExitCode.USAGE };
  return { code: CliErrorCodes.INTERNAL, message, exitCode: ExitCode.OTHER };
}

export function failureEnvelope(command: string, error: unknown): FailureEnvelope {
  const { code, message } = describeFailure(error);
  return { ok: false, command, error: { code, message } };
}
