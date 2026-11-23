import type { LedgerEntry } from './buildLedger';
import type { ExportWindow } from './window';

export interface LedgerDiff {
  added: LedgerEntry[];
  removed: LedgerEntry[];
  /** Same fingerprint, but type, category or memo differs. */
  changed: { before: LedgerEntry; after: LedgerEntry }[];
  unchangedCount: number;
}

export function diffLedgers(before: LedgerEntry[], after: LedgerEntry[]): LedgerDiff {
  const previous = new Map(before.map((e) => [e.fingerprint, e]));
  const diff: LedgerDiff = { added: [], removed: [], changed: [], unchangedCount: 0 };
  const seen = new Set<string>();
  for (const entry of after) {
    seen.add(entry.fingerprint);
    const old = previous.get(entry.fingerprint);
    if (!old) diff.added.push(entry);
    else if (old.type !== entry.type || old.major !== entry.major || old.minor !== entry.minor || old.memo !== entry.memo) diff.changed.push({ before: old, after: entry });
    else diff.unchangedCount += 1;
  }
  for (const entry of before) if (!seen.has(entry.fingerprint)) diff.removed.push(entry);
  return diff;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Date ranges between the earliest start and the latest end that no window covers. */
export function findGaps(windows: ExportWindow[]): ExportWindow[] {
  const sorted = [...windows].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const gaps: ExportWindow[] = [];
  let coveredUntil: string | null = null;
  for (const w of sorted) {
    if (coveredUntil !== null && w.start > addDays(coveredUntil, 1)) gaps.push({ start: addDays(coveredUntil, 1), end: addDays(w.start, -1) });
    if (coveredUntil === null || w.end > coveredUntil) coveredUntil = w.end;
  }
  return gaps;
}
