import { useEffect, useRef, useState } from 'react';
import type { ImportRecord } from '../../server/services/importService';
import type { Status } from '../../server/services/ledgerQuery';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useImportFlow } from '../features/import/ImportFlow';
import { api } from '../lib/api';
import { formatPeriod } from '../lib/format';
import styles from './ImportsPage.module.css';

function formatImportedAt(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 관리 › 업데이트 기록: every imported file, what it changed, and a way to undo it. */
export function ImportsPage() {
  const { version, notifyChanged, choose, busy } = useImportFlow();
  const toast = useToast();
  const [records, setRecords] = useState<ImportRecord[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [confirming, setConfirming] = useState<ImportRecord | null>(null);
  const [working, setWorking] = useState(false);
  const [reload, setReload] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.listImports(), api.status()])
      .then(([list, s]) => { if (alive) { setRecords(list); setStatus(s); } })
      .catch(() => { if (alive) setRecords([]); });
    return () => { alive = false; };
  }, [version, reload]);

  const undo = async () => {
    if (!confirming) return;
    setWorking(true);
    try {
      await api.undoImport(confirming.id);
      toast.show('되돌렸어요');
      setReload((n) => n + 1);
      notifyChanged();
    } catch {
      toast.show('되돌리지 못했어요. 다시 해 주세요');
    } finally {
      setWorking(false);
      setConfirming(null);
    }
  };

  return (
    <div>
      <header className={styles.header}>
        <h1 className={styles.title}>업데이트 기록</h1>
        <Button disabled={busy} onClick={() => input.current?.click()}>파일 올리기</Button>
        <input ref={input} type="file" accept=".xlsx" hidden onChange={(e) => { choose(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </header>

      {status && status.gaps.length > 0 && (
        <div className={styles.gaps}>
          <p className={styles.gapsTitle}>기록이 없는 기간이 있어요</p>
          <ul className={styles.gapList}>
            {status.gaps.map((gap) => <li key={gap.start}>{formatPeriod(gap)}</li>)}
          </ul>
        </div>
      )}

      {records !== null && records.length === 0 && (
        <Card><EmptyState title="아직 가져온 파일이 없어요" description="뱅크샐러드에서 받은 엑셀 파일을 이 화면에 끌어다 놓으면 돼요." /></Card>
      )}

      <div className={styles.list}>
        {(records ?? []).map((record) => (
          <Card key={record.id}>
            <div className={styles.record}>
              <div className={styles.info}>
                <p className={styles.filename}>{record.filename}</p>
                <p className={styles.meta}>{formatPeriod(record.window)}</p>
                <p className={styles.meta}>{`${formatImportedAt(record.importedAt)}에 가져옴 · 거래 ${record.rowCount}건`}</p>
                <p className={styles.changes}>{`추가 ${record.summary.added} · 변경 ${record.summary.changed} · 사라짐 ${record.summary.removed}`}</p>
              </div>
              <Button variant="secondary" onClick={() => setConfirming(record)}>되돌리기</Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        title="이 가져오기를 되돌릴까요?"
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)}>취소</Button>
            <Button variant="danger" disabled={working} onClick={() => { void undo(); }}>되돌리기</Button>
          </>
        }
      >
        <p>이 파일로 바뀐 내용이 사라지고 그 전 상태로 돌아가요. 올린 원본 파일은 지워지지 않아요.</p>
      </Modal>
    </div>
  );
}
