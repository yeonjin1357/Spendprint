import type { ReactNode } from 'react';
import styles from './Button.module.css';

export function Button({ children, variant = 'primary', disabled = false, onClick }: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button type="button" className={`${styles.button} ${styles[variant]}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
