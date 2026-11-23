/**
 * Prints the structure of an export file — and never a value from it.
 * Use it when an import fails after Banksalad changed its export format:
 *   npm run diagnose -- "C:\path\to\export.xlsx"
 * Only the titles this app knows (sheet names, section titles, column headers) are printed as text;
 * every other cell is counted by kind.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cellAt, readXlsx, rowCells } from '../src/core/xlsx/readXlsx';
import { XlsxError, type Sheet } from '../src/core/xlsx/types';

const LEDGER_SHEET = '가계부 내역';
const SUMMARY_SHEET = '뱅샐현황';
const TX_COLUMNS = ['날짜', '시간', '타입', '대분류', '소분류', '내용', '금액', '화폐', '결제수단', '메모'];
const SECTIONS = ['고객정보', '현금흐름현황', '재무현황', '보험현황', '투자현황', '대출현황'];
const KNOWN_LABELS = new Set([
  ...TX_COLUMNS,
  '이름', '성별', '연령(만나이)', '신용점수(KCB)', '이메일',
  '항목', '총계', '월평균', '월수입총계', '월지출총계', '순수입총계',
  '자산', '부채', '상품명', '금액', '총자산', '총부채', '순자산',
  '금융사', '보험명', '계약상태', '총납입금', '계약일자', '만기일자', '보유계약건수',
  '투자상품종류', '투자원금', '평가금액', '수익률', '가입일자', '보유상품개수', '총투자원금', '총평가금액', '총수익률',
  '대출종류', '대출원금', '대출잔액', '대출금리', '대출신규일', '대출만기일', '보유대출상품', '총대출원금', '총대출잔액',
]);

const norm = (value: unknown) => String(value ?? '').replace(/\s+/g, '');

function kinds(sheet: Sheet, col: string, firstRow: number, lastRow: number): string {
  let numbers = 0;
  let strings = 0;
  let empty = 0;
  for (let row = firstRow; row <= lastRow; row += 1) {
    const cell = cellAt(sheet, col, row);
    if (!cell) empty += 1;
    else if (typeof cell.value === 'number') numbers += 1;
    else strings += 1;
  }
  return `숫자 ${numbers}, 글자 ${strings}, 빈칸 ${empty}`;
}

function describeLedger(sheet: Sheet, lines: string[]): void {
  const found = new Map<string, string>();
  let unknown = 0;
  for (const cell of rowCells(sheet, 1)) {
    const label = norm(cell.value);
    if (TX_COLUMNS.includes(label)) found.set(label, cell.col);
    else unknown += 1;
  }
  for (const name of TX_COLUMNS) {
    const col = found.get(name);
    if (col === undefined) lines.push(`  없음: '${LEDGER_SHEET}'의 '${name}' 열`);
    else lines.push(`  ${col}열 ${name}: ${kinds(sheet, col, 2, sheet.maxRow)}`);
  }
  if (unknown > 0) lines.push(`  모르는 열 ${unknown}개`);
}

function describeSummary(sheet: Sheet, lines: string[]): void {
  const sections: { name: string; number: string; first: number; last: number }[] = [];
  let unknownSections = 0;
  for (let row = 1; row <= sheet.maxRow; row += 1) {
    const cell = cellAt(sheet, 'B', row);
    if (!cell || typeof cell.value !== 'string') continue;
    const m = /^(\d+)\.\s*(\S+)$/.exec(cell.value.trim());
    if (!m) continue;
    if (sections.length > 0) sections[sections.length - 1].last = row - 1;
    sections.push({ name: SECTIONS.includes(m[2]) ? m[2] : '', number: m[1], first: row, last: sheet.maxRow });
  }
  for (const s of sections) {
    if (s.name === '') { unknownSections += 1; lines.push(`  ${s.number}.(모르는 구역): ${s.first}~${s.last}행`); continue; }
    const labels: string[] = [];
    let numbers = 0;
    let strings = 0;
    let formulas = 0;
    for (let row = s.first + 1; row <= s.last; row += 1) {
      for (const cell of rowCells(sheet, row)) {
        const label = norm(cell.value);
        if (typeof cell.value === 'string' && KNOWN_LABELS.has(label)) { if (!labels.includes(label)) labels.push(label); continue; }
        if (cell.isFormula) formulas += 1;
        else if (typeof cell.value === 'number') numbers += 1;
        else strings += 1;
      }
    }
    lines.push(`  ${s.number}.${s.name}: ${s.first}~${s.last}행, 숫자 ${numbers}, 글자 ${strings}, 수식 ${formulas}`);
    lines.push(`    제목: ${labels.join(', ') || '(없음)'}`);
  }
  for (const name of SECTIONS) {
    if (!sections.some((s) => s.name === name)) lines.push(`  없음: '${SUMMARY_SHEET}'의 '${name}' 구역`);
  }
  if (unknownSections > 0) lines.push(`  모르는 구역 ${unknownSections}개`);
  lines.push(`  병합 ${sheet.merges.length}개`);
}

/** A structure-only report of an export file. */
export function diagnose(data: Uint8Array): string {
  const lines: string[] = [];
  let workbook;
  try {
    workbook = readXlsx(data);
  } catch (e) {
    if (e instanceof XlsxError) return `읽을 수 없는 파일: ${e.code}`;
    throw e;
  }
  let unknownSheets = 0;
  for (const sheet of workbook.sheets) {
    if (sheet.name === LEDGER_SHEET) {
      lines.push(`시트 '${LEDGER_SHEET}': ${sheet.maxRow}행 (거래 ${Math.max(0, sheet.maxRow - 1)}건)`);
      describeLedger(sheet, lines);
    } else if (sheet.name === SUMMARY_SHEET) {
      lines.push(`시트 '${SUMMARY_SHEET}': ${sheet.maxRow}행, 셀 ${sheet.cells.size}개`);
      describeSummary(sheet, lines);
    } else {
      unknownSheets += 1;
    }
  }
  for (const name of [SUMMARY_SHEET, LEDGER_SHEET]) {
    if (!workbook.sheets.some((s) => s.name === name)) lines.push(`없음: 시트 '${name}'`);
  }
  if (unknownSheets > 0) lines.push(`모르는 시트 ${unknownSheets}개`);
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const path = process.argv[2];
  if (!path) {
    console.error('사용법: npm run diagnose -- <엑셀 파일 경로>');
    process.exit(1);
  }
  console.log(diagnose(new Uint8Array(readFileSync(path))));
}
