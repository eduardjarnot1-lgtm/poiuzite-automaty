// Homepage motion: the opening rises in once, its two headline lines drift apart as it scrolls
// away, the manifesto darkens word by word, and a thin rule on the right tracks the page.
// Everything is skipped when the visitor prefers reduced motion.
(() => {
  const body = document.body;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    body.classList.add('is-entered');
    document.querySelectorAll('[data-reveal-words] .w').forEach((w) => w.classList.add('on'));
    return;
  }

  const opening = document.querySelector('[data-opening]');
  const lines = opening ? [...opening.querySelectorAll('.line-in')] : [];
  const figure = opening?.querySelector('.opening-figure');
  const words = [...document.querySelectorAll('[data-reveal-words] .w')];
  const manifesto = document.querySelector('[data-reveal-words]');
  const meter = document.querySelector('.scroll-meter span');

  // Entry: wait for the display font so the lines don't reflow mid-animation (max 1.2 s).
  const enter = () => requestAnimationFrame(() => body.classList.add('is-entered'));
  Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1200))]).then(enter);

  let ticking = false, idle = 0;
  function frame() {
    ticking = false;
    const vh = innerHeight;
    if (opening) {
      const p = Math.min(1, Math.max(0, scrollY / opening.offsetHeight));
      const shift = p * Math.min(innerWidth * 0.12, 180);
      if (lines[0]) lines[0].style.setProperty('--shift', `${-shift}px`);
      if (lines[1]) lines[1].style.setProperty('--shift', `${shift}px`);
      figure?.style.setProperty('--lift', `${-p * 90}px`);
    }
    if (manifesto) {
      const r = manifesto.getBoundingClientRect();
      const t = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.3)));
      const lit = Math.round(t * words.length);
      words.forEach((w, i) => w.classList.toggle('on', i < lit));
    }
    if (meter) {
      const max = document.documentElement.scrollHeight - vh;
      meter.style.transform = `scaleY(${max > 0 ? scrollY / max : 0})`;
    }
  }
  addEventListener('scroll', () => {
    // While scrolling the parallax follows the finger directly, without the entry easing.
    if (body.classList.contains('is-entered')) {
      body.classList.add('is-scrolling');
      clearTimeout(idle);
      idle = setTimeout(() => body.classList.remove('is-scrolling'), 150);
    }
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }, { passive: true });
  addEventListener('resize', frame);
  frame();
})();
