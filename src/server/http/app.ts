import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ImportError, type ImportErrorCode, type ImportService } from '../services/importService';
import type { LedgerFilter, LedgerQuery } from '../services/ledgerQuery';
import { createGuard } from './guard';

export interface AppDeps {
  imports: ImportService;
  ledger: LedgerQuery;
  /** The port this app is served on; the guard only accepts requests addressed to it. */
  port: number;
  /** Built web files. When the folder does not exist only the API is served. */
  staticDir?: string;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const IMPORT_ERROR_STATUS: Record<ImportErrorCode, ContentfulStatusCode> = {
  NOT_XLSX: 422, ENCRYPTED: 422, CORRUPT: 422, FORMAT: 422,
  PREVIEW_EXPIRED: 404, NOT_FOUND: 404, ALREADY_IMPORTED: 409,
};

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json; charset=utf-8',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseFilter(query: (name: string) => string | undefined, queries: (name: string) => string[] | undefined): LedgerFilter {
  const filter: LedgerFilter = {};
  const date = (name: 'from' | 'to') => { const v = query(name); if (v && DATE.test(v)) filter[name] = v; };
  const list = (name: 'types' | 'majors' | 'minors' | 'methods') => { const v = queries(name); if (v && v.length > 0) filter[name] = v; };
  const number = (name: 'minAmount' | 'maxAmount' | 'limit' | 'offset') => {
    const v = query(name);
    if (v !== undefined && v !== '' && Number.isFinite(Number(v))) filter[name] = Number(v);
  };
  const flag = (name: 'hasMemo' | 'includeZero') => { const v = query(name); if (v === 'true' || v === '1') filter[name] = true; };
  date('from'); date('to');
  const q = query('q');
  if (q) filter.q = q;
  list('types'); list('majors'); list('minors'); list('methods');
  number('minAmount'); number('maxAmount'); number('limit'); number('offset');
  flag('hasMemo'); flag('includeZero');
  return filter;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const fail = (code: string, message: string, status: ContentfulStatusCode, problems?: string[]) =>
    new Response(JSON.stringify({ error: { code, message, ...(problems && problems.length > 0 ? { problems } : {}) } }), {
      status, headers: { 'content-type': 'application/json; charset=utf-8' },
    });

  // Method, path and status only: query strings and bodies can contain merchant names.
  app.use('*', async (c, next) => {
    await next();
    console.log(`${c.req.method} ${c.req.path} ${c.res.status}`);
  });
  app.use('/api/*', createGuard(deps.port));

  app.onError((e) => {
    if (e instanceof ImportError) return fail(e.code, e.message, IMPORT_ERROR_STATUS[e.code], e.problems);
    console.error(`[error] ${e.name} ${(e.stack ?? '').split('\n')[1]?.trim() ?? ''}`);
    return fail('INTERNAL', '문제가 생겼어요', 500);
  });

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.get('/api/status', (c) => c.json(deps.ledger.status()));

  app.post('/api/imports/preview', async (c) => {
    if (Number(c.req.header('content-length') ?? 0) > MAX_UPLOAD_BYTES) return fail('TOO_LARGE', '파일이 너무 커요 (20MB까지)', 413);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.byteLength > MAX_UPLOAD_BYTES) return fail('TOO_LARGE', '파일이 너무 커요 (20MB까지)', 413);
    return c.json(deps.imports.preview(c.req.query('filename') ?? 'upload.xlsx', bytes));
  });

  app.post('/api/imports/apply', async (c) => {
    const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
    if (!body || typeof body.token !== 'string') return fail('BAD_REQUEST', '요청 형식이 올바르지 않아요', 400);
    return c.json(deps.imports.apply(body.token));
  });

  app.get('/api/imports', (c) => c.json(deps.imports.list()));

  app.delete('/api/imports/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id)) return fail('NOT_FOUND', '가져오기 기록을 찾을 수 없어요', 404);
    deps.imports.undo(id);
    return c.body(null, 204);
  });

  app.get('/api/ledger', (c) => c.json(deps.ledger.page(parseFilter((n) => c.req.query(n), (n) => c.req.queries(n)))));
  app.get('/api/ledger/facets', (c) => c.json(deps.ledger.facets()));
  app.get('/api/ledger/:fingerprint', (c) => {
    const row = deps.ledger.get(c.req.param('fingerprint'));
    return row ? c.json(row) : fail('NOT_FOUND', '거래를 찾을 수 없어요', 404);
  });

  app.all('/api/*', () => fail('NOT_FOUND', '없는 주소예요', 404));

  const staticDir = deps.staticDir;
  if (staticDir && existsSync(staticDir)) {
    app.get('*', (c) => {
      // Resolve inside staticDir only; anything else (or a missing file) gets the app shell.
      const requested = normalize(join(staticDir, decodeURIComponent(c.req.path)));
      const inside = requested === staticDir || requested.startsWith(staticDir + sep);
      const file = inside && existsSync(requested) && statSync(requested).isFile() ? requested : join(staticDir, 'index.html');
      if (!existsSync(file)) return c.text('Not found', 404);
      return new Response(readFileSync(file), { headers: { 'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' } });
    });
  }

  return app;
}
