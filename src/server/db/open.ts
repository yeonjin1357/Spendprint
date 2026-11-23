import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL, sha256 TEXT NOT NULL UNIQUE,
  window_start TEXT NOT NULL, window_end TEXT NOT NULL,
  imported_at TEXT NOT NULL, row_count INTEGER NOT NULL,
  stored_path TEXT NOT NULL, summary_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS raw_transactions (
  import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  date TEXT NOT NULL, time TEXT NOT NULL, type TEXT NOT NULL, major TEXT NOT NULL, minor TEXT NOT NULL,
  content TEXT NOT NULL, amount NUMERIC NOT NULL, currency TEXT NOT NULL, method TEXT NOT NULL,
  memo TEXT NOT NULL, extra_json TEXT NOT NULL, fingerprint TEXT NOT NULL,
  PRIMARY KEY (import_id, row_index)
);
CREATE TABLE IF NOT EXISTS snapshots (
  import_id INTEGER PRIMARY KEY REFERENCES imports(id) ON DELETE CASCADE,
  as_of TEXT NOT NULL, data_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger (
  fingerprint TEXT PRIMARY KEY,
  import_id INTEGER NOT NULL, row_index INTEGER NOT NULL,
  date TEXT NOT NULL, time TEXT NOT NULL, type TEXT NOT NULL, major TEXT NOT NULL, minor TEXT NOT NULL,
  content TEXT NOT NULL, amount NUMERIC NOT NULL, currency TEXT NOT NULL, method TEXT NOT NULL,
  memo TEXT NOT NULL, extra_json TEXT NOT NULL, kept_from_vanished_method INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_date ON ledger(date, time);
`;

/** Opens (and if needed creates) the database. `raw_transactions` and `snapshots` are the record; `ledger` is derived from them. */
export function openDb(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
