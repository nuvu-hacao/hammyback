/* ======================================================================
   HammyBack – bản bạn bè.
   Dữ liệu nằm trong một Google Sheet ở Drive của chính người dùng.
   Không server, không analytics. Access token chỉ giữ trong RAM.
   ====================================================================== */
(function () {
  'use strict';
  var E = window.HBE;
  var CFG = window.HAMMY_CONFIG || {};
  var MOCK = /[?&]mock=1(&|$)/.test(location.search);
  var DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  var SCOPES = 'openid email ' + DRIVE_SCOPE;
  var SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
  var DRIVE = 'https://www.googleapis.com/drive/v3/files';
  var FILE_TITLE = 'HammyBack – Sổ thẻ hoàn tiền';
  var SH = { cards: 'Thẻ', groups: 'Nhóm hoàn tiền', tiers: 'Bậc hoàn tiền', tx: 'Giao dịch', readme: 'Đọc tôi' };
  var HEAD = {
    cards: ['Mã thẻ', 'Ngân hàng', 'Loại thẻ', 'Tên thẻ', 'Ngày kích hoạt', 'Ngày sao kê (1–31)', 'Hạn thanh toán (ngày)', 'Hạn mức', 'Cap tổng/kỳ (trống = không giới hạn)', 'Chi tối thiểu/kỳ', 'Tỷ lệ giao dịch khác (%)', 'Mốc chi miễn phí năm sau', 'Màu', 'Ghi chú'],
    groups: ['Mã thẻ', 'Nhóm hoàn tiền', 'Tỷ lệ (%)', 'Cap nhóm/kỳ (trống = dùng chung cap tổng)', 'Ngành hàng (cách nhau dấu phẩy)'],
    tiers: ['Mã thẻ', 'Nhóm hoàn tiền (trống = cap tổng của thẻ)', 'Chi từ (tổng chi cả thẻ trong kỳ)', 'Tỷ lệ (%)', 'Cap/kỳ'],
    tx: ['Mã giao dịch', 'Ngày', 'Mã thẻ', 'Thẻ', 'Ngành hàng', 'Merchant', 'Số tiền', 'Trả góp (số kỳ)', 'Trạng thái', 'Tạo lúc']
  };
  var README = [
    ['HammyBack – sổ thẻ hoàn tiền của bạn'], [''],
    ['File này do app HammyBack tạo trong Google Drive của bạn. Mặc định chỉ bạn xem được. App không bao giờ đổi quyền chia sẻ.'],
    ['Chủ app HammyBack KHÔNG xem được file này. App không có server, không gửi dữ liệu đi đâu khác.'],
    ['KHÔNG nhập số thẻ, ngày hết hạn, CVV, mật khẩu hay OTP vào file này.'], [''],
    ['Sheet "Thẻ", "Nhóm hoàn tiền", "Bậc hoàn tiền": luật hoàn tiền của từng thẻ. Nên sửa trong app (tab Thẻ → Sửa thẻ).'],
    ['Bậc hoàn tiền: khi tổng chi cả thẻ trong kỳ đạt mốc "Chi từ", cả kỳ được tính theo tỷ lệ/cap của bậc đó.'],
    ['Sheet "Giao dịch": mỗi dòng một giao dịch. Ngày dạng yyyy-mm-dd. Số tiền âm = hoàn đơn. Trạng thái "Đã xoá" = đã xoá trong app (muốn khôi phục thì xoá chữ đó đi).'],
    ['Không đổi tên sheet, không chèn/xoá cột. App đọc theo vị trí cột cố định.']
  ];
  var CATS = ['Giao đồ ăn', 'Ăn uống', 'Ăn uống cuối tuần', 'TMĐT', 'Online khác', 'Đặt xe', 'Siêu thị', 'CHTL', 'Du lịch', 'Bệnh viện', 'Nhà thuốc', 'Bảo hiểm', 'Giáo dục', 'Nhà sách', 'Điện máy', 'Sub Netflix', 'Sub ChatGPT', 'Sub Spotify', 'Sub Claude', 'Gym', 'Vé xem phim', 'Điện nước', 'Khác'];
  var DISPLAY = { 'TMĐT': 'Thương mại điện tử' };
  var MCC = {
    'TMĐT': ['5311, 5399, 5262', 'Shopee, Lazada, Tiki, TikTok Shop'], 'Ăn uống': ['5812, 5813, 5814', 'Nhà hàng, quán cà phê'], 'Ăn uống cuối tuần': ['5812, 5813, 5814', 'Như Ăn uống, giao dịch thứ 7 – CN'],
    'Giao đồ ăn': ['5812, 5814', 'GrabFood, ShopeeFood, beFood'], 'Đặt xe': ['4121', 'Grab, be, Xanh SM'], 'Siêu thị': ['5411', ''], 'CHTL': ['5499, 5411', 'Circle K, GS25…'],
    'Du lịch': ['4511, 7011, 4722', 'Hãng bay, khách sạn, đại lý du lịch'], 'Bệnh viện': ['8062, 8011', ''], 'Nhà thuốc': ['5912', ''], 'Bảo hiểm': ['6300', ''], 'Nhà sách': ['5942', ''],
    'Giáo dục': ['8220, 8299', ''], 'Điện máy': ['5732', ''], 'Sub Netflix': ['4899', 'Netflix'], 'Sub ChatGPT': ['5734, 5817', 'ChatGPT'], 'Sub Spotify': ['5815', 'Spotify'],
    'Sub Claude': ['5817, 5818', 'Claude'], 'Gym': ['7997', ''], 'Vé xem phim': ['7832', '']
  };
  var COLORS = ['#24408E', '#0B6477', '#1F6F43', '#B3192F', '#2E4A86', '#6B3FA0', '#B8641A', '#3F4652'];
  var PRESET_NOTE = 'Hammy đã điền sẵn luật theo thể lệ đã biết. Ngân hàng có thể đổi thể lệ, bạn kiểm tra lại giúp.';
  /* Luật có sẵn, tự điền khi Ngân hàng + Loại thẻ khớp. groups: [tên, tỷ lệ %, cap nhóm, 'ngành, ngành', [[chi từ, tỷ lệ, cap], …]] */
  var PRESETS = [
    { bank: 'Shinhan', type: 'Supreme', color: '#24408E', cap: 300000, minSpend: 3000000, other: 0.3, target: 80000000, tiers: [[15000000, 1000000]],
      note: 'Hoàn bằng điểm. Chi dưới 3 triệu/kỳ chỉ được 0.3%. Lazada, TikTok Shop chỉ được 0.3%.',
      groups: [['TMĐT', 12, 0, 'TMĐT'], ['Điện máy', 12, 0, 'Điện máy'], ['Giáo dục', 12, 0, 'Giáo dục'], ['Nhà sách', 12, 0, 'Nhà sách'], ['Bảo hiểm', 6, 0, 'Bảo hiểm'], ['Bệnh viện', 6, 0, 'Bệnh viện'], ['Sub Netflix, ChatGPT, Spotify', 50, 50000, 'Sub Netflix, Sub ChatGPT, Sub Spotify']] },
    { bank: 'Woori', type: 'Hype Point', color: '#0B6477', cap: 1200000, other: 0, target: 50000000,
      note: 'Ăn uống, siêu thị, CHTL không tính khi thanh toán online. TMĐT chỉ gồm Shopee, Lazada, Tiki, TikTok Shop.',
      groups: [['TMĐT', 8, 300000, 'TMĐT'], ['Ăn uống', 10, 300000, 'Ăn uống, Ăn uống cuối tuần'], ['Siêu thị & CHTL', 5, 300000, 'Siêu thị, CHTL'], ['Du lịch', 5, 300000, 'Du lịch']] },
    { bank: 'VPBank', type: 'Z', color: '#1F6F43', cap: 1000000, other: 0, target: 80000000, note: '',
      groups: [['Ăn uống', 15, 500000, 'Ăn uống, Ăn uống cuối tuần'], ['Giải trí & Fitness', 15, 500000, 'Sub Claude, Gym, Vé xem phim'], ['Gọi xe & Đồ ăn', 15, 500000, 'Giao đồ ăn, Đặt xe']] },
    { bank: 'VPBank', type: 'StepUp', color: '#B8641A', cap: 0, other: 0, target: 0,
      note: 'Theo thông tin bạn bè chia sẻ: tổng chi dưới 10 triệu hoàn online 6% (tối đa 300k), 10–100 triệu 15% (tối đa 700k), từ 100 triệu 15% (tối đa 1.5 triệu). Kiểm tra lại ngành nào ngân hàng tính là online.',
      groups: [['Chi tiêu online', 6, 300000, 'TMĐT, Online khác', [[10000000, 15, 700000], [100000000, 15, 1500000]]]] },
    { bank: 'Home Credit', type: 'Sống số', color: '#B3192F', cap: 300000, other: 0, target: 0, note: 'Gói Sống số. Thẻ thu phí quản lý theo tháng, không có mốc chi miễn phí năm.',
      groups: [['TMĐT', 10, 100000, 'TMĐT'], ['Đặt xe', 10, 100000, 'Đặt xe'], ['Giao đồ ăn', 10, 100000, 'Giao đồ ăn']] }
  ];
  var BANKS = ['ACB', 'Agribank', 'BIDV', 'Cake', 'HDBank', 'Home Credit', 'HSBC', 'MB', 'MSB', 'OCB', 'Sacombank', 'SeABank', 'SHB', 'Shinhan', 'Standard Chartered', 'Techcombank', 'Timo', 'TPBank', 'UOB', 'VIB', 'Vietcombank', 'VietinBank', 'VPBank', 'Woori'];
  var LIMITS = { bank: 25, type: 25, merchant: 60, note: 200, group: 40, cat: 30 };

  /* ---------------- tiện ích ---------------- */
  var pad = E.pad, isoOf = E.isoOf, daysBetween = E.daysBetween;
  var TODAY = (function () { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); })();
  function todayIso() { return isoOf(TODAY); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pctTxt(r) { return (Math.round(r * 1000) / 10) + '%'; }
  var MASK = '•••';
  function fmtM(n) {
    if (!isFinite(n)) return 'không giới hạn';
    if (S.hide) return MASK;
    var a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toFixed(1) + ' m';
    if (a >= 1000) { var k = n / 1000; return (a < 10000 ? Math.round(k * 10) / 10 : Math.round(k)) + 'k'; }
    return Math.round(n) + ' ₫';
  }
  function fullVnd(n) { return S.hide ? MASK + ' ₫' : Math.round(n).toLocaleString('vi-VN') + ' ₫'; }
  function disp(cat) { return DISPLAY[cat] || cat; }
  /* Tên ngắn cho chip: tên ngân hàng (nếu chỉ có 1 thẻ của ngân hàng đó), không thì loại thẻ. */
  function short(n) {
    var c = S.M && S.M.cards.filter(function (x) { return x.name === n; })[0], v = String(n || '');
    if (c && c.bank) v = S.M.cards.filter(function (x) { return fold(x.bank) === fold(c.bank); }).length > 1 ? (c.type || c.bank) : c.bank;
    return v.length > 14 ? v.split(' ')[0] : v;
  }
  function dd(d) { return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
  function ddIso(iso) { var q = String(iso || '').split('-'); return q.length === 3 ? q[2] + '/' + q[1] : ''; }
  function kyLabel(v) { var q = String(v || '').split('-'); return q.length === 2 ? 'Kỳ ' + q[1] + '/' + q[0] : 'Kỳ ' + v; }
  function rnd(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function uid(p) { return p + Date.now().toString(36) + rnd(2); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }
  function maskEmail(e) { var m = /^(.{1,2})[^@]*(@.*)$/.exec(e || ''); return m ? m[1] + '•••' + m[2] : ''; }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var s = String(v == null ? '' : v).trim(); if (!s) return 0;
    var neg = /^[-−]/.test(s);
    s = s.replace(/[^\d.,]/g, '');
    if (/,\d{1,2}$/.test(s) && s.indexOf('.') < 0) s = s.replace(',', '.'); else if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, ''); else s = s.replace(/,/g, '');
    var n = parseFloat(s); return isNaN(n) ? 0 : (neg ? -n : n);
  }
  function rateNum(v) { return num(String(v).replace(',', '.')); }
  function normDate(v) {
    if (typeof v === 'number') { var d = new Date(Math.round((v - 25569) * 864e5)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    var s = String(v || '').trim(), m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) return m[3] + '-' + pad(+m[2]) + '-' + pad(+m[1]);
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    return m ? m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]) : '';
  }

  /* ---------------- Hammy & icon (từ app tham khảo) ---------------- */
  var BODY = 'M70 24 C96 24 108 40 112 54 C130 60 134 92 116 104 C104 114 88 116 70 116 C52 116 36 114 24 104 C6 92 10 60 28 54 C32 40 44 24 70 24 Z';
  var hid = 0;
  function hammyFull(w) {
    var h = Math.round(w * 124 / 140), k = 'h' + (++hid);
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 140 124" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<defs><clipPath id="' + k + 'c"><path d="' + BODY + '"/></clipPath>' +
      '<filter id="' + k + 's" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 0.69  0 0 0 0 0.46  0 0 0 0 0.21  0 0 0 -2.6 1.45"/></filter></defs>' +
      '<circle cx="46" cy="32" r="9.5" fill="#F2B04A" stroke="#B07636" stroke-width="1.8"/><circle cx="94" cy="32" r="9.5" fill="#F2B04A" stroke="#B07636" stroke-width="1.8"/>' +
      '<path d="' + BODY + '" fill="#F2B04A" stroke="#B07636" stroke-width="1.8"/>' +
      '<ellipse cx="70" cy="92" rx="42" ry="22" fill="#FFF6E4" clip-path="url(#' + k + 'c)"/>' +
      '<rect x="0" y="0" width="140" height="124" filter="url(#' + k + 's)" clip-path="url(#' + k + 'c)" opacity="0.35"/>' +
      '<path d="M20 70 L26 64 M18 78 L28 68 M20 85 L29 76 M120 70 L114 64 M122 78 L112 68 M120 85 L111 76" stroke="#E08A2E" stroke-width="1.6" opacity="0.5"/>' +
      '<path d="M50 60 Q56 53 62 60" stroke="#3A2A1E" stroke-width="2.8"/><path d="M78 60 Q84 53 90 60" stroke="#3A2A1E" stroke-width="2.8"/>' +
      '<ellipse cx="70" cy="68" rx="3.2" ry="2.4" fill="#D98C7A"/><path d="M63 74 L77 74 Q76 84 70 84 Q64 84 63 74 Z" fill="#8C3A26"/>' +
      '<rect x="65.5" y="74" width="4.5" height="4.5" rx="1" fill="#FFFFFF"/><rect x="70" y="74" width="4.5" height="4.5" rx="1" fill="#FFFFFF"/></svg>';
  }
  function hammyFace(sz) {
    var w = Math.round(sz * 0.84), h = Math.round(w * 98 / 124);
    return '<span style="width:' + sz + 'px;height:' + sz + 'px;flex-shrink:0;border-radius:50%;background:#FFE3B0;display:flex;align-items:center;justify-content:center;overflow:hidden">' +
      '<svg width="' + w + '" height="' + h + '" viewBox="8 20 124 98" fill="none" stroke-linecap="round" aria-hidden="true">' +
      '<circle cx="46" cy="32" r="9.5" fill="#F2B04A" stroke="#B07636" stroke-width="2.4"/><circle cx="94" cy="32" r="9.5" fill="#F2B04A" stroke="#B07636" stroke-width="2.4"/>' +
      '<path d="' + BODY + '" fill="#F2B04A" stroke="#B07636" stroke-width="2.4"/><ellipse cx="70" cy="92" rx="42" ry="22" fill="#FFF6E4"/>' +
      '<path d="M50 60 Q56 53 62 60" stroke="#3A2A1E" stroke-width="3.8"/><path d="M78 60 Q84 53 90 60" stroke="#3A2A1E" stroke-width="3.8"/>' +
      '<path d="M62 73 L78 73 Q77 86 70 86 Q63 86 62 73 Z" fill="#8C3A26"/><rect x="65" y="73" width="5" height="5" rx="1" fill="#FFFFFF"/><rect x="70" y="73" width="5" height="5" rx="1" fill="#FFFFFF"/></svg></span>';
  }
  var IC = {
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.4 11h10.2L20 8H7"/>',
    food: '<path d="M4 12h16a8 8 0 0 1-16 0z"/><path d="M9 8c0-2 2-2 2-4M14 8c0-2 2-2 2-4"/>',
    bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    car: '<path d="M4 15l1.5-5a2 2 0 0 1 1.9-1.5h9.2a2 2 0 0 1 1.9 1.5L20 15v3H4z"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>',
    basket: '<path d="M3 9h18l-2 10H5L3 9z"/><path d="M8 9l4-5 4 5"/>',
    store: '<path d="M4 10v10h16V10"/><path d="M3 10l2-6h14l2 6z"/><path d="M10 20v-5h4v5"/>',
    plane: '<path d="M2 12l19-8-6 17-3-7z"/><path d="M12 14l9-10"/>',
    health: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
    shield: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
    book: '<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/>',
    school: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
    plug: '<path d="M9 3v5M15 3v5"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>',
    play: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>',
    spark: '<path d="M12 3v7M12 14v7M3 12h7M14 12h7M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    gym: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
    ticket: '<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M14 7v2M14 11v2M14 15v2"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M9.5 9.5l5 5"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
    dots: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8 20h8"/>',
    coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
    check: '<path d="M5 12l5 5 9-10"/>', down: '<path d="M6 9l6 6 6-6"/>', up: '<path d="M6 15l6-6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
    out: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7c1.8 0 3.4-.5 4.7-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    google: '<path d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5a4.3 4.3 0 0 1-1.9 2.8v2.3h3A9 9 0 0 0 21 12.2z"/><path d="M12 21c2.4 0 4.5-.8 6-2.2l-3-2.3c-.8.6-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.4A9 9 0 0 0 12 21z"/><path d="M7 13.7a5.4 5.4 0 0 1 0-3.4V7.9H4a9 9 0 0 0 0 8.2z"/><path d="M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 4 7.9l3 2.4c.7-2.1 2.7-3.7 5-3.7z"/>'
  };
  var TINT = { blue: ['#E3E8F2', '#233A6B'], orange: ['#FFEBD9', '#9A3412'], teal: ['#DDF3F1', '#0F5F58'], amber: ['#FFF1C2', '#7A5200'], green: ['#E3F4E1', '#2F6B1F'], pink: ['#FDE4EC', '#9D174D'], purple: ['#EEE6FB', '#5B21B6'], gray: ['#EEF0F3', '#3F4652'] };
  var CAT_ICON = {
    'Giao đồ ăn': ['bag', 'orange'], 'Ăn uống': ['food', 'orange'], 'Ăn uống cuối tuần': ['food', 'orange'], 'TMĐT': ['cart', 'blue'], 'Online khác': ['globe', 'blue'],
    'Đặt xe': ['car', 'teal'], 'Siêu thị': ['basket', 'green'], 'CHTL': ['store', 'green'], 'Du lịch': ['plane', 'teal'], 'Bệnh viện': ['health', 'pink'],
    'Nhà thuốc': ['pill', 'pink'], 'Bảo hiểm': ['shield', 'pink'], 'Giáo dục': ['school', 'purple'], 'Nhà sách': ['book', 'purple'], 'Điện máy': ['plug', 'blue'],
    'Sub Netflix': ['play', 'purple'], 'Sub ChatGPT': ['spark', 'purple'], 'Sub Spotify': ['music', 'purple'], 'Sub Claude': ['spark', 'purple'], 'Gym': ['gym', 'teal'],
    'Vé xem phim': ['ticket', 'purple'], 'Điện nước': ['bolt', 'amber'], 'Khác': ['dots', 'gray']
  };
  function svgIcon(kind, size) { return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[kind] || IC.dots) + '</svg>'; }
  function icoFor(cat, sz) { var c = CAT_ICON[cat] || ['dots', 'gray'], t = TINT[c[1]], s = sz || 34; return '<span class="ico" style="width:' + s + 'px;height:' + s + 'px;background:' + t[0] + ';color:' + t[1] + '">' + svgIcon(c[0]) + '</span>'; }
  function icoKind(kind, bg, fg, sz) { return '<span class="ico" style="width:' + sz + 'px;height:' + sz + 'px;background:' + bg + ';color:' + fg + '">' + svgIcon(kind) + '</span>'; }
  function safeColor(c) { return /^#[0-9A-Fa-f]{6}$/.test(c || '') ? c : COLORS[4]; }

  /* ---------------- trạng thái ---------------- */
  var S = { screen: 'boot', tab: 'chat', mode: 'tx', dashView: 'card', open: {}, detail: null, cat: 'Giao đồ ăn', cardId: null, amount: '', merchant: '', date: todayIso(), refund: false,
    msgs: [], saving: false, month: null, monthOpen: false, M: null, sheetId: null, setup: null, histAct: null, busy: false, hide: lsGet('hb.hide') === '1',
    error: null, banner: null, loginMsg: null, lostSheet: false, merchantErr: null, skipped: 0 };
  var savedTab = lsGet('hb.tab'); if (savedTab === 'dash' || savedTab === 'chat' || savedTab === 'cards') S.tab = savedTab;
  var $ = function (id) { return document.getElementById(id); };
  var TITLES = { dash: 'Tổng quan hoàn tiền', chat: 'Ghi giao dịch', cards: 'Thông tin thẻ' };
  function byId(id) { return S.M && S.M.cards.filter(function (c) { return c.id === id; })[0]; }
  function curPeriod(c) { return S.month || E.periodOf(todayIso(), c.closeDay); }

  /* ======================================================================
     ĐĂNG NHẬP GOOGLE – token chỉ ở RAM
     - Trình duyệt thường: Google Identity Services (cửa sổ popup).
     - App cài trên màn hình chính iPhone: chuyển trang (redirect), vì popup
       ở chế độ toàn màn hình của iOS hay bị treo. Token đọc từ #fragment,
       xoá khỏi URL ngay lập tức, không lưu vào đâu cả.
     ====================================================================== */
  var AUTH = { token: null, exp: 0, email: lsGet('hb.email'), client: null, pending: null, checked: false };
  function authMode() {
    if (CFG.authMode === 'popup' || CFG.authMode === 'redirect') return CFG.authMode;
    return navigator.standalone === true ? 'redirect' : 'popup';
  }
  function tokenValid() { return MOCK || (!!AUTH.token && Date.now() < AUTH.exp - 60000); }
  function clientReady() { return MOCK || (CFG.clientId && /\.apps\.googleusercontent\.com$/.test(CFG.clientId)); }
  function scopeOk(scope) { return String(scope || '').split(' ').indexOf(DRIVE_SCOPE) >= 0; }
  function acceptToken(token, expiresIn, scope) {
    if (!scopeOk(scope)) { AUTH.token = null; return false; }
    AUTH.token = token; AUTH.exp = Date.now() + (+expiresIn || 3600) * 1000; AUTH.checked = false;
    return true;
  }

  function redirectUri() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
  function startRedirect(silent) {
    var state = rnd(16); ssSet('hb.state', state);
    var p = new URLSearchParams({ client_id: CFG.clientId, redirect_uri: redirectUri(), response_type: 'token', scope: SCOPES, include_granted_scopes: 'true', state: state });
    if (silent) p.set('prompt', 'none');
    else if (!AUTH.email) p.set('prompt', 'select_account');
    if (AUTH.email) p.set('login_hint', AUTH.email);
    location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
  }
  function readRedirect() {
    if (!location.hash || location.hash.length < 2) return null;
    var h = new URLSearchParams(location.hash.slice(1));
    if (!h.get('access_token') && !h.get('error')) return null;
    history.replaceState(null, '', location.pathname + location.search); // xoá token khỏi thanh địa chỉ & lịch sử
    var expect = ssGet('hb.state'); ssSet('hb.state', null);
    if (!expect || h.get('state') !== expect) return { error: 'state' };
    if (h.get('error')) return { error: h.get('error') };
    if (!acceptToken(h.get('access_token'), h.get('expires_in'), h.get('scope'))) return { error: 'scope' };
    return { ok: true };
  }

  var gisLoading = null;
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = function () { res(); render(); }; s.onerror = function () { gisLoading = null; rej(new Error('gis')); };
      document.head.appendChild(s);
    });
    return gisLoading;
  }
  function gisReady() { return !!(window.google && google.accounts && google.accounts.oauth2); }
  function popupLogin(forceChooser) {
    if (!gisReady()) { S.loginMsg = 'Đang tải đăng nhập Google, bấm lại sau 1–2 giây nhé.'; loadGis().catch(function () {}); render(); return; }
    if (!AUTH.client) {
      AUTH.client = google.accounts.oauth2.initTokenClient({ client_id: CFG.clientId, scope: SCOPES, include_granted_scopes: true,
        callback: function (r) {
          if (r.error) { onAuthFail(r.error); return; }
          if (!acceptToken(r.access_token, r.expires_in, r.scope)) { onAuthFail('scope'); return; }
          afterLogin();
        },
        error_callback: function (err) { onAuthFail(err && err.type === 'popup_failed_to_open' ? 'popup_blocked' : 'popup_closed'); }
      });
    }
    var o = { prompt: forceChooser || !AUTH.email ? 'select_account' : '' };
    if (AUTH.email && !forceChooser) o.login_hint = AUTH.email;
    AUTH.client.requestAccessToken(o);
  }
  /* Phải gọi trong lúc người dùng bấm (để trình duyệt không chặn popup). */
  function login(forceChooser) {
    if (MOCK) { afterLogin(); return; }
    if (!clientReady()) { showError({ code: 'config' }); return; }
    S.loginMsg = null;
    if (forceChooser) AUTH.email = null;
    if (authMode() === 'redirect') startRedirect(false); else popupLogin(forceChooser);
  }
  function onAuthFail(code) {
    AUTH.pending = null;
    var msg = {
      access_denied: 'Bạn đã huỷ đăng nhập. Bấm lại khi sẵn sàng nhé.', popup_closed: 'Cửa sổ đăng nhập đã đóng. Bấm lại để đăng nhập.',
      popup_blocked: 'Trình duyệt chặn cửa sổ đăng nhập. Cho phép cửa sổ bật lên (pop-up) rồi bấm lại.',
      scope: 'HammyBack cần quyền "tệp Google Drive mà bạn dùng với ứng dụng này" để tạo và đọc sổ. Khi Google hỏi, nhớ đánh dấu ô đó.',
      state: 'Phiên đăng nhập không khớp (có thể do mở nhiều tab). Bấm đăng nhập lại nhé.'
    }[code] || null;
    S.loginMsg = msg;
    if (S.screen === 'app' && S.M) { S.banner = { code: code === 'scope' ? 'scope' : 'auth' }; render(); return; }
    S.screen = 'login'; render();
  }
  function afterLogin() {
    S.loginMsg = null; S.banner = null;
    var p = AUTH.pending; AUTH.pending = null;
    if (p && (S.M || S.setup)) { render(); p(); return; }
    loadData();
  }
  /* Chạy fn khi có token còn hạn; hết hạn thì xin lại (popup: im lặng nếu được). */
  function withToken(fn) {
    if (tokenValid()) { fn(); return; }
    if (!clientReady()) { showError({ code: 'config' }); return; }
    if (authMode() === 'popup' && gisReady()) { AUTH.pending = fn; popupLogin(false); return; }
    if (S.screen === 'app') { S.banner = { code: 'auth' }; render(); return; }
    if (S.screen === 'setup' && S.setup) { S.setup.needLogin = true; S.setup.saveErr = 'Phiên đăng nhập đã hết hạn (sau khoảng 1 giờ). Bấm Đăng nhập lại; tiếc là bạn sẽ phải điền lại thông tin thẻ.'; render(); return; }
    startRedirect(false);
  }
  function logout() {
    var tok = AUTH.token;
    if (tok && !MOCK) http('https://oauth2.googleapis.com/revoke', { method: 'POST', form: 'token=' + encodeURIComponent(tok) }).catch(function () {});
    AUTH = { token: null, exp: 0, email: null, client: null, pending: null, checked: false };
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('hb.') === 0) localStorage.removeItem(k); }); } catch (e) {}
    try { Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf('hb.') === 0) sessionStorage.removeItem(k); }); } catch (e) {}
    S.M = null; S.sheetId = null; S.setup = null; S.msgs = []; S.amount = ''; S.merchant = ''; S.month = null; S.banner = null; S.error = null;
    S.loginMsg = 'Đã đăng xuất và thu hồi quyền của HammyBack với tài khoản Google này.';
    S.screen = 'login'; render();
  }

  /* ======================================================================
     GỌI GOOGLE API
     ====================================================================== */
  function HBErr(code, status, message) { this.code = code; this.status = status; this.message = message || ''; }
  function rawFetch(url, init) { return (MOCK && window.HAMMY_MOCK) ? window.HAMMY_MOCK.fetch(url, init) : fetch(url, init); }
  function http(url, opt) {
    opt = opt || {};
    var headers = {};
    if (opt.auth !== false && !opt.form) headers.Authorization = 'Bearer ' + (MOCK ? 'mock' : AUTH.token);
    if (opt.body) headers['Content-Type'] = 'application/json';
    if (opt.form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : null;
    return rawFetch(url, { method: opt.method || 'GET', headers: headers, body: opt.form || (opt.body ? JSON.stringify(opt.body) : undefined), signal: ctl ? ctl.signal : undefined, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { clearTimeout(timer); return r.text().then(function (t) { var j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) { j = {}; } return { r: r, j: j }; }); },
            function (e) { clearTimeout(timer); throw new HBErr(opt.write ? 'unsure' : 'offline', 0, String(e && e.message || e)); });
  }
  function classify(status, j, write) {
    var err = (j && j.error) || {}, msg = err.message || '', reasons = (err.errors || []).map(function (x) { return x.reason; }).join(' ') + ' ' + (err.status || '');
    if (status === 401) { AUTH.token = null; return new HBErr('auth', status, msg); }
    if (status === 429 || /rateLimit|RESOURCE_EXHAUSTED|quota/i.test(reasons)) return new HBErr('quota', status, msg);
    if (status === 403 && /insufficient|scope/i.test(msg + reasons)) return new HBErr('scope', status, msg);
    if (status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used/i.test(msg + reasons)) return new HBErr('apiOff', status, msg);
    if (status === 403 || status === 404) return new HBErr('notfound', status, msg);
    if (status === 400 && /Unable to parse range/i.test(msg)) return new HBErr('structure', status, msg);
    if (status >= 500) return new HBErr(write ? 'unsure' : 'server', status, msg);
    return new HBErr('bad', status, msg);
  }
  function gapi(url, opt) {
    opt = opt || {};
    if (!tokenValid()) return Promise.reject(new HBErr('auth', 0, ''));
    if (navigator.onLine === false) return Promise.reject(new HBErr('offline', 0, ''));
    var attempt = function (n) {
      return http(url, opt).then(function (x) {
        if (x.r.ok) return x.j;
        var e = classify(x.r.status, x.j, opt.write);
        if (!opt.write && n === 0 && (e.code === 'quota' || e.code === 'server')) return new Promise(function (res) { setTimeout(res, 1500 + Math.random() * 1000); }).then(function () { return attempt(1); });
        throw e;
      });
    };
    return attempt(0);
  }
  function rng(sheet, a1) { return "'" + sheet + "'!" + a1; }
  function urng(sheet, a1) { return encodeURIComponent(rng(sheet, a1)); }

  function userInfo() {
    if (MOCK) return Promise.resolve({ email: window.HAMMY_MOCK.email });
    return gapi('https://www.googleapis.com/oauth2/v3/userinfo');
  }
  function findSheet() {
    var q = encodeURIComponent("appProperties has { key='hammyback' and value='1' } and trashed=false and mimeType='application/vnd.google-apps.spreadsheet'");
    return gapi(DRIVE + '?q=' + q + '&orderBy=modifiedTime%20desc&fields=files(id)&pageSize=5&spaces=drive').then(function (r) { return r.files && r.files[0] ? r.files[0].id : null; });
  }
  function strCells(row, bold) { return { values: row.map(function (v) { var c = { userEnteredValue: { stringValue: String(v) } }; if (bold) c.userEnteredFormat = { textFormat: { bold: true } }; return c; }) }; }
  function createSheet() {
    var def = [[SH.cards, HEAD.cards], [SH.groups, HEAD.groups], [SH.tiers, HEAD.tiers], [SH.tx, HEAD.tx]].map(function (x, i) {
      return { properties: { title: x[0], index: i, gridProperties: { frozenRowCount: 1 } }, data: [{ startRow: 0, startColumn: 0, rowData: [strCells(x[1], true)] }] };
    });
    def.push({ properties: { title: SH.readme, index: 4 }, data: [{ startRow: 0, startColumn: 0, rowData: README.map(function (r, i) { return strCells(r, i === 0); }) }] });
    return gapi(SHEETS, { method: 'POST', write: true, body: { properties: { title: FILE_TITLE, locale: 'vi_VN', timeZone: 'Asia/Ho_Chi_Minh' }, sheets: def } })
      .then(function (r) {
        S.sheetId = r.spreadsheetId;
        var tag = function () { return gapi(DRIVE + '/' + encodeURIComponent(S.sheetId) + '?fields=id', { method: 'PATCH', write: true, body: { appProperties: { hammyback: '1' } } }); };
        return tag().catch(function () { return tag(); });
      });
  }
  function readModel() {
    var url = SHEETS + '/' + encodeURIComponent(S.sheetId) + '/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING' +
      '&ranges=' + urng(SH.cards, 'A1:N500') + '&ranges=' + urng(SH.groups, 'A1:E3000') + '&ranges=' + urng(SH.tiers, 'A1:E3000') + '&ranges=' + urng(SH.tx, 'A1:J');
    return gapi(url).then(function (r) {
      var vr = r.valueRanges || [], V = function (k) { return (vr[k] && vr[k].values) || []; };
      var C = V(0), G = V(1), B = V(2), T = V(3);
      [[SH.cards, C, HEAD.cards], [SH.groups, G, HEAD.groups], [SH.tiers, B, HEAD.tiers], [SH.tx, T, HEAD.tx]].forEach(function (x) {
        var h = x[1][0] || [];
        for (var i = 0; i < x[2].length; i++) if (String(h[i] == null ? '' : h[i]).trim() !== x[2][i]) throw new HBErr('structure', 0, x[0]);
      });
      var M = { cards: [], groups: [], tiers: [], tx: [] }, skipped = 0, s = function (v) { return String(E.fromCell(v == null ? '' : v)).trim(); };
      C.slice(1).forEach(function (x, i) {
        if (!x[0] || !(x[1] || x[3])) return;
        var bank = s(x[1]), type = s(x[2]), col = s(x[12]);
        M.cards.push({ id: s(x[0]), bank: bank, type: type, name: s(x[3]) || (bank + ' ' + type).trim(), openDate: normDate(x[4]), closeDay: Math.min(31, Math.max(1, num(x[5]) || 31)), dueDay: num(x[6]) || 0,
          limit: num(x[7]), cap: num(x[8]), minSpend: num(x[9]), other: rateNum(x[10]), target: num(x[11]), color: /^#[0-9A-Fa-f]{6}$/.test(col) ? col : COLORS[i % COLORS.length], note: s(x[13]) });
      });
      G.slice(1).forEach(function (x) { if (!x[0] || !x[1]) return; M.groups.push({ cardId: s(x[0]), name: s(x[1]), rate: rateNum(x[2]), cap: num(x[3]), cats: s(x[4]).split(/\s*,\s*/).filter(Boolean) }); });
      B.slice(1).forEach(function (x) { if (!x[0] || !(num(x[2]) > 0)) return; M.tiers.push({ cardId: s(x[0]), group: s(x[1]), from: num(x[2]), rate: rateNum(x[3]), cap: num(x[4]) }); });
      T.slice(1).forEach(function (x, i) {
        if (!x[0]) return;
        var d = normDate(x[1]);
        if (!E.isIso(d) || !x[2]) { skipped++; return; }
        M.tx.push({ id: s(x[0]), row: i + 2, date: d, cardId: s(x[2]), cardName: s(x[3]), cat: s(x[4]) || 'Khác', merchant: s(x[5]), amount: Math.round(num(x[6])), inst: num(x[7]) || 0, status: s(x[8]), created: s(x[9]) });
      });
      S.skipped = skipped;
      return M;
    });
  }
  function cardRow(c) { return [c.id, E.toCell(c.bank), E.toCell(c.type), E.toCell(c.name), c.openDate || '', c.closeDay, c.dueDay || '', c.limit || '', c.cap || '', c.minSpend || '', c.other || 0, c.target || '', c.color, E.toCell(c.note || '')]; }
  function saveCards(M) {
    var cards = M.cards.map(cardRow);
    var groups = M.groups.map(function (g) { return [g.cardId, E.toCell(g.name), g.rate, g.cap || '', E.toCell(g.cats.join(', '))]; });
    var tiers = (M.tiers || []).map(function (t) { return [t.cardId, E.toCell(t.group || ''), t.from, t.group ? t.rate : '', t.cap || '']; });
    var base = SHEETS + '/' + encodeURIComponent(S.sheetId);
    var parts = [[SH.cards, cards, HEAD.cards, 'N'], [SH.groups, groups, HEAD.groups, 'E'], [SH.tiers, tiers, HEAD.tiers, 'E']];
    // Ghi đè trước, xoá phần thừa sau → lỡ mạng rớt giữa chừng cũng không mất sạch dữ liệu.
    return gapi(base + '/values:batchUpdate', { method: 'POST', write: true, body: { valueInputOption: 'RAW', data: parts.map(function (x) { return { range: rng(x[0], 'A1:' + x[3] + (x[1].length + 1)), values: [x[2]].concat(x[1]) }; }) } })
      .then(function () { return gapi(base + '/values:batchClear', { method: 'POST', write: true, body: { ranges: parts.map(function (x) { return rng(x[0], 'A' + (x[1].length + 2) + ':' + x[3]); }) } }); });
  }
  function txRow(t, cardName) { return [t.id, t.date, t.cardId, E.toCell(cardName), E.toCell(t.cat), E.toCell(t.merchant), t.amount, '', '', t.created]; }
  function appendRows(rows) {
    return gapi(SHEETS + '/' + encodeURIComponent(S.sheetId) + '/values/' + urng(SH.tx, 'A1:J1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', { method: 'POST', write: true, body: { values: rows } });
  }
  function appendTx(t, cardName) {
    return appendRows([txRow(t, cardName)]).then(function (r) { var m = /![A-Z]+(\d+)/.exec((r.updates && r.updates.updatedRange) || ''); t.row = m ? +m[1] : null; return t; });
  }
  /* Tìm lại dòng theo Mã giao dịch ngay trước khi sửa (phòng người dùng đã sắp xếp/xoá dòng trong Sheet). */
  function updateTx(t) {
    var base = SHEETS + '/' + encodeURIComponent(S.sheetId) + '/values/';
    return gapi(base + urng(SH.tx, 'A1:A') + '?valueRenderOption=UNFORMATTED_VALUE').then(function (r) {
      var col = r.values || [], row = 0;
      for (var i = 1; i < col.length; i++) if (col[i] && String(col[i][0]) === t.id) { row = i + 1; break; }
      if (!row) throw new HBErr('rowgone', 0, '');
      return gapi(base + urng(SH.tx, 'H' + row + ':I' + row) + '?valueInputOption=RAW', { method: 'PUT', write: true, body: { values: [[t.inst || '', t.status || '']] } });
    });
  }
  function sheetUrl() { return MOCK ? '#' : 'https://docs.google.com/spreadsheets/d/' + encodeURIComponent(S.sheetId || '') + '/edit'; }

  /* ======================================================================
     TẢI DỮ LIỆU
     ====================================================================== */
  function loadData() {
    if (!S.M) { S.screen = 'boot'; render(); }
    var who = AUTH.checked ? Promise.resolve() : userInfo().then(function (u) {
      AUTH.checked = true;
      if (u && u.email) { if (AUTH.email && AUTH.email !== u.email) { S.M = null; S.msgs = []; } AUTH.email = u.email; lsSet('hb.email', u.email); }
    }, function (e) { if (e.code === 'auth' || e.code === 'offline') throw e; });
    return who.then(findSheet).then(function (id) {
      S.sheetId = id;
      if (!id) return null;
      lsSet('hb.had', AUTH.email || '1');
      return readModel();
    }).then(function (M) {
      S.error = null; S.banner = null; ssSet('hb.auto', null);
      if (!M) { S.lostSheet = !!lsGet('hb.had'); S.M = { cards: [], groups: [], tiers: [], tx: [] }; openSetup('new'); return; }
      S.lostSheet = false; S.M = M;
      if (!M.cards.length) { openSetup('new'); return; }
      if (S.screen !== 'setup' && S.screen !== 'done') S.screen = 'app';
      render();
    }).catch(function (e) {
      if (e.code === 'auth' && authMode() === 'redirect' && !ssGet('hb.auto')) { ssSet('hb.auto', String(Date.now())); startRedirect(true); return; }
      if (e.code === 'auth') { S.screen = S.M ? S.screen : 'login'; if (S.M) S.banner = { code: 'auth' }; render(); return; }
      if (S.M && S.screen === 'app') { S.banner = { code: e.code, sheet: e.message }; render(); return; }
      showError(e);
    });
  }
  function showError(e) { S.error = { code: e.code || 'bad', message: e.message || '' }; S.screen = 'error'; render(); }

  /* ======================================================================
     VẼ MÀN HÌNH
     ====================================================================== */
  var lastView = '';
  function render() {
    var app = $('app'), inApp = S.screen === 'app';
    app.classList.toggle('noapp', !inApp);
    $('mockbar').hidden = !MOCK;
    $('title').textContent = inApp ? TITLES[S.tab] : 'HammyBack';
    $('today').textContent = 'Hôm nay ' + dd(TODAY) + '/' + TODAY.getFullYear();
    $('ky').textContent = S.month ? kyLabel(S.month) : 'Kỳ ' + pad(TODAY.getMonth() + 1) + '/' + TODAY.getFullYear();
    $('kyReset').hidden = !S.month;
    $('kyBtn').setAttribute('aria-expanded', String(!!S.monthOpen));
    $('hideBtn').setAttribute('aria-pressed', String(S.hide));
    $('hideBtn').setAttribute('aria-label', S.hide ? 'Hiện số tiền' : 'Ẩn số tiền');
    $('hideBtn').innerHTML = svgIcon(S.hide ? 'eyeoff' : 'eye', 15);
    var menu = $('kyMenu');
    if (S.monthOpen && inApp && S.M) {
      var opts = [{ v: '', l: 'Kỳ này (hiện tại)' }].concat(E.periods(S.M, TODAY).map(function (m) { return { v: m, l: kyLabel(m) }; }));
      menu.innerHTML = opts.map(function (o) { var on = (S.month || '') === o.v; return '<button type="button" role="option" data-act="ky" data-v="' + esc(o.v) + '" aria-selected="' + on + '"><span>' + esc(o.l) + '</span>' + (on ? svgIcon('check', 16) : '') + '</button>'; }).join('');
      menu.hidden = false;
    } else menu.hidden = true;
    Array.prototype.forEach.call(document.querySelectorAll('nav.tabs button'), function (b) { if (b.getAttribute('data-tab') === S.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });

    var main = $('main'), view = S.screen + '/' + S.tab + '/' + S.mode;
    var old = main.querySelector('.scroll'), top = old ? old.scrollTop : 0;
    var html;
    if (S.screen === 'boot') html = '<div class="scroll"><div class="skel"></div><div class="skel" style="height:120px"></div><div class="skel"></div><p class="muted small" style="text-align:center;margin:0">Hammy đang mở sổ thẻ của bạn…</p></div>';
    else if (S.screen === 'login') html = renderLogin();
    else if (S.screen === 'error') html = '<div class="scroll">' + errorState(S.error) + '</div>';
    else if (S.screen === 'setup') html = renderSetup();
    else if (S.screen === 'done') html = renderDone();
    else if (S.screen === 'import') html = renderImport();
    else html = (S.banner ? '<div style="position:relative;z-index:2;padding:8px 16px 0">' + bannerHtml(S.banner) + '</div>' : '') +
      (S.toast && !S.banner ? '<div style="position:relative;z-index:2;padding:8px 16px 0"><div class="okbar" role="status">' + svgIcon('check', 16) + esc(S.toast) + '</div></div>' : '') + (S.tab === 'dash' ? renderDash() : S.tab === 'cards' ? renderCards() : renderChat());
    main.innerHTML = html;
    var ns = main.querySelector('.scroll'); if (ns && view === lastView) ns.scrollTop = top;
    lastView = view;
    if (inApp && S.tab === 'chat') scrollMsgs();
  }

  var ERR = {
    offline: ['Mất kết nối mạng', 'Kiểm tra Wi-Fi hoặc 4G rồi bấm Thử lại.'],
    server: ['Google đang trục trặc', 'Thường chỉ là tạm thời. Đợi vài giây rồi bấm Thử lại.'],
    quota: ['Google đang giới hạn số lần gọi', 'Đợi khoảng 1 phút rồi bấm Thử lại.'],
    auth: ['Phiên đăng nhập đã hết', 'Đăng nhập lại để tiếp tục. Dữ liệu của bạn vẫn an toàn trong Google Sheet.'],
    scope: ['HammyBack chưa được cấp quyền Google Drive', 'Khi Google hỏi, nhớ đánh dấu ô cho phép HammyBack dùng "các tệp Google Drive mà bạn dùng với ứng dụng này". App chỉ thấy file nó tạo.'],
    notfound: ['Không mở được Google Sheet của HammyBack', 'Có thể file đã bị xoá. Vào Thùng rác Google Drive để khôi phục rồi bấm Thử lại.'],
    structure: ['Google Sheet bị đổi cấu trúc', 'Hàng tiêu đề không còn như ban đầu. Đừng đổi tên sheet hay chèn/xoá cột. Vào Sheet → Tệp → Nhật ký phiên bản để khôi phục, rồi bấm Thử lại.'],
    apiOff: ['Google API chưa được bật', 'Chủ app cần bật Google Sheets API và Google Drive API trong Google Cloud Console.'],
    config: ['Chưa cấu hình đăng nhập Google', 'Chủ app cần dán Client ID vào file config.js (xem README).'],
    rowgone: ['Không tìm thấy giao dịch này trong Sheet', 'Có thể dòng đã bị xoá thẳng trong Google Sheet. Bấm nút làm mới để đọc lại.'],
    unsure: ['Mạng chập chờn', 'Chưa chắc thay đổi đã được lưu. Bấm nút làm mới để kiểm tra.'],
    bad: ['Có lỗi khi nói chuyện với Google', 'Bấm Thử lại. Nếu vẫn lỗi, chụp màn hình gửi chủ app.']
  };
  function errorState(e) {
    var m = ERR[e && e.code] || ERR.bad, body = m[1];
    if (e && e.code === 'structure' && e.message && !/parse/i.test(e.message)) body = 'Hàng tiêu đề của sheet "' + e.message + '" không còn như ban đầu. Đừng đổi tên sheet hay chèn/xoá cột. Vào Sheet → Tệp → Nhật ký phiên bản để khôi phục, rồi bấm Thử lại.';
    var btn = e && (e.code === 'auth' || e.code === 'scope') ? '<button type="button" data-act="login">Đăng nhập lại</button>' : e && e.code === 'config' ? '' : '<button type="button" data-act="reload">Thử lại</button>';
    return '<div class="state">' + hammyFace(64) + '<h2>' + esc(m[0]) + '</h2><div>' + esc(body) + '</div>' + btn +
      (e && (e.code === 'notfound' || e.code === 'structure') && S.sheetId ? '<a class="linkbtn" target="_blank" rel="noopener noreferrer" href="' + esc(sheetUrl()) + '">' + svgIcon('sheet', 16) + 'Mở Google Sheet</a>' : '') +
      (e && e.code !== 'config' ? '<button type="button" class="linkbtn" data-act="logout">Đăng xuất</button>' : '') + '</div>';
  }
  function bannerHtml(b) {
    var m = ERR[b.code] || ERR.bad;
    var act = b.code === 'auth' || b.code === 'scope' ? '<button type="button" class="btn" style="margin:8px 0 0;min-height:34px;font-size:13px" data-act="relogin">Đăng nhập lại</button>' : '';
    return '<div class="alert" role="status"><div><b>' + esc(m[0]) + '.</b> ' + esc(b.code === 'auth' ? (authMode() === 'popup' ? 'Bấm Đăng nhập lại, số bạn đang nhập vẫn giữ nguyên.' : 'Bấm Đăng nhập lại để tiếp tục.') : m[1]) + (b.code !== 'auth' && b.code !== 'scope' ? ' Đang hiện số liệu lần đọc trước.' : '') + '<br>' + act + '</div></div>';
  }

  /* ---------- đăng nhập ---------- */
  function renderLogin() {
    var cont = AUTH.email && clientReady();
    var waiting = authMode() === 'popup' && !gisReady() && !MOCK;
    return '<div class="scroll"><div class="state" style="margin-top:8px">' + hammyFull(150) +
      '<h2>Chào bạn, mình là Hammy!</h2><div>HammyBack giúp bạn biết <b>quẹt thẻ nào được hoàn nhiều nhất</b>, còn bao nhiêu cap, và khi nào đến hạn thanh toán.</div>' +
      (S.loginMsg ? '<div class="err" role="alert">' + esc(S.loginMsg) + '</div>' : '') +
      '<button type="button" data-act="login"' + (waiting ? ' aria-busy="true"' : '') + '>' + svgIcon('google', 18) + (cont ? 'Tiếp tục với ' + esc(maskEmail(AUTH.email)) : 'Đăng nhập bằng Google') + '</button>' +
      (cont ? '<button type="button" class="linkbtn" data-act="login-other">Dùng tài khoản Google khác</button>' : '') +
      '<div class="privacy"><b>Quyền riêng tư</b><ul>' +
      '<li>Dữ liệu nằm trong <b>một Google Sheet ở Drive của chính bạn</b>. Chủ app không xem được.</li>' +
      '<li>App chỉ có quyền với <b>file do nó tạo</b>, không thấy file khác trong Drive.</li>' +
      '<li>Không bao giờ hỏi số thẻ, ngày hết hạn, CVV, tên chủ thẻ, số điện thoại.</li>' +
      '<li>Không server, không quảng cáo, không theo dõi.</li></ul>' +
      '<a href="privacy.html" target="_blank" rel="noopener">Chính sách quyền riêng tư</a></div></div></div>';
  }

  /* ---------- set-up & sửa thẻ ----------
     S.setup = { mode: 'new' (lần đầu, 2 bước) | 'edit' | 'add' (1 thẻ, tab Thẻ), step, cards: [bản nháp], errors, saveErr, confirmDel, focusGroup } */
  function fold(x) { return String(x || '').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
  function presetFor(bank, type) { var b = fold(bank), t = fold(type); return PRESETS.filter(function (p) { return fold(p.bank) === b && fold(p.type) === t; })[0] || null; }
  function cardName(d) { return (String(d.bank || '').trim() + ' ' + String(d.type || '').trim()).trim(); }
  function moneyStr(v) { return v ? String(Math.round(v)) : ''; }
  function blankRules(d) { d.cap = ''; d.minSpend = ''; d.other = ''; d.target = ''; d.note = ''; d.tiers = []; d.groups = []; d.presetKey = null; d.rulesDirty = false; }
  function blankDraft(n) { var d = { id: uid('c'), bank: '', type: '', color: COLORS[n % COLORS.length], openDate: '', closeDay: '', dueDay: '', limit: '', open: false, newCat: {} }; blankRules(d); return d; }
  function applyPreset(d, p) {
    d.cap = moneyStr(p.cap); d.minSpend = moneyStr(p.minSpend); d.other = p.other ? String(p.other) : ''; d.target = moneyStr(p.target); d.note = p.note || ''; d.color = p.color;
    d.tiers = (p.tiers || []).map(function (t) { return { from: moneyStr(t[0]), cap: moneyStr(t[1]) }; });
    d.groups = p.groups.map(function (g) { return { name: g[0], rate: String(g[1]), cap: moneyStr(g[2]), cats: g[3].split(/\s*,\s*/), tiers: (g[4] || []).map(function (t) { return { from: moneyStr(t[0]), rate: String(t[1]), cap: moneyStr(t[2]) }; }) }; });
    d.presetKey = p.bank + ' ' + p.type; d.rulesDirty = false;
  }
  /* Điền sẵn luật nếu khớp preset và người dùng chưa tự sửa luật. */
  function syncPreset(d) {
    if (d.rulesDirty) return;
    var p = presetFor(d.bank, d.type);
    if (p && d.presetKey !== p.bank + ' ' + p.type) applyPreset(d, p);
    else if (!p && d.presetKey) blankRules(d);
  }
  function draftFromCard(M, c) {
    var d = { id: c.id, bank: c.bank, type: c.type, color: c.color, openDate: c.openDate || '', closeDay: String(c.closeDay || ''), dueDay: c.dueDay ? String(c.dueDay) : '', limit: moneyStr(c.limit),
      cap: moneyStr(c.cap), minSpend: moneyStr(c.minSpend), other: c.other ? String(c.other) : '', target: moneyStr(c.target), note: c.note || '', presetKey: null, rulesDirty: true, open: true, newCat: {},
      tiers: E.tiersOf(M, c.id, '').map(function (t) { return { from: moneyStr(t.from), cap: moneyStr(t.cap) }; }),
      groups: M.groups.filter(function (g) { return g.cardId === c.id; }).map(function (g) {
        return { name: g.name, rate: String(g.rate), cap: moneyStr(g.cap), cats: g.cats.slice(), tiers: E.tiersOf(M, c.id, g.name).map(function (t) { return { from: moneyStr(t.from), rate: String(t.rate), cap: moneyStr(t.cap) }; }) };
      }) };
    return d;
  }
  function openSetup(mode, cardId, groupIdx) {
    S.setup = { mode: mode, step: 1, cards: [], errors: {}, saveErr: null, confirmDel: false, focusGroup: groupIdx == null ? null : groupIdx };
    if (mode === 'new') S.setup.cards = [blankDraft(0)];
    else if (mode === 'add') S.setup.cards = [blankDraft(S.M.cards.length)];
    else S.setup.cards = [draftFromCard(S.M, byId(cardId))];
    S.screen = 'setup'; S.monthOpen = false; lastView = ''; render();
    if (S.setup.focusGroup != null) { var g = $('gb-0-' + S.setup.focusGroup); if (g && g.scrollIntoView) g.scrollIntoView({ block: 'start' }); }
  }
  function hasCards() { return !!(S.M && S.M.cards.length); }
  function allCustomCats(extraDrafts) {
    var out = [], add = function (x) { if (CATS.indexOf(x) < 0 && out.indexOf(x) < 0) out.push(x); };
    if (S.M) S.M.groups.forEach(function (g) { g.cats.forEach(add); });
    (extraDrafts || []).forEach(function (d) { d.groups.forEach(function (g) { g.cats.forEach(add); }); });
    return out;
  }
  function allCats() { return CATS.filter(function (x) { return x !== 'Khác'; }).concat(allCustomCats(), ['Khác']); }

  function bad(i, f) { var e = S.setup.errors[i]; return e && e.fields[f] ? ' bad' : ''; }
  function inp(id, attrs, val, ph, type) {
    return '<input id="' + id + '"' + attrs + ' type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '" placeholder="' + esc(ph || '') + '" autocomplete="off" autocorrect="off" spellcheck="false">';
  }
  function fieldAttrs(kind, max) {
    var a = '';
    if (kind === 'money') a = ' data-money="1" inputmode="numeric"';
    else if (kind === 'day') a = ' inputmode="numeric" maxlength="2"';
    else if (kind === 'rate') a = ' inputmode="decimal" maxlength="6"';
    if (max) a += ' maxlength="' + max + '"';
    return a;
  }
  function fmtField(kind, v) { return kind === 'money' && v ? (+v).toLocaleString('en-US') : v; }
  /* Ô của thẻ: data-su=i data-f=f */
  function field(i, f, label, kind, val, ph, req, extra) {
    var id = 'f-' + i + '-' + f;
    return '<label class="fld' + bad(i, f) + '" for="' + id + '"><span>' + esc(label) + (req ? ' <span class="req">*</span>' : '') + '</span>' +
      inp(id, ' data-su="' + i + '" data-f="' + f + '"' + fieldAttrs(kind, kind === 'text' ? (extra && extra.max) : 0) + (extra && extra.list ? ' list="' + extra.list + '"' : '') + (kind === 'date' ? ' max="' + todayIso() + '"' : ''), fmtField(kind, val), ph, kind === 'date' ? 'date' : 'text') + '</label>';
  }
  /* Ô trong nhóm / bậc: data-path="i.g.j.f" | "i.t.k.f" | "i.g.j.t.k.f" */
  function pfield(path, key, label, kind, val, ph, i) {
    var id = 'p-' + path.replace(/\./g, '-');
    return '<label class="fld' + bad(i, key) + '" for="' + id + '">' + esc(label) + inp(id, ' data-path="' + path + '"' + fieldAttrs(kind, kind === 'text' ? LIMITS.group : 0), fmtField(kind, val), ph) + '</label>';
  }
  function swatches(c, i) { return '<div class="lbl">Màu thẻ</div><div class="swatches">' + COLORS.map(function (col) { return '<button type="button" class="sw" data-act="su-color" data-i="' + i + '" data-v="' + col + '" aria-label="Màu ' + col + '" aria-pressed="' + (c.color === col) + '" style="background:' + col + '"></button>'; }).join('') + '</div>'; }
  function typesFor(bank) { var b = fold(bank); return PRESETS.filter(function (p) { return fold(p.bank) === b; }).map(function (p) { return p.type; }); }
  function presetHint(c, i) {
    var p = presetFor(c.bank, c.type), su = S.setup;
    if (!p) return '';
    if (su.mode === 'new') return svgIcon('check', 14) + ' Hammy có sẵn luật hoàn tiền của thẻ này, sẽ điền giùm ở bước sau.';
    if (c.presetKey === p.bank + ' ' + p.type) return svgIcon('check', 14) + ' Đã điền sẵn luật của ' + esc(p.bank + ' ' + p.type) + ' bên dưới.';
    return '<button type="button" class="linkbtn" style="padding:0" data-act="su-fill" data-i="' + i + '">' + svgIcon('check', 14) + ' Điền sẵn luật của ' + esc(p.bank + ' ' + p.type) + '</button>';
  }
  function cardInfo(c, i) {
    var err = S.setup.errors[i];
    return '<datalist id="dl-bank">' + BANKS.map(function (b) { return '<option value="' + esc(b) + '">'; }).join('') + '</datalist>' +
      '<datalist id="dl-type-' + i + '">' + typesFor(c.bank).map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>' +
      '<div class="two">' + field(i, 'bank', 'Ngân hàng', 'text', c.bank, 'vd Shinhan', true, { max: LIMITS.bank, list: 'dl-bank' }) + field(i, 'type', 'Loại thẻ', 'text', c.type, 'vd Supreme', true, { max: LIMITS.type, list: 'dl-type-' + i }) + '</div>' +
      '<div class="small ok-hint" id="ph-' + i + '">' + presetHint(c, i) + '</div>' +
      '<div class="two">' + field(i, 'closeDay', 'Ngày sao kê (1–31)', 'day', c.closeDay, 'vd 25', true) + field(i, 'dueDay', 'Ngày đến hạn (1–31)', 'day', c.dueDay, 'vd 15', true) + '</div>' +
      '<div class="two">' + field(i, 'openDate', 'Ngày kích hoạt thẻ', 'date', c.openDate, '') + field(i, 'limit', 'Hạn mức (₫)', 'money', c.limit, 'tuỳ chọn') + '</div>' +
      '<div class="small muted" style="margin-top:-6px">Ngày kích hoạt dùng để tính mốc chi miễn phí thường niên.</div>' +
      swatches(c, i) + (err && err.info ? '<div class="err" role="alert">' + err.info.map(esc).join('<br>') + '</div>' : '');
  }
  function rulesSummary(c) {
    if (!c.groups.length && !c.cap) return 'Chưa có luật';
    return c.groups.length + ' nhóm · cap tổng ' + (c.cap ? fmtM(+c.cap) : 'không giới hạn') + (c.tiers.length ? ' · ' + (c.tiers.length + 1) + ' bậc' : '');
  }
  function tierRow(i, path, keyBase, t, withRate, k) {
    return '<div class="tier">' + pfield(path + '.from', keyBase + 'from', 'Tổng chi từ (₫)', 'money', t.from, 'vd 15,000,000', i) +
      (withRate ? pfield(path + '.rate', keyBase + 'rate', 'Tỷ lệ (%)', 'rate', t.rate, '', i) : '') +
      pfield(path + '.cap', keyBase + 'cap', withRate ? 'Cap (₫)' : 'Cap tổng (₫)', 'money', t.cap, withRate ? 'trống = chung' : '', i) +
      '<button type="button" class="xbtn" data-act="t-remove" data-path="' + path + '" aria-label="Bỏ bậc">×</button></div>';
  }
  function rulesFields(c, i) {
    var customs = allCustomCats(S.setup.cards), err = S.setup.errors[i];
    var h = '<div class="rules">' + (c.presetKey ? '<div class="note" style="font-size:12.5px">' + esc(PRESET_NOTE) + '</div>' : '') +
      '<div class="two">' + field(i, 'cap', 'Cap tổng/kỳ (₫)', 'money', c.cap, 'trống = không giới hạn') + field(i, 'other', 'Tỷ lệ giao dịch khác (%)', 'rate', c.other, 'vd 0.3') + '</div>' +
      '<div class="two">' + field(i, 'minSpend', 'Chi tối thiểu/kỳ để được hoàn (₫)', 'money', c.minSpend, 'trống = không cần') + field(i, 'target', 'Mốc chi miễn phí năm (₫)', 'money', c.target, 'tuỳ chọn') + '</div>' +
      '<div class="subsec"><div class="lbl">Cap tổng tăng theo mức chi (tuỳ chọn)</div>' +
      c.tiers.map(function (t, k) { return tierRow(i, i + '.t.' + k, 't' + k, t, false, k); }).join('') +
      '<button type="button" class="linkbtn" data-act="t-add" data-path="' + i + '.t">' + svgIcon('plus', 14) + ' Thêm bậc cap tổng</button>' +
      '<div class="small muted">Vd Shinhan: tổng chi từ 15 triệu thì cap tổng lên 1 triệu. Mức chi tính theo tổng chi cả thẻ trong kỳ; đạt mốc thì cả kỳ được tính theo bậc mới.</div></div>';
    c.groups.forEach(function (g, j) {
      var chips = CATS.filter(function (x) { return x !== 'Khác'; }).concat(customs.filter(function (x) { return CATS.indexOf(x) < 0; }));
      h += '<div class="gbox" id="gb-' + i + '-' + j + '"><div class="row"><b class="small">Nhóm ' + (j + 1) + (g.name ? ' · ' + esc(g.name) : '') + '</b><button type="button" class="linkbtn warn" data-act="g-remove" data-i="' + i + '" data-j="' + j + '">Bỏ nhóm</button></div>' +
        '<div class="three">' + pfield(i + '.g.' + j + '.name', 'g' + j + 'name', 'Tên nhóm', 'text', g.name, '', i) + pfield(i + '.g.' + j + '.rate', 'g' + j + 'rate', 'Tỷ lệ (%)', 'rate', g.rate, '', i) + pfield(i + '.g.' + j + '.cap', 'g' + j + 'cap', 'Cap nhóm (₫)', 'money', g.cap, 'trống = chung', i) + '</div>' +
        '<div><div class="lbl"' + (bad(i, 'g' + j + 'cats') ? ' style="color:var(--warn)"' : '') + '>Ngành hàng trong nhóm</div><div class="small muted" style="margin:2px 0 8px">Có thể chọn nhiều ngành hàng cùng nhóm. Các ngành trong nhóm dùng chung tỷ lệ và cap.</div>' +
        '<div class="wrapchips">' + chips.map(function (cat) { return '<button type="button" class="cb tiny" data-act="g-cat" data-i="' + i + '" data-j="' + j + '" data-v="' + esc(cat) + '" aria-pressed="' + (g.cats.indexOf(cat) >= 0) + '">' + esc(disp(cat)) + '</button>'; }).join('') + '</div>' +
        '<div class="addcat">' + inp('nc-' + i + '-' + j, ' data-newcat="' + i + '.' + j + '" maxlength="' + LIMITS.cat + '"', (c.newCat || {})[j] || '', 'Ngành khác (tự điền), vd Quảng cáo') + '<button type="button" class="cb tiny" data-act="g-newcat" data-i="' + i + '" data-j="' + j + '">' + svgIcon('plus', 14) + ' Thêm</button></div>' +
        (S.setup.catErr && S.setup.catErr.i === i && S.setup.catErr.j === j ? '<div class="hint err" style="padding:6px 0 0">' + esc(S.setup.catErr.msg) + '</div>' : '') + '</div>' +
        '<div class="subsec"><div class="lbl">Tỷ lệ/cap nhóm tăng theo mức chi (tuỳ chọn)</div>' +
        (g.tiers || []).map(function (t, k) { return tierRow(i, i + '.g.' + j + '.t.' + k, 'g' + j + 't' + k, t, true, k); }).join('') +
        '<button type="button" class="linkbtn" data-act="t-add" data-path="' + i + '.g.' + j + '.t">' + svgIcon('plus', 14) + ' Thêm bậc cho nhóm</button></div></div>';
    });
    h += '<button type="button" class="linkbtn" style="align-self:flex-start" data-act="g-add" data-i="' + i + '">' + svgIcon('plus', 16) + ' Thêm nhóm hoàn tiền</button>';
    h += '<div class="small muted">Cap nhóm để trống = nhóm dùng chung cap tổng của thẻ.</div>';
    h += '<label class="fld' + bad(i, 'note') + '" for="f-' + i + '-note">Lưu ý (tuỳ chọn)<textarea id="f-' + i + '-note" data-su="' + i + '" data-f="note" maxlength="' + LIMITS.note + '" spellcheck="false">' + esc(c.note || '') + '</textarea><span class="small muted" style="font-weight:400">Chỉ để bạn ghi nhớ, hiện ở tab Thẻ. Không ảnh hưởng cách tính.</span></label>';
    if (err && err.rules) h += '<div class="err" role="alert">' + err.rules.map(esc).join('<br>') + '</div>';
    return h + '</div>';
  }
  function cardHead(c, i, right) {
    return '<div class="row"><div class="cardhead"><span class="mini" style="background:' + safeColor(c.color) + '"></span><b id="cn-' + i + '">' + esc(cardName(c) || 'Thẻ ' + (i + 1)) + '</b></div>' + (right || '') + '</div>';
  }
  function renderSetup() {
    var su = S.setup, out = ['<div class="scroll">'];
    if (su.mode === 'new' && su.step === 1) {
      if (S.lostSheet) out.push('<div class="alert"><div><b>Không thấy sổ HammyBack cũ của bạn.</b> Nếu lỡ xoá, vào Thùng rác Google Drive khôi phục file "' + esc(FILE_TITLE) + '" rồi bấm Tìm lại. Còn không, tạo sổ mới bên dưới.<br><button type="button" class="btn" style="margin:8px 0 0;min-height:34px;font-size:13px" data-act="reload">Tìm lại</button></div></div>');
      out.push('<div class="setuphead">' + hammyFace(52) + '<div><div class="h2" style="margin:0">Thẻ của bạn</div><div class="small muted" style="margin-top:2px">Bạn hiện đang có <b>' + su.cards.length + ' thẻ</b> · Bước 1/2</div></div></div>');
      out.push('<div class="pii">' + svgIcon('lock', 16) + '<div><b>Không cần số thẻ, ngày hết hạn, CVV.</b> Hammy chỉ hỏi tên ngân hàng, loại thẻ và vài ngày trong tháng (sao kê, đến hạn).</div></div>');
      su.cards.forEach(function (c, i) {
        out.push('<div class="setupcard' + (su.errors[i] ? ' haserr' : '') + '" id="sc-' + i + '">' + cardHead(c, i, su.cards.length > 1 ? '<button type="button" class="linkbtn warn" data-act="su-remove" data-i="' + i + '">Bỏ thẻ</button>' : '') + cardInfo(c, i) + '</div>');
      });
      out.push('<button type="button" class="addcard" data-act="su-add">' + svgIcon('plus', 18) + ' Thêm thẻ mới</button>');
      out.push('<div class="small muted" style="text-align:center">Sau bước này sẽ nhập chi tiết hoàn tiền.</div>');
      out.push('<button type="button" class="primary" data-act="su-next">Tiếp tục</button></div>');
      return out.join('');
    }
    if (su.mode === 'new') {
      out.push('<div class="setuphead">' + hammyFace(52) + '<div><div class="h2" style="margin:0">Chi tiết hoàn tiền</div><div class="small muted" style="margin-top:2px">Bước 2/2 · Bấm vào từng thẻ để xem và sửa. Luật nào không có thì để trống.</div></div></div>');
      su.cards.forEach(function (c, i) {
        var open = c.open || !!su.errors[i];
        out.push('<div class="setupcard' + (su.errors[i] ? ' haserr' : '') + '" id="sc-' + i + '"><button type="button" class="foldhead" data-act="su-open" data-i="' + i + '" aria-expanded="' + open + '"><span class="cardhead"><span class="mini" style="background:' + safeColor(c.color) + '"></span><span><b>' + esc(cardName(c)) + '</b><span class="small muted" style="display:block;font-weight:400">' + esc(rulesSummary(c)) + '</span></span></span>' + svgIcon(open ? 'up' : 'down', 18) + '</button>' +
          (open ? rulesFields(c, i) : '') + '</div>');
      });
    } else {
      var c0 = su.cards[0];
      out.push('<div class="setuphead">' + hammyFace(52) + '<div><div class="h2" style="margin:0">' + (su.mode === 'add' ? 'Thêm thẻ' : 'Sửa thẻ') + '</div><div class="small muted" style="margin-top:2px">Lưu xong, Hammy ghi thẳng vào Google Sheet của bạn.</div></div></div>');
      out.push('<div class="setupcard' + (su.errors[0] && su.errors[0].info ? ' haserr' : '') + '" id="sc-0">' + cardHead(c0, 0) + cardInfo(c0, 0) + '</div>');
      out.push('<div class="setupcard' + (su.errors[0] && su.errors[0].rules ? ' haserr' : '') + '"><div class="h2" style="margin:0">Chi tiết hoàn tiền</div>' + rulesFields(c0, 0) + '</div>');
    }
    if (su.saveErr) out.push('<div class="err" role="alert">' + esc(su.saveErr) + (su.needLogin ? '<br><button type="button" class="btn" style="margin:8px 0 0;min-height:34px;font-size:13px" data-act="relogin">Đăng nhập lại</button>' : '') + '</div>');
    out.push('<button type="button" class="primary" data-act="su-save"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Đang ghi…' : 'Lưu vào Google Sheet') + '</button>');
    if (su.mode === 'new') out.push('<button type="button" class="linkbtn" style="align-self:center" data-act="su-back">Quay lại bước 1</button>');
    else {
      out.push('<button type="button" class="linkbtn" style="align-self:center" data-act="su-cancel">Huỷ, không lưu</button>');
      if (su.mode === 'edit') out.push(su.confirmDel
        ? '<div class="err"><b>Xoá thẻ ' + esc(cardName(su.cards[0])) + ' khỏi HammyBack?</b> Luật hoàn tiền của thẻ sẽ bị xoá. Giao dịch cũ vẫn nằm trong Google Sheet.<div class="hacts" style="border:0;padding:0"><button type="button" class="danger" data-act="card-del-ok"' + (S.busy ? ' disabled' : '') + '>Xoá thẻ</button><button type="button" data-act="card-del-no">Thôi</button></div></div>'
        : '<button type="button" class="linkbtn warn" style="align-self:center" data-act="card-del">Xoá thẻ này</button>');
    }
    out.push('</div>');
    return out.join('');
  }
  /* ---------- kiểm tra & lưu ---------- */
  function money(v) { return v === '' || v == null ? 0 : +v; }
  function rateOk(r) { r = String(r == null ? '' : r).trim(); return /^\d+([.,]\d+)?$/.test(r) && rateNum(r) <= 100; }
  function checkInfo(c, names, add) {
    var nm = cardName(c);
    ['bank', 'type'].forEach(function (k) { var s = E.sensitive(c[k]); if (s) add(k, E.SENSITIVE_MSG[s]); });
    if (!String(c.bank || '').trim()) add('bank', 'Nhập tên ngân hàng.');
    if (!String(c.type || '').trim()) add('type', 'Nhập loại thẻ.');
    if (/,/.test(nm)) add('type', 'Tên ngân hàng và loại thẻ không dùng dấu phẩy.');
    if (nm && names[fold(nm)]) add('type', 'Thẻ "' + nm + '" bị trùng với thẻ khác.');
    if (nm) names[fold(nm)] = 1;
    if (!/^\d{1,2}$/.test(String(c.closeDay).trim()) || +c.closeDay < 1 || +c.closeDay > 31) add('closeDay', 'Ngày sao kê là số từ 1 đến 31.');
    if (!/^\d{1,2}$/.test(String(c.dueDay).trim()) || +c.dueDay < 1 || +c.dueDay > 31) add('dueDay', 'Ngày đến hạn là số từ 1 đến 31.');
    if (c.openDate && (!E.isIso(c.openDate) || c.openDate > todayIso())) add('openDate', 'Ngày kích hoạt không hợp lệ.');
    if (money(c.limit) > 1e12) add('limit', 'Số tiền quá lớn.');
  }
  function checkRules(c, add) {
    var s = E.sensitive(c.note); if (s) add('note', E.SENSITIVE_MSG[s]);
    if (String(c.other).trim() && !rateOk(c.other)) add('other', 'Tỷ lệ giao dịch khác là số từ 0 đến 100.');
    ['cap', 'minSpend', 'target'].forEach(function (k) { if (money(c[k]) > 1e12) add(k, 'Số tiền quá lớn.'); });
    var froms = {};
    c.tiers.forEach(function (t, k) {
      if (!(money(t.from) > 0)) add('t' + k + 'from', 'Bậc cap tổng ' + (k + 1) + ': nhập mức tổng chi.');
      else if (froms[t.from]) add('t' + k + 'from', 'Hai bậc cap tổng có cùng mức chi.');
      froms[t.from] = 1;
      if (!(money(t.cap) > 0)) add('t' + k + 'cap', 'Bậc cap tổng ' + (k + 1) + ': nhập cap tổng.');
    });
    var seen = {}, gnames = {};
    c.groups.forEach(function (g, j) {
      var gn = String(g.name || '').trim(), sg = E.sensitive(g.name);
      if (sg) add('g' + j + 'name', E.SENSITIVE_MSG[sg]);
      if (!gn) add('g' + j + 'name', 'Nhóm ' + (j + 1) + ': nhập tên nhóm.');
      else if (gnames[fold(gn)]) add('g' + j + 'name', 'Hai nhóm cùng tên "' + gn + '".');
      gnames[fold(gn)] = 1;
      if (!rateOk(g.rate)) add('g' + j + 'rate', 'Nhóm ' + (j + 1) + ': tỷ lệ là số từ 0 đến 100.');
      if (!g.cats.length) add('g' + j + 'cats', 'Nhóm ' + (j + 1) + ': chọn ít nhất 1 ngành hàng.');
      g.cats.forEach(function (cat) { if (seen[cat]) add('g' + j + 'cats', 'Ngành "' + disp(cat) + '" nằm ở 2 nhóm của cùng thẻ. Mỗi ngành chỉ thuộc 1 nhóm.'); seen[cat] = 1; });
      var gf = {};
      (g.tiers || []).forEach(function (t, k) {
        var key = 'g' + j + 't' + k;
        if (!(money(t.from) > 0)) add(key + 'from', 'Nhóm ' + (j + 1) + ', bậc ' + (k + 1) + ': nhập mức tổng chi.');
        else if (gf[t.from]) add(key + 'from', 'Nhóm ' + (j + 1) + ': hai bậc cùng mức chi.');
        gf[t.from] = 1;
        if (!rateOk(t.rate)) add(key + 'rate', 'Nhóm ' + (j + 1) + ', bậc ' + (k + 1) + ': tỷ lệ là số từ 0 đến 100.');
      });
    });
  }
  /* part: 'info' | 'rules' | 'all'. Trả về true nếu không lỗi. */
  function validateSetup(part) {
    var su = S.setup, errs = {}, names = {};
    if (su.mode !== 'new') S.M.cards.forEach(function (c) { if (c.id !== su.cards[0].id) names[fold(c.name)] = 1; });
    su.cards.forEach(function (c, i) {
      var e = { info: [], rules: [], fields: {} };
      var mk = function (bucket) { return function (key, msg) { e.fields[key] = 1; if (e[bucket].indexOf(msg) < 0) e[bucket].push(msg); }; };
      if (part !== 'rules') checkInfo(c, names, mk('info'));
      if (part !== 'info') checkRules(c, mk('rules'));
      if (e.info.length || e.rules.length) { if (!e.info.length) delete e.info; if (!e.rules.length) delete e.rules; errs[i] = e; }
    });
    su.errors = errs;
    return !Object.keys(errs).length;
  }
  function scrollToError() { var first = document.querySelector('.setupcard.haserr'); if (first && first.scrollIntoView) first.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  function draftToModel(d) {
    var nm = cardName(d);
    var card = { id: d.id, bank: String(d.bank).trim(), type: String(d.type).trim(), name: nm, openDate: d.openDate || '', closeDay: +d.closeDay, dueDay: +d.dueDay, limit: money(d.limit), cap: money(d.cap), minSpend: money(d.minSpend),
      other: rateNum(d.other) || 0, target: money(d.target), color: safeColor(d.color), note: String(d.note || '').trim() };
    var groups = [], tiers = [];
    d.tiers.forEach(function (t) { tiers.push({ cardId: d.id, group: '', from: money(t.from), rate: 0, cap: money(t.cap) }); });
    d.groups.forEach(function (g) {
      var gn = String(g.name).trim();
      groups.push({ cardId: d.id, name: gn, rate: rateNum(g.rate), cap: money(g.cap), cats: g.cats.slice() });
      (g.tiers || []).forEach(function (t) { tiers.push({ cardId: d.id, group: gn, from: money(t.from), rate: rateNum(t.rate), cap: money(t.cap) }); });
    });
    return { card: card, groups: groups, tiers: tiers };
  }
  function buildModel(deleteId) {
    var su = S.setup, base = S.M || { cards: [], groups: [], tiers: [], tx: [] };
    var M = { cards: [], groups: [], tiers: [], tx: base.tx };
    if (su.mode === 'new') {
      su.cards.forEach(function (d) { var x = draftToModel(d); M.cards.push(x.card); M.groups = M.groups.concat(x.groups); M.tiers = M.tiers.concat(x.tiers); });
      return M;
    }
    var d = su.cards[0], x = deleteId ? null : draftToModel(d), placed = false, keep = function (o) { return o.cardId !== d.id; };
    base.cards.forEach(function (c) { if (c.id === d.id) { if (x) { M.cards.push(x.card); placed = true; } } else M.cards.push(c); });
    if (x && !placed) M.cards.push(x.card);
    M.groups = base.groups.filter(keep).concat(x ? x.groups : []);
    M.tiers = (base.tiers || []).filter(keep).concat(x ? x.tiers : []);
    return M;
  }
  function saveSetup(deleting) {
    var su = S.setup;
    su.saveErr = null; su.needLogin = false;
    if (!deleting && !validateSetup('all')) { render(); scrollToError(); return; }
    var M = buildModel(deleting), id = su.cards[0].id;
    S.busy = true; render();
    var created = false;
    (S.sheetId ? Promise.resolve() : createSheet().then(function () { created = true; })).then(function () { return saveCards(M); }).then(function () {
      if (created) lsSet('hb.had', AUTH.email || '1');
      S.M = M; S.busy = false; S.lostSheet = false;
      if (su.mode === 'new') { S.screen = 'done'; }
      else { S.screen = 'app'; S.tab = 'cards'; S.detail = deleting ? null : id; S.setup = null; toast(deleting ? 'Đã xoá thẻ khỏi HammyBack.' : 'Đã lưu vào Google Sheet.'); }
      render();
    }, function (e) {
      S.busy = false;
      su.saveErr = e.code === 'auth' ? 'Phiên đăng nhập hết hạn. Bấm "Lưu vào Google Sheet" lần nữa để đăng nhập lại.'
        : e.code === 'unsure' ? 'Mạng chập chờn, chưa chắc đã lưu xong. Bấm lưu lại (lưu lại không bị trùng).'
        : 'Chưa lưu được. ' + (ERR[e.code] || ERR.bad).join('. ');
      render();
    });
  }
  var toastTimer = null;
  function toast(msg) { S.toast = msg; clearTimeout(toastTimer); toastTimer = setTimeout(function () { S.toast = null; if (S.screen === 'app') render(); }, 3500); }
  function renderDone() {
    var n = S.M ? S.M.cards.length : 0;
    return '<div class="scroll"><div class="state" style="margin-top:12px"><div class="hb-pop">' + hammyFull(150) + '</div><h2>Ghi vào hết rồi nè bạn ơi!</h2>' +
      '<div>Hammy đã lưu <b>' + n + ' thẻ</b> vào Google Sheet trong Drive của bạn. Từ giờ quẹt thẻ xong thì ghi vào app, Hammy tính tiền hoàn giùm.</div>' +
      '<button type="button" data-act="go-app">Vào app</button>' +
      '<button type="button" class="linkbtn" data-act="go-import">' + svgIcon('plus', 16) + ' Nhập giao dịch cũ của kỳ này</button>' +
      '<a class="linkbtn" target="_blank" rel="noopener noreferrer" href="' + esc(sheetUrl()) + '">' + svgIcon('sheet', 16) + ' Mở Google Sheet của bạn</a></div></div>';
  }

  /* ---------- tổng quan ---------- */
  function nextTierTxt(st) {
    var n = st.next; if (!n) return '';
    return 'Chi thêm ' + fmtM(n.need) + ' để ' + (n.group ? 'nhóm ' + disp(n.group) + ' lên ' + n.rate + '%' + (n.cap ? ' · cap ' + fmtM(n.cap) : '') : 'lên cap tổng ' + fmtM(n.cap));
  }
  function todoList() {
    var items = [], M = S.M;
    M.cards.forEach(function (c) {
      if (!c.dueDay) return;
      var due = E.nextDue(c.dueDay, TODAY), n = daysBetween(TODAY, due);
      if (n <= 7) items.push({ k: 'bell', bg: '#FFE1CC', fg: '#9A3412', t: '<b>' + esc(c.name) + '</b> đến hạn thanh toán <b>' + dd(due) + '</b> · ' + (n === 0 ? 'hôm nay' : 'còn ' + n + ' ngày') });
    });
    M.cards.forEach(function (c) {
      var st = E.cardStats(M, c, curPeriod(c));
      if (isFinite(st.cap) && st.capLeft <= 0 && st.n) items.push({ k: 'coin', bg: '#FFEBD9', fg: '#9A3412', t: '<b>' + esc(c.name) + '</b> đã đầy cap tổng ' + fmtM(st.cap) + ' kỳ này' + (st.next && !st.next.group ? '. ' + esc(nextTierTxt(st)) + '.' : ', chuyển sang thẻ khác nhé') });
      else if (!st.qual && st.n) items.push({ k: 'coin', bg: '#E3E8F2', fg: '#233A6B', t: '<b>' + esc(c.name) + '</b> cần chi thêm ' + fmtM(c.minSpend - st.spent) + ' để được hoàn theo nhóm' });
      else st.groups.forEach(function (x) { if (st.qual && x.spent > 0 && (x.near || x.full) && st.capLeft > 0) items.push({ k: 'coin', bg: '#FFF1C2', fg: '#7A5200', t: '<b>' + esc(short(c.name)) + '</b> · ' + esc(disp(x.g.name)) + (x.full ? ' đã đầy cap' : ' sắp đầy cap, còn ' + fmtM(x.left)) }); });
    });
    return items;
  }
  function renderDash() {
    var M = S.M, out = ['<div class="scroll">'];
    if (!S.month) {
      var todo = todoList(), row = function (x) { return '<div class="todo">' + icoKind(x.k, x.bg, x.fg, 30) + '<div>' + x.t + '</div></div>'; };
      if (!todo.length) out.push('<div class="todobox calm"><div class="todo">' + icoKind('check', '#E3F4E1', '#2F6B1F', 30) + '<div>Chưa có gì cần để ý. Hammy đang canh giúp bạn.</div></div></div>');
      else out.push('<div class="todobox"><button type="button" class="todohead" data-act="todo" aria-expanded="' + !!S.todoOpen + '"><span>Việc cần để ý <span class="count">' + todo.length + '</span></span><span class="more">' + (S.todoOpen ? 'Thu gọn' : (todo.length > 1 ? 'Xem hết' : '')) + svgIcon(S.todoOpen ? 'up' : 'down', 16) + '</span></button>' +
        (S.todoOpen ? todo : todo.slice(0, 1)).map(row).join('') + '</div>');
    }
    var stats = M.cards.map(function (c) { return E.cardStats(M, c, curPeriod(c)); });
    var tEst = stats.reduce(function (s, x) { return s + x.est; }, 0), tSpent = stats.reduce(function (s, x) { return s + x.spent; }, 0);
    out.push('<div class="card hero"><div><div class="lbl">Hoàn tiền dự kiến ' + (S.month ? kyLabel(S.month).toLowerCase() : 'kỳ này') + '</div><div class="big">' + fullVnd(tEst) + '</div><div class="lbl" style="margin-top:6px">Tổng chi ' + fullVnd(tSpent) + ' · ' + M.cards.length + ' thẻ</div></div>' + hammyFace(64) + '</div>');
    out.push('<div class="seg" role="group" aria-label="Cách xem"><button type="button" data-act="dv" data-v="card" aria-pressed="' + (S.dashView === 'card') + '">Theo thẻ</button><button type="button" data-act="dv" data-v="cat" aria-pressed="' + (S.dashView === 'cat') + '">Theo ngành hàng</button></div>');
    if (S.dashView === 'card') {
      out.push('<div class="list">');
      M.cards.forEach(function (c, ci) {
        var st = stats[ci], lim = isFinite(st.cap), full = lim && st.capLeft <= 0 && st.n > 0;
        var pct = lim && st.cap ? Math.min(100, Math.round(st.groupCb / st.cap * 100)) : 0;
        var close = E.nextClosing(c.closeDay, TODAY), isOpen = !!S.open[c.id], nt = S.month ? '' : nextTierTxt(st);
        var pill = full ? '<span class="pill full">Đầy cap tổng</span>' : !st.qual ? '<span class="pill off">Chưa đủ chi tối thiểu</span>' : '<span class="pill">Còn chỗ</span>';
        var rows = st.groups.map(function (x) {
          var right = !st.qual ? '<span class="bad">Chưa đủ chi tối thiểu</span>' : x.left > 0 ? '<span class="ok">' + (isFinite(x.left) ? 'còn chi ' + fmtM(x.rate > 0 ? x.left / (x.rate / 100) : 0) : 'không giới hạn') + '</span>' : '<span class="bad">' + (st.capLeft <= 0 ? 'Cap tổng đầy' : 'Đầy cap') + '</span>';
          return '<div class="grow"><div class="l">' + icoFor(x.g.cats[0] || 'Khác', 26) + '<span>' + esc(disp(x.g.name)) + ' <span class="muted">· ' + x.rate + '%</span></span></div>' + right + '</div>';
        }).join('');
        out.push('<div class="card cardbox"><div class="row"><div class="cardhead"><span class="mini" style="background:' + safeColor(c.color) + '"></span><span class="name">' + esc(c.name) + '</span></div>' + pill + '</div>' +
          '<div class="row" style="margin-top:12px;font-size:13px"><span>Hoàn <b>' + fmtM(st.est) + '</b>' + (lim ? ' / ' + fmtM(st.cap) : ' · cap không giới hạn') + '</span><span class="muted">' + (lim ? pct + '%' : '') + '</span></div>' +
          (lim ? '<div class="bar"><i class="' + (full ? 'full' : '') + '" style="width:' + pct + '%"></i></div>' : '') +
          '<div class="sub">' + esc(kyLabel(st.period)) + ' · Chi ' + fmtM(st.spent) + (S.month ? '' : ' · Chốt sổ ' + dd(close) + ' (còn ' + daysBetween(TODAY, close) + ' ngày)') + '</div>' +
          (nt ? '<div class="tiernext">' + svgIcon('up', 14) + '<span>' + esc(nt) + '</span></div>' : '') +
          (st.groups.length ? '<button type="button" class="toggle" data-act="tg" data-id="' + esc(c.id) + '" aria-expanded="' + isOpen + '"><b>' + st.groups.length + ' danh mục hoàn tiền</b><span>' + (isOpen ? 'Thu gọn' : 'Xem') + svgIcon(isOpen ? 'up' : 'down', 16) + '</span></button>' : '') +
          (isOpen ? '<div class="groups">' + rows + '</div>' : '') + '</div>');
      });
      out.push('</div>');
    } else {
      out.push('<div class="card" style="overflow:hidden"><div style="padding:12px 14px;font-size:12px;border-bottom:1px solid var(--line-2)" class="muted">Mua ngành này thì quẹt thẻ nào (còn cap, tỷ lệ cao nhất)</div>');
      allCats().filter(function (x) { return x !== 'Khác'; }).forEach(function (cat) {
        var any = false, opts = [];
        M.cards.forEach(function (c) { var l = E.lookup(M, c, cat, todayIso()); if (l.group) { any = true; if (l.left > 0) opts.push({ c: c, l: l }); } });
        opts.sort(function (a, b) { return b.l.rate - a.l.rate || (a.l.qual ? -1 : 1); });
        var right;
        if (opts.length) { var o = opts[0]; right = '<div style="color:var(--navy);font-weight:700">' + esc(short(o.c.name)) + ' · ' + pctTxt(o.l.rate) + '</div><div class="small muted">' + (!o.l.qual ? 'cần đủ chi tối thiểu' : isFinite(o.l.left) ? 'còn chi ' + fmtM(o.l.left / o.l.rate) : 'không giới hạn') + '</div>'; }
        else right = '<div class="bad">' + (any ? 'Hết cap' : 'Chưa có thẻ hoàn') + '</div><div class="small muted">' + (any ? 'không thẻ nào còn cap' : 'tính là giao dịch khác') + '</div>';
        out.push('<div class="catrow"><div style="display:flex;align-items:center;gap:10px">' + icoFor(cat) + '<b style="font-weight:600">' + esc(disp(cat)) + '</b></div><div style="text-align:right;flex-shrink:0">' + right + '</div></div>');
      });
      out.push('</div>');
    }
    var ann = M.cards.map(function (c) { return E.annual(M, c, TODAY); }).filter(Boolean);
    if (ann.length) {
      out.push('<div class="h2">' + icoKind('trophy', '#FFE9A8', '#7A5200', 30) + 'Miễn phí thường niên năm sau</div><div class="list" style="gap:10px">');
      ann.forEach(function (b) {
        var sub = b.needDate ? 'Nhập ngày kích hoạt thẻ (tab Thẻ → Sửa thẻ) để Hammy theo dõi mốc chi ' + fmtM(b.card.target) + '.'
          : 'Đã chi ' + fmtM(b.spent) + ' / ' + fmtM(b.target) + ' · ' + (b.missing > 0 ? 'còn thiếu ' + fmtM(b.missing) + ' · cần ~' + fmtM(b.perMonth) + '/tháng · còn ' + b.daysLeft + ' ngày' : 'đã đủ mốc 🎉') + ' (hết năm thẻ ' + dd(b.to) + '/' + b.to.getFullYear() + ')';
        out.push('<div class="card cardbox" style="padding:14px"><div class="row"><div class="cardhead"><span class="mini" style="width:30px;height:20px;background:' + safeColor(b.card.color) + '"></span><b style="font-weight:600">' + esc(b.card.name) + '</b></div><span class="small muted" style="font-weight:600">' + (b.needDate ? '—' : b.pct + '%') + '</span></div>' +
          (b.needDate ? '' : '<div class="bar" style="margin-top:10px"><i style="width:' + b.pct + '%"></i></div>') + '<div class="sub">' + esc(sub) + '</div></div>');
      });
      out.push('</div>');
    }
    out.push('<p class="small muted" style="margin:6px 0 0;text-align:center">Giao dịch trả góp không tính hoàn tiền và không tính vào chi tiêu.</p></div>');
    return out.join('');
  }

  /* ---------- thẻ ---------- */
  function renderCards() {
    var M = S.M;
    if (!S.detail || !byId(S.detail)) S.detail = M.cards[0] && M.cards[0].id;
    var c = byId(S.detail);
    var out = ['<div class="scroll"><div class="hscroll" style="padding-left:0;padding-right:0">'];
    M.cards.forEach(function (x) { out.push('<button type="button" class="cb" data-act="det" data-id="' + esc(x.id) + '" aria-pressed="' + (x.id === c.id) + '">' + esc(x.name) + '</button>'); });
    out.push('<button type="button" class="cb addchip" data-act="card-add">' + svgIcon('plus', 14) + ' Thêm thẻ</button></div>');
    var cardTiers = E.tiersOf(M, c.id, '');
    var rule = (c.cap ? fmtM(c.cap) : 'Không giới hạn') + cardTiers.map(function (t) { return '; tổng chi từ ' + fmtM(t.from) + ': ' + fmtM(t.cap || Infinity); }).join('');
    if (c.minSpend) rule += '. Cần chi từ ' + fmtM(c.minSpend) + '/kỳ mới được hoàn theo nhóm';
    out.push('<div class="cc" style="background:' + safeColor(c.color) + '"><div class="row" style="align-items:flex-start"><div style="min-width:0"><div style="font-size:12px;opacity:.85">' + esc(c.bank) + '</div><div style="font-weight:700;font-size:18px;overflow-wrap:anywhere">' + esc(c.type || c.name) + '</div></div><div style="font-size:11px;font-weight:600;letter-spacing:.06em;opacity:.85">CASHBACK</div></div>' +
      '<div style="display:flex;align-items:center;gap:14px"><div class="chip-gold" aria-hidden="true"></div><div><div style="font-size:11px;opacity:.8">Hạn mức</div><div style="font-size:22px;font-weight:700">' + (c.limit ? fmtM(c.limit) : 'Chưa nhập') + '</div></div></div>' +
      '<div class="grid3"><div><div class="k">Ngày sao kê</div><div class="v">Ngày ' + esc(c.closeDay) + '</div></div><div><div class="k">Ngày đến hạn</div><div class="v">' + (c.dueDay ? 'Ngày ' + esc(c.dueDay) : 'Chưa nhập') + '</div></div><div><div class="k">Kỳ hiện tại</div><div class="v">' + esc(kyLabel(E.periodOf(todayIso(), c.closeDay)).slice(3)) + '</div></div></div></div>');
    out.push('<button type="button" class="btn editbtn" data-act="card-edit" data-id="' + esc(c.id) + '">' + svgIcon('edit', 16) + ' Sửa thẻ & luật hoàn tiền</button>');
    out.push('<div style="display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.45">' + icoKind('coin', '#FFE9A8', '#7A5200', 28) + '<div><b>Cap tổng/kỳ:</b> ' + esc(rule) + (c.other ? ' · giao dịch khác ' + c.other + '%' : '') + '</div></div>');
    var groups = E.groupsOf(M, c.id);
    out.push('<div class="h2">Gói hoàn tiền</div>');
    if (!groups.length) out.push('<div class="note">Thẻ này chưa có nhóm hoàn tiền. Bấm "Sửa thẻ & luật hoàn tiền" để thêm.</div>');
    groups.forEach(function (g, j) {
      var gt = E.tiersOf(M, c.id, g.name);
      var items = g.cats.map(function (cat) { var m = MCC[cat]; return '<div class="it"><div style="font-size:13px;font-weight:600">' + esc(disp(cat)) + '</div>' + (m ? '<div class="small muted" style="margin-top:2px">MCC ' + esc(m[0]) + (m[1] ? ' · ' + esc(m[1]) : '') + '</div>' : '') + '</div>'; }).join('');
      var tiersHtml = gt.length ? '<div class="it small muted">' + [('Dưới ' + fmtM(gt[0].from) + ': ' + g.rate + '% · ' + (g.cap ? 'cap ' + fmtM(g.cap) : 'cap chung'))].concat(gt.map(function (t) { return 'Tổng chi từ ' + fmtM(t.from) + ': ' + t.rate + '% · ' + (t.cap ? 'cap ' + fmtM(t.cap) : 'cap chung'); })).map(esc).join('<br>') + '</div>' : '';
      out.push('<div class="card pk"><div class="hd row"><div class="cardhead">' + icoFor(g.cats[0] || 'Khác') + '<b style="font-weight:600">' + esc(disp(g.name)) + '</b></div><div style="display:flex;gap:6px;align-items:center;flex-shrink:0"><span class="rate">' + g.rate + '%</span><span class="small muted">' + (g.cap ? 'cap ' + fmtM(g.cap) : 'cap chung') + '</span>' +
        '<button type="button" class="linkbtn" style="padding:4px 0 4px 6px" data-act="card-edit" data-id="' + esc(c.id) + '" data-j="' + j + '">Sửa</button></div></div>' + tiersHtml + items + '</div>');
    });
    if (c.note) out.push('<div class="note"><b>Lưu ý:</b> ' + esc(c.note) + '</div>');
    out.push('<div class="settings card"><button type="button" data-act="go-import">' + svgIcon('plus', 18) + 'Nhập giao dịch cũ</button>' +
      '<a target="_blank" rel="noopener noreferrer" href="' + esc(sheetUrl()) + '">' + svgIcon('sheet', 18) + 'Mở Google Sheet của bạn</a>' +
      '<button type="button" data-act="logout">' + svgIcon('out', 18) + 'Đăng xuất<span class="em">' + esc(AUTH.email || '') + '</span></button></div>');
    out.push('<div class="small muted">MCC chỉ là ước tính. HammyBack không lưu số thẻ, ngày hết hạn hay CVV. <a href="privacy.html" target="_blank" rel="noopener">Quyền riêng tư</a></div></div>');
    return out.join('');
  }

  /* ---------- ghi giao dịch ---------- */
  function botMsg(t, text) {
    return '<div class="bot">' + hammyFace(34) + '<div class="bubble">' + (t ? '<div class="t">' + icoFor(t.cat, 28) + esc(t.title) + '</div>' : '') + '<div style="white-space:pre-line">' + esc(text) + '</div></div></div>';
  }
  function previewLines(card, e, amount) {
    var lines = [];
    if (e.group && !e.qualBefore && !e.qualAfter) lines.push(card.name + ' chưa đủ chi tối thiểu ' + fmtM(card.minSpend) + ' kỳ này (còn thiếu ' + fmtM(card.minSpend - e.after.spent) + '), tạm tính tỷ lệ giao dịch khác.');
    else if (!e.qualBefore && e.qualAfter) lines.push('Giao dịch này giúp ' + card.name + ' đạt chi tối thiểu, mở khoá hoàn theo nhóm.');
    else if (e.group && amount * e.rate > e.left + 0.5) lines.push('Tỷ lệ ' + pctTxt(e.rate) + ', nhưng ' + (e.before.capLeft <= 0 ? 'thẻ đã đầy cap tổng.' : 'nhóm ' + disp(e.group) + ' chỉ còn ' + fmtM(e.left) + ' cap.'));
    else if (!e.group) lines.push(e.rate > 0 ? 'Giao dịch khác, tỷ lệ ' + pctTxt(e.rate) + '.' : card.name + ' không hoàn ngành ' + disp(S.cat) + '.');
    else lines.push('Tỷ lệ ' + pctTxt(e.rate) + ' · nhóm ' + disp(e.group) + '.');
    if (e.before.next && e.after.spent >= e.before.next.from) lines.push('Giao dịch này giúp ' + card.name + ' lên bậc mới (tổng chi từ ' + fmtM(e.before.next.from) + '), cả kỳ được tính theo bậc mới.');
    else if (e.before.next && (e.before.capLeft <= 0 || (e.group && amount * e.rate > e.left + 0.5))) lines.push(nextTierTxt(e.before) + ' (tổng chi cả thẻ).');
    if (e.period !== E.periodOf(todayIso(), card.closeDay)) lines.push('Tính vào ' + kyLabel(e.period).toLowerCase() + '.');
    return lines;
  }
  function renderChat() {
    var M = S.M;
    var cats = allCats();
    if (cats.indexOf(S.cat) < 0) S.cat = 'Giao đồ ăn';
    if (!byId(S.cardId)) S.cardId = M.cards[0] && M.cards[0].id;
    var amount = parseInt(S.amount, 10) || 0, card = byId(S.cardId);
    var out = ['<div class="chatwrap"><div class="modebar"><div class="seg" role="group" aria-label="Chế độ"><button type="button" data-act="mode" data-v="tx" aria-pressed="' + (S.mode === 'tx') + '">Nhập giao dịch</button><button type="button" data-act="mode" data-v="hist" aria-pressed="' + (S.mode === 'hist') + '">Lịch sử</button></div></div>'];
    if (S.mode === 'hist') { out.push(renderHist() + '</div>'); return out.join(''); }
    out.push('<div class="msgs" id="msgs" aria-live="polite">');
    out.push(botMsg(null, 'Chọn ngành, chọn thẻ, gõ số tiền rồi bấm nút mũi tên. Hammy ghi vào Google Sheet của bạn và báo tiền hoàn.'));
    S.msgs.forEach(function (m) { out.push(m.who === 'me' ? '<div class="me">' + esc(m.text) + '</div>' : botMsg(m.title ? { cat: m.cat, title: m.title } : null, m.text)); });
    if (S.saving) out.push(botMsg(null, 'Hammy đang ghi vào Sheet…'));
    else if (amount > 0 && card && !S.month && E.isIso(S.date)) {
      var signed = S.refund ? -amount : amount, e = E.estimate(M, card, S.cat, signed, S.date), lines, title;
      if (S.refund) { title = 'Xem trước: hoàn đơn'; lines = ['Trừ ' + fmtM(amount) + ' khỏi chi tiêu ' + kyLabel(e.period).toLowerCase() + '.', e.cb < -0.5 ? 'Tiền hoàn dự kiến giảm ' + fmtM(-e.cb) + '.' : 'Tiền hoàn dự kiến không đổi.']; }
      else {
        title = 'Xem trước: hoàn ' + fmtM(e.cb); lines = previewLines(card, e, amount);
        var b = E.bestFor(M, S.cat, amount, S.date);
        if (b && b.card.id !== card.id && b.cb > e.cb + 0.5) lines.push('Gợi ý: quẹt ' + b.card.name + ' sẽ được ' + fmtM(b.cb) + ' (' + pctTxt(b.rate) + ').');
      }
      out.push('<div class="preview">' + botMsg({ cat: S.cat, title: title }, lines.join('\n')) + '</div>');
    }
    out.push('</div><div class="composer"><div class="grp"><div class="glab">Ngành hàng</div><div class="hscroll" role="group" aria-label="Ngành hàng">');
    cats.forEach(function (cat) { out.push('<button type="button" class="cb" data-act="cat" data-v="' + esc(cat) + '" aria-pressed="' + (cat === S.cat) + '">' + esc(disp(cat)) + '</button>'); });
    out.push('</div></div><div class="grp"><div class="glab">Thẻ</div><div class="hscroll" role="group" aria-label="Thẻ">');
    M.cards.forEach(function (c) {
      var l = E.lookup(M, c, S.cat, E.isIso(S.date) ? S.date : todayIso()), sub, full = false;
      if (l.group && !l.qual) sub = pctTxt(l.rate) + ' · chưa đủ chi t.thiểu';
      else if (l.group) { full = !(l.left > 0); sub = full ? pctTxt(l.rate) + ' · hết cap' : pctTxt(l.rate) + ' · còn ' + fmtM(l.left); }
      else sub = l.rate > 0 ? pctTxt(l.rate) : 'Không hoàn';
      out.push('<button type="button" class="cb cardc" data-act="card" data-v="' + esc(c.id) + '" aria-pressed="' + (c.id === S.cardId) + '"><span class="n">' + esc(short(c.name)) + '</span><span class="s' + (full ? ' full' : '') + '">' + esc(sub) + '</span></button>');
    });
    var can = amount > 0 && card && !S.saving && !S.month && !S.merchantErr && E.isIso(S.date) && S.date <= todayIso();
    var hint = S.merchantErr ? S.merchantErr : S.month ? 'Đang xem kỳ cũ. Bấm "Về kỳ này" ở đầu trang để ghi.' : '';
    out.push('</div></div><div class="sep"></div><div class="grp"><div class="crow"><input class="amt" id="amt" inputmode="numeric" autocomplete="off" aria-label="Số tiền (₫)" value="' + (amount ? amount.toLocaleString('en-US') : '') + '" placeholder="Số tiền (₫)">' +
      '<input class="dt" id="dt" type="date" aria-label="Ngày giao dịch" value="' + esc(S.date) + '" max="' + todayIso() + '">' +
      '<button type="button" class="send" data-act="submit" aria-label="' + (S.refund ? 'Ghi hoàn đơn vào Sheet' : 'Ghi giao dịch vào Sheet') + '"' + (can ? '' : ' disabled') + '><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></button></div>' +
      '<div class="crow"><input class="mer" id="mer" autocomplete="off" autocorrect="off" spellcheck="false" maxlength="' + LIMITS.merchant + '" aria-label="Merchant (tuỳ chọn)" value="' + esc(S.merchant) + '" placeholder="Merchant (tuỳ chọn)">' +
      '<button type="button" class="rfchip" data-act="refund" aria-pressed="' + S.refund + '">' + (S.refund ? '✓ Hoàn đơn' : 'Hoàn đơn') + '</button></div></div>' +
      (hint ? '<div class="hint' + (S.merchantErr ? ' err' : '') + '" role="' + (S.merchantErr ? 'alert' : 'status') + '">' + esc(hint) + '</div>' : '') + '</div></div>');
    return out.join('');
  }
  function renderHist() {
    var M = S.M, names = {}; M.cards.forEach(function (c) { names[c.id] = c.name; });
    var all = M.tx.filter(function (t) { return t.status !== 'Đã xoá'; });
    var list = all.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.created || '') < (a.created || '') ? -1 : 1; }).slice(0, 80);
    var out = ['<div class="scroll" style="gap:10px">'];
    out.push('<button type="button" class="addcard" data-act="go-import">' + svgIcon('plus', 18) + ' Nhập giao dịch cũ (dán từ AI)</button>');
    out.push('<div class="note" style="border-style:solid"><b>Trả góp:</b> khi chuyển một giao dịch sang trả góp, ngân hàng thường thu hồi tiền hoàn. Giao dịch trả góp không tính hoàn tiền và không tính vào chi tiêu, cap được trả lại cho nhóm.</div>');
    if (!list.length) out.push('<div class="state"><h2>Chưa có giao dịch</h2><div>Ghi giao dịch đầu tiên ở mục "Nhập giao dịch".</div></div>');
    list.forEach(function (t) {
      var a = S.histAct && S.histAct.id === t.id ? S.histAct.kind : null, nm = names[t.cardId] || (t.cardName ? t.cardName + ' (đã bỏ)' : '?');
      var tags = (t.inst > 0 ? '<span class="pill off">Trả góp ' + t.inst + ' kỳ</span>' : '') + (t.amount < 0 ? '<span class="pill">Hoàn đơn</span>' : '');
      var h = '<div class="card hrow"><div class="row"><div class="cardhead">' + icoFor(t.cat, 34) + '<div style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t.merchant || disp(t.cat)) + '</div><div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + ddIso(t.date) + ' · ' + esc(short(nm)) + ' · ' + esc(disp(t.cat)) + '</div></div></div>' +
        '<div style="text-align:right;flex-shrink:0"><div style="font-weight:700;font-variant-numeric:tabular-nums">' + (t.amount < 0 ? '−' : '') + fullVnd(Math.abs(t.amount)) + '</div><div style="display:flex;gap:4px;justify-content:flex-end;margin-top:2px">' + tags + '</div></div></div>';
      if (!a) h += '<div class="hacts"><button type="button" data-act="h-inst" data-id="' + esc(t.id) + '">' + (t.inst > 0 ? 'Sửa trả góp' : 'Chuyển trả góp') + '</button><button type="button" data-act="h-del" data-id="' + esc(t.id) + '">Xoá</button></div>';
      else if (a === 'inst') h += '<div class="hacts"><span class="small muted">Số kỳ:</span>' + [3, 6, 9, 12].map(function (n) { return '<button type="button" data-act="h-inst-set" data-id="' + esc(t.id) + '" data-v="' + n + '" aria-pressed="' + (t.inst === n) + '">' + n + '</button>'; }).join('') + (t.inst > 0 ? '<button type="button" data-act="h-inst-set" data-id="' + esc(t.id) + '" data-v="0">Huỷ trả góp</button>' : '') + '<button type="button" data-act="h-cancel">Thôi</button></div>';
      else h += '<div class="hacts"><span class="small" style="color:var(--warn);font-weight:600">Xoá giao dịch này?</span><button type="button" class="danger" data-act="h-del-ok" data-id="' + esc(t.id) + '">Xoá</button><button type="button" data-act="h-cancel">Thôi</button></div>';
      out.push(h + '</div>');
    });
    if (all.length > 80) out.push('<div class="small muted" style="text-align:center">Hiện 80 giao dịch mới nhất. Xem đủ trong Google Sheet.</div>');
    if (S.skipped) out.push('<div class="small muted" style="text-align:center">' + S.skipped + ' dòng trong Sheet có ngày hoặc mã thẻ không đọc được nên bị bỏ qua.</div>');
    out.push('</div>');
    return out.join('');
  }
  function scrollMsgs() { var m = $('msgs'); if (m) m.scrollTop = m.scrollHeight; }

  /* ---------- nhập giao dịch cũ (dán bảng do AI đọc sao kê trả về) ---------- */
  var IMPORT_MAX = 500;
  function importPrompt() {
    var cards = S.M.cards.map(function (c) { return c.name; }).join(', ');
    var cats = allCats().map(disp).join(', ');
    return 'Mình gửi kèm ảnh chụp/sao kê giao dịch thẻ tín dụng. Hãy liệt kê các giao dịch CHI TIÊU thành bảng, mỗi dòng một giao dịch, 5 cột cách nhau bằng dấu |, đúng thứ tự:\n' +
      'Ngày (dd/mm/yyyy) | Thẻ | Ngành hàng | Tên cửa hàng | Số tiền\n\n' +
      'Quy tắc:\n' +
      '- Ngày: ngày giao dịch (không phải ngày hạch toán).\n' +
      '- Thẻ: ghi đúng một trong các tên sau: ' + cards + '. Mình sẽ nói ảnh nào là thẻ nào.\n' +
      '- Ngành hàng: chọn đúng một trong: ' + cats + '. Không chắc thì ghi Khác.\n' +
      '- Số tiền: số nguyên, không dấu chấm, không dấu phẩy, không chữ "đ". Giao dịch hoàn đơn/hoàn tiền về thẻ ghi số âm.\n' +
      '- Bỏ qua: phí, lãi, thanh toán dư nợ thẻ, tiền hoàn cashback, giao dịch đã chuyển trả góp.\n' +
      '- KHÔNG ghi số thẻ, tên chủ thẻ, số điện thoại hay mã giao dịch.\n' +
      '- Chỉ trả về các dòng dữ liệu trong một khối code, không dòng tiêu đề, không giải thích.\n\n' +
      'Ví dụ: 05/11/2026 | ' + (S.M.cards[0] ? S.M.cards[0].name : 'Shinhan Supreme') + ' | Thương mại điện tử | Shopee | 450000';
  }
  function parseImpDate(s) {
    s = String(s || '').trim(); var m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s), y;
    if (m) { y = +m[3]; if (y < 100) y += 2000; var iso = y + '-' + pad(+m[2]) + '-' + pad(+m[1]); return E.isIso(iso) && +m[2] <= 12 && +m[1] <= 31 ? iso : ''; }
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s); return m ? m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]) : '';
  }
  function matchCard(s) {
    var f = fold(s); if (!f) return null;
    var exact = S.M.cards.filter(function (c) { return fold(c.name) === f || fold(c.type) === f || fold(c.bank) === f && S.M.cards.filter(function (x) { return fold(x.bank) === f; }).length === 1; });
    if (exact.length === 1) return exact[0];
    var part = S.M.cards.filter(function (c) { return fold(c.name).indexOf(f) >= 0 || f.indexOf(fold(c.name)) >= 0; });
    return part.length === 1 ? part[0] : null;
  }
  function matchCat(s) { var f = fold(s), cats = allCats(); for (var i = 0; i < cats.length; i++) if (fold(cats[i]) === f || fold(disp(cats[i])) === f) return cats[i]; return null; }
  function parseImport(text) {
    var rows = [], lines = String(text || '').split(/\r?\n/);
    for (var n = 0; n < lines.length && rows.length < IMPORT_MAX; n++) {
      var raw = lines[n].trim();
      if (!raw || /^```/.test(raw) || /^[-:|\s]+$/.test(raw)) continue;
      raw = raw.replace(/^\|/, '').replace(/\|$/, '');
      var p = raw.split(/\s*\|\s*|\t|\s*;\s*/).map(function (x) { return x.trim(); });
      if (p.length >= 5 && !parseImpDate(p[0]) && /^ngay/.test(fold(p[0]))) continue; // dòng tiêu đề
      var r = { line: n + 1, raw: lines[n].trim().slice(0, 120), err: null, dup: false, include: false };
      if (p.length < 5) { r.err = 'Thiếu cột (cần 5 cột cách nhau dấu |).'; rows.push(r); continue; }
      r.date = parseImpDate(p[0]);
      r.card = matchCard(p[1]);
      r.cat = matchCat(p[2]) || 'Khác'; r.catGuess = !matchCat(p[2]);
      r.merchant = p.slice(3, p.length - 1).join(' ').slice(0, LIMITS.merchant);
      r.amount = Math.round(num(p[p.length - 1]));
      var sens = E.sensitive(raw);
      if (sens) r.err = 'Dòng này có dãy số giống số thẻ/CVV, không nhập.';
      else if (!r.date) r.err = 'Ngày không đọc được (cần dd/mm/yyyy).';
      else if (r.date > todayIso()) r.err = 'Ngày ở tương lai.';
      else if (!r.card) r.err = 'Không nhận ra thẻ "' + p[1] + '".';
      else if (!r.amount || Math.abs(r.amount) > 1e11) r.err = 'Số tiền không hợp lệ.';
      if (!r.err) {
        r.dup = S.M.tx.some(function (t) { return t.status !== 'Đã xoá' && t.date === r.date && t.cardId === r.card.id && t.amount === r.amount; });
        r.include = !r.dup;
      }
      rows.push(r);
    }
    return rows;
  }
  function renderImport() {
    var I = S.imp, out = ['<div class="scroll">'];
    out.push('<div class="setuphead">' + hammyFace(52) + '<div><div class="h2" style="margin:0">Nhập giao dịch cũ</div><div class="small muted" style="margin-top:2px">Nhờ AI đọc sao kê, rồi dán kết quả vào đây.</div></div></div>');
    if (I.done) {
      out.push('<div class="state" style="margin:8px auto"><div class="hb-pop">' + hammyFull(120) + '</div><h2>Ghi vào hết rồi nè bạn ơi!</h2><div>Hammy đã ghi <b>' + I.done + ' giao dịch</b> vào Google Sheet của bạn.</div>' +
        '<button type="button" data-act="imp-hist">Xem lịch sử</button><button type="button" class="linkbtn" data-act="imp-again">Nhập thêm</button></div></div>');
      return out.join('');
    }
    out.push('<div class="setupcard"><div class="steprow"><span class="stepn">1</span><div><b>Copy prompt mẫu</b><div class="small muted">Prompt đã có sẵn tên thẻ và ngành hàng của bạn.</div></div></div>' +
      '<button type="button" class="btn" style="margin:0" data-act="imp-copy">' + svgIcon(I.copied ? 'check' : 'edit', 16) + (I.copied ? 'Đã copy' : 'Copy prompt') + '</button>' +
      '<details class="small"><summary>Xem nội dung prompt</summary><textarea class="prompt" id="impPrompt" readonly>' + esc(importPrompt()) + '</textarea></details></div>');
    out.push('<div class="setupcard"><div class="steprow"><span class="stepn">2</span><div><b>Gửi prompt + ảnh sao kê cho AI</b><div class="small muted">ChatGPT, Gemini, Claude… đều được. Chỉ cần giao dịch của kỳ này (thêm từ ngày kỷ niệm thẻ nếu muốn theo dõi miễn phí năm).</div></div></div>' +
      '<div class="pii">' + svgIcon('lock', 16) + '<div><b>Che số thẻ, tên chủ thẻ trước khi gửi ảnh.</b> Chỉ cần ngày, tên cửa hàng, số tiền.</div></div></div>');
    out.push('<div class="setupcard"><div class="steprow"><span class="stepn">3</span><div><b>Dán kết quả AI trả về</b><div class="small muted">Mỗi dòng: Ngày | Thẻ | Ngành hàng | Cửa hàng | Số tiền</div></div></div>' +
      '<label class="fld" for="imp"><span class="sr">Kết quả từ AI</span><textarea id="imp" class="paste" data-imp="1" spellcheck="false" placeholder="05/11/2026 | Shinhan Supreme | Thương mại điện tử | Shopee | 450000">' + esc(I.text) + '</textarea></label>' +
      '<button type="button" class="btn" style="margin:0" data-act="imp-parse">Xem trước</button></div>');
    if (I.rows) {
      var ok = I.rows.filter(function (r) { return r.include; }), errs = I.rows.filter(function (r) { return r.err; }), dups = I.rows.filter(function (r) { return r.dup; });
      out.push('<div class="h2">Xem trước</div><div class="small muted" style="margin-top:-8px">' + ok.length + ' dòng sẽ ghi' + (dups.length ? ' · ' + dups.length + ' dòng có thể trùng' : '') + (errs.length ? ' · ' + errs.length + ' dòng lỗi (bỏ qua)' : '') + '</div>');
      out.push('<div class="card" style="overflow:hidden">' + (I.rows.length ? I.rows.map(function (r, k) {
        if (r.err) return '<div class="improw bad"><div><div class="small" style="font-weight:600">Dòng ' + r.line + ': ' + esc(r.err) + '</div><div class="small muted mono">' + esc(r.raw) + '</div></div></div>';
        return '<div class="improw' + (r.include ? '' : ' off') + '"><div style="min-width:0"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.merchant || disp(r.cat)) + '</div>' +
          '<div class="small muted">' + ddIso(r.date) + '/' + r.date.slice(0, 4) + ' · ' + esc(short(r.card.name)) + ' · ' + esc(disp(r.cat)) + (r.catGuess ? ' (chưa rõ ngành)' : '') + '</div>' +
          (r.dup ? '<div class="small" style="color:var(--warn)">Đã có giao dịch giống hệt (cùng ngày, thẻ, số tiền)</div>' : '') + '</div>' +
          '<div style="text-align:right;flex-shrink:0"><div style="font-weight:700">' + (r.amount < 0 ? '−' : '') + fullVnd(Math.abs(r.amount)) + '</div>' +
          (r.dup ? '<button type="button" class="linkbtn" style="padding:2px 0" data-act="imp-toggle" data-n="' + k + '">' + (r.include ? 'Bỏ qua' : 'Vẫn ghi') + '</button>' : '') + '</div></div>';
      }).join('') : '<div class="improw"><div class="small muted">Chưa có dòng nào. Dán kết quả của AI vào ô ở trên.</div></div>') + '</div>');
      if (I.err) out.push('<div class="err" role="alert">' + esc(I.err) + '</div>');
      out.push('<button type="button" class="primary" data-act="imp-save"' + (!ok.length || I.busy ? ' disabled' : '') + '>' + (I.busy ? 'Đang ghi…' : 'Ghi ' + ok.length + ' giao dịch vào Google Sheet') + '</button>');
    }
    out.push('<button type="button" class="linkbtn" style="align-self:center" data-act="imp-back">Quay lại</button></div>');
    return out.join('');
  }
  function saveImport() {
    var I = S.imp, rows = (I.rows || []).filter(function (r) { return r.include; });
    if (!rows.length || I.busy) return;
    var now = new Date().toISOString();
    var txs = rows.map(function (r) { return { id: uid('t'), date: r.date, cardId: r.card.id, cat: r.cat, merchant: r.merchant, amount: r.amount, inst: 0, status: '', created: now }; });
    I.busy = true; I.err = null; render();
    appendRows(txs.map(function (t) { return txRow(t, byId(t.cardId).name); })).then(function () {
      S.M.tx = S.M.tx.concat(txs); I.busy = false; I.done = txs.length; I.rows = null; I.text = ''; render();
    }, function (e) {
      I.busy = false;
      I.err = e.code === 'unsure' || e.code === 'offline' ? 'Mạng chập chờn, chưa chắc đã ghi. Quay lại tab Ghi giao dịch → Lịch sử, bấm nút làm mới để kiểm tra trước khi ghi lại.'
        : e.code === 'auth' ? 'Phiên đăng nhập hết hạn. Bấm ghi lần nữa để đăng nhập lại.' : 'Chưa ghi được. ' + (ERR[e.code] || ERR.bad).join('. ');
      render();
    });
  }

  /* ---------------- hành động ---------------- */
  function submitTx() {
    var M = S.M, amount = parseInt(S.amount, 10) || 0, card = byId(S.cardId);
    if (!M || S.saving || !amount || S.month || !card) return;
    var merchant = String(S.merchant || '').trim().slice(0, LIMITS.merchant);
    var sens = E.sensitive(merchant); if (sens) { S.merchantErr = E.SENSITIVE_MSG[sens]; render(); return; }
    if (!E.isIso(S.date) || S.date > todayIso()) return;
    if (amount > 1e11) { S.merchantErr = 'Số tiền quá lớn.'; render(); return; }
    var cat = S.cat, signed = S.refund ? -amount : amount, date = S.date;
    var pre = E.estimate(M, card, cat, signed, date), best = signed > 0 ? E.bestFor(M, cat, amount, date) : null;
    var t = { id: uid('t'), date: date, cardId: card.id, cat: cat, merchant: merchant, amount: signed, inst: 0, status: '', created: new Date().toISOString() };
    S.msgs.push({ who: 'me', text: (merchant || disp(cat)) + ' · ' + short(card.name) + ' · ' + (signed < 0 ? '−' : '') + fmtM(amount) + ' · ' + ddIso(date) });
    S.saving = true; render();
    appendTx(t, card.name).then(function () {
      M.tx.push(t);
      var lines = ['Đã ghi vào Google Sheet · ' + kyLabel(pre.period).toLowerCase() + '.'], title;
      if (signed < 0) { title = 'Đã ghi hoàn đơn'; lines.push(pre.cb < -0.5 ? 'Tiền hoàn dự kiến giảm ' + fmtM(-pre.cb) + '.' : 'Tiền hoàn dự kiến không đổi.'); }
      else {
        title = 'Hoàn ' + fmtM(pre.cb);
        var after = E.lookup(M, card, cat, date), st = after.stats;
        if (!pre.qualBefore && pre.qualAfter) lines.push('Đã đạt chi tối thiểu, mở khoá hoàn theo nhóm.');
        if (pre.before.next && pre.after.spent >= pre.before.next.from) lines.push('Đã lên bậc mới (tổng chi từ ' + fmtM(pre.before.next.from) + ').');
        if (after.group && st.qual) lines.push(after.left > 0 ? 'Nhóm ' + disp(after.group) + ' còn ' + fmtM(after.left) + ' cap.' : st.capLeft <= 0 ? card.name + ' đã đầy cap tổng kỳ này.' : 'Nhóm ' + disp(after.group) + ' đã hết cap kỳ này.');
        if (!st.qual && card.minSpend) lines.push('Cần chi thêm ' + fmtM(card.minSpend - st.spent) + ' kỳ này để được hoàn theo nhóm.');
        else if (st.next && (st.capLeft <= 0 || (after.group && !(after.left > 0)))) lines.push(nextTierTxt(st) + '.');
        if (best && best.card.id !== card.id && best.cb > pre.cb + 0.5) lines.push('Lần sau: quẹt ' + best.card.name + ' sẽ được ' + fmtM(best.cb) + ' (' + pctTxt(best.rate) + ').');
      }
      S.msgs.push({ who: 'bot', cat: cat, title: title, text: lines.join('\n') });
      S.amount = ''; S.merchant = ''; S.refund = false;
    }, function (e) {
      var msg = e.code === 'unsure' || (e.code === 'offline' && navigator.onLine !== false)
        ? 'Chưa chắc giao dịch đã được ghi (mạng chập chờn). Bấm nút làm mới ở đầu trang rồi xem "Lịch sử" trước khi ghi lại, để khỏi bị trùng.'
        : e.code === 'auth' ? 'Chưa ghi được: phiên đăng nhập hết hạn. Bấm Đăng nhập lại ở trên rồi ghi lại.'
        : 'Chưa ghi được. ' + (ERR[e.code] || ERR.bad).join('. ');
      if (e.code === 'auth') S.banner = { code: 'auth' };
      S.msgs.push({ who: 'bot', text: msg });
    }).then(function () { S.saving = false; render(); });
  }
  function setTx(id, patch) {
    var t = S.M.tx.filter(function (x) { return x.id === id; })[0]; if (!t) return;
    var old = { inst: t.inst, status: t.status };
    Object.assign(t, patch); S.histAct = null; render();
    updateTx(t).catch(function (e) {
      Object.assign(t, old);
      S.banner = { code: e.code };
      render();
    });
  }

  var PATHKEY = { g: 'groups', t: 'tiers' };
  function pathGet(path) {
    var p = path.split('.'), o = S.setup.cards[+p[0]];
    for (var n = 1; n < p.length; n++) o = o[PATHKEY[p[n]] || (isNaN(p[n]) ? p[n] : +p[n])];
    return o;
  }
  function addCustomCat(i, j) {
    var su = S.setup, d = su.cards[i], g = d.groups[j], name = String((d.newCat || {})[j] || '').trim().replace(/\s+/g, ' '), msg = null;
    var builtin = CATS.filter(function (x) { return fold(x) === fold(name) || fold(disp(x)) === fold(name); })[0];
    var known = builtin || allCustomCats(su.cards).filter(function (x) { return fold(x) === fold(name); })[0];
    if (!name) msg = 'Gõ tên ngành trước khi bấm Thêm.';
    else if (E.sensitive(name)) msg = E.SENSITIVE_MSG[E.sensitive(name)];
    else if (/[,|;]/.test(name)) msg = 'Tên ngành không dùng dấu phẩy, | hoặc ;.';
    else if (name.length > LIMITS.cat) msg = 'Tên ngành tối đa ' + LIMITS.cat + ' ký tự.';
    su.catErr = msg ? { i: i, j: j, msg: msg } : null;
    if (msg) return;
    var cat = known || name;
    if (g.cats.indexOf(cat) < 0) g.cats.push(cat);
    d.newCat[j] = ''; d.rulesDirty = true;
  }
  function copyPrompt() {
    var txt = importPrompt(), done = function () { S.imp.copied = true; render(); };
    var fallback = function () { var det = document.querySelector('details'); if (det) det.open = true; var ta = $('impPrompt'); if (ta) { ta.focus(); ta.select(); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
  }

  /* ---------------- sự kiện ---------------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-tab],[data-act]'); if (!t) return;
    if (t.hasAttribute('data-tab')) { if (S.screen !== 'app') return; S.tab = t.getAttribute('data-tab'); S.monthOpen = false; lsSet('hb.tab', S.tab); render(); return; }
    var act = t.getAttribute('data-act'), v = t.getAttribute('data-v'), i = +t.getAttribute('data-i'), j = +t.getAttribute('data-j'), su = S.setup;
    switch (act) {
      case 'login': if (S.screen === 'error') S.screen = 'login'; login(false); return;
      case 'login-other': login(true); return;
      case 'relogin': login(false); return;
      case 'logout': logout(); return;
      case 'reload': withToken(loadData); return;
      case 'su-add': su.cards.push(blankDraft(su.cards.length)); su.errors = {}; break;
      case 'su-remove': su.cards.splice(i, 1); su.errors = {}; break;
      case 'su-next':
        if (!validateSetup('info')) { render(); scrollToError(); return; }
        su.cards.forEach(function (c, n) { syncPreset(c); c.open = n === 0; }); su.step = 2; lastView = ''; break;
      case 'su-back': su.step = 1; su.errors = {}; su.saveErr = null; lastView = ''; break;
      case 'su-open': su.cards[i].open = !su.cards[i].open; break;
      case 'su-fill': var pf = presetFor(su.cards[i].bank, su.cards[i].type); if (pf) applyPreset(su.cards[i], pf); break;
      case 'su-cancel': S.setup = null; S.screen = 'app'; break;
      case 'su-color': su.cards[i].color = v; break;
      case 'su-save': if (validateSetup('all')) withToken(function () { saveSetup(); }); else { render(); scrollToError(); } return;
      case 'card-add': openSetup('add'); return;
      case 'card-edit': var gj = t.getAttribute('data-j'); openSetup('edit', t.getAttribute('data-id'), gj == null ? null : +gj); return;
      case 'card-del': su.confirmDel = true; break;
      case 'card-del-no': su.confirmDel = false; break;
      case 'card-del-ok': withToken(function () { saveSetup(true); }); return;
      case 'g-add': su.cards[i].groups.push({ name: '', rate: '', cap: '', cats: [], tiers: [] }); su.cards[i].rulesDirty = true; break;
      case 'g-remove': su.cards[i].groups.splice(j, 1); su.cards[i].rulesDirty = true; su.errors = {}; break;
      case 'g-cat': var cs = su.cards[i].groups[j].cats, k2 = cs.indexOf(v); if (k2 >= 0) cs.splice(k2, 1); else cs.push(v); su.cards[i].rulesDirty = true; break;
      case 'g-newcat': addCustomCat(i, j); break;
      case 't-add': var tp = t.getAttribute('data-path'), arr = pathGet(tp); arr.push(/\.g\./.test(tp) ? { from: '', rate: '', cap: '' } : { from: '', cap: '' }); su.cards[+tp.split('.')[0]].rulesDirty = true; break;
      case 't-remove': var rp = t.getAttribute('data-path').split('.'), rk = +rp.pop(); pathGet(rp.join('.')).splice(rk, 1); su.cards[+rp[0]].rulesDirty = true; su.errors = {}; break;
      case 'todo': S.todoOpen = !S.todoOpen; break;
      case 'go-import': S.setup = null; S.imp = { text: '', rows: null }; S.screen = 'import'; S.monthOpen = false; lastView = ''; break;
      case 'imp-back': S.imp = null; S.screen = 'app'; break;
      case 'imp-again': S.imp = { text: '', rows: null }; break;
      case 'imp-hist': S.imp = null; S.screen = 'app'; S.tab = 'chat'; S.mode = 'hist'; break;
      case 'imp-parse': S.imp.rows = parseImport(S.imp.text); S.imp.err = null; break;
      case 'imp-toggle': var ir = S.imp.rows[+t.getAttribute('data-n')]; ir.include = !ir.include; break;
      case 'imp-save': withToken(saveImport); return;
      case 'imp-copy': copyPrompt(); return;
      case 'go-app': S.setup = null; S.screen = 'app'; S.tab = 'chat'; S.mode = 'tx'; break;
      case 'ky': S.month = v || null; S.monthOpen = false; break;
      case 'dv': S.dashView = v; break;
      case 'tg': var cid = t.getAttribute('data-id'); S.open[cid] = !S.open[cid]; break;
      case 'det': S.detail = t.getAttribute('data-id'); break;
      case 'mode': S.mode = v; S.histAct = null; break;
      case 'cat': S.cat = v; break;
      case 'card': S.cardId = v; break;
      case 'refund': S.refund = !S.refund; break;
      case 'submit': withToken(submitTx); return;
      case 'h-inst': S.histAct = { id: t.getAttribute('data-id'), kind: 'inst' }; break;
      case 'h-del': S.histAct = { id: t.getAttribute('data-id'), kind: 'del' }; break;
      case 'h-cancel': S.histAct = null; break;
      case 'h-inst-set': var tid = t.getAttribute('data-id'); withToken(function () { setTx(tid, { inst: +v }); }); return;
      case 'h-del-ok': var did = t.getAttribute('data-id'); withToken(function () { setTx(did, { status: 'Đã xoá' }); }); return;
      default: return;
    }
    render();
  });
  var typing = null;
  document.addEventListener('input', function (ev) {
    var el = ev.target;
    if (el.id === 'amt') {
      var d = el.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12); S.amount = d; el.value = d ? (+d).toLocaleString('en-US') : '';
      clearTimeout(typing); typing = setTimeout(function () { keepFocus('amt'); }, 350); return;
    }
    if (el.id === 'mer') {
      S.merchant = el.value; var s = E.sensitive(el.value), was = S.merchantErr; S.merchantErr = s ? E.SENSITIVE_MSG[s] : null;
      if (!!was !== !!S.merchantErr) { clearTimeout(typing); typing = setTimeout(function () { keepFocus('mer'); }, 250); }
      return;
    }
    if (el.id === 'dt') { if (el.value) { S.date = el.value; clearTimeout(typing); typing = setTimeout(function () { keepFocus('dt'); }, 300); } return; }
    if (el.hasAttribute('data-imp')) { if (S.imp) S.imp.text = el.value; return; }
    if (!S.setup) return;
    if (el.hasAttribute('data-money')) { var dg = el.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13); el.value = dg ? (+dg).toLocaleString('en-US') : ''; }
    var val = el.hasAttribute('data-money') ? el.value.replace(/\D/g, '') : el.value;
    if (el.hasAttribute('data-newcat')) { var nc = el.getAttribute('data-newcat').split('.'); S.setup.cards[+nc[0]].newCat[+nc[1]] = val; return; }
    if (el.hasAttribute('data-path')) { var pp = el.getAttribute('data-path').split('.'), key = pp.pop(); pathGet(pp.join('.'))[key] = val; S.setup.cards[+pp[0]].rulesDirty = true; return; }
    if (el.hasAttribute('data-su')) {
      var ci = +el.getAttribute('data-su'), f = el.getAttribute('data-f'), d = S.setup.cards[ci];
      d[f] = val;
      if (['cap', 'minSpend', 'other', 'target', 'note'].indexOf(f) >= 0) d.rulesDirty = true;
      if (f === 'bank' || f === 'type') {
        var cn = $('cn-' + ci); if (cn) cn.textContent = cardName(d) || 'Thẻ ' + (ci + 1);
        var ph = $('ph-' + ci); if (ph) ph.innerHTML = presetHint(d, ci);
        var dl = $('dl-type-' + ci); if (dl && f === 'bank') dl.innerHTML = typesFor(d.bank).map(function (x) { return '<option value="' + esc(x) + '">'; }).join('');
      }
    }
  });
  function keepFocus(id) {
    var hs = document.querySelectorAll('.hscroll'), sx = Array.prototype.map.call(hs, function (h) { return h.scrollLeft; });
    render();
    var n = $(id); if (n) { n.focus(); try { if (n.type === 'text') n.setSelectionRange(n.value.length, n.value.length); } catch (e) {} }
    Array.prototype.forEach.call(document.querySelectorAll('.hscroll'), function (h, k) { if (sx[k] != null) h.scrollLeft = sx[k]; });
  }
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && S.monthOpen) { S.monthOpen = false; render(); }
    if (ev.key === 'Enter' && (ev.target.id === 'amt' || ev.target.id === 'mer') && !ev.isComposing) { ev.preventDefault(); withToken(submitTx); }
  });
  $('refresh').addEventListener('click', function () { withToken(loadData); });
  $('kyBtn').addEventListener('click', function () { if (!S.M) return; S.monthOpen = !S.monthOpen; render(); });
  $('kyReset').addEventListener('click', function () { S.month = null; S.monthOpen = false; render(); });
  $('hideBtn').addEventListener('click', function () { S.hide = !S.hide; lsSet('hb.hide', S.hide ? '1' : null); render(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || MOCK || S.screen !== 'app' || tokenValid()) return;
    if (authMode() === 'redirect' && !S.amount && !S.merchant && !S.saving) { ssSet('hb.auto', null); startRedirect(true); }
  });

  /* ---------------- intro ---------------- */
  var t1, t2;
  function intro() {
    var sp = $('splash'); clearTimeout(t1); clearTimeout(t2);
    $('splashHammy').innerHTML = hammyFull(176); sp.hidden = false; sp.classList.remove('fade');
    Array.prototype.forEach.call(sp.querySelectorAll('.hb-pop,.hb-rise,.hb-coin'), function (el) { el.style.animationName = 'none'; void el.offsetWidth; el.style.animationName = ''; });
    t1 = setTimeout(function () { sp.classList.add('fade'); }, 2600); t2 = setTimeout(function () { sp.hidden = true; }, 3100);
  }
  $('splash').addEventListener('click', function () { clearTimeout(t1); clearTimeout(t2); $('splash').classList.add('fade'); t2 = setTimeout(function () { $('splash').hidden = true; }, 450); });
  $('logo').innerHTML = hammyFace(32); $('logo').addEventListener('click', intro);

  /* ---------------- khởi động ---------------- */
  function boot() {
    if (MOCK) { loadData(); return; }
    if (!clientReady()) { showError({ code: 'config' }); return; }
    var red = readRedirect();
    if (red && red.ok) { loadData(); return; }
    if (red && red.error) {
      var silentFail = /interaction_required|login_required|consent_required|account_selection_required/.test(red.error);
      if (!silentFail) onAuthFail(red.error); else { S.screen = 'login'; render(); }
      return;
    }
    if (authMode() === 'redirect' && AUTH.email && !ssGet('hb.auto')) { ssSet('hb.auto', String(Date.now())); startRedirect(true); return; }
    S.screen = 'login';
    if (authMode() === 'popup') loadGis().catch(function () { S.loginMsg = 'Không tải được đăng nhập Google. Kiểm tra mạng rồi tải lại trang.'; render(); });
    render();
  }
  function start() {
    render(); intro();
    if (MOCK) {
      var s = document.createElement('script'); s.src = 'mock.js';
      s.onload = function () { AUTH.email = window.HAMMY_MOCK.email; boot(); };
      document.head.appendChild(s);
    } else boot();
    if ('serviceWorker' in navigator && !MOCK && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  start();
})();
