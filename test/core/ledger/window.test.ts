import { expect, it } from 'vitest';
import { resolveWindow, windowFromFilename } from '../../../src/core/ledger/window';

it('reads the window from the file name', () => {
  const w = { start: '2025-11-23', end: '2026-11-23' };
  expect(windowFromFilename('2025-11-23~2026-11-23.xlsx')).toEqual(w);
  expect(windowFromFilename('2025-11-23~2026-11-23 (1).xlsx')).toEqual(w);
  expect(windowFromFilename('가계부.xlsx')).toBeNull();
  expect(windowFromFilename('2026-13-01~2026-11-23.xlsx')).toBeNull();
  expect(windowFromFilename('2026-11-23~2025-11-23.xlsx')).toBeNull();
});

it('widens the window with the data and falls back to it', () => {
  expect(resolveWindow('2025-11-23~2026-11-23.xlsx', ['2025-11-20', '2026-11-25'])).toEqual({ start: '2025-11-20', end: '2026-11-25' });
  expect(resolveWindow('2025-11-23~2026-11-23.xlsx', [])).toEqual({ start: '2025-11-23', end: '2026-11-23' });
  expect(resolveWindow('가계부.xlsx', ['2026-03-01', '2026-01-05'])).toEqual({ start: '2026-01-05', end: '2026-03-01' });
  expect(() => resolveWindow('가계부.xlsx', [])).toThrow('파일명에서 기간을 읽을 수 없고 거래도 없어요');
});
