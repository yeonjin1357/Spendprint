import { expect, it } from 'vitest';
import { parseExport } from '../../../src/core/banksalad/parseExport';
import { checkCashflow } from '../../../src/core/checks/cashflowCheck';
import { readXlsx } from '../../../src/core/xlsx/readXlsx';
import { buildExportXlsx, tx, type FixtureOptions } from '../../support/fixture';

const check = (over: Partial<FixtureOptions> = {}) => {
  const p = parseExport(readXlsx(buildExportXlsx({
    window: { start: '2026-01-01', end: '2026-03-31' },
    transactions: [
      tx('2026-01-10', -10000, '택시', '카드 A', { major: '교통' }),
      tx('2026-01-11', 3000, '택시 취소', '카드 A', { type: '지출', major: '교통' }),
      tx('2026-02-01', 5000, '환불만 있는 달', '카드 A', { type: '지출', major: '패션/쇼핑' }),
      tx('2026-02-02', 100, '이자', '통장 A', { type: '수입', major: '미분류' }),
      tx('2026-02-03', -200, '모름', '카드 A', { major: '미분류' }),
      tx('2026-03-01', -999999, '이체는 세지 않음', '통장 A', { type: '이체', major: '교통' }),
    ],
    ...over,
  })));
  return checkCashflow(p.snapshot.cashflow, p.transactions);
};

it('matches the sheet, using the absolute value of the net amount', () => {
  expect(check()).toEqual({ checkedCells: 12, mismatches: [] });
});

it('reports the exact cell that differs', () => {
  expect(check({ cashflowAdjust: [{ section: 'expense', label: '교통', month: '2026-01', delta: 500 }] }).mismatches)
    .toEqual([{ section: 'expense', label: '교통', month: '2026-01', sheet: 7500, computed: 7000 }]);
});
