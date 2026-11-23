import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { api } from '../../src/web/lib/api';
import { ImportsPage } from '../../src/web/pages/ImportsPage';

const record = { id: 7, filename: '2026-04-01~2026-09-30.xlsx', window: { start: '2026-04-01', end: '2026-09-30' }, importedAt: '2026-11-23T01:00:00.000Z', rowCount: 42,
  summary: { added: 5, changed: 2, removed: 1, unchanged: 34, cashflowCheckedCells: 12, cashflowMismatchCount: 0, vanishedMethods: [], renamedMethods: [], warnings: [] } };

it('lists imports, shows gaps and undoes after confirmation', async () => {
  vi.spyOn(api, 'listImports').mockResolvedValue([record]);
  vi.spyOn(api, 'status').mockResolvedValue({ hasData: true, importCount: 1, ledgerCount: 42, latestAsOf: '2026-09-30', gaps: [{ start: '2026-02-01', end: '2026-03-31' }] });
  const undo = vi.spyOn(api, 'undoImport').mockResolvedValue();
  render(<ImportsPage />);
  expect(await screen.findByText('2026-04-01~2026-09-30.xlsx')).toBeTruthy();
  expect(screen.getByText('기록이 없는 기간이 있어요')).toBeTruthy();
  expect(screen.getByText('2026.02.01 ~ 2026.03.31')).toBeTruthy();
  fireEvent.click(screen.getByText('되돌리기'));
  expect(undo).not.toHaveBeenCalled();
  expect(screen.getByText('이 가져오기를 되돌릴까요?')).toBeTruthy();
  fireEvent.click(screen.getAllByText('되돌리기').at(-1)!);
  await waitFor(() => expect(undo).toHaveBeenCalledWith(7));
});

it('does not look empty when the history could not be loaded', async () => {
  vi.spyOn(api, 'listImports').mockRejectedValue(new Error('down'));
  vi.spyOn(api, 'status').mockRejectedValue(new Error('down'));
  render(<ImportsPage />);
  expect(await screen.findByText('기록을 불러오지 못했어요')).toBeTruthy();
  expect(screen.queryByText('아직 가져온 파일이 없어요')).toBeNull();
});

it('says so when nothing has been imported', async () => {
  vi.spyOn(api, 'listImports').mockResolvedValue([]);
  vi.spyOn(api, 'status').mockResolvedValue({ hasData: false, importCount: 0, ledgerCount: 0, latestAsOf: null, gaps: [] });
  render(<ImportsPage />);
  expect(await screen.findByText('아직 가져온 파일이 없어요')).toBeTruthy();
});
