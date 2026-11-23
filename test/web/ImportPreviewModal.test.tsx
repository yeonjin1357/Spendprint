import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { ImportPreview } from '../../src/server/services/importService';
import { ImportPreviewModal } from '../../src/web/features/import/ImportPreviewModal';

const preview = (over: Partial<ImportPreview> = {}): ImportPreview => ({
  token: 't', filename: '2026-04-01~2026-09-30.xlsx', window: { start: '2026-04-01', end: '2026-09-30' }, rowCount: 42,
  alreadyImported: false, added: 5, changed: 2, removed: 1, unchanged: 34,
  cashflowCheckedCells: 12, cashflowMismatchCount: 0, cashflowMismatches: [],
  vanishedMethods: [], renamedMethods: [], oldRemovedByMethod: [], formatDriftSuspected: false, warnings: [],
  samples: { added: [], removed: [], changed: [] }, ...over,
});
const show = (p: ImportPreview, onApply = vi.fn()) => { render(<ImportPreviewModal preview={p} busy={false} onApply={onApply} onCancel={vi.fn()} />); return onApply; };

it('shows the period, counts and a clean check', () => {
  const onApply = show(preview());
  expect(screen.getByText('가져오기 전에 확인해 주세요')).toBeTruthy();
  expect(screen.getByText('2026.04.01 ~ 2026.09.30')).toBeTruthy();
  expect(screen.getByText('거래 42건')).toBeTruthy();
  for (const t of ['추가 5', '변경 2', '사라짐 1', '뱅크샐러드 요약표와 모두 일치해요']) expect(screen.getByText(t)).toBeTruthy();
  fireEvent.click(screen.getByText('적용하기'));
  expect(onApply).toHaveBeenCalledOnce();
});

it('explains every warning condition', () => {
  show(preview({
    cashflowMismatchCount: 1, cashflowMismatches: [{ section: 'expense', label: '식비', month: '2026-05', sheet: 5001, computed: 5000 }],
    vanishedMethods: [{ method: 'Y카드', keptCount: 3 }], renamedMethods: [{ from: 'W카드', to: 'Z카드', count: 2 }],
    oldRemovedByMethod: [{ method: 'X카드', count: 4 }], formatDriftSuspected: true, warnings: ['원화가 아닌 거래가 1건 있어요. 합계에서 빠져요'],
  }));
  for (const t of ['요약표와 1칸이 달라요', '새 파일에 없는 결제수단이 있어요. 이전 기록은 그대로 둘게요', '이름이 바뀐 것 같아요', 'W카드 → Z카드', '오래된 거래가 사라져요', '파일의 표기가 달라진 것 같아요. 적용하기 전에 사라지는 거래를 확인해 주세요', '원화가 아닌 거래가 1건 있어요. 합계에서 빠져요']) {
    expect(screen.getByText(t)).toBeTruthy();
  }
});

it('cannot apply a file that was already imported', () => {
  const onApply = show(preview({ alreadyImported: true, added: 0, changed: 0, removed: 0 }));
  expect(screen.getByText('이미 가져온 파일이에요')).toBeTruthy();
  fireEvent.click(screen.getByText('적용하기'));
  expect(onApply).not.toHaveBeenCalled();
});
