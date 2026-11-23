import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { DropOverlay } from './DropOverlay';
import { ImportPreviewModal } from './ImportPreviewModal';
import { useImport } from './useImport';

interface ImportFlow {
  /** Start importing these files (from a drop or a file picker). */
  choose(files: File[]): void;
  /** Call after data changed some other way (an undo), so every screen reloads. */
  notifyChanged(): void;
  /** Goes up whenever the stored data changed; screens reload when it does. */
  version: number;
  busy: boolean;
}

const Context = createContext<ImportFlow>({ choose: () => {}, notifyChanged: () => {}, version: 0, busy: false });

/** Owns the one import flow of the app: drop anywhere → preview → apply, and tells screens when data changed. */
export function ImportFlowProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const notifyChanged = useCallback(() => setVersion((v) => v + 1), []);
  const flow = useImport(notifyChanged);
  const { choose, busy } = flow;
  const value = useMemo(() => ({ choose: (files: File[]) => { void choose(files); }, notifyChanged, version, busy }), [choose, notifyChanged, version, busy]);

  return (
    <Context.Provider value={value}>
      {children}
      <DropOverlay onFiles={value.choose} />
      {flow.preview && <ImportPreviewModal preview={flow.preview} busy={flow.busy} onApply={() => { void flow.apply(); }} onCancel={flow.cancel} />}
      <Modal
        title="가져올 수 없어요"
        open={flow.error !== null}
        onClose={flow.cancel}
        footer={<Button onClick={flow.cancel}>확인</Button>}
      >
        <p>{flow.error?.message}</p>
        {flow.error && flow.error.problems.length > 0 && (
          <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: 'var(--text-sub)' }}>
            {flow.error.problems.map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        )}
      </Modal>
    </Context.Provider>
  );
}

export function useImportFlow(): ImportFlow {
  return useContext(Context);
}
