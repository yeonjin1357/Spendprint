import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { App } from '../../src/web/App';
import { api } from '../../src/web/lib/api';

it('offers the onboarding when nothing has been imported', async () => {
  vi.spyOn(api, 'status').mockResolvedValue({ hasData: false, importCount: 0, ledgerCount: 0, latestAsOf: null, gaps: [] });
  render(<App />);
  expect(await screen.findByText('뱅크샐러드 내역을 올려 주세요')).toBeTruthy();
});

it('says it could not connect, instead of looking empty, when the server cannot be reached', async () => {
  vi.spyOn(api, 'status').mockRejectedValue(new Error('down'));
  render(<App />);
  expect(await screen.findByText('내역을 불러오지 못했어요')).toBeTruthy();
  expect(screen.queryByText('뱅크샐러드 내역을 올려 주세요')).toBeNull();
});
