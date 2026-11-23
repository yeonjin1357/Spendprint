import { useEffect, useState } from 'react';
import type { LedgerFacets, LedgerFilter } from '../../../server/services/ledgerQuery';
import styles from './FilterBar.module.css';

const SEARCH_DELAY_MS = 300;
const SEVERAL = '__several__';

type ListKey = 'types' | 'majors' | 'minors' | 'methods';

const SELECTS: { key: ListKey; label: string }[] = [
  { key: 'types', label: '타입' },
  { key: 'majors', label: '대분류' },
  { key: 'minors', label: '소분류' },
  { key: 'methods', label: '결제수단' },
];

function hasAny(filter: LedgerFilter): boolean {
  return Object.values(filter).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '' && v !== false));
}

export function FilterBar({ filter, facets, onChange }: {
  filter: LedgerFilter;
  facets: LedgerFacets | null;
  onChange(next: LedgerFilter): void;
}) {
  const [q, setQ] = useState(filter.q ?? '');

  // Keep the box in step when the URL changes from outside (back button, a link from another screen).
  useEffect(() => { setQ(filter.q ?? ''); }, [filter.q]);

  // Typing updates the URL a moment later, so every keystroke is not a request.
  useEffect(() => {
    if (q === (filter.q ?? '')) return;
    const timer = window.setTimeout(() => onChange({ ...filter, q: q || undefined }), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const set = (patch: Partial<LedgerFilter>) => onChange({ ...filter, ...patch });
  const amount = (value: string) => (value === '' || !Number.isFinite(Number(value)) ? undefined : Number(value));

  return (
    <div className={styles.bar}>
      <input
        className={styles.search}
        type="search"
        placeholder="가맹점이나 메모 검색"
        aria-label="가맹점이나 메모 검색"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className={styles.controls}>
        <label className={styles.field}>
          <span className={styles.label}>기간</span>
          <input type="date" aria-label="시작일" value={filter.from ?? ''} min={facets?.minDate ?? undefined} max={facets?.maxDate ?? undefined} onChange={(e) => set({ from: e.target.value || undefined })} />
          <span className={styles.tilde}>~</span>
          <input type="date" aria-label="종료일" value={filter.to ?? ''} min={facets?.minDate ?? undefined} max={facets?.maxDate ?? undefined} onChange={(e) => set({ to: e.target.value || undefined })} />
        </label>

        {SELECTS.map(({ key, label }) => {
          const selected = filter[key] ?? [];
          const options = facets?.[key] ?? [];
          return (
            <label key={key} className={styles.field}>
              <span className={styles.label}>{label}</span>
              <select
                aria-label={label}
                className={selected.length > 0 ? styles.activeSelect : undefined}
                value={selected.length === 0 ? '' : selected.length === 1 ? selected[0] : SEVERAL}
                onChange={(e) => set({ [key]: e.target.value === '' ? undefined : [e.target.value] })}
              >
                <option value="">전체</option>
                {selected.length > 1 && <option value={SEVERAL} disabled>{`${selected.length}개 선택`}</option>}
                {[...new Set([...options, ...selected])].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          );
        })}

        <label className={styles.field}>
          <span className={styles.label}>금액</span>
          <input type="number" inputMode="numeric" min={0} placeholder="최소" aria-label="최소 금액" value={filter.minAmount ?? ''} onChange={(e) => set({ minAmount: amount(e.target.value) })} />
          <span className={styles.tilde}>~</span>
          <input type="number" inputMode="numeric" min={0} placeholder="최대" aria-label="최대 금액" value={filter.maxAmount ?? ''} onChange={(e) => set({ maxAmount: amount(e.target.value) })} />
        </label>

        <label className={styles.check}>
          <input type="checkbox" checked={filter.hasMemo === true} onChange={(e) => set({ hasMemo: e.target.checked || undefined })} />
          <span>메모 있음</span>
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={filter.includeZero === true} onChange={(e) => set({ includeZero: e.target.checked || undefined })} />
          <span>0원 포함</span>
        </label>

        {hasAny(filter) && <button type="button" className={styles.reset} onClick={() => { setQ(''); onChange({}); }}>초기화</button>}
      </div>
    </div>
  );
}
