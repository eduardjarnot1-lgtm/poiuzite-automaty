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
    matchMedia('(min-width: 1061px)').addEventListener?.('change', (e) => e.matches && setOpen(false));
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
