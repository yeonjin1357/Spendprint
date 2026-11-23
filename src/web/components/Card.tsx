import type { ReactNode } from 'react';
import styles from './Card.module.css';

export function Card({ title, children, onClick }: { title?: string; children: ReactNode; onClick?: () => void }) {
  const body = (
    <>
      {title && <h2 className={styles.title}>{title}</h2>}
      {children}
    </>
  );
  if (onClick) return <button type="button" className={`${styles.card} ${styles.clickable}`} onClick={onClick}>{body}</button>;
  return <section className={styles.card}>{body}</section>;
}
