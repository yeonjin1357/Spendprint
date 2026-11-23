import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { LedgerRow } from '../../src/server/services/ledgerQuery';
import { api } from '../../src/web/lib/api';
import { AmountVisibilityProvider } from '../../src/web/lib/amountVisibility';
import { TransactionsPage } from '../../src/web/pages/TransactionsPage';

const row = (over: Partial<LedgerRow>): LedgerRow => ({ fingerprint: 'f0', importId: 1, sourceFilename: '2026-01-01~2026-06-30.xlsx', date: '2026-05-10', time: '09:56:42', type: '지출', major: '교통', minor: '택시', content: '택시', amount: -12000, currency: 'KRW', method: '카드 A', memo: '', extra: {}, keptFromVanishedMethod: false, ...over });
const facets = { types: ['지출'], majors: ['교통'], minors: ['택시'], methods: ['카드 A'], minDate: '2026-01-01', maxDate: '2026-06-30' };
const open = () => render(<AmountVisibilityProvider><TransactionsPage /></AmountVisibilityProvider>);

it('groups by date and shows every original field in the detail', async () => {
  vi.spyOn(api, 'ledgerFacets').mockResolvedValue(facets);
  vi.spyOn(api, 'ledger').mockResolvedValue({ total: 3, sumAmount: -9300, items: [
    row({ fingerprint: 'a', content: '<img src=x onerror=alert(1)>', memo: '=SUM(A1)', extra: { 태그: '여행' } }),
    row({ fingerprint: 'b', content: '환불', amount: 3000, time: '00:00:00', keptFromVanishedMethod: true }),
    row({ fingerprint: 'c', date: '2026-05-09', content: '편의점', amount: -300 }),
  ] });
  const { container } = open();
  expect(await screen.findByText('5월 10일 일요일')).toBeTruthy();
  expect(screen.getByText('5월 9일 토요일')).toBeTruthy();
  expect(screen.getByText('3건 · 합계 -9,300원')).toBeTruthy();
  expect(screen.getByText('+3,000원')).toBeTruthy();
  expect(screen.getByText('이전 파일 기록')).toBeTruthy();
  expect(screen.getByText('교통 · 택시 · 카드 A')).toBeTruthy();
  expect(container.querySelector('img')).toBeNull();
  fireEvent.click(screen.getByText('<img src=x onerror=alert(1)>'));
  const detail = within(await screen.findByRole('complementary'));
  for (const t of ['2026-05-10', '09:56:42', '지출', '교통', '택시', '-12,000원', 'KRW', '카드 A', '=SUM(A1)', '태그', '여행', '2026-01-01~2026-06-30.xlsx']) {
    expect(detail.getAllByText(t).length).toBeGreaterThan(0);
  }
});

it('loads more and shows an empty state', async () => {
  vi.spyOn(api, 'ledgerFacets').mockResolvedValue(facets);
  const ledger = vi.spyOn(api, 'ledger').mockResolvedValueOnce({ total: 150, sumAmount: -1, items: Array.from({ length: 100 }, (_, i) => row({ fingerprint: `p${i}`, content: `가게 ${i}` })) })
    .mockResolvedValueOnce({ total: 150, sumAmount: -1, items: [row({ fingerprint: 'last', content: '마지막 가게' })] });
  open();
  fireEvent.click(await screen.findByText('더 보기'));
  expect(await screen.findByText('마지막 가게')).toBeTruthy();
  expect(ledger.mock.calls[1][0]).toMatchObject({ limit: 100, offset: 100 });
  ledger.mockResolvedValue({ total: 0, sumAmount: 0, items: [] });
  fireEvent.change(screen.getByPlaceholderText('가맹점이나 메모 검색'), { target: { value: '없는 가게' } });
  await waitFor(() => expect(screen.getByText('조건에 맞는 거래가 없어요')).toBeTruthy());
  expect(ledger.mock.calls.at(-1)![0]).toMatchObject({ q: '없는 가게', offset: 0 });
});

it('hides the total when amounts are hidden', async () => {
  window.localStorage.setItem('spendprint.hideAmounts', '1');
  vi.spyOn(api, 'ledgerFacets').mockResolvedValue(facets);
  vi.spyOn(api, 'ledger').mockResolvedValue({ total: 1, sumAmount: -12000, items: [row({})] });
  open();
  expect(await screen.findByText('1건 · 합계 •••원')).toBeTruthy();
  expect(screen.queryByText('-12,000원')).toBeNull();
});
