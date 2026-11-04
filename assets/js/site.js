// Site-wide behaviour: mobile menu, category submenu, enquiry forms.
(() => {
  /* ---------- mobile menu ---------- */
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  if (toggle && nav) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
    });
    nav.addEventListener('click', (e) => { if (e.target.closest('a[href^="#"]')) setOpen(false); });   // in-page links close the menu
    matchMedia('(min-width: 961px)').addEventListener?.('change', (e) => e.matches && setOpen(false));
  }

  /* ---------- category submenu (desktop: also opens on hover / focus) ---------- */
  document.querySelectorAll('.sub-toggle').forEach((btn) => {
    const item = btn.closest('.has-sub');
    const setOpen = (open) => { btn.setAttribute('aria-expanded', String(open)); item.classList.toggle('is-open', open); };
    btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
    item.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); btn.focus(); } });
    document.addEventListener('click', (e) => { if (!item.contains(e.target)) setOpen(false); });
  });

  /* ---------- enquiry forms ----------
     Validates with clear Czech messages, then sends without a page reload: to Netlify Forms
     (data-netlify) or to the endpoint in the form's action. Without JS the browser posts normally. */
  const MSG = {
    valueMissing: 'Vyplňte prosím toto pole.',
    typeMismatch: 'Zadejte e-mail ve tvaru jmeno@firma.cz.',
    patternMismatch: 'Zadejte telefonní číslo, alespoň 9 číslic.',
    tooLong: 'Text je příliš dlouhý.',
  };
  const messageFor = (el) => {
    const v = el.validity;
    for (const k of Object.keys(MSG)) if (v[k]) return MSG[k];
    return v.valid ? '' : 'Zkontrolujte prosím toto pole.';
  };
  function showError(el) {
    const id = el.id + '-error';
    let err = document.getElementById(id);
    const msg = messageFor(el);
    if (!msg) {
      el.removeAttribute('aria-invalid');
      err?.remove();
      return true;
    }
    if (!err) {
      err = document.createElement('p');
      err.className = 'field-error';
      err.id = id;
      el.insertAdjacentElement('afterend', err);
    }
    err.textContent = msg;
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', id);
    return false;
  }

  document.querySelectorAll('form[data-enquiry]').forEach((form) => {
    form.noValidate = true;
    const fields = [...form.querySelectorAll('.field input, .field textarea')];
    const status = form.querySelector('.form-status');
    const button = form.querySelector('button[type="submit"]');
    let tried = false;
    fields.forEach((el) => el.addEventListener('input', () => tried && showError(el)));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      tried = true;
      status.textContent = '';
      status.className = 'form-status';
      const invalid = fields.filter((el) => !showError(el));
      if (invalid.length) { invalid[0].focus(); return; }

      const data = new FormData(form);
      const done = () => {
        const box = document.createElement('div');
        box.className = 'form-success';
        box.tabIndex = -1;
        box.setAttribute('role', 'status');
        box.innerHTML = '<h3>Děkujeme, zprávu jsme přijali.</h3><p>Ozveme se vám co nejdříve.</p>';
        form.replaceChildren(box);
        box.focus();
      };
      if (data.get('firma-web')) { done(); return; }   // honeypot filled: quietly drop

      button.disabled = true;
      const label = button.textContent;
      button.textContent = 'Odesílám…';
      try {
        const netlify = form.hasAttribute('data-netlify');
        const res = await fetch(form.action, netlify
          ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() }
          : { method: 'POST', headers: { Accept: 'application/json' }, body: data });
        if (!res.ok) throw new Error(res.status);
        done();
      } catch {
        status.className = 'form-status is-error';
        status.textContent = 'Zprávu se nepodařilo odeslat. Zkuste to prosím znovu, nebo nás kontaktujte telefonicky či e-mailem.';
        status.focus();
        button.disabled = false;
        button.textContent = label;
      }
    });
  });
})();

/* ---------- photos from other sites: show the neutral drawing if one fails to load ---------- */
(() => {
  const swap = (img) => {
    if (!img.dataset.fallback || img.src.endsWith(img.dataset.fallback.replace(/^(\.\.\/)+/, ''))) return;
    img.removeAttribute('srcset');
    img.src = img.dataset.fallback;
    img.closest('.slide, .gallery, .card')?.classList.add('has-missing-photo');
  };
  document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') swap(e.target); }, true);
  document.querySelectorAll('img[data-fallback]').forEach((img) => { if (img.complete && img.naturalWidth === 0 && img.currentSrc) swap(img); });
})();

/* ---------- animated wave backgrounds ----------
   A muted looping video behind the homepage hero and the enquiry sections. The section's CSS
   background is the video's first frame, so nothing changes if this never runs. Skipped with
   reduced motion; loaded only when the section comes near the viewport; paused when it is off
   screen or the tab is hidden. */
(() => {
  const script = document.currentScript;
  if (!script || !('IntersectionObserver' in window)) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches) return;
  const asset = (f) => new URL(`../video/${f}`, script.src).href;
  const ext = document.createElement('video').canPlayType('video/webm; codecs="vp9"') ? 'webm' : 'mp4';
  const poster = (f) => new URL(`../img/bg/${f}`, script.src).href;
  const targets = [];
  // On the homepage the hero animation is one fixed backdrop behind the whole page.
  const hero = document.querySelector('.home-backdrop') || document.querySelector('.hero');
  if (hero) targets.push([hero, 'bg-hero']);
  document.querySelectorAll('.section-alt > .wrap > .enquiry').forEach((el) => targets.push([el.parentElement.parentElement, 'bg-enquiry']));
  if (!targets.length) return;

  const videos = [];
  for (const [section, name] of targets) {
    const layer = document.createElement('div');
    layer.className = 'bg-video';
    layer.setAttribute('aria-hidden', 'true');
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none';
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('tabindex', '-1');
    v.disablePictureInPicture = true;
    v.poster = poster(`video-${name.slice(3)}-poster.webp`);
    v.dataset.src = asset(`${name}.${ext}`);
    v.addEventListener('playing', () => v.classList.add('is-playing'));
    v.addEventListener('error', () => layer.remove());   // the poster background stays
    layer.append(v);
    section.classList.add('has-bg-video');
    section.prepend(layer);
    videos.push(v);
  }

  const visible = new Set();
  const play = (v) => {
    if (document.hidden || motion.matches || !visible.has(v)) return;
    if (!v.src) v.src = v.dataset.src;
    v.play().catch(() => {});   // autoplay blocked: the poster stays
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target.querySelector('.bg-video video');
      if (!v) continue;
      if (e.isIntersecting) { visible.add(v); play(v); } else { visible.delete(v); v.pause(); }
    }
  }, { rootMargin: '200px 0px' });
  videos.forEach((v) => io.observe(v.closest('.has-bg-video')));
  document.addEventListener('visibilitychange', () => videos.forEach((v) => (document.hidden ? v.pause() : play(v))));
  motion.addEventListener?.('change', () => { if (motion.matches) videos.forEach((v) => v.pause()); });
})();
