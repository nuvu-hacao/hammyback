// Test luồng đăng nhập Google THẬT của app (redirect & popup), với Google được giả lập bằng Playwright.
// Chạy: python3 -m http.server 8123 & node tests/auth.js
const { chromium } = require('playwright');
const assert = require('assert');
const BASE = 'http://localhost:8123/';
const SCOPES = 'openid email https://www.googleapis.com/auth/drive.file';
let step = 0; const log = (s) => console.log('✓ ' + (++step) + '. ' + s);

async function setup(browser, mode, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const seen = { auth: [], api: [], revoke: [] };
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: `window.HAMMY_CONFIG={clientId:'123-test.apps.googleusercontent.com',authMode:'${mode}'};` }));
  await ctx.route('https://accounts.google.com/o/oauth2/v2/auth?**', (r) => {
    const u = new URL(r.request().url()); seen.auth.push(u);
    const silent = u.searchParams.get('prompt') === 'none';
    const scope = opts.scope || SCOPES;
    const state = opts.badState ? 'evil' : u.searchParams.get('state');
    const frag = silent && opts.silentFail ? `error=interaction_required&state=${state}` : `access_token=ya29.FAKE${seen.auth.length}&expires_in=3599&token_type=Bearer&scope=${encodeURIComponent(scope)}&state=${state}`;
    r.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(u.searchParams.get('redirect_uri'))} + '#${frag}')</script>` });
  });
  await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'application/javascript', body: `
    window.google={accounts:{oauth2:{initTokenClient:function(cfg){window.__gisCfg=cfg;return{requestAccessToken:function(o){window.__gisReq=o;
      setTimeout(function(){cfg.callback({access_token:'ya29.POPUP',expires_in:3599,scope:${JSON.stringify(opts.scope || SCOPES)}});},50);}};}}}};` }));
  await ctx.route('https://www.googleapis.com/**', (r) => {
    seen.api.push({ url: r.request().url(), auth: r.request().headers().authorization });
    if (/userinfo/.test(r.request().url())) return r.fulfill({ json: { email: 'ban.thu@example.com' } });
    if (/drive\/v3\/files/.test(r.request().url())) return r.fulfill({ json: { files: [] } });
    r.fulfill({ status: 404, json: {} });
  });
  await ctx.route('https://oauth2.googleapis.com/revoke', (r) => { seen.revoke.push(r.request().postData()); r.fulfill({ json: {} }); });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  return { ctx, page, seen, errs };
}
const skip = async (page) => { await page.click('#splash'); await page.waitForSelector('#splash', { state: 'hidden' }); };
const storage = (page) => page.evaluate(() => JSON.stringify({ ls: { ...localStorage }, ss: { ...sessionStorage } }));

(async () => {
  const browser = await chromium.launch();

  /* Redirect (iPhone đã cài lên màn hình chính) */
  let { ctx, page, seen, errs } = await setup(browser, 'redirect');
  await page.goto(BASE); await skip(page);
  await page.waitForSelector('text=Đăng nhập bằng Google');

  await page.click('[data-act="login"]');
  await page.waitForSelector('text=Thẻ của bạn');
  const a = seen.auth[0];
  assert.equal(a.searchParams.get('scope'), SCOPES); assert.equal(a.searchParams.get('response_type'), 'token');
  assert.equal(a.searchParams.get('redirect_uri'), BASE); assert.ok(a.searchParams.get('state').length >= 32);
  assert.equal(page.url(), BASE, 'token phải bị xoá khỏi URL');
  assert.ok(seen.api.every((x) => x.auth === 'Bearer ya29.FAKE1'));
  let st = await storage(page);
  assert.ok(!/ya29/.test(st), st); assert.ok(!/hb\.state/.test(st), st);
  log('Redirect: scope đúng 3 quyền, state ngẫu nhiên, token bị xoá khỏi URL, không lưu vào localStorage/sessionStorage');
  // mở lại app → tự đăng nhập im lặng (prompt=none + login_hint)
  await page.goto(BASE); await page.waitForSelector('text=Thẻ của bạn');
  const b = seen.auth[1];
  assert.equal(b.searchParams.get('prompt'), 'none'); assert.equal(b.searchParams.get('login_hint'), 'ban.thu@example.com');
  log('Mở lại app: tự đăng nhập im lặng (prompt=none), không phải bấm gì');
  await ctx.close();

  ({ ctx, page, seen } = await setup(browser, 'redirect', { silentFail: true }));
  await page.goto(BASE); await skip(page); await page.click('[data-act="login"]'); await page.waitForSelector('text=Thẻ của bạn');
  await page.goto(BASE); await page.waitForSelector('[data-act="login"]');
  assert.equal(seen.auth.length, 2, 'không được lặp redirect vô hạn khi đăng nhập im lặng thất bại');
  log('Đăng nhập im lặng thất bại → hiện nút đăng nhập, không lặp vô hạn');
  await ctx.close();

  ({ ctx, page, seen } = await setup(browser, 'redirect', { scope: 'openid email' }));
  await page.goto(BASE); await skip(page); await page.click('[data-act="login"]');
  await page.waitForSelector('.err:has-text("cần quyền")');
  assert.ok(!seen.api.length, 'không gọi API khi thiếu quyền Drive');
  log('Người dùng bỏ tick quyền Drive → báo rõ, không gọi API');
  await ctx.close();

  ({ ctx, page, seen } = await setup(browser, 'redirect', { badState: true }));
  await page.goto(BASE); await skip(page); await page.click('[data-act="login"]');
  await page.waitForSelector('.err:has-text("không khớp")');
  assert.ok(!seen.api.length);
  log('State không khớp (chống giả mạo) → từ chối token');
  await ctx.close();

  /* Popup (trình duyệt thường) */
  ({ ctx, page, seen, errs } = await setup(browser, 'popup'));
  await page.goto(BASE); await skip(page);
  await page.waitForFunction(() => !!window.google);
  await page.click('[data-act="login"]');
  await page.waitForSelector('text=Thẻ của bạn');
  const cfg = await page.evaluate(() => ({ scope: window.__gisCfg.scope, req: window.__gisReq }));
  assert.equal(cfg.scope, SCOPES);
  assert.ok(seen.api.every((x) => x.auth === 'Bearer ya29.POPUP'));
  st = await storage(page); assert.ok(!/ya29/.test(st), st);
  log('Popup (GIS token client): scope đúng, token chỉ trong RAM');
  // Đăng xuất → thu hồi token
  await page.evaluate(() => { document.querySelector('[data-act="su-next"]'); });
  await page.evaluate(() => { const b = document.createElement('button'); b.setAttribute('data-act', 'logout'); b.id = 'lo'; document.body.appendChild(b); });
  await page.click('#lo');
  await page.waitForSelector('text=Đã đăng xuất');
  assert.equal(seen.revoke[0], 'token=ya29.POPUP');
  st = await storage(page); assert.ok(!/hb\./.test(st), st);
  log('Đăng xuất: gọi revoke với token, xoá sạch hb.* trong trình duyệt');
  assert.deepEqual(errs, []);
  await ctx.close();
  await browser.close();
  console.log('\nTất cả ' + step + ' bước đăng nhập đều qua.');
})().catch((e) => { console.error('✗ ' + e.stack); process.exit(1); });
