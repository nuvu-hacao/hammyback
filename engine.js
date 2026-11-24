/* HammyBack – phần tính toán & kiểm tra dữ liệu (thuần, không gọi mạng).
   Dùng được cả trong trình duyệt (window.HBE) lẫn Node (module.exports) để test. */
(function (root) {
  'use strict';

  function pad(n) { return ('0' + n).slice(-2); }
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dateOf(iso) { var q = String(iso).split('-'); return new Date(+q[0], +q[1] - 1, +q[2]); }
  function daysBetween(a, b) { return Math.round((b - a) / 864e5); }
  function isIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(dateOf(s)); }

  /* Kỳ sao kê: tháng của ngày giao dịch, +1 tháng nếu ngày > ngày chốt sổ. */
  function periodOf(iso, closeDay) {
    var q = String(iso).split('-'); var y = +q[0], m = +q[1], d = +q[2];
    if (d > (closeDay || 31)) { m += 1; if (m > 12) { m = 1; y += 1; } }
    return y + '-' + pad(m);
  }

  /* Bậc: { cardId, group ('' = cap tổng của thẻ), from (tổng chi cả thẻ trong kỳ), rate, cap }.
     Đạt mốc thì CẢ KỲ tính theo bậc mới. */
  function tiersOf(M, cardId, group) {
    return (M.tiers || []).filter(function (t) { return t.cardId === cardId && (t.group || '') === (group || ''); }).sort(function (a, b) { return a.from - b.from; });
  }
  function groupsOf(M, cardId) { return M.groups.filter(function (g) { return g.cardId === cardId; }); }
  function groupFor(gs, cat) { for (var i = 0; i < gs.length; i++) if (gs[i].cats.indexOf(cat) >= 0) return gs[i]; return null; }
  function counts(t) { return t.status !== 'Đã xoá' && !(t.inst > 0); }

  /* Số liệu một thẻ trong một kỳ. extra = giao dịch giả định (để xem trước). */
  function cardStats(M, card, period, extra) {
    var txs = M.tx.filter(function (t) { return t.cardId === card.id && counts(t) && periodOf(t.date, card.closeDay) === period; });
    if (extra) txs = txs.concat([extra]);
    var spent = txs.reduce(function (s, t) { return s + t.amount; }, 0);
    var capT = card.cap > 0 ? card.cap : Infinity;
    tiersOf(M, card.id, '').forEach(function (t) { if (spent >= t.from) capT = t.cap > 0 ? t.cap : Infinity; });
    var qual = !(card.minSpend > 0 && spent < card.minSpend);
    var gs = groupsOf(M, card.id);
    var sumG = 0, otherSpend = 0;
    var det = gs.map(function (g) {
      var rate = g.rate, cap = g.cap;
      tiersOf(M, card.id, g.name).forEach(function (t) { if (spent >= t.from) { rate = t.rate; cap = t.cap; } });
      return { g: g, rate: rate, cap: cap, spent: 0, cb: 0 };
    });
    txs.forEach(function (t) {
      var g = qual ? groupFor(gs, t.cat) : null;
      if (g) det[gs.indexOf(g)].spent += t.amount; else otherSpend += t.amount;
    });
    det.forEach(function (x) {
      var raw = x.spent * x.rate / 100;
      x.cb = Math.max(0, x.cap > 0 ? Math.min(raw, x.cap) : raw);
      sumG += x.cb;
    });
    var other = Math.max(0, otherSpend * (card.other || 0) / 100);
    var gCapped = Math.min(sumG, capT);
    var capLeft = Math.max(0, capT - gCapped);
    det.forEach(function (x) {
      var own = x.cap > 0 ? Math.max(0, x.cap - x.cb) : Infinity;
      x.left = Math.min(own, capLeft);
      var base = x.cap > 0 ? x.cap : capT;
      x.full = x.left <= 0;
      x.near = !x.full && isFinite(base) && x.left < base * 0.2;
    });
    var next = null;
    (M.tiers || []).forEach(function (t) { if (t.cardId === card.id && t.from > spent && (!next || t.from < next.from)) next = t; });
    return { period: period, spent: spent, cap: capT, qual: qual, groups: det, other: other, groupCb: gCapped, capLeft: capLeft, est: gCapped + other, n: txs.length,
      next: next ? { need: next.from - spent, from: next.from, group: next.group || '', rate: next.rate, cap: next.cap } : null };
  }

  /* Tỷ lệ & cap còn lại của một thẻ cho một ngành, trong kỳ chứa ngày `iso`. */
  function lookup(M, card, cat, iso) {
    var st = cardStats(M, card, periodOf(iso, card.closeDay));
    var g = groupFor(groupsOf(M, card.id), cat);
    if (!g) return { rate: (card.other || 0) / 100, group: null, left: null, qual: st.qual, stats: st };
    var d = st.groups.filter(function (x) { return x.g === g; })[0];
    return { rate: d.rate / 100, group: g.name, cap: d.cap, left: d.left, qual: st.qual, stats: st };
  }

  /* Tiền hoàn tăng thêm nếu ghi giao dịch này (tính cả cap nhóm, cap tổng, chi tối thiểu). */
  function estimate(M, card, cat, amount, iso) {
    var per = periodOf(iso, card.closeDay);
    var a = cardStats(M, card, per), b = cardStats(M, card, per, { cardId: card.id, cat: cat, amount: amount, date: iso, status: '', inst: 0 });
    var l = lookup(M, card, cat, iso);
    return { cb: b.est - a.est, rate: l.rate, group: l.group, left: l.left, period: per, qualBefore: a.qual, qualAfter: b.qual, before: a, after: b };
  }

  function bestFor(M, cat, amount, iso) {
    var best = null;
    M.cards.forEach(function (c) {
      var e = estimate(M, c, cat, amount, iso);
      if (!best || e.cb > best.cb + 0.5) best = { card: c, cb: e.cb, rate: e.rate };
    });
    return best;
  }

  function nextDue(day, today) {
    var y = today.getFullYear(), m = today.getMonth();
    var d = Math.min(day, new Date(y, m + 1, 0).getDate());
    if (today.getDate() > d) { m += 1; d = Math.min(day, new Date(y, m + 1, 0).getDate()); }
    return new Date(y, m, d);
  }

  /* Ngày chốt sổ kế tiếp (chốt 31 = cuối tháng). */
  function nextClosing(day, today) { return nextDue(day || 31, today); }

  function addYears(iso, n) { var d = dateOf(iso); var r = new Date(d.getFullYear() + n, d.getMonth(), d.getDate()); if (r.getMonth() !== d.getMonth()) r = new Date(d.getFullYear() + n, d.getMonth() + 1, 0); return r; }

  /* Miễn phí thường niên: năm thẻ tính từ ngày kỷ niệm gần nhất. */
  function annual(M, card, today) {
    if (!(card.target > 0)) return null;
    if (!isIso(card.openDate)) return { card: card, needDate: true };
    var k = 0; while (addYears(card.openDate, k + 1) <= today) k++;
    var from = addYears(card.openDate, k), next = addYears(card.openDate, k + 1);
    var spent = M.tx.filter(function (t) { if (t.cardId !== card.id || !counts(t)) return false; var d = dateOf(t.date); return d >= from && d < next; })
      .reduce(function (s, t) { return s + t.amount; }, 0);
    var missing = Math.max(0, card.target - spent);
    var daysLeft = Math.max(0, daysBetween(today, next) - 1);
    var monthsLeft = Math.max(1, Math.ceil(daysLeft / 30.4));
    return { card: card, from: from, to: new Date(next - 864e5), spent: spent, target: card.target, missing: missing, perMonth: missing / monthsLeft, daysLeft: daysLeft, pct: Math.min(100, Math.round(spent / card.target * 100)) };
  }

  /* Danh sách kỳ có giao dịch (mới nhất trước), luôn gồm kỳ hiện tại theo lịch. */
  function periods(M, today) {
    var set = {}; set[isoOf(today).slice(0, 7)] = 1;
    var byId = {}; M.cards.forEach(function (c) { byId[c.id] = c; });
    M.tx.forEach(function (t) { var c = byId[t.cardId]; if (c && t.status !== 'Đã xoá' && isIso(t.date)) set[periodOf(t.date, c.closeDay)] = 1; });
    return Object.keys(set).sort().reverse();
  }

  /* ---------- bảo vệ dữ liệu nhạy cảm ---------- */
  function luhn(d) {
    var sum = 0, alt = false;
    for (var i = d.length - 1; i >= 0; i--) { var n = +d[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
    return sum % 10 === 0;
  }
  /* Trả về 'card' | 'cvv' | null */
  function sensitive(text) {
    var s = String(text || '');
    var joined = s.replace(/(\d)[\s\-.]+(?=\d)/g, '$1');
    var runs = joined.match(/\d{12,19}/g) || [];
    for (var i = 0; i < runs.length; i++) if (luhn(runs[i])) return 'card';
    if (/(cvv|cvc|csc|cav|cid|m[ãa] b[ảa]o m[ậa]t)\s*\d?\D{0,6}\d{3,4}(?!\d)/i.test(s)) return 'cvv';
    if (/(exp|h[ếe]t h[ạa]n|hsd|valid thru|hi[ệe]u l[ựu]c)\D{0,8}\d{1,2}\s*[\/\-]\s*\d{2,4}/i.test(s)) return 'cvv';
    return null;
  }
  var SENSITIVE_MSG = {
    card: 'Có vẻ bạn vừa nhập số thẻ. HammyBack không lưu số thẻ, xoá giúp mình nhé.',
    cvv: 'Có vẻ bạn vừa nhập mã CVV hoặc ngày hết hạn. HammyBack không lưu thông tin này, xoá giúp mình nhé.'
  };

  /* Chống công thức khi ghi vào Sheet (đã dùng RAW, thêm lớp nữa phòng khi xuất CSV). */
  function toCell(v) { return (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? "'" + v : v; }
  function fromCell(v) { return (typeof v === 'string' && /^'[=+\-@\t\r]/.test(v)) ? v.slice(1) : v; }

  var api = { pad: pad, isoOf: isoOf, dateOf: dateOf, isIso: isIso, daysBetween: daysBetween, periodOf: periodOf, tiersOf: tiersOf, cardStats: cardStats, lookup: lookup, estimate: estimate, bestFor: bestFor,
    nextDue: nextDue, nextClosing: nextClosing, annual: annual, periods: periods, groupFor: groupFor, groupsOf: groupsOf, luhn: luhn, sensitive: sensitive, SENSITIVE_MSG: SENSITIVE_MSG, toCell: toCell, fromCell: fromCell };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.HBE = api;
})(this);
