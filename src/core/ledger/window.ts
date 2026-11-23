import { ExportFormatError } from '../banksalad/types';

/** The period an export covers. Both ends are inclusive 'YYYY-MM-DD' dates. */
export interface ExportWindow {
  start: string;
  end: string;
}

function isRealDate(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Reads `YYYY-MM-DD~YYYY-MM-DD` from anywhere in the file name. */
export function windowFromFilename(filename: string): ExportWindow | null {
  const m = /(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})/.exec(filename);
  if (!m) return null;
  const [, start, end] = m;
  if (!isRealDate(start) || !isRealDate(end) || start > end) return null;
  return { start, end };
}

/** The file-name window widened to include every transaction date; the data range alone when the name has none. */
export function resolveWindow(filename: string, txDates: string[]): ExportWindow {
  const named = windowFromFilename(filename);
  const starts = named ? [named.start, ...txDates] : txDates;
  const ends = named ? [named.end, ...txDates] : txDates;
  if (starts.length === 0) throw new ExportFormatError(['파일명에서 기간을 읽을 수 없고 거래도 없어요']);
  return {
    start: starts.reduce((a, b) => (a < b ? a : b)),
    end: ends.reduce((a, b) => (a > b ? a : b)),
  };
}
