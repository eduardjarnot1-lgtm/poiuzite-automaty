(() => {
  const hero = document.getElementById('hero');
  const label = document.getElementById('sceneLabel');
  const btnB = document.getElementById('btnBefore');
  const btnA = document.getElementById('btnAfter');

  /* ---------- before / after ---------- */
  let animTimer;
  function setState(next) {
    if (hero.dataset.state === next) return;
    hero.dataset.state = next;
    hero.classList.add('animating');
    btnB.setAttribute('aria-pressed', String(next === 'before'));
    btnA.setAttribute('aria-pressed', String(next === 'after'));
    label.textContent = next === 'after'
      ? 'Tytéž tři prodejní automaty po opravě.'
      : 'Tři prodejní automaty v dílně před opravou.';
    clearTimeout(animTimer);
    animTimer = setTimeout(() => hero.classList.remove('animating'), 1600);
  }
  btnB.addEventListener('click', () => setState('before'));
  btnA.addEventListener('click', () => setState('after'));
  hero.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowLeft') setState('before');
    if (e.key === 'ArrowRight') setState('after');
  });

  /* ---------- pointer parallax ---------- */
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 721px) and (hover: hover) and (pointer: fine)');
  const target = { x: 0, y: 0 };
  const cur = { x: 0, y: 0 };
  let raf = 0, lastMove = 0, t0 = performance.now();

  const enabled = () => desktop.matches && !reduce.matches;

  function onMove(e) {
    const r = hero.getBoundingClientRect();
    target.x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    target.y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    lastMove = performance.now();
    start();
  }
  function onLeave() { target.x = 0; target.y = 0; lastMove = 0; start(); }

  function tick(now) {
    // with no pointer for a while, drift very slowly so the scene keeps a little life
    if (now - lastMove > 2500) {
      const s = (now - t0) / 1000;
      target.x = Math.sin(s * 0.42) * 0.22;
      target.y = Math.sin(s * 0.31 + 1.3) * 0.12;
    }
    cur.x += (target.x - cur.x) * 0.06;
    cur.y += (target.y - cur.y) * 0.06;
    hero.style.setProperty('--px', cur.x.toFixed(4));
    hero.style.setProperty('--py', cur.y.toFixed(4));
    raf = document.hidden ? 0 : requestAnimationFrame(tick);
  }
  function start() { if (!raf && enabled()) raf = requestAnimationFrame(tick); }
  function stop() {
    cancelAnimationFrame(raf); raf = 0;
    cur.x = cur.y = target.x = target.y = 0;
    hero.style.setProperty('--px', 0); hero.style.setProperty('--py', 0);
  }
  function sync() { enabled() ? start() : stop(); }

  hero.addEventListener('pointermove', onMove, { passive: true });
  hero.addEventListener('pointerleave', onLeave);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  reduce.addEventListener?.('change', sync);
  desktop.addEventListener?.('change', sync);
  sync();

  // play the change once after load, then leave it to the visitor
  if (!reduce.matches) setTimeout(() => setState('after'), 1400);
  else setState('after');
})();
