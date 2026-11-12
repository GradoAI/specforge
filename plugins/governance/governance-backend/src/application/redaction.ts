import type { JsonValue } from '@fasrun/contracts-core';

const SECRET_KEY = /password|secret|token|authorization|cookie|credential|private.?key/i;
/** Apply before every sink; explicit secret literals also cover credentials embedded in ordinary error text. */
export function createRedactor(secretValues: readonly string[] = []): (value: JsonValue) => JsonValue {
  const secrets = secretValues.filter((value) => value.length > 0).sort((a, b) => b.length - a.length);
  function redact(value: JsonValue): JsonValue {
    if (typeof value === 'string') {
      let result = value
        .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
        .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/]+@/gi, '$1[REDACTED]@')
        .replace(
          /\b(password|passwd|pwd|token|access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s&;,]+)/gi,
          '$1=[REDACTED]',
        )
        .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '[REDACTED]');
      for (const secret of secrets) result = result.split(secret).join('[REDACTED]');
      return result;
    }
    if (Array.isArray(value)) return value.map(redact);
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          SECRET_KEY.test(key) && key !== 'authorizationId' ? '[REDACTED]' : redact(item),
        ]),
      );
    return value;
  }
  return redact;
}
/** These wrappers never forward the original unredacted object or exception to the sink. */
export function safeDiagnostics(redact: (value: JsonValue) => JsonValue, sink: (value: JsonValue) => void) {
  return {
    log(value: JsonValue): void {
      sink(redact(value));
    },
    error(error: unknown): JsonValue {
      return redact({ message: error instanceof Error ? error.message : String(error) });
    },
  };
}
