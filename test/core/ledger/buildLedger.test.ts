import { expect, it } from 'vitest';
import type { RawTransaction } from '../../../src/core/banksalad/types';
import { buildLedger, type ImportFile } from '../../../src/core/ledger/buildLedger';
import { raw, rows } from '../../support/raw';

const file = (id: number, start: string, end: string, list: RawTransaction[], importedSeq = id): ImportFile =>
  ({ id, window: { start, end }, importedSeq, transactions: rows(...list) });
const view = (files: ImportFile[]) => buildLedger(files).entries.map((e) => `${e.date} ${e.content} ${e.method} ${e.major} f${e.importId}${e.keptFromVanishedMethod ? ' kept' : ''}`);

const A = file(1, '2026-01-01', '2026-06-30', [
  raw('2026-05-10', -3000, '사라질 가게', 'X카드'),
  raw('2026-05-10', -5000, '가게', 'X카드', { major: '식비' }),
  raw('2026-02-01', -1000, '옛 가게', 'X카드'),
]);
const B = file(2, '2026-04-01', '2026-09-30', [
  raw('2026-08-01', -7000, '새 가게', 'X카드'),
  raw('2026-05-10', -5000, '가게', 'X카드', { major: '뷰티/미용' }),
]);

it('returns every row of a single file', () => {
  expect(view([A])).toEqual(['2026-05-10 사라질 가게 X카드 식비 f1', '2026-05-10 가게 X카드 식비 f1', '2026-02-01 옛 가게 X카드 식비 f1']);
});

it('lets the newer file decide the overlapping period and keeps the older period', () => {
  expect(view([A, B])).toEqual(['2026-08-01 새 가게 X카드 식비 f2', '2026-05-10 가게 X카드 뷰티/미용 f2', '2026-02-01 옛 가게 X카드 식비 f1']);
});

it('does not depend on import order', () => {
  expect(buildLedger([B, A])).toEqual(buildLedger([A, B]));
});

it('breaks ties on the same end date by import sequence, and ignores late imports of old files', () => {
  const B2 = file(3, '2026-04-01', '2026-09-30', [raw('2026-08-01', -7000, '새 가게', 'X카드', { major: '카페/간식' })]);
  expect(view([B, B2])[0]).toBe('2026-08-01 새 가게 X카드 카페/간식 f3');
  const lateOld = { ...A, id: 9, importedSeq: 9 };
  expect(view([B, lateOld])).toEqual(view([A, B]).map((s) => s.replace('f1', 'f9')));
});

it('keeps the history of a payment method that vanished from newer files', () => {
  const A2 = file(1, '2026-01-01', '2026-06-30', [...A.transactions, raw('2026-05-12', -900, '서점', 'Y카드')]);
  const r = buildLedger([A2, B]);
  expect(view([A2, B])).toContain('2026-05-12 서점 Y카드 식비 f1 kept');
  expect(r.vanishedMethods).toEqual([{ method: 'Y카드', keptCount: 1 }]);
  expect(r.renamedMethods).toEqual([]);
});

it('treats a vanished method with a twin in the newer file as a rename', () => {
  const A3 = file(1, '2026-01-01', '2026-06-30', [raw('2026-05-10', -5000, '가게', 'Y카드'), raw('2026-05-10', -5000, '가게', 'Y카드')]);
  const B3 = file(2, '2026-04-01', '2026-09-30', [raw('2026-05-10', -5000, '가게', 'Z카드')]);
  const r = buildLedger([A3, B3]);
  expect(view([A3, B3])).toEqual(['2026-05-10 가게 Z카드 식비 f2', '2026-05-10 가게 Y카드 식비 f1 kept']);
  expect(r.renamedMethods).toEqual([{ from: 'Y카드', to: 'Z카드', count: 1 }]);
  expect(r.renamedPairs).toHaveLength(1);
  expect(r.renamedPairs[0].toFingerprint).toBe(r.entries[0].fingerprint);
});

it('drops kept history once the method reappears in a newer file', () => {
  const A2 = file(1, '2026-01-01', '2026-06-30', [raw('2026-05-12', -900, '서점', 'Y카드')]);
  const C = file(3, '2026-05-01', '2026-10-31', [raw('2026-10-01', -100, '문구', 'Y카드')]);
  expect(view([A2, B, C])).not.toContain('2026-05-12 서점 Y카드 식비 f1 kept');
});

it('uses the newest file that still has the method', () => {
  const A2 = file(1, '2026-01-01', '2026-06-30', [raw('2026-05-12', -900, '서점', 'Y카드'), raw('2026-02-02', -800, '옛 서점', 'Y카드')]);
  const B2 = file(2, '2026-04-01', '2026-09-30', [raw('2026-05-12', -950, '서점 정정', 'Y카드')]);
  const C = file(3, '2026-05-01', '2026-10-31', [raw('2026-10-01', -100, '문구', 'X카드')]);
  expect(view([A2, B2, C])).toEqual(['2026-10-01 문구 X카드 식비 f3', '2026-05-12 서점 정정 Y카드 식비 f2 kept', '2026-02-02 옛 서점 Y카드 식비 f1']);
});

it('does not bring back a renamed transaction that a still newer file removed', () => {
  const F1 = file(1, '2026-01-01', '2026-06-30', [raw('2026-05-10', -5000, '가게', 'W카드')]);
  const F2 = file(2, '2026-04-01', '2026-09-30', [raw('2026-05-10', -5000, '가게', 'Z카드')]);
  const F3 = file(3, '2026-05-01', '2026-10-31', [raw('2026-08-01', -100, '문구', 'Z카드')]);
  expect(view([F1, F2, F3])).toEqual(['2026-08-01 문구 Z카드 식비 f3']);
});

it('counts a transaction once when its payment method was renamed twice', () => {
  const F1 = file(1, '2026-01-01', '2026-06-30', [raw('2026-05-10', -5000, '가게', 'W카드')]);
  const F2 = file(2, '2026-04-01', '2026-09-30', [raw('2026-05-10', -5000, '가게', 'Y카드')]);
  const F3 = file(3, '2026-05-01', '2026-10-31', [raw('2026-05-10', -5000, '가게', 'Z카드')]);
  const r = buildLedger([F1, F2, F3]);
  expect(view([F1, F2, F3])).toEqual(['2026-05-10 가게 Z카드 식비 f3']);
  expect(r.vanishedMethods).toEqual([]);
  expect(r.renamedMethods).toEqual([{ from: 'W카드', to: 'Z카드', count: 1 }, { from: 'Y카드', to: 'Z카드', count: 1 }]);
  expect(new Set(r.renamedPairs.map((p) => p.toFingerprint))).toEqual(new Set([r.entries[0].fingerprint]));
});

it('keeps both of two identical rows and joins non-overlapping files', () => {
  const D = file(1, '2026-01-01', '2026-01-31', [raw('2026-01-05', -100, '자판기', 'X카드'), raw('2026-01-05', -100, '자판기', 'X카드')]);
  const E = file(2, '2026-03-01', '2026-03-31', [raw('2026-03-05', -200, '자판기', 'X카드')]);
  const r = buildLedger([D, E]);
  expect(r.entries).toHaveLength(3);
  expect(new Set(r.entries.map((e) => e.fingerprint)).size).toBe(3);
});
