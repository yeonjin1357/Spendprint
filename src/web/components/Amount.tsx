import { useAmountVisibility } from '../lib/amountVisibility';
import { formatWon } from '../lib/format';
import styles from './Amount.module.css';

export const HIDDEN_AMOUNT = '•••원';

/** An amount of money. Money coming in is blue when `signed`; everything else uses the normal text colour. */
export function Amount({ value, signed = false, size = 'md' }: { value: number; signed?: boolean; size?: 'md' | 'lg' | 'xl' }) {
  const { hidden } = useAmountVisibility();
  const className = [styles.amount, styles[size], signed && value > 0 && !hidden ? styles.positive : ''].filter(Boolean).join(' ');
  return <span className={className}>{hidden ? HIDDEN_AMOUNT : formatWon(value, { signed })}</span>;
}
