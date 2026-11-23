import type { CellValue } from '../xlsx/types';

export interface RawTransaction {
  /** Position in the file; 0 is the top row (newest). */
  rowIndex: number;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM:SS' */
  time: string;
  type: string;
  major: string;
  minor: string;
  content: string;
  /** Signed; money going out is negative. */
  amount: number;
  currency: string;
  method: string;
  /** '' when absent. */
  memo: string;
  /** Values of columns this version does not know. */
  extra: Record<string, CellValue>;
}

export interface Profile {
  name: string;
  gender: string;
  age: number | null;
  creditScore: number | null;
  email: string;
}

export interface CashflowRow {
  label: string;
  values: number[];
}

export interface CashflowTable {
  months: string[];
  income: CashflowRow[];
  expense: CashflowRow[];
}

export interface AssetRow {
  side: 'asset' | 'liability';
  group: string;
  name: string;
  amount: number;
  /** Order among rows with the same side, group and name. */
  ordinal: number;
}

export interface InsuranceRow {
  company: string;
  name: string;
  status: string;
  paidTotal: number | null;
  contractDate: string | null;
  maturityDate: string | null;
}

export interface InvestmentRow {
  kind: string;
  company: string;
  name: string;
  principal: number | null;
  valuation: number | null;
  returnPct: number | null;
  startDate: string | null;
  maturityDate: string | null;
}

export interface LoanRow {
  kind: string;
  company: string;
  name: string;
  principal: number | null;
  balance: number | null;
  ratePct: number | null;
  startDate: string | null;
  maturityDate: string | null;
}

export interface Snapshot {
  profile: Profile;
  cashflow: CashflowTable;
  assets: AssetRow[];
  insurance: InsuranceRow[];
  investments: InvestmentRow[];
  loans: LoanRow[];
  /** Every cell of the summary sheet, so nothing is lost even if a section is not understood. */
  rawCells: Record<string, CellValue>;
  rawMerges: string[];
}

export type ParseWarningCode = 'UNKNOWN_TX_COLUMN' | 'UNKNOWN_SECTION' | 'NON_KRW';

export interface ParseWarning {
  code: ParseWarningCode;
  message: string;
}

export interface ParsedExport {
  transactions: RawTransaction[];
  snapshot: Snapshot;
  warnings: ParseWarning[];
}

export class ExportFormatError extends Error {
  problems: string[];

  constructor(problems: string[]) {
    super(problems.join('\n'));
    this.name = 'ExportFormatError';
    this.problems = problems;
  }
}
