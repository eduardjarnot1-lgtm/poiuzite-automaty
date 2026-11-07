// Local admin prototype ("Pohled zákazníka" / "Správa nabídky"). Loaded only in builds made with
// --prototype. One catalogue for both views: the built data (seed.js) until something is saved,
// then the copy saved in this browser (see store.js). Customer pages are rendered again from that
// copy with the same templates the build uses (lib/*.js), so they look exactly like the built site,
// and the page scripts (site.js, catalogue.js, ...) are loaded only after that.
// While a page is open, prices switch by themselves when a discount starts or ends.
// This is not authentication and publishes nothing: other visitors keep seeing the built data.
import seed from './seed.js';
import { html, esc, linker, typeset } from './lib/util.js';
import { header, productCard, priceSlot, conditionBadge } from './lib/components.js';
import * as pages from './lib/pages.js';
import { isVisible, nextBoundary, statusOf } from './lib/catalog.js';
import { createLocalStore, isStoredPhoto, KEY } from './store.js';

const LAST_PAGE = 'pouzite-automaty:prototyp:posledni-stranka';
const PREVIEW_KEY = 'pouzite-automaty:prototyp:nahled';
const PREVIEW_PATH = 'automaty/nahled/';

const route = JSON.parse(document.getElementById('proto-route').textContent);
const url = linker(route.path, route.absolute, route.explicitIndex);
const seedById = new Map(seed.products.map((p) => [p.id, p]));

// Machines whose page was built keep their URL; added ones (or ones moved to another category or
// given another address) open on the preview page.
function withPath(p) {
  const s = seedById.get(p.id);
  const built = s && s.category === p.category && s.slug === p.slug;
  return built ? p : { ...p, previewPath: `${PREVIEW_PATH}?id=${encodeURIComponent(p.id)}` };
}

// Swaps stored-photo references for object URLs the browser can show.
function withPhotos(p, photos) {
  if (!p.images?.some((i) => isStoredPhoto(i.src))) return p;
  return {
    ...p,
    images: p.images.map((img) => (isStoredPhoto(img.src)
      ? { ...img, src: photos.get(img.src) || 'assets/img/placeholder-automat.svg', thumb: undefined, srcset: undefined }
      : img)),
  };
}

const context = (state, photos, extra = {}) => ({
  site: seed.site,
  categories: seed.categories,
  products: state.products.filter((p) => !p.deletedAt).map((p) => withPath(withPhotos(p, photos))),
  order: state.order,
  catOrder: state.catOrder,
  page: route,
  url,
  absUrl: null,
  now: Date.now(),
  proto: true,   // forms show that the preview does not send them
  ...extra,
});

function updateNav(c) {
  const t = document.createElement('template');
  t.innerHTML = header(c);
  const fresh = t.content.getElementById('nav-sub');
  const current = document.getElementById('nav-sub');
  if (fresh && current) current.innerHTML = fresh.innerHTML;
}

// The page scripts, in order, after the page has its final content.
function loadScripts(list) {
  for (const src of list) {
    if ([...document.scripts].some((el) => el.getAttribute('src') === src)) continue;
    const el = document.createElement('script');
    el.src = src;
    el.async = false; // keeps the order
    document.body.append(el);
  }
}

const notAvailable = (c, p) => html`
<div class="page-head">
  <div class="wrap">
    <h1>Tento automat teď není v nabídce</h1>
    <p class="lead">Automat ${p ? html`„${esc(p.name)}“ ` : ''}jsme z nabídky stáhli. Podívejte se na <a href="${c.url('automaty/')}">ostatní automaty</a> nebo nám napište, co hledáte.</p>
    <p><a class="btn btn-primary" href="${c.url('kontakt/')}#formular">Poptat automat</a></p>
  </div>
</div>`;

const STATUS_NOTE = { draft: 'koncept', hidden: 'skrytý automat' };
const previewBanner = (p, unsaved) => {
  const what = p.deletedAt ? 'automat v koši' : STATUS_NOTE[statusOf(p)];
  return html`<div class="proto-preview-bar" role="note"><div class="wrap"><strong>Náhled${what ? ` – ${what}` : ''}.</strong> ${unsaved ? 'Zobrazuje změny z formuláře, včetně neuložených. ' : ''}${what ? 'Zákazníci tuto stránku nevidí.' : 'Takto stránku uvidí zákazníci po uložení.'}</div></div>`;
};

function renderCustomer(state, photos) {
  const c = context(state, photos);
  updateNav(c);
  let result = null;
  let banner = '';
  if (route.kind === 'home') result = pages.home(c);
  else if (route.kind === 'guide') result = pages.guide(c);
  else if (route.kind === 'index') result = pages.categoriesIndex(c);
  else if (route.kind === 'category') {
    const cat = c.categories.find((x) => x.slug === route.category);
    if (cat) result = pages.category(c, cat);
  } else if (route.kind === 'product' || route.kind === 'preview') {
    const q = new URLSearchParams(location.search);
    const id = route.kind === 'product' ? route.id : q.get('id');
    let p = state.products.find((x) => x.id === id);
    let unsaved = false;
    // the admin's "Náhled" button passes the form as it is, saved or not
    if (route.kind === 'preview' && q.get('koncept') === '1') {
      try {
        const draft = JSON.parse(localStorage.getItem(PREVIEW_KEY) || 'null');
        if (draft && draft.id === id) { p = draft; unsaved = true; }
      } catch (e) { /* no preview stored */ }
    }
    if (route.kind === 'product' && (!p || !isVisible(p))) {
      // hidden, draft, in the trash or deleted for good in this browser
      result = { title: 'Automat není v nabídce', body: notAvailable(c, p || seedById.get(id)) };
    } else if (p) {
      const shown = withPath(withPhotos(p, photos));
      const products = c.products.some((x) => x.id === p.id) ? c.products.map((x) => (x.id === p.id ? shown : x)) : [...c.products, shown];
      result = pages.product({ ...c, products }, shown);
      if (route.kind === 'preview' && (unsaved || !isVisible(p))) banner = previewBanner(p, unsaved);
    }
  }
  if (!result) return [];
  document.title = `${result.title} | ${c.site.name}`;
  document.getElementById('obsah').innerHTML = typeset(`\n${banner}${result.body}\n`);
  return (result.scripts || []).map((s) => url(s));
}

/* ---------- prices that change while the page is open ---------- */
// At the moment a discount starts or ends, the cards and the price box on the page are rendered
// again from the same templates and the catalogue filters/sorting re-applied. Also checked when
// the tab becomes visible again (timers sleep in background tabs).
export function watchPrices(getState, photos, onChange) {
  let timer;
  let last = Date.now();
  const due = () => nextBoundary(getState().products.filter((p) => !p.deletedAt), last);
  const fire = () => { last = Date.now(); onChange(); schedule(); };
  const schedule = () => {
    clearTimeout(timer);
    const next = due();
    if (next == null) return;
    // setTimeout can't wait longer than ~24.8 days; it checks again by then
    timer = setTimeout(() => (Date.now() >= next ? fire() : schedule()), Math.min(next - Date.now() + 50, 2 ** 31 - 1));
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    const next = due();
    if (next != null && next <= Date.now()) fire();
    else schedule();
  });
  schedule();
  return { reschedule: () => { last = Date.now(); schedule(); } };
}

function refreshPrices(state, photos) {
  const c = context(state, photos);
  const byId = new Map(c.products.map((p) => [p.id, p]));
  for (const card of document.querySelectorAll('.card[data-id]')) {
    const p = byId.get(card.dataset.id);
    if (!p) continue;
    const t = document.createElement('template');
    t.innerHTML = productCard(c, p, { headingLevel: Number(card.dataset.heading) || 3, order: Number(card.dataset.order) || 0 });
    const fresh = t.content.firstElementChild;
    fresh.hidden = card.hidden;
    card.replaceWith(fresh);
  }
  const slot = document.querySelector('.price-box [data-price-slot]');
  const p = slot && byId.get(slot.dataset.priceSlot);
  if (p) {
    slot.outerHTML = priceSlot(c, p, 'detail');
    const badges = document.querySelector('.product-summary .card-badges');
    if (badges && p.availability !== 'Prodáno') badges.innerHTML = conditionBadge(c, p);
  }
  document.dispatchEvent(new CustomEvent('catalogue:refresh'));
}

/* ---------- start ---------- */
const store = createLocalStore(seed);
const loaded = store.load();

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

let scripts = route.scripts || [];
try {
  if (route.kind === 'admin') {
    const root = document.querySelector('[data-proto-admin]');
    const { startAdmin } = await import('./admin.js');
    if (root) await startAdmin(root, { store, seed, loaded, url, context, withPath, withPhotos, watchPrices, PREVIEW_KEY, PREVIEW_PATH, KEY });
  } else if (loaded.source === 'local' || route.kind === 'preview') {
    const refs = new Set(loaded.state.products.flatMap((p) => (p.images || []).map((i) => i.src)));
    try {
      const draft = JSON.parse(localStorage.getItem(PREVIEW_KEY) || 'null');
      for (const img of draft?.images || []) refs.add(img.src);
    } catch (e) { /* none */ }
    const photos = await store.photoUrls(refs);
    scripts = [...scripts, ...renderCustomer(loaded.state, photos)];
    watchPrices(() => loaded.state, photos, () => refreshPrices(loaded.state, photos));
  }
} catch (e) {
  console.error('[prototyp]', e);
} finally {
  document.documentElement.classList.remove('proto-pending');
  loadScripts(scripts);
}
