// Browser checks of the 14 acceptance scenarios for the catalogue admin prototype.
const { chromium } = require('playwright');
// Run against a prototype build: node scripts/build.mjs --out /tmp/proto --explicit-index --prototype,
// serve /tmp/proto (with HTTP range support) and pass its URL: node tools/admin-browser-check.cjs http://localhost:8090/
// Needs Playwright with Chromium.
const BASE = process.argv[2] || 'http://localhost:8090/';
const P = require('path').join(__dirname, '..', 'assets', 'products') + '/';
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); };
const nb = (s) => s.replace(/[  ]/g, ' ');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  const admin = async (hash = '') => { await page.goto('about:blank'); await page.goto(BASE + 'sprava-nabidky/index.html' + hash); await page.waitForSelector('.pa'); };
  const text = async (sel) => nb(await page.locator(sel).first().innerText());

  // 13 (first, on clean storage): old v1 data survives the upgrade
  await page.goto(BASE + 'index.html');
  await page.evaluate(async () => {
    const seed = (await import('./assets/proto/seed.js')).default;
    const products = JSON.parse(JSON.stringify(seed.products));
    products[1].name = 'Atlantis Select (upravený ve v1)';
    products[1].price = 52000;
    localStorage.setItem('pouzite-automaty:prototyp:v1', JSON.stringify({ version: 1, products }));
  });
  await admin();
  ok('13 v1 data shown in admin', (await page.locator('.pa-table').innerText()).includes('Atlantis Select (upravený ve v1)'));
  await page.goto(BASE + 'index.html'); await page.waitForTimeout(300);
  ok('13 v1 data on customer homepage', nb(await page.locator('#nabidka').innerText()).includes('52 000 Kč'));

  // 1: draft with incomplete info, reload, continue
  await admin();
  await page.click('.pa-bar [data-act="new"]');
  await page.fill('#pf-name', 'Necta Kikko testovací');
  await page.click('[data-act="save"]');
  await page.waitForSelector('.pa-save-state.is-ok');
  const draftId = await page.evaluate(() => decodeURIComponent(location.hash.split('/')[1]));
  await page.reload(); await page.waitForSelector('.pa-form');
  ok('1 draft reopens after reload', (await page.inputValue('#pf-name')) === 'Necta Kikko testovací' && await page.isChecked('[name=status][value=draft]'));
  await page.fill('#pf-manufacturer', 'Necta');
  await page.click('[data-act="save"]'); await page.waitForSelector('.pa-save-state.is-ok');
  await page.goto(BASE + 'index.html'); await page.waitForTimeout(300);
  ok('1 draft not public', !(await page.locator('main').innerText()).includes('Necta Kikko'));

  // 2: publish with multiple photos; publishing validates required fields
  await admin('#upravit/' + encodeURIComponent(draftId));
  await page.setInputFiles('#pf-files', [P + 'crane-voce/1.jpg', P + 'colibri-c5/1.jpg', P + 'atlantis-select/1.jpg']);
  await page.waitForFunction(() => document.querySelectorAll('.pa-photo').length === 3, null, { timeout: 15000 });
  await page.click('[data-act="publish"]');
  const sumText = await page.locator('[data-summary]').innerText();
  ok('2 publish blocked without summary', sumText.includes('krátký popis'), sumText.replace(/\n/g, ' '));
  await page.fill('#pf-summary', 'Testovací automat na teplé nápoje.');
  // make the third photo the cover
  await page.locator('.pa-photo').nth(2).locator('[data-act="photo-cover"]').click();
  await page.fill('#pf-alt-0', 'Pohled zepředu');
  await page.click('[data-act="publish"]'); await page.waitForSelector('.pa-save-state.is-ok');
  await page.goto(BASE + 'index.html'); await page.waitForTimeout(400);
  const card = page.locator(`.card[data-id="${draftId}"]`);
  ok('2 card on homepage', await card.count() === 1);
  ok('2 card image is uploaded photo', (await card.locator('img').first().getAttribute('src')).startsWith('blob:'));
  await page.goto(BASE + 'automaty/instantni-kavove-automaty/index.html'); await page.waitForTimeout(400);
  ok('2 card in category', await page.locator(`.card[data-id="${draftId}"]`).count() === 1);
  await page.locator(`.card[data-id="${draftId}"] .card-title a`).click(); await page.waitForTimeout(500);
  ok('2 detail page with 3 photos', (await page.locator('h1').innerText()) === 'Necta Kikko testovací' && await page.locator('.gallery-thumbs li').count() === 3);

  // 3: change price from overview
  await admin();
  const row = page.locator(`tr[data-id="${draftId}"]`);
  await row.locator('[data-act="price"]').click();
  await page.check('.pa-dialog [name=mode][value=set]');
  await page.fill('#qp-price', '40000');
  await page.click('.pa-dialog [value=save]');
  await page.waitForTimeout(200);
  ok('3 overview price', nb(await row.locator('.pa-price').innerText()).includes('40 000 Kč'));
  await page.goto(BASE + 'index.html'); await page.waitForTimeout(300);
  ok('3 customer price', nb(await text(`.card[data-id="${draftId}"] .card-price`)).includes('40 000 Kč bez DPH'));

  // 4: immediate 10 % discount on every customer-facing price
  await admin('#upravit/' + encodeURIComponent(draftId));
  await page.check('[data-d-enabled]');
  await page.check('[name=dMethod][value=percent]');
  await page.fill('#pf-d-value', '10');
  ok('4 calc shows final', nb(await page.locator('[data-d-calc]').innerText()).includes('36 000 Kč'));
  await page.click('[data-act="save"]'); await page.waitForSelector('.pa-save-state.is-ok');
  for (const path of ['index.html', 'automaty/instantni-kavove-automaty/index.html', 'automaty/index.html']) {
    await page.goto(BASE + path); await page.waitForTimeout(300);
    const t = nb(await page.locator(`.card[data-id="${draftId}"] .price-slot`).innerText());
    ok(`4 sale on ${path}`, t.includes('36 000 Kč bez DPH') && t.includes('Běžná cena 40 000 Kč') && (await page.locator(`.card[data-id="${draftId}"] .badge-sale`).innerText()).includes('10 %'), t.replace(/\n/g, ' '));
  }
  await page.goto(BASE + `automaty/nahled/index.html?id=${draftId}`); await page.waitForTimeout(400);
  ok('4 sale on detail', nb(await page.locator('.price-box').innerText()).includes('ušetříte 4 000 Kč'));

  // 5–7: scheduled discount with a fake clock, on an open page
  const clockPage = await ctx.newPage();
  clockPage.on('pageerror', (e) => errs.push('clock: ' + e.message));
  clockPage.on('dialog', (d) => d.accept());
  await clockPage.clock.install({ time: new Date('2026-11-09T22:00:00Z') }); // 23:00 Prague
  await clockPage.goto(BASE + 'sprava-nabidky/index.html#upravit/' + encodeURIComponent(draftId));
  await clockPage.waitForSelector('.pa-form');
  await clockPage.check('[name=dStartMode][value=at]');
  await clockPage.fill('#pf-d-start-date', '2026-11-10'); await clockPage.fill('#pf-d-start-time', '08:00');
  await clockPage.check('[name=dEndMode][value=at]');
  await clockPage.fill('#pf-d-end-date', '2026-11-10'); await clockPage.fill('#pf-d-end-time', '09:00');
  const sentence = nb(await clockPage.locator('[data-d-sentence]').innerText());
  ok('5 Czech sentence + scheduled', sentence.includes('Naplánovaná') && sentence.includes('Sleva začne 10. 11. 2026 v 8:00 a skončí 10. 11. 2026 v 9:00.'), sentence);
  await clockPage.click('[data-act="save"]'); await clockPage.waitForSelector('.pa-save-state.is-ok');
  await clockPage.goto(BASE + 'index.html'); await clockPage.waitForTimeout(400);
  const cardPrice = async () => nb(await clockPage.locator(`.card[data-id="${draftId}"] .price-slot`).innerText());
  ok('5 not active early', (await cardPrice()) === '40 000 Kč bez DPH', await cardPrice());
  await clockPage.clock.runFor('08:59:00'); // 07:59:00 Prague... (starts 23:00 → 07:59)
  ok('5 still not active one minute before', (await cardPrice()) === '40 000 Kč bez DPH');
  await clockPage.clock.runFor('01:10');  // past 08:00
  await clockPage.waitForTimeout(100);
  ok('6 activates on the open page', (await cardPrice()).includes('36 000 Kč'), await cardPrice());
  // sort by price uses the discount on the open page
  ok('6 sale filter checkbox present', await clockPage.locator('[data-filter="sale"]').count() === 1);
  await clockPage.clock.runFor('01:00:00');
  await clockPage.waitForTimeout(100);
  ok('7 expiry restores standard price', (await cardPrice()) === '40 000 Kč bez DPH', await cardPrice());
  await clockPage.close();

  // 8: price sorting uses active discounts, "na dotaz" last
  await admin();
  // give two seed machines prices: 30 000 and 50 000; our machine 40 000 with immediate 50 % → 20 000
  for (const [id, price] of [['atlantis-select', '30000'], ['crane-voce', '50000']]) {
    await page.locator(`tr[data-id="${id}"] [data-act="price"]`).click();
    await page.check('.pa-dialog [name=mode][value=set]');
    await page.fill('#qp-price', price);
    await page.click('.pa-dialog [value=save]'); await page.waitForTimeout(150);
  }
  await admin('#upravit/' + encodeURIComponent(draftId));
  await page.check('[name=dStartMode][value=now]'); await page.check('[name=dEndMode][value=none]');
  await page.fill('#pf-d-value', '50');
  await page.click('[data-act="save"]'); await page.waitForSelector('.pa-save-state.is-ok');
  await page.goto(BASE + 'index.html?razeni=cena-vzestupne'); await page.waitForTimeout(400);
  const asc = await page.locator('[data-cat-list] .card').evaluateAll((els) => els.map((e) => e.dataset.id));
  ok('8 ascending', asc.slice(0, 3).join() === `${draftId},atlantis-select,crane-voce`, asc.join());
  await page.selectOption('#f-sort', 'cena-sestupne'); await page.waitForTimeout(100);
  const desc = await page.locator('[data-cat-list] .card').evaluateAll((els) => els.map((e) => e.dataset.id));
  ok('8 descending, na dotaz last', desc.slice(0, 3).join() === `crane-voce,atlantis-select,${draftId}` && desc.length === 8, desc.join());
  ok('8 sort kept in URL', page.url().includes('razeni=cena-sestupne'));
  await page.check('[data-filter="sale"]'); await page.waitForTimeout(100);
  ok('8 sale filter', (await page.locator('[data-cat-list] .card:not([hidden])').count()) === 1 && page.url().includes('sleva=1'));

  // 9: reorder and verify recommended order
  await admin('#poradi');
  const first = await page.locator('.pa-order-item').first().getAttribute('data-id');
  const last = await page.locator('.pa-order-item').last().getAttribute('data-id');
  await page.locator('.pa-order-item').last().locator('[data-act="order-pos"]').fill('1');
  await page.locator('.pa-order-item').last().locator('[data-act="order-pos"]').press('Enter');
  await page.waitForTimeout(100);
  ok('9 moved to first', (await page.locator('.pa-order-item').first().getAttribute('data-id')) === last);
  // keyboard: move the new first one down with the button
  await page.locator('.pa-order-item').nth(1).locator('[data-act="order-up"]').focus();
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  const ord = await page.locator('.pa-order-item').evaluateAll((els) => els.map((e) => e.dataset.id));
  await page.click('[data-act="order-save"]'); await page.waitForTimeout(150);
  await page.goto(BASE + 'index.html'); await page.waitForTimeout(400);
  const home = await page.locator('[data-cat-list] .card').evaluateAll((els) => els.map((e) => e.dataset.id));
  ok('9 customer recommended order', home.join() === ord.join(), `${home.join()} vs ${ord.join()}`);

  // 10: hide, delete, restore
  await admin();
  const victim = 'colibri-c5';
  await page.locator(`tr[data-id="${victim}"] summary`).click();
  await page.locator(`tr[data-id="${victim}"] [data-act="toggle"]`).click(); await page.waitForTimeout(150);
  await page.goto(BASE + 'index.html'); await page.waitForTimeout(300);
  ok('10 hidden not listed', await page.locator(`.card[data-id="${victim}"]`).count() === 0);
  await page.goto(BASE + 'automaty/instantni-kavove-automaty/colibri-c5/index.html'); await page.waitForTimeout(300);
  ok('10 hidden detail says unavailable', (await page.locator('h1').innerText()).includes('není v nabídce'));
  await admin();
  await page.locator(`tr[data-id="${victim}"] summary`).click();
  await page.locator(`tr[data-id="${victim}"] [data-act="delete"]`).click();
  await page.click('.pa-dialog [value=ok]'); await page.waitForTimeout(150);
  ok('10 deleted gone from list', await page.locator(`tr[data-id="${victim}"]`).count() === 0 && (await page.locator('[data-count=trash]').innerText()) === '(1)');
  await page.click('[data-tab=trash]');
  await page.locator(`li[data-id="${victim}"] [data-act="restore"]`).click(); await page.waitForTimeout(150);
  await page.click('[data-tab=list]');
  ok('10 restored as hidden', (await page.locator(`tr[data-id="${victim}"] .pa-c-status`).innerText()).includes('Skryto'));
  await page.locator(`tr[data-id="${victim}"] summary`).click();
  await page.locator(`tr[data-id="${victim}"] [data-act="toggle"]`).click(); await page.waitForTimeout(150);
  ok('10 republished', (await page.locator(`tr[data-id="${victim}"] .pa-c-status`).innerText()).includes('Zveřejněno'));

  // 11: duplicate
  await page.locator(`tr[data-id="${draftId}"] summary`).click();
  await page.locator(`tr[data-id="${draftId}"] [data-act="duplicate"]`).click();
  await page.waitForSelector('.pa-form');
  const copy = await page.evaluate(() => JSON.parse(localStorage.getItem('pouzite-automaty:prototyp:v2')).products.find((p) => p.name.endsWith('(kopie)')));
  ok('11 copy is draft, no discount, new id/slug', copy && copy.status === 'draft' && copy.discount == null && copy.id !== draftId && copy.slug !== copy.slug.replace('kopie', '') && copy.images.length === 3);
  await page.goto(BASE + 'index.html'); await page.waitForTimeout(300);
  ok('11 copy not public', !(await page.locator('main').innerText()).includes('(kopie)'));

  // 12: failed save and failed upload keep the data
  await admin('#upravit/' + encodeURIComponent(draftId));
  await page.fill('#pf-model', 'Kikko Max');
  await page.setInputFiles('#pf-files', { name: 'poznamky.txt', mimeType: 'text/plain', buffer: Buffer.from('ahoj') });
  await page.waitForSelector('.pa-queue .is-error');
  ok('12 bad upload reported', (await page.locator('.pa-queue').innerText()).includes('JPG, PNG nebo WebP') && (await page.inputValue('#pf-model')) === 'Kikko Max');
  await page.evaluate(() => { Storage.prototype._set = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
  await page.click('[data-act="save"]'); await page.waitForSelector('.pa-save-state.is-error');
  ok('12 failed save message + values kept', (await page.locator('[data-save-state]').innerText()).includes('plné') && (await page.inputValue('#pf-model')) === 'Kikko Max');
  await page.evaluate(() => { Storage.prototype.setItem = Storage.prototype._set; });
  await page.click('[data-act="save"]'); await page.waitForSelector('.pa-save-state.is-ok');
  ok('12 retry saves', JSON.parse(await page.evaluate(() => localStorage.getItem('pouzite-automaty:prototyp:v2'))).products.find((p) => p.id === draftId).model === 'Kikko Max');

  // backup round trip
  await admin('#zaloha');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
  const file = await dl.path();
  const backup = JSON.parse(require('fs').readFileSync(file, 'utf8'));
  ok('backup has photos', Object.keys(backup.media).length >= 3 && backup.products.length === 9);
  await page.setInputFiles('[data-import]', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"products":[{"id":"x"}]}') });
  await page.waitForSelector('.pa-error-box');
  ok('import rejects bad file', (await page.locator('.pa-error-box').innerText()).includes('nejde nahrát'));
  await page.setInputFiles('[data-import]', file);
  await page.waitForSelector('.pa-import-preview');
  ok('import preview', (await page.locator('.pa-import-preview').innerText()).includes('9 automatů'));
  await page.click('[data-act="import-apply"]'); await page.click('.pa-dialog [value=ok]');
  await page.waitForTimeout(500);
  ok('import applied', (await page.locator('.pa-flash').innerText()).includes('nahrazený'));

  // 14: mobile + keyboard
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errs.push('mobile: ' + e.message));
  await mp.goto(BASE + 'sprava-nabidky/index.html'); await mp.waitForSelector('.pa');
  ok('14 no horizontal scroll (list)', await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mp.locator('.pa-bar [data-act="new"]').focus();
  await mp.keyboard.press('Enter'); await mp.waitForSelector('.pa-form');
  await mp.locator('#pf-name').focus(); await mp.keyboard.type('Mobilní automat');
  await mp.keyboard.press('Tab'); // category
  await mp.keyboard.press('Tab'); // condition
  await mp.keyboard.press('Tab'); await mp.keyboard.type('Krátký popis z mobilu.');
  await mp.locator('[name=priceMode][value=set]').focus(); await mp.keyboard.press('Space');
  await mp.locator('#pf-price').focus(); await mp.keyboard.type('25 000');
  ok('14 no horizontal scroll (form)', await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const barVisible = await mp.locator('.pa-savebar').boundingBox();
  ok('14 save bar visible at bottom', barVisible && barVisible.y + barVisible.height <= 844 + 1, JSON.stringify(barVisible));
  await mp.locator('[data-act="publish"]').focus(); await mp.keyboard.press('Enter');
  await mp.waitForSelector('.pa-save-state.is-ok');
  await mp.goto(BASE + 'index.html'); await mp.waitForTimeout(400);
  ok('14 mobile-published machine on site', nb(await mp.locator('#nabidka').innerText()).includes('Mobilní automat') && nb(await mp.locator('#nabidka').innerText()).includes('25 000 Kč'));
  await m.close();

  console.log(results.map((r) => r.join(' | ')).join('\n'));
  console.log('pageerrors:', errs.length ? errs.join('\n') : 'none');
  console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`);
  await b.close();
})();
