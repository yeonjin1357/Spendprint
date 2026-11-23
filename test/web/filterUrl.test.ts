import { expect, it } from 'vitest';
import { filterToSearch, searchToFilter } from '../../src/web/features/transactions/filterUrl';

it('round-trips a filter through the URL', () => {
  const filter = { from: '2026-10-01', to: '2026-10-31', q: '택시 100%', types: ['지출'], majors: ['교통', '카페/간식'], methods: ['카드 A'], minAmount: 10000, hasMemo: true, includeZero: true };
  expect(searchToFilter(filterToSearch(filter))).toEqual(filter);
  expect(filterToSearch({})).toBe('');
  expect(filterToSearch({ limit: 100, offset: 200 })).toBe('');
  expect(searchToFilter('?majors=%EA%B5%90%ED%86%B5&unknown=1')).toEqual({ majors: ['교통'] });
});

it('drops values that are not usable', () => {
  expect(searchToFilter('?from=yesterday&minAmount=abc&hasMemo=no&q=')).toEqual({});
  expect(filterToSearch({ q: '', types: [], hasMemo: false })).toBe('');
});
