// Reusable page parts: layout, header, footer, breadcrumbs, product cards, enquiry form.
import { esc, html, ph, czk } from './util.mjs';
import { sale, effectivePrice, isListed, formatPrague, utcToPrague } from './catalog.mjs';

const INFO = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
export const CHECK = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
export { INFO };
const LEAF = '<path d="M27 4C14 4 5 10 5 20c0 3 1 5.5 2.5 7.5C9 18 15 13 22 10 16 14 11 19 9 28.5 11 29.5 13 30 15 30c9 0 14-8 12-26z" fill="currentColor"/>';
export const ARROW = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const PHONE = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>';
const MAIL = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>';

export const logo = (c) => html`<a class="logo" href="${c.url('')}" aria-label="${esc(c.site.name)}, úvodní stránka">
  <svg viewBox="0 0 32 32" aria-hidden="true">${LEAF}</svg>${esc(c.site.logoText)}</a>`;

/* ---------- contact details: links when set, marked gaps when not ---------- */
const telHref = (p) => 'tel:' + p.replace(/[^\d+]/g, '');
export const phoneLink = (c, cls = '') =>
  c.site.contact.phone
    ? html`<a class="${cls}" href="${telHref(c.site.contact.phone)}">${PHONE}${esc(c.site.contact.phone)}</a>`
    : html`<span class="${cls}">${PHONE}${ph('Telefon doplníme')}</span>`;
export const emailLink = (c, cls = '') =>
  c.site.contact.email
    ? html`<a class="${cls}" href="mailto:${esc(c.site.contact.email)}">${MAIL}${esc(c.site.contact.email)}</a>`
    : html`<span class="${cls}">${MAIL}${ph('E-mail doplníme')}</span>`;

/* ---------- header ----------
   One compact header on every page: four sections and the enquiry action. "Nabídka automatů" keeps
   the machine-type submenu (added in the homepage menu round) so every category is one step away. */
export const NAV = [
  ['automaty/', 'Nabídka automatů', ['automaty/']],
  ['repasovane-automaty/', 'Repase a servis', ['repasovane-automaty/', 'servis/', 'nahradni-dily/']],
  ['o-nas/', 'O nás', ['o-nas/']],
  ['kontakt/', 'Kontakt', ['kontakt/']],
];
// Pages reached from "Repase a servis", shown as a sub-navigation on each of them.
export const SERVICE_NAV = [
  ['repasovane-automaty/', 'Repasované automaty'],
  ['servis/', 'Servis a opravy'],
  ['nahradni-dily/', 'Náhradní díly'],
];
// Legal and consumer information, linked from every footer and next to every form.
export const LEGAL_NAV = [
  ['obchodni-podminky/', 'Obchodní podmínky'],
  ['reklamace-a-odstoupeni/', 'Reklamace a odstoupení'],
  ['ochrana-osobnich-udaju/', 'Ochrana osobních údajů'],
  ['cookies/', 'Cookies a úložiště'],
];
export const isDraft = (c) => (c.site.legal?.status || 'draft') !== 'final';
const isCurrent = (c, sections) => sections.includes(c.page.section);
const hasContact = (c) => Boolean(c.site.contact.phone || c.site.contact.email);
const published = (c, slug) => c.products.filter((p) => p.category === slug && !p.placeholder && isListed(p)).length;

export function header(c) {
  const home = c.page.path === '';
  return html`<header class="site-header">
  <div class="wrap header-inner">
    ${logo(c)}
    <nav class="site-nav" id="site-nav" aria-label="Hlavní navigace">
      <ul class="nav-list">
        ${NAV.map(([path, label, sections], i) => {
          const cur = isCurrent(c, sections) ? ' aria-current="page"' : '';
          // On the homepage the catalogue is on the page itself, so the first item jumps to it.
          const href = i === 0 && home ? '#nabidka' : c.url(path);
          if (i > 0) return html`<li><a href="${href}"${cur}>${label}</a></li>`;
          return html`<li class="has-sub">
          <a href="${href}"${cur}>${label}</a>
          <button class="sub-toggle" type="button" aria-expanded="false" aria-controls="nav-sub"><span class="visually-hidden">Druhy automatů</span></button>
          <ul class="nav-sub" id="nav-sub">
            ${c.categories.map((cat) => {
              const n = published(c, cat.slug);
              return html`<li><a href="${c.url(`automaty/${cat.slug}/`)}">${esc(cat.name)} <small>${n ? `${n} v nabídce` : 'na dotaz'}</small></a></li>`;
            })}
            <li class="nav-sub-all"><a href="${c.url('automaty/')}">Celá nabídka automatů</a></li>
          </ul>
        </li>`;
        })}
        <li class="nav-mobile-only"><a class="btn btn-primary" href="${c.url('kontakt/')}#formular">Poptat automat</a></li>
      </ul>
    </nav>
    <a class="btn btn-primary btn-sm header-cta" href="${c.url('kontakt/')}#formular">Poptat automat</a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">
      <span class="nav-toggle-bars" aria-hidden="true"></span><span class="visually-hidden">Menu</span>
    </button>
  </div>
</header>`;
}

/* ---------- footer ---------- */
export function footer(c) {
  const ct = c.site.contact;
  return html`<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="footer-brand">
      ${logo(c)}
      <p>${esc(c.site.tagline)}</p>
    </div>
    <nav aria-label="Druhy automatů">
      <h2 class="footer-title">Nabídka automatů</h2>
      <ul>${c.categories.map((cat) => html`<li><a href="${c.url(`automaty/${cat.slug}/`)}">${esc(cat.name)}</a></li>`)}</ul>
    </nav>
    <nav aria-label="Služby a firma">
      <h2 class="footer-title">Služby a firma</h2>
      <ul>
        ${SERVICE_NAV.map(([path, label]) => html`<li><a href="${c.url(path)}">${label}</a></li>`)}
        <li><a href="${c.url('o-nas/')}">O nás</a></li>
        <li><a href="${c.url('kontakt/')}">Kontakt</a></li>
      </ul>
    </nav>
    <div>
      <h2 class="footer-title">Kontakt</h2>
      <ul class="footer-contact">
        <li>${phoneLink(c)}</li>
        <li>${emailLink(c)}</li>
        <li>${ct.address ? esc(ct.address) : ph('Adresa doplníme')}</li>
        ${ct.companyId && html`<li>IČO: ${esc(ct.companyId)}</li>`}
      </ul>
    </div>
  </div>
  <div class="wrap footer-base">
    <nav aria-label="Právní informace"><ul class="footer-legal">${LEGAL_NAV.map(([path, label]) => html`<li><a href="${c.url(path)}">${label}</a></li>`)}</ul></nav>
    <p class="footer-operator">© ${new Date().getFullYear()} ${esc(c.site.name)} · Provozovatel: ${c.site.operator?.legalName ? esc(c.site.operator.legalName) : ph('doplníme')}, IČO ${ct.companyId ? esc(ct.companyId) : ph('doplníme')}, sídlo ${c.site.operator?.registeredOffice ? esc(c.site.operator.registeredOffice) : ph('doplníme')}${c.site.operator?.register ? html`, ${esc(c.site.operator.register)}` : ''}</p>
  </div>
</footer>`;
}

/* ---------- contact call to action (pages without their own enquiry form) ---------- */
export function ctaBand(c, { title = 'Hledáte konkrétní automat?', text = 'Napište nám, jaký automat a pro jaký provoz hledáte. Ozveme se s nabídkou.' } = {}) {
  const ct = c.site.contact;
  return html`<section class="section" aria-labelledby="cta-title"><div class="wrap">
  <div class="cta-band">
    <div>
      <h2 id="cta-title">${esc(title)}</h2>
      <p>${esc(text)}</p>
      ${hasContact(c) && html`<p class="cta-band-direct">${ct.phone && phoneLink(c)}${ct.email && emailLink(c)}</p>`}
    </div>
    <div class="cta-band-actions">
      <a class="btn btn-light btn-lg" href="${c.url('kontakt/')}#formular">Poptat automat</a>
      <a class="btn btn-outline btn-lg" href="${c.url('kontakt/')}">Kontakt</a>
    </div>
  </div>
</div></section>`;
}

/* ---------- breadcrumbs (visible + structured data) ---------- */
export function breadcrumbs(c, trail) {
  const items = [['', 'Úvod'], ...trail];
  const ld = c.absUrl && {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([path, name], i) => ({ '@type': 'ListItem', position: i + 1, name, item: c.absUrl(path) })),
  };
  return html`<nav class="breadcrumbs" aria-label="Drobečková navigace"><ol>
    ${items.map(([path, name], i) =>
      i === items.length - 1
        ? html`<li><span aria-current="page">${esc(name)}</span></li>`
        : html`<li><a href="${c.url(path)}">${esc(name)}</a></li>`)}
  </ol></nav>${ld && html`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`}`;
}

/* ---------- product bits ---------- */
// previewPath is set only by the local admin prototype, for machines that have no built page.
export const productPath = (p) => p.previewPath || `automaty/${p.category}/${p.slug}/`;

const money = (c, n) => czk(n, c.site.catalogue.currency, c.site.catalogue.pricesIncludeVat);
// The moment prices are worked out for. The admin prototype passes its own clock; the build uses
// the time of the build.
export const nowOf = (c) => c.now ?? Date.now();

// The standard price, as text. For what a customer pays now (discounts included) use priceSlot.
export const priceText = (c, p) => (p.price != null ? money(c, p.price) : 'Cena na dotaz');

// "Akce do 17. 11. 2026" (with the time when it isn't the end of the day)
const saleEnd = (iso, withTime) => {
  const t = utcToPrague(iso).time;
  return `Akce do ${formatPrague(iso, { time: withTime || t !== '23:59' })}`.replace(/ v (2|3|4|12|13|14|2\d):/, ' ve $1:');
};

// The price block of a card ('card') or of the detail page ('detail'). A running discount shows
// the price after the discount, the standard price crossed out and labelled, and the end date if
// it has one. Wrapped in data-price-slot so the prototype can swap it when a discount starts/ends.
export function priceSlot(c, p, variant = 'card') {
  const s = sale(p, nowOf(c));
  const cls = variant === 'card' ? 'card-price' : 'price';
  if (variant === 'detail' && p.availability === 'Prodáno') {
    return html`<div class="price-slot" data-price-slot="${esc(p.id)}"><p class="${cls} is-sold">Prodáno</p></div>`;
  }
  if (!s) {
    return html`<div class="price-slot" data-price-slot="${esc(p.id)}"><p class="${cls}${p.price == null ? ' is-on-request' : ''}">${esc(priceText(c, p))}</p></div>`;
  }
  return html`<div class="price-slot is-sale" data-price-slot="${esc(p.id)}">
    <p class="${cls} is-sale"><span class="visually-hidden">Cena po slevě: </span>${esc(money(c, s.final))}</p>
    <p class="price-was">Běžná cena <s>${esc(money(c, s.standard))}</s>${variant === 'detail' ? html`<span class="price-saved"> · ušetříte ${esc(money(c, s.saved).replace(/ (bez|vč\.) DPH$/, ''))}</span>` : ''}</p>
    ${s.end && html`<p class="price-sale-end">${esc(saleEnd(s.end, variant === 'detail'))}</p>`}
  </div>`;
}

export const saleBadge = (c, p) => {
  const s = sale(p, nowOf(c));
  return s && html`<span class="badge badge-sale">${s.percent ? `Sleva ${String(s.percent).replace('.', ',')} %` : 'Sleva'}</span>`;
};

export const makerLine = (p) => [p.manufacturer, p.model].filter(Boolean).join(' · ');

export function conditionBadge(c, p) {
  const cond = p.condition && c.site.conditions[p.condition];
  return html`${p.placeholder && '<span class="badge badge-ph">Vzorová položka</span>'}${p.featured && '<span class="badge badge-featured">Doporučujeme</span>'}${saleBadge(c, p)}${cond && html`<span class="badge badge-${esc(p.condition)}">${esc(cond.label)}</span>`}`;
}

// Photos may be local (assets/products/...), full URLs to another site, or (in the local admin
// prototype) data: URLs of photos saved in the browser.
export const mediaUrl = (c, src) => (/^(https?:\/\/|data:|blob:)/.test(src) ? src : c.url(src));

// First image, or a neutral drawing that says the photo is still to come. data-fallback lets
// site.js swap in that drawing when a remote photo fails to load.
export function productImage(c, p, { index = 0, eager = false, sizes = '(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 360px' } = {}) {
  const img = p.images[index];
  if (!img) {
    return html`<img src="${c.url('assets/img/placeholder-automat.svg')}" alt="Fotografie automatu bude doplněna" width="600" height="450" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  }
  return html`<img src="${mediaUrl(c, img.src)}"${img.srcset?.length > 0 && html` srcset="${img.srcset.map((s) => `${mediaUrl(c, s.src)} ${s.w}w`).join(', ')}" sizes="${sizes}"`} data-fallback="${c.url('assets/img/placeholder-automat.svg')}" alt="${esc(img.alt || p.name)}" width="${img.width || 800}" height="${img.height || 600}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

const specValue = (v) => (v == null || v === '' ? ph('doplní se') : esc(v));
export const filledSpecs = (p) => p.specs.filter((s) => s.value != null && s.value !== '');

// Small credit line for photos that show a similar model rather than the unit for sale.
export const photoNote = (p, img = p.images[0], cls = 'photo-note') =>
  img?.illustrative &&
  html`<p class="${cls}">Ilustrační foto podobného modelu${img.credit && html` · zdroj <a href="${esc(img.credit.url)}" rel="noopener nofollow" target="_blank">${esc(img.credit.label)}<span class="visually-hidden"> (otevře se v novém okně)</span></a>`}</p>`;

/* A published machine: same image well, name, one-line description, price (or "Cena na dotaz")
   and the detail link on every card, with the actions aligned along the bottom. The line under the
   photo always takes the same height, so cards with and without a credit line stay aligned. */
export function productCard(c, p, { headingLevel = 3, order = 0 } = {}) {
  const href = c.url(productPath(p));
  const h = `h${headingLevel}`;
  const img = p.images[0];
  const keySpecs = filledSpecs(p).filter((s) => s.key).slice(0, 3);
  const search = [p.name, p.manufacturer, p.model, p.summary].filter(Boolean).join(' ').toLowerCase();
  // data-* feed the customer filters and sorting in assets/js/catalogue.js; data-price is the
  // price that applies now, data-order the recommended position (also the tie-break).
  const price = effectivePrice(p, nowOf(c));
  return html`<li class="card" data-id="${esc(p.id)}" data-order="${order}" data-heading="${headingLevel}" data-name="${esc(p.name.toLowerCase())}" data-category="${esc(p.category)}" data-manufacturer="${esc(p.manufacturer || '')}" data-condition="${esc(p.condition || '')}" data-type="${esc(p.type || '')}" data-availability="${esc(p.availability || '')}" data-price="${price ?? ''}" data-sale="${sale(p, nowOf(c)) ? '1' : ''}" data-date="${esc(p.dateAdded || '')}" data-search="${esc(search)}">
  <a class="card-media" href="${href}" tabindex="-1" aria-hidden="true">${productImage(c, p)}</a>
  ${img?.illustrative ? photoNote(p, img, 'card-note') : html`<p class="card-note">${img ? 'Fotografie automatu' : 'Fotografie bude doplněna'}</p>`}
  <div class="card-body">
    <div class="card-badges">${conditionBadge(c, p)}</div>
    ${makerLine(p) && html`<p class="card-maker">${esc(makerLine(p))}</p>`}
    <${h} class="card-title"><a href="${href}">${esc(p.name)}</a></${h}>
    <p class="card-summary">${esc(p.summary)}</p>
    ${keySpecs.length > 0 && html`<dl class="card-specs">${keySpecs.map((s) => html`<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`)}</dl>`}
    ${p.availability && html`<p class="card-avail">${esc(p.availability)}</p>`}
    <div class="card-foot">
      ${priceSlot(c, p, 'card')}
      <a class="text-link" href="${href}">Detail automatu${ARROW}<span class="visually-hidden">: ${esc(p.name)}</span></a>
    </div>
  </div>
</li>`;
}

export { specValue };

/* ---------- enquiry form ----------
   Netlify detects the form from the built HTML (data-netlify). When site.forms.endpoint is set
   (Formspree, Basin, your own handler...), the form posts there instead. assets/js/site.js adds
   validation messages and sends it without a page reload; without JS it posts normally and
   lands on /dekujeme/. */
export function enquiryForm(c, { id = 'poptavka', title = 'Poptávka', intro, kind = 'obecna', product, submit = 'Odeslat poptávku', messagePlaceholder = 'S čím vám můžeme pomoci?' } = {}) {
  const endpoint = c.site.forms.endpoint;
  const attrs = endpoint
    ? `action="${esc(endpoint)}"`
    : `action="${c.url('dekujeme/')}" data-netlify="true" netlify-honeypot="firma-web"`;
  const f = (name) => `${id}-${name}`;
  return html`<section class="enquiry" id="${id}" aria-labelledby="${f('title')}">
  <div class="enquiry-head">
    <h2 id="${f('title')}">${esc(title)}</h2>
    ${intro && html`<p>${esc(intro)}</p>`}
    <ul class="enquiry-direct">
      <li>${phoneLink(c)}</li>
      <li>${emailLink(c)}</li>
    </ul>
  </div>
  <form class="form" name="poptavka" method="POST" ${attrs} data-enquiry${c.proto ? ' data-preview' : ''}>
    <input type="hidden" name="form-name" value="poptavka">
    <input type="hidden" name="typ" value="${esc(kind)}">
    <input type="hidden" name="automat" value="${product ? esc(`${product.name} (${product.id})`) : ''}">
    <p class="hp"><label>Nevyplňujte <input name="firma-web" tabindex="-1" autocomplete="off"></label></p>
    ${product && html`<p class="form-about">Poptávka automatu: <strong>${esc(product.name)}</strong></p>`}
    <div class="form-grid">
      <div class="field">
        <label for="${f('jmeno')}">Jméno a příjmení <span class="req" aria-hidden="true">*</span></label>
        <input id="${f('jmeno')}" name="jmeno" type="text" autocomplete="name" required maxlength="120">
      </div>
      <div class="field">
        <label for="${f('firma')}">Firma <span class="opt">(nepovinné)</span></label>
        <input id="${f('firma')}" name="firma" type="text" autocomplete="organization" maxlength="160">
      </div>
      <div class="field">
        <label for="${f('email')}">E-mail <span class="req" aria-hidden="true">*</span></label>
        <input id="${f('email')}" name="email" type="email" autocomplete="email" required maxlength="160">
      </div>
      <div class="field">
        <label for="${f('telefon')}">Telefon <span class="opt">(nepovinné)</span></label>
        <input id="${f('telefon')}" name="telefon" type="tel" autocomplete="tel" maxlength="40" pattern="[0-9+()\\s\\-]{9,}">
      </div>
      <div class="field field-wide">
        <label for="${f('zprava')}">Zpráva <span class="req" aria-hidden="true">*</span></label>
        <textarea id="${f('zprava')}" name="zprava" rows="5" required maxlength="4000" placeholder="${esc(messagePlaceholder)}"></textarea>
      </div>
    </div>
    <p class="form-note" id="${f('note')}">Pole označená * jsou povinná. Poptávka je nezávazná. Údaje použijeme jen k odpovědi na ni a k jednání o nabídce, nic vám nebudeme posílat bez vyžádání. Více v <a href="${c.url('ochrana-osobnich-udaju/')}#poptavky">zásadách ochrany osobních údajů</a>.</p>
    ${c.proto && html`<p class="form-preview-note" role="note"><strong>Pracovní náhled:</strong> formulář se odtud neodesílá. Vyplnění si můžete vyzkoušet, zpráva ale nikam nedorazí.</p>`}
    <div class="form-actions"><button class="btn btn-primary btn-lg" type="submit">${esc(submit)}</button></div>
    <div class="form-status" role="status" aria-live="polite" tabindex="-1"></div>
  </form>
</section>`;
}

/* ---------- the document ---------- */
export function layout(c, { title, description, body, head = '', scripts = [], bodyClass = '', ogImage }) {
  const fullTitle = c.page.path === '' ? title : `${title} | ${c.site.name}`;
  const canonical = c.absUrl && !c.page.noindex ? c.absUrl(c.page.path) : null;
  const og = ogImage && (/^https?:\/\//.test(ogImage) ? ogImage : c.absUrl ? c.absUrl(ogImage) : null);
  return html`<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${c.page.noindex && '<meta name="robots" content="noindex">\n'}${canonical && html`<link rel="canonical" href="${canonical}">\n`}<meta property="og:type" content="website">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:locale" content="cs_CZ">
${canonical && html`<meta property="og:url" content="${canonical}">\n`}${og && html`<meta property="og:image" content="${og}">\n`}<meta name="theme-color" content="#ffffff">
<link rel="icon" href="${c.url('assets/img/favicon.svg')}" type="image/svg+xml">
<link rel="stylesheet" href="${c.url('assets/fonts/fonts.css')}">
<link rel="stylesheet" href="${c.url('assets/css/site.css')}">
${head}<script>document.documentElement.classList.add('js')</script>${c.proto && '\n' + c.proto.head(c)}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
<a class="skip-link" href="#obsah">Přeskočit na obsah</a>
${header(c)}
<main id="obsah" tabindex="-1">
${body}
</main>
${footer(c)}
${c.proto
  // the prototype renders saved changes first, then loads the page scripts itself
  ? c.proto.foot(c, ['assets/js/site.js', ...scripts].map((s) => c.url(s)))
  : html`<script src="${c.url('assets/js/site.js')}" defer></script>
${scripts.map((s) => html`<script src="${c.url(s)}" defer></script>\n`)}`}</body>
</html>
`;
}
