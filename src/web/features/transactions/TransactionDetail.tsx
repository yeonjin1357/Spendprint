import type { ReactNode } from 'react';
import type { LedgerRow } from '../../../server/services/ledgerQuery';
import { Amount } from '../../components/Amount';
import styles from './TransactionDetail.module.css';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  );
}

/** Everything the export said about one transaction, exactly as it was in the file. */
export function TransactionDetail({ row, onClose }: { row: LedgerRow; onClose(): void }) {
  return (
    <aside className={styles.panel} aria-label="거래 상세">
      <header className={styles.header}>
        <p className={styles.heading}>{row.content}</p>
        <button type="button" className={styles.close} onClick={onClose} aria-label="닫기">✕</button>
      </header>
      <div className={styles.amount}><Amount value={row.amount} signed size="xl" /></div>

      <h3 className={styles.section}>뱅크샐러드 원본</h3>
      <dl className={styles.fields}>
        <Field label="날짜">{row.date}</Field>
        <Field label="시간">{row.time}</Field>
        <Field label="타입">{row.type}</Field>
        <Field label="대분류">{row.major}</Field>
        <Field label="소분류">{row.minor}</Field>
        <Field label="내용">{row.content}</Field>
        <Field label="금액"><Amount value={row.amount} /></Field>
        <Field label="화폐">{row.currency}</Field>
        <Field label="결제수단">{row.method}</Field>
        <Field label="메모">{row.memo}</Field>
        {Object.entries(row.extra).map(([name, value]) => <Field key={name} label={name}>{String(value)}</Field>)}
      </dl>

      <h3 className={styles.section}>출처</h3>
      <dl className={styles.fields}>
        <Field label="파일">{row.sourceFilename}</Field>
        {row.keptFromVanishedMethod && <Field label="참고">새 파일에는 이 결제수단이 없어서 이전 파일의 기록을 유지하고 있어요</Field>}
      </dl>
    </aside>
  );
}
