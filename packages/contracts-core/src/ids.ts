import { ErrorCodes, FasrunError } from './errors.js';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PREFIX = /^[a-z][a-z0-9]*$/;

/** Shared by runtime validation and the database CHECK; prefixes are literal, never regular expressions. */
export function idPattern(prefix: string): string {
  if (!PREFIX.test(prefix)) throw new FasrunError(ErrorCodes.CONFIG_INVALID, 'Invalid identifier prefix');
  return `^${prefix}_[0-9A-HJKMNP-TV-Z]{26}$`;
}

/** 48-bit millisecond timestamp followed by 80 random bits, encoded as Crockford Base32. */
export function newId(prefix: string): string {
  idPattern(prefix);
  let time = '';
  for (let value = Date.now(), i = 0; i < 10; i++, value = Math.floor(value / 32)) {
    time = CROCKFORD.charAt(value % 32) + time;
  }
  const random = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => CROCKFORD.charAt(byte % 32));
  return `${prefix}_${time}${random.join('')}`;
}

export function isId(prefix: string, value: unknown): value is string {
  return typeof value === 'string' && value.length === prefix.length + 27 && new RegExp(idPattern(prefix)).test(value);
}
