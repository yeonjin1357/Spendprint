import type { ImportPreview, PreviewRow } from '../../../server/services/importService';
import { Amount } from '../../components/Amount';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { formatDateShort, formatPeriod, formatWon } from '../../lib/format';
import styles from './ImportPreviewModal.module.css';

function Rows({ rows }: { rows: PreviewRow[] }) {
  return (
    <ul className={styles.rows}>
      {rows.map((r, i) => (
        <li key={i} className={styles.row}>
          <span className={styles.rowDate}>{formatDateShort(r.date)}</span>
          <span className={styles.rowContent}>{r.content}</span>
          <Amount value={r.amount} signed />
        </li>
      ))}
    </ul>
  );
}

function Sample({ label, total, children }: { label: string; total: number; children: React.ReactNode }) {
  if (total === 0) return null;
  return (
    <details className={styles.sample}>
      <summary>{label}</summary>
      {children}
    </details>
  );
}

function Notice({ title, tone = 'info', children }: { title: string; tone?: 'info' | 'warn'; children?: React.ReactNode }) {
  return (
    <div className={`${styles.notice} ${tone === 'warn' ? styles.warn : ''}`}>
      <p className={styles.noticeTitle}>{title}</p>
      {children}
    </div>
  );
}

/** Shown before anything is saved: what this file would add, change and remove, and anything that looks off. */
export function ImportPreviewModal({ preview: p, busy, onApply, onCancel }: {
  preview: ImportPreview;
  busy: boolean;
  onApply(): void;
  onCancel(): void;
}) {
  return (
    <Modal
      title="가져오기 전에 확인해 주세요"
      open
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>취소</Button>
          <Button disabled={busy || p.alreadyImported} onClick={onApply}>적용하기</Button>
        </>
      }
    >
      <p className={styles.period}>{formatPeriod(p.window)}</p>
      <p className={styles.count}>{`거래 ${p.rowCount}건`}</p>

      {p.alreadyImported ? (
        <Notice title="이미 가져온 파일이에요" />
      ) : (
        <div className={styles.stats}>
          <span className={styles.stat}>{`추가 ${p.added}`}</span>
          <span className={styles.stat}>{`변경 ${p.changed}`}</span>
          <span className={styles.stat}>{`사라짐 ${p.removed}`}</span>
        </div>
      )}

      {p.cashflowMismatchCount === 0 ? (
        <p className={styles.ok}>뱅크샐러드 요약표와 모두 일치해요</p>
      ) : (
        <Notice title={`요약표와 ${p.cashflowMismatchCount}칸이 달라요`} tone="warn">
          <ul className={styles.list}>
            {p.cashflowMismatches.map((m) => (
              <li key={`${m.section}-${m.label}-${m.month}`}>
                {`${m.label} · ${m.month} · 표 ${formatWon(m.sheet)} / 계산 ${formatWon(m.computed)}`}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {p.formatDriftSuspected && <Notice tone="warn" title="파일의 표기가 달라진 것 같아요. 적용하기 전에 사라지는 거래를 확인해 주세요" />}

      {p.vanishedMethods.length > 0 && (
        <Notice title="새 파일에 없는 결제수단이 있어요. 이전 기록은 그대로 둘게요">
          <ul className={styles.list}>
            {p.vanishedMethods.map((v) => <li key={v.method}>{`${v.method} · ${v.keptCount}건`}</li>)}
          </ul>
        </Notice>
      )}

      {p.renamedMethods.length > 0 && (
        <Notice title="이름이 바뀐 것 같아요">
          <ul className={styles.list}>
            {p.renamedMethods.map((r) => (
              <li key={`${r.from}-${r.to}`}><span>{`${r.from} → ${r.to}`}</span> <span className={styles.dim}>{`${r.count}건`}</span></li>
            ))}
          </ul>
        </Notice>
      )}

      {p.oldRemovedByMethod.length > 0 && (
        <Notice tone="warn" title="오래된 거래가 사라져요">
          <ul className={styles.list}>
            {p.oldRemovedByMethod.map((o) => <li key={o.method}>{`${o.method} · ${o.count}건`}</li>)}
          </ul>
        </Notice>
      )}

      {p.warnings.length > 0 && (
        <ul className={styles.warnings}>
          {p.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      <Sample label="추가되는 거래 보기" total={p.samples.added.length}><Rows rows={p.samples.added} /></Sample>
      <Sample label="사라지는 거래 보기" total={p.samples.removed.length}><Rows rows={p.samples.removed} /></Sample>
      <Sample label="분류가 바뀌는 거래 보기" total={p.samples.changed.length}>
        <ul className={styles.rows}>
          {p.samples.changed.map((c, i) => (
            <li key={i} className={styles.row}>
              <span className={styles.rowDate}>{formatDateShort(c.after.date)}</span>
              <span className={styles.rowContent}>{c.after.content}</span>
              <span className={styles.dim}>{`${c.before.major} › ${c.before.minor} → ${c.after.major} › ${c.after.minor}`}</span>
            </li>
          ))}
        </ul>
      </Sample>
    </Modal>
  );
}
