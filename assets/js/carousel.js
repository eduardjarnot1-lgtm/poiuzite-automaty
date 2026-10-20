// Machine carousels: arrow buttons, position indicator and arrow-key navigation on top of a
// natively scrolling, scroll-snapped track (so swipe and plain scrolling work on their own).
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  function init(root) {
    const track = root.querySelector('.carousel-track');
    const slides = [...track.children];
    const prev = root.querySelector('[data-carousel-prev]');
    const next = root.querySelector('[data-carousel-next]');
    const current = root.querySelector('[data-carousel-current]');
    const bar = root.querySelector('[data-carousel-progress]');
    let index = -1;

    const edge = () => track.getBoundingClientRect().left + (parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0);
    // The slide whose left edge sits closest to the track's snap edge.
    const nearest = () => {
      const left = edge();
      let best = 0, dist = Infinity;
      slides.forEach((s, i) => {
        const d = Math.abs(s.getBoundingClientRect().left - left);
        if (d < dist) { dist = d; best = i; }
      });
      return best;
    };
    const atEnd = () => track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;

    function update() {
      const end = atEnd();
      const i = end ? slides.length - 1 : nearest();
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = end;
      if (i === index) return;
      index = i;
      current.textContent = String(i + 1);
      bar.style.transform = `scaleX(${(i + 1) / slides.length})`;
    }

    function go(i) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollBy({ left: slides[i].getBoundingClientRect().left - edge(), behavior: reduce.matches ? 'auto' : 'smooth' });
    }

    prev.addEventListener('click', () => go((atEnd() ? nearest() : index) - 1));
    next.addEventListener('click', () => go(index + 1));
    track.addEventListener('keydown', (e) => {
      if (e.target !== track) return;   // keys inside a card's links behave normally
      const to = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: slides.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      go(to);
    });

    let frame = 0;
    track.addEventListener('scroll', () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); }, { passive: true });
    addEventListener('resize', update);
    root.querySelector('[data-carousel-nav]').hidden = slides.length < 2;
    root.classList.add('is-ready');
    update();
    root.carouselUpdate = () => { index = -1; update(); };
  }

  document.querySelectorAll('[data-carousel]').forEach(init);
})();
