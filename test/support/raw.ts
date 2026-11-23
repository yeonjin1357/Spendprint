import type { RawTransaction } from '../../src/core/banksalad/types';

/** A parsed transaction for tests that work below the xlsx layer. */
export function raw(date: string, amount: number, content: string, method: string, over: Partial<RawTransaction> = {}): RawTransaction {
  return {
    rowIndex: 0, date, time: '12:00:00', type: amount < 0 ? '지출' : '수입', major: '식비', minor: '미분류',
    content, amount, currency: 'KRW', method, memo: '', extra: {}, ...over,
  };
}

/** Numbers the rows in the given order, as the parser would. */
export function rows(...list: RawTransaction[]): RawTransaction[] {
  return list.map((r, rowIndex) => ({ ...r, rowIndex }));
}
