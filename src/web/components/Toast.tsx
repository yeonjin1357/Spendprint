import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import styles from './Toast.module.css';

interface ToastApi {
  show(message: string): void;
}

const NO_TOASTS: ToastApi = { show: () => {} };
const Context = createContext<ToastApi>(NO_TOASTS);
const VISIBLE_MS = 3200;

/** Shows short messages at the bottom of the screen. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string) => {
    const id = nextId.current++;
    setToasts((list) => [...list, { id, message }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), VISIBLE_MS);
  }, []);
  const value = useMemo(() => ({ show }), [show]);

  return (
    <Context.Provider value={value}>
      {children}
      <div className={styles.stack} role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={styles.toast}>{t.message}</div>)}
      </div>
    </Context.Provider>
  );
}

/** Outside a ToastProvider this does nothing, so components stay usable on their own. */
export function useToast(): ToastApi {
  return useContext(Context);
}
