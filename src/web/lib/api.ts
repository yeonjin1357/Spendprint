import type { ImportPreview, ImportRecord } from '../../server/services/importService';
import type { LedgerFacets, LedgerFilter, LedgerPage, Status } from '../../server/services/ledgerQuery';

export class ApiError extends Error {
  code: string;
  problems: string[];

  constructor(code: string, message: string, problems: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.problems = problems;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Spendprint', '1'); // the server refuses data-changing requests without it
  const res = await fetch(path, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; problems?: string[] } } | null;
  if (!res.ok) {
    throw new ApiError(body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? '문제가 생겼어요', body?.error?.problems ?? []);
  }
  return body as T;
}

function ledgerSearch(filter: LedgerFilter): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === '' || value === false) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export const api = {
  status: () => request<Status>('/api/status'),
  previewImport: (file: File) =>
    request<ImportPreview>(`/api/imports/preview?filename=${encodeURIComponent(file.name)}`, {
      method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' },
    }),
  applyImport: (token: string) =>
    request<{ importId: number }>('/api/imports/apply', { method: 'POST', body: JSON.stringify({ token }), headers: { 'Content-Type': 'application/json' } }),
  listImports: () => request<ImportRecord[]>('/api/imports'),
  undoImport: (id: number) => request<void>(`/api/imports/${id}`, { method: 'DELETE' }),
  ledger: (filter: LedgerFilter) => request<LedgerPage>(`/api/ledger${ledgerSearch(filter)}`),
  ledgerFacets: () => request<LedgerFacets>('/api/ledger/facets'),
};
