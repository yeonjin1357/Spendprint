import type { LedgerFilter } from '../../../server/services/ledgerQuery';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LISTS = ['types', 'majors', 'minors', 'methods'] as const;
const NUMBERS = ['minAmount', 'maxAmount'] as const;
const FLAGS = ['hasMemo', 'includeZero'] as const;

/**
 * The filter lives in the URL, so other screens can link straight to "these transactions".
 * Parameter names are the filter's field names; list values repeat. Paging is not part of the URL.
 */
export function filterToSearch(filter: LedgerFilter): string {
  const params = new URLSearchParams();
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.q) params.set('q', filter.q);
  for (const key of LISTS) for (const value of filter[key] ?? []) params.append(key, value);
  for (const key of NUMBERS) if (filter[key] !== undefined) params.set(key, String(filter[key]));
  for (const key of FLAGS) if (filter[key] === true) params.set(key, 'true');
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function searchToFilter(search: string): LedgerFilter {
  const params = new URLSearchParams(search);
  const filter: LedgerFilter = {};
  const from = params.get('from');
  const to = params.get('to');
  const q = params.get('q');
  if (from && DATE.test(from)) filter.from = from;
  if (to && DATE.test(to)) filter.to = to;
  if (q) filter.q = q;
  for (const key of LISTS) {
    const values = params.getAll(key).filter((v) => v !== '');
    if (values.length > 0) filter[key] = values;
  }
  for (const key of NUMBERS) {
    const value = params.get(key);
    if (value !== null && value !== '' && Number.isFinite(Number(value))) filter[key] = Number(value);
  }
  for (const key of FLAGS) {
    const value = params.get(key);
    if (value === 'true' || value === '1') filter[key] = true;
  }
  return filter;
}
