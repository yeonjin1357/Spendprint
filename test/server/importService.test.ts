import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { openDb } from '../../src/server/db/open';
import { resolveDataPaths, type DataPaths } from '../../src/server/paths';
import { createImportService, type ImportError, type ImportService } from '../../src/server/services/importService';
import { buildExportXlsx, exportFilename, tx, type FixtureOptions, type FixtureTx } from '../support/fixture';

let paths: DataPaths; let db: ReturnType<typeof openDb>; let svc: ImportService; let clock: number;
beforeEach(() => {
  paths = resolveDataPaths(mkdtempSync(join(tmpdir(), 'spendprint-')));
  db = openDb(paths.db);
  clock = Date.UTC(2026, 10, 23, 1, 0, 0);
  svc = createImportService(db, paths, () => new Date((clock += 1000)));
});
const count = (table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
const ledger = () => db.prepare('SELECT date, time, type, major, content, amount, method, kept_from_vanished_method AS kept FROM ledger ORDER BY date DESC, time DESC, content').all();
const fileOf = (start: string, end: string, transactions: FixtureTx[], over: Partial<FixtureOptions> = {}) =>
  ({ name: exportFilename({ start, end }), bytes: buildExportXlsx({ window: { start, end }, transactions, ...over }) });
const errorCode = (fn: () => unknown) => { try { fn(); return 'none'; } catch (e) { return (e as ImportError).code; } };
const A = () => fileOf('2026-01-01', '2026-06-30', [
  tx('2026-05-10', -3000, '사라질 가게', 'X카드'), tx('2026-05-10', -5000, '가게', 'X카드', { time: '13:00:00' }), tx('2026-02-01', -1000, '옛 가게', 'X카드'),
]);
const B = () => fileOf('2026-04-01', '2026-09-30', [
  tx('2026-08-01', -7000, '새 가게', 'X카드'), tx('2026-05-10', -5000, '가게', 'X카드', { time: '13:00:00', major: '뷰티/미용' }),
]);
const importFile = (f: { name: string; bytes: Uint8Array }) => svc.apply(svc.preview(f.name, f.bytes).token).importId;

it('previews without writing anything', () => {
  const p = svc.preview(A().name, A().bytes);
  expect(p).toMatchObject({ filename: '2026-01-01~2026-06-30.xlsx', window: { start: '2026-01-01', end: '2026-06-30' }, rowCount: 3, alreadyImported: false, added: 3, changed: 0, removed: 0, unchanged: 0, cashflowMismatchCount: 0, formatDriftSuspected: false });
  expect(p.samples.added).toHaveLength(3);
  expect(count('imports') + count('raw_transactions') + count('ledger')).toBe(0);
  expect(readdirSync(paths.imports)).toEqual([]);
});

it('applies a file: rows, snapshot, original bytes and ledger', () => {
  const a = A(); const id = importFile(a);
  expect([count('imports'), count('raw_transactions'), count('snapshots'), count('ledger')]).toEqual([1, 3, 1, 3]);
  const stored = readdirSync(paths.imports);
  expect(stored).toHaveLength(1);
  expect(new Uint8Array(readFileSync(join(paths.imports, stored[0])))).toEqual(a.bytes);
  const snap = JSON.parse((db.prepare('SELECT data_json FROM snapshots WHERE import_id = ?').get(id) as { data_json: string }).data_json);
  expect(snap.profile.name).toBe('김테스트');
  expect(Object.keys(snap.rawCells).length).toBeGreaterThan(20);
  expect(svc.list()[0]).toMatchObject({ id, rowCount: 3, summary: { added: 3 } });
});

it('does nothing when the same file comes again', () => {
  importFile(A());
  const p = svc.preview(A().name, A().bytes);
  expect(p).toMatchObject({ alreadyImported: true, added: 0, changed: 0, removed: 0, unchanged: 3 });
  expect(errorCode(() => svc.apply(p.token))).toBe('ALREADY_IMPORTED');
  expect([count('imports'), count('ledger')]).toEqual([1, 3]);
});

it('merges an overlapping newer file and reports the difference', () => {
  importFile(A());
  const p = svc.preview(B().name, B().bytes);
  expect(p).toMatchObject({ added: 1, changed: 1, removed: 1, unchanged: 1 });
  expect(p.samples.removed[0].content).toBe('사라질 가게');
  svc.apply(p.token);
  expect(ledger().map((r: any) => `${r.date} ${r.content} ${r.major}`)).toEqual(['2026-08-01 새 가게 식비', '2026-05-10 가게 뷰티/미용', '2026-02-01 옛 가게 식비']);
});

it('gives the same ledger in either import order', () => {
  importFile(A()); importFile(B());
  const forward = ledger();
  db.exec('DELETE FROM imports; DELETE FROM ledger');
  importFile(B()); importFile(A());
  expect(ledger()).toEqual(forward);
});

it('undoes an import and restores the previous ledger', () => {
  importFile(A()); const before = ledger();
  const idB = importFile(B());
  svc.undo(idB);
  expect(ledger()).toEqual(before);
  expect(svc.list()).toHaveLength(1);
  expect(readdirSync(paths.imports)).toHaveLength(2);
  expect(errorCode(() => svc.undo(999))).toBe('NOT_FOUND');
});

it('backs up before changing existing data and keeps the newest 20', () => {
  importFile(A());
  expect(readdirSync(paths.backups)).toHaveLength(0);
  let idB = importFile(B());
  expect(readdirSync(paths.backups)).toHaveLength(1);
  for (let i = 0; i < 12; i++) { svc.undo(idB); idB = importFile(B()); }
  expect(readdirSync(paths.backups)).toHaveLength(20);
});

it('rejects unreadable or malformed files and leaves the data untouched', () => {
  importFile(A());
  expect(errorCode(() => svc.preview('a.xlsx', new TextEncoder().encode('hello')))).toBe('NOT_XLSX');
  expect(errorCode(() => svc.preview('a.xlsx', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])))).toBe('ENCRYPTED');
  const bad = fileOf('2026-04-01', '2026-09-30', [], { drop: { txColumn: '결제수단' } });
  let problems: string[] = [];
  try { svc.preview(bad.name, bad.bytes); } catch (e) { problems = (e as ImportError).problems; expect((e as ImportError).code).toBe('FORMAT'); }
  expect(problems).toEqual(["'가계부 내역'에 '결제수단' 열이 없어요"]);
  expect(errorCode(() => svc.apply('unknown-token'))).toBe('PREVIEW_EXPIRED');
  expect([count('imports'), count('ledger')]).toEqual([1, 3]);
});

it('rolls back completely when applying fails midway', () => {
  importFile(A());
  db.exec("CREATE TRIGGER boom BEFORE INSERT ON ledger BEGIN SELECT RAISE(ABORT, 'boom'); END");
  const p = svc.preview(B().name, B().bytes);
  expect(() => svc.apply(p.token)).toThrow();
  db.exec('DROP TRIGGER boom');
  expect([count('imports'), count('raw_transactions'), count('ledger')]).toEqual([1, 3, 3]);
  expect(readdirSync(paths.imports)).toHaveLength(1);
});

it('surfaces cashflow mismatches, vanished and renamed methods', () => {
  const mismatch = fileOf('2026-01-01', '2026-06-30', [tx('2026-05-10', -5000, '가게', 'X카드')], { cashflowAdjust: [{ section: 'expense', label: '식비', month: '2026-05', delta: 1 }] });
  expect(svc.preview(mismatch.name, mismatch.bytes)).toMatchObject({ cashflowMismatchCount: 1, cashflowMismatches: [{ label: '식비', month: '2026-05', sheet: 5001, computed: 5000 }] });
  importFile(fileOf('2026-01-01', '2026-06-30', [tx('2026-05-12', -900, '서점', 'Y카드'), tx('2026-05-10', -5000, '가게', 'W카드')]));
  const next = fileOf('2026-04-01', '2026-09-30', [tx('2026-05-10', -5000, '가게', 'Z카드')]);
  const p = svc.preview(next.name, next.bytes);
  expect(p.vanishedMethods).toEqual([{ method: 'Y카드', keptCount: 1 }]);
  expect(p.renamedMethods).toEqual([{ from: 'W카드', to: 'Z카드', count: 1 }]);
  svc.apply(p.token);
  expect(ledger().map((r: any) => `${r.content} ${r.method} ${r.kept}`)).toEqual(['서점 Y카드 1', '가게 Z카드 0']);
});

it('flags old removals and suspected format drift', () => {
  const many = (suffix: string) => Array.from({ length: 100 }, (_, i) => tx('2026-05-10', -(1000 + i), `가게${i < 25 ? suffix : ''} ${i}`, 'X카드', { time: `10:${String(i % 60).padStart(2, '0')}:00` }));
  importFile(fileOf('2026-01-01', '2026-06-30', [...many(''), tx('2026-06-29', -1, '최근', 'X카드')]));
  const next = fileOf('2026-04-01', '2026-09-30', [...many('*'), tx('2026-06-29', -1, '최근', 'X카드')]);
  const p = svc.preview(next.name, next.bytes);
  expect(p).toMatchObject({ added: 25, removed: 25, formatDriftSuspected: true });
  expect(p.oldRemovedByMethod).toEqual([{ method: 'X카드', count: 25 }]);
});

it('imports a file with no transactions', () => {
  const empty = fileOf('2027-01-01', '2027-01-31', []);
  expect(svc.preview(empty.name, empty.bytes)).toMatchObject({ rowCount: 0, added: 0 });
  importFile(empty);
  expect(count('imports')).toBe(1);
});
