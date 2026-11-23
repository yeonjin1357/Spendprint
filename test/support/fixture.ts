import { writeXlsx, type WCell, type WSheet } from './writeXlsx';

export interface FixtureTx {
  date: string;
  time: string;
  type: '지출' | '수입' | '이체';
  major: string;
  minor: string;
  content: string;
  amount: number;
  currency: string;
  method: string;
  memo: string;
}
export interface FixtureAsset { group: string; name: string; amount: number }
export interface FixtureInvestment { kind: string; company: string; name: string; principal: number; valuation: number; returnPct?: number; startDate?: string; maturityDate?: string }
export interface FixtureInsurance { company: string; name: string; status: string; paidTotal: number; contractDate?: string; maturityDate?: string }
export interface FixtureLoan { kind: string; company: string; name: string; principal: number; balance: number; ratePct: number; startDate?: string; maturityDate?: string }
export interface FixtureOptions {
  window: { start: string; end: string };
  transactions: FixtureTx[];
  profile?: { name?: string; gender?: string; age?: number; creditScore?: number; email?: string };
  assets?: FixtureAsset[];
  liabilities?: FixtureAsset[];
  investments?: FixtureInvestment[];
  insurance?: FixtureInsurance[];
  loans?: FixtureLoan[];
  /** Adds `delta` to one cashflow cell so it disagrees with the ledger. */
  cashflowAdjust?: { section: 'income' | 'expense'; label: string; month: string; delta: number }[];
  /** `section` is the name without its number, e.g. '재무현황'. */
  drop?: { sheet?: '뱅샐현황' | '가계부 내역'; txColumn?: string; section?: string };
  /** `section` is the full title, e.g. '7.기타현황'. */
  extra?: { txColumn?: { name: string; value: string }; section?: string };
}

const TX_COLUMNS = ['날짜', '시간', '타입', '대분류', '소분류', '내용', '금액', '화폐', '결제수단', '메모'] as const;
/** Groups the real export lists even when they hold nothing. */
const EMPTY_ASSET_GROUPS = ['신탁 자산', '부동산'];

export function tx(date: string, amount: number, content: string, method: string, over: Partial<FixtureTx> = {}): FixtureTx {
  const type = over.type ?? (amount < 0 ? '지출' : '수입');
  return {
    date, time: '12:00:00', type, major: type === '지출' ? '식비' : '급여', minor: '미분류',
    content, amount, currency: 'KRW', method, memo: '', ...over,
  };
}

export function exportFilename(window: { start: string; end: string }): string {
  return `${window.start}~${window.end}.xlsx`;
}

export function excelSerial(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

export function excelTimeFraction(time: string): number {
  const [h, m, s] = time.split(':').map(Number);
  return (h * 3600 + m * 60 + s) / 86400;
}

function colName(index: number): string {
  let n = index;
  let name = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    name = String.fromCharCode(65 + r) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function ledgerSheet(opts: FixtureOptions): WSheet {
  const columns: string[] = TX_COLUMNS.filter((c) => c !== opts.drop?.txColumn);
  if (opts.extra?.txColumn) columns.push(opts.extra.txColumn.name);
  const cells: WCell[] = columns.map((name, i) => ({ ref: `${colName(i + 1)}1`, value: name }));

  const sorted = [...opts.transactions].sort((a, b) => (a.date === b.date ? b.time.localeCompare(a.time) : b.date.localeCompare(a.date)));
  sorted.forEach((t, i) => {
    const row = i + 2;
    const values: Record<string, string | number> = {
      날짜: excelSerial(t.date), 시간: excelTimeFraction(t.time), 타입: t.type, 대분류: t.major, 소분류: t.minor,
      내용: t.content, 금액: t.amount, 화폐: t.currency, 결제수단: t.method, 메모: t.memo,
    };
    if (opts.extra?.txColumn) values[opts.extra.txColumn.name] = opts.extra.txColumn.value;
    columns.forEach((name, c) => {
      const value = values[name];
      if (value === '') return;
      cells.push({ ref: `${colName(c + 1)}${row}`, value });
    });
  });
  return { name: '가계부 내역', cells };
}

function summarySheet(opts: FixtureOptions): WSheet {
  const cells: WCell[] = [];
  const merges: string[] = [];
  let row = 3;
  const put = (col: string, value: string | number | undefined, r = row) => {
    if (value === undefined || value === '') return;
    cells.push({ ref: `${col}${r}`, value });
  };
  const formula = (col: string, text: string, r = row) => cells.push({ ref: `${col}${r}`, value: 0, formula: text });
  const dropped = (name: string) => opts.drop?.section === name;
  const date = (d?: string) => (d ? excelSerial(d) : undefined);

  if (!dropped('고객정보')) {
    const p = { name: '김테스트', gender: '여', age: 30, creditScore: 900, email: '-', ...opts.profile };
    put('B', '1.고객정보'); row += 1;
    put('B', '사용자의 기본 정보에 해당하는 항목입니다.'); row += 1;
    put('B', '이름'); put('C', '성별'); put('D', '연령\n(만 나이)'); put('E', '신용점수\n(KCB)'); put('F', '이메일');
    merges.push(`F${row}:G${row}`); row += 1;
    put('B', p.name); put('C', p.gender); put('D', p.age); put('E', p.creditScore); put('F', p.email || '-');
    merges.push(`F${row}:G${row}`); row += 3;
  }

  if (!dropped('현금흐름현황')) {
    const months = monthsBetween(opts.window.start, opts.window.end);
    const lastCol = colName(4 + months.length);
    const build = (section: 'income' | 'expense', type: string) => {
      const table = new Map<string, number[]>();
      const ensure = (label: string) => {
        if (!table.has(label)) table.set(label, months.map(() => 0));
        return table.get(label)!;
      };
      for (const t of opts.transactions) {
        if (t.type !== type) continue;
        const i = months.indexOf(t.date.slice(0, 7));
        if (i >= 0) ensure(t.major)[i] += t.amount;
      }
      for (const values of table.values()) values.forEach((v, i) => { values[i] = Math.abs(v); });
      for (const adj of opts.cashflowAdjust ?? []) {
        if (adj.section !== section) continue;
        const i = months.indexOf(adj.month);
        if (i >= 0) ensure(adj.label)[i] += adj.delta;
      }
      const labels = [...table.keys()].sort((a, b) => (a === '미분류' ? 1 : b === '미분류' ? -1 : a.localeCompare(b)));
      return labels.map((label) => ({ label, values: table.get(label)! }));
    };
    const totalRow = (label: string) => {
      put('B', label);
      formula('C', `SUM(E${row}:${lastCol}${row})`); formula('D', `C${row}/${months.length}`);
      months.forEach((_, i) => formula(colName(5 + i), 'SUM(0)'));
      row += 1;
    };
    put('B', '2.현금흐름현황'); row += 1;
    put('B', '최근 1년 동안의 현금흐름을 분석합니다.'); row += 1;
    put('B', '항목'); put('C', '총계'); put('D', '월평균');
    months.forEach((m, i) => put(colName(5 + i), m));
    row += 1;
    for (const [section, type, total] of [['income', '수입', '월수입 총계'], ['expense', '지출', '월지출 총계']] as const) {
      for (const item of build(section, type)) {
        put('B', item.label);
        formula('C', `SUM(E${row}:${lastCol}${row})`); formula('D', `C${row}/${months.length}`);
        item.values.forEach((v, i) => cells.push({ ref: `${colName(5 + i)}${row}`, value: v }));
        row += 1;
      }
      totalRow(total);
    }
    totalRow('순수입 총계');
    row += 2;
  }

  if (!dropped('재무현황')) {
    put('B', '3.재무현황'); row += 1;
    put('B', '데이터를 내보낸 시점의 자산과 부채 상태를 분석합니다.'); row += 1;
    put('B', '자산'); put('F', '부채'); merges.push(`B${row}:E${row}`, `F${row}:I${row}`); row += 1;
    put('B', '항목'); put('C', '상품명'); put('E', '금액'); put('F', '항목'); put('G', '상품명'); put('I', '금액');
    merges.push(`C${row}:D${row}`, `G${row}:H${row}`); row += 1;

    const first = row;
    const side = (items: FixtureAsset[], groupCol: string, nameCol: string, amountCol: string, emptyGroups: string[]) => {
      let r = first;
      const groups: string[] = [];
      for (const item of items) if (!groups.includes(item.group)) groups.push(item.group);
      for (const group of groups) {
        const members = items.filter((item) => item.group === group);
        put(groupCol, group, r);
        if (members.length > 1) merges.push(`${groupCol}${r}:${groupCol}${r + members.length - 1}`);
        for (const item of members) {
          put(nameCol, item.name, r);
          cells.push({ ref: `${amountCol}${r}`, value: item.amount });
          r += 1;
        }
      }
      for (const group of emptyGroups.filter((g) => !groups.includes(g))) { put(groupCol, group, r); r += 1; }
      return r;
    };
    const endAssets = side(opts.assets ?? [], 'B', 'C', 'E', EMPTY_ASSET_GROUPS);
    const endLiabilities = side(opts.liabilities ?? [], 'F', 'G', 'I', []);
    row = Math.max(endAssets, endLiabilities, first + 1);
    put('B', '총자산'); formula('E', `SUM(E${first}:E${row - 1})`); put('F', '총부채'); formula('I', `SUM(I${first}:I${row - 1})`);
    merges.push(`B${row}:D${row}`, `F${row}:H${row}`); row += 1;
    put('B', '순자산'); merges.push(`B${row}:I${row}`); row += 1;
    formula('B', `E${row - 2}-I${row - 2}`); merges.push(`B${row}:I${row}`); row += 3;
  }

  if (!dropped('보험현황')) {
    const list = opts.insurance ?? [];
    put('B', '4.보험현황'); row += 1;
    put('B', '사용자가 보유한 보험상품 현황을 분석합니다.'); row += 1;
    put('B', '금융사'); put('C', '보험명'); put('E', '계약상태'); put('F', '총납입금'); put('G', '계약일자'); put('H', '만기일자');
    merges.push(`C${row}:D${row}`); row += 1;
    const first = row;
    for (const item of list) {
      put('B', item.company); put('C', item.name); put('E', item.status);
      cells.push({ ref: `F${row}`, value: item.paidTotal });
      put('G', date(item.contractDate)); put('H', date(item.maturityDate));
      row += 1;
    }
    if (list.length === 0) row += 1;
    put('B', '총계'); put('C', '보유계약건수'); put('E', `정상 ${list.length}건`); put('F', '총 납입금');
    merges.push(`B${row}:B${row + 1}`); row += 1;
    put('C', `총 ${list.length}건`); put('E', '만기/휴면 0건'); formula('F', `SUM(F${first})`); row += 3;
  }

  if (!dropped('투자현황')) {
    const list = opts.investments ?? [];
    put('B', '5.투자현황'); row += 1;
    put('B', '사용자가 보유한 투자상품 현황을 분석합니다.'); row += 1;
    put('B', '투자상품종류'); put('C', '금융사'); put('D', '상품명'); put('F', '투자원금'); put('G', '평가금액'); put('H', '수익률'); put('I', '가입일자'); put('J', '만기일자');
    row += 1;
    const first = row;
    for (const item of list) {
      put('B', item.kind); put('C', item.company); put('D', item.name);
      cells.push({ ref: `F${row}`, value: item.principal }, { ref: `G${row}`, value: item.valuation });
      put('H', item.returnPct); put('I', date(item.startDate)); put('J', date(item.maturityDate));
      row += 1;
    }
    if (list.length === 0) row += 1;
    put('B', '총계'); put('D', '보유상품개수'); put('F', '총 투자 원금'); put('G', '총 평가 금액'); put('H', '총 수익률'); row += 1;
    put('D', `총 ${list.length}개`); formula('F', `SUM(F${first}:F${row - 2})`); formula('G', `SUM(G${first}:G${row - 2})`); formula('H', 'SUM(0)'); row += 3;
  }

  if (!dropped('대출현황')) {
    const list = opts.loans ?? [];
    put('B', '6.대출현황'); row += 1;
    put('B', '사용자가 보유한 대출상품 현황을 분석합니다.'); row += 1;
    put('B', '대출종류'); put('C', '금융사'); put('D', '상품명'); put('F', '대출원금'); put('G', '대출잔액'); put('H', '대출금리'); put('I', '대출신규일'); put('J', '대출만기일');
    row += 1;
    const first = row;
    for (const item of list) {
      put('B', item.kind); put('C', item.company); put('D', item.name);
      cells.push({ ref: `F${row}`, value: item.principal }, { ref: `G${row}`, value: item.balance }, { ref: `H${row}`, value: item.ratePct });
      put('I', date(item.startDate)); put('J', date(item.maturityDate));
      row += 1;
    }
    if (list.length === 0) row += 1;
    put('B', '총계'); put('D', '보유 대출 상품'); put('F', '총 대출 원금'); put('G', '총 대출 잔액'); row += 1;
    formula('D', 'SUM(0)'); formula('F', `SUM(F${first})`); formula('G', `SUM(G${first})`); row += 3;
  }

  if (opts.extra?.section) {
    put('B', opts.extra.section); row += 1;
    put('B', '알 수 없는 내용');
  }

  return { name: '뱅샐현황', cells, merges };
}

/** Builds a fake export with the same layout as the real one (design spec, appendix A). */
export function buildExportXlsx(opts: FixtureOptions): Uint8Array {
  const sheets: WSheet[] = [];
  if (opts.drop?.sheet !== '뱅샐현황') sheets.push(summarySheet(opts));
  if (opts.drop?.sheet !== '가계부 내역') sheets.push(ledgerSheet(opts));
  return writeXlsx(sheets);
}
