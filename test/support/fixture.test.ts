import { expect, it } from 'vitest';
import { cellAt, getSheet, readXlsx, rowCells } from '../../src/core/xlsx/readXlsx';
import { buildExportXlsx, excelSerial, excelTimeFraction, exportFilename, tx } from './fixture';

const wb = () => readXlsx(buildExportXlsx({
  window: { start: '2025-11-23', end: '2026-11-23' },
  transactions: [
    tx('2026-10-05', -15000, '택시', '카드 A', { major: '교통' }),
    tx('2026-11-23', -8700, '편의점 A', '카드 A', { time: '09:56:42', major: '생활', memo: '간식' }),
  ],
  assets: [{ group: '자유입출금 자산', name: '저축예금', amount: 6 }, { group: '자유입출금 자산', name: '저축예금', amount: 530 }],
}));

it('converts dates and times like Excel', () => {
  expect(excelSerial('2025-01-01')).toBe(45658);
  expect(excelSerial('2025-11-24')).toBe(45985);
  expect(excelSerial('2026-11-23')).toBe(46349);
  expect(excelTimeFraction('12:00:00')).toBe(0.5);
  expect(exportFilename({ start: '2025-11-23', end: '2026-11-23' })).toBe('2025-11-23~2026-11-23.xlsx');
});

it('writes the ledger sheet newest first with typed cells', () => {
  const s = getSheet(wb(), '가계부 내역')!;
  expect(rowCells(s, 1).map((c) => c.value)).toEqual(['날짜', '시간', '타입', '대분류', '소분류', '내용', '금액', '화폐', '결제수단', '메모']);
  expect(cellAt(s, 'A', 2)!.value).toBe(46349);
  expect(cellAt(s, 'B', 2)!.value).toBeCloseTo(35802 / 86400, 10);
  expect(cellAt(s, 'G', 2)!.value).toBe(-8700);
  expect(cellAt(s, 'J', 2)!.value).toBe('간식');
  expect(cellAt(s, 'J', 3)).toBeUndefined();
});

it('lays out the summary sheet like the real export', () => {
  const s = getSheet(wb(), '뱅샐현황')!;
  const titles = [...s.cells.values()].filter((c) => c.col === 'B' && /^\d\./.test(String(c.value))).map((c) => c.value);
  expect(titles).toEqual(['1.고객정보', '2.현금흐름현황', '3.재무현황', '4.보험현황', '5.투자현황', '6.대출현황']);
  const header = [...s.cells.values()].find((c) => c.value === '항목' && cellAt(s, 'C', c.row)?.value === '총계')!;
  expect(rowCells(s, header.row).slice(3).map((c) => c.value)).toHaveLength(13);
  expect(cellAt(s, 'E', header.row)!.value).toBe('2025-11');
  const total = [...s.cells.values()].find((c) => c.value === '월지출 총계')!;
  expect(cellAt(s, 'E', total.row)).toMatchObject({ value: 0, isFormula: true });
  expect([...s.cells.values()].some((c) => c.value === '연령\n(만 나이)')).toBe(true);
  const groupCells = [...s.cells.values()].filter((c) => c.value === '자유입출금 자산');
  expect(groupCells).toHaveLength(1);
  expect(s.merges.some((m) => m.startsWith(`B${groupCells[0].row}:B`))).toBe(true);
});
