import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { expect, it } from 'vitest';
import { parseExport } from '../../src/core/banksalad/parseExport';
import { checkCashflow } from '../../src/core/checks/cashflowCheck';
import { buildLedger } from '../../src/core/ledger/buildLedger';
import { resolveWindow } from '../../src/core/ledger/window';
import { getSheet, readXlsx } from '../../src/core/xlsx/readXlsx';

/**
 * Runs only on the user's own PC, against their real export:
 *   $env:SPENDPRINT_REAL_FILE = '<path to the xlsx>'; npx vitest run test/real
 * It compares counts only, so no real value can end up in the output.
 */
const path = process.env.SPENDPRINT_REAL_FILE;

it.skipIf(!path)('imports the real export completely', () => {
  const wb = readXlsx(new Uint8Array(readFileSync(path!)));
  const parsed = parseExport(wb);
  const expected = getSheet(wb, '가계부 내역')!.maxRow - 1;
  const window = resolveWindow(basename(path!), parsed.transactions.map((t) => t.date));
  const ledger = buildLedger([{ id: 1, importedSeq: 1, window, transactions: parsed.transactions }]);
  const result = {
    rows: parsed.transactions.length === expected,
    mismatches: checkCashflow(parsed.snapshot.cashflow, parsed.transactions).mismatches.length,
    ledger: ledger.entries.length === expected,
    uniqueFingerprints: new Set(ledger.entries.map((e) => e.fingerprint)).size === expected,
  };
  expect(result).toEqual({ rows: true, mismatches: 0, ledger: true, uniqueFingerprints: true });
});
