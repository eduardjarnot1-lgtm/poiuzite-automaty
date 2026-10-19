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
  });
})();
