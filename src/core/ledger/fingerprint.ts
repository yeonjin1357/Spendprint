import { createHash } from 'node:crypto';
import type { RawTransaction } from '../banksalad/types';

const SEP = '\u001f';

/** Date, time, amount and content: what stays the same when only the payment method's name changes. */
export function twinKey(r: RawTransaction): string {
  return [r.date, r.time, r.amount, r.content].join(SEP);
}

/**
 * One fingerprint per row, in the same order as `rows`.
 * Type, categories and memo are left out on purpose, so a transaction that was only
 * re-categorised in Banksalad keeps its fingerprint. Identical rows are numbered from the oldest (last) one.
 */
export function fingerprintRows(rows: RawTransaction[]): string[] {
  const out = new Array<string>(rows.length);
  const seen = new Map<string, number>();
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const r = rows[i];
    const base = createHash('sha1').update([r.date, r.time, r.amount, r.content, r.method].join(SEP)).digest('hex').slice(0, 20);
    const ordinal = seen.get(base) ?? 0;
    seen.set(base, ordinal + 1);
    out[i] = `${base}#${ordinal}`;
  }
  return out;
}
