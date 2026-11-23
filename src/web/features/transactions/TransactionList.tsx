import type { LedgerRow } from '../../../server/services/ledgerQuery';
import { Amount } from '../../components/Amount';
import { formatDate, formatTime } from '../../lib/format';
import styles from './TransactionList.module.css';

/** Transactions grouped by day, newest first (the order they arrive in). Text is rendered as text, never as HTML. */
export function TransactionList({ items, selected, onSelect }: {
  items: LedgerRow[];
  selected: string | null;
  onSelect(fingerprint: string): void;
}) {
  const groups: { date: string; rows: LedgerRow[] }[] = [];
  for (const row of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === row.date) last.rows.push(row);
    else groups.push({ date: row.date, rows: [row] });
  }

  return (
    <div className={styles.list}>
      {groups.map((group) => (
        <section key={group.date} className={styles.group}>
          <h2 className={styles.date}>{formatDate(group.date)}</h2>
          <ul className={styles.rows}>
            {group.rows.map((row) => (
              <li key={row.fingerprint}>
                <button
                  type="button"
                  className={`${styles.row} ${selected === row.fingerprint ? styles.selected : ''}`}
                  onClick={() => onSelect(row.fingerprint)}
                >
                  <span className={styles.main}>
                    <span className={styles.content}>{row.content}</span>
                    <span className={styles.sub}>{[row.major, row.minor, row.method, formatTime(row.time)].filter(Boolean).join(' · ')}</span>
                  </span>
                  {row.keptFromVanishedMethod && <span className={styles.badge}>이전 파일 기록</span>}
                  <Amount value={row.amount} signed />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
