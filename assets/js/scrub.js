/* Servis section: one scroll timeline in two phases.
   1. Cover: a service cover over the pinned frame lifts and folds away, revealing the
      video held on its first frame (--cover-distance).
   2. Scrub: scroll position drives the video's currentTime and the step copy
      (--scrub-distance).
   The page scrolls normally; nothing intercepts wheel, keyboard or touch input. The sticky
   frame (CSS) holds everything in view while the tall section scrolls past. Runs only when <head> added .js-scrub (video
   playable, no reduced motion); otherwise the section stays a static layout. */
(function () {
  'use strict';

  var root = document.documentElement;
  var section = document.querySelector('.scrub');
  var video = document.getElementById('scrubVideo');
  if (!section || !video || !root.classList.contains('js-scrub')) return;

  var FRAME = 1 / 24;          // footage frame time
  var EASE = 0.45;             // per-frame smoothing toward the scroll target; higher settles faster
  var END_GUARD = 0.05;        // stay just inside the last frame, some decoders show black at duration

  var panels = Array.prototype.map.call(section.querySelectorAll('.scrub-panel'), function (el) {
    return {
      el: el,
      from: parseFloat(el.dataset.from) || 0,
      to: el.dataset.to != null ? parseFloat(el.dataset.to) : Infinity,
      step: (el.querySelector('.scrub-no') || {}).textContent
    };
  });
  var fill = section.querySelector('.scrub-fill');
  var cover = section.querySelector('.scrub-cover');
  var coverDim = cover && cover.querySelector('.cover-dim');
  var leafTop = cover && cover.querySelector('.cover-top');
  var leafBottom = cover && cover.querySelector('.cover-bottom');
  var marks = Array.prototype.slice.call(section.querySelectorAll('.scrub-marks span'));

  var duration = parseFloat(section.dataset.duration) || 0;  // replaced by the real value on loadedmetadata
  var ready = false;          // metadata known, seeking allowed
  var loading = false;
  var target = 0;             // 0..1 through the whole section, from scroll
  var pos = 0;                // the same, smoothed
  var shown = 0;              // video seconds derived from pos
  var coverShare = 0.2;       // share of the timeline used by the cover; read from CSS
  var travel = 1;             // scrollable px through the section
  var coverState = -1;
  var lastSeek = -1;
  var pendingSeek = false;
  var raf = 0;
  var active = -1;
  var observer = null;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function measure() {
    var cs = getComputedStyle(section);
    var c = parseFloat(cs.getPropertyValue('--cover-distance')) || 0;
    var v = parseFloat(cs.getPropertyValue('--scrub-distance')) || 0;
    coverShare = cover && c + v > 0 ? c / (c + v) : 0;
  }

  function progress() {
    var r = section.getBoundingClientRect();
    travel = r.height - window.innerHeight;
    if (travel <= 0) return 0;
    return clamp(-r.top / travel, 0, 1);
  }

  function smooth(x) { return x * x * (3 - 2 * x); }

  // Cover phase: the top leaf swings up from its top edge while the lower leaf folds
  // back across the middle crease; the pair then lifts clear of the frame.
  function renderCover(p) {
    if (!cover) return;
    var state = p <= 0 ? 0 : p >= 1 ? 2 : 1;
    if (state !== coverState) {
      cover.style.visibility = state === 2 ? 'hidden' : '';
      cover.style.willChange = state === 1 ? 'transform' : '';
      coverState = state;
    }
    if (state === 2) return;
    var e = smooth(p);
    var lift = Math.pow(clamp((p - 0.08) / 0.92, 0, 1), 1.35);
    var h = window.innerHeight;
    leafTop.style.transform = p ? 'translate3d(0,' + (-lift * h * 1.1).toFixed(1) + 'px,0) rotateX(' + (58 * e).toFixed(2) + 'deg)' : '';
    leafBottom.style.transform = p ? 'rotateX(' + (-128 * e).toFixed(2) + 'deg)' : '';
    leafTop.style.setProperty('--shade', (0.08 * e).toFixed(3));
    leafBottom.style.setProperty('--shade', (0.34 * e).toFixed(3));
    coverDim.style.opacity = (Math.sin(Math.PI * Math.min(1, p * 1.15)) * 0.9).toFixed(3);
  }

  function seek(t) {
    if (!ready) return;
    t = clamp(t, 0, Math.max(0, duration - END_GUARD));
    if (Math.abs(t - lastSeek) < FRAME / 2) return;      // same frame, skip
    if (video.seeking) { pendingSeek = true; return; }   // let the decoder finish; we catch up on 'seeked'
    lastSeek = t;
    video.currentTime = t;     // precise seek; the encode has a keyframe every 6 frames so this stays quick
  }

  function render() {
    var p = duration ? shown / duration : 0;
    if (fill) fill.style.transform = 'scaleX(' + p.toFixed(4) + ')';

    var idx = 0;
    for (var i = 0; i < panels.length; i++) {
      if (shown >= panels[i].from) idx = i;
    }
    if (idx !== active) {
      if (active >= 0) panels[active].el.classList.remove('is-active');
      panels[idx].el.classList.add('is-active');
      active = idx;
      var step = parseInt(panels[idx].step, 10) || (idx === panels.length - 1 ? marks.length + 1 : 0);
      marks.forEach(function (m, k) {
        m.classList.toggle('is-current', k + 1 === step);
        m.classList.toggle('is-done', k + 1 < step);
      });
    }
  }

  function apply() {
    var cp = coverShare ? clamp(pos / coverShare, 0, 1) : 1;
    var vp = clamp((pos - coverShare) / (1 - coverShare), 0, 1);
    shown = vp * duration;
    renderCover(cp);
    render();
    seek(shown);
  }

  function tick() {
    raf = 0;
    var d = target - pos;
    if (Math.abs(d * travel) < 0.5) pos = target;   // within half a pixel: stop
    else pos += d * EASE;
    apply();
    if (pos !== target) raf = requestAnimationFrame(tick);
  }

  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  function onScroll() {
    target = progress();
    kick();
  }

  function onResize() {
    measure();
    onScroll();
  }

  function onSeeked() {
    if (pendingSeek) { pendingSeek = false; lastSeek = -1; seek(shown); }
  }

  // A server without HTTP range support leaves the video unseekable. In that case
  // fetch the file once and play it from memory, where every frame is reachable.
  function seekable() {
    var s = video.seekable;
    return s && s.length > 0 && s.end(s.length - 1) > 1;
  }

  function loadFromMemory() {
    if (!window.fetch || !window.URL || video.dataset.blob) return fail();
    video.dataset.blob = '1';
    ready = false;
    fetch(video.currentSrc).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.blob();
    }).then(function (b) {
      Array.prototype.forEach.call(video.querySelectorAll('source'), function (s) { s.remove(); });
      video.src = URL.createObjectURL(b);
      video.load();
    }).catch(fail);
  }

  function onMeta() {
    if (!seekable()) { loadFromMemory(); return; }
    if (isFinite(video.duration) && video.duration > 0) duration = video.duration;
    ready = true;
    // Some mobile browsers paint nothing until playback has started once.
    var p = video.play();
    if (p && p.then) p.then(function () { video.pause(); lastSeek = -1; seek(shown); }, function () {});
    else video.pause();
    target = pos = progress();
    lastSeek = -1;
    apply();
  }

  function fail() {
    destroy();
    root.classList.remove('js-scrub');
    section.classList.add('scrub--failed');
  }

  function load() {
    if (loading) return;
    loading = true;
    Array.prototype.forEach.call(video.querySelectorAll('source[data-src]'), function (s) {
      s.src = s.dataset.src;
      s.removeAttribute('data-src');
    });
    var sources = video.querySelectorAll('source');
    if (sources.length) sources[sources.length - 1].addEventListener('error', fail);
    video.preload = 'auto';
    video.load();
  }

  function startObserving() {
    if (!('IntersectionObserver' in window)) { load(); return; }
    observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        load();
        observer.disconnect();
        observer = null;
      }
    }, { rootMargin: '150% 0px' });
    observer.observe(section);
  }

  function onLoad() {
    window.removeEventListener('load', onLoad);
    startObserving();
  }

  function destroy() {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('load', onLoad);
    window.removeEventListener('pagehide', onHide);
    video.removeEventListener('loadedmetadata', onMeta);
    video.removeEventListener('seeked', onSeeked);
    video.removeEventListener('error', fail);
    if (observer) { observer.disconnect(); observer = null; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function onHide(e) { if (!e.persisted) destroy(); }

  video.muted = true;
  video.addEventListener('loadedmetadata', onMeta);
  video.addEventListener('seeked', onSeeked);
  video.addEventListener('error', fail);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pagehide', onHide);

  // Copy works from the first paint, before any video data arrives.
  measure();
  target = pos = progress();
  apply();

  // Hold the video download until the hero has finished loading.
  if (document.readyState === 'complete') startObserving();
  else window.addEventListener('load', onLoad);

  window.scrubSection = { destroy: destroy };
})();
