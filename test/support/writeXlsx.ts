import { strToU8, zipSync } from 'fflate';

export interface WCell {
  ref: string;
  value: string | number;
  formula?: string;
}

export interface WSheet {
  name: string;
  cells: WCell[];
  merges?: string[];
}

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
/** Fixed so the same input always produces the same bytes (and the same sha256). */
const FIXED_TIME = new Date(2020, 0, 1, 0, 0, 0);

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function split(ref: string): { col: string; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`bad cell ref: ${ref}`);
  return { col: m[1], row: Number(m[2]) };
}

function colIndex(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Minimal xlsx writer for tests. Mirrors what the real export uses: shared strings, numbers, cached formulas, merges. */
export function writeXlsx(sheets: WSheet[], opts: { inlineStrings?: boolean } = {}): Uint8Array {
  const shared: string[] = [];
  const sharedIndex = new Map<string, number>();
  const intern = (text: string) => {
    let i = sharedIndex.get(text);
    if (i === undefined) {
      i = shared.length;
      shared.push(text);
      sharedIndex.set(text, i);
    }
    return i;
  };

  const sheetXml = (sheet: WSheet) => {
    const byRow = new Map<number, WCell[]>();
    for (const cell of sheet.cells) {
      const { row } = split(cell.ref);
      if (!byRow.has(row)) byRow.set(row, []);
      byRow.get(row)!.push(cell);
    }
    const rows = [...byRow.keys()].sort((a, b) => a - b).map((row) => {
      const cells = byRow.get(row)!.sort((a, b) => colIndex(split(a.ref).col) - colIndex(split(b.ref).col)).map((cell) => {
        const f = cell.formula !== undefined ? `<f>${esc(cell.formula)}</f>` : '';
        if (typeof cell.value === 'number') return `<c r="${cell.ref}">${f}<v>${cell.value}</v></c>`;
        if (opts.inlineStrings) return `<c r="${cell.ref}" t="inlineStr"><is><t xml:space="preserve">${esc(cell.value)}</t></is></c>`;
        return `<c r="${cell.ref}" t="s">${f}<v>${intern(cell.value)}</v></c>`;
      });
      return `<row r="${row}">${cells.join('')}</row>`;
    });
    const merges = sheet.merges?.length
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : '';
    return `${HEAD}<worksheet xmlns="${MAIN_NS}"><sheetData>${rows.join('')}</sheetData>${merges}</worksheet>`;
  };

  const files: Record<string, Uint8Array> = {};
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet));
  });

  files['xl/sharedStrings.xml'] = strToU8(
    `${HEAD}<sst xmlns="${MAIN_NS}" count="${shared.length}" uniqueCount="${shared.length}">` +
      shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') + '</sst>',
  );
  files['xl/workbook.xml'] = strToU8(
    `${HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>` +
      sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>',
  );
  files['xl/_rels/workbook.xml.rels'] = strToU8(
    `${HEAD}<Relationships xmlns="${PKG_REL_NS}">` +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  );
  files['_rels/.rels'] = strToU8(
    `${HEAD}<Relationships xmlns="${PKG_REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  files['[Content_Types].xml'] = strToU8(
    `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>',
  );

  return zipSync(files, { mtime: FIXED_TIME });
}
