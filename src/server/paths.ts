import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DataPaths {
  root: string;
  db: string;
  imports: string;
  backups: string;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Where the user's data lives. Defaults to `<repo>/data`, which is git-ignored. */
export function resolveDataPaths(root?: string): DataPaths {
  const base = resolve(root ?? process.env.SPENDPRINT_DATA_DIR ?? join(REPO_ROOT, 'data'));
  const paths: DataPaths = {
    root: base,
    db: join(base, 'spendprint.db'),
    imports: join(base, 'imports'),
    backups: join(base, 'backups'),
  };
  for (const dir of [paths.root, paths.imports, paths.backups]) mkdirSync(dir, { recursive: true });
  return paths;
}
