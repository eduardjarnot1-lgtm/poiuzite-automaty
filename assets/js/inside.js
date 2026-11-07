// "Podívejte se dovnitř automatu": a guided look at the illustrative 3D animation.
//
// Modes (set on the section as data-mode):
// - scrub:  the section becomes a tall track; its stage sticks to the screen and the scroll
//           position inside the track sets the video time (start of the track = 0 s, end = the
//           end of the video). The active explanation is derived from that same time, using the
//           step timestamps in the markup (data-from / data-to, from INSIDE_STEPS in pages.mjs).
// - manual: a normal video with its own controls; the explanation follows its playback time.
//           Used with prefers-reduced-motion, when the stage would not fit the screen height,
//           and when the video cannot be sought.
// - still:  the video failed to load: the poster stays, the step buttons switch the text.
// Without JS the video keeps its native controls and the full description is in the page.
// Native scrolling only: no wheel interception, no scroll snapping.
(() => {
  const section = document.querySelector('[data-inside]');
  const video = section?.querySelector('video');
  if (!video) return;
  const track = section.querySelector('[data-inside-track]');
  const stage = section.querySelector('[data-inside-stage]');
  const steps = [...section.querySelectorAll('.inside-step')].map((el) => ({ el, from: +el.dataset.from, to: +el.dataset.to, title: el.querySelector('h3').textContent }));
  const current = section.querySelector('[data-inside-current]');
  const hint = section.querySelector('[data-inside-hint]');
  const nav = section.querySelector('[data-inside-nav]');
  const prevBtn = section.querySelector('[data-inside-prev]');
  const nextBtn = section.querySelector('[data-inside-next]');
  const live = section.querySelector('[data-inside-live]');
  const all = section.querySelector('[data-inside-all]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const SCROLL_SCREENS = 3.2;      // scroll distance of the whole sequence, in screen heights
  const END_GAP = 0.04;            // stop just before the last frame, which some decoders skip

  let duration = +section.dataset.duration || 25;
  let ready = false;               // metadata known: progress can be mapped to time
  let failed = false;
  let mode = null;
  let active = -1;
  let target = 0;                  // the time the scroll position asks for
  let shown = 0;                   // the time last sent to the video (smoothed towards target)
  let seekingTo = null;
  let raf = 0;

  const pad = (n) => String(n).padStart(2, '0');
  const stepAt = (t) => {
    for (let i = steps.length - 1; i >= 0; i--) if (t >= steps[i].from - 0.001) return i;
    return 0;
  };

  function setActive(i, announce = false) {
    if (i !== active) {
      steps.forEach((s, k) => {
        s.el.classList.toggle('is-active', k === i);
        s.el.hidden = k !== i;
      });
      current.textContent = pad(i + 1);
      active = i;
      prevBtn.disabled = i === 0;
      nextBtn.disabled = i === steps.length - 1;
    }
    // announced only when a step button was used, never on scroll frames
    if (announce) live.textContent = `Krok ${i + 1} z ${steps.length}: ${steps[i].title}`;
  }
  const setBar = (t) => section.style.setProperty('--inside-p', Math.min(1, Math.max(0, t / duration)).toFixed(4));

  /* ---------- video loading and seeking ---------- */
  let loading = false;
  function load() {
    if (loading) return;
    loading = true;
    video.preload = 'auto';
    video.load();
  }
  function onMeta() {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    duration = video.duration;
    ready = true;
    if (mode === 'scrub' && !seekable()) loadFromMemory();
    update();
  }
  // Without HTTP range support the video cannot be sought; load it once into memory instead.
  const seekable = () => video.seekable.length > 0 && video.seekable.end(video.seekable.length - 1) > duration - 1;
  let memory = false;
  let noScrub = false;             // scroll control turned out to be unreliable here
  function loadFromMemory() {
    if (memory) return;
    memory = true;
    const src = video.currentSrc;
    ready = false;
    fetch(src).then((r) => (r.ok ? r.blob() : Promise.reject(r.status))).then((blob) => {
      const t = video.currentTime;
      video.src = URL.createObjectURL(blob);
      video.addEventListener('loadedmetadata', () => { video.currentTime = t; }, { once: true });
    }).catch(() => { noScrub = true; setMode('manual'); });
  }
  function fail() {
    if (failed) return;
    failed = true;
    section.classList.add('is-failed');
    setMode('still');
  }
  video.addEventListener('loadedmetadata', onMeta);
  video.addEventListener('error', fail);
  video.querySelectorAll('source').forEach((s, i, list) => { if (i === list.length - 1) s.addEventListener('error', fail); });
  video.addEventListener('seeked', () => {
    seekingTo = null;
    if (mode === 'scrub') kick(); // catch up with the latest scroll position
  });

  function seek(t) {
    if (!ready || video.seeking || seekingTo != null) return false;
    if (Math.abs(video.currentTime - t) < 0.02) return true;
    seekingTo = t;
    video.currentTime = t;
    return true;
  }

  /* ---------- scroll mapping ---------- */
  let trackTop = 0;
  let distance = 0;
  let stickTop = 16;
  function measure() {
    const vh = window.innerHeight;
    const h = stage.offsetHeight;
    stickTop = Math.max(12, Math.round((vh - h) / 2));
    section.style.setProperty('--inside-top', `${stickTop}px`);
    distance = Math.round(vh * SCROLL_SCREENS);
    track.style.height = `${h + distance}px`;
    trackTop = track.getBoundingClientRect().top + window.scrollY;
  }
  const progress = () => Math.min(1, Math.max(0, (window.scrollY + stickTop - trackTop) / distance));

  function tick() {
    raf = 0;
    if (mode !== 'scrub') return;
    target = progress() * Math.max(0, duration - END_GAP);
    // modest smoothing; it lands exactly on the target, so text and frame stay in step
    const d = target - shown;
    shown = Math.abs(d) < 0.03 || Math.abs(d) > 4 ? target : shown + d * 0.35;
    setBar(shown);
    setActive(stepAt(shown));
    hint.classList.toggle('is-gone', shown > 0.6);
    seek(shown); // skipped while a seek is running; 'seeked' brings us back here
    if (shown !== target) kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }
  function update() {
    if (mode === 'scrub') kick();
    else if (mode === 'manual' && ready) { setActive(stepAt(video.currentTime)); setBar(video.currentTime); }
  }

  /* ---------- modes ---------- */
  function setMode(next) {
    if (next === mode) return;
    mode = next;
    section.dataset.mode = next;
    section.classList.toggle('is-scrub', next === 'scrub');
    section.classList.toggle('is-manual', next !== 'scrub');
    nav.hidden = false;
    if (next === 'scrub') {
      video.controls = false;
      video.removeAttribute('controls');
      video.pause();
      video.setAttribute('tabindex', '-1');
      hint.hidden = false;
      all.open = false;
      measure();
      shown = target = progress() * Math.max(0, duration - END_GAP);
      kick();
    } else {
      track.style.height = '';
      video.removeAttribute('tabindex');
      hint.hidden = true;
      video.controls = next === 'manual';
      if (next === 'manual' && reduced.matches) all.open = true; // the whole explanation, in reading order
      setActive(stepAt(ready ? video.currentTime : 0));
      setBar(ready ? video.currentTime : 0);
    }
  }

  // Scroll control only when motion is welcome and the stage fits the screen as one piece.
  function chooseMode() {
    if (failed) return setMode('still');
    if (reduced.matches || noScrub) return setMode('manual');
    const prevMode = mode;
    if (mode !== 'scrub') { section.classList.add('is-scrub'); section.dataset.mode = 'scrub'; }
    const fits = stage.offsetHeight + 24 <= window.innerHeight && window.innerWidth >= 320;
    if (mode !== 'scrub') { section.classList.remove('is-scrub'); if (prevMode) section.dataset.mode = prevMode; else delete section.dataset.mode; }
    setMode(fits ? 'scrub' : 'manual');
    if (mode === 'scrub') measure();
  }

  /* ---------- step buttons ---------- */
  function goTo(i) {
    i = Math.max(0, Math.min(steps.length - 1, i));
    const s = steps[i];
    // a moment into the step, so the frame clearly belongs to it
    const t = i === 0 ? 0 : Math.min(s.to - 0.05, s.from + Math.min(0.6, (s.to - s.from) / 3));
    setActive(i, true);
    if (mode === 'scrub') {
      measure();
      const y = trackTop - stickTop + (t / Math.max(0.001, duration - END_GAP)) * distance;
      window.scrollTo({ top: Math.ceil(y), behavior: reduced.matches ? 'auto' : 'smooth' });
    } else if (mode === 'manual' && ready) {
      video.pause();
      video.currentTime = t;
      setBar(t);
    } else {
      setBar(t);
    }
  }
  prevBtn.addEventListener('click', () => goTo(active - 1));
  nextBtn.addEventListener('click', () => goTo(active + 1));

  video.addEventListener('timeupdate', () => { if (mode === 'manual') update(); });
  video.addEventListener('seeked', () => { if (mode === 'manual') update(); });
  video.addEventListener('play', () => { if (mode === 'scrub') video.pause(); });

  window.addEventListener('scroll', () => { if (mode === 'scrub') kick(); }, { passive: true });
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { chooseMode(); update(); }, 120);
  });
  reduced.addEventListener?.('change', () => { chooseMode(); update(); });
  // fonts and images can change the stage height after the first measurement
  window.addEventListener('load', () => { if (mode === 'scrub') { measure(); kick(); } });

  // fetch the video a little before the section comes into view (or now, if the page opens on it)
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries, obs) => {
      if (entries.some((e) => e.isIntersecting)) { load(); obs.disconnect(); }
    }, { rootMargin: '600px 0px' }).observe(section);
  } else load();

  setActive(0);
  chooseMode();
  if (video.readyState >= 1) onMeta();
})();
