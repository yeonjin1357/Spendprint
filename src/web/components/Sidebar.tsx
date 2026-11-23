import { Link, useLocation } from 'wouter';
import { useAmountVisibility } from '../lib/amountVisibility';
import styles from './Sidebar.module.css';

const ITEMS = [
  { href: '/transactions', label: '내역', match: '/transactions' },
  { href: '/manage/imports', label: '관리', match: '/manage' },
];

export function Sidebar() {
  const [location] = useLocation();
  const { hidden, toggle } = useAmountVisibility();
  return (
    <nav className={styles.sidebar} aria-label="메뉴">
      <Link href="/" className={styles.brand}>Spendprint</Link>
      <ul className={styles.items}>
        {ITEMS.map((item) => {
          const active = location.startsWith(item.match);
          return (
            <li key={item.href}>
              <Link href={item.href} className={`${styles.item} ${active ? styles.active : ''}`} aria-current={active ? 'page' : undefined}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      <button type="button" className={styles.toggle} aria-pressed={hidden} onClick={toggle}>
        <span>금액 숨기기</span>
        <span className={`${styles.switch} ${hidden ? styles.on : ''}`} aria-hidden="true" />
      </button>
    </nav>
  );
}
