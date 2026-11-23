import { expect, it } from 'vitest';
import { formatDate, formatDateShort, formatPeriod, formatTime, formatWon } from '../../src/web/lib/format';

it('formats won amounts', () => {
  expect(formatWon(12000)).toBe('12,000원');
  expect(formatWon(-12000)).toBe('-12,000원');
  expect(formatWon(0)).toBe('0원');
  expect(formatWon(12000, { signed: true })).toBe('+12,000원');
  expect(formatWon(-12000, { signed: true })).toBe('-12,000원');
  expect(formatWon(428.967)).toBe('429원');
  expect(formatWon(1234567890)).toBe('1,234,567,890원');
});

it('formats dates and times', () => {
  expect(formatDate('2026-11-23')).toBe('11월 23일 월요일');
  expect(formatDateShort('2026-11-23')).toBe('11.23');
  expect(formatTime('09:56:42')).toBe('09:56');
  expect(formatTime('00:00:00')).toBe('');
  expect(formatPeriod({ start: '2025-11-23', end: '2026-11-23' })).toBe('2025.11.23 ~ 2026.11.23');
});
