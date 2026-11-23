# Spendprint 1단계: 가져오기와 원장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 뱅크샐러드 내보내기 엑셀을 올리면 미리보기를 거쳐 원장에 합쳐지고, 내역 화면에서 모든 거래를 확인하고 가져오기를 되돌릴 수 있다.

**Architecture:** 순수 로직(`src/core`: xlsx 읽기, 파서, 원장 계산, 비교), 저장과 HTTP(`src/server`: node:sqlite, Hono), 화면(`src/web`: React)을 나눈다. 원장은 가져온 파일 집합의 순수 함수(`buildLedger`)이고, 가져오기와 되돌리기 때마다 전체를 다시 계산해 `ledger` 테이블에 써 둔다. 미리보기는 DB를 건드리지 않고 "지금 원장"과 "이 파일을 더한 원장"을 비교한다.

**Tech Stack:** Node 22.23, TypeScript, node:sqlite(내장), Hono + @hono/node-server, tsx, fflate, fast-xml-parser, Vite + React 19, wouter, Vitest + Testing Library, Pretendard.

**Spec:** `docs/superpowers/specs/2026-11-23-spendprint-design.md`. 이 계획은 §5, §6, §10의 내역·관리(업데이트 기록), §11, §13, §14, §15의 1~8·12~15, 부록 A를 구현한다.

**이후 계획(이 문서 범위 밖):** 2단계 보정(§7, §8), 3단계 분석 화면(§10 홈·소비·수입·흐름·자산), 4단계 고정비(§9), 5단계 AI 연결(§12).

**2단계로 넘기는 §6의 부분:** 개별 수정이 아직 없으므로, 이름이 바뀐 거래의 수정 옮기기와 끊긴 수정의 느슨한 대조는 2단계에서 한다. 이 계획은 그때 쓸 `renamedPairs`까지만 만든다.

## Global Constraints

- 서버는 `127.0.0.1`에만 연다.
- 실제 금융 데이터의 값은 저장소·문서·테스트·로그·커밋 어디에도 옮기지 않는다. 테스트는 `test/support/fixture.ts`가 만든 가짜 파일만 쓴다.
- 데이터 폴더는 `data/`(환경변수 `SPENDPRINT_DATA_DIR`로 바꿀 수 있음)이고 `.gitignore`에 있다.
- 화면은 외부 자원을 불러오지 않는다. 서체와 스크립트는 전부 로컬이다.
- 금액과 원본 값은 어떤 경로로도 바꾸지 않는다.
- 로그에 거래 내용을 남기지 않는다.
- 무료: 유료 서비스나 API 키를 쓰지 않는다.
- 파서는 셀 좌표가 아니라 제목 글자로 구역을 찾는다.
- 일부만 가져오는 일은 없다. 형식 오류면 아무것도 저장하지 않는다.
- 화면 문구는 해요체다. 토스의 로고·이름·전용 서체를 쓰지 않는다. 서체는 Pretendard다.
- 라이브러리는 설치 시점의 최신 버전을 쓴다. 2026-11 기준: hono 4.13, @hono/node-server 2.1, vite 8.3, vitest 5.1, react 19.3, typescript 7.0, tsx 4.23, fflate 0.8, fast-xml-parser 5.12, wouter 3.13, pretendard 1.3. 이 계획의 호출 예시와 라이브러리 API가 다르면 라이브러리의 현재 문서를 따른다.
- SQLite는 `node:sqlite`의 `DatabaseSync`를 쓴다(이 PC의 Node 22.23.4에서 동작 확인. 실험 기능 경고가 한 줄 나온다). 네이티브 모듈을 설치하지 않는다.
- 커밋은 `feat/import-and-ledger` 브랜치에 한다.

## Review Focus

설계서가 암시하지만 놓치기 쉬운 입력과 실패. 각 항목의 테스트는 괄호 안 Task에 들어 있다.

1. 다른 웹페이지가 로컬 서버를 호출한다(다른 Origin이나 Host에서 가져오기 적용·되돌리기). 거부해야 한다. (Task 9)
2. 엑셀이 아닌 파일, 암호 걸린 파일, 잘린 파일을 올린다. 무엇이 문제인지 알려 주고 DB는 그대로여야 한다. (Task 1, Task 7)
3. 적용 도중 실패한다. 원장이 반쯤 바뀐 채 남지 않아야 하고 복사한 원본 파일도 남지 않아야 한다. (Task 7)
4. 내용·메모에 `<`, `&`, 따옴표, 줄바꿈, 이모지, `=SUM(...)` 같은 글자가 있다. 글자 그대로 저장되고 화면에 글자로만 보여야 한다. (Task 1, Task 12)
5. 거래가 0건인 파일, 1년 넘게 안 올려 창이 겹치지 않는 파일을 올린다. 가져와지고 빈 기간이 보고돼야 한다. (Task 3, Task 7, Task 8)

---

## File Structure

```
.gitignore
package.json  tsconfig.json  vite.config.ts  vitest.config.ts  index.html  Spendprint.cmd  README.md
src/core/xlsx/types.ts            xlsx 셀·시트 타입, XlsxError
src/core/xlsx/readXlsx.ts         zip+XML → Workbook
src/core/banksalad/types.ts       RawTransaction, Snapshot, ParsedExport, ExportFormatError
src/core/banksalad/parseExport.ts Workbook → ParsedExport
src/core/ledger/window.ts         파일의 창(기간) 결정
src/core/ledger/fingerprint.ts    거래 지문
src/core/ledger/buildLedger.ts    파일 집합 → 원장
src/core/ledger/diff.ts           원장 비교, 빈 기간
src/core/checks/cashflowCheck.ts  현금흐름표 대조
src/server/paths.ts               데이터 폴더 경로
src/server/db/open.ts             스키마 생성
src/server/services/importService.ts  미리보기·적용·되돌리기·목록
src/server/services/ledgerQuery.ts    원장 조회·필터·상태
src/server/http/guard.ts          Host·Origin 검사
src/server/http/app.ts            라우트
src/server/main.ts                서버 시작, 브라우저 열기
src/web/main.tsx  App.tsx         진입점, 라우팅
src/web/styles/tokens.css  global.css
src/web/lib/format.ts  api.ts  amountVisibility.tsx
src/web/components/               Sidebar, Card, Button, Amount, Modal, Toast, EmptyState
src/web/features/import/          DropOverlay, ImportPreviewModal, useImport
src/web/features/transactions/    FilterBar, TransactionList, TransactionDetail, filterUrl, useLedger
src/web/pages/                    Onboarding, TransactionsPage, ImportsPage
scripts/diagnose.ts  check-offline.ts  make-sample.ts
test/support/writeXlsx.ts  fixture.ts  raw.ts
test/core/**  test/server/**  test/web/**  test/scripts/**  test/real/realFile.test.ts
```

---

### Task 1: 프로젝트 뼈대와 xlsx 읽기

**Files:**
- Create: `.gitignore`, `package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `src/core/xlsx/types.ts`, `src/core/xlsx/readXlsx.ts`
- Create: `test/support/writeXlsx.ts`
- Test: `test/core/xlsx/readXlsx.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:

```ts
// src/core/xlsx/types.ts
export type CellValue = string | number;
export interface Cell { ref: string; col: string; row: number; value: CellValue; isFormula: boolean }
export interface Sheet { name: string; cells: Map<string, Cell>; merges: string[]; maxRow: number }
export interface Workbook { sheets: Sheet[] }
export type XlsxErrorCode = 'NOT_XLSX' | 'ENCRYPTED' | 'CORRUPT';
export class XlsxError extends Error { constructor(public code: XlsxErrorCode, message: string) }

// src/core/xlsx/readXlsx.ts
export function readXlsx(data: Uint8Array): Workbook;
export function getSheet(wb: Workbook, name: string): Sheet | undefined;
export function cellAt(sheet: Sheet, col: string, row: number): Cell | undefined;
export function rowCells(sheet: Sheet, row: number): Cell[]; // 열 순서(A, B, …, Z, AA)

// test/support/writeXlsx.ts  (테스트 전용)
export interface WCell { ref: string; value: string | number; formula?: string }
export interface WSheet { name: string; cells: WCell[]; merges?: string[] }
export function writeXlsx(sheets: WSheet[], opts?: { inlineStrings?: boolean }): Uint8Array;
```

- [ ] **Step 1: 브랜치와 뼈대를 만든다**

```bash
git switch -c feat/import-and-ledger
npm init -y
npm install hono @hono/node-server fflate fast-xml-parser react react-dom wouter pretendard
npm install -D typescript tsx vite vitest @vitejs/plugin-react @types/node @types/react @types/react-dom @testing-library/react @testing-library/user-event jsdom
```

`.gitignore`에 정확히 다음을 넣는다.

```
node_modules/
dist/
data/
coverage/
*.xlsx
*.db
*.db-*
.playwright-mcp/
```

`package.json`: `"type": "module"`, `"private": true`, scripts에 `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`. `tsconfig.json`: strict, `moduleResolution: "bundler"`, `jsx: "react-jsx"`, `noEmit`, include `src`, `test`, `scripts`. `vitest.config.ts`: 기본 환경 node, `test/web/**`만 jsdom.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

```ts
// test/core/xlsx/readXlsx.test.ts
import { expect, it, vi } from 'vitest';
import { zipSync } from 'fflate';
import { cellAt, getSheet, readXlsx, rowCells } from '../../../src/core/xlsx/readXlsx';
import type { XlsxError } from '../../../src/core/xlsx/types';
import { writeXlsx } from '../../support/writeXlsx';

const sample = (inlineStrings = false) => writeXlsx([
  { name: '뱅샐현황', merges: ['F5:G5'], cells: [
    { ref: 'B3', value: '1.고객정보' }, { ref: 'C5', value: 12.5 },
    { ref: 'D5', value: 0, formula: 'SUM(E5:Q5)' }, { ref: 'D6', value: '연령\n(만 나이)' },
  ] },
  { name: '가계부 내역', cells: [{ ref: 'A1', value: '날짜' }, { ref: 'A2', value: 45985 }] },
], { inlineStrings });

it.each([false, true])('reads strings, numbers and formulas (inlineStrings=%s)', (inline) => {
  const s = getSheet(readXlsx(sample(inline)), '뱅샐현황')!;
  expect(cellAt(s, 'B', 3)).toEqual({ ref: 'B3', col: 'B', row: 3, value: '1.고객정보', isFormula: false });
  expect(cellAt(s, 'C', 5)!.value).toBe(12.5);
  expect(cellAt(s, 'D', 5)).toMatchObject({ value: 0, isFormula: true });
  expect(cellAt(s, 'D', 6)!.value).toBe('연령\n(만 나이)');
  expect(cellAt(s, 'Z', 9)).toBeUndefined();
  expect(s.merges).toEqual(['F5:G5']);
  expect(s.maxRow).toBe(6);
  expect(rowCells(s, 5).map((c) => c.ref)).toEqual(['C5', 'D5']);
});

it('keeps sheet order', () => {
  expect(readXlsx(sample()).sheets.map((s) => s.name)).toEqual(['뱅샐현황', '가계부 내역']);
});

it.each(['<b>&"\'', '=SUM(A1)', ' 앞뒤 공백 ', '😀', '007'])('keeps text %j exactly', (text) => {
  const wb = readXlsx(writeXlsx([{ name: 's', cells: [{ ref: 'A1', value: text }] }]));
  expect(cellAt(wb.sheets[0], 'A', 1)!.value).toBe(text);
});

it('writes the same bytes for the same input at any time', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z')); const first = sample();
  vi.setSystemTime(new Date('2027-06-15T12:34:56Z')); const second = sample();
  vi.useRealTimers();
  expect(second).toEqual(first);
});

it('rejects input that is not a readable xlsx, with a code', () => {
  const code = (b: Uint8Array) => { try { readXlsx(b); return 'none'; } catch (e) { return (e as XlsxError).code; } };
  expect(code(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe('ENCRYPTED');
  expect(code(new TextEncoder().encode('hello'))).toBe('NOT_XLSX');
  expect(code(zipSync({ 'a.txt': new Uint8Array([1]) }))).toBe('NOT_XLSX');
  expect(code(sample().slice(0, 200))).toBe('CORRUPT');
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run test/core/xlsx/readXlsx.test.ts`
Expected: FAIL. `readXlsx`와 `writeXlsx`를 찾을 수 없다.

- [ ] **Step 4: `writeXlsx`와 `readXlsx`를 구현한다**

`writeXlsx`: fflate `zipSync`로 `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/worksheets/sheetN.xml`, `xl/sharedStrings.xml`을 만든다. 글자는 기본적으로 sharedStrings(`t="s"`), `inlineStrings`면 `t="inlineStr"`. `formula`가 있으면 `<f>`와 캐시 값 `<v>`를 함께 쓴다. XML 특수문자를 이스케이프하고 공백 보존(`xml:space="preserve"`)을 넣는다. 같은 입력에는 언제나 같은 바이트가 나와야 한다. zip 항목의 시각을 고정값으로 넣는다(파일 해시로 같은 파일을 가리는 뒤의 테스트가 여기에 기댄다).

`readXlsx` 규칙:
- 첫 바이트가 `50 4B`가 아니면: `D0 CF 11 E0`이면 `ENCRYPTED`("암호가 걸려 있거나 xlsx가 아닌 파일이에요"), 그 밖은 `NOT_XLSX`.
- zip은 열리는데 `xl/workbook.xml`이 없으면 `NOT_XLSX`. zip 해제나 XML 해석이 실패하면 `CORRUPT`.
- 시트 이름과 파일은 `xl/workbook.xml`과 `xl/_rels/workbook.xml.rels`로 잇는다.
- 셀 값: `t="s"`는 sharedStrings(서식 조각은 이어 붙임), `t="inlineStr"`·`t="str"`은 글자, 그 밖은 `Number`. `<v>`가 없거나 빈 셀은 `cells`에 넣지 않는다. `<f>`가 있으면 `isFormula: true`.
- fast-xml-parser가 값을 숫자로 바꾸거나 공백을 다듬지 않게 설정한다(`parseTagValue: false`, `trimValues: false`).

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run test/core/xlsx/readXlsx.test.ts && npm run typecheck`
Expected: PASS, 타입 오류 없음.

- [ ] **Step 6: 커밋한다**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vitest.config.ts src/core/xlsx test/support/writeXlsx.ts test/core/xlsx docs
git commit -m "feat: project scaffold and xlsx reader"
```

---

### Task 2: 가짜 내보내기 파일 생성기

**Files:**
- Create: `test/support/fixture.ts`
- Test: `test/support/fixture.test.ts`

**Interfaces:**
- Consumes: `writeXlsx`, `readXlsx`, `cellAt`, `getSheet`, `rowCells` (Task 1)
- Produces:

```ts
// test/support/fixture.ts
export interface FixtureTx {
  date: string; time: string; type: '지출' | '수입' | '이체';
  major: string; minor: string; content: string; amount: number;
  currency: string; method: string; memo: string;
}
export interface FixtureAsset { group: string; name: string; amount: number }
export interface FixtureInvestment { kind: string; company: string; name: string; principal: number; valuation: number; returnPct?: number; startDate?: string; maturityDate?: string }
export interface FixtureInsurance { company: string; name: string; status: string; paidTotal: number; contractDate?: string; maturityDate?: string }
export interface FixtureLoan { kind: string; company: string; name: string; principal: number; balance: number; ratePct: number; startDate?: string; maturityDate?: string }
export interface FixtureOptions {
  window: { start: string; end: string };
  transactions: FixtureTx[];
  profile?: { name?: string; gender?: string; age?: number; creditScore?: number; email?: string };
  assets?: FixtureAsset[]; liabilities?: FixtureAsset[];
  investments?: FixtureInvestment[]; insurance?: FixtureInsurance[]; loans?: FixtureLoan[];
  cashflowAdjust?: { section: 'income' | 'expense'; label: string; month: string; delta: number }[];
  drop?: { sheet?: '뱅샐현황' | '가계부 내역'; txColumn?: string; section?: string };
  extra?: { txColumn?: { name: string; value: string }; section?: string };
}
/** 기본값: time '12:00:00', type은 금액이 음수면 '지출' 아니면 '수입', major는 '식비'/'급여', minor '미분류', currency 'KRW', memo '' */
export function tx(date: string, amount: number, content: string, method: string, over?: Partial<FixtureTx>): FixtureTx;
export function buildExportXlsx(opts: FixtureOptions): Uint8Array;
export function exportFilename(window: { start: string; end: string }): string; // 'YYYY-MM-DD~YYYY-MM-DD.xlsx'
export function excelSerial(date: string): number;
export function excelTimeFraction(time: string): number;
```

배치는 설계서 부록 A를 그대로 따른다. 지켜야 할 것:
- 시트 순서는 `뱅샐현황`, `가계부 내역`.
- `가계부 내역`은 날짜·시간 내림차순으로 쓴다. 날짜는 일련번호, 시간은 하루 중 비율, 금액은 숫자, 빈 메모는 셀을 만들지 않는다.
- 현금흐름표의 월은 창의 시작 월부터 종료 월까지다. 항목 행은 거래에 나온 (타입, 대분류)만 만든다. 칸 값은 같은 타입·대분류·월 금액 합계의 절댓값에 `cashflowAdjust`를 더한 값이다. `총계`·`월평균` 열과 세 총계 행은 캐시 값 0인 수식이다.
- 재무현황의 자산 `항목`은 묶음의 첫 행에만 쓰고 세로 병합을 넣는다. `총자산`·`총부채`·`순자산`은 캐시 값 0인 수식이다.
- 기본 프로필은 이름 `김테스트`, 성별 `여`, 연령 30, 신용점수 900, 이메일 `-`.
- `drop`은 해당 시트·열·구역을 뺀다. `drop.section`은 번호 없는 이름(`재무현황`)이다. `extra`는 모르는 열·구역을 덧붙인다. `extra.section`은 제목 전체(`7.기타현황`)이고 맨 아래에 제목 행과 글자 한 칸을 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// test/support/fixture.test.ts
import { expect, it } from 'vitest';
import { cellAt, getSheet, readXlsx, rowCells } from '../../src/core/xlsx/readXlsx';
import { buildExportXlsx, excelSerial, excelTimeFraction, exportFilename, tx } from './fixture';

const wb = () => readXlsx(buildExportXlsx({
  window: { start: '2025-11-23', end: '2026-11-23' },
  transactions: [
    tx('2026-10-05', -15000, '택시', '카드 A', { major: '교통' }),
    tx('2026-11-23', -8700, '편의점 A', '카드 A', { time: '09:56:42', major: '생활', memo: '간식' }),
  ],
  assets: [{ group: '자유입출금 자산', name: '저축예금', amount: 6 }, { group: '자유입출금 자산', name: '저축예금', amount: 530 }],
}));

it('converts dates and times like Excel', () => {
  expect(excelSerial('2025-01-01')).toBe(45658);
  expect(excelSerial('2025-11-24')).toBe(45985);
  expect(excelSerial('2026-11-23')).toBe(46349);
  expect(excelTimeFraction('12:00:00')).toBe(0.5);
  expect(exportFilename({ start: '2025-11-23', end: '2026-11-23' })).toBe('2025-11-23~2026-11-23.xlsx');
});

it('writes the ledger sheet newest first with typed cells', () => {
  const s = getSheet(wb(), '가계부 내역')!;
  expect(rowCells(s, 1).map((c) => c.value)).toEqual(['날짜', '시간', '타입', '대분류', '소분류', '내용', '금액', '화폐', '결제수단', '메모']);
  expect(cellAt(s, 'A', 2)!.value).toBe(46349);
  expect(cellAt(s, 'B', 2)!.value).toBeCloseTo(35802 / 86400, 10);
  expect(cellAt(s, 'G', 2)!.value).toBe(-8700);
  expect(cellAt(s, 'J', 2)!.value).toBe('간식');
  expect(cellAt(s, 'J', 3)).toBeUndefined();
});

it('lays out the summary sheet like the real export', () => {
  const s = getSheet(wb(), '뱅샐현황')!;
  const titles = [...s.cells.values()].filter((c) => c.col === 'B' && /^\d\./.test(String(c.value))).map((c) => c.value);
  expect(titles).toEqual(['1.고객정보', '2.현금흐름현황', '3.재무현황', '4.보험현황', '5.투자현황', '6.대출현황']);
  const header = [...s.cells.values()].find((c) => c.value === '항목' && cellAt(s, 'C', c.row)?.value === '총계')!;
  expect(rowCells(s, header.row).slice(3).map((c) => c.value)).toHaveLength(13);
  expect(cellAt(s, 'E', header.row)!.value).toBe('2025-11');
  const total = [...s.cells.values()].find((c) => c.value === '월지출 총계')!;
  expect(cellAt(s, 'E', total.row)).toMatchObject({ value: 0, isFormula: true });
  expect([...s.cells.values()].some((c) => c.value === '연령\n(만 나이)')).toBe(true);
  const groupCells = [...s.cells.values()].filter((c) => c.value === '자유입출금 자산');
  expect(groupCells).toHaveLength(1);
  expect(s.merges.some((m) => m.startsWith(`B${groupCells[0].row}:B`))).toBe(true);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/support/fixture.test.ts`
Expected: FAIL. `./fixture`를 찾을 수 없다.

- [ ] **Step 3: `test/support/fixture.ts`를 구현한다**

`excelSerial`은 1899-12-30을 0으로 하는 UTC 날짜 차이다. 구역은 위에서부터 차례로 쌓고, 구역 사이에 빈 행을 둔다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run test/support/fixture.test.ts`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add test/support/fixture.ts test/support/fixture.test.ts
git commit -m "test: synthetic Banksalad export builder"
```

---

### Task 3: 내보내기 파서

**Files:**
- Create: `src/core/banksalad/types.ts`, `src/core/banksalad/parseExport.ts`
- Test: `test/core/banksalad/parseExport.test.ts`

**Interfaces:**
- Consumes: `Workbook`, `CellValue`, `getSheet`, `cellAt`, `rowCells` (Task 1), `buildExportXlsx`, `tx` (Task 2)
- Produces:

```ts
// src/core/banksalad/types.ts
import type { CellValue } from '../xlsx/types';
export interface RawTransaction {
  rowIndex: number;      // 파일 안 순서, 0이 맨 위(최신)
  date: string;          // 'YYYY-MM-DD'
  time: string;          // 'HH:MM:SS'
  type: string; major: string; minor: string; content: string;
  amount: number;        // 부호 있음
  currency: string; method: string;
  memo: string;          // 없으면 ''
  extra: Record<string, CellValue>; // 모르는 열의 값
}
export interface Profile { name: string; gender: string; age: number | null; creditScore: number | null; email: string }
export interface CashflowRow { label: string; values: number[] }
export interface CashflowTable { months: string[]; income: CashflowRow[]; expense: CashflowRow[] }
export interface AssetRow { side: 'asset' | 'liability'; group: string; name: string; amount: number; ordinal: number }
export interface InsuranceRow { company: string; name: string; status: string; paidTotal: number | null; contractDate: string | null; maturityDate: string | null }
export interface InvestmentRow { kind: string; company: string; name: string; principal: number | null; valuation: number | null; returnPct: number | null; startDate: string | null; maturityDate: string | null }
export interface LoanRow { kind: string; company: string; name: string; principal: number | null; balance: number | null; ratePct: number | null; startDate: string | null; maturityDate: string | null }
export interface Snapshot {
  profile: Profile; cashflow: CashflowTable; assets: AssetRow[];
  insurance: InsuranceRow[]; investments: InvestmentRow[]; loans: LoanRow[];
  rawCells: Record<string, CellValue>; rawMerges: string[];
}
export type ParseWarningCode = 'UNKNOWN_TX_COLUMN' | 'UNKNOWN_SECTION' | 'NON_KRW';
export interface ParseWarning { code: ParseWarningCode; message: string }
export interface ParsedExport { transactions: RawTransaction[]; snapshot: Snapshot; warnings: ParseWarning[] }
export class ExportFormatError extends Error { constructor(public problems: string[]) }

// src/core/banksalad/parseExport.ts
export function parseExport(wb: Workbook): ParsedExport;
```

파서 규칙:
- 구역은 `뱅샐현황` B열에서 `/^\d+\.\s*\S+$/`에 맞는 글자로 찾는다. 알려진 구역은 `고객정보`, `현금흐름현황`, `재무현황`, `보험현황`, `투자현황`, `대출현황`이고 여섯 개 모두 필수다. 그 밖의 구역 제목은 `UNKNOWN_SECTION` 경고다.
- 열 제목은 공백과 줄바꿈을 모두 뺀 글자로 비교하고(`연령\n(만 나이)` → `연령(만나이)`), 열 위치는 제목으로 찾는다.
- 데이터 행은 열 제목 다음 행부터, B열이 `총계`·`총자산`이거나 구역이 끝나는 곳까지다. 현금흐름표는 `월수입 총계` 앞이 수입, 그 뒤 `월지출 총계` 앞이 지출이다.
- 자산의 `항목`은 병합 때문에 비어 있으면 위의 값을 잇는다. 상품명이 없는 행은 건너뛴다. `ordinal`은 같은 (side, group, name) 안에서의 순서(0부터)다.
- 날짜 일련번호는 1899-12-30 기준 UTC로 `YYYY-MM-DD`로 바꾼다. 시간은 `Math.round(비율 * 86400)`을 0~86399로 자른 뒤 `HH:MM:SS`로 바꾼다. 시간 셀이 없으면 `00:00:00`.
- 이메일 `-`는 `''`. 숫자 칸이 비어 있으면 `null`(현금흐름표 칸은 0).
- `가계부 내역`의 필수 열 10개 중 없는 것, 없는 시트, 없는 구역, 금액이나 날짜가 숫자가 아닌 행은 모두 모아 `ExportFormatError.problems`로 한 번에 던진다. 문구는 무엇이 없는지 이름을 넣는다. 예: `시트 '가계부 내역'이 없어요`, `'가계부 내역'에 '결제수단' 열이 없어요`, `'뱅샐현황'에 '재무현황' 구역이 없어요`, `'가계부 내역' 5행의 금액이 숫자가 아니에요`. 열 자체가 없으면 그 열에 대한 행별 문제는 내지 않는다.
- 모르는 열은 `UNKNOWN_TX_COLUMN` 경고를 내고 값을 `extra`에 넣는다. 화폐가 `KRW`가 아닌 행이 있으면 건수를 담아 `NON_KRW` 경고를 낸다.
- `rawCells`는 `뱅샐현황`의 모든 셀(`ref` → 값), `rawMerges`는 병합 목록이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// test/core/banksalad/parseExport.test.ts
import { expect, it } from 'vitest';
import { parseExport } from '../../../src/core/banksalad/parseExport';
import { ExportFormatError } from '../../../src/core/banksalad/types';
import { getSheet, readXlsx } from '../../../src/core/xlsx/readXlsx';
import { buildExportXlsx, tx, type FixtureOptions } from '../../support/fixture';

const build = (over: Partial<FixtureOptions> = {}) => buildExportXlsx({
  window: { start: '2025-11-23', end: '2026-11-23' },
  transactions: [
    tx('2026-11-23', -8700, '편의점 A', '카드 A', { time: '09:56:42', major: '생활', minor: '편의점' }),
    tx('2026-11-20', 3000000, '회사급여', '통장 A', { type: '이체', major: '저축', time: '00:00:00' }),
    tx('2026-10-05', -15000, '택시', '카드 A', { major: '교통', minor: '택시', time: '23:59:59', memo: '야근' }),
    tx('2026-10-05', 15000, '택시', '카드 A', { type: '지출', major: '교통', minor: '택시', time: '23:59:58' }),
    tx('2026-01-02', 100, '이자', '통장 A', { type: '수입', major: '미분류' }),
    tx('2026-01-03', -200, '알 수 없음', '카드 A', { major: '미분류' }),
  ],
  assets: [
    { group: '자유입출금 자산', name: '저축예금', amount: 6 },
    { group: '자유입출금 자산', name: '저축예금', amount: 530 },
    { group: '투자성 자산', name: '기본계좌', amount: 428.967 },
  ],
  liabilities: [{ group: '장기대출', name: '전세대출', amount: 1000000 }],
  investments: [{ kind: '주식', company: '증권 A', name: '종목 A', principal: 1000, valuation: 1500, returnPct: 50 }],
  ...over,
});
const parse = (over: Partial<FixtureOptions> = {}) => parseExport(readXlsx(build(over)));
const problems = (over: Partial<FixtureOptions>) => { try { parse(over); return []; } catch (e) { return (e as ExportFormatError).problems; } };

it('parses every transaction field in file order', () => {
  const { transactions: t, warnings } = parse();
  expect(warnings).toEqual([]);
  expect(t).toHaveLength(6);
  expect(t[0]).toEqual({ rowIndex: 0, date: '2026-11-23', time: '09:56:42', type: '지출', major: '생활', minor: '편의점', content: '편의점 A', amount: -8700, currency: 'KRW', method: '카드 A', memo: '', extra: {} });
  expect(t[1]).toMatchObject({ date: '2026-11-20', time: '00:00:00', type: '이체', amount: 3000000 });
  expect(t[2]).toMatchObject({ time: '23:59:59', memo: '야근', amount: -15000 });
  expect(t[3]).toMatchObject({ time: '23:59:58', amount: 15000 });
});

it('parses the summary sheet', () => {
  const { snapshot: s } = parse();
  expect(s.profile).toEqual({ name: '김테스트', gender: '여', age: 30, creditScore: 900, email: '' });
  expect(s.cashflow.months).toHaveLength(13);
  expect(s.cashflow.months[0]).toBe('2025-11');
  expect(s.cashflow.income.map((r) => r.label)).toEqual(['미분류']);
  expect(s.cashflow.expense.map((r) => r.label).sort()).toEqual(['교통', '미분류', '생활']);
  expect(s.cashflow.expense.find((r) => r.label === '교통')!.values[s.cashflow.months.indexOf('2026-10')]).toBe(0);
  expect(s.assets).toEqual([
    { side: 'asset', group: '자유입출금 자산', name: '저축예금', amount: 6, ordinal: 0 },
    { side: 'asset', group: '자유입출금 자산', name: '저축예금', amount: 530, ordinal: 1 },
    { side: 'asset', group: '투자성 자산', name: '기본계좌', amount: 428.967, ordinal: 0 },
    { side: 'liability', group: '장기대출', name: '전세대출', amount: 1000000, ordinal: 0 },
  ]);
  expect(s.investments).toEqual([{ kind: '주식', company: '증권 A', name: '종목 A', principal: 1000, valuation: 1500, returnPct: 50, startDate: null, maturityDate: null }]);
  expect(s.insurance).toEqual([]);
  expect(s.loans).toEqual([]);
});

it('keeps every cell of the summary sheet as raw data', () => {
  const sheet = getSheet(readXlsx(build()), '뱅샐현황')!;
  const { snapshot } = parse();
  expect(Object.keys(snapshot.rawCells)).toHaveLength(sheet.cells.size);
  expect(snapshot.rawMerges).toEqual(sheet.merges);
});

it('parses insurance, loans and dated investments when present', () => {
  const { snapshot: s } = parse({
    insurance: [{ company: '보험 A', name: '실손', status: '정상', paidTotal: 500000, contractDate: '2020-03-01' }],
    loans: [{ kind: '신용대출', company: '은행 A', name: '대출 A', principal: 1000, balance: 400, ratePct: 4.5, startDate: '2024-01-15', maturityDate: '2027-01-15' }],
    investments: [{ kind: '펀드', company: '은행 A', name: '펀드 A', principal: 0, valuation: 0, startDate: '2025-12-03' }],
  });
  expect(s.insurance).toEqual([{ company: '보험 A', name: '실손', status: '정상', paidTotal: 500000, contractDate: '2020-03-01', maturityDate: null }]);
  expect(s.loans[0]).toEqual({ kind: '신용대출', company: '은행 A', name: '대출 A', principal: 1000, balance: 400, ratePct: 4.5, startDate: '2024-01-15', maturityDate: '2027-01-15' });
  expect(s.investments[0]).toMatchObject({ returnPct: null, startDate: '2025-12-03' });
});

it('reports everything that is missing, and imports nothing', () => {
  expect(problems({ drop: { sheet: '가계부 내역' } })).toEqual(["시트 '가계부 내역'이 없어요"]);
  expect(problems({ drop: { txColumn: '결제수단' } })).toEqual(["'가계부 내역'에 '결제수단' 열이 없어요"]);
  expect(problems({ drop: { section: '재무현황' } })).toEqual(["'뱅샐현황'에 '재무현황' 구역이 없어요"]);
  expect(problems({ drop: { txColumn: '금액', section: '투자현황' } })).toHaveLength(2);
});

it('imports unknown additions with a warning', () => {
  const r = parse({ extra: { txColumn: { name: '태그', value: '여행' }, section: '7.기타현황' } });
  expect(r.warnings.map((w) => w.code).sort()).toEqual(['UNKNOWN_SECTION', 'UNKNOWN_TX_COLUMN']);
  expect(r.transactions[0].extra).toEqual({ 태그: '여행' });
});

it('warns about non-KRW rows and accepts an empty ledger', () => {
  expect(parse({ transactions: [tx('2026-01-02', -10, '해외', '카드 A', { currency: 'USD' })] }).warnings).toEqual([{ code: 'NON_KRW', message: '원화가 아닌 거래가 1건 있어요. 합계에서 빠져요' }]);
  expect(parse({ transactions: [] }).transactions).toEqual([]);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/core/banksalad/parseExport.test.ts`
Expected: FAIL. `parseExport`를 찾을 수 없다.

- [ ] **Step 3: `types.ts`와 `parseExport(wb: Workbook): ParsedExport`를 구현한다**

위 "파서 규칙"을 따른다. 구역별 해석 함수를 따로 두고, 문제는 배열에 모았다가 끝에서 한 번 던진다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run test/core/banksalad && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/core/banksalad test/core/banksalad
git commit -m "feat: parse Banksalad export into transactions and snapshot"
```

---

### Task 4: 창과 지문

**Files:**
- Create: `src/core/ledger/window.ts`, `src/core/ledger/fingerprint.ts`, `test/support/raw.ts`
- Test: `test/core/ledger/window.test.ts`, `test/core/ledger/fingerprint.test.ts`

**Interfaces:**
- Consumes: `RawTransaction`, `ExportFormatError` (Task 3)
- Produces:

```ts
// src/core/ledger/window.ts
export interface ExportWindow { start: string; end: string } // 양끝 포함, 'YYYY-MM-DD'
export function windowFromFilename(filename: string): ExportWindow | null;
export function resolveWindow(filename: string, txDates: string[]): ExportWindow;

// src/core/ledger/fingerprint.ts
export function fingerprintRows(rows: RawTransaction[]): string[]; // rows와 같은 길이·순서
export function twinKey(r: RawTransaction): string;               // 날짜·시간·금액·내용 (결제수단 제외)

// test/support/raw.ts
/** 기본값: time '12:00:00', type은 음수면 '지출' 아니면 '수입', major '식비', minor '미분류', currency 'KRW', memo '', extra {}, rowIndex 0 */
export function raw(date: string, amount: number, content: string, method: string, over?: Partial<RawTransaction>): RawTransaction;
/** rowIndex를 배열 순서대로 다시 매긴다 */
export function rows(...list: RawTransaction[]): RawTransaction[];
```

규칙:
- 파일명 어디에든 `/(\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})/`가 있으면 창으로 읽는다. 날짜가 실제 날짜가 아니거나 시작이 종료보다 늦으면 `null`.
- `resolveWindow`: 파일명 창과 거래 날짜의 최소·최대를 합쳐 넓힌다. 파일명 창이 없으면 거래 날짜의 최소·최대. 둘 다 없으면 `ExportFormatError(['파일명에서 기간을 읽을 수 없고 거래도 없어요'])`.
- 지문은 `sha1(date␟time␟amount␟content␟method)`의 앞 20자(hex)에 `#순번`을 붙인다. 구분자는 `\u001f`. 순번은 같은 다섯 값이 여러 번 나올 때 배열의 뒤(오래된 쪽)부터 0, 1, …이다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// test/core/ledger/window.test.ts
import { expect, it } from 'vitest';
import { resolveWindow, windowFromFilename } from '../../../src/core/ledger/window';

it('reads the window from the file name', () => {
  const w = { start: '2025-11-23', end: '2026-11-23' };
  expect(windowFromFilename('2025-11-23~2026-11-23.xlsx')).toEqual(w);
  expect(windowFromFilename('2025-11-23~2026-11-23 (1).xlsx')).toEqual(w);
  expect(windowFromFilename('가계부.xlsx')).toBeNull();
  expect(windowFromFilename('2026-13-01~2026-11-23.xlsx')).toBeNull();
  expect(windowFromFilename('2026-11-23~2025-11-23.xlsx')).toBeNull();
});

it('widens the window with the data and falls back to it', () => {
  expect(resolveWindow('2025-11-23~2026-11-23.xlsx', ['2025-11-20', '2026-11-25'])).toEqual({ start: '2025-11-20', end: '2026-11-25' });
  expect(resolveWindow('2025-11-23~2026-11-23.xlsx', [])).toEqual({ start: '2025-11-23', end: '2026-11-23' });
  expect(resolveWindow('가계부.xlsx', ['2026-03-01', '2026-01-05'])).toEqual({ start: '2026-01-05', end: '2026-03-01' });
  expect(() => resolveWindow('가계부.xlsx', [])).toThrow('파일명에서 기간을 읽을 수 없고 거래도 없어요');
});
```

```ts
// test/core/ledger/fingerprint.test.ts
import { expect, it } from 'vitest';
import { fingerprintRows, twinKey } from '../../../src/core/ledger/fingerprint';
import { raw, rows } from '../../support/raw';

const a = raw('2026-05-10', -5000, '가게', '카드 A');

it('depends on date, time, amount, content and method only', () => {
  const fp = (r = a) => fingerprintRows([r])[0];
  expect(fp()).toMatch(/^[0-9a-f]{20}#0$/);
  for (const over of [{ date: '2026-05-11' }, { time: '12:00:01' }, { amount: -5001 }, { content: '가게2' }, { method: '카드 B' }]) {
    expect(fp({ ...a, ...over })).not.toBe(fp());
  }
  expect(fp({ ...a, type: '이체', major: '교통', minor: '택시', memo: '메모', rowIndex: 7 })).toBe(fp());
});

it('numbers identical rows from the oldest', () => {
  const [top, bottom] = fingerprintRows(rows(a, a));
  expect(top.endsWith('#1')).toBe(true);
  expect(bottom.endsWith('#0')).toBe(true);
  expect(top.slice(0, 20)).toBe(bottom.slice(0, 20));
});

it('builds a twin key without the method', () => {
  expect(twinKey(a)).toBe(twinKey({ ...a, method: '카드 B' }));
  expect(twinKey(a)).not.toBe(twinKey({ ...a, content: '가게2' }));
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/core/ledger`
Expected: FAIL. 모듈을 찾을 수 없다.

- [ ] **Step 3: `window.ts`, `fingerprint.ts`, `test/support/raw.ts`를 구현한다**

sha1은 `node:crypto`의 `createHash`를 쓴다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run test/core/ledger`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/core/ledger/window.ts src/core/ledger/fingerprint.ts test/support/raw.ts test/core/ledger
git commit -m "feat: export window and transaction fingerprint"
```

---

### Task 5: 원장 계산

**Files:**
- Create: `src/core/ledger/buildLedger.ts`
- Test: `test/core/ledger/buildLedger.test.ts`

**Interfaces:**
- Consumes: `RawTransaction` (Task 3), `ExportWindow`, `fingerprintRows`, `twinKey`, `raw`, `rows` (Task 4)
- Produces:

```ts
// src/core/ledger/buildLedger.ts
export interface ImportFile { id: number; window: ExportWindow; importedSeq: number; transactions: RawTransaction[] }
export interface LedgerEntry extends RawTransaction { importId: number; fingerprint: string; keptFromVanishedMethod: boolean }
export interface LedgerResult {
  entries: LedgerEntry[];                                    // 날짜 내림차순, 시간 내림차순, importId 내림차순, rowIndex 오름차순
  vanishedMethods: { method: string; keptCount: number }[];  // method 오름차순
  renamedMethods: { from: string; to: string; count: number }[];
  renamedPairs: { fromFingerprint: string; toFingerprint: string }[];
}
export function buildLedger(files: ImportFile[]): LedgerResult;
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// test/core/ledger/buildLedger.test.ts
import { expect, it } from 'vitest';
import { buildLedger, type ImportFile } from '../../../src/core/ledger/buildLedger';
import { raw, rows } from '../../support/raw';
import type { RawTransaction } from '../../../src/core/banksalad/types';

const file = (id: number, start: string, end: string, list: RawTransaction[], importedSeq = id): ImportFile =>
  ({ id, window: { start, end }, importedSeq, transactions: rows(...list) });
const view = (files: ImportFile[]) => buildLedger(files).entries.map((e) => `${e.date} ${e.content} ${e.method} ${e.major} f${e.importId}${e.keptFromVanishedMethod ? ' kept' : ''}`);

const A = file(1, '2026-01-01', '2026-06-30', [
  raw('2026-05-10', -3000, '사라질 가게', 'X카드'),
  raw('2026-05-10', -5000, '가게', 'X카드', { major: '식비' }),
  raw('2026-02-01', -1000, '옛 가게', 'X카드'),
]);
const B = file(2, '2026-04-01', '2026-09-30', [
  raw('2026-08-01', -7000, '새 가게', 'X카드'),
  raw('2026-05-10', -5000, '가게', 'X카드', { major: '뷰티/미용' }),
]);

it('returns every row of a single file', () => {
  expect(view([A])).toEqual(['2026-05-10 사라질 가게 X카드 식비 f1', '2026-05-10 가게 X카드 식비 f1', '2026-02-01 옛 가게 X카드 식비 f1']);
});

it('lets the newer file decide the overlapping period and keeps the older period', () => {
  expect(view([A, B])).toEqual(['2026-08-01 새 가게 X카드 식비 f2', '2026-05-10 가게 X카드 뷰티/미용 f2', '2026-02-01 옛 가게 X카드 식비 f1']);
});

it('does not depend on import order', () => {
  expect(buildLedger([B, A])).toEqual(buildLedger([A, B]));
});

it('breaks ties on the same end date by import sequence, and ignores late imports of old files', () => {
  const B2 = file(3, '2026-04-01', '2026-09-30', [raw('2026-08-01', -7000, '새 가게', 'X카드', { major: '카페/간식' })]);
  expect(view([B, B2])[0]).toBe('2026-08-01 새 가게 X카드 카페/간식 f3');
  const lateOld = { ...A, id: 9, importedSeq: 9 };
  expect(view([B, lateOld])).toEqual(view([A, B]).map((s) => s.replace('f1', 'f9')));
});

it('keeps the history of a payment method that vanished from newer files', () => {
  const A2 = file(1, '2026-01-01', '2026-06-30', [...A.transactions, raw('2026-05-12', -900, '서점', 'Y카드')]);
  const r = buildLedger([A2, B]);
  expect(view([A2, B])).toContain('2026-05-12 서점 Y카드 식비 f1 kept');
  expect(r.vanishedMethods).toEqual([{ method: 'Y카드', keptCount: 1 }]);
  expect(r.renamedMethods).toEqual([]);
});

it('treats a vanished method with a twin in the newer file as a rename', () => {
  const A3 = file(1, '2026-01-01', '2026-06-30', [raw('2026-05-10', -5000, '가게', 'Y카드'), raw('2026-05-10', -5000, '가게', 'Y카드')]);
  const B3 = file(2, '2026-04-01', '2026-09-30', [raw('2026-05-10', -5000, '가게', 'Z카드')]);
  const r = buildLedger([A3, B3]);
  expect(view([A3, B3])).toEqual(['2026-05-10 가게 Z카드 식비 f2', '2026-05-10 가게 Y카드 식비 f1 kept']);
  expect(r.renamedMethods).toEqual([{ from: 'Y카드', to: 'Z카드', count: 1 }]);
  expect(r.renamedPairs).toHaveLength(1);
  expect(r.renamedPairs[0].toFingerprint).toBe(r.entries[0].fingerprint);
});

it('drops kept history once the method reappears in a newer file', () => {
  const A2 = file(1, '2026-01-01', '2026-06-30', [raw('2026-05-12', -900, '서점', 'Y카드')]);
  const C = file(3, '2026-05-01', '2026-10-31', [raw('2026-10-01', -100, '문구', 'Y카드')]);
  expect(view([A2, B, C])).not.toContain('2026-05-12 서점 Y카드 식비 f1 kept');
});

it('uses the newest file that still has the method', () => {
  const A2 = file(1, '2026-01-01', '2026-06-30', [raw('2026-05-12', -900, '서점', 'Y카드'), raw('2026-02-02', -800, '옛 서점', 'Y카드')]);
  const B2 = file(2, '2026-04-01', '2026-09-30', [raw('2026-05-12', -950, '서점 정정', 'Y카드')]);
  const C = file(3, '2026-05-01', '2026-10-31', [raw('2026-10-01', -100, '문구', 'X카드')]);
  expect(view([A2, B2, C])).toEqual(['2026-10-01 문구 X카드 식비 f3', '2026-05-12 서점 정정 Y카드 식비 f2 kept', '2026-02-02 옛 서점 Y카드 식비 f1']);
});

it('keeps both of two identical rows and joins non-overlapping files', () => {
  const D = file(1, '2026-01-01', '2026-01-31', [raw('2026-01-05', -100, '자판기', 'X카드'), raw('2026-01-05', -100, '자판기', 'X카드')]);
  const E = file(2, '2026-03-01', '2026-03-31', [raw('2026-03-05', -200, '자판기', 'X카드')]);
  const r = buildLedger([D, E]);
  expect(r.entries).toHaveLength(3);
  expect(new Set(r.entries.map((e) => e.fingerprint)).size).toBe(3);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/core/ledger/buildLedger.test.ts`
Expected: FAIL. `buildLedger`를 찾을 수 없다.

- [ ] **Step 3: `buildLedger(files: ImportFile[]): LedgerResult`를 구현한다**

서명과 테스트만으로 정해지지 않는 알고리즘이라 적는다.

1. 우선순위: `window.end` 내림차순, 같으면 `importedSeq` 내림차순.
2. 파일마다 그 파일의 거래에 나오는 결제수단 집합을 만든다. 지문은 파일 단위로 `fingerprintRows`로 계산한다.
3. 우선순위 순으로 파일을 돌며, 각 행 r(날짜 d, 결제수단 M)에 대해 "더 새 파일들" = 우선순위가 앞서고 창이 d를 포함하는 파일들을 구한다.
   - 더 새 파일 중 하나라도 결제수단 집합에 M이 있으면 r을 버린다.
   - 더 새 파일이 없으면 r을 받는다(`keptFromVanishedMethod: false`).
   - 그 밖(더 새 파일들에 M이 전혀 없음): 더 새 파일들에서 이미 받은 항목 중 `twinKey`가 같고 아직 짝지어지지 않은 것이 있으면, 그 항목과 짝짓고 r을 버린다(이름 변경: `from` M, `to` 그 항목의 결제수단, `renamedPairs`에 지문 쌍). 없으면 r을 받는다(`keptFromVanishedMethod: true`).
4. `vanishedMethods`는 `keptFromVanishedMethod`로 받은 행을 결제수단별로 센 것이다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run test/core/ledger && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/core/ledger/buildLedger.ts test/core/ledger/buildLedger.test.ts
git commit -m "feat: build ledger from the set of imported files"
```

---

### Task 6: 원장 비교와 현금흐름표 대조

**Files:**
- Create: `src/core/ledger/diff.ts`, `src/core/checks/cashflowCheck.ts`
- Test: `test/core/ledger/diff.test.ts`, `test/core/checks/cashflowCheck.test.ts`

**Interfaces:**
- Consumes: `LedgerEntry`, `buildLedger` (Task 5), `ExportWindow` (Task 4), `CashflowTable`, `RawTransaction` (Task 3), `parseExport`, `buildExportXlsx`, `tx`
- Produces:

```ts
// src/core/ledger/diff.ts
export interface LedgerDiff { added: LedgerEntry[]; removed: LedgerEntry[]; changed: { before: LedgerEntry; after: LedgerEntry }[]; unchangedCount: number }
export function diffLedgers(before: LedgerEntry[], after: LedgerEntry[]): LedgerDiff;
export function findGaps(windows: ExportWindow[]): ExportWindow[]; // 가장 이른 시작과 가장 늦은 종료 사이에서 어떤 창에도 들지 않는 구간

// src/core/checks/cashflowCheck.ts
export interface CashflowMismatch { section: 'income' | 'expense'; label: string; month: string; sheet: number; computed: number }
export interface CashflowCheck { checkedCells: number; mismatches: CashflowMismatch[] }
export function checkCashflow(table: CashflowTable, txs: RawTransaction[]): CashflowCheck;
```

규칙:
- `changed`는 지문이 같고 `type`·`major`·`minor`·`memo` 중 하나라도 다른 경우다. `importId`나 `rowIndex`만 다르면 변경이 아니다.
- `checkCashflow`의 계산값은 타입이 `수입`(income) 또는 `지출`(expense)이고 대분류가 항목과 같고 날짜의 월이 같은 거래의 금액 합계의 절댓값이다. 표의 값과 0.5보다 크게 다르면 불일치다. `checkedCells`는 항목 수 × 월 수다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// test/core/ledger/diff.test.ts
import { expect, it } from 'vitest';
import { buildLedger } from '../../../src/core/ledger/buildLedger';
import { diffLedgers, findGaps } from '../../../src/core/ledger/diff';
import { raw, rows } from '../../support/raw';

const ledger = (id: number, ...list: Parameters<typeof rows>) =>
  buildLedger([{ id, importedSeq: id, window: { start: '2026-01-01', end: '2026-12-31' }, transactions: rows(...list) }]).entries;

it('classifies added, removed, changed and unchanged', () => {
  const before = ledger(1, raw('2026-05-10', -5000, '가게', 'X카드', { major: '카페/간식' }), raw('2026-05-09', -100, '취소될 것', 'X카드'), raw('2026-05-08', -200, '그대로', 'X카드'));
  const after = ledger(2, raw('2026-05-11', -700, '새 거래', 'X카드'), raw('2026-05-10', -5000, '가게', 'X카드', { major: '뷰티/미용' }), raw('2026-05-08', -200, '그대로', 'X카드'));
  const d = diffLedgers(before, after);
  expect(d.added.map((e) => e.content)).toEqual(['새 거래']);
  expect(d.removed.map((e) => e.content)).toEqual(['취소될 것']);
  expect(d.changed).toHaveLength(1);
  expect([d.changed[0].before.major, d.changed[0].after.major]).toEqual(['카페/간식', '뷰티/미용']);
  expect(d.unchangedCount).toBe(1);
});

it('finds uncovered date ranges', () => {
  expect(findGaps([{ start: '2026-01-01', end: '2026-03-31' }, { start: '2026-05-01', end: '2026-06-30' }])).toEqual([{ start: '2026-04-01', end: '2026-04-30' }]);
  expect(findGaps([{ start: '2026-01-01', end: '2026-03-31' }, { start: '2026-04-01', end: '2026-06-30' }])).toEqual([]);
  expect(findGaps([{ start: '2026-01-01', end: '2026-05-31' }, { start: '2026-03-01', end: '2026-06-30' }])).toEqual([]);
  expect(findGaps([])).toEqual([]);
});
```

```ts
// test/core/checks/cashflowCheck.test.ts
import { expect, it } from 'vitest';
import { parseExport } from '../../../src/core/banksalad/parseExport';
import { checkCashflow } from '../../../src/core/checks/cashflowCheck';
import { readXlsx } from '../../../src/core/xlsx/readXlsx';
import { buildExportXlsx, tx, type FixtureOptions } from '../../support/fixture';

const check = (over: Partial<FixtureOptions> = {}) => {
  const p = parseExport(readXlsx(buildExportXlsx({
    window: { start: '2026-01-01', end: '2026-03-31' },
    transactions: [
      tx('2026-01-10', -10000, '택시', '카드 A', { major: '교통' }),
      tx('2026-01-11', 3000, '택시 취소', '카드 A', { type: '지출', major: '교통' }),
      tx('2026-02-01', 5000, '환불만 있는 달', '카드 A', { type: '지출', major: '패션/쇼핑' }),
      tx('2026-02-02', 100, '이자', '통장 A', { type: '수입', major: '미분류' }),
      tx('2026-02-03', -200, '모름', '카드 A', { major: '미분류' }),
      tx('2026-03-01', -999999, '이체는 세지 않음', '통장 A', { type: '이체', major: '교통' }),
    ],
    ...over,
  })));
  return checkCashflow(p.snapshot.cashflow, p.transactions);
};

it('matches the sheet, using the absolute value of the net amount', () => {
  expect(check()).toEqual({ checkedCells: 12, mismatches: [] });
});

it('reports the exact cell that differs', () => {
  expect(check({ cashflowAdjust: [{ section: 'expense', label: '교통', month: '2026-01', delta: 500 }] }).mismatches)
    .toEqual([{ section: 'expense', label: '교통', month: '2026-01', sheet: 7500, computed: 7000 }]);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/core/ledger/diff.test.ts test/core/checks`
Expected: FAIL. 모듈을 찾을 수 없다.

- [ ] **Step 3: `diffLedgers`, `findGaps`, `checkCashflow`를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run test/core && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/core/ledger/diff.ts src/core/checks test/core/ledger/diff.test.ts test/core/checks
git commit -m "feat: ledger diff, gaps and cashflow cross-check"
```

---

### Task 7: 저장과 가져오기 서비스

**Files:**
- Create: `src/server/paths.ts`, `src/server/db/open.ts`, `src/server/services/importService.ts`
- Test: `test/server/importService.test.ts`

**Interfaces:**
- Consumes: `readXlsx`, `XlsxError` (Task 1), `parseExport`, `ExportFormatError`, `Snapshot` (Task 3), `resolveWindow`, `ExportWindow` (Task 4), `buildLedger`, `ImportFile`, `LedgerEntry` (Task 5), `diffLedgers`, `checkCashflow`, `CashflowMismatch` (Task 6)
- Produces:

```ts
// src/server/paths.ts
export interface DataPaths { root: string; db: string; imports: string; backups: string }
/** root 기본값: process.env.SPENDPRINT_DATA_DIR ?? '<저장소>/data'. 폴더를 만든다. db는 '<root>/spendprint.db' */
export function resolveDataPaths(root?: string): DataPaths;

// src/server/db/open.ts
import type { DatabaseSync } from 'node:sqlite';
export function openDb(dbPath: string): DatabaseSync; // 스키마를 만들고 foreign_keys를 켠다

// src/server/services/importService.ts
export interface PreviewRow { date: string; time: string; type: string; major: string; minor: string; content: string; amount: number; method: string; memo: string }
export interface ImportSummary {
  added: number; changed: number; removed: number; unchanged: number;
  cashflowCheckedCells: number; cashflowMismatchCount: number;
  vanishedMethods: { method: string; keptCount: number }[];
  renamedMethods: { from: string; to: string; count: number }[];
  warnings: string[];
}
export interface ImportPreview extends ImportSummary {
  token: string; filename: string; window: ExportWindow; rowCount: number;
  alreadyImported: boolean;
  samples: { added: PreviewRow[]; removed: PreviewRow[]; changed: { before: PreviewRow; after: PreviewRow }[] }; // 각 최대 20
  cashflowMismatches: CashflowMismatch[];                       // 최대 20
  oldRemovedByMethod: { method: string; count: number }[];
  formatDriftSuspected: boolean;
}
export interface ImportRecord { id: number; filename: string; window: ExportWindow; importedAt: string; rowCount: number; summary: ImportSummary }
export type ImportErrorCode = 'NOT_XLSX' | 'ENCRYPTED' | 'CORRUPT' | 'FORMAT' | 'PREVIEW_EXPIRED' | 'ALREADY_IMPORTED' | 'NOT_FOUND';
export class ImportError extends Error { constructor(public code: ImportErrorCode, message: string, public problems: string[] = []) }
export interface ImportService {
  preview(filename: string, bytes: Uint8Array): ImportPreview;
  apply(token: string): { importId: number };
  undo(importId: number): void;
  list(): ImportRecord[]; // 최신 가져오기부터
}
export function createImportService(db: DatabaseSync, paths: DataPaths, now?: () => Date): ImportService;
```

스키마(`openDb`가 만든다):

```sql
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
```

서비스 규칙:
- `token`은 파일 바이트의 sha256(hex)이다. 미리본 파일은 메모리에 최대 5개 보관하고 오래된 것부터 버린다.
- `preview`는 DB에 쓰지 않는다. 읽기와 해석 오류는 `ImportError`로 바꾼다(`XlsxError`의 코드는 그대로, `ExportFormatError`는 `FORMAT`과 `problems`).
- 비교는 `buildLedger(기존 파일들)`과 `buildLedger(기존 파일들 + 후보)`의 `diffLedgers`다. 후보의 `id`와 `importedSeq`는 `기존 최대 id + 1`이다. sha256이 이미 있으면 `alreadyImported: true`이고 후보를 더하지 않는다.
- `warnings`는 파서 경고의 `message`들이다.
- `oldRemovedByMethod`: 사라진 항목 중 날짜가 (기존 원장의 가장 늦은 날짜 − 30일)보다 이르고, 결제수단이 후보 파일에 여전히 나오는 것을 결제수단별로 센다.
- `formatDriftSuspected`: 후보의 창 안에서 사라짐이 20건 이상이고, 기존 원장의 그 창 안 항목 수의 20% 이상이고, 추가도 20건 이상일 때 `true`.
- `apply`: 먼저 토큰과 같은 sha256이 `imports`에 있으면 `ALREADY_IMPORTED`("이미 가져온 파일이에요"), 그다음 토큰이 보관함에 없으면 `PREVIEW_EXPIRED`("미리보기가 만료됐어요. 파일을 다시 올려 주세요"). 가져온 파일이 하나라도 있으면 먼저 백업한다. 원본 바이트를 `imports/<sha256>.xlsx`에 쓴다. 한 트랜잭션 안에서 `imports`, `raw_transactions`, `snapshots`를 넣고 `ledger`를 전부 지운 뒤 `buildLedger` 결과로 다시 채운다. 실패하면 롤백하고 방금 쓴 원본 파일을 지운 뒤 오류를 다시 던진다.
- `undo`: 없는 id면 `NOT_FOUND`. 백업한 뒤 한 트랜잭션 안에서 가져오기를 지우고(연쇄 삭제) `ledger`를 다시 채운다. `imports/`의 원본 파일은 남긴다.
- 백업: `VACUUM INTO '<backups>/spendprint-YYYYMMDD-HHMMSS-mmm.db'`(시각은 `now()`). 최신 20개만 남긴다.
- `summary_json`에는 적용 시점의 `ImportSummary`를 넣는다. `snapshots.as_of`는 `window.end`다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// test/server/importService.test.ts
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { openDb } from '../../src/server/db/open';
import { resolveDataPaths, type DataPaths } from '../../src/server/paths';
import { createImportService, ImportError, type ImportService } from '../../src/server/services/importService';
import { buildExportXlsx, exportFilename, tx, type FixtureOptions, type FixtureTx } from '../support/fixture';

let paths: DataPaths; let db: ReturnType<typeof openDb>; let svc: ImportService; let clock: number;
beforeEach(() => {
  paths = resolveDataPaths(mkdtempSync(join(tmpdir(), 'spendprint-')));
  db = openDb(paths.db);
  clock = Date.UTC(2026, 10, 23, 1, 0, 0);
  svc = createImportService(db, paths, () => new Date((clock += 1000)));
});
const count = (table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
const ledger = () => db.prepare('SELECT date, time, type, major, content, amount, method, kept_from_vanished_method AS kept FROM ledger ORDER BY date DESC, time DESC, content').all();
const fileOf = (start: string, end: string, transactions: FixtureTx[], over: Partial<FixtureOptions> = {}) =>
  ({ name: exportFilename({ start, end }), bytes: buildExportXlsx({ window: { start, end }, transactions, ...over }) });
const errorCode = (fn: () => unknown) => { try { fn(); return 'none'; } catch (e) { return (e as ImportError).code; } };
const A = () => fileOf('2026-01-01', '2026-06-30', [
  tx('2026-05-10', -3000, '사라질 가게', 'X카드'), tx('2026-05-10', -5000, '가게', 'X카드', { time: '13:00:00' }), tx('2026-02-01', -1000, '옛 가게', 'X카드'),
]);
const B = () => fileOf('2026-04-01', '2026-09-30', [
  tx('2026-08-01', -7000, '새 가게', 'X카드'), tx('2026-05-10', -5000, '가게', 'X카드', { time: '13:00:00', major: '뷰티/미용' }),
]);
const importFile = (f: { name: string; bytes: Uint8Array }) => svc.apply(svc.preview(f.name, f.bytes).token).importId;

it('previews without writing anything', () => {
  const p = svc.preview(A().name, A().bytes);
  expect(p).toMatchObject({ filename: '2026-01-01~2026-06-30.xlsx', window: { start: '2026-01-01', end: '2026-06-30' }, rowCount: 3, alreadyImported: false, added: 3, changed: 0, removed: 0, unchanged: 0, cashflowMismatchCount: 0, formatDriftSuspected: false });
  expect(p.samples.added).toHaveLength(3);
  expect(count('imports') + count('raw_transactions') + count('ledger')).toBe(0);
  expect(readdirSync(paths.imports)).toEqual([]);
});

it('applies a file: rows, snapshot, original bytes and ledger', () => {
  const a = A(); const id = importFile(a);
  expect([count('imports'), count('raw_transactions'), count('snapshots'), count('ledger')]).toEqual([1, 3, 1, 3]);
  const stored = readdirSync(paths.imports);
  expect(stored).toHaveLength(1);
  expect(new Uint8Array(readFileSync(join(paths.imports, stored[0])))).toEqual(a.bytes);
  const snap = JSON.parse((db.prepare('SELECT data_json FROM snapshots WHERE import_id = ?').get(id) as { data_json: string }).data_json);
  expect(snap.profile.name).toBe('김테스트');
  expect(Object.keys(snap.rawCells).length).toBeGreaterThan(20);
  expect(svc.list()[0]).toMatchObject({ id, rowCount: 3, summary: { added: 3 } });
});

it('does nothing when the same file comes again', () => {
  importFile(A());
  const p = svc.preview(A().name, A().bytes);
  expect(p).toMatchObject({ alreadyImported: true, added: 0, changed: 0, removed: 0, unchanged: 3 });
  expect(errorCode(() => svc.apply(p.token))).toBe('ALREADY_IMPORTED');
  expect([count('imports'), count('ledger')]).toEqual([1, 3]);
});

it('merges an overlapping newer file and reports the difference', () => {
  importFile(A());
  const p = svc.preview(B().name, B().bytes);
  expect(p).toMatchObject({ added: 1, changed: 1, removed: 1, unchanged: 1 });
  expect(p.samples.removed[0].content).toBe('사라질 가게');
  svc.apply(p.token);
  expect(ledger().map((r: any) => `${r.date} ${r.content} ${r.major}`)).toEqual(['2026-08-01 새 가게 식비', '2026-05-10 가게 뷰티/미용', '2026-02-01 옛 가게 식비']);
});

it('gives the same ledger in either import order', () => {
  importFile(A()); importFile(B());
  const forward = ledger();
  db.exec('DELETE FROM imports; DELETE FROM ledger');
  importFile(B()); importFile(A());
  expect(ledger()).toEqual(forward);
});

it('undoes an import and restores the previous ledger', () => {
  importFile(A()); const before = ledger();
  const idB = importFile(B());
  svc.undo(idB);
  expect(ledger()).toEqual(before);
  expect(svc.list()).toHaveLength(1);
  expect(readdirSync(paths.imports)).toHaveLength(2);
  expect(errorCode(() => svc.undo(999))).toBe('NOT_FOUND');
});

it('backs up before changing existing data and keeps the newest 20', () => {
  importFile(A());
  expect(readdirSync(paths.backups)).toHaveLength(0);
  let idB = importFile(B());
  expect(readdirSync(paths.backups)).toHaveLength(1);
  for (let i = 0; i < 12; i++) { svc.undo(idB); idB = importFile(B()); }
  expect(readdirSync(paths.backups)).toHaveLength(20);
});

it('rejects unreadable or malformed files and leaves the data untouched', () => {
  importFile(A());
  expect(errorCode(() => svc.preview('a.xlsx', new TextEncoder().encode('hello')))).toBe('NOT_XLSX');
  expect(errorCode(() => svc.preview('a.xlsx', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])))).toBe('ENCRYPTED');
  const bad = fileOf('2026-04-01', '2026-09-30', [], { drop: { txColumn: '결제수단' } });
  let problems: string[] = [];
  try { svc.preview(bad.name, bad.bytes); } catch (e) { problems = (e as ImportError).problems; expect((e as ImportError).code).toBe('FORMAT'); }
  expect(problems).toEqual(["'가계부 내역'에 '결제수단' 열이 없어요"]);
  expect(errorCode(() => svc.apply('unknown-token'))).toBe('PREVIEW_EXPIRED');
  expect([count('imports'), count('ledger')]).toEqual([1, 3]);
});

it('rolls back completely when applying fails midway', () => {
  importFile(A());
  db.exec("CREATE TRIGGER boom BEFORE INSERT ON ledger BEGIN SELECT RAISE(ABORT, 'boom'); END");
  const p = svc.preview(B().name, B().bytes);
  expect(() => svc.apply(p.token)).toThrow();
  db.exec('DROP TRIGGER boom');
  expect([count('imports'), count('raw_transactions'), count('ledger')]).toEqual([1, 3, 3]);
  expect(readdirSync(paths.imports)).toHaveLength(1);
});

it('surfaces cashflow mismatches, vanished and renamed methods', () => {
  const mismatch = fileOf('2026-01-01', '2026-06-30', [tx('2026-05-10', -5000, '가게', 'X카드')], { cashflowAdjust: [{ section: 'expense', label: '식비', month: '2026-05', delta: 1 }] });
  expect(svc.preview(mismatch.name, mismatch.bytes)).toMatchObject({ cashflowMismatchCount: 1, cashflowMismatches: [{ label: '식비', month: '2026-05', sheet: 5001, computed: 5000 }] });
  importFile(fileOf('2026-01-01', '2026-06-30', [tx('2026-05-12', -900, '서점', 'Y카드'), tx('2026-05-10', -5000, '가게', 'W카드')]));
  const next = fileOf('2026-04-01', '2026-09-30', [tx('2026-05-10', -5000, '가게', 'Z카드')]);
  const p = svc.preview(next.name, next.bytes);
  expect(p.vanishedMethods).toEqual([{ method: 'Y카드', keptCount: 1 }]);
  expect(p.renamedMethods).toEqual([{ from: 'W카드', to: 'Z카드', count: 1 }]);
  svc.apply(p.token);
  expect(ledger().map((r: any) => `${r.content} ${r.method} ${r.kept}`)).toEqual(['서점 Y카드 1', '가게 Z카드 0']);
});

it('flags old removals and suspected format drift', () => {
  const many = (suffix: string) => Array.from({ length: 100 }, (_, i) => tx('2026-05-10', -(1000 + i), `가게${i < 25 ? suffix : ''} ${i}`, 'X카드', { time: `10:${String(i % 60).padStart(2, '0')}:00` }));
  importFile(fileOf('2026-01-01', '2026-06-30', [...many(''), tx('2026-06-29', -1, '최근', 'X카드')]));
  const next = fileOf('2026-04-01', '2026-09-30', [...many('*'), tx('2026-06-29', -1, '최근', 'X카드')]);
  const p = svc.preview(next.name, next.bytes);
  expect(p).toMatchObject({ added: 25, removed: 25, formatDriftSuspected: true });
  expect(p.oldRemovedByMethod).toEqual([{ method: 'X카드', count: 25 }]);
});

it('imports a file with no transactions', () => {
  const empty = fileOf('2027-01-01', '2027-01-31', []);
  expect(svc.preview(empty.name, empty.bytes)).toMatchObject({ rowCount: 0, added: 0 });
  importFile(empty);
  expect(count('imports')).toBe(1);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/server/importService.test.ts`
Expected: FAIL. 모듈을 찾을 수 없다.

- [ ] **Step 3: `paths.ts`, `db/open.ts`, `importService.ts`를 구현한다**

위 스키마와 "서비스 규칙"을 따른다. 트랜잭션은 `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK`으로 감싼다. Vitest가 `node:sqlite`를 못 찾으면 Vitest 문서의 내장 모듈 외부 처리 설정을 쓴다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run test/server/importService.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/server/paths.ts src/server/db src/server/services/importService.ts test/server/importService.test.ts
git commit -m "feat: import preview, apply and undo on sqlite"
```

---

### Task 8: 원장 조회

**Files:**
- Create: `src/server/services/ledgerQuery.ts`
- Test: `test/server/ledgerQuery.test.ts`

**Interfaces:**
- Consumes: `openDb`, `resolveDataPaths`, `createImportService` (Task 7), `findGaps` (Task 6), `ExportWindow`, `CellValue`
- Produces:

```ts
// src/server/services/ledgerQuery.ts
export interface LedgerFilter {
  from?: string; to?: string; q?: string;
  types?: string[]; majors?: string[]; minors?: string[]; methods?: string[];
  minAmount?: number; maxAmount?: number; // 절댓값 기준
  hasMemo?: boolean; includeZero?: boolean; // includeZero 기본 false
  limit?: number; offset?: number;          // limit 기본 100, 최대 500
}
export interface LedgerRow {
  fingerprint: string; importId: number; sourceFilename: string;
  date: string; time: string; type: string; major: string; minor: string; content: string;
  amount: number; currency: string; method: string; memo: string;
  extra: Record<string, CellValue>; keptFromVanishedMethod: boolean;
}
export interface LedgerPage { total: number; sumAmount: number; items: LedgerRow[] }
export interface LedgerFacets { types: string[]; majors: string[]; minors: string[]; methods: string[]; minDate: string | null; maxDate: string | null }
export interface Status { hasData: boolean; importCount: number; ledgerCount: number; latestAsOf: string | null; gaps: ExportWindow[] }
export interface LedgerQuery {
  page(filter: LedgerFilter): LedgerPage;
  get(fingerprint: string): LedgerRow | null;
  facets(): LedgerFacets;
  status(): Status;
}
export function createLedgerQuery(db: DatabaseSync): LedgerQuery;
```

규칙:
- 정렬은 날짜 내림차순, 시간 내림차순, 지문 오름차순.
- `q`는 내용이나 메모에 들어 있는 글자를 대소문자 구분 없이 찾는다. `%`, `_`, `\`는 글자 그대로 찾도록 이스케이프한다.
- `sumAmount`와 `total`은 페이지가 아니라 조건에 맞는 전체에 대한 값이다. `sumAmount`는 화폐가 `KRW`인 행만 더한다.
- 모든 값은 바인딩으로 넘긴다. SQL 문자열에 값을 이어 붙이지 않는다.
- `facets`의 목록은 오름차순이다. `status.gaps`는 가져온 파일들의 창에 대한 `findGaps`, `latestAsOf`는 가장 늦은 `window_end`다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// test/server/ledgerQuery.test.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it } from 'vitest';
import { openDb } from '../../src/server/db/open';
import { resolveDataPaths } from '../../src/server/paths';
import { createImportService } from '../../src/server/services/importService';
import { createLedgerQuery, type LedgerFilter, type LedgerQuery } from '../../src/server/services/ledgerQuery';
import { buildExportXlsx, tx } from '../support/fixture';

let q: LedgerQuery;
beforeEach(() => {
  const paths = resolveDataPaths(mkdtempSync(join(tmpdir(), 'spendprint-')));
  const db = openDb(paths.db);
  const svc = createImportService(db, paths);
  const add = (start: string, end: string, transactions: ReturnType<typeof tx>[]) =>
    svc.apply(svc.preview(`${start}~${end}.xlsx`, buildExportXlsx({ window: { start, end }, transactions })).token);
  add('2026-01-01', '2026-03-31', [
    tx('2026-03-10', -12000, '택시 100%', '카드 A', { major: '교통', minor: '택시', time: '23:10:00' }),
    tx('2026-03-10', -4500, "카페 O'Brien", '카드 B', { major: '카페/간식', minor: '커피/음료', time: '09:00:00', memo: '회의' }),
    tx('2026-02-01', 3000000, '회사급여', '통장 A', { type: '이체', major: '저축' }),
    tx('2026-01-15', 0, '이자', '통장 A', { type: '수입', major: '금융수입' }),
    tx('2026-01-10', -30, '해외 결제', '카드 A', { currency: 'USD', major: '온라인쇼핑' }),
  ]);
  add('2026-06-01', '2026-06-30', [tx('2026-06-05', -100, '편의점', '카드 A', { major: '생활' })]);
  q = createLedgerQuery(db);
});
const contents = (f: LedgerFilter) => q.page(f).items.map((r) => r.content);

it('lists newest first, hides zero amounts by default and sums KRW only', () => {
  const p = q.page({});
  expect(p.items.map((r) => r.content)).toEqual(['편의점', '택시 100%', "카페 O'Brien", '회사급여', '해외 결제']);
  expect(p.total).toBe(5);
  expect(p.sumAmount).toBe(-100 - 12000 - 4500 + 3000000);
  expect(q.page({ includeZero: true }).total).toBe(6);
  expect(p.items[0]).toMatchObject({ sourceFilename: '2026-06-01~2026-06-30.xlsx', keptFromVanishedMethod: false, extra: {} });
});

it('filters by each condition', () => {
  expect(contents({ from: '2026-02-01', to: '2026-03-10' })).toEqual(['택시 100%', "카페 O'Brien", '회사급여']);
  expect(contents({ types: ['이체'] })).toEqual(['회사급여']);
  expect(contents({ majors: ['교통', '생활'] })).toEqual(['편의점', '택시 100%']);
  expect(contents({ minors: ['택시'] })).toEqual(['택시 100%']);
  expect(contents({ methods: ['카드 B'] })).toEqual(["카페 O'Brien"]);
  expect(contents({ minAmount: 10000, maxAmount: 3000000 })).toEqual(['택시 100%', '회사급여']);
  expect(contents({ hasMemo: true })).toEqual(["카페 O'Brien"]);
  expect(contents({ q: '회의' })).toEqual(["카페 O'Brien"]);
  expect(contents({ q: "o'brien" })).toEqual(["카페 O'Brien"]);
  expect(contents({ q: '100%' })).toEqual(['택시 100%']);
  expect(contents({ q: '%' })).toEqual(['택시 100%']);
  expect(contents({ majors: ['교통'], methods: ['카드 B'] })).toEqual([]);
});

it('pages with a stable total', () => {
  const p = q.page({ limit: 2, offset: 2 });
  expect(p.items.map((r) => r.content)).toEqual(["카페 O'Brien", '회사급여']);
  expect(p.total).toBe(5);
  expect(q.page({ limit: 9999 }).items.length).toBeLessThanOrEqual(500);
});

it('gets one row, facets and status', () => {
  const first = q.page({}).items[0];
  expect(q.get(first.fingerprint)).toEqual(first);
  expect(q.get('nope')).toBeNull();
  expect(q.facets()).toMatchObject({ types: ['수입', '이체', '지출'], methods: ['카드 A', '카드 B', '통장 A'], minDate: '2026-01-10', maxDate: '2026-06-05' });
  expect(q.status()).toEqual({ hasData: true, importCount: 2, ledgerCount: 6, latestAsOf: '2026-06-30', gaps: [{ start: '2026-04-01', end: '2026-05-31' }] });
});
```

`facets().minDate`는 0원 거래를 포함한 원장 전체에서 구한다. 위 테스트의 `'2026-01-10'`은 0원 거래(1월 15일)보다 이른 날짜라 어느 쪽이든 같다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/server/ledgerQuery.test.ts`
Expected: FAIL. `createLedgerQuery`를 찾을 수 없다.

- [ ] **Step 3: `createLedgerQuery(db: DatabaseSync): LedgerQuery`를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run test/server && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/server/services/ledgerQuery.ts test/server/ledgerQuery.test.ts
git commit -m "feat: ledger query with filters, facets and status"
```

---

### Task 9: HTTP 서버와 실행

**Files:**
- Create: `src/server/http/guard.ts`, `src/server/http/app.ts`, `src/server/main.ts`, `Spendprint.cmd`
- Modify: `package.json` (scripts `dev:server`, `start`)
- Test: `test/server/http.test.ts`

**Interfaces:**
- Consumes: `ImportService`, `ImportError` (Task 7), `LedgerQuery`, `LedgerFilter` (Task 8), `openDb`, `resolveDataPaths`
- Produces:

```ts
// src/server/http/app.ts
export interface AppDeps { imports: ImportService; ledger: LedgerQuery; port: number; staticDir?: string }
export function createApp(deps: AppDeps): Hono;
// src/server/main.ts
export function startServer(opts?: { port?: number; dataDir?: string; open?: boolean; staticDir?: string }): Promise<{ url: string; port: number; address: string; close(): Promise<void> }>;
```

라우트:

| 메서드·경로 | 요청 | 응답 |
|---|---|---|
| `GET /api/health` | | `{ ok: true }` |
| `GET /api/status` | | `Status` |
| `POST /api/imports/preview?filename=<이름>` | 본문은 파일 바이트(`application/octet-stream`) | `ImportPreview` |
| `POST /api/imports/apply` | `{ token }` | `{ importId }` |
| `GET /api/imports` | | `ImportRecord[]` |
| `DELETE /api/imports/:id` | | 204 |
| `GET /api/ledger` | `LedgerFilter`를 쿼리로. 목록 값은 같은 이름을 반복(`majors=교통&majors=생활`) | `LedgerPage` |
| `GET /api/ledger/facets` | | `LedgerFacets` |
| `GET /api/ledger/:fingerprint` | | `LedgerRow` 또는 404 |

규칙:
- 오류 본문은 `{ error: { code, message, problems? } }`. 상태 코드: `NOT_XLSX`·`ENCRYPTED`·`CORRUPT`·`FORMAT` 422, `PREVIEW_EXPIRED`·`NOT_FOUND` 404, `ALREADY_IMPORTED` 409, 가드 거부 403(`FORBIDDEN`), 본문 20MB 초과 413(`TOO_LARGE`), 그 밖 500(`INTERNAL`, 메시지는 "문제가 생겼어요"만).
- 가드(`/api/*` 전체): `Host`가 `127.0.0.1:<port>` 또는 `localhost:<port>`여야 한다. GET이 아닌 요청은 `X-Spendprint: 1` 헤더가 있어야 하고, `Origin`이 있으면 `http://127.0.0.1:<port>` 또는 `http://localhost:<port>`여야 한다. CORS 허용 헤더는 어떤 응답에도 넣지 않는다.
- 가드는 `Host` 헤더로 판단한다. 테스트 환경이 `Host` 헤더를 직접 넣지 못하게 하면, 테스트는 전체 주소(`http://127.0.0.1:4780/api/...`)로 요청하고 가드는 요청 주소의 host를 쓰도록 양쪽을 함께 바꾼다. 검사하는 내용은 그대로 둔다.
- `staticDir`이 있고 그 폴더가 실제로 있으면 정적 파일을 주고, `/api`가 아닌 모르는 경로는 `index.html`을 준다. 폴더가 없으면 API만 준다.
- 로그는 `console.log`로 메서드, 경로(쿼리 제외), 상태 코드만 남긴다.
- `startServer`: 기본 포트 4780, 사용 중이면 4799까지 차례로 시도. 호스트는 `127.0.0.1` 고정. `open`이 `false`가 아니면 기본 브라우저를 연다. `staticDir` 기본값은 `dist/web`.
- `package.json` scripts: `"dev:server": "tsx watch src/server/main.ts --no-open"`, `"start": "tsx src/server/main.ts"`.
- `Spendprint.cmd`: 자기 폴더로 이동하고, `node_modules`가 없으면 `npm install`, `dist\web\index.html`이 없으면 `npm run build`, 그다음 `npm start`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// test/server/http.test.ts
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, expect, it, vi } from 'vitest';
import { openDb } from '../../src/server/db/open';
import { createApp } from '../../src/server/http/app';
import { startServer } from '../../src/server/main';
import { resolveDataPaths } from '../../src/server/paths';
import { createImportService } from '../../src/server/services/importService';
import { createLedgerQuery } from '../../src/server/services/ledgerQuery';
import { buildExportXlsx, tx } from '../support/fixture';

const PORT = 4780; const HOST = `127.0.0.1:${PORT}`;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  const paths = resolveDataPaths(mkdtempSync(join(tmpdir(), 'spendprint-')));
  const db = openDb(paths.db);
  app = createApp({ imports: createImportService(db, paths), ledger: createLedgerQuery(db), port: PORT });
});
const get = (path: string, headers: Record<string, string> = {}) => app.request(path, { headers: { host: HOST, ...headers } });
const send = (method: string, path: string, body?: BodyInit, headers: Record<string, string> = {}) =>
  app.request(path, { method, body, headers: { host: HOST, 'x-spendprint': '1', ...headers } });
const xlsx = () => buildExportXlsx({ window: { start: '2026-01-01', end: '2026-06-30' }, transactions: [tx('2026-05-10', -5000, '가게', 'X카드')] });
const name = encodeURIComponent('2026-01-01~2026-06-30.xlsx');

it('runs the whole import flow over HTTP', async () => {
  expect(await (await get('/api/health')).json()).toEqual({ ok: true });
  const preview = await (await send('POST', `/api/imports/preview?filename=${name}`, xlsx())).json();
  expect(preview).toMatchObject({ filename: '2026-01-01~2026-06-30.xlsx', added: 1 });
  const applied = await send('POST', '/api/imports/apply', JSON.stringify({ token: preview.token }), { 'content-type': 'application/json' });
  const { importId } = await applied.json();
  const page = await (await get(`/api/ledger?majors=${encodeURIComponent('식비')}&majors=${encodeURIComponent('교통')}`)).json();
  expect(page.items.map((r: any) => r.content)).toEqual(['가게']);
  expect((await get(`/api/ledger/${page.items[0].fingerprint}`)).status).toBe(200);
  expect((await get('/api/ledger/nope')).status).toBe(404);
  expect((await (await get('/api/status')).json()).ledgerCount).toBe(1);
  expect((await send('DELETE', `/api/imports/${importId}`)).status).toBe(204);
  expect((await (await get('/api/ledger')).json()).total).toBe(0);
});

it('maps errors to status codes with a readable body', async () => {
  const bad = await send('POST', `/api/imports/preview?filename=a.xlsx`, 'hello');
  expect(bad.status).toBe(422);
  expect((await bad.json()).error.code).toBe('NOT_XLSX');
  expect((await send('POST', '/api/imports/apply', JSON.stringify({ token: 'x' }), { 'content-type': 'application/json' })).status).toBe(404);
  expect((await send('DELETE', '/api/imports/999')).status).toBe(404);
  const preview = await (await send('POST', `/api/imports/preview?filename=${name}`, xlsx())).json();
  await send('POST', '/api/imports/apply', JSON.stringify({ token: preview.token }), { 'content-type': 'application/json' });
  expect((await send('POST', '/api/imports/apply', JSON.stringify({ token: preview.token }), { 'content-type': 'application/json' })).status).toBe(409);
});

it('refuses requests that do not come from its own page', async () => {
  expect((await get('/api/status', { host: 'evil.example' })).status).toBe(403);
  expect((await get('/api/status', { host: `127.0.0.1:${PORT + 1}` })).status).toBe(403);
  expect((await get('/api/status', { host: `localhost:${PORT}` })).status).toBe(200);
  expect((await send('DELETE', '/api/imports/1', undefined, { origin: 'https://evil.example' })).status).toBe(403);
  expect((await app.request('/api/imports/1', { method: 'DELETE', headers: { host: HOST } })).status).toBe(403);
  const ok = await get('/api/status', { origin: 'https://evil.example' });
  expect(ok.headers.get('access-control-allow-origin')).toBeNull();
});

it('logs method, path and status only', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await get(`/api/ledger?q=${encodeURIComponent('비밀가게')}`);
  expect(log.mock.calls.flat().join(' ')).toContain('/api/ledger');
  expect(log.mock.calls.flat().join(' ')).not.toContain('비밀가게');
  log.mockRestore();
});

it('listens on 127.0.0.1 only and moves to the next free port', async () => {
  const blocker = createServer().listen(4780, '127.0.0.1');
  await new Promise((r) => { blocker.once('listening', r); blocker.once('error', r); }); // 이미 쓰는 중이어도 계속한다
  const s = await startServer({ dataDir: mkdtempSync(join(tmpdir(), 'spendprint-')), open: false });
  expect(s.address).toBe('127.0.0.1');
  expect(s.port).toBeGreaterThan(4780);
  expect(s.url).toBe(`http://127.0.0.1:${s.port}`);
  expect((await fetch(`${s.url}/api/health`)).status).toBe(200);
  await s.close(); blocker.close();
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/server/http.test.ts`
Expected: FAIL. 모듈을 찾을 수 없다.

- [ ] **Step 3: `guard.ts`, `app.ts`, `main.ts`, `Spendprint.cmd`를 구현하고 scripts를 추가한다**

`main.ts`는 직접 실행됐을 때만 `startServer()`를 부른다(인자 `--no-open` 지원). 브라우저는 Windows에서 `cmd /c start "" <url>`로 연다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run test/server && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/server/http src/server/main.ts Spendprint.cmd package.json test/server/http.test.ts
git commit -m "feat: local HTTP API with same-origin guard"
```

---

### Task 10: 화면 기초

**Files:**
- Create: `index.html`, `vite.config.ts`, `src/web/main.tsx`, `src/web/App.tsx`
- Create: `src/web/styles/tokens.css`, `src/web/styles/global.css`
- Create: `src/web/lib/format.ts`, `src/web/lib/api.ts`, `src/web/lib/amountVisibility.tsx`
- Create: `src/web/components/Sidebar.tsx`, `Card.tsx`, `Button.tsx`, `Amount.tsx`, `Modal.tsx`, `Toast.tsx`, `EmptyState.tsx`
- Modify: `package.json` (scripts `dev`, `build`)
- Test: `test/web/format.test.ts`, `test/web/api.test.ts`, `test/web/Amount.test.tsx`

**Interfaces:**
- Consumes: HTTP 라우트(Task 9), 응답 타입은 `src/server/services/*`에서 `import type`으로 가져온다
- Produces:

```ts
// src/web/lib/format.ts
export function formatWon(amount: number, opts?: { signed?: boolean }): string;
export function formatDate(date: string): string;      // '2026-11-23' → '11월 23일 월요일'
export function formatDateShort(date: string): string; // '2026-11-23' → '11.23'
export function formatTime(time: string): string;      // '09:56:42' → '09:56', '00:00:00' → ''
export function formatPeriod(w: { start: string; end: string }): string; // '2025.11.23 ~ 2026.11.23'

// src/web/lib/api.ts
export class ApiError extends Error { constructor(public code: string, message: string, public problems: string[] = []) }
export const api: {
  status(): Promise<Status>;
  previewImport(file: File): Promise<ImportPreview>;
  applyImport(token: string): Promise<{ importId: number }>;
  listImports(): Promise<ImportRecord[]>;
  undoImport(id: number): Promise<void>;
  ledger(filter: LedgerFilter): Promise<LedgerPage>;
  ledgerFacets(): Promise<LedgerFacets>;
};

// src/web/lib/amountVisibility.tsx
export function AmountVisibilityProvider(props: { children: React.ReactNode }): JSX.Element;
export function useAmountVisibility(): { hidden: boolean; toggle(): void };

// src/web/components
export function Amount(props: { value: number; signed?: boolean; size?: 'md' | 'lg' | 'xl' }): JSX.Element;
export function Card(props: { title?: string; children: React.ReactNode; onClick?: () => void }): JSX.Element;
export function Button(props: { children: React.ReactNode; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; onClick?: () => void }): JSX.Element;
export function Modal(props: { title: string; open: boolean; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }): JSX.Element | null;
export function EmptyState(props: { title: string; description?: string; action?: React.ReactNode }): JSX.Element;
export function ToastProvider(props: { children: React.ReactNode }): JSX.Element; // 토스트를 화면에 그린다
export function useToast(): { show(message: string): void };                     // Provider 밖에서는 아무 일도 하지 않는다
```

정한 값:
- 색: `--bg: #F2F4F6`, `--surface: #FFFFFF`, `--text: #191F28`, `--text-sub: #4E5968`, `--text-hint: #8B95A1`, `--line: #E5E8EB`, `--primary: #3182F6`, `--primary-weak: #E8F3FF`, `--danger: #F04452`.
- 모양: 카드 반경 20px, 버튼·입력 반경 12px, 카드 안쪽 여백 24px, 카드 사이 16px. 메뉴 폭 240px, 내용 최대 폭 1120px, 바깥 여백 32px.
- 글자: `Pretendard Variable`. 본문 15px, 보조 13px, 숫자 강조 `xl` 36px·`lg` 24px·`md` 15px, 굵기 700, `font-variant-numeric: tabular-nums`.
- Pretendard는 `pretendard` 패키지의 가변 서체 CSS를 `global.css`에서 가져온다(Vite가 번들에 넣는다). CDN 주소를 쓰지 않는다.
- `formatWon`: `12000` → `12,000원`, `-12000` → `-12,000원`, `0` → `0원`. `signed`면 양수에 `+`. 소수는 반올림.
- `Amount`: 음수와 0은 기본 글자색, 양수는 `signed`일 때 `--primary`. 금액 숨기기가 켜져 있으면 `•••원`.
- `api`: 모든 요청에 `X-Spendprint: 1`. 응답이 실패면 본문의 `error`로 `ApiError`를 던진다. `previewImport`는 파일 바이트를 본문으로, 이름을 `filename` 쿼리로 보낸다. `ledger`는 목록 값을 같은 이름의 반복 쿼리로 보낸다.
- 메뉴 항목은 이 계획에서 `내역`(`/transactions`), `관리`(`/manage/imports`) 둘이다. 메뉴 아래에 금액 숨기기 전환을 둔다. `/`는 `api.status()`의 `hasData`가 거짓이면 온보딩, 참이면 `/transactions`로 보낸다. 온보딩과 두 페이지는 Task 11·12에서 만들고, 여기서는 자리만 둔다.
- `vite.config.ts`: `build.outDir`는 `dist/web`, 개발 서버는 `/api`를 `http://127.0.0.1:4780`으로 넘긴다. scripts: `"dev": "vite"`, `"build": "vite build"`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// test/web/format.test.ts
import { expect, it } from 'vitest';
import { formatDate, formatDateShort, formatPeriod, formatTime, formatWon } from '../../src/web/lib/format';

it('formats won amounts', () => {
  expect(formatWon(12000)).toBe('12,000원');
  expect(formatWon(-12000)).toBe('-12,000원');
  expect(formatWon(0)).toBe('0원');
  expect(formatWon(12000, { signed: true })).toBe('+12,000원');
  expect(formatWon(-12000, { signed: true })).toBe('-12,000원');
  expect(formatWon(428.967)).toBe('429원');
  expect(formatWon(1234567890)).toBe('1,234,567,890원');
});

it('formats dates and times', () => {
  expect(formatDate('2026-11-23')).toBe('11월 23일 월요일');
  expect(formatDateShort('2026-11-23')).toBe('11.23');
  expect(formatTime('09:56:42')).toBe('09:56');
  expect(formatTime('00:00:00')).toBe('');
  expect(formatPeriod({ start: '2025-11-23', end: '2026-11-23' })).toBe('2025.11.23 ~ 2026.11.23');
});
```

```ts
// test/web/api.test.ts
import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../src/web/lib/api';

afterEach(() => vi.unstubAllGlobals());
const stub = (status: number, body: unknown) => {
  const f = vi.fn(async () => new Response(status === 204 ? null : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', f); return f;
};

it('sends the guard header and repeats list filters', async () => {
  const f = stub(200, { total: 0, sumAmount: 0, items: [] });
  await api.ledger({ majors: ['교통', '생활'], q: '택시', includeZero: true });
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  expect(new Headers(init.headers).get('x-spendprint')).toBe('1');
  expect(new URL(url, 'http://x').searchParams.getAll('majors')).toEqual(['교통', '생활']);
  expect(new URL(url, 'http://x').searchParams.get('q')).toBe('택시');
});

it('uploads the file bytes with the name in the query', async () => {
  const f = stub(200, { token: 't' });
  await api.previewImport(new File([new Uint8Array([1, 2, 3])], '2026-01-01~2026-06-30.xlsx'));
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  expect(new URL(url, 'http://x').searchParams.get('filename')).toBe('2026-01-01~2026-06-30.xlsx');
  expect(init.method).toBe('POST');
});

it('turns error bodies into ApiError', async () => {
  stub(422, { error: { code: 'FORMAT', message: '형식이 달라요', problems: ["'가계부 내역'에 '결제수단' 열이 없어요"] } });
  await expect(api.status()).rejects.toMatchObject({ code: 'FORMAT', message: '형식이 달라요', problems: ["'가계부 내역'에 '결제수단' 열이 없어요"] });
  expect(new ApiError('X', 'm').problems).toEqual([]);
});
```

```tsx
// test/web/Amount.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Amount } from '../../src/web/components/Amount';
import { AmountVisibilityProvider, useAmountVisibility } from '../../src/web/lib/amountVisibility';

const Toggle = () => <button onClick={useAmountVisibility().toggle}>숨기기</button>;

it('shows the amount and hides it on demand', () => {
  render(<AmountVisibilityProvider><Amount value={-12000} /><Amount value={3000} signed /><Toggle /></AmountVisibilityProvider>);
  expect(screen.getByText('-12,000원')).toBeTruthy();
  expect(screen.getByText('+3,000원')).toBeTruthy();
  fireEvent.click(screen.getByText('숨기기'));
  expect(screen.queryByText('-12,000원')).toBeNull();
  expect(screen.getAllByText('•••원')).toHaveLength(2);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/web`
Expected: FAIL. 모듈을 찾을 수 없다.

- [ ] **Step 3: 화면 기초를 구현한다**

위 "정한 값"을 따른다. 스타일은 CSS 변수와 CSS Modules로 쓴다.

- [ ] **Step 4: 통과와 빌드를 확인한다**

Run: `npx vitest run test/web && npm run typecheck && npm run build`
Expected: PASS, `dist/web/index.html`이 생긴다.

- [ ] **Step 5: 커밋한다**

```bash
git add index.html vite.config.ts package.json src/web test/web
git commit -m "feat: web shell, design tokens and shared components"
```

---

### Task 11: 가져오기 화면

**Files:**
- Create: `src/web/features/import/useImport.ts`, `DropOverlay.tsx`, `ImportPreviewModal.tsx`
- Create: `src/web/pages/Onboarding.tsx`, `src/web/pages/ImportsPage.tsx`
- Modify: `src/web/App.tsx` (가져오기 흐름을 전역에 붙이고 두 페이지를 라우트에 연결)
- Test: `test/web/ImportPreviewModal.test.tsx`, `test/web/ImportsPage.test.tsx`, `test/web/DropOverlay.test.tsx`, `test/web/useImport.test.tsx`

**Interfaces:**
- Consumes: `api`, `ApiError`, `Modal`, `Button`, `Card`, `EmptyState`, `useToast`, `formatPeriod`, `formatDate`, `formatWon` (Task 10), `ImportPreview`, `ImportRecord`, `Status` 타입
- Produces:

```ts
// src/web/features/import/useImport.ts
export function useImport(onImported: () => void): {
  preview: ImportPreview | null; error: ApiError | null; busy: boolean;
  choose(files: File[]): Promise<void>; // 미리보기 요청
  apply(): Promise<void>; cancel(): void;
};
// src/web/features/import/ImportPreviewModal.tsx
export function ImportPreviewModal(props: { preview: ImportPreview; busy: boolean; onApply(): void; onCancel(): void }): JSX.Element;
// src/web/features/import/DropOverlay.tsx
export function DropOverlay(props: { onFiles(files: File[]): void }): JSX.Element | null;
```

정한 문구와 동작:
- 테스트가 글자를 통째로 찾으므로, 아래 문구와 `추가 5`·`거래 42건` 같은 "이름 + 숫자"는 한 요소 안에 한 글자열로 그린다.
- 창 어디로든 파일을 끌면 화면 전체에 "여기에 놓으면 가져올게요"가 뜬다. 파일이 둘 이상이면 가져오지 않고 "파일은 하나씩 올려 주세요", 확장자가 `.xlsx`가 아니면 "뱅크샐러드에서 받은 엑셀(.xlsx) 파일을 올려 주세요"를 토스트로 보여준다.
- 미리보기 모달의 제목은 "가져오기 전에 확인해 주세요". 기간(`formatPeriod`)과 "거래 N건", 그리고 세 숫자 `추가 N`, `변경 N`, `사라짐 N`을 보여준다.
- 대조: 불일치가 0이면 "뱅크샐러드 요약표와 모두 일치해요", 아니면 "요약표와 N칸이 달라요"와 칸 목록(분류, 월, 표의 값, 계산한 값).
- `vanishedMethods`가 있으면 "새 파일에 없는 결제수단이 있어요. 이전 기록은 그대로 둘게요"와 결제수단별 건수.
- `renamedMethods`가 있으면 "이름이 바뀐 것 같아요"와 `A → B`.
- `oldRemovedByMethod`가 있으면 "오래된 거래가 사라져요"와 결제수단별 건수.
- `formatDriftSuspected`면 "파일의 표기가 달라진 것 같아요. 적용하기 전에 사라지는 거래를 확인해 주세요".
- `warnings`는 목록으로 보여준다. 추가·변경·사라짐 표본은 접었다 펼 수 있다.
- `alreadyImported`면 "이미 가져온 파일이에요"를 보여주고 `적용하기`를 끈다.
- 버튼은 `취소`, `적용하기`. 적용이 끝나면 "가져왔어요" 토스트를 띄우고 화면의 데이터를 다시 읽는다.
- 오류는 메시지와 `problems` 목록을 모달로 보여준다. 제목은 "가져올 수 없어요".
- 온보딩 제목은 "뱅크샐러드 내역을 올려 주세요". 순서 세 줄: "뱅크샐러드 앱의 가계부 설정에서 '파일로 받기'를 눌러요", "메일로 온 엑셀 파일을 PC에 저장해요", "이 화면에 파일을 끌어다 놓아요". `파일 선택` 버튼도 둔다.
- 업데이트 기록(`/manage/imports`): 최신 가져오기부터 파일명, 기간, 가져온 날짜, 거래 수, 추가·변경·사라짐을 보여준다. `Status.gaps`가 있으면 위에 "기록이 없는 기간이 있어요"와 구간들을 보여준다. 행마다 `되돌리기`가 있고, 누르면 "이 가져오기를 되돌릴까요?" 확인을 거쳐 `api.undoImport`를 부르고 목록을 다시 읽는다. 기록이 없으면 "아직 가져온 파일이 없어요".

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```tsx
// test/web/ImportPreviewModal.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ImportPreviewModal } from '../../src/web/features/import/ImportPreviewModal';
import type { ImportPreview } from '../../src/server/services/importService';

const preview = (over: Partial<ImportPreview> = {}): ImportPreview => ({
  token: 't', filename: '2026-04-01~2026-09-30.xlsx', window: { start: '2026-04-01', end: '2026-09-30' }, rowCount: 42,
  alreadyImported: false, added: 5, changed: 2, removed: 1, unchanged: 34,
  cashflowCheckedCells: 12, cashflowMismatchCount: 0, cashflowMismatches: [],
  vanishedMethods: [], renamedMethods: [], oldRemovedByMethod: [], formatDriftSuspected: false, warnings: [],
  samples: { added: [], removed: [], changed: [] }, ...over,
});
const show = (p: ImportPreview, onApply = vi.fn()) => { render(<ImportPreviewModal preview={p} busy={false} onApply={onApply} onCancel={vi.fn()} />); return onApply; };

it('shows the period, counts and a clean check', () => {
  const onApply = show(preview());
  expect(screen.getByText('가져오기 전에 확인해 주세요')).toBeTruthy();
  expect(screen.getByText('2026.04.01 ~ 2026.09.30')).toBeTruthy();
  expect(screen.getByText('거래 42건')).toBeTruthy();
  for (const t of ['추가 5', '변경 2', '사라짐 1', '뱅크샐러드 요약표와 모두 일치해요']) expect(screen.getByText(t)).toBeTruthy();
  fireEvent.click(screen.getByText('적용하기'));
  expect(onApply).toHaveBeenCalledOnce();
});

it('explains every warning condition', () => {
  show(preview({
    cashflowMismatchCount: 1, cashflowMismatches: [{ section: 'expense', label: '식비', month: '2026-05', sheet: 5001, computed: 5000 }],
    vanishedMethods: [{ method: 'Y카드', keptCount: 3 }], renamedMethods: [{ from: 'W카드', to: 'Z카드', count: 2 }],
    oldRemovedByMethod: [{ method: 'X카드', count: 4 }], formatDriftSuspected: true, warnings: ['원화가 아닌 거래가 1건 있어요. 합계에서 빠져요'],
  }));
  for (const t of ['요약표와 1칸이 달라요', '새 파일에 없는 결제수단이 있어요. 이전 기록은 그대로 둘게요', '이름이 바뀐 것 같아요', 'W카드 → Z카드', '오래된 거래가 사라져요', '파일의 표기가 달라진 것 같아요. 적용하기 전에 사라지는 거래를 확인해 주세요', '원화가 아닌 거래가 1건 있어요. 합계에서 빠져요']) {
    expect(screen.getByText(t)).toBeTruthy();
  }
});

it('cannot apply a file that was already imported', () => {
  const onApply = show(preview({ alreadyImported: true, added: 0, changed: 0, removed: 0 }));
  expect(screen.getByText('이미 가져온 파일이에요')).toBeTruthy();
  fireEvent.click(screen.getByText('적용하기'));
  expect(onApply).not.toHaveBeenCalled();
});
```

```tsx
// test/web/DropOverlay.test.tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DropOverlay } from '../../src/web/features/import/DropOverlay';

it('appears while a file is dragged and hands over the dropped files', () => {
  const onFiles = vi.fn();
  render(<DropOverlay onFiles={onFiles} />);
  expect(screen.queryByText('여기에 놓으면 가져올게요')).toBeNull();
  fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } });
  expect(screen.getByText('여기에 놓으면 가져올게요')).toBeTruthy();
  const file = new File([new Uint8Array([1])], 'a.xlsx');
  fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [file] } });
  expect(onFiles).toHaveBeenCalledWith([file]);
  expect(screen.queryByText('여기에 놓으면 가져올게요')).toBeNull();
});
```

```tsx
// test/web/ImportsPage.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { api } from '../../src/web/lib/api';
import { ImportsPage } from '../../src/web/pages/ImportsPage';

const record = { id: 7, filename: '2026-04-01~2026-09-30.xlsx', window: { start: '2026-04-01', end: '2026-09-30' }, importedAt: '2026-11-23T01:00:00.000Z', rowCount: 42,
  summary: { added: 5, changed: 2, removed: 1, unchanged: 34, cashflowCheckedCells: 12, cashflowMismatchCount: 0, vanishedMethods: [], renamedMethods: [], warnings: [] } };

it('lists imports, shows gaps and undoes after confirmation', async () => {
  vi.spyOn(api, 'listImports').mockResolvedValue([record]);
  vi.spyOn(api, 'status').mockResolvedValue({ hasData: true, importCount: 1, ledgerCount: 42, latestAsOf: '2026-09-30', gaps: [{ start: '2026-02-01', end: '2026-03-31' }] });
  const undo = vi.spyOn(api, 'undoImport').mockResolvedValue();
  render(<ImportsPage />);
  expect(await screen.findByText('2026-04-01~2026-09-30.xlsx')).toBeTruthy();
  expect(screen.getByText('기록이 없는 기간이 있어요')).toBeTruthy();
  expect(screen.getByText('2026.02.01 ~ 2026.03.31')).toBeTruthy();
  fireEvent.click(screen.getByText('되돌리기'));
  expect(undo).not.toHaveBeenCalled();
  expect(screen.getByText('이 가져오기를 되돌릴까요?')).toBeTruthy();
  fireEvent.click(screen.getAllByText('되돌리기').at(-1)!);
  await waitFor(() => expect(undo).toHaveBeenCalledWith(7));
});

it('says so when nothing has been imported', async () => {
  vi.spyOn(api, 'listImports').mockResolvedValue([]);
  vi.spyOn(api, 'status').mockResolvedValue({ hasData: false, importCount: 0, ledgerCount: 0, latestAsOf: null, gaps: [] });
  render(<ImportsPage />);
  expect(await screen.findByText('아직 가져온 파일이 없어요')).toBeTruthy();
});
```

```tsx
// test/web/useImport.test.tsx
import { act, renderHook, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/web/components/Toast';
import { useImport } from '../../src/web/features/import/useImport';
import { api } from '../../src/web/lib/api';

it('refuses several files or a non-xlsx file without calling the server', async () => {
  const previewImport = vi.spyOn(api, 'previewImport');
  const { result } = renderHook(() => useImport(() => {}), { wrapper: ToastProvider });
  await act(() => result.current.choose([new File([], 'a.xlsx'), new File([], 'b.xlsx')]));
  expect(screen.getByText('파일은 하나씩 올려 주세요')).toBeTruthy();
  await act(() => result.current.choose([new File([], 'a.csv')]));
  expect(screen.getByText('뱅크샐러드에서 받은 엑셀(.xlsx) 파일을 올려 주세요')).toBeTruthy();
  expect(previewImport).not.toHaveBeenCalled();
});

it('previews one xlsx file, then applies it and reports back', async () => {
  vi.spyOn(api, 'previewImport').mockResolvedValue({ token: 't' } as never);
  const applyImport = vi.spyOn(api, 'applyImport').mockResolvedValue({ importId: 1 });
  const onImported = vi.fn();
  const { result } = renderHook(() => useImport(onImported), { wrapper: ToastProvider });
  await act(() => result.current.choose([new File([], 'a.xlsx')]));
  expect(result.current.preview).toEqual({ token: 't' });
  await act(() => result.current.apply());
  expect(applyImport).toHaveBeenCalledWith('t');
  expect(onImported).toHaveBeenCalledOnce();
  expect(result.current.preview).toBeNull();
  expect(screen.getByText('가져왔어요')).toBeTruthy();
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/web`
Expected: FAIL. 새 모듈을 찾을 수 없다.

- [ ] **Step 3: 가져오기 흐름과 두 페이지를 구현한다**

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run test/web && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/web test/web
git commit -m "feat: drag-and-drop import with preview, onboarding and import history"
```

---

### Task 12: 내역 화면

**Files:**
- Create: `src/web/features/transactions/filterUrl.ts`, `useLedger.ts`, `FilterBar.tsx`, `TransactionList.tsx`, `TransactionDetail.tsx`
- Create: `src/web/pages/TransactionsPage.tsx`
- Modify: `src/web/App.tsx` (`/transactions` 연결)
- Test: `test/web/filterUrl.test.ts`, `test/web/TransactionsPage.test.tsx`

**Interfaces:**
- Consumes: `api`, `Amount`, `Card`, `EmptyState`, `formatDate`, `formatTime`, `formatWon` (Task 10), `LedgerFilter`, `LedgerPage`, `LedgerRow`, `LedgerFacets` 타입
- Produces:

```ts
// src/web/features/transactions/filterUrl.ts
export function filterToSearch(filter: LedgerFilter): string;  // '?…' 또는 ''. limit·offset은 넣지 않는다
export function searchToFilter(search: string): LedgerFilter;
```

정한 동작:
- 필터 상태는 주소의 쿼리에 둔다. 이후 계획의 화면들이 이 주소로 바로 들어온다. 쿼리 이름은 `LedgerFilter`의 필드 이름과 같고 목록 값은 반복한다.
- 위쪽에 검색창(안내 글자 "가맹점이나 메모 검색")과 필터(기간, 타입, 대분류, 소분류, 결제수단, 금액 범위, 메모 있음, 0원 포함)를 둔다. 선택지는 `api.ledgerFacets()`에서 온다.
- 화면이 열릴 때 `api.ledger`는 한 번만 부른다.
- 필터 아래 한 줄 요약: "N건 · 합계 금액"(`formatWon(sumAmount, { signed: true })`). 한 글자열로 그린다. 금액 숨기기가 켜져 있으면 금액 자리에 `•••원`을 쓴다.
- 행의 보조 줄(`대분류 · 소분류 · 결제수단 · 시간`)도 한 글자열로 그린다.
- 목록은 날짜별로 묶고 묶음 제목은 `formatDate`다. 행의 왼쪽은 내용(굵게)과 그 아래 `대분류 · 소분류 · 결제수단 · 시간`(시간이 `''`이면 뺀다), 오른쪽은 `<Amount signed>`다. `keptFromVanishedMethod`면 "이전 파일 기록" 표시를 붙인다.
- 100건씩 읽고 더 있으면 `더 보기`를 보여준다.
- 행을 누르면 오른쪽에 상세가 열린다. 원본 열 10개(날짜, 시간, 타입, 대분류, 소분류, 내용, 금액, 화폐, 결제수단, 메모)와 `extra`의 열, 출처 파일명을 보여준다.
- 결과가 없으면 "조건에 맞는 거래가 없어요".
- 거래의 글자는 React의 기본 방식으로만 그린다. `dangerouslySetInnerHTML`을 쓰지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// test/web/filterUrl.test.ts
import { expect, it } from 'vitest';
import { filterToSearch, searchToFilter } from '../../src/web/features/transactions/filterUrl';

it('round-trips a filter through the URL', () => {
  const filter = { from: '2026-10-01', to: '2026-10-31', q: '택시 100%', types: ['지출'], majors: ['교통', '카페/간식'], methods: ['카드 A'], minAmount: 10000, hasMemo: true, includeZero: true };
  expect(searchToFilter(filterToSearch(filter))).toEqual(filter);
  expect(filterToSearch({})).toBe('');
  expect(filterToSearch({ limit: 100, offset: 200 })).toBe('');
  expect(searchToFilter('?majors=%EA%B5%90%ED%86%B5&unknown=1')).toEqual({ majors: ['교통'] });
});
```

```tsx
// test/web/TransactionsPage.test.tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { api } from '../../src/web/lib/api';
import { AmountVisibilityProvider } from '../../src/web/lib/amountVisibility';
import { TransactionsPage } from '../../src/web/pages/TransactionsPage';
import type { LedgerRow } from '../../src/server/services/ledgerQuery';

const row = (over: Partial<LedgerRow>): LedgerRow => ({ fingerprint: 'f0', importId: 1, sourceFilename: '2026-01-01~2026-06-30.xlsx', date: '2026-05-10', time: '09:56:42', type: '지출', major: '교통', minor: '택시', content: '택시', amount: -12000, currency: 'KRW', method: '카드 A', memo: '', extra: {}, keptFromVanishedMethod: false, ...over });
const facets = { types: ['지출'], majors: ['교통'], minors: ['택시'], methods: ['카드 A'], minDate: '2026-01-01', maxDate: '2026-06-30' };
const open = () => render(<AmountVisibilityProvider><TransactionsPage /></AmountVisibilityProvider>);

it('groups by date and shows every original field in the detail', async () => {
  vi.spyOn(api, 'ledgerFacets').mockResolvedValue(facets);
  vi.spyOn(api, 'ledger').mockResolvedValue({ total: 3, sumAmount: -9300, items: [
    row({ fingerprint: 'a', content: '<img src=x onerror=alert(1)>', memo: '=SUM(A1)', extra: { 태그: '여행' } }),
    row({ fingerprint: 'b', content: '환불', amount: 3000, time: '00:00:00', keptFromVanishedMethod: true }),
    row({ fingerprint: 'c', date: '2026-05-09', content: '편의점', amount: -300 }),
  ] });
  const { container } = open();
  expect(await screen.findByText('5월 10일 일요일')).toBeTruthy();
  expect(screen.getByText('5월 9일 토요일')).toBeTruthy();
  expect(screen.getByText('3건 · 합계 -9,300원')).toBeTruthy();
  expect(screen.getByText('+3,000원')).toBeTruthy();
  expect(screen.getByText('이전 파일 기록')).toBeTruthy();
  expect(screen.getByText('교통 · 택시 · 카드 A')).toBeTruthy();
  expect(container.querySelector('img')).toBeNull();
  fireEvent.click(screen.getByText('<img src=x onerror=alert(1)>'));
  const detail = within(await screen.findByRole('complementary'));
  for (const t of ['2026-05-10', '09:56:42', '지출', '교통', '택시', '-12,000원', 'KRW', '카드 A', '=SUM(A1)', '태그', '여행', '2026-01-01~2026-06-30.xlsx']) {
    expect(detail.getAllByText(t).length).toBeGreaterThan(0);
  }
});

it('loads more and shows an empty state', async () => {
  vi.spyOn(api, 'ledgerFacets').mockResolvedValue(facets);
  const ledger = vi.spyOn(api, 'ledger').mockResolvedValueOnce({ total: 150, sumAmount: -1, items: Array.from({ length: 100 }, (_, i) => row({ fingerprint: `p${i}`, content: `가게 ${i}` })) })
    .mockResolvedValueOnce({ total: 150, sumAmount: -1, items: [row({ fingerprint: 'last', content: '마지막 가게' })] });
  open();
  fireEvent.click(await screen.findByText('더 보기'));
  expect(await screen.findByText('마지막 가게')).toBeTruthy();
  expect(ledger.mock.calls[1][0]).toMatchObject({ limit: 100, offset: 100 });
  ledger.mockResolvedValue({ total: 0, sumAmount: 0, items: [] });
  fireEvent.change(screen.getByPlaceholderText('가맹점이나 메모 검색'), { target: { value: '없는 가게' } });
  await waitFor(() => expect(screen.getByText('조건에 맞는 거래가 없어요')).toBeTruthy());
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/web/filterUrl.test.ts test/web/TransactionsPage.test.tsx`
Expected: FAIL. 모듈을 찾을 수 없다.

- [ ] **Step 3: 내역 화면을 구현한다**

상세 패널은 `<aside>`(role `complementary`)로 만든다. 검색 입력은 300ms 뒤에 요청한다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run test/web && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add src/web test/web
git commit -m "feat: transaction list with filters and original-field detail"
```

---

### Task 13: 진단 명령, 오프라인 점검, 실제 파일 확인

**Files:**
- Create: `scripts/diagnose.ts`, `scripts/check-offline.ts`, `scripts/make-sample.ts`, `README.md`
- Modify: `package.json` (scripts `diagnose`, `check:offline`, `sample`)
- Test: `test/scripts/diagnose.test.ts`, `test/scripts/checkOffline.test.ts`, `test/real/realFile.test.ts`

**Interfaces:**
- Consumes: `readXlsx` (Task 1), `parseExport` (Task 3), `resolveWindow` (Task 4), `buildLedger` (Task 5), `checkCashflow` (Task 6), `buildExportXlsx`, `tx` (Task 2)
- Produces:

```ts
// scripts/diagnose.ts
export function diagnose(data: Uint8Array): string;                  // 구조만 담은 보고서
// scripts/check-offline.ts
export function findExternalReferences(dir: string): { file: string; match: string }[];
```

정한 동작:
- `diagnose`가 출력하는 것: 시트 이름과 행 수, `가계부 내역`의 열 제목과 열별 셀 종류 수(글자·숫자·빈칸), `뱅샐현황`에서 찾은 구역 제목과 행 번호, 구역별 열 제목과 데이터 행 수, 필수 항목 중 없는 것. 글자는 설계서 부록 A에 나온 제목(구역 제목, 열 제목, `총계`·`총자산`·`총부채`·`순자산`·`월수입 총계`·`월지출 총계`·`순수입 총계`)만 출력한다. 그 밖의 셀은 종류만 센다. 읽을 수 없는 파일이면 오류 코드를 출력한다.
- `npm run diagnose -- <파일>`로 실행한다.
- `findExternalReferences`는 폴더의 `.html`에서 `(src|href)=["']https?://`, `.css`와 `.js`에서 `url(https?://`, `@import "https?://`, `.html`에서 `<link … href="//`를 찾는다. `npm run check:offline`은 `dist/web`을 검사하고 하나라도 있으면 목록을 출력하고 1로 끝난다.
- `npm run sample`은 `data/sample/` 아래에 가짜 내보내기 파일 두 개(창이 겹치는 것)를 만든다. 화면을 실제 데이터 없이 눌러 보는 데 쓴다. 거래는 수백 건, 분류와 결제수단은 여러 종류로 만든다.
- `test/real/realFile.test.ts`는 환경변수 `SPENDPRINT_REAL_FILE`이 없으면 건너뛴다. 있으면 그 파일을 읽어 다음을 확인한다: 해석 오류가 없다, 거래 수가 `가계부 내역`의 행 수 − 1과 같다, `checkCashflow`의 불일치가 0이다, `buildLedger`의 항목 수가 거래 수와 같다, 지문이 모두 다르다. 실패 메시지와 출력에는 건수만 쓴다.
- `README.md`: 실행 방법(`Spendprint.cmd` 또는 `npm install`, `npm run build`, `npm start`), 뱅크샐러드에서 파일을 받아 올리는 방법, 데이터가 `data/`에 있고 git에 올라가지 않는다는 점, 백업 위치(`data/backups`), 진단 명령, 실제 파일 확인 명령.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```ts
// test/scripts/diagnose.test.ts
import { expect, it } from 'vitest';
import { diagnose } from '../../scripts/diagnose';
import { buildExportXlsx, tx } from '../support/fixture';

const file = (over = {}) => buildExportXlsx({
  window: { start: '2026-01-01', end: '2026-06-30' },
  transactions: [tx('2026-05-10', -987654321, 'SENTINEL-가게', 'SENTINEL-카드', { memo: 'SENTINEL-메모', major: '교통' })],
  profile: { name: 'SENTINEL-이름', creditScore: 777 },
  assets: [{ group: '자유입출금 자산', name: 'SENTINEL-통장', amount: 123456789 }],
  ...over,
});

it('describes the structure without printing any value', () => {
  const out = diagnose(file());
  for (const t of ['뱅샐현황', '가계부 내역', '1.고객정보', '3.재무현황', '결제수단', '신용점수']) expect(out).toContain(t);
  for (const secret of ['SENTINEL', '987654321', '123456789', '777', '교통', '자유입출금']) expect(out).not.toContain(secret);
});

it('names what is missing', () => {
  expect(diagnose(file({ drop: { txColumn: '결제수단' } }))).toContain("없음: '가계부 내역'의 '결제수단' 열");
  expect(diagnose(new TextEncoder().encode('hello'))).toContain('NOT_XLSX');
});
```

```ts
// test/scripts/checkOffline.test.ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { findExternalReferences } from '../../scripts/check-offline';

it('finds resources loaded from outside and ignores plain text URLs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'offline-'));
  writeFileSync(join(dir, 'index.html'), '<link rel="stylesheet" href="https://cdn.example/a.css"><script src="/assets/app.js"></script><a>http://www.w3.org/2000/svg</a>');
  writeFileSync(join(dir, 'a.css'), '@font-face{src:url(https://cdn.example/f.woff2)} .x{background:url(/local.png)}');
  writeFileSync(join(dir, 'app.js'), 'const ns="http://www.w3.org/2000/svg";');
  expect(findExternalReferences(dir).map((r) => r.file).sort()).toEqual(['a.css', 'index.html']);
});
```

```ts
// test/real/realFile.test.ts
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { expect, it } from 'vitest';
import { parseExport } from '../../src/core/banksalad/parseExport';
import { checkCashflow } from '../../src/core/checks/cashflowCheck';
import { buildLedger } from '../../src/core/ledger/buildLedger';
import { resolveWindow } from '../../src/core/ledger/window';
import { getSheet, readXlsx } from '../../src/core/xlsx/readXlsx';

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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run test/scripts`
Expected: FAIL. 모듈을 찾을 수 없다.

- [ ] **Step 3: 세 스크립트와 `README.md`를 쓰고 scripts를 추가한다**

- [ ] **Step 4: 전체를 확인한다**

Run: `npm test && npm run typecheck && npm run build && npm run check:offline`
Expected: 테스트 전부 PASS(`realFile`은 건너뜀), 타입 오류 없음, 빌드 성공, 외부 참조 0건.

- [ ] **Step 5: 실제로 띄워 본다**

Run: `npm run sample`, 그다음 `npm start`
Expected: 브라우저가 `http://127.0.0.1:4780`으로 열리고 온보딩이 보인다. `data/sample/`의 첫 파일을 끌어다 놓으면 미리보기가 뜨고, 적용하면 내역이 보인다. 두 번째 파일을 올리면 추가·변경·사라짐 숫자가 0이 아니다. 관리의 업데이트 기록에서 되돌리면 내역이 첫 파일 상태로 돌아간다.

- [ ] **Step 6: 실제 파일로 확인한다(사용자 PC에서만)**

Run (PowerShell): `$env:SPENDPRINT_REAL_FILE = '<사용자가 준 실제 파일 경로>'; npx vitest run test/real`
Expected: PASS. 출력에 건수 외의 값이 없다. 실패하면 `npm run diagnose -- <경로>`로 구조를 확인해 파서를 고치고, 가짜 파일 생성기도 같은 구조로 맞춘다.

- [ ] **Step 7: 커밋한다**

```bash
git add scripts README.md package.json test/scripts test/real
git commit -m "feat: structure diagnostics, offline check and sample data"
```
