import type { CashflowTable, RawTransaction } from '../banksalad/types';

export interface CashflowMismatch {
  section: 'income' | 'expense';
  label: string;
  month: string;
  sheet: number;
  computed: number;
}

export interface CashflowCheck {
  checkedCells: number;
  mismatches: CashflowMismatch[];
}

const SECTION_TYPE = { income: '수입', expense: '지출' } as const;

/**
 * Cross-checks Banksalad's own cashflow table against the transaction list of the same file.
 * Each cell equals the absolute value of the summed amounts of that type, category and month.
 * A mismatch means the file is inconsistent or its format changed.
 */
export function checkCashflow(table: CashflowTable, txs: RawTransaction[]): CashflowCheck {
  const sums = new Map<string, number>();
  for (const t of txs) {
    const key = `${t.type}\u001f${t.major}\u001f${t.date.slice(0, 7)}`;
    sums.set(key, (sums.get(key) ?? 0) + t.amount);
  }
  const result: CashflowCheck = { checkedCells: 0, mismatches: [] };
  for (const section of ['income', 'expense'] as const) {
    for (const row of table[section]) {
      table.months.forEach((month, i) => {
        result.checkedCells += 1;
        const sheet = row.values[i] ?? 0;
        const computed = Math.abs(sums.get(`${SECTION_TYPE[section]}\u001f${row.label}\u001f${month}`) ?? 0);
        if (Math.abs(sheet - computed) > 0.5) result.mismatches.push({ section, label: row.label, month, sheet, computed });
      });
    }
  }
  return result;
}
