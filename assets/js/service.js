(() => {
  const section = document.getElementById('servis');
  const video = document.getElementById('serviceVideo');
  if (!section || !video) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const canObserve = 'IntersectionObserver' in window;
  let loaded = false;
  let visible = false;
  video.autoplay = false;   // playback is driven below, only while the section is on screen

  // Attach the sources only when the section is near, so the video never competes with the hero.
  function load() {
    if (loaded || reduce.matches) return;
    // never compete with the hero: wait for the rest of the page to finish loading first
    if (document.readyState !== 'complete') { addEventListener('load', load, { once: true }); return; }
    loaded = true;
    video.querySelectorAll('source[data-src]').forEach(s => { s.src = s.dataset.src; });
    video.load();
    if (visible) play();
  }
  function play() {
    if (reduce.matches) return;
    if (!loaded) { load(); if (!loaded) return; }
    const p = video.play();
    if (p && p.catch) p.catch(() => {});   // autoplay refused: the poster simply stays
  }
  function pause() { if (!video.paused) video.pause(); }

  reduce.addEventListener?.('change', () => { if (reduce.matches) pause(); });

  if (!canObserve) { play(); return; }

  // start buffering a screen ahead; play only while visible
  new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) load();
  }, { rootMargin: '50% 0px' }).observe(section);

  new IntersectionObserver(entries => {
    entries.forEach(e => { visible = e.isIntersecting; visible ? play() : pause(); });
  }, { threshold: 0.15 }).observe(section);

  // restrained reveal of the copy and steps, armed only once JS runs
  if (!reduce.matches) {
    section.classList.add('reveal');
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { section.classList.add('in'); io.disconnect(); }
    }, { threshold: 0.2 });
    io.observe(section);
  }
})();
