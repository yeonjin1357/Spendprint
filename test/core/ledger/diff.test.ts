import { expect, it } from 'vitest';
import { buildLedger } from '../../../src/core/ledger/buildLedger';
import { diffLedgers, findGaps } from '../../../src/core/ledger/diff';
import { raw, rows } from '../../support/raw';

const ledger = (id: number, ...list: Parameters<typeof rows>) =>
  buildLedger([{ id, importedSeq: id, window: { start: '2026-01-01', end: '2026-12-31' }, transactions: rows(...list) }]).entries;

it('classifies added, removed, changed and unchanged', () => {
  const before = ledger(1, raw('2026-05-10', -5000, '가게', 'X카드', { major: '카페/간식' }), raw('2026-05-09', -100, '취소될 것', 'X카드'), raw('2026-05-08', -200, '그대로', 'X카드'));
  const after = ledger(2, raw('2026-05-11', -700, '새 거래', 'X카드'), raw('2026-05-10', -5000, '가게', 'X카드', { major: '뷰티/미용' }), raw('2026-05-08', -200, '그대로', 'X카드'));
  const d = diffLedgers(before, after);
  expect(d.added.map((e) => e.content)).toEqual(['새 거래']);
  expect(d.removed.map((e) => e.content)).toEqual(['취소될 것']);
  expect(d.changed).toHaveLength(1);
  expect([d.changed[0].before.major, d.changed[0].after.major]).toEqual(['카페/간식', '뷰티/미용']);
  expect(d.unchangedCount).toBe(1);
});

it('finds uncovered date ranges', () => {
  expect(findGaps([{ start: '2026-01-01', end: '2026-03-31' }, { start: '2026-05-01', end: '2026-06-30' }])).toEqual([{ start: '2026-04-01', end: '2026-04-30' }]);
  expect(findGaps([{ start: '2026-01-01', end: '2026-03-31' }, { start: '2026-04-01', end: '2026-06-30' }])).toEqual([]);
  expect(findGaps([{ start: '2026-01-01', end: '2026-05-31' }, { start: '2026-03-01', end: '2026-06-30' }])).toEqual([]);
  expect(findGaps([])).toEqual([]);
});
