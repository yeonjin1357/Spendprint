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
  expect(diagnose(file({ drop: { section: '재무현황' } }))).toContain("없음: '뱅샐현황'의 '재무현황' 구역");
  expect(diagnose(new TextEncoder().encode('hello'))).toContain('NOT_XLSX');
});
