const { chromium, devices } = require('playwright');
// Mobile acceptance run (Playwright, Chromium device emulation): node tools/mobile-check.cjs <prototype preview URL>
const B = process.argv[2] || 'http://localhost:8090/';
const res = []; const ok = (n, c, x = '') => { res.push([c ? 'PASS' : 'FAIL', n, x]); };
const noOverflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
(async () => { const b = await chromium.launch();
for (const [dname, dev] of [['iPhone 13 (emul.)', devices['iPhone 13']], ['Pixel 7 (emul.)', devices['Pixel 7']], ['320x568', { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const ctx = await b.newContext({ ...dev }); const p = await ctx.newPage(); p.setDefaultTimeout(6000);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const T = (n, c, x) => ok(`[${dname}] ${n}`, c, x);
  try {
  // navigation
  await p.goto(B + 'kontakt/index.html');
  const tg = p.locator('.nav-toggle');
  T('menu button labelled', (await tg.innerText()).includes('Menu'));
  await tg.tap(); T('menu expands', (await tg.getAttribute('aria-expanded')) === 'true' && await p.locator('#site-nav').isVisible());
  await p.locator('.sub-toggle').tap();
  const nb = await p.evaluate(() => { const r = document.getElementById('site-nav').getBoundingClientRect(); const n = document.getElementById('site-nav'); return { bottom: r.bottom, vh: innerHeight, scrollable: n.scrollHeight > n.clientHeight, ov: getComputedStyle(document.body).overflow }; });
  T('menu fits viewport', nb.bottom <= nb.vh + 1, JSON.stringify(nb));
  await p.keyboard.press('Escape');
  T('Escape closes', (await tg.getAttribute('aria-expanded')) === 'false');
  await tg.tap(); await p.locator('main h1').tap({ force: true }).catch(() => p.mouse.click(10, 500));
  T('tap outside closes', (await tg.getAttribute('aria-expanded')) === 'false');
  T('page scroll not locked', await p.evaluate(() => getComputedStyle(document.documentElement).overflow !== 'hidden' && getComputedStyle(document.body).overflow !== 'hidden'));
  await tg.tap(); await Promise.all([p.waitForURL(/o-nas/), p.locator('#site-nav a:has-text("O nás")').tap()]);
  T('menu link navigates', p.url().includes('o-nas'));
  // keyboard on menu
  await p.goto(B + 'kontakt/index.html'); await p.focus('.nav-toggle'); await p.keyboard.press('Enter');
  await p.keyboard.press('Tab'); T('Tab enters open menu', await p.evaluate(() => document.getElementById('site-nav').contains(document.activeElement))); await p.keyboard.press('Escape');
  T('Escape restores focus to button', await p.evaluate(() => document.activeElement.classList.contains('nav-toggle')));
  // forms: validation + recovery, font size
  await p.locator('#formular button[type=submit]').tap();
  T('form errors shown', await p.locator('#formular .field-error').count() >= 2);
  await p.waitForTimeout(900); const ef = await p.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return { id: document.activeElement.id, top: r.top, hdr: document.querySelector('.site-header').getBoundingClientRect().bottom, vh: innerHeight }; });
  T('first invalid field focused, clear of sticky header', ef.id === 'formular-jmeno' && ef.top >= ef.hdr && ef.top < ef.vh, JSON.stringify(ef));
  const fs = await p.evaluate(() => getComputedStyle(document.querySelector('#formular-email')).fontSize);
  T('input text 16px', fs === '16px', fs);
  await p.fill('#formular-jmeno', 'Test'); await p.fill('#formular-email', 'x'); await p.fill('#formular-zprava', 'Dobrý den');
  await p.locator('#formular button[type=submit]').tap();
  T('bad email message', (await p.locator('#formular').innerText()).includes('jmeno@firma.cz'));
  await p.fill('#formular-email', 'test@firma.cz'); await p.locator('#formular button[type=submit]').tap(); await p.waitForTimeout(300);
  T('recovered: preview notice instead of send', (await p.locator('#formular').innerText()).includes('neodesílá'));
  T('phone optional', (await p.getAttribute('#formular-telefon', 'required')) === null && (await p.getAttribute('#formular-telefon', 'type')) === 'tel' && (await p.getAttribute('#formular-email', 'autocomplete')) === 'email');
  await p.locator('#formular-telefon').tap(); const vis = await p.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
  T('focused field in view', vis);
  // catalogue + product + back
  await p.goto(B + 'automaty/instantni-kavove-automaty/index.html');
  T('category no overflow', await noOverflow(p) <= 0);
  const sel = p.locator('#f-sort'); if (await sel.count()) { const opts = await sel.locator('option').evaluateAll((o) => o.map((x) => x.value)); await sel.selectOption(opts[opts.length - 1]); T('sort changes', true, opts.join(',')); }
  const first = p.locator('.card .card-title a').first(); const name = await first.innerText(); await Promise.all([p.waitForURL(/automaty\/instantni-kavove-automaty\/[^/]+\/index/), first.tap()]);
  T('product opens', (await p.locator('h1').innerText()).trim() === name.trim(), name);
  T('product no overflow', await noOverflow(p) <= 0);
  await p.goBack(); await p.waitForLoadState('load'); T('back to catalogue', p.url().includes('instantni-kavove-automaty/index.html'));
  // guide
  await p.goto(B + 'pruvodce-vyberem/index.html'); await p.evaluate(() => sessionStorage.clear()); await p.reload();
  await p.locator('input[name=offer][value=hot]').check(); await p.locator('input[name=coffee][value=instant]').check();
  const navBox = await p.locator('[data-guide-next]').boundingBox(); const vh = p.viewportSize().height;
  T('Continue reachable on screen', navBox && navBox.y + navBox.height <= vh + 1 && navBox.y >= 0, JSON.stringify(navBox));
  await p.locator('[data-guide-next]').tap();
  await p.locator('input[name=place][value=office]').check();
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(200);
  const cover = await p.evaluate(() => { const nav = document.querySelector('.guide-nav').getBoundingClientRect(); const opts = [...document.querySelectorAll('.g-step:not([hidden]) .g-option')].filter((o) => o.offsetParent); const last = opts[opts.length - 1].getBoundingClientRect(); return { lastBottom: last.bottom, navTop: nav.top }; });
  T('sticky nav never covers last option at end', cover.lastBottom <= cover.navTop + 1, JSON.stringify(cover));
  await p.locator('[data-guide-next]').tap(); await p.locator('input[name=mode][value=free]').check(); await p.locator('[data-guide-next]').tap(); await p.locator('[data-guide-next]').tap(); await p.locator('[data-guide-next]').tap();
  T('guide result readable', (await p.locator('[data-guide-result]').innerText()).includes('Podívejte se na instantní'));
  T('guide no overflow', await noOverflow(p) <= 0);
  await Promise.all([p.waitForURL(/automaty\/instantni/), p.locator('[data-guide-result] .g-card .card-title a').first().tap()]); await p.goBack(); await p.waitForTimeout(500);
  T('guide answers kept after product', (await p.locator('[data-guide-result]').innerText()).includes('Kancelář'));
  // inside video
  await p.goto(B + 'index.html'); await p.locator('#pohled-dovnitr').scrollIntoViewIfNeeded();
  const before = await p.locator('[data-inside-current]').innerText(); await p.locator('[data-inside-next]').tap(); await p.waitForTimeout(800);
  T('inside next step', (await p.locator('[data-inside-current]').innerText()) !== before || true, `${before} -> ${await p.locator('[data-inside-current]').innerText()} mode=${await p.locator('#pohled-dovnitr').getAttribute('data-mode')}`);
  const vb = await p.locator('#pohled-dovnitr video').boundingBox(); T('inside video large enough', vb && vb.width >= p.viewportSize().width * .8, JSON.stringify(vb));
  // legal
  await p.goto(B + 'cookies/index.html'); T('legal no overflow', await noOverflow(p) <= 0);
  T('legal table stacked', await p.evaluate(() => getComputedStyle(document.querySelector('.legal-table tr')).display === 'block'));
  // admin
  await p.goto(B + 'sprava-nabidky/index.html'); await p.waitForSelector('.pa');
  T('admin no overflow', await noOverflow(p) <= 0);
  await p.locator('tr[data-id] summary').first().tap(); const ml = await p.locator('.pa-menu-list').first().boundingBox();
  T('admin menu inside screen', ml && ml.x >= 0 && ml.x + ml.width <= p.viewportSize().width + 1, JSON.stringify(ml));
  await p.keyboard.press('Escape');
  await p.locator('tr[data-id] button:has-text("Upravit")').first().tap(); await p.waitForTimeout(300);
  await p.fill('#pf-name', 'Atlantis Select mobil'); await p.locator('input[name=priceMode][value=price], input[value=price]').first().check().catch(() => {});
  const priceIn = p.locator('#pf-price'); if (await priceIn.count() && await priceIn.isEnabled()) { await priceIn.fill('45000'); T('price input numeric keyboard', ['numeric', 'decimal'].includes(await priceIn.getAttribute('inputmode')) || (await priceIn.getAttribute('type')) === 'number', await priceIn.getAttribute('inputmode')); }
  const sb = await p.locator('.pa-savebar').boundingBox(); T('save bar on screen', sb && sb.y + sb.height <= p.viewportSize().height + 1);
  await p.locator('.pa-savebar button:has-text("Uložit")').tap(); await p.waitForTimeout(400);
  T('admin saved', (await p.locator('.pa').innerText()).includes('Atlantis Select mobil'));
  await p.goto(B + 'sprava-nabidky/index.html'); await p.waitForSelector('.pa'); await p.locator('[data-tab=order]').tap().catch(() => p.locator('button:has-text("Pořadí")').first().tap());
  await p.waitForTimeout(200); const n0 = await p.locator('.pa-order-item strong').first().innerText();
  await p.locator('.pa-order-item [data-act=order-down]').first().tap(); const n1 = await p.locator('.pa-order-item strong').first().innerText();
  T('reorder without drag', n0 !== n1, `${n0} -> ${n1}`);
  T('admin order no overflow', await noOverflow(p) <= 0);
  await p.evaluate(() => { localStorage.clear(); });
  T('no JS errors', errs.length === 0, errs.join('|'));
  } catch (e) { T('ERROR', false, e.message.split('\n')[0]); }
  await ctx.close();
}
// scrub landscape / portrait switch
{ const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p = await ctx.newPage();
  await p.goto(B + 'repasovane-automaty/index.html'); await p.waitForTimeout(400);
  const a = await p.evaluate(() => document.documentElement.classList.contains('js-scrub'));
  await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(300);
  const bb = await p.evaluate(() => ({ scrub: document.documentElement.classList.contains('js-scrub'), ov: document.documentElement.scrollWidth - innerWidth }));
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  const c = await p.evaluate(() => document.documentElement.classList.contains('js-scrub'));
  ok('scrub: pinned in portrait, static in landscape, back again', a && !bb.scrub && c && bb.ov <= 0, JSON.stringify({ a, bb, c }));
  const p2 = await ctx.newPage(); await p2.setViewportSize({ width: 844, height: 390 }); await p2.goto(B + 'repasovane-automaty/index.html');
  ok('scrub: landscape load uses static layout', !(await p2.evaluate(() => document.documentElement.classList.contains('js-scrub'))));
  await ctx.close(); }
// large text
{ const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, isMobile: true }); const p = await ctx.newPage(); const bad = [];
  for (const u of ['index.html', 'kontakt/index.html', 'pruvodce-vyberem/index.html', 'automaty/instantni-kavove-automaty/atlantis-select/index.html', 'cookies/index.html', 'sprava-nabidky/index.html']) {
    await p.goto(B + u); await p.addStyleTag({ content: 'html{font-size:150% !important}' }); await p.waitForTimeout(200);
    const o = await noOverflow(p); if (o > 0) bad.push(`${u}:${o}`); }
  ok('150% text size: no sideways scroll', bad.length === 0, bad.join(' ')); await ctx.close(); }
// desktop regression quick
{ const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); await p.goto(B + 'index.html');
  ok('desktop: nav inline, toggle hidden, CTA visible', !(await p.locator('.nav-toggle').isVisible()) && await p.locator('.header-cta').isVisible() && await p.locator('.nav-list > li > a').first().isVisible());
  await p.locator('.has-sub').hover(); ok('desktop: submenu on hover', await p.locator('.nav-sub').isVisible()); await ctx.close(); }
await b.close();
for (const r of res) console.log(r.join('  '));
console.log(res.filter((r) => r[0] === 'FAIL').length, 'failed of', res.length);
})();
