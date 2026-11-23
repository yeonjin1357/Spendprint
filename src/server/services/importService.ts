import { createHash } from 'node:crypto';
import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { parseExport } from '../../core/banksalad/parseExport';
import { ExportFormatError, type ParsedExport, type RawTransaction } from '../../core/banksalad/types';
import { checkCashflow, type CashflowMismatch } from '../../core/checks/cashflowCheck';
import { buildLedger, type ImportFile, type LedgerEntry } from '../../core/ledger/buildLedger';
import { diffLedgers } from '../../core/ledger/diff';
import { fingerprintRows } from '../../core/ledger/fingerprint';
import { resolveWindow, type ExportWindow } from '../../core/ledger/window';
import { readXlsx } from '../../core/xlsx/readXlsx';
import { XlsxError } from '../../core/xlsx/types';
import type { DataPaths } from '../paths';

export interface PreviewRow {
  date: string; time: string; type: string; major: string; minor: string;
  content: string; amount: number; method: string; memo: string;
}

export interface ImportSummary {
  added: number; changed: number; removed: number; unchanged: number;
  cashflowCheckedCells: number; cashflowMismatchCount: number;
  vanishedMethods: { method: string; keptCount: number }[];
  renamedMethods: { from: string; to: string; count: number }[];
  warnings: string[];
}

export interface ImportPreview extends ImportSummary {
  /** sha256 of the file; pass it to `apply`. */
  token: string;
  filename: string;
  window: ExportWindow;
  rowCount: number;
  alreadyImported: boolean;
  /** Up to 20 of each. */
  samples: { added: PreviewRow[]; removed: PreviewRow[]; changed: { before: PreviewRow; after: PreviewRow }[] };
  /** Up to 20. */
  cashflowMismatches: CashflowMismatch[];
  /** Removals well before the previous newest date, for methods the new file still has. */
  oldRemovedByMethod: { method: string; count: number }[];
  formatDriftSuspected: boolean;
}

export interface ImportRecord {
  id: number;
  filename: string;
  window: ExportWindow;
  importedAt: string;
  rowCount: number;
  summary: ImportSummary;
}

export type ImportErrorCode = 'NOT_XLSX' | 'ENCRYPTED' | 'CORRUPT' | 'FORMAT' | 'PREVIEW_EXPIRED' | 'ALREADY_IMPORTED' | 'NOT_FOUND';

export class ImportError extends Error {
  code: ImportErrorCode;
  problems: string[];

  constructor(code: ImportErrorCode, message: string, problems: string[] = []) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    this.problems = problems;
  }
}

export interface ImportService {
  /** Reads the file and reports what applying it would change. Writes nothing. */
  preview(filename: string, bytes: Uint8Array): ImportPreview;
  apply(token: string): { importId: number };
  undo(importId: number): void;
  /** Newest import first. */
  list(): ImportRecord[];
}

const SAMPLE_LIMIT = 20;
const PENDING_LIMIT = 5;
const BACKUP_LIMIT = 20;
const OLD_REMOVAL_DAYS = 30;
const DRIFT_MIN_ROWS = 20;
const DRIFT_MIN_SHARE = 0.2;

interface Pending {
  filename: string;
  bytes: Uint8Array;
  parsed: ParsedExport;
  window: ExportWindow;
}

interface RawRow {
  import_id: number; row_index: number; date: string; time: string; type: string; major: string; minor: string;
  content: string; amount: number; currency: string; method: string; memo: string; extra_json: string;
}

const previewRow = (e: RawTransaction): PreviewRow => ({
  date: e.date, time: e.time, type: e.type, major: e.major, minor: e.minor, content: e.content, amount: e.amount, method: e.method, memo: e.memo,
});

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function createImportService(db: DatabaseSync, paths: DataPaths, now: () => Date = () => new Date()): ImportService {
  const pending = new Map<string, Pending>();

  const hasSha = (sha: string) => db.prepare('SELECT 1 AS found FROM imports WHERE sha256 = ?').get(sha) !== undefined;
  const importCount = () => (db.prepare('SELECT count(*) AS n FROM imports').get() as { n: number }).n;

  function loadFiles(): ImportFile[] {
    const files = new Map<number, ImportFile>();
    for (const row of db.prepare('SELECT id, window_start, window_end FROM imports ORDER BY id').all() as { id: number; window_start: string; window_end: string }[]) {
      files.set(row.id, { id: row.id, importedSeq: row.id, window: { start: row.window_start, end: row.window_end }, transactions: [] });
    }
    const rows = db.prepare(
      'SELECT import_id, row_index, date, time, type, major, minor, content, amount, currency, method, memo, extra_json FROM raw_transactions ORDER BY import_id, row_index',
    ).all() as unknown as RawRow[];
    for (const r of rows) {
      files.get(r.import_id)?.transactions.push({
        rowIndex: r.row_index, date: r.date, time: r.time, type: r.type, major: r.major, minor: r.minor, content: r.content,
        amount: r.amount, currency: r.currency, method: r.method, memo: r.memo, extra: JSON.parse(r.extra_json),
      });
    }
    return [...files.values()];
  }

  function read(filename: string, bytes: Uint8Array): Pending {
    try {
      const parsed = parseExport(readXlsx(bytes));
      const window = resolveWindow(filename, parsed.transactions.map((t) => t.date));
      return { filename, bytes, parsed, window };
    } catch (e) {
      if (e instanceof XlsxError) throw new ImportError(e.code, e.message);
      if (e instanceof ExportFormatError) throw new ImportError('FORMAT', '뱅크샐러드 내보내기 파일과 형식이 달라요', e.problems);
      throw e;
    }
  }

  function describe(token: string, file: Pending): ImportPreview {
    const existing = loadFiles();
    const alreadyImported = hasSha(token);
    const before = buildLedger(existing);
    const nextId = existing.reduce((max, f) => Math.max(max, f.id), 0) + 1;
    const after = alreadyImported
      ? before
      : buildLedger([...existing, { id: nextId, importedSeq: nextId, window: file.window, transactions: file.parsed.transactions }]);
    const diff = diffLedgers(before.entries, after.entries);
    const cashflow = checkCashflow(file.parsed.snapshot.cashflow, file.parsed.transactions);

    const inWindow = (e: LedgerEntry) => file.window.start <= e.date && e.date <= file.window.end;
    const removedInWindow = diff.removed.filter(inWindow).length;
    const addedInWindow = diff.added.filter(inWindow).length;
    const beforeInWindow = before.entries.filter(inWindow).length;

    const oldRemoved = new Map<string, number>();
    if (before.entries.length > 0) {
      const cutoff = addDays(before.entries[0].date, -OLD_REMOVAL_DAYS);
      const methods = new Set(file.parsed.transactions.map((t) => t.method));
      for (const e of diff.removed) {
        if (e.date < cutoff && methods.has(e.method)) oldRemoved.set(e.method, (oldRemoved.get(e.method) ?? 0) + 1);
      }
    }

    return {
      token,
      filename: file.filename,
      window: file.window,
      rowCount: file.parsed.transactions.length,
      alreadyImported,
      added: diff.added.length,
      changed: diff.changed.length,
      removed: diff.removed.length,
      unchanged: diff.unchangedCount,
      cashflowCheckedCells: cashflow.checkedCells,
      cashflowMismatchCount: cashflow.mismatches.length,
      cashflowMismatches: cashflow.mismatches.slice(0, SAMPLE_LIMIT),
      vanishedMethods: after.vanishedMethods,
      renamedMethods: after.renamedMethods,
      warnings: file.parsed.warnings.map((w) => w.message),
      samples: {
        added: diff.added.slice(0, SAMPLE_LIMIT).map(previewRow),
        removed: diff.removed.slice(0, SAMPLE_LIMIT).map(previewRow),
        changed: diff.changed.slice(0, SAMPLE_LIMIT).map((c) => ({ before: previewRow(c.before), after: previewRow(c.after) })),
      },
      oldRemovedByMethod: [...oldRemoved.entries()].map(([method, count]) => ({ method, count })).sort((a, b) => a.method.localeCompare(b.method)),
      formatDriftSuspected: removedInWindow >= DRIFT_MIN_ROWS && addedInWindow >= DRIFT_MIN_ROWS && removedInWindow >= DRIFT_MIN_SHARE * beforeInWindow,
    };
  }

  function summaryOf(p: ImportPreview): ImportSummary {
    return {
      added: p.added, changed: p.changed, removed: p.removed, unchanged: p.unchanged,
      cashflowCheckedCells: p.cashflowCheckedCells, cashflowMismatchCount: p.cashflowMismatchCount,
      vanishedMethods: p.vanishedMethods, renamedMethods: p.renamedMethods, warnings: p.warnings,
    };
  }

  /** A consistent copy of the database, taken before anything existing is changed. Keeps the newest 20. */
  function backup(): void {
    const t = now();
    const pad = (n: number, width = 2) => String(n).padStart(width, '0');
    const stamp = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}-${pad(t.getMilliseconds(), 3)}`;
    let target = join(paths.backups, `spendprint-${stamp}.db`);
    for (let n = 1; existsSync(target); n += 1) target = join(paths.backups, `spendprint-${stamp}-${n}.db`);
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    const files = readdirSync(paths.backups).filter((f) => /^spendprint-.*\.db$/.test(f)).sort().reverse();
    for (const old of files.slice(BACKUP_LIMIT)) rmSync(join(paths.backups, old), { force: true });
  }

  function rebuildLedger(): void {
    const { entries } = buildLedger(loadFiles());
    db.exec('DELETE FROM ledger');
    const insert = db.prepare(
      `INSERT INTO ledger (fingerprint, import_id, row_index, date, time, type, major, minor, content, amount, currency, method, memo, extra_json, kept_from_vanished_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const e of entries) {
      insert.run(e.fingerprint, e.importId, e.rowIndex, e.date, e.time, e.type, e.major, e.minor, e.content, e.amount, e.currency, e.method, e.memo, JSON.stringify(e.extra), e.keptFromVanishedMethod ? 1 : 0);
    }
  }

  function inTransaction<T>(work: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  return {
    preview(filename, bytes) {
      const file = read(filename, bytes);
      const token = createHash('sha256').update(bytes).digest('hex');
      pending.delete(token);
      pending.set(token, file);
      while (pending.size > PENDING_LIMIT) pending.delete(pending.keys().next().value as string);
      return describe(token, file);
    },

    apply(token) {
      if (hasSha(token)) throw new ImportError('ALREADY_IMPORTED', '이미 가져온 파일이에요');
      const file = pending.get(token);
      if (!file) throw new ImportError('PREVIEW_EXPIRED', '미리보기가 만료됐어요. 파일을 다시 올려 주세요');

      const summary = summaryOf(describe(token, file));
      if (importCount() > 0) backup();

      const storedName = `${token}.xlsx`;
      const storedPath = join(paths.imports, storedName);
      const existedBefore = existsSync(storedPath);
      writeFileSync(storedPath, file.bytes);

      try {
        const importId = inTransaction(() => {
          const result = db.prepare(
            'INSERT INTO imports (filename, sha256, window_start, window_end, imported_at, row_count, stored_path, summary_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          ).run(file.filename, token, file.window.start, file.window.end, now().toISOString(), file.parsed.transactions.length, storedName, JSON.stringify(summary));
          const id = Number(result.lastInsertRowid);

          const fingerprints = fingerprintRows(file.parsed.transactions);
          const insert = db.prepare(
            `INSERT INTO raw_transactions (import_id, row_index, date, time, type, major, minor, content, amount, currency, method, memo, extra_json, fingerprint)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          );
          file.parsed.transactions.forEach((t, i) => {
            insert.run(id, t.rowIndex, t.date, t.time, t.type, t.major, t.minor, t.content, t.amount, t.currency, t.method, t.memo, JSON.stringify(t.extra), fingerprints[i]);
          });
          db.prepare('INSERT INTO snapshots (import_id, as_of, data_json) VALUES (?, ?, ?)').run(id, file.window.end, JSON.stringify(file.parsed.snapshot));
          rebuildLedger();
          return id;
        });
        pending.delete(token);
        return { importId };
      } catch (e) {
        if (!existedBefore) rmSync(storedPath, { force: true });
        throw e;
      }
    },

    undo(importId) {
      if (db.prepare('SELECT 1 AS found FROM imports WHERE id = ?').get(importId) === undefined) {
        throw new ImportError('NOT_FOUND', '가져오기 기록을 찾을 수 없어요');
      }
      backup();
      inTransaction(() => {
        db.prepare('DELETE FROM imports WHERE id = ?').run(importId);
        rebuildLedger();
      });
    },

    list() {
      const rows = db.prepare('SELECT id, filename, window_start, window_end, imported_at, row_count, summary_json FROM imports ORDER BY id DESC').all() as {
        id: number; filename: string; window_start: string; window_end: string; imported_at: string; row_count: number; summary_json: string;
      }[];
      return rows.map((r) => ({
        id: r.id, filename: r.filename, window: { start: r.window_start, end: r.window_end },
        importedAt: r.imported_at, rowCount: r.row_count, summary: JSON.parse(r.summary_json) as ImportSummary,
      }));
    },
  };
}
