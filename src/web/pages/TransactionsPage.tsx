import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import type { LedgerFacets, LedgerFilter } from '../../server/services/ledgerQuery';
import { HIDDEN_AMOUNT } from '../components/Amount';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { useImportFlow } from '../features/import/ImportFlow';
import { FilterBar } from '../features/transactions/FilterBar';
import { filterToSearch, searchToFilter } from '../features/transactions/filterUrl';
import { TransactionDetail } from '../features/transactions/TransactionDetail';
import { TransactionList } from '../features/transactions/TransactionList';
import { useLedger } from '../features/transactions/useLedger';
import { useAmountVisibility } from '../lib/amountVisibility';
import { api } from '../lib/api';
import { formatWon } from '../lib/format';
import styles from './TransactionsPage.module.css';

/** 내역: every transaction in the ledger, searchable and filterable. The filter is the URL's query string. */
export function TransactionsPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const { version } = useImportFlow();
  const { hidden } = useAmountVisibility();
  const filter = useMemo(() => searchToFilter(search), [search]);
  const ledger = useLedger(filter, version);
  const [facets, setFacets] = useState<LedgerFacets | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.ledgerFacets().then((f) => { if (alive) setFacets(f); }).catch(() => {});
    return () => { alive = false; };
  }, [version]);

  const setFilter = (next: LedgerFilter) => {
    setSelected(null);
    navigate(`/transactions${filterToSearch(next)}`, { replace: true });
  };
  const selectedRow = selected === null ? undefined : ledger.items.find((r) => r.fingerprint === selected);

  return (
    <div>
      <h1 className={styles.title}>내역</h1>
      <FilterBar filter={filter} facets={facets} onChange={setFilter} />

      {!ledger.loading && !ledger.failed && ledger.items.length > 0 && (
        <p className={styles.summary}>{`${ledger.total}건 · 합계 ${hidden ? HIDDEN_AMOUNT : formatWon(ledger.sumAmount, { signed: true })}`}</p>
      )}

      <TransactionList items={ledger.items} selected={selected} onSelect={setSelected} />

      {ledger.hasMore && (
        <div className={styles.more}><Button variant="secondary" onClick={() => { void ledger.loadMore(); }}>더 보기</Button></div>
      )}
      {!ledger.loading && ledger.failed && <EmptyState title="내역을 불러오지 못했어요" description="Spendprint가 켜져 있는지 확인해 주세요." />}
      {!ledger.loading && !ledger.failed && ledger.items.length === 0 && <EmptyState title="조건에 맞는 거래가 없어요" />}

      {selectedRow && <TransactionDetail row={selectedRow} onClose={() => setSelected(null)} />}
    </div>
  );
}
