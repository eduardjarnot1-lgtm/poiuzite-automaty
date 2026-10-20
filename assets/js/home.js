// Homepage motion: the headline rises in once, the machine fades up after it, and later sections
// fade in as they reach the viewport. Nothing moves with the scroll, and nothing at all happens
// when the visitor prefers reduced motion (the content is never hidden in that case or without JS).
(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const body = document.body;
  body.classList.add('has-motion');

  // Wait for the display font so the lines don't reflow mid-animation (at most 1 s).
  const enter = () => requestAnimationFrame(() => requestAnimationFrame(() => body.classList.add('is-entered')));
  Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1000))]).then(enter);

  const items = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('is-revealed')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-revealed');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
  items.forEach((el) => io.observe(el));
})();
