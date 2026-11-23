import { useEffect, useState } from 'react';
import { Redirect, Route, Switch } from 'wouter';
import { EmptyState } from './components/EmptyState';
import { Sidebar } from './components/Sidebar';
import { ToastProvider } from './components/Toast';
import { AmountVisibilityProvider } from './lib/amountVisibility';
import { api } from './lib/api';
import styles from './App.module.css';

/** `/` shows the onboarding until something has been imported, then goes to the transaction list. */
function Home() {
  const [hasData, setHasData] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    api.status().then((s) => { if (alive) setHasData(s.hasData); }).catch(() => { if (alive) setHasData(false); });
    return () => { alive = false; };
  }, []);
  if (hasData === null) return null;
  if (hasData) return <Redirect to="/transactions" replace />;
  return <EmptyState title="뱅크샐러드 내역을 올려 주세요" />;
}

export function App() {
  return (
    <AmountVisibilityProvider>
      <ToastProvider>
        <div className={styles.shell}>
          <Sidebar />
          <main className={styles.main}>
            <div className={styles.content}>
              <Switch>
                <Route path="/" component={Home} />
                <Route path="/transactions"><EmptyState title="준비 중이에요" /></Route>
                <Route path="/manage/imports"><EmptyState title="준비 중이에요" /></Route>
                <Route><EmptyState title="없는 화면이에요" /></Route>
              </Switch>
            </div>
          </main>
        </div>
      </ToastProvider>
    </AmountVisibilityProvider>
  );
}
