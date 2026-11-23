import { expect, it } from 'vitest';
import { fingerprintRows, twinKey } from '../../../src/core/ledger/fingerprint';
import { raw, rows } from '../../support/raw';

const a = raw('2026-05-10', -5000, '가게', '카드 A');

it('depends on date, time, amount, content and method only', () => {
  const fp = (r = a) => fingerprintRows([r])[0];
  expect(fp()).toMatch(/^[0-9a-f]{20}#0$/);
  for (const over of [{ date: '2026-05-11' }, { time: '12:00:01' }, { amount: -5001 }, { content: '가게2' }, { method: '카드 B' }]) {
    expect(fp({ ...a, ...over })).not.toBe(fp());
  }
  expect(fp({ ...a, type: '이체', major: '교통', minor: '택시', memo: '메모', rowIndex: 7 })).toBe(fp());
});

it('numbers identical rows from the oldest', () => {
  const [top, bottom] = fingerprintRows(rows(a, a));
  expect(top.endsWith('#1')).toBe(true);
  expect(bottom.endsWith('#0')).toBe(true);
  expect(top.slice(0, 20)).toBe(bottom.slice(0, 20));
});

it('builds a twin key without the method', () => {
  expect(twinKey(a)).toBe(twinKey({ ...a, method: '카드 B' }));
  expect(twinKey(a)).not.toBe(twinKey({ ...a, content: '가게2' }));
});
