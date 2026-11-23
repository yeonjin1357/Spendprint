/**
 * Writes two fake, overlapping exports to data/sample/ so the app can be tried without real data.
 *   npm run sample
 * Everything here is made up. The second file re-categorises one shop, drops two cancelled
 * transactions and adds newer ones, so the import preview has something to show.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveDataPaths } from '../src/server/paths';
import { buildExportXlsx, exportFilename, tx, type FixtureTx } from '../test/support/fixture';

let seed = 20261123;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = <T,>(list: T[]): T => list[Math.floor(random() * list.length)];
const pad = (n: number) => String(n).padStart(2, '0');
const time = () => `${pad(7 + Math.floor(random() * 16))}:${pad(Math.floor(random() * 60))}:${pad(Math.floor(random() * 60))}`;

const SHOPS: { name: string; major: string; minor: string; min: number; max: number; methods: string[] }[] = [
  { name: '모두택시', major: '교통', minor: '택시', min: 4800, max: 23000, methods: ['간편결제 A'] },
  { name: '한강편의점 역삼점', major: '생활', minor: '편의점', min: 1200, max: 9800, methods: ['파랑카드', '초록체크'] },
  { name: '아침식당', major: '식비', minor: '한식', min: 8000, max: 15000, methods: ['파랑카드'] },
  { name: '배달한끼', major: '식비', minor: '배달', min: 14000, max: 32000, methods: ['간편결제 B'] },
  { name: '구름커피', major: '카페/간식', minor: '커피/음료', min: 3500, max: 7200, methods: ['파랑카드', '간편결제 A'] },
  { name: '모모 살롱', major: '카페/간식', minor: '베이커리', min: 28000, max: 85000, methods: ['간편결제 B'] },
  { name: '온마켓', major: '온라인쇼핑', minor: '인터넷쇼핑', min: 9900, max: 128000, methods: ['노랑카드'] },
  { name: '책방 여름', major: '문화/여가', minor: '도서', min: 12000, max: 36000, methods: ['노랑카드'] },
  { name: '튼튼치과', major: '의료/건강', minor: '치과', min: 30000, max: 180000, methods: ['파랑카드'] },
];

function buildAll(start: string, end: string): FixtureTx[] {
  const out: FixtureTx[] = [];
  const day = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (day <= last) {
    const date = day.toISOString().slice(0, 10);
    const dom = day.getUTCDate();
    const count = Math.floor(random() * 4);
    for (let i = 0; i < count; i += 1) {
      const shop = pick(SHOPS);
      const amount = -Math.round((shop.min + random() * (shop.max - shop.min)) / 100) * 100;
      out.push(tx(date, amount, shop.name, pick(shop.methods), { major: shop.major, minor: shop.minor, time: time() }));
    }
    if (dom === 5) out.push(tx(date, -14900, '영상구독 플러스', '노랑카드', { major: '온라인쇼핑', minor: '서비스구독', time: '03:10:00' }));
    if (dom === 11) out.push(tx(date, -55000, '통신요금', '파랑카드', { major: '주거/통신', minor: '휴대폰', time: '09:00:00' }));
    if (dom === 25) {
      // Like the real export: salary shows up as a transfer filed under '저축', not as income.
      out.push(tx(date, 3200000, '가나다급여', '주거래 통장', { type: '이체', major: '저축', time: '00:30:00' }));
      out.push(tx(date, -600000, '월세 김집주', '주거래 통장', { type: '이체', major: '이체', time: '10:00:00' }));
      out.push(tx(date, -500000, '내 적금', '주거래 통장', { type: '이체', major: '내계좌이체', time: '10:05:00' }));
      out.push(tx(date, 500000, '내 적금', '자유적금', { type: '이체', major: '내계좌이체', time: '10:05:00' }));
    }
    if (dom === 14) out.push(tx(date, -412000, '파랑카드결제', '주거래 통장', { type: '이체', major: '카드대금', time: '06:00:00' }));
    if (dom === 20 && random() < 0.5) {
      out.push(tx(date, -30000, '간편결제 B 충전', '주거래 통장', { major: '온라인쇼핑', minor: '결제/충전', time: '12:00:00' }));
    }
    if (dom === 1) out.push(tx(date, Math.floor(random() * 900), '입출금통장 이자', '주거래 통장', { type: '수입', major: '금융수입', time: '02:00:00' }));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
}

const within = (list: FixtureTx[], w: { start: string; end: string }) => list.filter((t) => w.start <= t.date && t.date <= w.end);

const first = { start: '2025-09-01', end: '2026-08-31' };
const second = { start: '2025-11-24', end: '2026-11-23' };
const all = buildAll(first.start, second.end);

const base = {
  assets: [
    { group: '자유입출금 자산', name: '주거래 통장', amount: 2840000 },
    { group: '저축성 자산', name: '자유적금', amount: 6000000 },
    { group: '투자성 자산', name: '가나다 인덱스', amount: 1850000 },
  ],
  investments: [{ kind: '펀드', company: '가나다증권', name: '가나다 인덱스', principal: 1700000, valuation: 1850000, returnPct: 8.82, startDate: '2025-03-02' }],
};

// The second export: one shop re-categorised in Banksalad, two cancelled transactions gone.
const overlapStart = second.start;
let dropped = 0;
const later = within(all, second)
  .filter((t) => {
    if (dropped < 2 && t.date > overlapStart && t.date <= first.end && t.content === '모두택시' && random() < 0.05) { dropped += 1; return false; }
    return true;
  })
  .map((t) => (t.content === '모모 살롱' ? { ...t, major: '뷰티/미용', minor: '헤어샵' } : t));

const dir = join(resolveDataPaths().root, 'sample');
mkdirSync(dir, { recursive: true });
const files = [
  { window: first, transactions: within(all, first), profile: { creditScore: 880 } },
  { window: second, transactions: later, profile: { creditScore: 902 } },
];
for (const file of files) {
  const path = join(dir, exportFilename(file.window));
  writeFileSync(path, buildExportXlsx({ ...base, ...file }));
  console.log(`${path}  (거래 ${file.transactions.length}건)`);
}
console.log('먼저 위쪽 파일을, 그다음 아래쪽 파일을 올려 보세요.');
