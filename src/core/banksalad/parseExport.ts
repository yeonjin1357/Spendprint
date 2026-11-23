import { cellAt, getSheet, rowCells } from '../xlsx/readXlsx';
import type { Cell, CellValue, Sheet, Workbook } from '../xlsx/types';
import {
  ExportFormatError,
  type AssetRow, type CashflowRow, type CashflowTable, type InsuranceRow, type InvestmentRow, type LoanRow,
  type ParsedExport, type ParseWarning, type Profile, type RawTransaction, type Snapshot,
} from './types';

const LEDGER_SHEET = '가계부 내역';
const SUMMARY_SHEET = '뱅샐현황';
const TX_COLUMNS = ['날짜', '시간', '타입', '대분류', '소분류', '내용', '금액', '화폐', '결제수단', '메모'] as const;
const KNOWN_SECTIONS = ['고객정보', '현금흐름현황', '재무현황', '보험현황', '투자현황', '대출현황'] as const;
const MAX_ROW_PROBLEMS = 20;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Headers are compared without any whitespace: '연령\n(만 나이)' → '연령(만나이)'. */
const norm = (value: unknown) => String(value ?? '').replace(/\s+/g, '');
const text = (cell: Cell | undefined) => (cell === undefined ? '' : String(cell.value));
const num = (cell: Cell | undefined) => (cell !== undefined && typeof cell.value === 'number' ? cell.value : null);

function serialToDate(serial: number): string {
  return new Date(EXCEL_EPOCH + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
}

function dateOf(cell: Cell | undefined): string | null {
  if (cell === undefined) return null;
  if (typeof cell.value === 'number') return serialToDate(cell.value);
  const m = /^\d{4}-\d{2}-\d{2}/.exec(cell.value);
  return m ? m[0] : null;
}

function timeOf(cell: Cell | undefined): string {
  if (cell === undefined) return '00:00:00';
  let seconds = 0;
  if (typeof cell.value === 'number') {
    seconds = Math.round((cell.value % 1) * 86400);
  } else {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(cell.value);
    if (m) seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
  }
  seconds = Math.min(86399, Math.max(0, seconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

function parseLedger(sheet: Sheet, problems: string[], warnings: ParseWarning[]): RawTransaction[] {
  const columns = new Map<string, string>();
  const unknown: { name: string; col: string }[] = [];
  for (const cell of rowCells(sheet, 1)) {
    const name = norm(cell.value);
    if ((TX_COLUMNS as readonly string[]).includes(name)) columns.set(name, cell.col);
    else unknown.push({ name: String(cell.value), col: cell.col });
  }
  const missing = TX_COLUMNS.filter((name) => !columns.has(name));
  for (const name of missing) problems.push(`'${LEDGER_SHEET}'에 '${name}' 열이 없어요`);
  for (const u of unknown) warnings.push({ code: 'UNKNOWN_TX_COLUMN', message: `'${LEDGER_SHEET}'에 모르는 열 '${u.name}'이 있어요. 값은 그대로 보관해요` });
  if (missing.length > 0) return [];

  const col = (name: (typeof TX_COLUMNS)[number]) => columns.get(name)!;
  const transactions: RawTransaction[] = [];
  let rowProblems = 0;
  const rowProblem = (message: string) => {
    rowProblems += 1;
    if (rowProblems <= MAX_ROW_PROBLEMS) problems.push(message);
  };
  let nonKrw = 0;

  for (let row = 2; row <= sheet.maxRow; row += 1) {
    if (rowCells(sheet, row).length === 0) continue;
    const date = dateOf(cellAt(sheet, col('날짜'), row));
    const amount = num(cellAt(sheet, col('금액'), row));
    if (date === null) rowProblem(`'${LEDGER_SHEET}' ${row}행의 날짜를 읽을 수 없어요`);
    if (amount === null) rowProblem(`'${LEDGER_SHEET}' ${row}행의 금액이 숫자가 아니에요`);
    if (date === null || amount === null) continue;

    const extra: Record<string, CellValue> = {};
    for (const u of unknown) {
      const cell = cellAt(sheet, u.col, row);
      if (cell) extra[u.name] = cell.value;
    }
    const currency = text(cellAt(sheet, col('화폐'), row));
    if (currency !== 'KRW') nonKrw += 1;
    transactions.push({
      rowIndex: transactions.length,
      date,
      time: timeOf(cellAt(sheet, col('시간'), row)),
      type: text(cellAt(sheet, col('타입'), row)),
      major: text(cellAt(sheet, col('대분류'), row)),
      minor: text(cellAt(sheet, col('소분류'), row)),
      content: text(cellAt(sheet, col('내용'), row)),
      amount,
      currency,
      method: text(cellAt(sheet, col('결제수단'), row)),
      memo: text(cellAt(sheet, col('메모'), row)),
      extra,
    });
  }
  if (rowProblems > MAX_ROW_PROBLEMS) problems.push(`…그 밖에 읽을 수 없는 행이 ${rowProblems - MAX_ROW_PROBLEMS}개 더 있어요`);
  if (nonKrw > 0) warnings.push({ code: 'NON_KRW', message: `원화가 아닌 거래가 ${nonKrw}건 있어요. 합계에서 빠져요` });
  return transactions;
}

interface Section {
  name: string;
  title: string;
  first: number;
  last: number;
}

function findSections(sheet: Sheet): Section[] {
  const sections: Section[] = [];
  for (let row = 1; row <= sheet.maxRow; row += 1) {
    const cell = cellAt(sheet, 'B', row);
    if (!cell || typeof cell.value !== 'string') continue;
    const m = /^\d+\.\s*(\S+)$/.exec(cell.value.trim());
    if (!m) continue;
    if (sections.length > 0) sections[sections.length - 1].last = row - 1;
    sections.push({ name: m[1], title: cell.value.trim(), first: row, last: sheet.maxRow });
  }
  return sections;
}

/** First row of the section whose B cell is `firstLabel` and, when given, whose C cell is `secondLabel`. */
function findHeaderRow(sheet: Sheet, section: Section, firstLabel: string, secondLabel?: string): number | null {
  for (let row = section.first + 1; row <= section.last; row += 1) {
    if (norm(cellAt(sheet, 'B', row)?.value) !== firstLabel) continue;
    if (secondLabel !== undefined && norm(cellAt(sheet, 'C', row)?.value) !== secondLabel) continue;
    return row;
  }
  return null;
}

/** Columns of each header label, in column order (a label can repeat, e.g. assets and liabilities side by side). */
function headerColumns(sheet: Sheet, row: number): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const cell of rowCells(sheet, row)) {
    const label = norm(cell.value);
    if (!out.has(label)) out.set(label, []);
    out.get(label)!.push(cell.col);
  }
  return out;
}

class SectionReader {
  readonly header: number | null;
  private readonly columns: Map<string, string[]>;

  constructor(
    private readonly sheet: Sheet,
    private readonly section: Section,
    private readonly problems: string[],
    labels: string[],
    secondLabel?: string,
  ) {
    this.header = findHeaderRow(sheet, section, labels[0], secondLabel);
    this.columns = this.header === null ? new Map() : headerColumns(sheet, this.header);
    for (const label of labels) {
      if (!this.columns.has(label)) problems.push(`'${SUMMARY_SHEET}'의 '${section.name}'에 '${label}' 열이 없어요`);
    }
  }

  get ok(): boolean {
    return this.header !== null;
  }

  col(label: string, nth = 0): string | undefined {
    return this.columns.get(label)?.[nth];
  }

  cell(label: string, row: number, nth = 0): Cell | undefined {
    const col = this.col(label, nth);
    return col === undefined ? undefined : cellAt(this.sheet, col, row);
  }

  /** Data rows: after the header, up to a row whose B cell is one of `stops`, or the end of the section. */
  *rows(stops: string[]): Generator<number> {
    if (this.header === null) return;
    for (let row = this.header + 1; row <= this.section.last; row += 1) {
      if (stops.includes(norm(cellAt(this.sheet, 'B', row)?.value))) return;
      yield row;
    }
  }
}

function parseProfile(sheet: Sheet, section: Section, problems: string[]): Profile {
  const r = new SectionReader(sheet, section, problems, ['이름', '성별', '연령(만나이)', '신용점수(KCB)', '이메일']);
  const row = (r.header ?? 0) + 1;
  const email = text(r.cell('이메일', row));
  return {
    name: text(r.cell('이름', row)),
    gender: text(r.cell('성별', row)),
    age: num(r.cell('연령(만나이)', row)),
    creditScore: num(r.cell('신용점수(KCB)', row)),
    email: email === '-' ? '' : email,
  };
}

function parseCashflow(sheet: Sheet, section: Section, problems: string[]): CashflowTable {
  const table: CashflowTable = { months: [], income: [], expense: [] };
  const header = findHeaderRow(sheet, section, '항목', '총계');
  if (header === null) {
    problems.push(`'${SUMMARY_SHEET}'의 '${section.name}'에 '항목' 열이 없어요`);
    return table;
  }
  const monthCols = rowCells(sheet, header).filter((c) => /^\d{4}-\d{2}$/.test(String(c.value)));
  if (monthCols.length === 0) problems.push(`'${SUMMARY_SHEET}'의 '${section.name}'에 월 열이 없어요`);
  table.months = monthCols.map((c) => String(c.value));

  let target: CashflowRow[] | null = table.income;
  let sawIncomeTotal = false;
  for (let row = header + 1; row <= section.last && target !== null; row += 1) {
    const label = text(cellAt(sheet, 'B', row)).trim();
    if (label === '') continue;
    if (norm(label) === '월수입총계') { target = table.expense; sawIncomeTotal = true; continue; }
    if (norm(label) === '월지출총계' || norm(label) === '순수입총계') { target = null; continue; }
    target.push({ label, values: monthCols.map((c) => num(cellAt(sheet, c.col, row)) ?? 0) });
  }
  if (!sawIncomeTotal) problems.push(`'${SUMMARY_SHEET}'의 '${section.name}'에 '월수입 총계' 행이 없어요`);
  return table;
}

function parseAssets(sheet: Sheet, section: Section, problems: string[]): AssetRow[] {
  const r = new SectionReader(sheet, section, problems, ['항목', '상품명', '금액'], '상품명');
  if (!r.ok) return [];
  for (const label of ['항목', '상품명', '금액']) {
    if (r.col(label, 0) !== undefined && r.col(label, 1) === undefined) {
      problems.push(`'${SUMMARY_SHEET}'의 '${section.name}'에 부채 쪽 '${label}' 열이 없어요`);
    }
  }
  const out: AssetRow[] = [];
  const sides: AssetRow['side'][] = ['asset', 'liability'];
  sides.forEach((side, nth) => {
    let group = '';
    const seen = new Map<string, number>();
    for (const row of r.rows(['총자산'])) {
      const groupCell = r.cell('항목', row, nth);
      if (groupCell) group = String(groupCell.value);
      const name = text(r.cell('상품명', row, nth));
      if (name === '') continue;
      const key = `${group}\u001f${name}`;
      const ordinal = seen.get(key) ?? 0;
      seen.set(key, ordinal + 1);
      out.push({ side, group, name, amount: num(r.cell('금액', row, nth)) ?? 0, ordinal });
    }
  });
  return out;
}

function parseInsurance(sheet: Sheet, section: Section, problems: string[]): InsuranceRow[] {
  const r = new SectionReader(sheet, section, problems, ['금융사', '보험명', '계약상태', '총납입금', '계약일자', '만기일자']);
  const out: InsuranceRow[] = [];
  for (const row of r.rows(['총계'])) {
    const company = text(r.cell('금융사', row));
    const name = text(r.cell('보험명', row));
    if (company === '' && name === '') continue;
    out.push({
      company, name, status: text(r.cell('계약상태', row)), paidTotal: num(r.cell('총납입금', row)),
      contractDate: dateOf(r.cell('계약일자', row)), maturityDate: dateOf(r.cell('만기일자', row)),
    });
  }
  return out;
}

function parseInvestments(sheet: Sheet, section: Section, problems: string[]): InvestmentRow[] {
  const r = new SectionReader(sheet, section, problems, ['투자상품종류', '금융사', '상품명', '투자원금', '평가금액', '수익률', '가입일자', '만기일자']);
  const out: InvestmentRow[] = [];
  for (const row of r.rows(['총계'])) {
    const kind = text(r.cell('투자상품종류', row));
    const name = text(r.cell('상품명', row));
    if (kind === '' && name === '') continue;
    out.push({
      kind, company: text(r.cell('금융사', row)), name,
      principal: num(r.cell('투자원금', row)), valuation: num(r.cell('평가금액', row)), returnPct: num(r.cell('수익률', row)),
      startDate: dateOf(r.cell('가입일자', row)), maturityDate: dateOf(r.cell('만기일자', row)),
    });
  }
  return out;
}

function parseLoans(sheet: Sheet, section: Section, problems: string[]): LoanRow[] {
  const r = new SectionReader(sheet, section, problems, ['대출종류', '금융사', '상품명', '대출원금', '대출잔액', '대출금리', '대출신규일', '대출만기일']);
  const out: LoanRow[] = [];
  for (const row of r.rows(['총계'])) {
    const kind = text(r.cell('대출종류', row));
    const name = text(r.cell('상품명', row));
    if (kind === '' && name === '') continue;
    out.push({
      kind, company: text(r.cell('금융사', row)), name,
      principal: num(r.cell('대출원금', row)), balance: num(r.cell('대출잔액', row)), ratePct: num(r.cell('대출금리', row)),
      startDate: dateOf(r.cell('대출신규일', row)), maturityDate: dateOf(r.cell('대출만기일', row)),
    });
  }
  return out;
}

function parseSummary(sheet: Sheet, problems: string[], warnings: ParseWarning[]): Snapshot {
  const sections = findSections(sheet);
  const byName = new Map(sections.map((s) => [s.name, s]));
  for (const name of KNOWN_SECTIONS) {
    if (!byName.has(name)) problems.push(`'${SUMMARY_SHEET}'에 '${name}' 구역이 없어요`);
  }
  for (const s of sections) {
    if (!(KNOWN_SECTIONS as readonly string[]).includes(s.name)) {
      warnings.push({ code: 'UNKNOWN_SECTION', message: `'${SUMMARY_SHEET}'에 모르는 구역 '${s.title}'이 있어요. 내용은 그대로 보관해요` });
    }
  }
  const section = <T>(name: string, parse: (s: Section) => T, empty: T): T => {
    const s = byName.get(name);
    return s ? parse(s) : empty;
  };

  const rawCells: Record<string, CellValue> = {};
  for (const cell of sheet.cells.values()) rawCells[cell.ref] = cell.value;

  return {
    profile: section('고객정보', (s) => parseProfile(sheet, s, problems), { name: '', gender: '', age: null, creditScore: null, email: '' }),
    cashflow: section('현금흐름현황', (s) => parseCashflow(sheet, s, problems), { months: [], income: [], expense: [] }),
    assets: section('재무현황', (s) => parseAssets(sheet, s, problems), []),
    insurance: section('보험현황', (s) => parseInsurance(sheet, s, problems), []),
    investments: section('투자현황', (s) => parseInvestments(sheet, s, problems), []),
    loans: section('대출현황', (s) => parseLoans(sheet, s, problems), []),
    rawCells,
    rawMerges: [...sheet.merges],
  };
}

/** Turns a Banksalad export workbook into transactions and a snapshot. Throws ExportFormatError listing everything that is missing. */
export function parseExport(wb: Workbook): ParsedExport {
  const problems: string[] = [];
  const warnings: ParseWarning[] = [];

  const ledger = getSheet(wb, LEDGER_SHEET);
  const summary = getSheet(wb, SUMMARY_SHEET);
  if (!ledger) problems.push(`시트 '${LEDGER_SHEET}'이 없어요`);
  if (!summary) problems.push(`시트 '${SUMMARY_SHEET}'이 없어요`);

  const transactions = ledger ? parseLedger(ledger, problems, warnings) : [];
  const snapshot = summary ? parseSummary(summary, problems, warnings) : null;

  if (problems.length > 0 || snapshot === null) throw new ExportFormatError(problems);
  return { transactions, snapshot, warnings };
}
