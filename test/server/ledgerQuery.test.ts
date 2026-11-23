import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { openDb } from '../../src/server/db/open';
import { resolveDataPaths } from '../../src/server/paths';
import { createImportService } from '../../src/server/services/importService';
import { createLedgerQuery, type LedgerFilter, type LedgerQuery } from '../../src/server/services/ledgerQuery';
import { buildExportXlsx, tx } from '../support/fixture';

let q: LedgerQuery;
beforeEach(() => {
  const paths = resolveDataPaths(mkdtempSync(join(tmpdir(), 'spendprint-')));
  const db = openDb(paths.db);
  const svc = createImportService(db, paths);
  const add = (start: string, end: string, transactions: ReturnType<typeof tx>[]) =>
    svc.apply(svc.preview(`${start}~${end}.xlsx`, buildExportXlsx({ window: { start, end }, transactions })).token);
  add('2026-01-01', '2026-03-31', [
    tx('2026-03-10', -12000, '택시 100%', '카드 A', { major: '교통', minor: '택시', time: '23:10:00' }),
    tx('2026-03-10', -4500, "카페 O'Brien", '카드 B', { major: '카페/간식', minor: '커피/음료', time: '09:00:00', memo: '회의' }),
    tx('2026-02-01', 3000000, '회사급여', '통장 A', { type: '이체', major: '저축' }),
    tx('2026-01-15', 0, '이자', '통장 A', { type: '수입', major: '금융수입' }),
    tx('2026-01-10', -30, '해외 결제', '카드 A', { currency: 'USD', major: '온라인쇼핑' }),
  ]);
  add('2026-06-01', '2026-06-30', [tx('2026-06-05', -100, '편의점', '카드 A', { major: '생활' })]);
  q = createLedgerQuery(db);
});
const contents = (f: LedgerFilter) => q.page(f).items.map((r) => r.content);

it('lists newest first, hides zero amounts by default and sums KRW only', () => {
  const p = q.page({});
  expect(p.items.map((r) => r.content)).toEqual(['편의점', '택시 100%', "카페 O'Brien", '회사급여', '해외 결제']);
  expect(p.total).toBe(5);
  expect(p.sumAmount).toBe(-100 - 12000 - 4500 + 3000000);
  expect(q.page({ includeZero: true }).total).toBe(6);
  expect(p.items[0]).toMatchObject({ sourceFilename: '2026-06-01~2026-06-30.xlsx', keptFromVanishedMethod: false, extra: {} });
});

it('filters by each condition', () => {
  expect(contents({ from: '2026-02-01', to: '2026-03-10' })).toEqual(['택시 100%', "카페 O'Brien", '회사급여']);
  expect(contents({ types: ['이체'] })).toEqual(['회사급여']);
  expect(contents({ majors: ['교통', '생활'] })).toEqual(['편의점', '택시 100%']);
  expect(contents({ minors: ['택시'] })).toEqual(['택시 100%']);
  expect(contents({ methods: ['카드 B'] })).toEqual(["카페 O'Brien"]);
  expect(contents({ minAmount: 10000, maxAmount: 3000000 })).toEqual(['택시 100%', '회사급여']);
  expect(contents({ hasMemo: true })).toEqual(["카페 O'Brien"]);
  expect(contents({ q: '회의' })).toEqual(["카페 O'Brien"]);
  expect(contents({ q: "o'brien" })).toEqual(["카페 O'Brien"]);
  expect(contents({ q: '100%' })).toEqual(['택시 100%']);
  expect(contents({ q: '%' })).toEqual(['택시 100%']);
  expect(contents({ majors: ['교통'], methods: ['카드 B'] })).toEqual([]);
});

it('pages with a stable total', () => {
  const p = q.page({ limit: 2, offset: 2 });
  expect(p.items.map((r) => r.content)).toEqual(["카페 O'Brien", '회사급여']);
  expect(p.total).toBe(5);
  expect(q.page({ limit: 9999 }).items.length).toBeLessThanOrEqual(500);
});

it('gets one row, facets and status', () => {
  const first = q.page({}).items[0];
  expect(q.get(first.fingerprint)).toEqual(first);
  expect(q.get('nope')).toBeNull();
  expect(q.facets()).toMatchObject({ types: ['수입', '이체', '지출'], methods: ['카드 A', '카드 B', '통장 A'], minDate: '2026-01-10', maxDate: '2026-06-05' });
  expect(q.status()).toEqual({ hasData: true, importCount: 2, ledgerCount: 6, latestAsOf: '2026-06-30', gaps: [{ start: '2026-04-01', end: '2026-05-31' }] });
});
