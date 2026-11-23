import { useEffect, useState } from 'react';
import { Redirect, Route, Switch } from 'wouter';
import { Button } from './components/Button';
import { EmptyState } from './components/EmptyState';
import { Sidebar } from './components/Sidebar';
import { ToastProvider } from './components/Toast';
import { ImportFlowProvider, useImportFlow } from './features/import/ImportFlow';
import { AmountVisibilityProvider } from './lib/amountVisibility';
import { api } from './lib/api';
import { ImportsPage } from './pages/ImportsPage';
import { Onboarding } from './pages/Onboarding';
import { TransactionsPage } from './pages/TransactionsPage';
import styles from './App.module.css';

/** `/` shows the onboarding until something has been imported, then goes to the transaction list. */
function Home() {
  const { version } = useImportFlow();
  const [state, setState] = useState<'loading' | 'empty' | 'has-data' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState('loading');
    api.status()
      .then((s) => { if (alive) setState(s.hasData ? 'has-data' : 'empty'); })
      // A failure must never look like "no data yet": that reads as lost history.
      .catch(() => { if (alive) setState('failed'); });
    return () => { alive = false; };
  }, [version, attempt]);
  if (state === 'loading') return null;
  if (state === 'has-data') return <Redirect to="/transactions" replace />;
  if (state === 'failed') {
    return (
      <EmptyState
        title="내역을 불러오지 못했어요"
        description="Spendprint가 켜져 있는지 확인해 주세요. 기록은 지워지지 않았어요."
        action={<Button onClick={() => setAttempt((n) => n + 1)}>다시 시도</Button>}
      />
    );
  }
  return <Onboarding />;
}

export function App() {
  return (
    <AmountVisibilityProvider>
      <ToastProvider>
        <ImportFlowProvider>
          <div className={styles.shell}>
            <Sidebar />
            <main className={styles.main}>
              <div className={styles.content}>
                <Switch>
                  <Route path="/" component={Home} />
                  <Route path="/transactions" component={TransactionsPage} />
                  <Route path="/manage/imports" component={ImportsPage} />
                  <Route><EmptyState title="없는 화면이에요" /></Route>
                </Switch>
              </div>
            </main>
          </div>
        </ImportFlowProvider>
      </ToastProvider>
    </AmountVisibilityProvider>
  );
}
