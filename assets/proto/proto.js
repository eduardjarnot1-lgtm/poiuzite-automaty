// Local admin prototype ("Pohled zákazníka" / "Správa nabídky"). Loaded only in builds made with
// --prototype. One catalogue for both views: the built data (seed.js) until something is saved,
// then the copy saved in this browser's localStorage. Customer pages are rendered again from that
// copy with the same templates the build uses (lib/*.js), so they look exactly like the built site.
// This is not authentication and publishes nothing: other visitors keep seeing the built data.
import seed from './seed.js';
import { esc, html, linker } from './lib/util.js';
import { header, productPath, priceText, mediaUrl, ARROW } from './lib/components.js';
import * as pages from './lib/pages.js';

const KEY = 'pouzite-automaty:prototyp:v1';
const LAST_PAGE = 'pouzite-automaty:prototyp:posledni-stranka';
const PREVIEW_PATH = 'automaty/nahled/';
const AVAILABILITY = ['Skladem', 'Na objednávku', 'Rezervováno', 'Prodáno'];
const MAX_PRICE = 50000000;
const PHOTO_MAX_SIDE = 1200;

const route = JSON.parse(document.getElementById('proto-route').textContent);
const url = linker(route.path, route.absolute, route.explicitIndex);
const clone = (v) => JSON.parse(JSON.stringify(v));
const seedById = new Map(seed.products.map((p) => [p.id, p]));
const catName = (slug) => seed.categories.find((c) => c.slug === slug)?.name || slug;

/* ---------- storage ---------- */
function readStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { products: null };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.products)) throw new Error('Neplatná data');
    return { products: data.products };
  } catch (e) {
    return { products: null, error: e };
  }
}

function writeStore(products) {
  localStorage.setItem(KEY, JSON.stringify({ version: 1, savedAt: new Date().toISOString(), products }));
}

const saveErrorText = (e) =>
  e && (e.name === 'QuotaExceededError' || e.code === 22)
    ? 'Změny se nepodařilo uložit: v úložišti prohlížeče už není místo. Zkuste menší fotografii. Nic nebylo uloženo.'
    : 'Změny se nepodařilo uložit, protože prohlížeč ukládání nepovoluje (například v anonymním okně). Nic nebylo uloženo.';

/* ---------- rendering with the site's own templates ---------- */
// Machines whose page was built keep their URL; added ones (or ones moved to another category)
// open on the preview page.
function withPaths(products) {
  return products.map((p) => {
    const s = seedById.get(p.id);
    const built = s && s.category === p.category && s.slug === p.slug;
    return built ? p : { ...p, previewPath: `${PREVIEW_PATH}?id=${encodeURIComponent(p.id)}` };
  });
}

const context = (products) => ({ site: seed.site, categories: seed.categories, products: withPaths(products), page: route, url, absUrl: null });

function updateNav(c) {
  const t = document.createElement('template');
  t.innerHTML = header(c);
  const fresh = t.content.getElementById('nav-sub');
  const current = document.getElementById('nav-sub');
  if (fresh && current) current.innerHTML = fresh.innerHTML;
}

function loadScripts(list = []) {
  for (const s of list) {
    const src = url(s);
    if ([...document.scripts].some((el) => el.getAttribute('src') === src)) continue;
    const el = document.createElement('script');
    el.src = src;
    document.body.append(el);
  }
}

function renderCustomer(products) {
  const c = context(products);
  updateNav(c);
  let result = null;
  if (route.kind === 'home') result = pages.home(c);
  else if (route.kind === 'index') result = pages.categoriesIndex(c);
  else if (route.kind === 'category') {
    const cat = c.categories.find((x) => x.slug === route.category);
    if (cat) result = pages.category(c, cat);
  } else if (route.kind === 'product' || route.kind === 'preview') {
    const id = route.kind === 'product' ? route.id : new URLSearchParams(location.search).get('id');
    const p = c.products.find((x) => x.id === id);
    if (p) {
      result = pages.product(c, p);
      document.title = `${result.title} | ${c.site.name}`;
    }
  }
  if (!result) return;
  document.getElementById('obsah').innerHTML = `\n${result.body}\n`;
  loadScripts(result.scripts);
}

/* ---------- small helpers for the admin ---------- */
const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'automat';

function uniqueSlug(products, base) {
  const taken = new Set(products.map((p) => p.slug).concat(products.map((p) => p.id)));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

// "45 000", "45000", "45 000 Kč" -> 45000; anything else -> NaN.
function parsePrice(text) {
  const t = text.replace(/[\s ]/g, '').replace(/(kč|czk|,-)$/i, '');
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

const formatPriceInput = (n) => (n == null ? '' : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));

// Resizes a chosen photo so it fits in browser storage: longest side 1200 px, JPEG.
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return reject(new Error('type'));
    if (file.size > 25 * 1024 * 1024) return reject(new Error('size'));
    const src = URL.createObjectURL(file);
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
      URL.revokeObjectURL(src);
      resolve({ src: canvas.toDataURL('image/jpeg', 0.82), width: w, height: h });
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('decode')); };
    img.src = src;
  });
}

const PHOTO_ERRORS = {
  type: 'Vyberte fotografii ve formátu JPG, PNG nebo WebP.',
  size: 'Fotografie je příliš velká. Vyberte soubor do 25 MB.',
  decode: 'Fotografii se nepodařilo načíst. Zkuste jiný soubor.',
};

/* ---------- admin ---------- */
function admin(root, initial, readError) {
  let products = initial;
  let flash = '';
  let storageBroken = Boolean(readError);

  const thumb = (c, p) => {
    const img = p.images[0];
    return img
      ? html`<img src="${mediaUrl(c, img.src)}" alt="" width="${img.width || 800}" height="${img.height || 600}" loading="lazy" decoding="async">`
      : html`<img src="${url('assets/img/placeholder-automat.svg')}" alt="" width="600" height="450" loading="lazy" decoding="async">`;
  };

  function showList(focus) {
    const c = context(products);
    updateNav(c);
    const n = products.length;
    root.innerHTML = html`
<div class="proto-toolbar">
  <p class="proto-count">${n} ${n === 1 ? 'automat' : n >= 2 && n <= 4 ? 'automaty' : 'automatů'} v nabídce</p>
  <button class="btn btn-primary btn-lg" type="button" data-add>Přidat automat</button>
</div>
${storageBroken && html`<div class="proto-alert" role="alert">Uložené změny se nepodařilo načíst nebo prohlížeč ukládání nepovoluje. Zobrazuje se původní nabídka.</div>`}
<div class="proto-flash" role="status" aria-live="polite" tabindex="-1">${flash}</div>
<ul class="proto-list" aria-label="Automaty v nabídce">
  ${c.products.map((p) => html`<li class="proto-row" data-id="${esc(p.id)}">
    <div class="proto-thumb">${thumb(c, p)}</div>
    <div class="proto-main">
      <h2 class="proto-name">${esc(p.name)}</h2>
      <p class="proto-cat">${esc(catName(p.category))}</p>
    </div>
    <dl class="proto-meta">
      <div><dt>Cena</dt><dd${p.price == null ? ' class="is-on-request"' : ''}>${esc(priceText(c, p))}</dd></div>
      <div><dt>Dostupnost</dt><dd>${esc(p.availability || 'Neuvedeno')}</dd></div>
    </dl>
    <div class="proto-actions">
      <button class="btn btn-secondary" type="button" data-edit="${esc(p.id)}">Upravit<span class="visually-hidden">: ${esc(p.name)}</span></button>
      <a class="text-link" href="${c.url(productPath(p))}">Zobrazit<span class="visually-hidden"> automat ${esc(p.name)} v pohledu zákazníka</span>${ARROW}</a>
    </div>
  </li>`)}
</ul>`;
    root.querySelector('[data-add]').addEventListener('click', () => showForm(null));
    root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => showForm(b.dataset.edit)));
    if (focus === 'flash') root.querySelector('.proto-flash').focus();
    else if (focus) (root.querySelector(`[data-edit="${CSS.escape(focus)}"]`) || root.querySelector('[data-add]')).focus();
  }

  function showForm(id) {
    const original = id ? products.find((p) => p.id === id) : null;
    const p = original || { name: '', category: '', summary: '', description: [], price: null, availability: null, images: [] };
    const c = context(products);
    let photo = null;        // a newly chosen, resized photo
    let photoError = '';
    const title = original ? 'Upravit automat' : 'Přidat automat';
    const opt = (v, t, sel) => html`<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(t)}</option>`;
    const knownAvail = !p.availability || AVAILABILITY.includes(p.availability);

    root.innerHTML = html`
<form class="form proto-form" novalidate aria-labelledby="pf-title">
  <div class="proto-form-head">
    <h2 id="pf-title" tabindex="-1">${title}${original && html`<span class="proto-form-sub">${esc(original.name)}</span>`}</h2>
    <p class="form-note">Pole označená * jsou povinná.</p>
  </div>
  <div class="proto-summary" role="alert" tabindex="-1" hidden></div>
  <div class="form-grid">
    <div class="field field-wide">
      <label for="pf-name">Název automatu <span class="req" aria-hidden="true">*</span></label>
      <input id="pf-name" name="name" type="text" required maxlength="120" autocomplete="off" value="${esc(p.name)}">
    </div>
    <div class="field">
      <label for="pf-category">Kategorie <span class="req" aria-hidden="true">*</span></label>
      <select id="pf-category" name="category" required>
        ${opt('', 'Vyberte kategorii', !p.category)}
        ${seed.categories.map((cat) => opt(cat.slug, cat.name, cat.slug === p.category))}
      </select>
    </div>
    <div class="field">
      <label for="pf-availability">Dostupnost</label>
      <select id="pf-availability" name="availability">
        ${opt('', 'Neuvedeno', !p.availability)}
        ${!knownAvail && opt(p.availability, p.availability, true)}
        ${AVAILABILITY.map((a) => opt(a, a, a === p.availability))}
      </select>
    </div>
    <div class="field field-wide">
      <label for="pf-summary">Krátký popis <span class="req" aria-hidden="true">*</span></label>
      <p class="proto-hint" id="pf-summary-hint">Jedna až dvě věty. Zobrazí se na kartě automatu v nabídce.</p>
      <textarea id="pf-summary" name="summary" rows="3" required maxlength="400" aria-describedby="pf-summary-hint">${esc(p.summary)}</textarea>
    </div>
    <div class="field field-wide">
      <label for="pf-description">Podrobný popis</label>
      <p class="proto-hint" id="pf-description-hint">Zobrazí se na stránce automatu. Odstavce oddělte prázdným řádkem.</p>
      <textarea id="pf-description" name="description" rows="6" maxlength="4000" aria-describedby="pf-description-hint">${esc(p.description.join('\n\n'))}</textarea>
    </div>
    <fieldset class="field field-wide proto-price">
      <legend>Cena <span class="req" aria-hidden="true">*</span></legend>
      <div class="proto-choice">
        <label><input type="radio" name="priceMode" value="request"${p.price == null ? ' checked' : ''}> Cena na dotaz</label>
        <label><input type="radio" name="priceMode" value="fixed"${p.price != null ? ' checked' : ''}> Uvést cenu</label>
      </div>
      <div class="proto-price-input">
        <label for="pf-price">Cena v Kč bez DPH</label>
        <p class="proto-hint" id="pf-price-hint">Celé číslo, například 45 000.</p>
        <input id="pf-price" name="price" type="text" inputmode="numeric" autocomplete="off" maxlength="16" aria-describedby="pf-price-hint" value="${esc(formatPriceInput(p.price))}">
      </div>
    </fieldset>
    <fieldset class="field field-wide proto-photo">
      <legend>Fotografie</legend>
      <div class="proto-photo-row">
        <div class="proto-thumb proto-photo-preview">${thumb(c, p)}</div>
        <div class="proto-photo-pick">
          <label for="pf-photo">${p.images[0] ? 'Nahradit fotografii' : 'Vybrat fotografii'}</label>
          <p class="proto-hint" id="pf-photo-hint">JPG, PNG nebo WebP. Fotografii zmenšíme a uložíme jen v tomto prohlížeči.</p>
          <input id="pf-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="pf-photo-hint">
          <p class="proto-photo-state" aria-live="polite">${p.images[0] ? (p.images[0].illustrative ? 'Nyní: ilustrační fotografie podobného modelu.' : 'Nyní: vlastní fotografie.') : 'Nyní: bez fotografie, zobrazí se zástupný obrázek.'}</p>
        </div>
      </div>
    </fieldset>
  </div>
  <div class="form-actions proto-form-actions">
    <button class="btn btn-primary btn-lg" type="submit">Uložit</button>
    <button class="btn btn-secondary btn-lg" type="button" data-cancel>Zrušit</button>
  </div>
  <div class="form-status" role="status" aria-live="polite" tabindex="-1"></div>
</form>`;

    const form = root.querySelector('form');
    const el = (name) => form.elements[name];
    const status = form.querySelector('.form-status');
    const summaryBox = form.querySelector('.proto-summary');
    const priceInput = el('price');
    const photoInput = el('photo');
    const photoState = form.querySelector('.proto-photo-state');
    const preview = form.querySelector('.proto-photo-preview');

    const syncPrice = () => {
      const fixed = form.querySelector('input[name="priceMode"]:checked')?.value === 'fixed';
      priceInput.disabled = !fixed;
      form.querySelector('.proto-price-input').classList.toggle('is-off', !fixed);
    };
    form.querySelectorAll('input[name="priceMode"]').forEach((r) => r.addEventListener('change', () => {
      syncPrice();
      if (!priceInput.disabled) priceInput.focus();
    }));
    syncPrice();

    photoInput.addEventListener('change', async () => {
      const file = photoInput.files[0];
      photo = null; photoError = '';
      setError(photoInput, '');
      if (!file) return;
      photoState.textContent = 'Načítám fotografii…';
      try {
        photo = await resizePhoto(file);
        preview.innerHTML = html`<img src="${photo.src}" alt="Náhled vybrané fotografie" width="${photo.width}" height="${photo.height}">`;
        photoState.textContent = 'Nová fotografie je vybraná. Uloží se po kliknutí na Uložit.';
      } catch (e) {
        photoError = PHOTO_ERRORS[e.message] || PHOTO_ERRORS.decode;
        photoState.textContent = '';
        setError(photoInput, photoError);
      }
    });

    form.querySelector('[data-cancel]').addEventListener('click', () => { flash = ''; showList(id || 'add'); });

    function setError(input, msg) {
      const field = input.closest('.field');
      const errId = `${input.id}-error`;
      field.querySelector(`#${errId}`)?.remove();
      const hint = input.getAttribute('aria-describedby')?.split(' ').filter((x) => x !== errId).join(' ') || '';
      if (!msg) {
        input.removeAttribute('aria-invalid');
        hint ? input.setAttribute('aria-describedby', hint) : input.removeAttribute('aria-describedby');
        return;
      }
      const p = document.createElement('p');
      p.className = 'field-error';
      p.id = errId;
      p.textContent = msg;
      input.insertAdjacentElement('afterend', p);
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', [hint, errId].filter(Boolean).join(' '));
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      status.textContent = ''; status.className = 'form-status';
      const name = el('name').value.trim();
      const category = el('category').value;
      const summary = el('summary').value.trim();
      const description = el('description').value.split(/\n\s*\n/).map((s) => s.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean);
      const fixed = form.querySelector('input[name="priceMode"]:checked')?.value === 'fixed';
      const price = fixed ? parsePrice(priceInput.value) : null;
      const availability = el('availability').value || null;

      const errors = [];
      const check = (input, msg) => { setError(input, msg); if (msg) errors.push([input, msg]); };
      check(el('name'), name ? '' : 'Vyplňte název automatu.');
      check(el('category'), seed.categories.some((x) => x.slug === category) ? '' : 'Vyberte kategorii.');
      check(el('summary'), summary ? '' : 'Vyplňte krátký popis.');
      check(priceInput, !fixed ? ''
        : !priceInput.value.trim() ? 'Zadejte cenu, nebo zvolte Cena na dotaz.'
        : Number.isNaN(price) ? 'Cena musí být celé číslo v Kč, bez desetinných míst a písmen. Například 45 000.'
        : price < 1 ? 'Cena musí být vyšší než 0 Kč.'
        : price > MAX_PRICE ? 'Cena je příliš vysoká. Zkontrolujte ji prosím.'
        : '');
      if (photoError) { setError(photoInput, photoError); errors.push([photoInput, photoError]); }

      if (errors.length) {
        summaryBox.hidden = false;
        summaryBox.innerHTML = html`<p><strong>Automat nebyl uložen.</strong> Opravte prosím ${errors.length === 1 ? 'toto pole' : 'tato pole'}:</p>
          <ul>${errors.map(([input, msg]) => html`<li><a href="#${input.id}">${esc(msg)}</a></li>`)}</ul>`;
        summaryBox.querySelectorAll('a').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); form.querySelector(a.hash).focus(); }));
        errors[0][0].focus();
        return;
      }
      summaryBox.hidden = true;
      summaryBox.innerHTML = '';

      let saved;
      let next;
      if (original) {
        saved = {
          ...original, name, category, summary, description, price, availability,
          images: photo ? [{ src: photo.src, alt: name, illustrative: false, width: photo.width, height: photo.height }, ...original.images.slice(1)] : original.images,
        };
        next = products.map((x) => (x.id === original.id ? saved : x));
      } else {
        const slug = uniqueSlug(products, slugify(name));
        const template = seed.products.find((x) => x.specs?.length);
        saved = {
          id: slug, slug, placeholder: false, category, name, manufacturer: null, model: null, type: null,
          condition: null, conditionDetails: null, summary, description,
          specs: (template?.specs || []).map((s) => ({ ...s, value: null })),
          features: [], paymentSystems: [], warranty: null, price, availability,
          images: photo ? [{ src: photo.src, alt: name, illustrative: false, width: photo.width, height: photo.height }] : [],
          dateAdded: new Date().toISOString().slice(0, 10),
        };
        next = [saved, ...products];
      }

      try {
        writeStore(next);
      } catch (err) {
        status.className = 'form-status is-error';
        status.textContent = saveErrorText(err);
        status.focus();
        return;
      }
      products = next;
      storageBroken = false;
      const link = context(products).url(productPath(withPaths([saved])[0]));
      flash = html`<span class="proto-flash-ok">${original ? 'Změny automatu' : 'Automat'} „${esc(saved.name)}“ ${original ? 'jsou uložené' : 'je uložený'} v tomto prohlížeči.</span> <a href="${link}">Zobrazit v pohledu zákazníka</a>`;
      showList('flash');
    });

    form.querySelector('#pf-title').focus();
  }

  showList();
}

/* ---------- start ---------- */
const store = readStore();
const products = store.products || clone(seed.products);

try {
  if (route.kind === 'admin') {
    // The customer link goes back to the page the visitor came from.
    const last = sessionStorage.getItem(LAST_PAGE);
    const back = document.querySelector('[data-proto-customer]');
    if (last && back && new URL(last, location.href).origin === location.origin) back.href = last;
  } else {
    sessionStorage.setItem(LAST_PAGE, location.href);
  }
} catch (e) { /* storage blocked: the links keep their defaults */ }

try {
  if (route.kind === 'admin') {
    const root = document.querySelector('[data-proto-admin]');
    if (root) admin(root, products, store.error);
  } else if (store.products || route.kind === 'preview') {
    renderCustomer(products);
  }
} finally {
  document.documentElement.classList.remove('proto-pending');
}
