import { act, renderHook, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/web/components/Toast';
import { useImport } from '../../src/web/features/import/useImport';
import { api, ApiError } from '../../src/web/lib/api';

it('refuses several files or a non-xlsx file without calling the server', async () => {
  const previewImport = vi.spyOn(api, 'previewImport');
  const { result } = renderHook(() => useImport(() => {}), { wrapper: ToastProvider });
  await act(() => result.current.choose([new File([], 'a.xlsx'), new File([], 'b.xlsx')]));
  expect(screen.getByText('파일은 하나씩 올려 주세요')).toBeTruthy();
  await act(() => result.current.choose([new File([], 'a.csv')]));
  expect(screen.getByText('뱅크샐러드에서 받은 엑셀(.xlsx) 파일을 올려 주세요')).toBeTruthy();
  expect(previewImport).not.toHaveBeenCalled();
});

it('previews one xlsx file, then applies it and reports back', async () => {
  vi.spyOn(api, 'previewImport').mockResolvedValue({ token: 't' } as never);
  const applyImport = vi.spyOn(api, 'applyImport').mockResolvedValue({ importId: 1 });
  const onImported = vi.fn();
  const { result } = renderHook(() => useImport(onImported), { wrapper: ToastProvider });
  await act(() => result.current.choose([new File([], 'a.xlsx')]));
  expect(result.current.preview).toEqual({ token: 't' });
  await act(() => result.current.apply());
  expect(applyImport).toHaveBeenCalledWith('t');
  expect(onImported).toHaveBeenCalledOnce();
  expect(result.current.preview).toBeNull();
  expect(screen.getByText('가져왔어요')).toBeTruthy();
});

it('keeps the server error so the screen can explain it', async () => {
  vi.spyOn(api, 'previewImport').mockRejectedValue(new ApiError('FORMAT', '형식이 달라요', ["'가계부 내역'에 '결제수단' 열이 없어요"]));
  const { result } = renderHook(() => useImport(() => {}), { wrapper: ToastProvider });
  await act(() => result.current.choose([new File([], 'a.xlsx')]));
  expect(result.current.preview).toBeNull();
  expect(result.current.error).toMatchObject({ code: 'FORMAT', problems: ["'가계부 내역'에 '결제수단' 열이 없어요"] });
  act(() => result.current.cancel());
  expect(result.current.error).toBeNull();
});
