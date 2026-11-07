// "Pomůžeme vám vybrat automat" (pruvodce-vyberem/): one step at a time, then the result, then
// the optional written enquiry on the usual form (sent by site.js like every other enquiry).
// The rules live in assets/js/lib/guide.js (copied from scripts/lib/guide.mjs, with tests).
//
// Privacy: answers stay in this page's memory. Only the choices (no free text, no contact
// details) also go to sessionStorage, so opening a machine's page and coming back keeps them;
// "Začít znovu" clears it and it disappears when the tab is closed. The address bar only ever
// carries the step (#krok-2, #vysledek, #poptavka).
(() => {
  const root = document.querySelector('[data-guide]');
  if (!root) return;
  const base = document.currentScript?.src || location.href;
  // the rules come as a classic script (lib/guide-rules.js, loaded first), which also works for
  // pages opened from disk; the module import is the fallback
  const rules = window.GuideRules ? Promise.resolve(window.GuideRules) : import(new URL('lib/guide.js', base).href);
  rules.then((G) => start(G)).catch((e) => {
    console.error('[průvodce]', e);   // the noscript-style fallback: the page head links to the contact form
  });

  function start(G) {
    const data = JSON.parse(document.getElementById('guide-data').textContent);
    const panel = root.querySelector('[data-guide-panel]');
    const form = root.querySelector('[data-guide-form]');
    const stepsEls = [...form.querySelectorAll('[data-step]')];
    const nav = root.querySelector('[data-guide-nav]');
    const backBtn = root.querySelector('[data-guide-back]');
    const nextBtn = root.querySelector('[data-guide-next]');
    const count = root.querySelector('[data-guide-count]');
    const bar = root.querySelector('[data-guide-progress] span');
    const live = root.querySelector('[data-guide-live]');
    const resultEl = root.querySelector('[data-guide-result]');
    const enquiryEl = root.querySelector('[data-guide-enquiry]');
    const enquiryForm = enquiryEl.querySelector('form');
    const message = enquiryForm.querySelector('textarea[name="zprava"]');
    const machineField = enquiryForm.querySelector('input[name="automat"]');
    const toolStatus = root.querySelector('[data-guide-tool-status]');
    // after a real send (public site only): no promise of a call-back or of when we answer
    enquiryForm.dataset.successHtml = '<h3>Děkujeme, poptávku jsme přijali.</h3><p>Odpověď pošleme na e-mail, který jste uvedli.</p>';
    const STORE = 'pouzite-automaty:pruvodce';
    const CHOICES = ['offer', 'coffee', 'place', 'people', 'usage', 'usageScale', 'mode', 'payment', 'budget', 'budgetMax', 'placement', 'water', 'when', 'selected'];
    const N = G.STEPS.length;
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const catUrl = (slug) => data.categories.find((x) => x.slug === slug)?.url || '#';
    const scale = () => G.usageScale(answers.offer);

    let answers = {};
    let view = { type: 'step', i: 0 };
    let generated = '';   // the last summary put into the message, to know whether the visitor edited it

    /* ---------- answers <-> form ---------- */
    function read() {
      const fd = new FormData(form);
      const a = { selected: answers.selected };
      for (const k of ['offer', 'coffee', 'place', 'people', 'mode', 'payment', 'budget', 'placement', 'water', 'when']) {
        const v = fd.get(k);
        if (v) a[k] = v;
      }
      const sc = G.usageScale(a.offer);
      const u = fd.get(`usage-${sc}`);
      if (u) { a.usage = u; a.usageScale = sc; }
      for (const k of ['placeOther', 'budgetMax', 'space', 'region', 'other']) {
        const v = (fd.get(k) || '').trim();
        if (v) a[k] = v;
      }
      return a;
    }
    function write(a) {
      for (const el of form.elements) {
        if (!el.name) continue;
        const key = el.name.startsWith('usage-') ? 'usage' : el.name;
        const scaleOk = !el.name.startsWith('usage-') || el.name === `usage-${a.usageScale || G.usageScale(a.offer)}`;
        if (el.type === 'radio') el.checked = scaleOk && a[key] === el.value;
        else if (el.tagName === 'SELECT' || el.type === 'text' || el.tagName === 'TEXTAREA') el.value = a[key] || '';
      }
    }
    // Shows the follow-up questions that apply; a follow-up that stops applying is cleared.
    function sync() {
      const a = read();
      const show = {
        coffee: G.applies.coffee(a), placeOther: G.applies.placeOther(a), payment: G.applies.payment(a),
        budgetMax: G.applies.budgetMax(a), water: G.applies.water(a),
        'usage-drinks': G.usageScale(a.offer) === 'drinks', 'usage-items': G.usageScale(a.offer) === 'items', 'usage-mixed': G.usageScale(a.offer) === 'mixed',
      };
      for (const el of form.querySelectorAll('[data-when]')) {
        const on = Boolean(show[el.dataset.when]);
        if (!on && !el.hidden) el.querySelectorAll('input, textarea, select').forEach((i) => { if (i.type === 'radio') i.checked = false; else i.value = ''; });
        el.hidden = !on;
      }
      answers = G.clean(read(), data.products);
      save();
    }
    function save() {
      try {
        const keep = {};
        for (const k of CHOICES) if (answers[k] != null) keep[k] = answers[k];
        sessionStorage.setItem(STORE, JSON.stringify({ answers: keep, view: view.type === 'step' ? `krok-${view.i + 1}` : view.type === 'result' ? 'vysledek' : 'poptavka' }));
      } catch (e) { /* storage blocked: answers stay in memory only */ }
    }
    function restore() {
      try { return JSON.parse(sessionStorage.getItem(STORE) || 'null'); } catch (e) { return null; }
    }

    /* ---------- errors ---------- */
    function clearErrors() {
      form.querySelectorAll('.g-error').forEach((p) => { p.hidden = true; p.textContent = ''; });
      form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    }
    function showErrors(errs) {
      let first = null;
      for (const [k, msg] of Object.entries(errs)) {
        const p = document.getElementById(`g-${k}-error`);
        if (!p) continue;
        p.textContent = msg;
        p.hidden = false;
        const group = p.closest('fieldset');
        const input = group ? group.querySelector('input') : document.getElementById(`g-${k}`);
        const target = group || input;
        if (target) {
          target.setAttribute('aria-invalid', 'true');
          const ids = (target.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
          if (!ids.includes(p.id)) target.setAttribute('aria-describedby', [...ids, p.id].join(' '));
        }
        first ||= input;
      }
      first?.focus();
    }

    /* ---------- views ---------- */
    const hashOf = (v) => (v.type === 'step' ? `#krok-${v.i + 1}` : v.type === 'result' ? '#vysledek' : '#poptavka');
    function parseHash(h) {
      const m = /^#krok-(\d)$/.exec(h);
      if (m && +m[1] >= 1 && +m[1] <= N) return { type: 'step', i: +m[1] - 1 };
      if (h === '#vysledek') return { type: 'result' };
      if (h === '#poptavka') return { type: 'enquiry' };
      return null;
    }
    // The first step that still lacks a required answer, or null when the result can be shown.
    const firstIncomplete = () => {
      const i = G.STEPS.findIndex((s) => Object.keys(G.stepErrors(s.id, answers)).length);
      return i === -1 ? null : i;
    };
    function allowed(v) {
      const gap = firstIncomplete();
      if (v.type === 'step') return gap == null || v.i <= gap ? v : { type: 'step', i: gap };
      return gap == null ? v : { type: 'step', i: gap };
    }

    function show(v, { push = true, focus = true } = {}) {
      view = allowed(v);
      if (push) history.pushState({ guide: true }, '', hashOf(view));
      else history.replaceState({ guide: true }, '', hashOf(view));
      const isStep = view.type === 'step';
      form.hidden = !isStep;
      resultEl.hidden = view.type !== 'result';
      enquiryEl.hidden = view.type !== 'enquiry';
      stepsEls.forEach((el, k) => { el.hidden = !(isStep && k === view.i); });
      clearErrors();
      let heading;
      if (isStep) {
        const last = view.i === N - 1;
        backBtn.hidden = view.i === 0;
        nextBtn.textContent = last ? 'Zobrazit výsledek' : 'Pokračovat';
        count.textContent = `Krok ${view.i + 1} z ${N}`;
        bar.style.width = `${((view.i + 1) / (N + 1)) * 100}%`;
        live.textContent = `Krok ${view.i + 1} z ${N}`;
        heading = stepsEls[view.i].querySelector('.g-step-title');
      } else if (view.type === 'result') {
        renderResult();
        count.textContent = 'Výsledek';
        bar.style.width = '100%';
        live.textContent = 'Výsledek podle vašich odpovědí';
        heading = resultEl.querySelector('h2');
      } else {
        prepareEnquiry();
        count.textContent = 'Nezávazná poptávka';
        bar.style.width = '100%';
        live.textContent = 'Nezávazná poptávka';
        heading = enquiryEl.querySelector('h2');
        heading.tabIndex = -1;
      }
      save();
      if (focus) {
        heading?.focus({ preventScroll: true });
        const top = panel.getBoundingClientRect().top + window.scrollY - 80;
        if (window.scrollY > top || panel.getBoundingClientRect().top > window.innerHeight * .5) window.scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }
    }

    /* ---------- result ---------- */
    const li = (t) => `<li>${esc(t)}</li>`;
    function card(x, { checkable, label }) {
      const tpl = root.querySelector(`template[data-guide-card="${CSS.escape(x.product.id)}"]`);
      const item = tpl?.content.firstElementChild?.cloneNode(true);
      if (!item) return '';
      const notes = [];
      if (x.confirmed.length) notes.push(`<div class="g-facts g-facts-ok"><p class="g-facts-title">Potvrzeno v údajích automatu</p><ul>${x.confirmed.map(li).join('')}</ul></div>`);
      if (x.requested.length && x.showUnknown) notes.push(`<div class="g-facts g-facts-req"><p class="g-facts-title">Váš požadavek, zatím neověřený</p><ul>${x.requested.map(li).join('')}</ul></div>`);
      if (x.showUnknown && x.unknown.length) notes.push(`<div class="g-facts"><p class="g-facts-title">K ověření</p><ul>${x.unknown.map(li).join('')}</ul></div>`);
      const extra = document.createElement('div');
      extra.className = 'g-card-extra';
      extra.innerHTML = notes.join('') + (checkable ? `<label class="g-pick"><input type="checkbox" data-guide-pick value="${esc(x.product.id)}"${(answers.selected || []).includes(x.product.id) ? ' checked' : ''}> Zahrnout do poptávky</label>` : '');
      item.querySelector('.card-foot')?.before(extra);
      if (label) {
        const tag = document.createElement('p');
        tag.className = 'g-card-label';
        tag.textContent = label;
        item.querySelector('.card-body')?.prepend(tag);
      }
      item.classList.add('g-card');
      return item.outerHTML;
    }

    function categoryBlock(cat, r, i) {
      if (!cat.published) {
        return `<section class="g-block g-block-request" aria-labelledby="g-cat-${i}">
          <h3 id="g-cat-${i}">${esc(cat.name)}</h3>
          <p>Tento druh automatů nabízíme na dotaz. Aktuálně zde nemáme zveřejněné konkrétní modely. Vaše požadavky můžeme použít pro přípravu individuální nabídky.</p>
          <p class="g-cat-short">${esc(cat.short)}</p>
          <a class="text-link" href="${esc(catUrl(cat.slug))}">O kategorii ${esc(cat.name.toLowerCase())}</a>
        </section>`;
      }
      const items = r.comparable ? r.shortlist : r.examples;
      const common = !r.comparable && items[0] ? [...items[0].requested, ...items[0].unknown] : [];
      return `<section class="g-block" aria-labelledby="g-cat-${i}">
        <h3 id="g-cat-${i}">Podívejte se na ${esc(cat.name.toLowerCase())}</h3>
        <p>V této kategorii máme zveřejněné modely. Vhodnost pro váš provoz, stav konkrétního kusu, cenu a dostupnost je potřeba potvrdit.</p>
        <p><a class="btn btn-secondary" href="${esc(catUrl(cat.slug))}">Zobrazit ${cat.published === 1 ? 'zveřejněný automat' : cat.published < 5 ? `všechny ${cat.published} zveřejněné automaty` : `všech ${cat.published} zveřejněných automatů`}</a></p>
        ${r.comparable
          ? `${r.groups.map((g) => `${g.title ? `<h4 class="g-group-title">${esc(g.title)}</h4>` : ''}<p class="g-note">Možnosti k dalšímu ověření, seřazené podle údajů, které u automatů máme.</p><ul class="card-grid g-cards">${g.items.map((x) => card({ ...x, showUnknown: true }, { checkable: true, label: 'Možnost k ověření' })).join('')}</ul>`).join('')}
             ${r.setAside.length ? `<div class="g-facts g-facts-no"><p class="g-facts-title">Neodpovídá vašim požadavkům podle údajů automatu</p><ul>${r.setAside.map((s) => li(`${s.product.name}: ${s.reasons.join(' ')}`)).join('')}</ul></div>` : ''}`
          : items.length ? `<h4 class="g-group-title">Příklady zveřejněných automatů</h4>
             <p class="g-note">Ukazujeme je v pořadí katalogu, ne podle vhodnosti. U těchto automatů zatím nemáme zveřejněné údaje, podle kterých bychom je mohli porovnat s vašimi požadavky. Do poptávky se dostanou jen ty, které sami zaškrtnete.</p>
             <ul class="card-grid g-cards">${items.map((x) => card(x, { checkable: true, label: 'Příklad zveřejněného automatu' })).join('')}</ul>
             ${common.length ? `<div class="g-facts"><p class="g-facts-title">U každého z nich je potřeba ověřit</p><ul>${[...new Set(common)].map(li).join('')}</ul></div>` : ''}` : ''}
      </section>`;
    }

    function renderResult() {
      const r = G.evaluate({ products: data.products, categories: data.categories, order: data.order }, answers);
      answers = r.answers;
      const lines = G.answerLines(answers);
      const stepIndex = (id) => G.STEPS.findIndex((s) => s.id === id);
      let main;
      if (r.branch === 'unsure') {
        main = `<section class="g-block" aria-labelledby="g-unsure">
          <h3 id="g-unsure">Druh automatu zatím není jasný</h3>
          <p>To nevadí. Z vašich odpovědí připravíme poptávku s žádostí o radu. Pro přehled, jaké druhy automatů nabízíme:</p>
          <ul class="g-cat-list">${r.categories.map((cat) => `<li><a href="${esc(catUrl(cat.slug))}">${esc(cat.name)}</a><span>${cat.published ? `${cat.published} ${cat.published === 1 ? 'zveřejněný automat' : cat.published < 5 ? 'zveřejněné automaty' : 'zveřejněných automatů'}` : 'na dotaz, bez zveřejněných modelů'}</span><small>${esc(cat.short)}</small></li>`).join('')}</ul>
        </section>`;
      } else {
        const coffeeNote = answers.offer === 'hot' && r.targets.length > 1
          ? `<div class="g-compare"><p><strong>Instantní káva:</strong> ${esc(G.COFFEE[0][2])}</p><p><strong>Zrnková káva:</strong> ${esc(G.COFFEE[1][2])}</p><p class="g-note">Který druh se hodí pro váš provoz, s vámi probereme v nabídce.</p></div>` : '';
        main = coffeeNote + r.categories.map((cat, i) => categoryBlock(cat, r, i)).join('');
      }
      resultEl.innerHTML = `
        <h2 class="g-step-title" tabindex="-1">Výsledek podle vašich odpovědí</h2>
        <p class="g-intro">Nejde o technické schválení ani rezervaci. Je to směr výběru a přehled toho, co je potřeba potvrdit.</p>
        <div class="g-result-grid">
          <div class="g-result-main">${main}
            <section class="g-block g-block-open" aria-labelledby="g-clarify">
              <h3 id="g-clarify">Co je potřeba potvrdit</h3>
              <ul>${r.clarify.map(li).join('')}</ul>
            </section>
          </div>
          <aside class="g-summary" aria-labelledby="g-sum-title">
            <h3 id="g-sum-title">Vaše odpovědi</h3>
            <dl>${lines.map(([step, k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd><button class="link-button g-edit" type="button" data-guide-edit="${stepIndex(step)}">Upravit<span class="visually-hidden">: ${esc(k)}</span></button></div>`).join('')}</dl>
            <p class="g-sum-actions"><button class="link-button" type="button" data-guide-edit="0">Projít odpovědi znovu</button> · <button class="link-button" type="button" data-guide-reset>Začít znovu</button></p>
          </aside>
        </div>
        <div class="g-next">
          <h3>Co dál</h3>
          <p>Výsledek můžete poslat jako nezávaznou poptávku. Telefon ani schůzka nejsou potřeba.</p>
          <div class="g-next-actions">
            <button class="btn btn-primary btn-lg" type="button" data-guide-to-enquiry>Připravit nezávaznou poptávku</button>
            <button class="btn btn-secondary" type="button" data-guide-copy>Zkopírovat shrnutí</button>
            <button class="btn btn-ghost" type="button" data-guide-download>Stáhnout jako text</button>
          </div>
          <p class="g-tool-status" role="status" data-guide-result-status></p>
        </div>`;
    }

    /* ---------- enquiry ---------- */
    const summary = () => G.summaryText(answers, G.evaluate({ products: data.products, categories: data.categories, order: data.order }, answers), { products: data.products });
    function prepareEnquiry() {
      const fresh = summary();
      if (!message.value.trim() || message.value === generated) message.value = fresh;
      generated = fresh;
      const chosen = (answers.selected || []).map((id) => data.products.find((p) => p.id === id)).filter(Boolean);
      if (machineField) machineField.value = chosen.map((p) => `${p.name} (${p.id})`).join(', ');
    }
    const textNow = () => (view.type === 'enquiry' && message.value.trim() ? message.value : summary());
    async function copy(statusEl) {
      const text = textNow();
      try {
        await navigator.clipboard.writeText(text);
        statusEl.textContent = 'Shrnutí je zkopírované do schránky.';
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.append(ta); ta.select();
        const ok = document.execCommand?.('copy');
        ta.remove();
        statusEl.textContent = ok ? 'Shrnutí je zkopírované do schránky.' : 'Kopírování se nepodařilo. Stáhněte si shrnutí jako text.';
      }
    }
    function download(statusEl) {
      const url = URL.createObjectURL(new Blob([textNow()], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'pozadavky-na-automat.txt';
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      statusEl.textContent = 'Shrnutí se stahuje jako textový soubor.';
    }

    /* ---------- events ---------- */
    form.addEventListener('change', () => { sync(); clearErrors(); });
    form.addEventListener('input', (e) => { if (e.target.matches('input[type="text"], textarea')) { sync(); clearErrors(); } });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sync();
      const errs = G.stepErrors(G.STEPS[view.i].id, answers);
      if (Object.keys(errs).length) { showErrors(errs); return; }
      show(view.i < N - 1 ? { type: 'step', i: view.i + 1 } : { type: 'result' });
    });
    backBtn.addEventListener('click', () => { sync(); show({ type: 'step', i: Math.max(0, view.i - 1) }); });
    root.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.matches('[data-guide-edit]')) { write(answers); sync(); show({ type: 'step', i: +t.dataset.guideEdit }); }
      else if (t.matches('[data-guide-reset]')) {
        answers = {}; generated = ''; message.value = '';
        try { sessionStorage.removeItem(STORE); } catch (err) { /* nothing stored */ }
        form.reset(); sync(); show({ type: 'step', i: 0 });
      }
      else if (t.matches('[data-guide-to-enquiry]')) show({ type: 'enquiry' });
      else if (t.matches('[data-guide-to-result]')) show({ type: 'result' });
      else if (t.matches('[data-guide-copy]')) copy(t.closest('.g-next, .guide-tools').querySelector('[role="status"]'));
      else if (t.matches('[data-guide-download]')) download(t.closest('.g-next, .guide-tools').querySelector('[role="status"]'));
    });
    resultEl.addEventListener('change', (e) => {
      if (!e.target.matches('[data-guide-pick]')) return;
      const set = new Set(answers.selected || []);
      if (e.target.checked) set.add(e.target.value); else set.delete(e.target.value);
      answers.selected = [...set];
      if (!answers.selected.length) delete answers.selected;
      save();
    });
    window.addEventListener('popstate', () => {
      const v = parseHash(location.hash);
      if (v) { write(answers); sync(); show(v, { push: false }); }
    });

    /* ---------- start ---------- */
    const saved = restore();
    if (saved?.answers) answers = G.clean(saved.answers, data.products);
    write(answers);
    sync();
    panel.hidden = false;
    const fromHash = parseHash(location.hash);
    const resume = fromHash || (saved?.view && parseHash(`#${saved.view}`)) || { type: 'step', i: 0 };
    show(resume, { push: false, focus: Boolean(fromHash) });
  }
})();
