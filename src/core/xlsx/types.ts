export type CellValue = string | number;

export interface Cell {
  ref: string;
  col: string;
  row: number;
  value: CellValue;
  isFormula: boolean;
}

export interface Sheet {
  name: string;
  cells: Map<string, Cell>;
  merges: string[];
  maxRow: number;
}

export interface Workbook {
  sheets: Sheet[];
}

export type XlsxErrorCode = 'NOT_XLSX' | 'ENCRYPTED' | 'CORRUPT';

export class XlsxError extends Error {
  code: XlsxErrorCode;

  constructor(code: XlsxErrorCode, message: string) {
    super(message);
    this.name = 'XlsxError';
    this.code = code;
  }
}
