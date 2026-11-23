import { expect, it } from 'vitest';
import { parseExport } from '../../../src/core/banksalad/parseExport';
import type { ExportFormatError } from '../../../src/core/banksalad/types';
import { getSheet, readXlsx } from '../../../src/core/xlsx/readXlsx';
import { buildExportXlsx, tx, type FixtureOptions } from '../../support/fixture';

const build = (over: Partial<FixtureOptions> = {}) => buildExportXlsx({
  window: { start: '2025-11-23', end: '2026-11-23' },
  transactions: [
    tx('2026-11-23', -8700, '편의점 A', '카드 A', { time: '09:56:42', major: '생활', minor: '편의점' }),
    tx('2026-11-20', 3000000, '회사급여', '통장 A', { type: '이체', major: '저축', time: '00:00:00' }),
    tx('2026-10-05', -15000, '택시', '카드 A', { major: '교통', minor: '택시', time: '23:59:59', memo: '야근' }),
    tx('2026-10-05', 15000, '택시', '카드 A', { type: '지출', major: '교통', minor: '택시', time: '23:59:58' }),
    tx('2026-01-02', 100, '이자', '통장 A', { type: '수입', major: '미분류' }),
    tx('2026-01-03', -200, '알 수 없음', '카드 A', { major: '미분류' }),
  ],
  assets: [
    { group: '자유입출금 자산', name: '저축예금', amount: 6 },
    { group: '자유입출금 자산', name: '저축예금', amount: 530 },
    { group: '투자성 자산', name: '기본계좌', amount: 428.967 },
  ],
  liabilities: [{ group: '장기대출', name: '전세대출', amount: 1000000 }],
  investments: [{ kind: '주식', company: '증권 A', name: '종목 A', principal: 1000, valuation: 1500, returnPct: 50 }],
  ...over,
});
const parse = (over: Partial<FixtureOptions> = {}) => parseExport(readXlsx(build(over)));
const problems = (over: Partial<FixtureOptions>) => { try { parse(over); return []; } catch (e) { return (e as ExportFormatError).problems; } };

it('parses every transaction field in file order', () => {
  const { transactions: t, warnings } = parse();
  expect(warnings).toEqual([]);
  expect(t).toHaveLength(6);
  expect(t[0]).toEqual({ rowIndex: 0, date: '2026-11-23', time: '09:56:42', type: '지출', major: '생활', minor: '편의점', content: '편의점 A', amount: -8700, currency: 'KRW', method: '카드 A', memo: '', extra: {} });
  expect(t[1]).toMatchObject({ date: '2026-11-20', time: '00:00:00', type: '이체', amount: 3000000 });
  expect(t[2]).toMatchObject({ time: '23:59:59', memo: '야근', amount: -15000 });
  expect(t[3]).toMatchObject({ time: '23:59:58', amount: 15000 });
});

it('parses the summary sheet', () => {
  const { snapshot: s } = parse();
  expect(s.profile).toEqual({ name: '김테스트', gender: '여', age: 30, creditScore: 900, email: '' });
  expect(s.cashflow.months).toHaveLength(13);
  expect(s.cashflow.months[0]).toBe('2025-11');
  expect(s.cashflow.income.map((r) => r.label)).toEqual(['미분류']);
  expect(s.cashflow.expense.map((r) => r.label).sort()).toEqual(['교통', '미분류', '생활']);
  expect(s.cashflow.expense.find((r) => r.label === '교통')!.values[s.cashflow.months.indexOf('2026-10')]).toBe(0);
  expect(s.assets).toEqual([
    { side: 'asset', group: '자유입출금 자산', name: '저축예금', amount: 6, ordinal: 0 },
    { side: 'asset', group: '자유입출금 자산', name: '저축예금', amount: 530, ordinal: 1 },
    { side: 'asset', group: '투자성 자산', name: '기본계좌', amount: 428.967, ordinal: 0 },
    { side: 'liability', group: '장기대출', name: '전세대출', amount: 1000000, ordinal: 0 },
  ]);
  expect(s.investments).toEqual([{ kind: '주식', company: '증권 A', name: '종목 A', principal: 1000, valuation: 1500, returnPct: 50, startDate: null, maturityDate: null }]);
  expect(s.insurance).toEqual([]);
  expect(s.loans).toEqual([]);
});

it('keeps every cell of the summary sheet as raw data', () => {
  const sheet = getSheet(readXlsx(build()), '뱅샐현황')!;
  const { snapshot } = parse();
  expect(Object.keys(snapshot.rawCells)).toHaveLength(sheet.cells.size);
  expect(snapshot.rawMerges).toEqual(sheet.merges);
});

it('parses insurance, loans and dated investments when present', () => {
  const { snapshot: s } = parse({
    insurance: [{ company: '보험 A', name: '실손', status: '정상', paidTotal: 500000, contractDate: '2020-03-01' }],
    loans: [{ kind: '신용대출', company: '은행 A', name: '대출 A', principal: 1000, balance: 400, ratePct: 4.5, startDate: '2024-01-15', maturityDate: '2027-01-15' }],
    investments: [{ kind: '펀드', company: '은행 A', name: '펀드 A', principal: 0, valuation: 0, startDate: '2025-12-03' }],
  });
  expect(s.insurance).toEqual([{ company: '보험 A', name: '실손', status: '정상', paidTotal: 500000, contractDate: '2020-03-01', maturityDate: null }]);
  expect(s.loans[0]).toEqual({ kind: '신용대출', company: '은행 A', name: '대출 A', principal: 1000, balance: 400, ratePct: 4.5, startDate: '2024-01-15', maturityDate: '2027-01-15' });
  expect(s.investments[0]).toMatchObject({ returnPct: null, startDate: '2025-12-03' });
});

it('reports everything that is missing, and imports nothing', () => {
  expect(problems({ drop: { sheet: '가계부 내역' } })).toEqual(["시트 '가계부 내역'이 없어요"]);
  expect(problems({ drop: { txColumn: '결제수단' } })).toEqual(["'가계부 내역'에 '결제수단' 열이 없어요"]);
  expect(problems({ drop: { section: '재무현황' } })).toEqual(["'뱅샐현황'에 '재무현황' 구역이 없어요"]);
  expect(problems({ drop: { txColumn: '금액', section: '투자현황' } })).toHaveLength(2);
});

it('imports unknown additions with a warning', () => {
  const r = parse({ extra: { txColumn: { name: '태그', value: '여행' }, section: '7.기타현황' } });
  expect(r.warnings.map((w) => w.code).sort()).toEqual(['UNKNOWN_SECTION', 'UNKNOWN_TX_COLUMN']);
  expect(r.transactions[0].extra).toEqual({ 태그: '여행' });
});

it('warns about non-KRW rows and accepts an empty ledger', () => {
  expect(parse({ transactions: [tx('2026-01-02', -10, '해외', '카드 A', { currency: 'USD' })] }).warnings).toEqual([{ code: 'NON_KRW', message: '원화가 아닌 거래가 1건 있어요. 합계에서 빠져요' }]);
  expect(parse({ transactions: [] }).transactions).toEqual([]);
});
