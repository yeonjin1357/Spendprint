import type { DatabaseSync } from 'node:sqlite';
import { findGaps } from '../../core/ledger/diff';
import type { ExportWindow } from '../../core/ledger/window';
import type { CellValue } from '../../core/xlsx/types';

export interface LedgerFilter {
  from?: string;
  to?: string;
  /** Substring of the content or memo, case-insensitive. */
  q?: string;
  types?: string[];
  majors?: string[];
  minors?: string[];
  methods?: string[];
  /** Compared with the absolute amount. */
  minAmount?: number;
  maxAmount?: number;
  hasMemo?: boolean;
  /** Zero-amount records are hidden unless this is true. */
  includeZero?: boolean;
  /** Default 100, at most 500. */
  limit?: number;
  offset?: number;
}

export interface LedgerRow {
  fingerprint: string;
  importId: number;
  sourceFilename: string;
  date: string;
  time: string;
  type: string;
  major: string;
  minor: string;
  content: string;
  amount: number;
  currency: string;
  method: string;
  memo: string;
  extra: Record<string, CellValue>;
  keptFromVanishedMethod: boolean;
}

export interface LedgerPage {
  /** Number of matching rows, not just this page. */
  total: number;
  /** Sum over all matching KRW rows. */
  sumAmount: number;
  items: LedgerRow[];
}

export interface LedgerFacets {
  types: string[];
  majors: string[];
  minors: string[];
  methods: string[];
  minDate: string | null;
  maxDate: string | null;
}

export interface Status {
  hasData: boolean;
  importCount: number;
  ledgerCount: number;
  latestAsOf: string | null;
  gaps: ExportWindow[];
}

export interface LedgerQuery {
  page(filter: LedgerFilter): LedgerPage;
  get(fingerprint: string): LedgerRow | null;
  facets(): LedgerFacets;
  status(): Status;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const ROW_COLUMNS = `l.fingerprint, l.import_id, l.date, l.time, l.type, l.major, l.minor, l.content, l.amount, l.currency, l.method, l.memo, l.extra_json,
  l.kept_from_vanished_method, coalesce(i.filename, '') AS source_filename`;
const ROW_FROM = 'FROM ledger l LEFT JOIN imports i ON i.id = l.import_id';

type Param = string | number;

interface DbRow {
  fingerprint: string; import_id: number; date: string; time: string; type: string; major: string; minor: string; content: string;
  amount: number; currency: string; method: string; memo: string; extra_json: string; kept_from_vanished_method: number; source_filename: string;
}

function toRow(r: DbRow): LedgerRow {
  return {
    fingerprint: r.fingerprint, importId: r.import_id, sourceFilename: r.source_filename,
    date: r.date, time: r.time, type: r.type, major: r.major, minor: r.minor, content: r.content,
    amount: r.amount, currency: r.currency, method: r.method, memo: r.memo,
    extra: JSON.parse(r.extra_json), keptFromVanishedMethod: r.kept_from_vanished_method === 1,
  };
}

/** Builds the WHERE clause. Every value is bound; nothing from the filter is concatenated into SQL. */
function where(filter: LedgerFilter): { sql: string; params: Param[] } {
  const conditions: string[] = [];
  const params: Param[] = [];
  const add = (sql: string, ...values: Param[]) => { conditions.push(sql); params.push(...values); };
  const anyOf = (column: string, values: string[] | undefined) => {
    if (values && values.length > 0) add(`${column} IN (${values.map(() => '?').join(', ')})`, ...values);
  };

  if (filter.from) add('l.date >= ?', filter.from);
  if (filter.to) add('l.date <= ?', filter.to);
  if (filter.q) {
    const pattern = `%${filter.q.replace(/[\\%_]/g, '\\$&')}%`;
    add("(l.content LIKE ? ESCAPE '\\' OR l.memo LIKE ? ESCAPE '\\')", pattern, pattern);
  }
  anyOf('l.type', filter.types);
  anyOf('l.major', filter.majors);
  anyOf('l.minor', filter.minors);
  anyOf('l.method', filter.methods);
  if (filter.minAmount !== undefined) add('abs(l.amount) >= ?', filter.minAmount);
  if (filter.maxAmount !== undefined) add('abs(l.amount) <= ?', filter.maxAmount);
  if (filter.hasMemo === true) add("l.memo <> ''");
  if (filter.hasMemo === false) add("l.memo = ''");
  if (filter.includeZero !== true) add('l.amount <> 0');

  return { sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

export function createLedgerQuery(db: DatabaseSync): LedgerQuery {
  const distinct = (column: string) =>
    (db.prepare(`SELECT DISTINCT ${column} AS v FROM ledger ORDER BY ${column}`).all() as { v: string }[]).map((r) => r.v);

  return {
    page(filter) {
      const w = where(filter);
      const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(filter.limit ?? DEFAULT_LIMIT)));
      const offset = Math.max(0, Math.floor(filter.offset ?? 0));
      const totals = db.prepare(
        `SELECT count(*) AS total, coalesce(sum(CASE WHEN l.currency = 'KRW' THEN l.amount ELSE 0 END), 0) AS sum_amount ${ROW_FROM} ${w.sql}`,
      ).get(...w.params) as { total: number; sum_amount: number };
      const rows = db.prepare(
        `SELECT ${ROW_COLUMNS} ${ROW_FROM} ${w.sql} ORDER BY l.date DESC, l.time DESC, l.fingerprint ASC LIMIT ? OFFSET ?`,
      ).all(...w.params, limit, offset) as unknown as DbRow[];
      return { total: totals.total, sumAmount: totals.sum_amount, items: rows.map(toRow) };
    },

    get(fingerprint) {
      const row = db.prepare(`SELECT ${ROW_COLUMNS} ${ROW_FROM} WHERE l.fingerprint = ?`).get(fingerprint) as unknown as DbRow | undefined;
      return row ? toRow(row) : null;
    },

    facets() {
      const range = db.prepare('SELECT min(date) AS min_date, max(date) AS max_date FROM ledger').get() as { min_date: string | null; max_date: string | null };
      return {
        types: distinct('type'), majors: distinct('major'), minors: distinct('minor'), methods: distinct('method'),
        minDate: range.min_date, maxDate: range.max_date,
      };
    },

    status() {
      const windows = (db.prepare('SELECT window_start, window_end FROM imports').all() as { window_start: string; window_end: string }[])
        .map((r) => ({ start: r.window_start, end: r.window_end }));
      const ledgerCount = (db.prepare('SELECT count(*) AS n FROM ledger').get() as { n: number }).n;
      return {
        hasData: windows.length > 0,
        importCount: windows.length,
        ledgerCount,
        latestAsOf: windows.reduce<string | null>((max, w) => (max === null || w.end > max ? w.end : max), null),
        gaps: findGaps(windows),
      };
    },
  };
}
