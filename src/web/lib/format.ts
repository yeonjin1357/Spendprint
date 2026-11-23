const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

/** 12000 → '12,000원'. With `signed`, positive amounts get a '+'. Fractions are rounded. */
export function formatWon(amount: number, opts: { signed?: boolean } = {}): string {
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = rounded < 0 ? '-' : opts.signed && rounded > 0 ? '+' : '';
  return `${sign}${digits}원`;
}

/** '2026-11-23' → '11월 23일 월요일' */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${m}월 ${d}일 ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
}

/** '2026-11-23' → '11.23' */
export function formatDateShort(date: string): string {
  return date.slice(5).replace('-', '.');
}

/** '09:56:42' → '09:56'. Midnight means "no time recorded" in the export, so it is shown as nothing. */
export function formatTime(time: string): string {
  return time === '00:00:00' ? '' : time.slice(0, 5);
}

/** { start: '2025-11-23', end: '2026-11-23' } → '2025.11.23 ~ 2026.11.23' */
export function formatPeriod(w: { start: string; end: string }): string {
  return `${w.start.replace(/-/g, '.')} ~ ${w.end.replace(/-/g, '.')}`;
}
