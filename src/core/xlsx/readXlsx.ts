import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { XlsxError, type Cell, type CellValue, type Sheet, type Workbook } from './types';

type Node = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: false,
  isArray: (name) => ['row', 'c', 'si', 'r', 'sheet', 'Relationship', 'mergeCell'].includes(name),
});

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Decodes XML entities in one pass, so `&amp;lt;` stays `&lt;`. */
function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (whole, body: string) => {
    if (body[0] !== '#') return ENTITIES[body] ?? whole;
    const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  });
}

/** Text of an element that may have attributes (`{ '#text': … }`) or not (plain string). */
function textOf(node: unknown): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string') return decodeEntities(node);
  if (typeof node === 'object') {
    const text = (node as Node)['#text'];
    return typeof text === 'string' ? decodeEntities(text) : '';
  }
  return String(node);
}

/** Text of a string item: either a direct `<t>` or rich-text runs `<r><t>`. */
function stringItemText(item: unknown): string {
  if (item === undefined || item === null || typeof item !== 'object') return textOf(item);
  const node = item as Node;
  if (node.t !== undefined) return textOf(node.t);
  const runs = (node.r as Node[] | undefined) ?? [];
  return runs.map((run) => textOf(run.t)).join('');
}

function parseXml(files: Record<string, Uint8Array>, path: string): Node {
  const bytes = files[path];
  if (!bytes) throw new XlsxError('CORRUPT', `파일이 손상됐어요 (${path} 없음)`);
  try {
    return parser.parse(new TextDecoder('utf-8').decode(bytes)) as Node;
  } catch {
    throw new XlsxError('CORRUPT', `파일이 손상됐어요 (${path}을 읽을 수 없음)`);
  }
}

function columnIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function readCell(c: Node, shared: string[]): Cell | undefined {
  const ref = String(c['@_r'] ?? '');
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return undefined;
  const type = c['@_t'] as string | undefined;
  const isFormula = c.f !== undefined;
  let value: CellValue | undefined;

  if (type === 'inlineStr') {
    value = stringItemText(c.is);
  } else {
    const raw = textOf(c.v);
    if (c.v === undefined || raw === '') return undefined;
    if (type === 's') value = shared[Number(raw)] ?? '';
    else if (type === 'str' || type === 'e' || type === 'd') value = raw;
    else {
      const n = Number(raw);
      value = Number.isNaN(n) ? raw : n;
    }
  }
  if (value === undefined || value === '') return undefined;
  return { ref, col: match[1], row: Number(match[2]), value, isFormula };
}

function readSheet(name: string, root: Node, shared: string[]): Sheet {
  const worksheet = (root.worksheet ?? {}) as Node;
  const cells = new Map<string, Cell>();
  let maxRow = 0;
  const rows = (((worksheet.sheetData ?? {}) as Node).row as Node[] | undefined) ?? [];
  for (const row of rows) {
    for (const c of (row.c as Node[] | undefined) ?? []) {
      const cell = readCell(c, shared);
      if (!cell) continue;
      cells.set(cell.ref, cell);
      if (cell.row > maxRow) maxRow = cell.row;
    }
  }
  const mergeNodes = (((worksheet.mergeCells ?? {}) as Node).mergeCell as Node[] | undefined) ?? [];
  const merges = mergeNodes.map((m) => String(m['@_ref'] ?? '')).filter(Boolean);
  return { name, cells, merges, maxRow };
}

export function readXlsx(data: Uint8Array): Workbook {
  if (data[0] !== 0x50 || data[1] !== 0x4b) {
    if (data[0] === 0xd0 && data[1] === 0xcf && data[2] === 0x11 && data[3] === 0xe0) {
      throw new XlsxError('ENCRYPTED', '암호가 걸려 있거나 xlsx가 아닌 파일이에요');
    }
    throw new XlsxError('NOT_XLSX', 'xlsx 파일이 아니에요');
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data);
  } catch {
    throw new XlsxError('CORRUPT', '파일이 손상됐어요');
  }
  if (!files['xl/workbook.xml']) throw new XlsxError('NOT_XLSX', 'xlsx 파일이 아니에요');

  const workbook = (parseXml(files, 'xl/workbook.xml').workbook ?? {}) as Node;
  const relsRoot = (parseXml(files, 'xl/_rels/workbook.xml.rels').Relationships ?? {}) as Node;
  const targets = new Map<string, string>();
  for (const rel of (relsRoot.Relationship as Node[] | undefined) ?? []) {
    targets.set(String(rel['@_Id']), String(rel['@_Target']));
  }

  const shared: string[] = [];
  if (files['xl/sharedStrings.xml']) {
    const sst = (parseXml(files, 'xl/sharedStrings.xml').sst ?? {}) as Node;
    for (const item of (sst.si as unknown[] | undefined) ?? []) shared.push(stringItemText(item));
  }

  const sheets: Sheet[] = [];
  for (const sheet of (((workbook.sheets ?? {}) as Node).sheet as Node[] | undefined) ?? []) {
    const target = targets.get(String(sheet['@_r:id']));
    if (!target) throw new XlsxError('CORRUPT', '파일이 손상됐어요 (시트 연결 없음)');
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    sheets.push(readSheet(decodeEntities(String(sheet['@_name'] ?? '')), parseXml(files, path), shared));
  }
  return { sheets };
}

export function getSheet(wb: Workbook, name: string): Sheet | undefined {
  return wb.sheets.find((s) => s.name === name);
}

export function cellAt(sheet: Sheet, col: string, row: number): Cell | undefined {
  return sheet.cells.get(`${col}${row}`);
}

export function rowCells(sheet: Sheet, row: number): Cell[] {
  const out: Cell[] = [];
  for (const cell of sheet.cells.values()) if (cell.row === row) out.push(cell);
  return out.sort((a, b) => columnIndex(a.col) - columnIndex(b.col));
}
