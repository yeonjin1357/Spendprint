import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { openDb } from '../../src/server/db/open';
import { createApp } from '../../src/server/http/app';
import { startServer } from '../../src/server/main';
import { resolveDataPaths } from '../../src/server/paths';
import { createImportService } from '../../src/server/services/importService';
import { createLedgerQuery } from '../../src/server/services/ledgerQuery';
import { buildExportXlsx, tx } from '../support/fixture';

const PORT = 4780; const HOST = `127.0.0.1:${PORT}`;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  const paths = resolveDataPaths(mkdtempSync(join(tmpdir(), 'spendprint-')));
  const db = openDb(paths.db);
  app = createApp({ imports: createImportService(db, paths), ledger: createLedgerQuery(db), port: PORT });
});
const get = (path: string, headers: Record<string, string> = {}) => app.request(path, { headers: { host: HOST, ...headers } });
const send = (method: string, path: string, body?: BodyInit | Uint8Array, headers: Record<string, string> = {}) =>
  app.request(path, { method, body: body as BodyInit, headers: { host: HOST, 'x-spendprint': '1', ...headers } });
const xlsx = () => buildExportXlsx({ window: { start: '2026-01-01', end: '2026-06-30' }, transactions: [tx('2026-05-10', -5000, '가게', 'X카드')] });
const name = encodeURIComponent('2026-01-01~2026-06-30.xlsx');

it('runs the whole import flow over HTTP', async () => {
  expect(await (await get('/api/health')).json()).toEqual({ ok: true });
  const preview = await (await send('POST', `/api/imports/preview?filename=${name}`, xlsx())).json();
  expect(preview).toMatchObject({ filename: '2026-01-01~2026-06-30.xlsx', added: 1 });
  const applied = await send('POST', '/api/imports/apply', JSON.stringify({ token: preview.token }), { 'content-type': 'application/json' });
  const { importId } = await applied.json();
  const page = await (await get(`/api/ledger?majors=${encodeURIComponent('식비')}&majors=${encodeURIComponent('교통')}`)).json();
  expect(page.items.map((r: any) => r.content)).toEqual(['가게']);
  // A fingerprint ends in '#<n>', so it must be encoded to survive in a URL path.
  const one = await get(`/api/ledger/${encodeURIComponent(page.items[0].fingerprint)}`);
  expect(one.status).toBe(200);
  expect((await one.json()).fingerprint).toBe(page.items[0].fingerprint);
  expect((await get('/api/ledger/nope')).status).toBe(404);
  expect((await (await get('/api/status')).json()).ledgerCount).toBe(1);
  expect((await (await get('/api/imports')).json())[0].id).toBe(importId);
  expect((await (await get('/api/ledger/facets')).json()).methods).toEqual(['X카드']);
  expect((await send('DELETE', `/api/imports/${importId}`)).status).toBe(204);
  expect((await (await get('/api/ledger')).json()).total).toBe(0);
});

it('maps errors to status codes with a readable body', async () => {
  const bad = await send('POST', `/api/imports/preview?filename=a.xlsx`, 'hello');
  expect(bad.status).toBe(422);
  expect((await bad.json()).error.code).toBe('NOT_XLSX');
  expect((await send('POST', '/api/imports/apply', JSON.stringify({ token: 'x' }), { 'content-type': 'application/json' })).status).toBe(404);
  expect((await send('DELETE', '/api/imports/999')).status).toBe(404);
  const preview = await (await send('POST', `/api/imports/preview?filename=${name}`, xlsx())).json();
  await send('POST', '/api/imports/apply', JSON.stringify({ token: preview.token }), { 'content-type': 'application/json' });
  expect((await send('POST', '/api/imports/apply', JSON.stringify({ token: preview.token }), { 'content-type': 'application/json' })).status).toBe(409);
});

it('refuses requests that do not come from its own page', async () => {
  expect((await get('/api/status', { host: 'evil.example' })).status).toBe(403);
  expect((await get('/api/status', { host: `127.0.0.1:${PORT + 1}` })).status).toBe(403);
  expect((await get('/api/status', { host: `localhost:${PORT}` })).status).toBe(200);
  expect((await send('DELETE', '/api/imports/1', undefined, { origin: 'https://evil.example' })).status).toBe(403);
  expect((await app.request('/api/imports/1', { method: 'DELETE', headers: { host: HOST } })).status).toBe(403);
  const ok = await get('/api/status', { origin: 'https://evil.example' });
  expect(ok.headers.get('access-control-allow-origin')).toBeNull();
});

it('logs method, path and status only', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await get(`/api/ledger?q=${encodeURIComponent('비밀가게')}`);
  expect(log.mock.calls.flat().join(' ')).toContain('/api/ledger');
  expect(log.mock.calls.flat().join(' ')).not.toContain('비밀가게');
  expect(log.mock.calls.flat().join(' ')).not.toContain(encodeURIComponent('비밀가게'));
  log.mockRestore();
});

it('listens on 127.0.0.1 only and moves to the next free port', async () => {
  const blocker = createServer().listen(4780, '127.0.0.1');
  await new Promise((r) => { blocker.once('listening', r); blocker.once('error', r); }); // 이미 쓰는 중이어도 계속한다
  const s = await startServer({ dataDir: mkdtempSync(join(tmpdir(), 'spendprint-')), open: false });
  expect(s.address).toBe('127.0.0.1');
  expect(s.port).toBeGreaterThan(4780);
  expect(s.url).toBe(`http://127.0.0.1:${s.port}`);
  expect((await fetch(`${s.url}/api/health`)).status).toBe(200);
  await s.close(); blocker.close();
});
