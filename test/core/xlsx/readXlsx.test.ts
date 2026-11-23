import { expect, it, vi } from 'vitest';
import { zipSync } from 'fflate';
import { cellAt, getSheet, readXlsx, rowCells } from '../../../src/core/xlsx/readXlsx';
import type { XlsxError } from '../../../src/core/xlsx/types';
import { writeXlsx } from '../../support/writeXlsx';

const sample = (inlineStrings = false) => writeXlsx([
  { name: '뱅샐현황', merges: ['F5:G5'], cells: [
    { ref: 'B3', value: '1.고객정보' }, { ref: 'C5', value: 12.5 },
    { ref: 'D5', value: 0, formula: 'SUM(E5:Q5)' }, { ref: 'D6', value: '연령\n(만 나이)' },
  ] },
  { name: '가계부 내역', cells: [{ ref: 'A1', value: '날짜' }, { ref: 'A2', value: 45985 }] },
], { inlineStrings });

it.each([false, true])('reads strings, numbers and formulas (inlineStrings=%s)', (inline) => {
  const s = getSheet(readXlsx(sample(inline)), '뱅샐현황')!;
  expect(cellAt(s, 'B', 3)).toEqual({ ref: 'B3', col: 'B', row: 3, value: '1.고객정보', isFormula: false });
  expect(cellAt(s, 'C', 5)!.value).toBe(12.5);
  expect(cellAt(s, 'D', 5)).toMatchObject({ value: 0, isFormula: true });
  expect(cellAt(s, 'D', 6)!.value).toBe('연령\n(만 나이)');
  expect(cellAt(s, 'Z', 9)).toBeUndefined();
  expect(s.merges).toEqual(['F5:G5']);
  expect(s.maxRow).toBe(6);
  expect(rowCells(s, 5).map((c) => c.ref)).toEqual(['C5', 'D5']);
});

it('keeps sheet order', () => {
  expect(readXlsx(sample()).sheets.map((s) => s.name)).toEqual(['뱅샐현황', '가계부 내역']);
});

it.each(['<b>&"\'', '=SUM(A1)', ' 앞뒤 공백 ', '😀', '007'])('keeps text %j exactly', (text) => {
  const wb = readXlsx(writeXlsx([{ name: 's', cells: [{ ref: 'A1', value: text }] }]));
  expect(cellAt(wb.sheets[0], 'A', 1)!.value).toBe(text);
});

it('writes the same bytes for the same input at any time', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z')); const first = sample();
  vi.setSystemTime(new Date('2027-06-15T12:34:56Z')); const second = sample();
  vi.useRealTimers();
  expect(second).toEqual(first);
});

it('rejects input that is not a readable xlsx, with a code', () => {
  const code = (b: Uint8Array) => { try { readXlsx(b); return 'none'; } catch (e) { return (e as XlsxError).code; } };
  expect(code(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe('ENCRYPTED');
  expect(code(new TextEncoder().encode('hello'))).toBe('NOT_XLSX');
  expect(code(zipSync({ 'a.txt': new Uint8Array([1]) }))).toBe('NOT_XLSX');
  expect(code(sample().slice(0, 200))).toBe('CORRUPT');
});
