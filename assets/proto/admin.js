// "Správa nabídky": the local admin prototype. Overview with search and filters, quick price and
// availability changes, one add/edit form (photos, basic details, price and discount, parameters,
// availability and publication), display order, trash, duplicates, backup and import.
// Everything is read and written through env.store (store.js), the one place a real backend would
// plug in. Nothing here is authentication; changes stay in this browser.
import { esc, html } from './lib/util.js';
import { productCard, productPath } from './lib/components.js';
import {
  parseCzk, discountedPrice, discountProblem, discountState, DISCOUNT_LABEL, sale, effectivePrice,
  isListed, isVisible, statusOf, pragueToUtc, utcToPrague, formatPrague, scheduleSentence, recommended,
} from './lib/catalog.js';
import { AVAILABILITY, MAX_PRICE, photoRefs, isStoredPhoto } from './store.js';

const STATUS_LABEL = { published: 'Zveřejněno', draft: 'Koncept', hidden: 'Skryto' };
const STATUS_HINT = {
  draft: 'Rozpracovaný automat. Zákazníci ho nevidí, vy ho uvidíte v náhledu.',
  published: 'Automat je v nabídce a zákazníci ho vidí.',
  hidden: 'Automat je dočasně stažený z nabídky. Zákazníci ho nevidí, údaje zůstávají.',
};
const AVAIL_HINT = {
  '': 'Dostupnost se zákazníkům nezobrazí.',
  Skladem: 'Automat je připravený k prodeji.',
  'Na objednávku': 'Automat zajistíte na objednávku.',
  Rezervováno: 'Automat je rezervovaný. Zůstává v nabídce s označením Rezervováno.',
  Prodáno: 'Automat zmizí z výpisů nabídky. Jeho stránka zůstane s označením Prodáno a odkazy na podobné automaty.',
};
const METHOD_LABEL = { percent: 'Sleva v procentech', amount: 'Sleva v korunách', price: 'Nová cena po slevě' };
const PHOTO_MAX_SIDE = 1600;
const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
const GENERIC_SPECS = ['Rozměry (v × š × h)', 'Hmotnost', 'Napájení', 'Příkon', 'Počet nápojových voleb', 'Zásobníky instantních surovin', 'Zásobník kelímků', 'Připojení vody', 'Kapacita', 'Počet spirál', 'Chlazení', 'Platební systém'];

const clone = (v) => JSON.parse(JSON.stringify(v));
const word = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
const automatu = (n) => `${n} ${word(n, 'automat', 'automaty', 'automatů')}`;
const kc = (n) => `${new Intl.NumberFormat('cs-CZ').format(n)} Kč`;
const groupDigits = (n) => (n == null || n === '' ? '' : new Intl.NumberFormat('cs-CZ').format(n));
const today = () => utcToPrague(new Date().toISOString()).date;
const slugify = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'automat';
const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
const paragraphs = (t) => String(t || '').split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
const trimOrNull = (v) => (String(v ?? '').trim() ? String(v).trim() : null);

export async function startAdmin(root, env) {
  const { store, seed, url } = env;
  const vat = seed.site.catalogue.pricesIncludeVat ? 'vč. DPH' : 'bez DPH';
  const priceLabel = (n) => `${kc(n)} ${vat}`;
  const catName = (slug) => seed.categories.find((c) => c.slug === slug)?.name || slug;

  let state = env.loaded.state;
  let photos = await store.photoUrls(photoRefs(state.products));
  const ui = { tab: 'list', filters: { q: '', category: '', status: '', availability: '', discount: '' }, order: null };
  let form = null; // the open add/edit form

  const live = () => state.products.filter((p) => !p.deletedAt);
  const trash = () => state.products.filter((p) => p.deletedAt);
  const byId = (id) => state.products.find((p) => p.id === id);
  const photoSrc = (src) => (isStoredPhoto(src) ? photos.get(src) || url('assets/img/placeholder-automat.svg') : /^(https?:|data:|blob:)/.test(src) ? src : url(src));
  const thumb = (p) => {
    const img = p.images?.[0];
    return img
      ? html`<img src="${esc(photoSrc(img.thumb || img.src))}" alt="" loading="lazy" decoding="async">`
      : html`<img src="${url('assets/img/placeholder-automat.svg')}" alt="">`;
  };
  // What a customer link should open: the page itself when customers can see it, otherwise the
  // preview page (which says it is a preview).
  const customerHref = (p) => (isVisible(p) ? url(productPath(env.withPath(p))) : url(`${env.PREVIEW_PATH}?id=${encodeURIComponent(p.id)}`));

  /* ---------- shell ---------- */
  root.innerHTML = html`<div class="pa">
  <div class="pa-bar">
    <nav class="pa-tabs" aria-label="Části správy nabídky">
      <button type="button" data-tab="list">Automaty <span class="pa-tab-count" data-count="list"></span></button>
      <button type="button" data-tab="order">Pořadí v nabídce</button>
      <button type="button" data-tab="trash">Koš <span class="pa-tab-count" data-count="trash"></span></button>
      <button type="button" data-tab="backup">Záloha a import</button>
    </nav>
    <button class="btn btn-primary" type="button" data-act="new">Přidat automat</button>
  </div>
  <div class="pa-flash" role="status" aria-live="polite" tabindex="-1"></div>
  <div data-view></div>
</div>`;
  const view = root.querySelector('[data-view]');
  const flashEl = root.querySelector('.pa-flash');
  const setFlash = (content, { error = false, focus = false } = {}) => {
    flashEl.className = `pa-flash${error ? ' is-error' : ''}`;
    flashEl.innerHTML = content || '';
    if (focus && content) flashEl.focus();
  };
  if (env.loaded.error) setFlash('Uložená data v tomto prohlížeči se nepodařilo načíst, proto se zobrazuje původní nabídka webu. Pokud máte zálohu, nahrajte ji v části Záloha a import.', { error: true });

  function setTab(tab, hash) {
    ui.tab = tab;
    for (const b of root.querySelectorAll('[data-tab]')) {
      if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    root.querySelector('[data-count="list"]').textContent = `(${live().length})`;
    root.querySelector('[data-count="trash"]').textContent = `(${trash().length})`;
    history.replaceState(history.state, '', `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`);
  }

  // Saves the whole catalogue; resolves to true only when the browser confirmed it.
  async function commit(next) {
    try {
      state = await store.save(next);
      return true;
    } catch (e) {
      setFlash(esc(e.userMessage || 'Změny se nepodařilo uložit. Nic nebylo uloženo.'), { error: true, focus: true });
      return false;
    }
  }
  const withProduct = (p) => ({ ...state, products: state.products.some((x) => x.id === p.id) ? state.products.map((x) => (x.id === p.id ? p : x)) : [...state.products, p] });

  /* ---------- dialogs ---------- */
  function openDialog({ title, body, actions, setup, danger }) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'pa-dialog';
      d.setAttribute('aria-labelledby', 'pa-dialog-title');
      d.innerHTML = html`<form method="dialog" class="pa-dialog-form" novalidate>
  <h2 id="pa-dialog-title">${esc(title)}</h2>
  <div class="pa-dialog-body">${body}</div>
  <div class="pa-dialog-actions">${actions.map(([value, label, kind]) => html`<button class="btn ${kind === 'primary' ? (danger ? 'btn-danger' : 'btn-primary') : 'btn-secondary'}" value="${value}" ${kind === 'primary' ? 'data-primary' : ''}>${esc(label)}</button>`)}</div>
</form>`;
      document.body.append(d);
      let result = null;
      const done = (v) => { result = v; d.close(); };
      const api = setup ? setup(d, done) : null;
      d.addEventListener('close', () => { d.remove(); resolve(result ?? (d.returnValue && d.returnValue !== 'cancel' ? d.returnValue : null)); });
      d.querySelector('form').addEventListener('submit', (e) => {
        const v = e.submitter?.value;
        if (v && v !== 'cancel' && api?.submit) { e.preventDefault(); api.submit(v, done); }
      });
      d.showModal();
      (d.querySelector('[autofocus]') || d.querySelector('[data-primary]'))?.focus();
    });
  }
  const confirmDialog = (title, text, yes, { danger = false, no = 'Zrušit' } = {}) =>
    openDialog({ title, body: html`<p>${text}</p>`, actions: [['cancel', no], ['ok', yes, 'primary']], danger }).then((v) => v === 'ok');

  /* ================= overview ================= */
  const discountInfo = (p, now) => {
    const st = discountState(p, now);
    if (st === 'none') return '';
    const d = p.discount;
    const when = st === 'active' && d.end ? ` do ${formatPrague(d.end)}` : st === 'scheduled' && d.start ? ` od ${formatPrague(d.start)}` : '';
    return html`<span class="pa-pill pa-pill-${st}">Sleva: ${DISCOUNT_LABEL[st].toLowerCase()}${esc(when)}</span>`;
  };

  function matches(p, f, now) {
    const q = f.q.trim().toLowerCase();
    if (q && ![p.name, p.manufacturer, p.model, p.ref, p.type].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
    if (f.category && p.category !== f.category) return false;
    if (f.status && statusOf(p) !== f.status) return false;
    if (f.availability && (p.availability || 'none') !== f.availability) return false;
    if (f.discount) {
      const st = discountState(p, now);
      if (f.discount === 'any' ? st === 'none' : st !== f.discount) return false;
    }
    return true;
  }

  function renderList() {
    setTab('list', '');
    const now = Date.now();
    const f = ui.filters;
    const all = recommended(live(), state.order);
    const rows = all.filter((p) => matches(p, f, now));
    const active = Object.values(f).some(Boolean);
    const opt = (v, t, cur) => html`<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`;
    view.innerHTML = html`<section aria-labelledby="pa-list-title">
  <h2 class="visually-hidden" id="pa-list-title">Automaty v nabídce</h2>
  <form class="pa-filters" role="search" aria-label="Hledat a filtrovat automaty" data-filters>
    <div class="tool tool-search"><label for="pa-q">Hledat</label><input id="pa-q" type="search" name="q" value="${esc(f.q)}" placeholder="Název, výrobce, model, označení" autocomplete="off"></div>
    <div class="tool"><label for="pa-cat">Kategorie</label><select id="pa-cat" name="category">${opt('', 'Všechny', f.category)}${seed.categories.map((c) => opt(c.slug, c.name, f.category))}</select></div>
    <div class="tool"><label for="pa-status">Zveřejnění</label><select id="pa-status" name="status">${opt('', 'Vše', f.status)}${Object.entries(STATUS_LABEL).map(([v, t]) => opt(v, t, f.status))}</select></div>
    <div class="tool"><label for="pa-avail">Dostupnost</label><select id="pa-avail" name="availability">${opt('', 'Vše', f.availability)}${opt('none', 'Neuvedeno', f.availability)}${AVAILABILITY.map((a) => opt(a, a, f.availability))}</select></div>
    <div class="tool"><label for="pa-disc">Sleva</label><select id="pa-disc" name="discount">${opt('', 'Vše', f.discount)}${opt('any', 'Se slevou (jakoukoli)', f.discount)}${['active', 'scheduled', 'ended', 'off', 'invalid'].map((s) => opt(s, DISCOUNT_LABEL[s], f.discount))}</select></div>
    <button class="btn btn-ghost" type="button" data-act="reset-filters"${active ? '' : ' disabled'}>Zrušit filtry</button>
  </form>
  <p class="pa-count" aria-live="polite">${active ? `Zobrazeno ${rows.length} z ${automatu(all.length)}` : automatu(all.length)}</p>
  ${rows.length
    ? html`<table class="pa-table">
    <caption class="visually-hidden">Automaty: foto, název, cena, dostupnost, zveřejnění a akce</caption>
    <thead><tr><th scope="col"><span class="visually-hidden">Foto</span></th><th scope="col">Automat</th><th scope="col">Cena</th><th scope="col">Dostupnost</th><th scope="col">Zveřejnění</th><th scope="col">Upraveno</th><th scope="col"><span class="visually-hidden">Akce</span></th></tr></thead>
    <tbody>${rows.map((p) => row(p, now))}</tbody>
  </table>`
    : html`<div class="pa-empty"><p>${all.length ? 'Zvoleným filtrům neodpovídá žádný automat.' : 'Zatím tu nejsou žádné automaty.'}</p>${all.length ? html`<button class="btn btn-secondary" type="button" data-act="reset-filters">Zrušit filtry</button>` : html`<button class="btn btn-primary" type="button" data-act="new">Přidat první automat</button>`}</div>`}
</section>`;
  }

  function row(p, now) {
    const s = sale(p, now);
    const st = statusOf(p);
    const id = esc(p.id);
    const sub = [p.manufacturer, p.model].filter(Boolean).join(' · ');
    return html`<tr data-id="${id}">
  <td class="pa-c-thumb"><span class="pa-thumb">${thumb(p)}</span></td>
  <td class="pa-c-main">
    <button class="pa-name" type="button" data-act="edit">${esc(p.name)}</button>
    ${sub && html`<span class="pa-sub">${esc(sub)}</span>`}
    <span class="pa-sub">${esc(catName(p.category))}${p.ref ? html` · ozn. ${esc(p.ref)}` : ''}</span>
  </td>
  <td class="pa-c-price" data-label="Cena">
    <span class="pa-price">${s ? html`<strong>${esc(kc(s.final))}</strong> <s>${esc(kc(s.standard))}</s>` : p.price != null ? html`<strong>${esc(kc(p.price))}</strong>` : 'Cena na dotaz'}</span>
    ${discountInfo(p, now)}
    <button class="link-button pa-quick" type="button" data-act="price">Změnit cenu<span class="visually-hidden">: ${esc(p.name)}</span></button>
  </td>
  <td class="pa-c-avail" data-label="Dostupnost">
    <label class="visually-hidden" for="pa-av-${id}">Dostupnost: ${esc(p.name)}</label>
    <select id="pa-av-${id}" data-act="availability">
      <option value=""${p.availability ? '' : ' selected'}>Neuvedeno</option>
      ${AVAILABILITY.map((a) => html`<option${p.availability === a ? ' selected' : ''}>${a}</option>`)}
    </select>
    ${p.availability === 'Prodáno' && st === 'published' ? html`<span class="pa-note">Není ve výpisech</span>` : ''}
  </td>
  <td class="pa-c-status" data-label="Zveřejnění">
    <span class="pa-pill pa-pill-${st}">${STATUS_LABEL[st]}</span>
    ${p.featured ? html`<span class="pa-pill pa-pill-featured">Doporučený</span>` : ''}
  </td>
  <td class="pa-c-date" data-label="Upraveno">${p.updatedAt ? esc(formatPrague(p.updatedAt, { time: false })) : html`<span class="pa-muted">původní data</span>`}</td>
  <td class="pa-c-actions">
    <button class="btn btn-secondary btn-sm" type="button" data-act="edit">Upravit<span class="visually-hidden">: ${esc(p.name)}</span></button>
    <a class="btn btn-ghost btn-sm" href="${customerHref(p)}" target="_blank" rel="noopener">Náhled<span class="visually-hidden">: ${esc(p.name)} (otevře se v nové kartě)</span></a>
    <details class="pa-menu">
      <summary class="btn btn-ghost btn-sm">Další<span class="visually-hidden"> akce: ${esc(p.name)}</span></summary>
      <div class="pa-menu-list">
        <button type="button" data-act="duplicate">Duplikovat</button>
        <button type="button" data-act="toggle">${st === 'published' ? 'Skrýt z nabídky' : 'Zveřejnit'}</button>
        <button type="button" data-act="delete" class="is-danger">Smazat</button>
      </div>
    </details>
  </td>
</tr>`;
  }

  /* ---------- quick edits ---------- */
  async function quickPrice(p) {
    const ask = p.price == null;
    const result = await openDialog({
      title: `Cena: ${p.name}`,
      body: html`<fieldset class="pa-choice"><legend>Cena</legend>
  <label><input type="radio" name="mode" value="ask"${ask ? ' checked' : ''}> Cena na dotaz</label>
  <label><input type="radio" name="mode" value="set"${ask ? '' : ' checked'}> Uvést cenu</label>
</fieldset>
<div class="field"><label for="qp-price">Cena v Kč ${vat}</label><input id="qp-price" name="price" inputmode="numeric" autocomplete="off" value="${esc(groupDigits(p.price))}" aria-describedby="qp-msg"${ask ? ' disabled' : ' autofocus'}></div>
<p class="pa-hint" id="qp-msg" aria-live="polite"></p>`,
      actions: [['cancel', 'Zrušit'], ['save', 'Uložit cenu', 'primary']],
      setup(d) {
        const input = d.querySelector('#qp-price');
        const msg = d.querySelector('#qp-msg');
        const mode = () => d.querySelector('[name="mode"]:checked').value;
        const read = () => {
          if (mode() === 'ask') return { price: null };
          const v = parseCzk(input.value);
          if (!input.value.trim()) return { error: 'Zadejte cenu, nebo zvolte Cena na dotaz.' };
          if (Number.isNaN(v)) return { error: 'Napište cenu celými korunami, například 45 000.' };
          if (v <= 0) return { error: 'Cena musí být vyšší než 0 Kč.' };
          if (v > MAX_PRICE) return { error: 'Cena je příliš vysoká. Zkontrolujte ji.' };
          return { price: v };
        };
        const update = () => {
          input.disabled = mode() === 'ask';
          const r = read();
          input.setAttribute('aria-invalid', r.error && input.value.trim() ? 'true' : 'false');
          if (r.error) { msg.textContent = input.value.trim() ? r.error : ''; msg.classList.toggle('is-error', Boolean(input.value.trim())); return; }
          msg.classList.remove('is-error');
          let t = r.price == null ? 'Zákazník uvidí: Cena na dotaz.' : `Zákazník uvidí: ${priceLabel(r.price)}.`;
          if (p.discount?.enabled) {
            const fin = discountedPrice(r.price, p.discount);
            t += Number.isNaN(fin) ? ' Nastavená sleva s touto cenou nejde použít a zákazníkům se nezobrazí.' : ` Cena po slevě se přepočítá na ${kc(fin)}.`;
          }
          msg.textContent = t;
        };
        d.addEventListener('input', update);
        d.addEventListener('change', () => { update(); if (mode() === 'set') input.focus(); });
        update();
        return {
          submit(v, done) {
            const r = read();
            if (r.error) { msg.textContent = r.error; msg.classList.add('is-error'); input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
            done(r);
          },
        };
      },
    });
    if (!result || result === 'cancel' || typeof result !== 'object') return;
    const next = { ...p, price: result.price, updatedAt: new Date().toISOString() };
    if (await commit(withProduct(next))) {
      renderList();
      setFlash(html`Cena automatu „${esc(p.name)}“ je uložená: ${esc(result.price == null ? 'Cena na dotaz' : priceLabel(result.price))}.`);
    }
  }

  async function quickAvailability(p, value, select) {
    const next = { ...p, availability: value || null, updatedAt: new Date().toISOString() };
    if (!(await commit(withProduct(next)))) { select.value = p.availability || ''; return; }
    renderList();
    root.querySelector(`[data-id="${CSS.escape(p.id)}"] [data-act="availability"]`)?.focus();
    setFlash(value === 'Prodáno'
      ? html`„${esc(p.name)}“ je označený jako prodaný. Z výpisů nabídky zmizí, jeho stránka zůstane s označením Prodáno.`
      : html`Dostupnost automatu „${esc(p.name)}“ je uložená: ${esc(value || 'Neuvedeno')}.`);
  }

  // Missing details that keep a machine from being published, as [field id, message].
  function publishProblems(p) {
    const out = [];
    if (!p.name?.trim()) out.push(['pf-name', 'Doplňte název automatu.']);
    if (!p.summary?.trim()) out.push(['pf-summary', 'Doplňte krátký popis. Zákazníci ho uvidí na kartě automatu.']);
    (p.images || []).forEach((img, i) => { if (!img.alt?.trim()) out.push([`pf-alt-${i}`, `Doplňte popis fotografie č. ${i + 1}.`]); });
    if (p.discount?.enabled) {
      const prob = discountProblem(p.price, p.discount);
      if (prob) out.push(['pf-d-value', prob]);
    }
    return out;
  }

  async function togglePublish(p) {
    if (statusOf(p) === 'published') {
      const next = { ...p, status: 'hidden', updatedAt: new Date().toISOString() };
      if (await commit(withProduct(next))) { renderList(); setFlash(html`„${esc(p.name)}“ je skrytý. Zákazníci ho nevidí, údaje zůstávají.`); }
      return;
    }
    if (publishProblems(p).length) { openForm(p.id, { publish: true }); return; }
    const next = { ...p, status: 'published', updatedAt: new Date().toISOString() };
    if (await commit(withProduct(next))) {
      renderList();
      setFlash(html`„${esc(p.name)}“ je zveřejněný${p.availability === 'Prodáno' ? ' (jako prodaný)' : ''}. <a href="${customerHref(next)}">Zobrazit v pohledu zákazníka</a>`);
    }
  }

  async function duplicate(p) {
    const name = `${p.name} (kopie)`;
    const taken = new Set(state.products.flatMap((x) => [x.id, x.slug]));
    let slug = slugify(name);
    for (let i = 2; taken.has(slug); i++) slug = `${slugify(name)}-${i}`;
    const copy = {
      ...clone(p), id: slug, slug, name, status: 'draft', ref: null, discount: null, featured: false,
      dateAdded: today(), updatedAt: new Date().toISOString(), deletedAt: null, placeholder: false,
    };
    if (await commit(withProduct(copy))) {
      openForm(copy.id);
      setFlash(html`Kopie „${esc(p.name)}“ je uložená jako koncept. Fotografie jsou sdílené s původním automatem, interní označení a sleva se nekopírují.`);
    }
  }

  async function moveToTrash(p) {
    const ok = await confirmDialog('Přesunout do koše?', html`Automat „${esc(p.name)}“ zmizí z nabídky a zákazníci ho přestanou vidět. Z koše ho můžete kdykoli obnovit.`, 'Přesunout do koše', { danger: true });
    if (!ok) return;
    const next = { ...p, deletedAt: new Date().toISOString() };
    if (await commit(withProduct(next))) {
      renderList();
      setFlash(html`„${esc(p.name)}“ je v koši. <button class="link-button" type="button" data-act="restore" data-id="${esc(p.id)}">Vrátit zpět</button>`);
    }
  }

  async function restore(id) {
    const p = byId(id);
    if (!p) return;
    const next = { ...p, deletedAt: null, updatedAt: new Date().toISOString() };
    if (await commit(withProduct(next))) {
      if (ui.tab === 'trash') renderTrash(); else renderList();
      setFlash(html`„${esc(p.name)}“ je obnovený se stavem ${STATUS_LABEL[statusOf(p)]}.`);
    }
  }

  async function deleteForever(id) {
    const p = byId(id);
    if (!p) return;
    const ok = await confirmDialog('Smazat natrvalo?', html`Automat „${esc(p.name)}“ se smaže i s údaji. Tento krok nejde vrátit. Fotografie, které používá i jiný automat, zůstanou zachované.`, 'Smazat natrvalo', { danger: true });
    if (!ok) return;
    const next = { ...state, products: state.products.filter((x) => x.id !== id), order: state.order.filter((x) => x !== id) };
    if (await commit(next)) {
      await store.deleteUnused(state.products, photoRefs([p]));
      renderTrash();
      setFlash(html`„${esc(p.name)}“ je smazaný natrvalo.`);
    }
  }

  /* ================= add / edit form ================= */
  const newProduct = () => ({
    id: `automat-${Date.now().toString(36)}`, slug: null, category: seed.categories[0].slug, name: '', manufacturer: null, model: null,
    type: null, condition: null, conditionDetails: null, summary: '', description: [], specs: specTemplate(seed.categories[0].slug),
    features: [], paymentSystems: [], warranty: null, price: null, availability: null, images: [], dateAdded: null, status: 'draft',
    featured: false, discount: null,
  });
  function specSuggestions(category) {
    const fromCat = seed.products.filter((p) => p.category === category).flatMap((p) => p.specs.map((s) => s.label));
    return [...new Set([...fromCat, ...GENERIC_SPECS])];
  }
  function specTemplate(category) {
    const first = seed.products.find((p) => p.category === category && p.specs.length);
    return first ? first.specs.map((s) => ({ label: s.label, value: null, key: Boolean(s.key) })) : [];
  }

  const field = (id, label, input, { hint, req, wide } = {}) => html`<div class="field${wide ? ' field-wide' : ''}">
  <label for="${id}">${label}${req ? html` <span class="req" aria-hidden="true">*</span>` : ''}</label>
  ${hint && html`<p class="pa-hint" id="${id}-hint">${hint}</p>`}
  ${input}
  <p class="pa-error" id="${id}-error" hidden></p>
</div>`;
  const text = (id, name, value, { max = 200, hint, ...rest } = {}) =>
    html`<input id="${id}" name="${name}" type="text" value="${esc(value ?? '')}" maxlength="${max}"${hint ? html` aria-describedby="${id}-hint"` : ''}${rest.inputmode ? html` inputmode="${rest.inputmode}"` : ''}${rest.placeholder ? html` placeholder="${esc(rest.placeholder)}"` : ''} autocomplete="off">`;
  const area = (id, name, value, { rows = 4, max = 4000, hint } = {}) =>
    html`<textarea id="${id}" name="${name}" rows="${rows}" maxlength="${max}"${hint ? html` aria-describedby="${id}-hint"` : ''}>${esc(value ?? '')}</textarea>`;

  function openForm(id, { publish = false } = {}) {
    const original = id ? byId(id) : null;
    if (id && !original) { renderList(); return; }
    const p = original ? clone(original) : newProduct();
    form = { id: p.id, isNew: !original, base: p, images: clone(p.images || []), uploaded: new Set(), dirty: false, saving: false };
    setTab('list', original ? `upravit/${encodeURIComponent(p.id)}` : 'novy');
    document.body.classList.add('pa-editing');
    const d = p.discount || { enabled: false, method: 'percent', value: null, start: null, end: null };
    const start = d.start ? utcToPrague(d.start) : { date: '', time: '' };
    const end = d.end ? utcToPrague(d.end) : { date: '', time: '' };
    const st = statusOf(p);
    const optional = [p.ref, p.type, p.year, p.description?.length, p.conditionDetails, p.defects, p.location, p.delivery, p.warranty, p.notes].some(Boolean);
    const conds = Object.entries(seed.site.conditions);

    view.innerHTML = html`<form class="pa-form" novalidate data-form>
  <div class="pa-form-head">
    <p class="pa-back"><button class="link-button" type="button" data-act="close-form">← Zpět na seznam automatů</button></p>
    <h2 id="pa-form-title" tabindex="-1">${original ? html`Upravit automat<span class="pa-form-sub">${esc(p.name)}</span>` : 'Nový automat'}</h2>
    <p class="pa-hint">Postup: nahrajte fotky, vyplňte základní údaje a cenu, pak automat zveřejněte. Povinná pole pro zveřejnění jsou označená *. Koncept můžete uložit kdykoli.</p>
    <ol class="pa-steps">
      <li><a href="#pf-s-photos">Fotografie a média</a></li>
      <li><a href="#pf-s-basic">Základní údaje</a></li>
      <li><a href="#pf-s-price">Cena a sleva</a></li>
      <li><a href="#pf-s-specs">Technické parametry</a></li>
      <li><a href="#pf-s-publish">Dostupnost a zveřejnění</a></li>
    </ol>
  </div>
  <div class="pa-summary" role="alert" tabindex="-1" hidden data-summary></div>

  <section class="pa-section" id="pf-s-photos" aria-labelledby="pf-h-photos">
    <h3 id="pf-h-photos"><span class="pa-step">1</span> Fotografie a média</h3>
    <div class="pa-drop" data-drop>
      <input class="visually-hidden" id="pf-files" type="file" accept="image/jpeg,image/png,image/webp" multiple data-files>
      <p><strong>Přetáhněte fotografie sem</strong> nebo <label class="btn btn-secondary btn-sm" for="pf-files">Vybrat fotografie</label></p>
      <p class="pa-hint">JPG, PNG nebo WebP do 25 MB. Můžete vybrat víc fotek najednou. Zmenšíme je na 1600 px a uložíme v tomto prohlížeči.</p>
    </div>
    <ul class="pa-queue" aria-live="polite" data-queue></ul>
    <ol class="pa-photos" data-photos aria-label="Fotografie automatu"></ol>
    <input class="visually-hidden" id="pf-replace" type="file" accept="image/jpeg,image/png,image/webp" tabindex="-1" aria-hidden="true" data-replace>
    ${field('pf-video', 'Odkaz na video (nepovinné)', text('pf-video', 'video', p.video, { max: 500, hint: true, placeholder: 'https://' }), { hint: 'Například video na YouTube nebo Vimeo. Zákazník uvidí odkaz „Video automatu“.' })}
  </section>

  <section class="pa-section" id="pf-s-basic" aria-labelledby="pf-h-basic">
    <h3 id="pf-h-basic"><span class="pa-step">2</span> Základní údaje</h3>
    <div class="form-grid">
      ${field('pf-name', 'Název automatu', text('pf-name', 'name', p.name, { max: 120 }), { req: true, wide: true })}
      ${field('pf-category', 'Kategorie', html`<select id="pf-category" name="category">${seed.categories.map((c) => html`<option value="${esc(c.slug)}"${c.slug === p.category ? ' selected' : ''}>${esc(c.name)}</option>`)}</select>`, { req: true })}
      ${field('pf-condition', 'Stav automatu', html`<select id="pf-condition" name="condition"><option value="">Neuvedeno</option>${conds.map(([k, v]) => html`<option value="${esc(k)}"${k === p.condition ? ' selected' : ''}>${esc(v.label)}</option>`)}</select>`)}
      ${field('pf-summary', 'Krátký popis', text('pf-summary', 'summary', p.summary, { max: 220, hint: true }), { req: true, wide: true, hint: 'Jedna věta na kartu automatu, například „Instantní automat na teplé nápoje pro menší kanceláře“.' })}
      ${field('pf-manufacturer', 'Výrobce', text('pf-manufacturer', 'manufacturer', p.manufacturer, { max: 80 }))}
      ${field('pf-model', 'Model', text('pf-model', 'model', p.model, { max: 80 }))}
    </div>
    <details class="pa-more"${optional ? ' open' : ''}>
      <summary>Další údaje (nepovinné)</summary>
      <div class="form-grid">
        ${field('pf-ref', 'Interní označení', text('pf-ref', 'ref', p.ref, { max: 60, hint: true }), { hint: 'Vaše evidenční číslo. Zákazníci ho nevidí.' })}
        ${field('pf-type', 'Typ automatu', text('pf-type', 'type', p.type, { max: 80, hint: true }), { hint: 'Například „stolní“ nebo „volně stojící“.' })}
        ${field('pf-year', 'Rok výroby', text('pf-year', 'year', p.year, { max: 4, inputmode: 'numeric' }))}
        ${field('pf-location', 'Umístění automatu', text('pf-location', 'location', p.location, { max: 120, hint: true }), { hint: 'Kde si ho zákazník může prohlédnout, například „sklad Brno“.' })}
        ${field('pf-description', 'Podrobný popis', area('pf-description', 'description', (p.description || []).join('\n\n'), { rows: 5, hint: true }), { wide: true, hint: 'Odstavce oddělte prázdným řádkem.' })}
        ${field('pf-condition-details', 'Co bylo na automatu zkontrolováno nebo opraveno', area('pf-condition-details', 'conditionDetails', p.conditionDetails, { rows: 3 }), { wide: true })}
        ${field('pf-defects', 'Známé vady a opotřebení', area('pf-defects', 'defects', p.defects, { rows: 3, hint: true }), { wide: true, hint: 'Uveďte jen skutečně zjištěné vady. Zákazník je uvidí v části Stav a repase.' })}
        ${field('pf-delivery', 'Doprava a předání', area('pf-delivery', 'delivery', p.delivery, { rows: 2 }), { wide: true })}
        ${field('pf-warranty', 'Záruka', area('pf-warranty', 'warranty', p.warranty, { rows: 2, hint: true }), { wide: true, hint: 'Vyplňte jen záruku, kterou opravdu poskytujete. Prázdné pole se nezobrazí.' })}
        ${field('pf-notes', 'Interní poznámky', area('pf-notes', 'notes', p.notes, { rows: 3, hint: true }), { wide: true, hint: 'Jen pro vás. Na webu se nikdy nezobrazí.' })}
      </div>
    </details>
  </section>

  <section class="pa-section" id="pf-s-price" aria-labelledby="pf-h-price">
    <h3 id="pf-h-price"><span class="pa-step">3</span> Cena a sleva</h3>
    <fieldset class="pa-choice"><legend>Cena</legend>
      <label><input type="radio" name="priceMode" value="ask"${p.price == null ? ' checked' : ''}> Cena na dotaz</label>
      <label><input type="radio" name="priceMode" value="set"${p.price != null ? ' checked' : ''}> Uvést cenu</label>
    </fieldset>
    <div class="pa-price-row" data-price-row>
      ${field('pf-price', `Běžná cena v Kč ${vat}`, text('pf-price', 'price', groupDigits(p.price), { max: 14, inputmode: 'numeric', hint: true }), { hint: 'Celé koruny, například 45 000. Prázdné pole nikdy neznamená 0 Kč.' })}
    </div>
    <p class="pa-preview-line" data-price-preview aria-live="polite"></p>

    <div class="pa-discount" data-discount>
      <label class="pa-switch"><input type="checkbox" name="dEnabled"${d.enabled ? ' checked' : ''} data-d-enabled> <span>Sleva</span></label>
      <p class="pa-hint" data-d-off-note></p>
      <div class="pa-discount-body" data-d-body>
        <fieldset class="pa-choice"><legend>Jak slevu zadat</legend>
          ${Object.entries(METHOD_LABEL).map(([v, t]) => html`<label><input type="radio" name="dMethod" value="${v}"${d.method === v ? ' checked' : ''}> ${t}</label>`)}
        </fieldset>
        ${field('pf-d-value', '<span data-d-value-label>Sleva</span>', html`<div class="pa-suffix"><input id="pf-d-value" name="dValue" type="text" inputmode="decimal" maxlength="14" autocomplete="off" value="${esc(d.value == null ? '' : d.method === 'percent' ? String(d.value).replace('.', ',') : groupDigits(d.value))}"><span data-d-suffix>%</span></div>`)}
        <dl class="pa-calc" data-d-calc></dl>
        <fieldset class="pa-when"><legend>Začátek slevy</legend>
          <label><input type="radio" name="dStartMode" value="now"${d.start ? '' : ' checked'}> Hned po uložení</label>
          <label><input type="radio" name="dStartMode" value="at"${d.start ? ' checked' : ''}> Od data a času</label>
          <div class="pa-datetime" data-when="start">
            <label for="pf-d-start-date">Datum</label><input id="pf-d-start-date" name="dStartDate" type="date" value="${esc(start.date)}">
            <label for="pf-d-start-time">Čas</label><input id="pf-d-start-time" name="dStartTime" type="time" value="${esc(start.time)}">
          </div>
          <p class="pa-error" id="pf-d-start-error" hidden></p>
        </fieldset>
        <fieldset class="pa-when"><legend>Konec slevy</legend>
          <label><input type="radio" name="dEndMode" value="none"${d.end ? '' : ' checked'}> Bez konce</label>
          <label><input type="radio" name="dEndMode" value="at"${d.end ? ' checked' : ''}> Do data a času</label>
          <div class="pa-datetime" data-when="end">
            <label for="pf-d-end-date">Datum</label><input id="pf-d-end-date" name="dEndDate" type="date" value="${esc(end.date)}">
            <label for="pf-d-end-time">Čas</label><input id="pf-d-end-time" name="dEndTime" type="time" value="${esc(end.time)}">
          </div>
          <p class="pa-error" id="pf-d-end-error" hidden></p>
        </fieldset>
        <p class="pa-hint">Časy jsou v českém čase (Praha) a počítají s přechodem na letní i zimní čas. Cena se na webu změní sama ve chvíli začátku a konce slevy.</p>
        <p class="pa-sentence" data-d-sentence aria-live="polite"></p>
      </div>
    </div>
  </section>

  <section class="pa-section" id="pf-s-specs" aria-labelledby="pf-h-specs">
    <h3 id="pf-h-specs"><span class="pa-step">4</span> Technické parametry</h3>
    <p class="pa-hint">Vyplňte jen hodnoty, které znáte. Prázdné parametry zákazník uvidí jako „zatím neuvedeno“. Zaškrtnuté „Na kartě“ se ukážou i v nabídce (nejvýš tři).</p>
    <datalist id="pf-spec-labels">${specSuggestions(p.category).map((l) => html`<option value="${esc(l)}"></option>`)}</datalist>
    <ul class="pa-specs" data-specs>${(p.specs || []).map((s, i) => specRow(s, i))}</ul>
    <button class="btn btn-secondary btn-sm" type="button" data-act="add-spec">Přidat parametr</button>
    <div class="form-grid pa-lists">
      ${field('pf-features', 'Vybavení', area('pf-features', 'features', (p.features || []).join('\n'), { rows: 4, hint: true }), { hint: 'Každou položku na nový řádek.' })}
      ${field('pf-payments', 'Platební systémy', area('pf-payments', 'paymentSystems', (p.paymentSystems || []).join('\n'), { rows: 4, hint: true }), { hint: 'Každou položku na nový řádek, například „mincovník“.' })}
    </div>
  </section>

  <section class="pa-section" id="pf-s-publish" aria-labelledby="pf-h-publish">
    <h3 id="pf-h-publish"><span class="pa-step">5</span> Dostupnost a zveřejnění</h3>
    <div class="form-grid">
      ${field('pf-availability', 'Dostupnost', html`<select id="pf-availability" name="availability" aria-describedby="pf-availability-hint"><option value="">Neuvedeno</option>${AVAILABILITY.map((a) => html`<option${p.availability === a ? ' selected' : ''}>${a}</option>`)}</select>`, { hint: '<span data-avail-hint></span>' })}
      ${field('pf-stock', 'Počet kusů (nepovinné)', text('pf-stock', 'stock', p.stock, { max: 4, inputmode: 'numeric', hint: true }), { hint: 'Zobrazí se u stavu Skladem, pokud máte víc než jeden kus.' })}
    </div>
    <label class="pa-check"><input type="checkbox" name="featured"${p.featured ? ' checked' : ''}> <span><strong>Doporučený automat</strong><br>Na webu bude první v řazení Doporučené a dostane štítek Doporučujeme.</span></label>
    <fieldset class="pa-choice pa-status-choice"><legend>Zveřejnění</legend>
      ${Object.entries(STATUS_LABEL).map(([v, t]) => html`<label><input type="radio" name="status" value="${v}"${st === v ? ' checked' : ''}> <span><strong>${t}</strong><br>${STATUS_HINT[v]}</span></label>`)}
    </fieldset>
  </section>

  <div class="pa-savebar" role="region" aria-label="Uložení automatu">
    <p class="pa-save-state" data-save-state aria-live="polite"></p>
    <div class="pa-save-actions">
      <button class="btn btn-ghost" type="button" data-act="close-form">Zrušit</button>
      <button class="btn btn-secondary" type="button" data-act="preview">Náhled</button>
      <button class="btn btn-secondary" type="button" data-act="save" data-save-btn></button>
      <button class="btn btn-primary" type="button" data-act="publish" data-publish-btn>Zveřejnit</button>
    </div>
  </div>
</form>`;
    const f = view.querySelector('[data-form]');
    form.el = f;
    renderPhotos();
    bindForm(f);
    updateForm();
    setSaveState(form.isNew ? 'Nový automat zatím není uložený.' : `Naposledy uloženo ${p.updatedAt ? formatPrague(p.updatedAt) : 's původními daty webu'}.`);
    if (publish) submit('publish');
    else view.querySelector('#pa-form-title').focus();
    window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 16, behavior: 'instant' });
  }

  function specRow(s, i) {
    return html`<li class="pa-spec">
  <div class="field"><label for="pf-spec-l-${i}">Parametr</label><input id="pf-spec-l-${i}" data-spec="label" list="pf-spec-labels" value="${esc(s.label || '')}" maxlength="80" autocomplete="off"></div>
  <div class="field"><label for="pf-spec-v-${i}">Hodnota</label><input id="pf-spec-v-${i}" data-spec="value" value="${esc(s.value ?? '')}" maxlength="160" autocomplete="off" placeholder="neuvedeno"></div>
  <label class="pa-check pa-spec-key"><input type="checkbox" data-spec="key"${s.key ? ' checked' : ''}> Na kartě</label>
  <button class="btn btn-ghost btn-sm" type="button" data-act="remove-spec">Odebrat<span class="visually-hidden"> parametr ${esc(s.label || '')}</span></button>
</li>`;
  }

  /* ---------- photos in the form ---------- */
  function renderPhotos(focusSel) {
    const list = form.el.querySelector('[data-photos]');
    const n = form.images.length;
    list.innerHTML = n
      ? form.images.map((img, i) => html`<li class="pa-photo" draggable="true" data-index="${i}">
  <div class="pa-photo-img"><img src="${esc(photoSrc(img.src))}" alt="">${i === 0 ? '<span class="pa-cover">Titulní fotografie</span>' : ''}</div>
  <div class="pa-photo-fields">
    <div class="field"><label for="pf-alt-${i}">Popis fotografie č. ${i + 1} <span class="req" aria-hidden="true">*</span></label>
      <input id="pf-alt-${i}" data-photo="alt" value="${esc(img.alt || '')}" maxlength="160" autocomplete="off" aria-describedby="pf-alt-${i}-hint"><p class="pa-hint" id="pf-alt-${i}-hint">Co je na fotce, pro nevidomé a vyhledávače.</p><p class="pa-error" id="pf-alt-${i}-error" hidden></p></div>
    <label class="pa-check"><input type="checkbox" data-photo="illustrative"${img.illustrative ? ' checked' : ''}> Ilustrační foto podobného modelu (ne prodávaný kus)</label>
    ${img.illustrative ? html`<div class="pa-credit">
      <div class="field"><label for="pf-cr-l-${i}">Zdroj fotografie</label><input id="pf-cr-l-${i}" data-photo="creditLabel" value="${esc(img.credit?.label || '')}" maxlength="80"></div>
      <div class="field"><label for="pf-cr-u-${i}">Odkaz na zdroj</label><input id="pf-cr-u-${i}" data-photo="creditUrl" value="${esc(img.credit?.url || '')}" maxlength="300" placeholder="https://"></div>
    </div>` : ''}
    <div class="pa-photo-actions">
      ${i > 0 ? html`<button class="btn btn-ghost btn-sm" type="button" data-act="photo-cover">Nastavit jako titulní</button>` : ''}
      <button class="btn btn-ghost btn-sm" type="button" data-act="photo-up"${i === 0 ? ' disabled' : ''}>Posunout dopředu<span class="visually-hidden">: fotografie č. ${i + 1}</span></button>
      <button class="btn btn-ghost btn-sm" type="button" data-act="photo-down"${i === n - 1 ? ' disabled' : ''}>Posunout dozadu<span class="visually-hidden">: fotografie č. ${i + 1}</span></button>
      <button class="btn btn-ghost btn-sm" type="button" data-act="photo-replace">Nahradit<span class="visually-hidden"> fotografii č. ${i + 1}</span></button>
      <button class="btn btn-ghost btn-sm is-danger" type="button" data-act="photo-remove">Odebrat<span class="visually-hidden"> fotografii č. ${i + 1}</span></button>
    </div>
  </div>
</li>`).join('')
      : html`<li class="pa-photo-none">Zatím bez fotografie. Zákazník uvidí neutrální kresbu s textem „Fotografie bude doplněna“.</li>`;
    if (focusSel) list.querySelector(focusSel)?.focus();
  }
  function movePhoto(from, to) {
    if (to < 0 || to >= form.images.length || from === to) return;
    const [img] = form.images.splice(from, 1);
    form.images.splice(to, 0, img);
    markDirty();
  }

  // Reads and shrinks a photo: longest side 1600 px, JPEG. Reports progress 0–1.
  function processPhoto(file, onProgress) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Vyberte fotografii ve formátu JPG, PNG nebo WebP.'));
      if (file.size > PHOTO_MAX_BYTES) return reject(new Error('Fotografie je větší než 25 MB. Vyberte menší soubor.'));
      const reader = new FileReader();
      reader.onprogress = (e) => e.lengthComputable && onProgress(0.6 * (e.loaded / e.total));
      reader.onerror = () => reject(new Error('Soubor se nepodařilo přečíst.'));
      reader.onload = () => {
        onProgress(0.65);
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          onProgress(0.85);
          canvas.toBlob((blob) => (blob ? resolve({ blob, width: w, height: h }) : reject(new Error('Fotografii se nepodařilo zpracovat.'))), 'image/jpeg', 0.85);
        };
        img.onerror = () => reject(new Error('Soubor se nepodařilo otevřít jako obrázek.'));
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function addPhotos(files, replaceIndex = null) {
    const queue = form.el.querySelector('[data-queue]');
    for (const file of files) {
      const li = document.createElement('li');
      li.innerHTML = html`<span class="pa-q-name">${esc(file.name)}</span> <progress max="100" value="0" aria-label="Nahrávání ${esc(file.name)}"></progress> <span class="pa-q-state">Zpracovávám…</span>`;
      queue.append(li);
      const bar = li.querySelector('progress');
      const stateEl = li.querySelector('.pa-q-state');
      try {
        const { blob, width, height } = await processPhoto(file, (x) => { bar.value = Math.round(x * 100); });
        stateEl.textContent = 'Ukládám…';
        const ref = await store.putPhoto(blob);
        bar.value = 100;
        if (isStoredPhoto(ref)) photos.set(ref, URL.createObjectURL(blob));
        form.uploaded.add(ref);
        const name = form.el.querySelector('#pf-name').value.trim();
        if (replaceIndex != null && form.images[replaceIndex]) {
          form.images[replaceIndex] = { ...form.images[replaceIndex], src: ref, width, height, thumb: undefined, srcset: undefined };
        } else {
          form.images.push({ src: ref, alt: name, width, height, illustrative: false });
        }
        stateEl.textContent = 'Hotovo';
        li.classList.add('is-done');
        setTimeout(() => li.remove(), 2500);
        markDirty();
        renderPhotos();
      } catch (e) {
        li.classList.add('is-error');
        stateEl.textContent = e.userMessage || e.message || 'Fotografii se nepodařilo nahrát.';
        bar.remove();
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'link-button'; x.textContent = 'Skrýt';
        x.addEventListener('click', () => li.remove());
        li.append(' ', x);
      }
    }
  }

  /* ---------- reading and checking the form ---------- */
  const val = (name) => form.el.elements[name]?.value ?? '';
  const checked = (name) => form.el.querySelector(`[name="${name}"]:checked`)?.value;

  function readPrice() {
    if (checked('priceMode') === 'ask') return { price: null };
    const raw = val('price');
    if (!raw.trim()) return { price: null, error: 'Zadejte cenu, nebo zvolte Cena na dotaz.' };
    const v = parseCzk(raw);
    if (Number.isNaN(v)) return { price: null, error: 'Napište cenu celými korunami, například 45 000.' };
    if (v <= 0) return { price: null, error: 'Cena musí být vyšší než 0 Kč.' };
    if (v > MAX_PRICE) return { price: null, error: 'Cena je příliš vysoká. Zkontrolujte ji.' };
    return { price: v };
  }
  function readWhen(which) {
    const mode = checked(which === 'start' ? 'dStartMode' : 'dEndMode');
    if (mode !== 'at') return { iso: null };
    const date = val(which === 'start' ? 'dStartDate' : 'dEndDate');
    let time = val(which === 'start' ? 'dStartTime' : 'dEndTime');
    if (!date) return { error: which === 'start' ? 'Zadejte datum začátku slevy.' : 'Zadejte datum konce slevy.' };
    if (!time) time = which === 'start' ? '00:00' : '23:59';
    const r = pragueToUtc(date, time);
    if (r.error === 'gap') return { error: `Čas ${time} v den přechodu na letní čas neexistuje (hodiny se posouvají ze 2:00 na 3:00). Zvolte jiný čas.` };
    if (r.error) return { error: 'Zadejte platné datum a čas.' };
    return { iso: r.iso };
  }
  function readDiscount(price) {
    // a discount needs a stated price: with "Cena na dotaz" it is switched off
    const enabled = form.el.querySelector('[data-d-enabled]').checked && checked('priceMode') !== 'ask';
    const method = checked('dMethod') || 'percent';
    const raw = val('dValue').trim();
    const value = raw === '' ? NaN : method === 'percent' ? Number(raw.replace(',', '.').replace(/\s|%/g, '')) : parseCzk(raw);
    const start = readWhen('start');
    const end = readWhen('end');
    const d = { enabled, method, value: Number.isFinite(value) ? value : null, start: start.iso ?? null, end: end.iso ?? null };
    const errors = [];
    if (enabled) {
      if (start.error) errors.push(['pf-d-start-date', start.error, 'pf-d-start']);
      if (end.error) errors.push(['pf-d-end-date', end.error, 'pf-d-end']);
      const prob = discountProblem(price, { ...d, value: Number.isFinite(value) ? value : NaN });
      if (prob) errors.push([prob.includes('Konec') ? 'pf-d-end-date' : 'pf-d-value', prob, prob.includes('Konec') ? 'pf-d-end' : 'pf-d-value']);
    }
    // nothing entered and switched off: no discount at all
    const empty = !enabled && d.value == null && !d.start && !d.end;
    return { discount: empty ? null : d, errors };
  }

  // The machine as the form describes it, and what is wrong with it for this kind of save.
  function readForm(mode) {
    const errors = [];
    const price = readPrice();
    if (price.error) errors.push(['pf-price', price.error]);
    const { discount, errors: dErrors } = readDiscount(price.price);
    errors.push(...dErrors);
    const specs = [...form.el.querySelectorAll('.pa-spec')].map((li) => ({
      label: li.querySelector('[data-spec="label"]').value.trim(),
      value: trimOrNull(li.querySelector('[data-spec="value"]').value),
      key: li.querySelector('[data-spec="key"]').checked,
    })).filter((s) => s.label);
    const year = val('year').trim();
    if (year && !(/^\d{4}$/.test(year) && +year >= 1950 && +year <= new Date().getFullYear() + 1)) errors.push(['pf-year', 'Rok výroby napište čtyřmi číslicemi, například 2016.']);
    const stockRaw = val('stock').trim();
    const stock = stockRaw ? parseCzk(stockRaw) : null;
    if (stockRaw && !(stock >= 1 && stock <= 999)) errors.push(['pf-stock', 'Počet kusů musí být celé číslo od 1 do 999, nebo nechte pole prázdné.']);
    const video = val('video').trim();
    if (video && !/^https?:\/\/[^\s]+\.[^\s]+/.test(video)) errors.push(['pf-video', 'Odkaz na video musí začínat https:// a vést na webovou stránku.']);
    const images = form.images.map((img) => ({ ...img, credit: img.illustrative && (img.credit?.label || img.credit?.url) ? img.credit : undefined }));
    images.forEach((img, i) => { if (img.illustrative && img.credit?.url && !/^https?:\/\//.test(img.credit.url)) errors.push([`pf-cr-u-${i}`, `Odkaz na zdroj fotografie č. ${i + 1} musí začínat https://.`]); });

    const status = checked('status') || 'draft';
    const now = new Date().toISOString();
    const name = val('name').trim();
    const p = {
      ...form.base,
      name,
      category: val('category'),
      condition: val('condition') || null,
      summary: val('summary').trim(),
      manufacturer: trimOrNull(val('manufacturer')),
      model: trimOrNull(val('model')),
      ref: trimOrNull(val('ref')),
      type: trimOrNull(val('type')),
      year: year ? Number(year) : null,
      location: trimOrNull(val('location')),
      description: paragraphs(val('description')),
      conditionDetails: trimOrNull(val('conditionDetails')),
      defects: trimOrNull(val('defects')),
      delivery: trimOrNull(val('delivery')),
      warranty: trimOrNull(val('warranty')),
      notes: trimOrNull(val('notes')),
      video: video || null,
      images,
      price: price.price,
      discount,
      specs,
      features: lines(val('features')),
      paymentSystems: lines(val('paymentSystems')),
      availability: val('availability') || null,
      stock: stockRaw && stock >= 1 ? stock : null,
      featured: form.el.elements.featured.checked,
      status,
      updatedAt: now,
    };
    if (!name) errors.unshift(['pf-name', 'Doplňte název automatu.']);
    if (mode === 'publish') {
      for (const [id, msg] of publishProblems(p)) if (!errors.some((e) => e[0] === id)) errors.push([id, msg]);
    }
    return { product: p, errors };
  }

  function clearErrors() {
    for (const el of form.el.querySelectorAll('.pa-error')) { el.hidden = true; el.textContent = ''; }
    for (const el of form.el.querySelectorAll('[aria-invalid="true"]')) el.removeAttribute('aria-invalid');
    const sum = form.el.querySelector('[data-summary]');
    sum.hidden = true; sum.innerHTML = '';
  }
  function showErrors(errors, intro) {
    clearErrors();
    for (const [id, msg, errId] of errors) {
      const input = form.el.querySelector(`#${CSS.escape(id)}`);
      const box = form.el.querySelector(`#${CSS.escape(errId || id)}-error`);
      if (input) {
        input.setAttribute('aria-invalid', 'true');
        if (box) input.setAttribute('aria-describedby', [...new Set([...(input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean), box.id])].join(' '));
        input.closest('details')?.setAttribute('open', '');
      }
      if (box) { box.hidden = false; box.textContent = msg; }
    }
    const sum = form.el.querySelector('[data-summary]');
    sum.innerHTML = html`<p><strong>${esc(intro)}</strong></p><ul>${errors.map(([id, msg]) => html`<li><a href="#${esc(id)}">${esc(msg)}</a></li>`)}</ul>`;
    sum.hidden = false;
    sum.focus();
  }

  /* ---------- live parts of the form ---------- */
  function updateForm() {
    if (!form?.el) return;
    const f = form.el;
    const price = readPrice();
    const ask = checked('priceMode') === 'ask';
    const priceInput = f.querySelector('#pf-price');
    priceInput.disabled = ask;
    f.querySelector('[data-price-row]').classList.toggle('is-off', ask);
    const { discount } = readDiscount(price.price);
    const toggle = f.querySelector('[data-d-enabled]');
    toggle.disabled = ask;
    const enabled = toggle.checked && !ask;
    const draftP = { price: price.price, discount: discount && { ...discount, value: discount.value ?? NaN } };
    const s = enabled ? sale(draftP, Date.now()) : null;
    const st = discount ? discountState(draftP, Date.now()) : 'none';

    // what the customer sees
    const preview = f.querySelector('[data-price-preview]');
    if (ask) preview.textContent = 'Zákazník uvidí: Cena na dotaz.';
    else if (price.error) preview.textContent = val('price').trim() ? price.error : 'Zadejte cenu, nebo zvolte Cena na dotaz.';
    else preview.textContent = s ? `Zákazník teď uvidí: ${priceLabel(s.final)} (běžná cena ${kc(s.standard)} přeškrtnutá).` : `Zákazník uvidí: ${priceLabel(price.price)}.`;
    preview.classList.toggle('is-error', !ask && Boolean(price.error) && Boolean(val('price').trim()));

    // discount block
    const body = f.querySelector('[data-d-body]');
    body.hidden = !enabled;
    const offNote = f.querySelector('[data-d-off-note]');
    offNote.textContent = enabled ? '' : ask ? 'Slevu můžete zapnout, až uvedete cenu.' : 'Zapněte, pokud chcete automat nabídnout se slevou. Běžná cena zůstane uložená.';
    const method = checked('dMethod') || 'percent';
    f.querySelector('[data-d-value-label]').textContent = method === 'percent' ? 'Sleva v procentech' : method === 'amount' ? 'Sleva v Kč' : `Cena po slevě v Kč ${vat}`;
    f.querySelector('[data-d-suffix]').textContent = method === 'percent' ? '%' : 'Kč';
    for (const w of ['start', 'end']) {
      const on = checked(w === 'start' ? 'dStartMode' : 'dEndMode') === 'at';
      const box = f.querySelector(`[data-when="${w}"]`);
      box.hidden = !on;
      for (const i of box.querySelectorAll('input')) i.disabled = !on;
    }
    const calc = f.querySelector('[data-d-calc]');
    const fin = price.price != null && discount && Number.isFinite(discount.value) ? discountedPrice(price.price, discount) : NaN;
    calc.innerHTML = price.price == null
      ? html`<div class="pa-calc-note">${ask ? 'Sleva potřebuje uvedenou běžnou cenu.' : 'Nejdřív zadejte běžnou cenu.'}</div>`
      : html`<div><dt>Běžná cena</dt><dd>${esc(kc(price.price))}</dd></div>
<div><dt>Sleva</dt><dd>${Number.isNaN(fin) ? '–' : esc(`${kc(price.price - fin)}${method === 'percent' ? '' : ` (${String(Math.round((1 - fin / price.price) * 1000) / 10).replace('.', ',')} %)`}`)}</dd></div>
<div><dt>Cena po slevě</dt><dd><strong>${Number.isNaN(fin) ? '–' : esc(kc(fin))}</strong></dd></div>
<div><dt>Zákazník ušetří</dt><dd>${Number.isNaN(fin) ? '–' : esc(kc(price.price - fin))}</dd></div>`;
    const sentence = f.querySelector('[data-d-sentence]');
    const problem = enabled ? discountProblem(price.price, { ...discount, value: discount?.value ?? NaN }) : '';
    const sw = readWhen('start'), ew = readWhen('end');
    if (!enabled) sentence.textContent = '';
    else if (sw.error || ew.error) sentence.textContent = sw.error || ew.error;
    else if (problem) sentence.textContent = problem;
    else {
      const dd = { start: sw.iso, end: ew.iso };
      sentence.innerHTML = html`<span class="pa-pill pa-pill-${st}">${DISCOUNT_LABEL[st]}</span> ${esc(scheduleSentence(dd, Date.now()))}${st === 'ended' ? ' Zákazníci slevu neuvidí.' : ''}`;
    }
    sentence.classList.toggle('is-error', Boolean(enabled && (sw.error || ew.error || problem)));

    // availability, status and the save buttons
    f.querySelector('[data-avail-hint]').textContent = AVAIL_HINT[val('availability')] || '';
    const status = checked('status') || 'draft';
    const saveBtn = f.querySelector('[data-save-btn]');
    saveBtn.textContent = status === 'draft' ? 'Uložit koncept' : 'Uložit změny';
    f.querySelector('[data-publish-btn]').hidden = status === 'published';
    saveBtn.classList.toggle('btn-primary', status === 'published');
    saveBtn.classList.toggle('btn-secondary', status !== 'published');
  }

  function setSaveState(t, kind = '') {
    const el = form?.el?.querySelector('[data-save-state]');
    if (!el) return;
    el.className = `pa-save-state${kind ? ` is-${kind}` : ''}`;
    el.innerHTML = t;
  }
  function markDirty() {
    if (!form) return;
    form.dirty = true;
    setSaveState('<span class="pa-dot" aria-hidden="true"></span>Máte neuložené změny.', 'dirty');
  }

  async function submit(kind) {
    if (!form || form.saving) return;
    const before = checked('status');
    if (kind === 'publish') form.el.querySelector('[name="status"][value="published"]').checked = true;
    updateForm();
    const status = checked('status');
    const { product, errors } = readForm(status === 'published' ? 'publish' : 'draft');
    if (errors.length) {
      // a publish that could not happen leaves the chosen status as it was
      if (kind === 'publish' && before) { form.el.querySelector(`[name="status"][value="${before}"]`).checked = true; updateForm(); }
      showErrors(errors, status === 'published' ? 'Automat zatím nejde zveřejnit. Doplňte prosím:' : 'Automat zatím nejde uložit. Opravte prosím:');
      setSaveState('Neuloženo: zkontrolujte označená pole.', 'error');
      return;
    }
    clearErrors();
    if (!product.slug) {
      const taken = new Set(state.products.filter((x) => x.id !== product.id).flatMap((x) => [x.id, x.slug]));
      let slug = slugify(product.name);
      for (let i = 2; taken.has(slug); i++) slug = `${slugify(product.name)}-${i}`;
      product.slug = slug;
    }
    if (!product.dateAdded) product.dateAdded = today();
    if (product.discount && !product.discount.enabled && !form.base.discount) product.discount = null;
    form.saving = true;
    const buttons = [...form.el.querySelectorAll('.pa-savebar button')];
    buttons.forEach((b) => { b.disabled = true; });
    setSaveState('Ukládám…', 'saving');
    const removed = photoRefs([form.base]);
    try {
      const saved = await store.save(withProduct(product));
      state = saved;
      // photos this machine no longer uses, and nothing else uses either
      await store.deleteUnused(state.products, new Set([...removed, ...form.uploaded]));
      form.base = clone(state.products.find((x) => x.id === product.id));
      form.isNew = false;
      form.uploaded = new Set();
      form.dirty = false;
      history.replaceState(history.state, '', `${location.pathname}${location.search}#upravit/${encodeURIComponent(product.id)}`);
      view.querySelector('#pa-form-title').innerHTML = html`Upravit automat<span class="pa-form-sub">${esc(product.name)}</span>`;
      const stNow = statusOf(product);
      const what = stNow === 'published' ? (product.availability === 'Prodáno' ? 'Zveřejněno jako prodaný.' : 'Zveřejněno, zákazníci automat vidí.') : stNow === 'draft' ? 'Koncept je uložený. Zákazníci ho nevidí.' : 'Uloženo jako skrytý. Zákazníci ho nevidí.';
      setSaveState(html`<strong>Uloženo v tomto prohlížeči.</strong> ${what} <a href="${customerHref(product)}">Zobrazit${isVisible(product) ? ' v pohledu zákazníka' : ' náhled'}</a> · <button class="link-button" type="button" data-act="close-form">Zpět na seznam</button>`, 'ok');
    } catch (e) {
      setSaveState(esc(e.userMessage || 'Změny se nepodařilo uložit. Údaje ve formuláři zůstávají, zkuste to znovu.'), 'error');
      form.el.querySelector('[data-save-state]').focus?.();
    } finally {
      form.saving = false;
      buttons.forEach((b) => { b.disabled = false; });
      updateForm();
    }
  }

  async function closeForm() {
    if (!form) return true;
    if (form.dirty) {
      const ok = await confirmDialog('Zahodit neuložené změny?', 'Změny v tomto automatu ještě nejsou uložené. Pokud formulář zavřete, ztratí se.', 'Zahodit změny', { danger: true, no: 'Pokračovat v úpravách' });
      if (!ok) return false;
      if (form.uploaded.size) await store.deleteUnused(state.products, form.uploaded);
    }
    form = null;
    document.body.classList.remove('pa-editing');
    return true;
  }

  function preview() {
    const { product } = readForm('draft');
    if (!product.name) product.name = 'Nový automat';
    if (!product.slug) product.slug = slugify(product.name);
    const c = env.context(withProduct(product), photos);
    const shown = c.products.find((x) => x.id === product.id) || env.withPath(env.withPhotos(product, photos));
    try { localStorage.setItem(env.PREVIEW_KEY, JSON.stringify(product)); } catch (e) { /* the full page preview then shows the saved version */ }
    const pageHref = url(`${env.PREVIEW_PATH}?id=${encodeURIComponent(product.id)}&koncept=1`);
    openDialog({
      title: 'Náhled automatu',
      body: html`<p class="pa-preview-label"><span class="pa-pill pa-pill-${statusOf(product)}">${STATUS_LABEL[statusOf(product)]}</span> ${statusOf(product) === 'published' ? 'Takto bude karta vypadat v nabídce.' : 'Náhled konceptu. Zákazníci ho nevidí, dokud automat nezveřejníte.'}${form.dirty ? ' Obsahuje i neuložené změny.' : ''}</p>
<ul class="card-grid pa-preview-grid" inert>${productCard(c, shown)}</ul>
<p><a class="btn btn-secondary" href="${pageHref}" target="_blank" rel="noopener">Otevřít celou stránku automatu<span class="visually-hidden"> (otevře se v nové kartě)</span></a></p>`,
      actions: [['cancel', 'Zavřít náhled', 'primary']],
    });
  }

  function bindForm(f) {
    f.addEventListener('input', (e) => {
      if (e.target.matches('[data-photo]')) {
        const i = Number(e.target.closest('.pa-photo').dataset.index);
        const img = form.images[i];
        const k = e.target.dataset.photo;
        if (k === 'alt') img.alt = e.target.value;
        if (k === 'creditLabel') img.credit = { ...(img.credit || {}), label: e.target.value.trim() };
        if (k === 'creditUrl') img.credit = { ...(img.credit || {}), url: e.target.value.trim() };
      }
      markDirty();
      updateForm();
    });
    f.addEventListener('change', (e) => {
      if (e.target.matches('[data-files]')) { addPhotos([...e.target.files]); e.target.value = ''; return; }
      if (e.target.matches('[data-replace]')) {
        const i = Number(e.target.dataset.index);
        if (e.target.files[0]) addPhotos([e.target.files[0]], i);
        e.target.value = '';
        return;
      }
      if (e.target.matches('[data-photo="illustrative"]')) {
        const i = Number(e.target.closest('.pa-photo').dataset.index);
        form.images[i].illustrative = e.target.checked;
        renderPhotos(`[data-index="${i}"] [data-photo="illustrative"]`);
      }
      if (e.target.name === 'category') {
        f.querySelector('#pf-spec-labels').innerHTML = specSuggestions(e.target.value).map((l) => html`<option value="${esc(l)}"></option>`).join('');
      }
      if (e.target.name === 'priceMode' && e.target.value === 'set') setTimeout(() => f.querySelector('#pf-price').focus());
      if (e.target.name === 'dEndMode' && e.target.value === 'at' && !f.elements.dEndTime.value) f.elements.dEndTime.value = '23:59';
      if (e.target.name === 'dStartMode' && e.target.value === 'at' && !f.elements.dStartTime.value) f.elements.dStartTime.value = '00:00';
      markDirty();
      updateForm();
    });
    // price field: tidy the digits once the field is left (45000 -> 45 000)
    f.querySelector('#pf-price').addEventListener('blur', (e) => {
      const v = parseCzk(e.target.value);
      if (!Number.isNaN(v)) e.target.value = groupDigits(v);
    });
    // drag and drop of files onto the drop zone
    const drop = f.querySelector('[data-drop]');
    drop.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('is-over'); } });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      drop.classList.remove('is-over');
      addPhotos([...e.dataTransfer.files]);
    });
    // reordering photos by dragging
    const list = f.querySelector('[data-photos]');
    let dragFrom = null;
    list.addEventListener('dragstart', (e) => {
      const li = e.target.closest('.pa-photo');
      if (!li || e.target.matches('input')) return;
      dragFrom = Number(li.dataset.index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragFrom));
      li.classList.add('is-dragging');
    });
    list.addEventListener('dragover', (e) => { if (dragFrom != null) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } });
    list.addEventListener('drop', (e) => {
      const li = e.target.closest('.pa-photo');
      if (dragFrom == null || !li) return;
      e.preventDefault();
      movePhoto(dragFrom, Number(li.dataset.index));
      dragFrom = null;
      renderPhotos();
    });
    list.addEventListener('dragend', () => { dragFrom = null; list.querySelector('.is-dragging')?.classList.remove('is-dragging'); });
  }

  /* ================= display order ================= */
  function renderOrder() {
    setTab('order', 'poradi');
    if (!ui.order) {
      const scope = 'all';
      ui.order = { scope, ids: orderFor(scope), dirty: false };
    }
    const o = ui.order;
    const items = o.ids.map(byId).filter(Boolean);
    const n = items.length;
    view.innerHTML = html`<section class="pa-order" aria-labelledby="pa-order-title">
  <h2 id="pa-order-title">Pořadí v nabídce</h2>
  <p class="pa-hint">Pořadí určuje řazení <strong>Doporučené</strong>, které zákazníci vidí jako výchozí. Přetáhněte automat myší, použijte tlačítka Výš a Níž, nebo napište číslo pozice. Automaty označené jako doporučené se na webu zobrazí vždy první.</p>
  <div class="pa-order-tools">
    <div class="tool"><label for="pa-order-scope">Pořadí pro</label>
      <select id="pa-order-scope" data-act="order-scope">
        <option value="all"${o.scope === 'all' ? ' selected' : ''}>Celou nabídku (úvodní stránka a přehled)</option>
        ${seed.categories.map((c) => html`<option value="${esc(c.slug)}"${o.scope === c.slug ? ' selected' : ''}>Kategorii: ${esc(c.name)}</option>`)}
      </select>
    </div>
  </div>
  ${n ? html`<ol class="pa-order-list" data-order-list>${items.map((p, i) => html`<li class="pa-order-item" draggable="true" data-id="${esc(p.id)}">
    <span class="pa-handle" aria-hidden="true">⋮⋮</span>
    <span class="pa-thumb">${thumb(p)}</span>
    <span class="pa-order-name"><strong>${esc(p.name)}</strong>
      <span class="pa-sub">${STATUS_LABEL[statusOf(p)]}${p.availability ? ` · ${esc(p.availability)}` : ''}${p.featured ? ' · doporučený, na webu vždy první' : ''}${!isListed(p) ? ' · zákazníci ho teď v nabídce nevidí' : ''}</span></span>
    <span class="pa-order-pos"><label for="pa-pos-${i}">Pozice</label><input id="pa-pos-${i}" type="number" min="1" max="${n}" value="${i + 1}" inputmode="numeric" data-act="order-pos"></span>
    <span class="pa-order-btns">
      <button class="btn btn-ghost btn-sm" type="button" data-act="order-up"${i === 0 ? ' disabled' : ''}>Výš<span class="visually-hidden">: ${esc(p.name)}</span></button>
      <button class="btn btn-ghost btn-sm" type="button" data-act="order-down"${i === n - 1 ? ' disabled' : ''}>Níž<span class="visually-hidden">: ${esc(p.name)}</span></button>
    </span>
  </li>`)}</ol>` : html`<p class="pa-empty">V této kategorii nejsou žádné automaty.</p>`}
  <p class="visually-hidden" aria-live="assertive" data-order-live></p>
  <div class="pa-savebar pa-savebar-static">
    <p class="pa-save-state${o.dirty ? ' is-dirty' : ''}" data-order-state>${o.dirty ? '<span class="pa-dot" aria-hidden="true"></span>Pořadí ještě není uložené.' : 'Pořadí je uložené.'}</p>
    <div class="pa-save-actions">
      <button class="btn btn-ghost" type="button" data-act="order-default">Výchozí pořadí</button>
      <button class="btn btn-secondary" type="button" data-act="order-cancel"${o.dirty ? '' : ' disabled'}>Zrušit změny</button>
      <button class="btn btn-primary" type="button" data-act="order-save"${o.dirty ? '' : ' disabled'}>Uložit pořadí</button>
    </div>
  </div>
</section>`;
  }
  // Machines in the scope (not in the trash), in the saved order; featured ones are not lifted
  // here, so the list shows the order you set.
  function orderFor(scope, saved = scope === 'all' ? state.order : state.catOrder[scope] || state.order) {
    const list = live().filter((p) => scope === 'all' || p.category === scope).map((p) => ({ ...p, featured: false }));
    return recommended(list, saved).map((p) => p.id);
  }
  function moveOrder(from, to, focusAct) {
    const ids = ui.order.ids;
    if (to < 0 || to >= ids.length || from === to) return;
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    ui.order.dirty = true;
    renderOrder();
    const li = view.querySelector(`.pa-order-item[data-id="${CSS.escape(id)}"]`);
    (li?.querySelector(`[data-act="${focusAct}"]:not([disabled])`) || li?.querySelector('[data-act="order-pos"]'))?.focus();
    view.querySelector('[data-order-live]').textContent = `${byId(id)?.name} je teď na pozici ${to + 1} z ${ids.length}.`;
  }
  async function saveOrder() {
    const o = ui.order;
    const next = o.scope === 'all' ? { ...state, order: [...o.ids] } : { ...state, catOrder: { ...state.catOrder, [o.scope]: [...o.ids] } };
    if (await commit(next)) {
      o.dirty = false;
      renderOrder();
      setFlash(`Pořadí ${o.scope === 'all' ? 'celé nabídky' : `kategorie ${catName(o.scope)}`} je uložené.`);
    }
  }

  /* ================= trash ================= */
  function renderTrash() {
    setTab('trash', 'kos');
    const items = trash().sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
    view.innerHTML = html`<section aria-labelledby="pa-trash-title">
  <h2 id="pa-trash-title">Koš</h2>
  <p class="pa-hint">Smazané automaty zákazníci nevidí. Obnovený automat se vrátí se stejným stavem zveřejnění, jaký měl. Smazání natrvalo nejde vrátit.</p>
  ${items.length ? html`<ul class="pa-trash">${items.map((p) => html`<li data-id="${esc(p.id)}">
    <span class="pa-thumb">${thumb(p)}</span>
    <span class="pa-order-name"><strong>${esc(p.name)}</strong><span class="pa-sub">Smazáno ${esc(formatPrague(p.deletedAt))} · ${STATUS_LABEL[statusOf(p)]}</span></span>
    <span class="pa-order-btns">
      <button class="btn btn-secondary btn-sm" type="button" data-act="restore">Obnovit<span class="visually-hidden">: ${esc(p.name)}</span></button>
      <button class="btn btn-ghost btn-sm is-danger" type="button" data-act="destroy">Smazat natrvalo<span class="visually-hidden">: ${esc(p.name)}</span></button>
    </span>
  </li>`)}</ul>` : '<p class="pa-empty">Koš je prázdný.</p>'}
</section>`;
  }

  /* ================= backup and import ================= */
  async function renderBackup() {
    setTab('backup', 'zaloha');
    const u = await store.usage(state);
    const mb = (b) => `${(b / 1024 / 1024).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} MB`;
    view.innerHTML = html`<section class="pa-backup" aria-labelledby="pa-backup-title">
  <h2 id="pa-backup-title">Záloha a import</h2>
  <div class="pa-panel">
    <h3>Kde jsou data uložená</h3>
    <p>Katalog i fotografie jsou uložené <strong>jen v tomto prohlížeči na tomto zařízení</strong>. Ostatní návštěvníci je nevidí a na jiném počítači nebo v jiném prohlížeči tu nebudou. Smazáním dat prohlížeče (historie, soubory cookie a data webů) se ztratí.</p>
    <p class="pa-muted">Teď uloženo: ${automatu(state.products.length)} (z toho v koši ${trash().length}), ${u.photos} ${word(u.photos, 'fotografie', 'fotografie', 'fotografií')} nahraných v prohlížeči${u.estimate?.quota ? `, využito ${mb(u.estimate.usage || 0)} z přibližně ${mb(u.estimate.quota)} dostupných` : ''}.</p>
  </div>
  <div class="pa-panel">
    <h3>Stáhnout zálohu</h3>
    <p>Uloží celý katalog včetně fotografií, pořadí a koše do jednoho souboru. Hodí se před většími změnami nebo pro přenesení do jiného prohlížeče.</p>
    <button class="btn btn-primary" type="button" data-act="export">Stáhnout zálohu katalogu</button>
  </div>
  <div class="pa-panel">
    <h3>Nahrát zálohu</h3>
    <p>Nahrajte soubor zálohy (.json). Před nahrazením uvidíte, co soubor obsahuje.</p>
    <div class="field"><label for="pa-import">Soubor zálohy</label><input id="pa-import" type="file" accept="application/json,.json" data-import></div>
    <div data-import-result aria-live="polite"></div>
  </div>
  <div class="pa-panel">
    <h3>Vrátit původní nabídku webu</h3>
    <p>Smaže všechny změny uložené v tomto prohlížeči a zobrazí katalog tak, jak je na webu. Doporučujeme předtím stáhnout zálohu.</p>
    <button class="btn btn-secondary is-danger" type="button" data-act="reset">Vrátit původní nabídku</button>
  </div>
  <div class="pa-panel pa-panel-info">
    <h3>Co je potřeba pro ostrou správu webu</h3>
    <p>Tento prototyp ukazuje, jak bude správa fungovat. Aby se změny projevily všem zákazníkům, je potřeba:</p>
    <ul>
      <li><strong>Databáze na serveru</strong> místo úložiště prohlížeče, s rozhraním (API) pro čtení a ukládání. Datová vrstva prototypu (soubor store.js) je na to připravená: stačí nahradit její metody voláním serveru.</li>
      <li><strong>Úložiště fotografií</strong> na serveru nebo v cloudu, s automatickým zmenšením a výřezy pro rychlé načítání.</li>
      <li><strong>Přihlášení správců</strong> se skutečným ověřením a oprávněními. Přepínač v tomto náhledu žádnou ochranu nepředstavuje.</li>
      <li><strong>Čas serveru pro slevy</strong>: začátek a konec slevy musí hlídat server (nebo nové sestavení webu v daný okamžik), ne hodiny v počítači návštěvníka.</li>
      <li><strong>Ochrana před přepsáním</strong>, když upravují dva lidé současně, a historie změn se zálohami.</li>
      <li><strong>Kontrola údajů na serveru</strong> (ceny, slevy, povinná pole), stejná jako ve formuláři.</li>
    </ul>
  </div>
</section>`;
  }

  async function exportBackup(btn) {
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = 'Připravuji zálohu…';
    try {
      const data = await store.exportBackup(state);
      const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `katalog-automatu-${today()}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      setFlash(`Záloha je stažená: ${automatu(data.products.length)}, ${Object.keys(data.media).length} ${word(Object.keys(data.media).length, 'fotografie', 'fotografie', 'fotografií')}.`);
    } catch (e) {
      setFlash('Zálohu se nepodařilo vytvořit. Zkuste to znovu.', { error: true });
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  async function readImport(file) {
    const out = view.querySelector('[data-import-result]');
    if (!file) { out.innerHTML = ''; return; }
    let textContent = '';
    try { textContent = await file.text(); } catch (e) { out.innerHTML = '<p class="pa-error-box">Soubor se nepodařilo přečíst.</p>'; return; }
    const r = store.readBackup(textContent);
    if (!r.ok) {
      out.innerHTML = html`<div class="pa-error-box"><p><strong>Tento soubor nejde nahrát.</strong> Současný katalog zůstává beze změny.</p><ul>${r.errors.slice(0, 8).map((e) => html`<li>${esc(e)}</li>`)}</ul>${r.errors.length > 8 ? html`<p>…a dalších ${r.errors.length - 8} chyb.</p>` : ''}</div>`;
      return;
    }
    const s = r.summary;
    out.innerHTML = html`<div class="pa-import-preview">
  <p><strong>Soubor je v pořádku.</strong>${s.exportedAt ? ` Záloha z ${esc(formatPrague(s.exportedAt))}.` : ''}</p>
  <ul>
    <li>${automatu(s.total)} celkem: ${s.published} zveřejněných (${s.listed} v nabídce), ${s.draft} ${word(s.draft, 'koncept', 'koncepty', 'konceptů')}, ${s.hidden} skrytých, ${s.trash} v koši</li>
    <li>${s.photos} ${word(s.photos, 'fotografie', 'fotografie', 'fotografií')} uložených v souboru</li>
  </ul>
  ${r.warnings.map((w) => html`<p class="pa-muted">${esc(w)}</p>`)}
  <p>Nahrazením se <strong>přepíše celý současný katalog v tomto prohlížeči</strong> (${automatu(state.products.length)}).</p>
  <div class="pa-actions-row">
    <button class="btn btn-primary" type="button" data-act="import-apply">Nahradit katalog zálohou</button>
    <button class="btn btn-secondary" type="button" data-act="import-cancel">Zrušit</button>
  </div>
</div>`;
    pendingImport = r.data;
    out.querySelector('[data-act="import-apply"]').focus();
  }
  let pendingImport = null;

  async function applyImport() {
    if (!pendingImport) return;
    const ok = await confirmDialog('Nahradit katalog?', 'Současný katalog v tomto prohlížeči se přepíše obsahem zálohy. Tento krok nejde vrátit, pokud nemáte jeho zálohu.', 'Nahradit katalog', { danger: true });
    if (!ok) return;
    try {
      state = await store.importBackup(pendingImport);
      photos = await store.photoUrls(photoRefs(state.products));
      pendingImport = null;
      ui.order = null;
      await renderBackup();
      setFlash(`Katalog je nahrazený zálohou: ${automatu(state.products.length)}.`, { focus: true });
    } catch (e) {
      setFlash(esc(e.userMessage || 'Zálohu se nepodařilo nahrát. Současný katalog zůstává beze změny.'), { error: true, focus: true });
    }
  }

  async function resetAll() {
    const ok = await confirmDialog('Vrátit původní nabídku?', 'Všechny změny uložené v tomto prohlížeči se smažou, včetně nahraných fotografií a koše. Tento krok nejde vrátit.', 'Smazat změny a vrátit původní', { danger: true });
    if (!ok) return;
    try {
      state = await store.reset();
      photos = new Map();
      ui.order = null;
      await renderBackup();
      setFlash('Katalog je vrácený do původní podoby webu.', { focus: true });
    } catch (e) {
      setFlash(esc(e.userMessage || 'Změny se nepodařilo smazat.'), { error: true, focus: true });
    }
  }

  /* ================= events ================= */
  async function go(tab) {
    if (!(await closeForm())) return;
    if (tab !== 'order') ui.order = null;
    setFlash('');
    if (tab === 'list') renderList();
    else if (tab === 'order') renderOrder();
    else if (tab === 'trash') renderTrash();
    else if (tab === 'backup') await renderBackup();
    root.querySelector(`[data-tab="${tab}"]`)?.focus();
  }

  root.addEventListener('click', async (e) => {
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      if (ui.tab === 'order' && ui.order?.dirty && tabBtn.dataset.tab !== 'order' && !(await confirmDialog('Zahodit změny pořadí?', 'Nové pořadí ještě není uložené.', 'Zahodit změny', { danger: true, no: 'Zůstat' }))) return;
      go(tabBtn.dataset.tab);
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.tagName === 'SELECT' || btn.tagName === 'INPUT') return;
    const act = btn.dataset.act;
    const rowEl = btn.closest('[data-id]');
    const p = rowEl ? byId(btn.dataset.id || rowEl.dataset.id) : null;
    btn.closest('details.pa-menu')?.removeAttribute('open');
    switch (act) {
      case 'new':
        if (await closeForm()) { setFlash(''); openForm(null); }
        break;
      case 'edit': if (p) { setFlash(''); openForm(p.id); } break;
      case 'price': if (p) quickPrice(p); break;
      case 'duplicate': if (p) duplicate(p); break;
      case 'toggle': if (p) togglePublish(p); break;
      case 'delete': if (p) moveToTrash(p); break;
      case 'restore': restore(btn.dataset.id || rowEl?.dataset.id); break;
      case 'destroy': if (p) deleteForever(p.id); break;
      case 'reset-filters':
        ui.filters = { q: '', category: '', status: '', availability: '', discount: '' };
        renderList();
        view.querySelector('#pa-q').focus();
        break;
      case 'close-form':
        if (await closeForm()) { renderList(); root.querySelector('[data-tab="list"]').focus(); }
        break;
      case 'save': submit('save'); break;
      case 'publish': submit('publish'); break;
      case 'preview': preview(); break;
      case 'add-spec': {
        const ul = form.el.querySelector('[data-specs]');
        const i = Date.now();
        ul.insertAdjacentHTML('beforeend', specRow({ label: '', value: null, key: false }, i));
        ul.lastElementChild.querySelector('input').focus();
        markDirty();
        break;
      }
      case 'remove-spec': {
        const li = btn.closest('.pa-spec');
        const next = li.nextElementSibling || li.previousElementSibling;
        li.remove();
        (next?.querySelector('input') || form.el.querySelector('[data-act="add-spec"]')).focus();
        markDirty();
        break;
      }
      case 'photo-cover': case 'photo-up': case 'photo-down': {
        const i = Number(btn.closest('.pa-photo').dataset.index);
        const to = act === 'photo-cover' ? 0 : act === 'photo-up' ? i - 1 : i + 1;
        movePhoto(i, to);
        renderPhotos(`[data-index="${to}"] [data-act="${act === 'photo-cover' ? 'photo-down' : act}"]:not([disabled])`);
        if (!form.el.contains(document.activeElement) || document.activeElement === document.body) form.el.querySelector(`[data-index="${to}"] input`)?.focus();
        break;
      }
      case 'photo-remove': {
        const i = Number(btn.closest('.pa-photo').dataset.index);
        form.images.splice(i, 1);
        markDirty();
        renderPhotos();
        (form.el.querySelector(`[data-index="${Math.min(i, form.images.length - 1)}"] input`) || form.el.querySelector('label[for="pf-files"]'))?.focus();
        break;
      }
      case 'photo-replace': {
        const input = form.el.querySelector('[data-replace]');
        input.dataset.index = btn.closest('.pa-photo').dataset.index;
        input.click();
        break;
      }
      case 'order-up': case 'order-down': {
        const i = ui.order.ids.indexOf(rowEl.dataset.id);
        moveOrder(i, act === 'order-up' ? i - 1 : i + 1, act);
        break;
      }
      case 'order-save': saveOrder(); break;
      case 'order-cancel': ui.order = null; renderOrder(); break;
      case 'order-default':
        ui.order.ids = recommended(live().filter((x) => ui.order.scope === 'all' || x.category === ui.order.scope).map((x) => ({ ...x, featured: false }))).map((x) => x.id);
        ui.order.dirty = true;
        renderOrder();
        view.querySelector('[data-order-live]').textContent = 'Pořadí je vrácené na výchozí: nejdřív automaty s fotografií, od nejnovějších. Uložte ho tlačítkem Uložit pořadí.';
        break;
      case 'export': exportBackup(btn); break;
      case 'import-apply': applyImport(); break;
      case 'import-cancel':
        pendingImport = null;
        view.querySelector('[data-import]').value = '';
        view.querySelector('[data-import-result]').innerHTML = '';
        break;
      case 'reset': resetAll(); break;
      default: break;
    }
  });

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.closest('[data-filters]')) {
      if (t.name === 'q') return; // handled while typing
      ui.filters[t.name] = t.value;
      const id = t.id;
      renderList();
      view.querySelector(`#${id}`)?.focus();
      return;
    }
    if (t.dataset.act === 'availability') { const p = byId(t.closest('[data-id]').dataset.id); if (p) quickAvailability(p, t.value, t); return; }
    if (t.dataset.act === 'order-scope') {
      const go2 = () => { ui.order = { scope: t.value, ids: orderFor(t.value), dirty: false }; renderOrder(); view.querySelector('#pa-order-scope').focus(); };
      if (ui.order?.dirty) confirmDialog('Zahodit změny pořadí?', 'Nové pořadí ještě není uložené.', 'Zahodit změny', { danger: true, no: 'Zůstat' }).then((ok) => (ok ? go2() : (t.value = ui.order.scope)));
      else go2();
      return;
    }
    if (t.dataset.act === 'order-pos') {
      const i = ui.order.ids.indexOf(t.closest('[data-id]').dataset.id);
      const to = Math.max(1, Math.min(ui.order.ids.length, Math.round(Number(t.value)) || i + 1)) - 1;
      if (to === i) { t.value = i + 1; return; }
      moveOrder(i, to, 'order-pos');
      return;
    }
    if (t.matches('[data-import]')) readImport(t.files[0]);
  });
  root.addEventListener('input', (e) => {
    if (e.target.name === 'q' && e.target.closest('[data-filters]')) {
      clearTimeout(root._qt);
      root._qt = setTimeout(() => {
        ui.filters.q = e.target.value;
        const pos = e.target.selectionStart;
        renderList();
        const q = view.querySelector('#pa-q');
        q.focus();
        q.setSelectionRange(pos, pos);
      }, 200);
    }
  });
  root.addEventListener('submit', (e) => e.preventDefault());
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const open = root.querySelector('details.pa-menu[open]');
      if (open) { open.removeAttribute('open'); open.querySelector('summary').focus(); }
    }
  });
  document.addEventListener('click', (e) => {
    for (const m of root.querySelectorAll('details.pa-menu[open]')) if (!m.contains(e.target)) m.removeAttribute('open');
  });

  // reordering by dragging in the order view
  let dragId = null;
  root.addEventListener('dragstart', (e) => {
    const li = e.target.closest('.pa-order-item');
    if (!li) return;
    dragId = li.dataset.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
    li.classList.add('is-dragging');
  });
  root.addEventListener('dragover', (e) => { if (dragId && e.target.closest('.pa-order-item')) e.preventDefault(); });
  root.addEventListener('drop', (e) => {
    const li = e.target.closest('.pa-order-item');
    if (!dragId || !li) return;
    e.preventDefault();
    const ids = ui.order.ids;
    moveOrder(ids.indexOf(dragId), ids.indexOf(li.dataset.id), 'order-pos');
    dragId = null;
  });
  root.addEventListener('dragend', () => { dragId = null; });

  // unsaved changes: warn before leaving the page
  window.addEventListener('beforeunload', (e) => {
    if (form?.dirty || ui.order?.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
  // another tab saved: show its catalogue (unless a form is open here)
  window.addEventListener('storage', async (e) => {
    if (e.key !== env.KEY || form || ui.order?.dirty) return;
    state = store.load().state;
    photos = await store.photoUrls(photoRefs(state.products));
    if (ui.tab === 'list') renderList(); else if (ui.tab === 'trash') renderTrash();
    setFlash('Katalog byl mezitím změněn v jiném okně. Zobrazuje se aktuální stav.');
  });
  // discount states change on their own: keep the overview current
  env.watchPrices(() => state, photos, () => { if (!form && ui.tab === 'list') renderList(); else if (form) updateForm(); });

  /* ---------- first view, from the address ---------- */
  const h = decodeURIComponent(location.hash.slice(1));
  if (h === 'novy') openForm(null);
  else if (h.startsWith('upravit/') && byId(h.slice(8)) && !byId(h.slice(8)).deletedAt) openForm(h.slice(8));
  else if (h === 'poradi') renderOrder();
  else if (h === 'kos') renderTrash();
  else if (h === 'zaloha') await renderBackup();
  else renderList();
}

export { effectivePrice };
