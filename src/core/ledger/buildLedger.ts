import type { RawTransaction } from '../banksalad/types';
import { fingerprintRows, twinKey } from './fingerprint';
import type { ExportWindow } from './window';

export interface ImportFile {
  id: number;
  window: ExportWindow;
  /** Order of import; breaks ties between files that end on the same day. */
  importedSeq: number;
  transactions: RawTransaction[];
}

export interface LedgerEntry extends RawTransaction {
  importId: number;
  fingerprint: string;
  /** True when a newer file covers this date but no longer mentions this payment method at all. */
  keptFromVanishedMethod: boolean;
}

export interface LedgerResult {
  /** Newest first: date desc, time desc, importId desc, rowIndex asc. */
  entries: LedgerEntry[];
  vanishedMethods: { method: string; keptCount: number }[];
  renamedMethods: { from: string; to: string; count: number }[];
  renamedPairs: { fromFingerprint: string; toFingerprint: string }[];
}

const SEP = '\u001f';

/**
 * The ledger is a pure function of the set of imported files; import order does not matter.
 *
 * For each (date, payment method) the authority is the newest file whose window covers the date
 * and which mentions the method anywhere. So an overlapping period follows the newer file, older
 * periods stay, and a method that disappeared from newer files (a disconnected asset) keeps its
 * history — unless the newer file has the same transaction under another method name (a rename).
 */
export function buildLedger(files: ImportFile[]): LedgerResult {
  const ordered = [...files].sort((a, b) => {
    if (a.window.end !== b.window.end) return a.window.end < b.window.end ? 1 : -1;
    if (a.importedSeq !== b.importedSeq) return b.importedSeq - a.importedSeq;
    return b.id - a.id;
  });
  const prepared = ordered.map((file) => {
    /** Row positions by twin key, for rename detection by older files. */
    const byTwin = new Map<string, number[]>();
    file.transactions.forEach((t, position) => {
      const key = twinKey(t);
      if (!byTwin.has(key)) byTwin.set(key, []);
      byTwin.get(key)!.push(position);
    });
    return { file, methods: new Set(file.transactions.map((t) => t.method)), fingerprints: fingerprintRows(file.transactions), byTwin };
  });

  const entries: LedgerEntry[] = [];
  const renamedPairs: LedgerResult['renamedPairs'] = [];
  const renameCounts = new Map<string, number>();
  const keptCounts = new Map<string, number>();

  prepared.forEach((current, index) => {
    // A newer row can stand in for at most one row of this file, so two identical old rows need two twins.
    const consumed = new Set<string>();

    current.file.transactions.forEach((row, rowPosition) => {
      const newer = prepared.slice(0, index).filter((p) => p.file.window.start <= row.date && row.date <= p.file.window.end);
      if (newer.some((p) => p.methods.has(row.method))) return; // superseded by a newer file

      let kept = false;
      if (newer.length > 0) {
        // The method is gone from every newer file covering this date. If any of them has the same
        // transaction under another method, it was renamed: that file (or one newer still) decides
        // what became of it, even when the transaction no longer exists in the newest file.
        const key = twinKey(row);
        for (const p of newer) {
          const position = p.byTwin.get(key)?.find((candidate) => !consumed.has(`${p.file.id}:${candidate}`));
          if (position === undefined) continue;
          consumed.add(`${p.file.id}:${position}`);
          renamedPairs.push({ fromFingerprint: current.fingerprints[rowPosition], toFingerprint: p.fingerprints[position] });
          const renameKey = `${row.method}${SEP}${p.file.transactions[position].method}`;
          renameCounts.set(renameKey, (renameCounts.get(renameKey) ?? 0) + 1);
          return;
        }
        kept = true;
        keptCounts.set(row.method, (keptCounts.get(row.method) ?? 0) + 1);
      }

      entries.push({ ...row, importId: current.file.id, fingerprint: current.fingerprints[rowPosition], keptFromVanishedMethod: kept });
    });
  });

  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.time !== b.time) return a.time < b.time ? 1 : -1;
    if (a.importId !== b.importId) return b.importId - a.importId;
    return a.rowIndex - b.rowIndex;
  });

  return {
    entries,
    vanishedMethods: [...keptCounts.entries()].map(([method, keptCount]) => ({ method, keptCount })).sort((a, b) => a.method.localeCompare(b.method)),
    renamedMethods: [...renameCounts.entries()]
      .map(([key, count]) => ({ from: key.split(SEP)[0], to: key.split(SEP)[1], count }))
      .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    renamedPairs,
  };
}
