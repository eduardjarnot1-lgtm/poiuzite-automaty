// Language switch (Čeština / Deutsch / Slovenčina). The links already lead to the same page in the
// other language; this adds what the visitor had on the page: the filters and sorting in the
// address (?…), the place on the page (#…) and what they typed into forms. Form values travel in
// sessionStorage for the moment of the switch and are deleted as soon as the new page reads them;
// nothing is submitted and no workflow is reset.
// An explicit choice is remembered in localStorage ("pa-lang", the language code only); it is used
// only when someone comes back to the bare Czech homepage from elsewhere (see build.mjs).
(() => {
  const PREF = 'pa-lang';
  const CARRY = 'pa-lang-carry';
  const lang = document.documentElement.lang || 'cs';
  const SAID = { cs: 'Stránka je teď v češtině.', de: 'Die Seite ist jetzt auf Deutsch.', sk: 'Stránka je teraz v slovenčine.' };
  const samePage = (a, b) => a.replace(/index\.html$/, '') === b.replace(/index\.html$/, '');

  // An unsupported language code in the address (/en/…, /cs/…) falls back to the Czech page.
  if (document.querySelector('[data-not-found]')) {
    const m = /^\/([a-z]{2})(\/.*)$/.exec(location.pathname);
    if (m && !['de', 'sk'].includes(m[1])) location.replace(m[2] + location.search + location.hash);
  }

  const fieldsOf = (form) => [...form.elements].filter((el) => el.name && !el.disabled
    && !['hidden', 'password', 'file', 'submit', 'button', 'reset'].includes(el.type)
    && el.name !== 'firma-web' && el.dataset.generated !== '1');
  const formKey = (form, i) => form.id || form.getAttribute('name') + ':' + i;

  function collect() {
    const forms = {};
    [...document.forms].forEach((form, i) => {
      const values = {};
      for (const el of fieldsOf(form)) {
        if (el.type === 'radio' || el.type === 'checkbox') { if (el.checked) (values[el.name] ||= []).push(el.value); }
        else if (el.value) values[el.name] = el.value;
      }
      if (Object.keys(values).length) forms[formKey(form, i)] = values;
    });
    return forms;
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-lang]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (a.getAttribute('aria-current')) return;
    const to = new URL(a.href, location.href);
    to.search = location.search;
    to.hash = location.hash;
    try { localStorage.setItem(PREF, a.dataset.lang); } catch (err) { /* not remembered */ }
    try {
      sessionStorage.setItem(CARRY, JSON.stringify({ to: to.pathname, forms: collect(), y: location.hash ? null : Math.round(window.scrollY) }));
    } catch (err) { /* values stay behind */ }
    location.href = to.href;
  });

  // On the new page: put the values back (forms that manage their own state call PALang.restore).
  let carry = null;
  try {
    carry = JSON.parse(sessionStorage.getItem(CARRY) || 'null');
    sessionStorage.removeItem(CARRY);
  } catch (err) { carry = null; }
  if (carry && !samePage(carry.to, location.pathname)) carry = null;

  function restore(form) {
    if (!carry) return;
    const i = [...document.forms].indexOf(form);
    const values = carry.forms?.[formKey(form, i)];
    if (!values) return;
    for (const el of fieldsOf(form)) {
      const v = values[el.name];
      if (v == null) continue;
      if (el.type === 'radio' || el.type === 'checkbox') el.checked = [].concat(v).includes(el.value);
      else el.value = v;
      el.dispatchEvent(new Event(el.tagName === 'SELECT' || el.type === 'radio' || el.type === 'checkbox' ? 'change' : 'input', { bubbles: true }));
    }
  }
  window.PALang = { restore };

  if (carry) {
    for (const form of document.forms) if (!form.hasAttribute('data-guide-form')) restore(form);
    if (carry.y != null) window.scrollTo(0, carry.y);
    // focus stays on the language switch; the change is announced once, quietly
    const current = [...document.querySelectorAll('.lang-switch a[aria-current]')].find((el) => el.offsetParent !== null);
    current?.focus({ preventScroll: true });
    const say = document.createElement('p');
    say.className = 'visually-hidden';
    say.setAttribute('role', 'status');
    document.body.append(say);
    setTimeout(() => { say.textContent = SAID[lang] || ''; }, 300);
  }
})();
