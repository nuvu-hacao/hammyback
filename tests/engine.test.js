// Chạy: node tests/engine.test.js
const E = require('../engine.js');
const assert = require('assert');
let n = 0; function ok(name, fn) { fn(); n++; console.log('✓ ' + name); }
const today = new Date(2026, 10, 20);
const cards = {
  shinhan: { id: 'sh', name: 'Shinhan Supreme', closeDay: 31, cap: 300000, minSpend: 3000000, other: 0.3, target: 80000000, openDate: '2025-03-10' },
  stepup: { id: 'su', name: 'VPBank StepUp', closeDay: 31, cap: 0, other: 0 },
  woori: { id: 'wo', name: 'Woori Hype Point', closeDay: 31, cap: 1200000, other: 0 },
  hc: { id: 'hc', name: 'Home Credit', closeDay: 15, cap: 300000, other: 0 }
};
const groups = [
  { cardId: 'sh', name: 'Mua sắm', rate: 12, cap: 0, cats: ['TMĐT', 'Điện máy'] },
  { cardId: 'sh', name: 'Đăng ký số', rate: 50, cap: 50000, cats: ['Sub Netflix'] },
  { cardId: 'wo', name: 'Ăn uống', rate: 10, cap: 300000, cats: ['Ăn uống', 'Ăn uống cuối tuần'] },
  { cardId: 'wo', name: 'TMĐT', rate: 8, cap: 300000, cats: ['TMĐT'] },
  { cardId: 'hc', name: 'Giao đồ ăn', rate: 10, cap: 100000, cats: ['Giao đồ ăn'] },
  { cardId: 'hc', name: 'Đặt xe', rate: 10, cap: 100000, cats: ['Đặt xe'] },
  { cardId: 'su', name: 'Online', rate: 6, cap: 300000, cats: ['TMĐT', 'Online khác'] }
];
const tiers = [
  { cardId: 'sh', group: '', from: 15000000, cap: 1000000 },
  { cardId: 'su', group: 'Online', from: 10000000, rate: 15, cap: 700000 },
  { cardId: 'su', group: 'Online', from: 100000000, rate: 15, cap: 1500000 }
];
let id = 0; const tx = (cardId, date, cat, amount, extra) => Object.assign({ id: 't' + (++id), cardId, date, cat, amount, inst: 0, status: '' }, extra || {});
const M = (txs) => ({ cards: Object.values(cards), groups, tiers, tx: txs });

ok('kỳ sao kê', () => {
  assert.equal(E.periodOf('2026-11-20', 15), '2026-12');
  assert.equal(E.periodOf('2026-11-15', 15), '2026-11');
  assert.equal(E.periodOf('2026-11-30', 31), '2026-11');
  assert.equal(E.periodOf('2026-12-20', 15), '2027-01');
});
ok('Home Credit: Giao đồ ăn còn 9.882 cap', () => {
  const m = M([tx('hc', '2026-11-16', 'Giao đồ ăn', 901180)]);
  const l = E.lookup(m, cards.hc, 'Giao đồ ăn', '2026-11-20');
  assert.equal(Math.round(l.left), 9882);
  const e = E.estimate(m, cards.hc, 'Giao đồ ăn', 200000, '2026-11-20');
  assert.equal(Math.round(e.cb), 9882);
});
ok('Shinhan vượt cap tổng 300k (chi < 15 m)', () => {
  const s = E.cardStats(M([tx('sh', '2026-11-02', 'TMĐT', 5000000)]), cards.shinhan, '2026-11');
  assert.equal(s.est, 300000); assert.equal(s.capLeft, 0);
  assert.equal(E.estimate(M([tx('sh', '2026-11-02', 'TMĐT', 5000000)]), cards.shinhan, 'Sub Netflix', 100000, '2026-11-20').cb, 0, 'gợi ý phải xét cap tổng');
});
ok('Shinhan lên cap cao 1 m khi chi ≥ 15 m', () => {
  const s = E.cardStats(M([tx('sh', '2026-11-02', 'Điện máy', 16000000)]), cards.shinhan, '2026-11');
  assert.equal(s.cap, 1000000); assert.equal(s.est, 1000000); assert.equal(s.next, null);
  const s2 = E.cardStats(M([tx('sh', '2026-11-02', 'TMĐT', 5000000)]), cards.shinhan, '2026-11');
  assert.equal(s2.next.need, 10000000); assert.equal(s2.next.cap, 1000000);
});
ok('StepUp: 3 bậc theo tổng chi cả thẻ, áp dụng cả kỳ', () => {
  let s = E.cardStats(M([tx('su', '2026-11-02', 'TMĐT', 9000000)]), cards.stepup, '2026-11');
  assert.equal(s.est, 300000); assert.equal(s.next.need, 1000000);
  s = E.cardStats(M([tx('su', '2026-11-02', 'TMĐT', 4000000), tx('su', '2026-11-03', 'Siêu thị', 7000000)]), cards.stepup, '2026-11');
  assert.equal(s.est, 600000, '15% × 4 m (tổng thẻ 11 m đã lên bậc 2)');
  s = E.cardStats(M([tx('su', '2026-11-02', 'TMĐT', 12000000)]), cards.stepup, '2026-11');
  assert.equal(s.est, 700000);
  s = E.cardStats(M([tx('su', '2026-11-02', 'TMĐT', 120000000)]), cards.stepup, '2026-11');
  assert.equal(s.est, 1500000);
  const e = E.estimate(M([tx('su', '2026-11-02', 'TMĐT', 9500000)]), cards.stepup, 'TMĐT', 1000000, '2026-11-20');
  assert.equal(e.cb, 700000 - 300000, 'vượt mốc 10 m → cả kỳ lên 15%, cap 700k');
  assert.equal(E.lookup(M([tx('su', '2026-11-02', 'TMĐT', 12000000)]), cards.stepup, 'TMĐT', '2026-11-20').rate, 0.15);
});
ok('Shinhan chưa đủ chi tối thiểu → chỉ 0.3%', () => {
  const s = E.cardStats(M([tx('sh', '2026-11-02', 'TMĐT', 2000000)]), cards.shinhan, '2026-11');
  assert.equal(s.qual, false); assert.equal(s.est, 6000);
});
ok('Giao dịch đẩy qua mốc chi tối thiểu', () => {
  const e = E.estimate(M([tx('sh', '2026-11-02', 'TMĐT', 2500000)]), cards.shinhan, 'TMĐT', 1000000, '2026-11-20');
  assert.equal(e.qualBefore, false); assert.equal(e.qualAfter, true); assert.equal(e.cb, 300000 - 7500);
});
ok('Woori: nhóm Ăn uống đầy → hoàn 0, chip hết cap', () => {
  const m = M([tx('wo', '2026-11-05', 'Ăn uống', 2000000), tx('wo', '2026-11-08', 'Ăn uống cuối tuần', 1500000)]);
  const l = E.lookup(m, cards.woori, 'Ăn uống', '2026-11-20');
  assert.equal(l.left, 0);
  assert.equal(E.estimate(m, cards.woori, 'Ăn uống', 500000, '2026-11-20').cb, 0);
  const best = E.bestFor(m, 'Ăn uống', 500000, '2026-11-20');
  assert.notEqual(best.card.id, 'wo');
});
ok('Trả góp & đã xoá không tính; trả cap lại cho nhóm', () => {
  const m = M([tx('wo', '2026-11-05', 'Ăn uống', 3000000, { inst: 6 }), tx('wo', '2026-11-06', 'Ăn uống', 1000000, { status: 'Đã xoá' }), tx('wo', '2026-11-07', 'Ăn uống', 500000)]);
  const s = E.cardStats(m, cards.woori, '2026-11');
  assert.equal(s.spent, 500000); assert.equal(s.est, 50000);
  assert.equal(E.lookup(m, cards.woori, 'Ăn uống', '2026-11-20').left, 250000);
});
ok('Hoàn đơn (âm) trừ vào chi tiêu', () => {
  const s = E.cardStats(M([tx('wo', '2026-11-05', 'TMĐT', 1000000), tx('wo', '2026-11-06', 'TMĐT', -400000)]), cards.woori, '2026-11');
  assert.equal(s.spent, 600000); assert.equal(s.est, 48000);
});
ok('Miễn phí thường niên', () => {
  const a = E.annual(M([tx('sh', '2026-03-10', 'TMĐT', 10000000), tx('sh', '2026-03-09', 'TMĐT', 99000000), tx('sh', '2026-06-01', 'TMĐT', 5000000, { inst: 3 })]), cards.shinhan, today);
  assert.equal(a.spent, 10000000); assert.equal(a.missing, 70000000);
  assert.equal(E.isoOf(a.to), '2027-03-09');
});
ok('Hạn thanh toán kế tiếp', () => {
  assert.equal(E.isoOf(E.nextDue(25, today)), '2026-11-25');
  assert.equal(E.isoOf(E.nextDue(5, today)), '2026-12-05');
  assert.equal(E.isoOf(E.nextDue(31, new Date(2027, 1, 3))), '2027-02-28');
});
ok('Chặn số thẻ / CVV', () => {
  assert.equal(E.sensitive('4111 1111 1111 1111'), 'card');
  assert.equal(E.sensitive('the 5555-5555-5555-4444 nhe'), 'card');
  assert.equal(E.sensitive('Shopee đơn 2611200001'), null);
  assert.equal(E.sensitive('1234 5678 9012 3456'), null); // không qua Luhn
  assert.equal(E.sensitive('CVV 123'), 'cvv');
  assert.equal(E.sensitive('hết hạn 12/28'), 'cvv');
  assert.equal(E.sensitive('Shinhan Supreme'), null);
});
ok('Chống công thức', () => {
  assert.equal(E.toCell('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
  assert.equal(E.fromCell(E.toCell('=HYPERLINK("x")')), '=HYPERLINK("x")');
  assert.equal(E.toCell('Grab'), 'Grab'); assert.equal(E.toCell(-5000), -5000);
});
console.log('\n' + n + ' nhóm test đều qua.');
