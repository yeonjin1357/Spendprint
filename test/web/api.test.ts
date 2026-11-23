import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../src/web/lib/api';

afterEach(() => vi.unstubAllGlobals());
const stub = (status: number, body: unknown) => {
  const f = vi.fn(async (..._args: unknown[]) => new Response(status === 204 ? null : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', f); return f;
};

it('sends the guard header and repeats list filters', async () => {
  const f = stub(200, { total: 0, sumAmount: 0, items: [] });
  await api.ledger({ majors: ['교통', '생활'], q: '택시', includeZero: true });
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  expect(new Headers(init.headers).get('x-spendprint')).toBe('1');
  expect(new URL(url, 'http://x').searchParams.getAll('majors')).toEqual(['교통', '생활']);
  expect(new URL(url, 'http://x').searchParams.get('q')).toBe('택시');
});

it('uploads the file bytes with the name in the query', async () => {
  const f = stub(200, { token: 't' });
  await api.previewImport(new File([new Uint8Array([1, 2, 3])], '2026-01-01~2026-06-30.xlsx'));
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  expect(new URL(url, 'http://x').searchParams.get('filename')).toBe('2026-01-01~2026-06-30.xlsx');
  expect(init.method).toBe('POST');
});

it('turns error bodies into ApiError', async () => {
  stub(422, { error: { code: 'FORMAT', message: '형식이 달라요', problems: ["'가계부 내역'에 '결제수단' 열이 없어요"] } });
  await expect(api.status()).rejects.toMatchObject({ code: 'FORMAT', message: '형식이 달라요', problems: ["'가계부 내역'에 '결제수단' 열이 없어요"] });
  expect(new ApiError('X', 'm').problems).toEqual([]);
});

it('resolves an undo that returns no content', async () => {
  const f = stub(204, null);
  await expect(api.undoImport(7)).resolves.toBeUndefined();
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/imports/7');
  expect(init.method).toBe('DELETE');
});
