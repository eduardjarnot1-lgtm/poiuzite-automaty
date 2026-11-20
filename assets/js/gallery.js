// Product gallery: thumbnails swap the main photo. Without JS each thumbnail links to the full image.
(() => {
  document.querySelectorAll('[data-gallery]').forEach((g) => {
    const main = g.querySelector('.gallery-main img');
    const links = [...g.querySelectorAll('.gallery-thumbs a')];
    links.forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      main.removeAttribute('srcset');
      main.src = a.dataset.full;
      main.alt = a.dataset.alt;
      links.forEach((l) => l.toggleAttribute('aria-current', l === a));
      if (a.hasAttribute('aria-current')) a.setAttribute('aria-current', 'true');
    }));
    // touch: a horizontal swipe on the main photo shows the next or previous one; vertical
    // movement is left to the page (touch-action: pan-y in site.css), the thumbnails stay the
    // accessible controls
    let x0 = null, y0 = 0;
    const box = g.querySelector('.gallery-main');
    box.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
    box.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      const i = links.findIndex((l) => l.hasAttribute('aria-current'));
      links[(Math.max(0, i) + (dx < 0 ? 1 : -1) + links.length) % links.length]?.click();
    }, { passive: true });
  });
})();
