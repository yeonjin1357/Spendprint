import { useCallback, useEffect, useState } from 'react';
import type { LedgerFilter, LedgerRow } from '../../../server/services/ledgerQuery';
import { api } from '../../lib/api';
import { filterToSearch } from './filterUrl';

export const PAGE_SIZE = 100;

interface LedgerState {
  items: LedgerRow[];
  total: number;
  sumAmount: number;
  loading: boolean;
  failed: boolean;
}

/** Loads the first page whenever the filter (or the stored data) changes, and more pages on demand. */
export function useLedger(filter: LedgerFilter, version: number) {
  const [state, setState] = useState<LedgerState>({ items: [], total: 0, sumAmount: 0, loading: true, failed: false });
  const key = filterToSearch(filter);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    api.ledger({ ...filter, limit: PAGE_SIZE, offset: 0 })
      .then((page) => { if (alive) setState({ items: page.items, total: page.total, sumAmount: page.sumAmount, loading: false, failed: false }); })
      .catch(() => { if (alive) setState({ items: [], total: 0, sumAmount: 0, loading: false, failed: true }); });
    return () => { alive = false; };
    // `key` stands for the filter's content; the object itself is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const loaded = state.items.length;
  const loadMore = useCallback(async () => {
    const page = await api.ledger({ ...filter, limit: PAGE_SIZE, offset: loaded });
    setState((s) => ({ ...s, items: [...s.items, ...page.items], total: page.total, sumAmount: page.sumAmount }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loaded]);

  return { ...state, hasMore: loaded < state.total, loadMore };
}
