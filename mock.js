/* Chế độ thử (?mock=1): giả lập Google Drive/Sheets API ngay trong trình duyệt.
   Chỉ được nạp khi URL có ?mock=1. Không kết nối mạng, dữ liệu mất khi tải lại trang.
   ?mock=1&seed=1  → có sẵn sổ mẫu (dữ liệu bịa) để xem giao diện. */
(function () {
  'use strict';
  var DB = { files: {} };
  var seq = 0;
  function colIdx(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n - 1; }
  function parseRange(a1) {
    var m = /^'?(.+?)'?!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/.exec(a1);
    if (!m) return null;
    return { sheet: m[1].replace(/''/g, "'"), c1: colIdx(m[2]), r1: m[3] ? +m[3] - 1 : 0, c2: m[4] ? colIdx(m[4]) : colIdx(m[2]), r2: m[5] ? +m[5] - 1 : (m[4] ? Infinity : (m[3] ? +m[3] - 1 : Infinity)) };
  }
  function empty(v) { return v === undefined || v === null || v === ''; }
  function readRange(f, r) {
    var t = f.sheets[r.sheet]; if (!t) return null;
    var out = [];
    for (var i = r.r1; i <= Math.min(r.r2, t.length - 1); i++) {
      var row = (t[i] || []).slice(r.c1, r.c2 + 1).map(function (v) { return v === undefined ? '' : v; });
      while (row.length && empty(row[row.length - 1])) row.pop();
      out.push(row);
    }
    while (out.length && !out[out.length - 1].length) out.pop();
    return out;
  }
  function write(f, r, values) {
    var t = f.sheets[r.sheet]; if (!t) return false;
    values.forEach(function (row, i) { var tr = t[r.r1 + i] = t[r.r1 + i] || []; row.forEach(function (v, j) { tr[r.c1 + j] = v; }); });
    return true;
  }
  function clear(f, r) {
    var t = f.sheets[r.sheet]; if (!t) return false;
    for (var i = r.r1; i <= Math.min(r.r2, t.length - 1); i++) if (t[i]) for (var j = r.c1; j <= r.c2; j++) t[i][j] = undefined;
    return true;
  }
  function lastRow(t) { for (var i = t.length - 1; i >= 0; i--) if (t[i] && t[i].some(function (v) { return !empty(v); })) return i; return -1; }
  function resp(status, body) {
    var txt = JSON.stringify(body || {});
    return { ok: status >= 200 && status < 300, status: status, text: function () { return Promise.resolve(txt); } };
  }
  function badRange(a1) { return resp(400, { error: { code: 400, message: 'Unable to parse range: ' + a1, status: 'INVALID_ARGUMENT' } }); }
  function newFile(title) { var id = 'mock-' + (++seq) + '-sheet'; DB.files[id] = { id: id, title: title, props: {}, sheets: {} }; return DB.files[id]; }

  function handle(url, init) {
    var u = new URL(url), method = (init && init.method) || 'GET', body = init && init.body && typeof init.body === 'string' && init.body.charAt(0) === '{' ? JSON.parse(init.body) : null;
    var path = decodeURIComponent(u.pathname);
    if (u.hostname === 'oauth2.googleapis.com') return resp(200, {});
    if (/oauth2\/v3\/userinfo/.test(path)) return resp(200, { email: M.email });
    if (u.hostname === 'www.googleapis.com' && /^\/drive\/v3\/files$/.test(path)) {
      var files = Object.keys(DB.files).map(function (k) { return DB.files[k]; }).filter(function (f) { return f.props.hammyback === '1' && !f.trashed; });
      return resp(200, { files: files.map(function (f) { return { id: f.id }; }) });
    }
    var dm = /^\/drive\/v3\/files\/(.+)$/.exec(path);
    if (dm && method === 'PATCH') { var df = DB.files[dm[1]]; if (!df) return resp(404, { error: { message: 'File not found' } }); Object.assign(df.props, (body && body.appProperties) || {}); return resp(200, { id: df.id }); }
    if (path === '/v4/spreadsheets' && method === 'POST') {
      var f = newFile(body.properties.title);
      body.sheets.forEach(function (s) {
        var rows = [];
        (s.data || []).forEach(function (d) { (d.rowData || []).forEach(function (r, i) { rows[d.startRow + i] = r.values.map(function (c) { var v = c.userEnteredValue || {}; return v.stringValue !== undefined ? v.stringValue : v.numberValue; }); }); });
        f.sheets[s.properties.title] = rows;
      });
      return resp(200, { spreadsheetId: f.id });
    }
    var sm = /^\/v4\/spreadsheets\/([^/]+)\/values(?::(batchGet|batchUpdate|batchClear)|\/(.+?)(:append)?)$/.exec(path);
    if (!sm) return resp(404, { error: { message: 'Not found (mock): ' + path } });
    var file = DB.files[sm[1]]; if (!file || file.trashed) return resp(404, { error: { message: 'Requested entity was not found.' } });
    var op = sm[2], a1 = sm[3], r;
    if (op === 'batchGet') {
      var out = [], rs = u.searchParams.getAll('ranges');
      for (var i = 0; i < rs.length; i++) { r = parseRange(rs[i]); var v = r && readRange(file, r); if (!v) return badRange(rs[i]); out.push({ range: rs[i], values: v.length ? v : undefined }); }
      return resp(200, { valueRanges: out });
    }
    if (op === 'batchUpdate') {
      if (body.valueInputOption !== 'RAW') return resp(400, { error: { message: 'mock: chỉ chấp nhận RAW' } });
      for (var k = 0; k < body.data.length; k++) { r = parseRange(body.data[k].range); if (!r || !write(file, r, body.data[k].values)) return badRange(body.data[k].range); }
      return resp(200, {});
    }
    if (op === 'batchClear') { body.ranges.forEach(function (x) { var rr = parseRange(x); if (rr) clear(file, rr); }); return resp(200, {}); }
    r = parseRange(a1); if (!r || !file.sheets[r.sheet]) return badRange(a1);
    if (sm[4]) {
      if (u.searchParams.get('valueInputOption') !== 'RAW') return resp(400, { error: { message: 'mock: chỉ chấp nhận RAW' } });
      var t = file.sheets[r.sheet], at = lastRow(t) + 1;
      write(file, { sheet: r.sheet, r1: at, c1: 0 }, body.values);
      return resp(200, { updates: { updatedRange: "'" + r.sheet + "'!A" + (at + 1) + ':J' + (at + body.values.length) } });
    }
    if (method === 'PUT') {
      if (u.searchParams.get('valueInputOption') !== 'RAW') return resp(400, { error: { message: 'mock: chỉ chấp nhận RAW' } });
      write(file, r, body.values); return resp(200, {});
    }
    return resp(200, { values: readRange(file, r) });
  }

  var M = window.HAMMY_MOCK = {
    email: 'ban.thu@example.com',
    db: DB,
    log: [],
    failNext: null, // { status, body } hoặc 'network' – để test xử lý lỗi
    fetch: function (url, init) {
      M.log.push({ url: url, method: (init && init.method) || 'GET', body: init && init.body, auth: init && init.headers && init.headers.Authorization });
      return new Promise(function (res) { setTimeout(res, 120); }).then(function () {
        if (M.failNext) { var f = M.failNext; M.failNext = null; if (f === 'network') throw new TypeError('Failed to fetch'); return resp(f.status, f.body || { error: { message: 'mock error' } }); }
        return handle(url, init);
      });
    }
  };

  /* Sổ mẫu với dữ liệu bịa (chỉ để xem giao diện). */
  if (/[?&]seed=1/.test(location.search)) {
    var pad = function (n) { return ('0' + n).slice(-2); };
    var d = function (back) { var x = new Date(); x.setDate(x.getDate() - back); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); };
    var f = newFile('HammyBack – Sổ thẻ hoàn tiền'); f.props.hammyback = '1';
    f.sheets['Thẻ'] = [['Mã thẻ', 'Ngân hàng', 'Loại thẻ', 'Tên thẻ', 'Ngày kích hoạt', 'Ngày sao kê (1–31)', 'Hạn thanh toán (ngày)', 'Hạn mức', 'Cap tổng/kỳ (trống = không giới hạn)', 'Chi tối thiểu/kỳ', 'Tỷ lệ giao dịch khác (%)', 'Mốc chi miễn phí năm sau', 'Màu', 'Ghi chú'],
      ['csh', 'Shinhan', 'Supreme', 'Shinhan Supreme', '2025-03-10', 31, 25, 50000000, 300000, 3000000, 0.3, 80000000, '#24408E', 'Hoàn bằng điểm. Chi dưới 3 triệu/kỳ chỉ được 0.3%.'],
      ['cwo', 'Woori', 'Hype Point', 'Woori Hype Point', '2024-08-02', 31, 15, 30000000, 1200000, '', 0, 50000000, '#0B6477', ''],
      ['cvp', 'VPBank', 'StepUp', 'VPBank StepUp', '', 25, 5, '', '', '', 0, '', '#B8641A', ''],
      ['chc', 'Home Credit', 'Sống số', 'Home Credit Sống số', '', 15, 5, 20000000, 300000, '', 0, '', '#B3192F', '']];
    f.sheets['Nhóm hoàn tiền'] = [['Mã thẻ', 'Nhóm hoàn tiền', 'Tỷ lệ (%)', 'Cap nhóm/kỳ (trống = dùng chung cap tổng)', 'Ngành hàng (cách nhau dấu phẩy)'],
      ['csh', 'TMĐT', 12, '', 'TMĐT'], ['csh', 'Điện máy', 12, '', 'Điện máy'], ['csh', 'Sub Netflix, ChatGPT, Spotify', 50, 50000, 'Sub Netflix, Sub ChatGPT, Sub Spotify'],
      ['cwo', 'TMĐT', 8, 300000, 'TMĐT'], ['cwo', 'Ăn uống', 10, 300000, 'Ăn uống, Ăn uống cuối tuần'], ['cwo', 'Siêu thị & CHTL', 5, 300000, 'Siêu thị, CHTL'],
      ['cvp', 'Chi tiêu online', 6, 300000, 'TMĐT, Online khác'],
      ['chc', 'Giao đồ ăn', 10, 100000, 'Giao đồ ăn'], ['chc', 'Đặt xe', 10, 100000, 'Đặt xe']];
    f.sheets['Bậc hoàn tiền'] = [['Mã thẻ', 'Nhóm hoàn tiền (trống = cap tổng của thẻ)', 'Chi từ (tổng chi cả thẻ trong kỳ)', 'Tỷ lệ (%)', 'Cap/kỳ'],
      ['csh', '', 15000000, '', 1000000], ['cvp', 'Chi tiêu online', 10000000, 15, 700000], ['cvp', 'Chi tiêu online', 100000000, 15, 1500000]];
    var tx = [['Mã giao dịch', 'Ngày', 'Mã thẻ', 'Thẻ', 'Ngành hàng', 'Merchant', 'Số tiền', 'Trả góp (số kỳ)', 'Trạng thái', 'Tạo lúc']];
    [[1, 'csh', 'Shinhan Supreme', 'TMĐT', 'Shopee', 2450000], [2, 'csh', 'Shinhan Supreme', 'Sub Netflix', 'Netflix', 260000], [3, 'cwo', 'Woori Hype Point', 'Ăn uống', 'Quán phở', 1850000],
     [4, 'cwo', 'Woori Hype Point', 'Ăn uống cuối tuần', 'Lẩu', 1300000], [5, 'chc', 'Home Credit Sống số', 'Giao đồ ăn', 'GrabFood', 901180], [6, 'cvp', 'VPBank StepUp', 'TMĐT', 'Tiki', 6000000], [7, 'cvp', 'VPBank StepUp', 'Online khác', 'Google One', 2500000],
     [8, 'csh', 'Shinhan Supreme', 'Điện máy', 'Điện máy', 1200000], [9, 'cwo', 'Woori Hype Point', 'Siêu thị', 'Siêu thị', 760000], [35, 'cwo', 'Woori Hype Point', 'TMĐT', 'Tiki', 990000]]
      .forEach(function (x, i) { tx.push(['tseed' + i, d(x[0]), x[1], x[2], x[3], x[4], x[5], '', '', new Date().toISOString()]); });
    f.sheets['Giao dịch'] = tx;
    f.sheets['Đọc tôi'] = [['HammyBack – sổ thẻ hoàn tiền của bạn']];
  }
})();
