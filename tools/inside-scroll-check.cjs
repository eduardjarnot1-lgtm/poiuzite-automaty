// Browser checks of the scroll-driven "Podívejte se dovnitř automatu" section (Playwright, Chromium).
// Build to dist/, serve it with HTTP range support on :8080, then: node tools/inside-scroll-check.cjs
const { chromium } = require('playwright');
const BASE = 'http://localhost:8080/';
const out = [];
const ok = (n, c, x = '') => out.push(`${c ? 'PASS' : 'FAIL'} | ${n} | ${x}`);
(async () => {
  const b = await chromium.launch();
  const errs = [];
  const mk = async (opts = {}) => { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, ...opts }); const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); return p; };
  const state = (p) => p.evaluate(() => {
    const s = document.querySelector('[data-inside]'); const v = s.querySelector('video'); const st = s.querySelector('[data-inside-stage]').getBoundingClientRect();
    const a = [...s.querySelectorAll('.inside-step')].findIndex((e) => e.classList.contains('is-active'));
    return { mode: s.dataset.mode, t: +v.currentTime.toFixed(2), seeking: v.seeking, ready: v.readyState, active: a, from: +s.querySelectorAll('.inside-step')[a].dataset.from, to: +s.querySelectorAll('.inside-step')[a].dataset.to, count: s.querySelector('[data-inside-count]').textContent.trim(), stageTop: Math.round(st.top), stageBottom: Math.round(st.bottom), paused: v.paused, controls: v.controls };
  });
  const geo = (p) => p.evaluate(() => { const tr = document.querySelector('[data-inside-track]'); const r = tr.getBoundingClientRect(); return { top: r.top + scrollY, h: r.height, stage: document.querySelector('[data-inside-stage]').offsetHeight, stick: parseFloat(getComputedStyle(document.querySelector('[data-inside]')).getPropertyValue('--inside-top')) }; });
  const settle = async (p) => { for (let i = 0; i < 40; i++) { await p.waitForTimeout(60); const s = await p.evaluate(() => { const v = document.querySelector('[data-inside] video'); return !v.seeking; }); if (s) { await p.waitForTimeout(250); if (await p.evaluate(() => !document.querySelector('[data-inside] video').seeking)) return; } } };
  const scrollP = async (p, frac) => { const g = await geo(p); const dist = g.h - g.stage; await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round(g.top - g.stick + frac * dist)); await settle(p); return state(p); };

  // desktop
  const p = await mk();
  await p.goto(BASE + 'index.html');
  await p.waitForFunction(() => document.querySelector('[data-inside]').dataset.mode);
  let g = await geo(p);
  ok('desktop scrub mode', (await state(p)).mode === 'scrub', JSON.stringify(g));
  ok('track ≈ 3.2 screens + stage', Math.abs(g.h - g.stage - 900 * 3.2) < 2);
  await scrollP(p, 0); await p.waitForFunction(() => document.querySelector('[data-inside] video').readyState >= 1, null, { timeout: 15000 });
  const D = await p.evaluate(() => document.querySelector('[data-inside] video').duration);
  const steps = await p.evaluate(() => [...document.querySelectorAll('.inside-step')].map((e) => [+e.dataset.from, +e.dataset.to]));
  // slow forward scroll: 40 small steps, check text matches time each time
  let mism = 0, maxLag = 0;
  for (let i = 0; i <= 40; i++) {
    const s = await scrollP(p, i / 40);
    const expect = (i / 40) * (D - 0.04);
    maxLag = Math.max(maxLag, Math.abs(s.t - expect));
    if (!(s.t >= s.from - 0.05 && s.t <= s.to + 0.05)) mism++;
  }
  ok('slow forward: text matches frame time', mism === 0, `mismatches=${mism} maxLag=${maxLag.toFixed(2)}s`);
  ok('slow forward: video follows scroll', maxLag < 0.1);
  // per-step screenshots at step midpoints
  for (let k = 0; k < steps.length; k++) {
    const mid = (steps[k][0] + steps[k][1]) / 2;
    const s = await scrollP(p, mid / (D - 0.04));
    ok(`step ${k + 1} at ${mid.toFixed(1)}s`, s.active === k && s.count.endsWith(`0${k + 1} / 06`), JSON.stringify(s));
    await p.screenshot({ path: require('path').join(require('os').tmpdir(), `inside-step-${k + 1}.png`) });
  }
  // backward
  mism = 0;
  for (let i = 40; i >= 0; i -= 2) { const s = await scrollP(p, i / 40); if (!(s.t >= s.from - 0.05 && s.t <= s.to + 0.05)) mism++; }
  ok('slow backward: rewinds with text', mism === 0 && (await state(p)).active === 0, `mismatches=${mism}`);
  // fast scrolling: jumps
  for (const f of [1, 0.1, 0.9, 0.45]) {
    await p.evaluate(async (f) => { const tr = document.querySelector('[data-inside-track]'); const rr = tr.getBoundingClientRect(); const r = { top: rr.top + scrollY, height: rr.height }; const st = document.querySelector('[data-inside-stage]').offsetHeight; const stick = parseFloat(getComputedStyle(document.querySelector('[data-inside]')).getPropertyValue('--inside-top')); for (let i = 0; i < 6; i++) { window.scrollTo({ top: r.top - stick + Math.random() * (r.height - st), behavior: 'instant' }); await new Promise((r) => setTimeout(r, 16)); } window.scrollTo({ top: r.top - stick + f * (r.height - st), behavior: 'instant' }); }, f);
    await settle(p);
    const s = await state(p);
    ok(`fast jumps end at ${f}`, Math.abs(s.t - f * (D - 0.04)) < 0.06 && s.t >= s.from - 0.05 && s.t <= s.to + 0.05, JSON.stringify({ t: s.t, active: s.active }));
  }
  // sticky entry/exit
  let s = await scrollP(p, 0.5);
  ok('stage pinned in view while inside', s.stageTop >= 0 && s.stageBottom <= 900, JSON.stringify(s));
  g = await geo(p);
  await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), g.top + g.h + 200);
  await p.waitForTimeout(200);
  s = await state(p);
  ok('releases after the section', s.stageBottom < 0 + 900 && s.stageTop < 0, JSON.stringify(s));
  ok('video never plays by itself', s.paused);
  // keyboard
  await scrollP(p, 0);
  await p.focus('[data-inside-next]'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500); await settle(p);
  s = await state(p);
  ok('keyboard next → step 2', s.active === 1 && s.t >= 1.3 && s.t < 10.6, JSON.stringify(s));
  ok('live region announces', (await p.textContent('[data-inside-live]')).includes('Krok 2 z 6'));
  await p.keyboard.press('Tab'); // to prev? order is prev then next; shift+tab to prev
  await p.focus('[data-inside-prev]'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500); await settle(p);
  s = await state(p);
  ok('keyboard prev → step 1', s.active === 0, JSON.stringify(s));
  await p.focus('[data-inside-prev]'); await p.keyboard.press('Tab'); const focusVisible = await p.evaluate(() => { const b = document.activeElement; return b.textContent + ':' + getComputedStyle(b).outlineStyle; });
  ok('visible focus style', focusVisible.startsWith('Další') && !focusVisible.endsWith('none'), focusVisible);
  // details opens without changing stage size
  const h0 = (await geo(p)).stage;
  await p.click('[data-inside-all] summary');
  const h1 = (await geo(p)).stage;
  ok('full description opens without layout shift', h0 === h1, `${h0} ${h1}`);
  ok('full description lists 6 steps', (await p.locator('[data-inside-all] li').count()) === 6);
  await p.click('[data-inside-all] summary');
  // load near the section
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await p.goto(BASE + 'index.html#pohled-dovnitr');
  await p.waitForTimeout(1500); await settle(p);
  s = await state(p);
  ok('direct load at section', s.mode === 'scrub' && s.active === 0, JSON.stringify(s));
  // reload in the middle of the sequence
  await scrollP(p, 0.6); await p.reload(); await p.waitForTimeout(2000); await settle(p);
  s = await state(p);
  ok('reload mid-sequence restores frame and text', s.t > 12 && s.t >= s.from - 0.05 && s.t <= s.to + 0.05, JSON.stringify(s));
  // resize to mobile and back
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(500);
  s = await state(p);
  const mobOrder = await p.evaluate(() => { const v = document.querySelector('.inside-media').getBoundingClientRect(); const t = document.querySelector('.inside-text').getBoundingClientRect(); return v.top < t.top; });
  ok('resize to phone: scrub, video above text', s.mode === 'scrub' && mobOrder, JSON.stringify(s));
  await scrollP(p, 0.5); s = await state(p);
  ok('phone: stage fits screen', s.stageTop >= 0 && s.stageBottom <= 844, JSON.stringify(s));
  await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'inside-phone.png') });
  await p.setViewportSize({ width: 740, height: 390 }); await p.waitForTimeout(500);
  s = await state(p);
  ok('short landscape screen → manual video', s.mode === 'manual' && s.controls, JSON.stringify(s));
  await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(500);
  ok('back to desktop → scrub', (await state(p)).mode === 'scrub');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  ok('no horizontal overflow', !overflow);

  // reduced motion
  const r = await mk({ reducedMotion: 'reduce' });
  await r.goto(BASE + 'index.html#pohled-dovnitr'); await r.waitForTimeout(800);
  s = await state(r);
  ok('reduced motion: manual video, list open', s.mode === 'manual' && s.controls && s.paused && await r.evaluate(() => document.querySelector('[data-inside-all]').open), JSON.stringify(s));
  await r.waitForFunction(() => document.querySelector('[data-inside] video').readyState >= 1, null, { timeout: 15000 });
  await r.click('[data-inside-next]'); await r.click('[data-inside-next]'); await r.waitForTimeout(500);
  s = await state(r);
  ok('reduced motion: step buttons seek video', s.active === 2 && s.t >= 10.6 && s.t < 13.8, JSON.stringify(s));
  await r.evaluate(() => { const v = document.querySelector('[data-inside] video'); v.currentTime = 18; });
  await r.waitForTimeout(500);
  ok('manual: text follows playback time', (await state(r)).active === 4);

  // video failure
  const f = await mk();
  await f.route(/automat-zevnitr\.(webm|mp4)/, (route) => route.abort());
  await f.goto(BASE + 'index.html#pohled-dovnitr'); await f.waitForTimeout(1500);
  s = await state(f);
  ok('video failure → still poster + steps', s.mode === 'still' && !s.controls, JSON.stringify(s));
  await f.click('[data-inside-next]'); await f.waitForTimeout(200);
  ok('failure: buttons still change text', (await state(f)).active === 1);
  const posterShown = await f.evaluate(() => document.querySelector('[data-inside] video').getAttribute('poster'));
  ok('failure: poster kept', !!posterShown);

  // no range support → in-memory fallback keeps scrubbing
  const n = await mk();
  await n.route(/automat-zevnitr\.webm/, async (route) => { const fs = require('fs'); route.fulfill({ status: 200, contentType: 'video/webm', body: fs.readFileSync(require('path').join(__dirname, '..', 'dist', 'assets', 'video', 'automat-zevnitr.webm')) }); });
  await n.goto(BASE + 'index.html#pohled-dovnitr'); await n.waitForTimeout(2500);
  await scrollP(n, 0.75); await n.waitForTimeout(800); await settle(n);
  s = await state(n);
  ok('no-range server: still seeks', s.mode !== 'still' && Math.abs(s.t - 0.75 * (D - 0.04)) < 0.2, JSON.stringify(s));

  console.log(out.join('\n'));
  console.log('errors:', errs.join(' | ') || 'none');
  console.log(out.filter((x) => x.startsWith('PASS')).length + '/' + out.length);
  await b.close();
})();
