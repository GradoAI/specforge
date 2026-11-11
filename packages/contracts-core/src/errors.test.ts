import { describe, expect, it } from 'vitest';
import { ErrorCodes, FasrunError, isFasrunError } from './errors.js';

describe('FasrunError', () => {
  it('carries a stable code, details and the cause', () => {
    const cause = new Error('root cause');
    const error = new FasrunError(
      ErrorCodes.CONFIG_INVALID,
      'Missing FASRUN_CORE_PORT',
      { variable: 'FASRUN_CORE_PORT' },
      { cause },
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'FasrunError',
      code: 'FASRUN_CONFIG_INVALID',
      details: { variable: 'FASRUN_CORE_PORT' },
    });
    expect(error.cause).toBe(cause);
    expect(isFasrunError(error)).toBe(true);
    expect(isFasrunError(error, ErrorCodes.SERVICE_NOT_IMPLEMENTED)).toBe(false);
    expect(isFasrunError(new Error('x'))).toBe(false);
  });

  it('prefixes every error code with FASRUN_', () => {
    for (const code of Object.values(ErrorCodes)) expect(code).toMatch(/^FASRUN_[A-Z_]+$/);
  });
});
