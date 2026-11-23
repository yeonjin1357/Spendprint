import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'spendprint.hideAmounts';

interface AmountVisibility {
  hidden: boolean;
  toggle(): void;
}

const Context = createContext<AmountVisibility>({ hidden: false, toggle: () => {} });

function readStored(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Lets the user hide every amount on screen, e.g. while someone is looking over their shoulder. */
export function AmountVisibilityProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(readStored);
  const toggle = useCallback(() => {
    setHidden((current) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, current ? '0' : '1');
      } catch {
        // The preference just does not persist.
      }
      return !current;
    });
  }, []);
  const value = useMemo(() => ({ hidden, toggle }), [hidden, toggle]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAmountVisibility(): AmountVisibility {
  return useContext(Context);
}
