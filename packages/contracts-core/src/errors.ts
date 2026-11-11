/** Error codes shared by every component; each code is stable once released. */
export const ErrorCodes = {
  /** A plugin depends on a platform service that has no implementation in this backend. */
  SERVICE_NOT_IMPLEMENTED: 'FASRUN_SERVICE_NOT_IMPLEMENTED',
  /** Configuration is missing or does not pass validation. */
  CONFIG_INVALID: 'FASRUN_CONFIG_INVALID',
  /** Two features register the same plugin, module or extension point. */
  FEATURE_CONFLICT: 'FASRUN_FEATURE_CONFLICT',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Typed error carrying a stable code and structured details for logs and API responses. */
export class FasrunError extends Error {
  readonly code: ErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FasrunError';
    this.code = code;
    this.details = details;
  }
}

export function isFasrunError(value: unknown, code?: ErrorCode): value is FasrunError {
  return value instanceof FasrunError && (code === undefined || value.code === code);
}
