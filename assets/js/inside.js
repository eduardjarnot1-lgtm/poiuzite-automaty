// "Podívejte se dovnitř automatu": plays the illustrative animation once when about half of it is
// in view, pauses it off screen or in a hidden tab, and replaces the native controls with one
// play / pause / replay button. Reduced motion: nothing starts by itself. Without JS the
// video keeps its native controls.
(() => {
  const frame = document.querySelector('[data-inside]');
  const video = frame?.querySelector('video');
  if (!video || !('IntersectionObserver' in window)) return;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');

  video.controls = false;
  video.removeAttribute('controls');
  video.muted = true;
  video.setAttribute('tabindex', '-1');

  const PLAY = '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  const PAUSE = '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
  const AGAIN = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inside-control';
  // The control sits under the video, next to the caption, so it never covers the machine.
  const bar = document.createElement('div');
  bar.className = 'inside-bar';
  const caption = frame.parentElement.querySelector('figcaption');
  frame.after(bar);
  bar.append(button);
  if (caption) bar.append(caption);

  const render = () => {
    const ended = video.ended;
    const playing = !video.paused && !ended;
    const [icon, text] = ended ? [AGAIN, 'Přehrát znovu'] : playing ? [PAUSE, 'Pozastavit'] : [PLAY, video.currentTime > 0 ? 'Pokračovat' : 'Přehrát animaci'];
    button.innerHTML = `${icon}<span>${text}</span>`;
    button.setAttribute('aria-label', ended ? 'Přehrát animaci znovu' : playing ? 'Pozastavit animaci' : 'Přehrát animaci');
    frame.classList.toggle('is-playing', playing);
  };
  ['play', 'playing', 'pause', 'ended'].forEach((e) => video.addEventListener(e, render));
  render();

  let loaded = false;
  const load = () => { if (loaded) return; loaded = true; video.preload = 'auto'; video.load(); };
  let started = false;      // the one automatic start has happened
  let pausedByView = false; // paused because it left the view or the tab was hidden
  let inView = false;
  const play = () => { load(); return video.play().catch(() => render()); }; // blocked: poster + play button stay

  button.addEventListener('click', () => {
    started = true; pausedByView = false;
    if (video.ended) { video.currentTime = 0; play(); }
    else if (video.paused) play();
    else video.pause();
  });

  // fetch the video shortly before the section scrolls in
  new IntersectionObserver((entries, obs) => {
    if (entries.some((e) => e.isIntersecting)) { load(); obs.disconnect(); }
  }, { rootMargin: '300px 0px' }).observe(frame);

  new IntersectionObserver((entries) => {
    for (const e of entries) {
      inView = e.intersectionRatio >= 0.5;
      if (inView) {
        if (!started && !still.matches && !document.hidden) { started = true; play(); }
        else if (pausedByView && !document.hidden) { pausedByView = false; play(); }
      } else if (!e.isIntersecting && !video.paused) {
        pausedByView = true; video.pause();
      }
    }
  }, { threshold: [0, 0.5] }).observe(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !video.paused) { pausedByView = true; video.pause(); }
    else if (!document.hidden && pausedByView && inView) { pausedByView = false; play(); }
  });
})();
