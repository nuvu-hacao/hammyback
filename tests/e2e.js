// Chạy: (trong thư mục hammyback) python3 -m http.server 8123 & node tests/e2e.js [thư-mục-ảnh]
const { chromium } = require('playwright');
const assert = require('assert');
const BASE = 'http://localhost:8123/';
const SHOTS = process.argv[2] || null;
let step = 0;
const log = (s) => console.log('✓ ' + (++step) + '. ' + s);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  await page.addInitScript(() => { document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); }); });
  const shot = async (name, full) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: !!full }); };
  const scrollShot = async (name, sel) => { if (!SHOTS) return; await page.locator(sel).first().scrollIntoViewIfNeeded(); await page.waitForTimeout(150); await shot(name); };
  const skipIntro = async () => { await page.click('#splash'); await page.waitForSelector('#splash', { state: 'hidden' }); };
  const db = () => page.evaluate(() => { const f = Object.values(window.HAMMY_MOCK.db.files)[0]; return f && JSON.parse(JSON.stringify(f.sheets)); });
  const bubbleText = () => page.locator('.msgs .bot').last().innerText();
  const typeAmt = async (n) => { await page.fill('#amt', String(n)); await page.waitForTimeout(450); };
  const fillCard = async (i, bank, type, close, due) => { await page.fill(`#f-${i}-bank`, bank); await page.fill(`#f-${i}-type`, type); await page.fill(`#f-${i}-closeDay`, String(close)); await page.fill(`#f-${i}-dueDay`, String(due)); };

  /* 1. Set-up bước 1: chỉ nhập thẻ */
  await page.goto(BASE + '?mock=1');
  await page.waitForSelector('#splash:not([hidden])');
  await skipIntro();
  await page.waitForSelector('text=Thẻ của bạn');
  assert.match(await page.locator('.setuphead').innerText(), /đang có 1 thẻ/);
  await fillCard(0, 'Shinhan', 'Supreme', 31, 25);
  await page.fill('#f-0-openDate', '2025-03-10');
  assert.match(await page.locator('#ph-0').innerText(), /có sẵn luật/);
  await page.click('[data-act="su-add"]'); await fillCard(1, 'Woori', 'Hype Point', 31, 15);
  await page.click('[data-act="su-add"]'); await fillCard(2, 'Home Credit', 'Sống số', 15, 5);
  await page.click('[data-act="su-add"]'); await page.fill('#f-3-bank', 'TPBank'); await page.fill('#f-3-type', '4111 1111 1111 1111');
  assert.match(await page.locator('.setuphead').innerText(), /đang có 4 thẻ/);
  assert.equal(await page.locator('#ph-3').innerText(), '');
  await shot('01-buoc1');
  await page.click('[data-act="su-next"]');
  const err3 = await page.locator('#sc-3 .err').innerText();
  assert.match(err3, /số thẻ/); assert.match(err3, /Ngày sao kê/);
  await page.fill('#f-3-type', 'EVO'); await page.fill('#f-3-closeDay', '20'); await page.fill('#f-3-dueDay', '10');
  await page.click('[data-act="su-next"]');
  await page.waitForSelector('text=Chi tiết hoàn tiền');
  log('Bước 1: nhập ngân hàng + loại thẻ + ngày; đếm "đang có N thẻ"; báo có luật sẵn; chặn số thẻ, bắt buộc ngày');

  /* 2. Bước 2: luật hoàn tiền, thu gọn từng thẻ */
  assert.equal(await page.locator('.foldhead[aria-expanded="true"]').count(), 1);
  assert.ok(await page.locator('#sc-0 .tier').count() === 1, 'Shinhan điền sẵn bậc 15 m → cap 1 m');
  assert.equal(await page.inputValue('#p-0-t-0-from'), '15,000,000');
  await shot('02-buoc2-shinhan');
  await page.click('#sc-0 .foldhead');
  await page.click('#sc-3 .foldhead');
  await page.fill('#f-3-cap', '200000');
  await page.click('#sc-3 [data-act="g-add"]');
  await page.fill('#p-3-g-0-name', 'Quảng cáo & Nhà thuốc'); await page.fill('#p-3-g-0-rate', '5'); await page.fill('#p-3-g-0-cap', '100000');
  await page.click('#sc-3 [data-act="g-cat"][data-v="Nhà thuốc"]');
  await page.fill('#nc-3-0', 'Quảng cáo'); await page.click('#sc-3 [data-act="g-newcat"]');
  await page.waitForSelector('#sc-3 [data-act="g-cat"][data-v="Quảng cáo"][aria-pressed="true"]');
  await page.click('#sc-3 [data-act="t-add"][data-path="3.g.0.t"]');
  await page.fill('#p-3-g-0-t-0-from', '10000000'); await page.fill('#p-3-g-0-t-0-rate', '8'); await page.fill('#p-3-g-0-t-0-cap', '150000');
  await scrollShot('03-buoc2-tu-nhap', '#sc-3 .gbox');
  await page.click('[data-act="su-save"]');
  await page.waitForSelector('text=Ghi vào hết rồi nè bạn ơi!');
  let sheets = await db();
  assert.equal(sheets['Thẻ'].length, 5);
  assert.deepEqual(sheets['Thẻ'][1].slice(1, 4), ['Shinhan', 'Supreme', 'Shinhan Supreme']);
  assert.ok(sheets['Nhóm hoàn tiền'].some((r) => r[4] === 'Nhà thuốc, Quảng cáo'));
  const tiers = sheets['Bậc hoàn tiền'].slice(1);
  assert.ok(tiers.some((r) => r[1] === '' && r[2] === 15000000 && r[4] === 1000000));
  assert.ok(tiers.some((r) => r[1] === 'Quảng cáo & Nhà thuốc' && r[2] === 10000000 && r[3] === 8 && r[4] === 150000));
  log('Bước 2: điền sẵn luật Shinhan (có bậc), thẻ tự nhập thêm nhóm, ngành "Quảng cáo" tự điền, bậc cho nhóm; ghi đủ 3 sheet');

  /* 3. Ghi giao dịch */
  await page.click('[data-act="go-app"]');
  await page.waitForSelector('.composer');
  const pick = async (cat, cardName) => { await page.click(`.composer [data-act="cat"][data-v="${cat}"]`); await page.click(`.composer [data-act="card"]:has-text("${cardName}")`); };
  await pick('Giao đồ ăn', 'Home Credit'); await typeAmt(901180);
  await page.click('[data-act="submit"]'); await page.waitForSelector('.bubble .t:has-text("Hoàn 90k")');
  await typeAmt(200000);
  assert.match(await page.locator('.preview').innerText(), /hoàn 9\.9k[\s\S]*chỉ còn 9\.9k cap/);
  await page.fill('#amt', '');
  await pick('Ăn uống', 'Woori'); await typeAmt(2000000); await page.click('[data-act="submit"]'); await page.waitForSelector('.bubble .t:has-text("Hoàn 200k")');
  await pick('Ăn uống cuối tuần', 'Woori'); await typeAmt(1500000); await page.click('[data-act="submit"]'); await page.waitForSelector('.bubble .t:has-text("Hoàn 100k")');
  await pick('Ăn uống', 'Woori'); await typeAmt(500000);
  assert.match(await page.locator('.preview').innerText(), /hoàn 0 ₫/);
  log('Home Credit còn 9.9k cap; Woori Ăn uống đầy cap → xem trước 0 ₫');
  await pick('TMĐT', 'Shinhan'); await typeAmt(2000000);
  await page.fill('#mer', '=HYPERLINK("http://x.y","bấm")'); await page.waitForTimeout(300);
  await page.click('[data-act="submit"]'); await page.waitForSelector('.bubble .t:has-text("Hoàn 6k")');
  await typeAmt(4000000); await page.click('[data-act="submit"]');
  await page.waitForSelector('.bubble:has-text("Đã đạt chi tối thiểu")');
  assert.match(await bubbleText(), /Hoàn 294k[\s\S]*Chi thêm 9\.0 m để lên cap tổng 1\.0 m/);
  await typeAmt(1000000);
  const pv = await page.locator('.preview').innerText();
  assert.match(pv, /đã đầy cap tổng/); assert.match(pv, /Chi thêm 9\.0 m để lên cap tổng 1\.0 m/);
  await shot('04-xem-truoc-bac');
  log('Shinhan đầy cap 300k → hiện "Chi thêm 9.0 m để lên cap tổng 1.0 m"; bong bóng xem trước nền xám');
  await page.click('.composer [data-act="cat"][data-v="Quảng cáo"]'); await page.click('.composer [data-act="card"]:has-text("TPBank")');
  await typeAmt(1000000); await page.click('[data-act="submit"]'); await page.waitForSelector('.bubble .t:has-text("Hoàn 50k")');
  await typeAmt(10000000);
  assert.match(await page.locator('.preview').innerText(), /hoàn 100k[\s\S]*lên bậc mới/);
  await page.fill('#amt', '');
  log('Ngành tự điền "Quảng cáo" dùng được; vượt mốc 10 m → cả kỳ lên 8%, xem trước báo "lên bậc mới"');
  await page.fill('#mer', '5555 5555 5555 4444'); await page.waitForSelector('.hint.err');
  await page.fill('#mer', '');
  sheets = await db();
  assert.equal(sheets['Giao dịch'].length - 1, 6);
  assert.equal(sheets['Giao dịch'].find((r) => r[4] === 'TMĐT' && r[6] === 2000000)[5], '\'=HYPERLINK("http://x.y","bấm")');

  /* 4. Lịch sử */
  await page.click('[data-act="mode"][data-v="hist"]'); await page.waitForSelector('.hrow');
  const wooriRow = page.locator('.hrow', { hasText: 'Ăn uống cuối tuần' });
  await wooriRow.locator('[data-act="h-inst"]').click(); await wooriRow.locator('[data-act="h-inst-set"][data-v="6"]').click();
  await page.waitForSelector('.pill:has-text("Trả góp 6 kỳ")');
  const hcRow = page.locator('.hrow', { hasText: 'Giao đồ ăn' });
  await hcRow.locator('[data-act="h-del"]').click(); await page.locator('[data-act="h-del-ok"]').click();
  await page.waitForTimeout(500);
  sheets = await db();
  assert.equal(sheets['Giao dịch'].find((r) => r[4] === 'Ăn uống cuối tuần')[7], 6);
  assert.equal(sheets['Giao dịch'].find((r) => r[4] === 'Giao đồ ăn')[8], 'Đã xoá');
  log('Lịch sử: trả góp 6 kỳ + xoá mềm ghi đúng dòng');

  /* 5. Tổng quan */
  await page.click('[data-tab="dash"]'); await page.waitForSelector('.hero');
  assert.match(await page.locator('.hero .big').innerText(), /^550\.000 ₫$/);
  assert.match(await page.locator('.todohead').innerText(), /Việc cần để ý\s*\d+/);
  const collapsed = await page.locator('.todobox .todo').count();
  assert.equal(collapsed, 1);
  await shot('05-tong-quan-thu-gon');
  await page.click('.todohead');
  assert.ok(await page.locator('.todobox .todo').count() > 1);
  assert.ok(await page.locator('.tiernext:has-text("lên cap tổng 1.0 m")').count() === 1);
  await shot('06-tong-quan-mo');
  log('"Việc cần để ý" nền cam, thu gọn sẵn kèm số đếm, bấm để mở; thẻ hiện đường lên bậc');

  /* 6. Tab Thẻ: thêm / sửa / xoá */
  await page.click('[data-tab="cards"]'); await page.waitForSelector('.cc');
  await shot('07-the');
  await page.click('.cb[data-act="det"]:has-text("Woori")');
  await page.click('.pk [data-act="card-edit"] >> nth=1');
  await page.waitForSelector('text=Sửa thẻ');
  await page.fill('#p-0-g-1-rate', '12');
  await page.fill('#f-0-dueDay', '18');
  await shot('08-sua-the');
  await page.click('[data-act="su-save"]');
  await page.waitForSelector('.okbar:has-text("Đã lưu")');
  sheets = await db();
  const woori = sheets['Thẻ'].find((r) => r[1] === 'Woori');
  assert.equal(woori[6], 18);
  assert.equal(sheets['Nhóm hoàn tiền'].find((r) => r[0] === woori[0] && r[1] === 'Ăn uống')[2], 12);
  log('Sửa thẻ từ tab Thẻ (bấm "Sửa" ở nhóm): đổi ngày đến hạn + tỷ lệ nhóm, ghi thẳng Sheet');
  await page.click('[data-act="card-add"]');
  await page.waitForSelector('text=Thêm thẻ');
  await page.fill('#f-0-bank', 'VPBank'); await page.fill('#f-0-type', 'StepUp'); await page.fill('#f-0-closeDay', '20'); await page.fill('#f-0-dueDay', '5');
  await page.click('[data-act="su-fill"]');
  assert.equal(await page.locator('.tier').count(), 2);
  await page.click('[data-act="su-save"]');
  await page.waitForSelector('.okbar:has-text("Đã lưu")');
  sheets = await db();
  assert.equal(sheets['Thẻ'].filter((r) => r && r[0]).length, 6);
  assert.equal(sheets['Bậc hoàn tiền'].filter((r) => r && r[1] === 'Chi tiêu online').length, 2);
  log('Thêm thẻ VPBank StepUp, bấm "Điền sẵn luật" → có 3 bậc, lưu Sheet');
  await page.click('.cb[data-act="det"]:has-text("TPBank")');
  await page.click('[data-act="card-edit"].editbtn');
  await page.click('[data-act="card-del"]'); await page.click('[data-act="card-del-ok"]');
  await page.waitForSelector('.okbar:has-text("Đã xoá thẻ")');
  sheets = await db();
  assert.ok(!sheets['Thẻ'].some((r) => r && r[1] === 'TPBank'));
  assert.ok(!sheets['Bậc hoàn tiền'].some((r) => r && r[1] === 'Quảng cáo & Nhà thuốc'));
  assert.equal(sheets['Thẻ'].filter((r) => r && r[0]).length, 5);
  log('Xoá thẻ: xoá thẻ + nhóm + bậc của thẻ, giữ giao dịch');

  /* 7. Nhập giao dịch cũ */
  await page.click('[data-act="go-import"]'); await page.waitForSelector('text=Nhập giao dịch cũ');
  await page.click('[data-act="imp-copy"]'); await page.waitForSelector('text=Đã copy');
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(clip, /Shinhan Supreme/); assert.match(clip, /Thương mại điện tử/); assert.match(clip, /KHÔNG ghi số thẻ/);
  const today = await page.evaluate(() => { const d = new Date(); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); });
  const paste = ['```', 'Ngày | Thẻ | Ngành hàng | Tên cửa hàng | Số tiền',
    '01/11/2026 | Shinhan Supreme | Thương mại điện tử | Shopee | 450000',
    '02/11/2026 | Woori | Siêu thị | WinMart | 1.250.000',
    `${today} | Woori Hype Point | Ăn uống | Quán | 2000000`,
    '03/11/2026 | Shinhan Supreme | Khác | 4111 1111 1111 1111 | 100000',
    '03/11/2026 | ACB Platinum | Ăn uống | Phở | 90000', '```'].join('\n');
  await page.fill('#imp', paste);
  await page.click('[data-act="imp-parse"]');
  await page.waitForSelector('text=2 dòng sẽ ghi');
  assert.match(await page.locator('text=2 dòng sẽ ghi').innerText(), /1 dòng có thể trùng · 2 dòng lỗi/);
  await shot('09-nhap-gd-cu', true);
  await page.click('[data-act="imp-save"]');
  await page.waitForSelector('text=Hammy đã ghi');
  sheets = await db();
  const wm = sheets['Giao dịch'].find((r) => r[5] === 'WinMart');
  assert.equal(wm[1], '2026-11-02'); assert.equal(wm[6], 1250000); assert.equal(wm[4], 'Siêu thị');
  assert.equal(sheets['Giao dịch'].length - 1, 8);
  log('Nhập giao dịch cũ: copy prompt (có tên thẻ/ngành), dán bảng AI, bỏ dòng trùng/lỗi/số thẻ, ghi 2 dòng hàng loạt');
  await page.click('[data-act="imp-hist"]'); await page.waitForSelector('.hrow:has-text("WinMart")');

  /* 8. Bảo mật */
  const ls = await page.evaluate(() => Object.keys(localStorage));
  assert.deepEqual(ls.filter((k) => !['hb.email', 'hb.had', 'hb.tab', 'hb.hide'].includes(k)), []);
  assert.deepEqual(await page.evaluate(() => Object.keys(sessionStorage)), []);
  assert.deepEqual(await page.evaluate(() => window.__csp || []), []);
  log('Không token trong trình duyệt; không vi phạm CSP');

  /* 9. Lỗi mạng + đăng xuất */
  await page.click('[data-act="mode"][data-v="tx"]');
  await pick('Đặt xe', 'Home Credit'); await typeAmt(100000);
  await page.evaluate(() => { window.HAMMY_MOCK.failNext = 'network'; });
  await page.click('[data-act="submit"]');
  await page.waitForSelector('.bubble:has-text("Chưa chắc giao dịch đã được ghi")');
  await page.click('[data-tab="cards"]'); await page.click('[data-act="logout"]');
  await page.waitForSelector('text=Đã đăng xuất');
  assert.deepEqual(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('hb.'))), []);
  log('Mất mạng khi ghi → không tự ghi lại; đăng xuất xoá sạch');
  assert.deepEqual(problems, [], problems.join('\n'));

  if (SHOTS) {
    await page.goto(BASE + '?mock=1&seed=1'); await skipIntro(); await page.waitForSelector('.composer');
    await page.click('[data-tab="dash"]'); await page.waitForSelector('.hero'); await shot('20-mau-tong-quan');
    await page.click('.todohead'); await page.click('[data-act="tg"] >> nth=2'); await page.locator('.cardbox').nth(2).scrollIntoViewIfNeeded(); await shot('21-mau-stepup');
    await page.click('[data-tab="cards"]'); await page.click('.cb[data-act="det"]:has-text("StepUp")'); await page.locator('.pk').first().scrollIntoViewIfNeeded(); await shot('22-mau-the-stepup');
    await page.goto(BASE + '?mock=1'); await skipIntro(); await page.waitForSelector('text=Thẻ của bạn'); await page.click('[data-act="su-add"]'); await shot('23-buoc1-trong');
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const p3 = await ctx3.newPage(); await p3.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: "window.HAMMY_CONFIG={clientId:'1-x.apps.googleusercontent.com',authMode:'redirect'};" }));
    await p3.goto(BASE); await p3.click('#splash'); await p3.waitForSelector('#splash', { state: 'hidden' }); await p3.waitForSelector('text=Đăng nhập bằng Google'); await p3.screenshot({ path: `${SHOTS}/00-dang-nhap.png` });
  }
  const p2 = await ctx.newPage();
  await p2.goto(BASE); await p2.click('#splash'); await p2.waitForSelector('text=Chưa cấu hình đăng nhập Google');
  log('Chưa có Client ID → báo rõ');
  console.log('\nTất cả ' + step + ' bước đều qua.');
  await browser.close();
})().catch(async (e) => { console.error('✗ ' + e.stack); process.exit(1); });
