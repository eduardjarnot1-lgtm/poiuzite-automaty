// Two-level browsing: the category cards select a category and reveal its machines below,
// instead of leaving the page. The selection is kept in the URL hash (#nabidka-<slug>).
(() => {
  const root = document.querySelector('[data-browse]');
  if (!root) return;
  const links = [...root.querySelectorAll('[data-browse-cat]')];
  const panels = [...root.querySelectorAll('.browse-panel')];
  const hint = root.querySelector('[data-browse-hint]');
  root.classList.add('is-enhanced');

  function select(slug, { focus = false, push = false } = {}) {
    const panel = document.getElementById(`nabidka-${slug}`);
    if (!panel) return;
    links.forEach((a) => {
      const on = a.dataset.browseCat === slug;
      a.setAttribute('aria-expanded', String(on));
      a.closest('li').classList.toggle('is-selected', on);
    });
    panels.forEach((p) => { p.hidden = p !== panel; });
    hint.hidden = true;
    panel.querySelector('[data-carousel]')?.carouselUpdate?.();
    if (push) history.replaceState(null, '', `#${panel.id}`);
    if (focus) {
      panel.focus({ preventScroll: true });
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Slightly deferred: Chromium on touch devices drops a scroll started inside the tap itself.
      setTimeout(() => panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }), 100);
    }
  }

  links.forEach((a) => {
    a.setAttribute('aria-expanded', 'false');
    a.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;  // new tab still opens the category page
      e.preventDefault();
      select(a.dataset.browseCat, { focus: true, push: true });
    });
  });

  const fromHash = location.hash.match(/^#nabidka-([a-z0-9-]+)$/);
  if (fromHash && document.getElementById(`nabidka-${fromHash[1]}`)) select(fromHash[1]);
  else hint.hidden = false;
})();
