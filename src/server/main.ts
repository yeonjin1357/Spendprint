import { spawn } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdaptorServer } from '@hono/node-server';
import { openDb } from './db/open';
import { createApp } from './http/app';
import { resolveDataPaths } from './paths';
import { createImportService } from './services/importService';
import { createLedgerQuery } from './services/ledgerQuery';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOST = '127.0.0.1';
const DEFAULT_PORT = 4780;
const LAST_PORT = 4799;

export interface StartOptions {
  port?: number;
  dataDir?: string;
  /** Open the default browser. Default true. */
  open?: boolean;
  staticDir?: string;
}

export interface RunningServer {
  url: string;
  port: number;
  address: string;
  close(): Promise<void>;
}

function openBrowser(url: string): void {
  const [command, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(command as string, args as string[], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}

/** Starts the local server on 127.0.0.1 only. Tries the next ports when the default one is taken. */
export async function startServer(opts: StartOptions = {}): Promise<RunningServer> {
  const paths = resolveDataPaths(opts.dataDir);
  const db = openDb(paths.db);
  const imports = createImportService(db, paths);
  const ledger = createLedgerQuery(db);
  const staticDir = resolve(opts.staticDir ?? join(REPO_ROOT, 'dist', 'web'));
  const ports = opts.port !== undefined ? [opts.port] : Array.from({ length: LAST_PORT - DEFAULT_PORT + 1 }, (_, i) => DEFAULT_PORT + i);

  for (const port of ports) {
    const app = createApp({ imports, ledger, port, staticDir });
    const server = createAdaptorServer({ fetch: app.fetch });
    try {
      await new Promise<void>((done, failed) => {
        server.once('error', failed);
        server.listen(port, HOST, () => { server.off('error', failed); done(); });
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE') continue;
      db.close();
      throw e;
    }
    const url = `http://${HOST}:${port}`;
    if (opts.open !== false) openBrowser(url);
    return {
      url,
      port,
      address: (server.address() as AddressInfo).address,
      close: () => new Promise<void>((done) => { server.close(() => { db.close(); done(); }); }),
    };
  }
  db.close();
  throw new Error(`사용할 수 있는 포트가 없어요 (${ports[0]}~${ports[ports.length - 1]})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer({ open: !process.argv.includes('--no-open') })
    .then((s) => console.log(`Spendprint가 켜졌어요: ${s.url}  (끄려면 Ctrl+C)`))
    .catch((e: Error) => { console.error(e.message); process.exit(1); });
}
