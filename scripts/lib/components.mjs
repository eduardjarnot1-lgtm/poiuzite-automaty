// Reusable page parts: layout, header, footer, breadcrumbs, product cards, enquiry form.
import { esc, html, ph, czk } from './util.mjs';

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

/* ---------- header ---------- */
const NAV = [
  ['repasovane-automaty/', 'Repasované automaty'],
  ['nahradni-dily/', 'Náhradní díly'],
  ['servis/', 'Servis'],
  ['o-nas/', 'O nás'],
];
const current = (c, path) => (c.page.section === path ? ' aria-current="page"' : '');

export function header(c) {
  return html`<header class="site-header">
  <div class="wrap header-inner">
    ${logo(c)}
    <nav class="site-nav" id="site-nav" aria-label="Hlavní navigace">
      <ul class="nav-list">
        <li class="has-sub">
          <a href="${c.url('automaty/')}"${current(c, 'automaty/')}>Automaty</a>
          <button class="sub-toggle" type="button" aria-expanded="false" aria-controls="nav-sub"><span class="visually-hidden">Kategorie automatů</span></button>
          <ul class="nav-sub" id="nav-sub">
            ${c.categories.map((cat) => html`<li><a href="${c.url(`automaty/${cat.slug}/`)}">${esc(cat.name)}</a></li>`)}
            <li class="nav-sub-all"><a href="${c.url('automaty/')}">Všechny kategorie</a></li>
          </ul>
        </li>
        ${NAV.map(([path, label]) => html`<li><a href="${c.url(path)}"${current(c, path)}>${label}</a></li>`)}
        <li class="nav-mobile-only"><a href="${c.url('kontakt/')}"${current(c, 'kontakt/')}>Kontakt</a></li>
      </ul>
      <div class="nav-contact">${phoneLink(c)}${emailLink(c)}</div>
    </nav>
    <a class="btn btn-primary header-cta" href="${c.url('kontakt/')}"${current(c, 'kontakt/')}>Kontaktujte nás</a>
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
    <nav aria-label="Kategorie automatů">
      <h2 class="footer-title">Automaty</h2>
      <ul>${c.categories.map((cat) => html`<li><a href="${c.url(`automaty/${cat.slug}/`)}">${esc(cat.name)}</a></li>`)}</ul>
    </nav>
    <nav aria-label="Služby a firma">
      <h2 class="footer-title">Služby a firma</h2>
      <ul>
        ${NAV.map(([path, label]) => html`<li><a href="${c.url(path)}">${label}</a></li>`)}
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
  <div class="wrap footer-base">© ${new Date().getFullYear()} ${esc(c.site.name)}</div>
</footer>`;
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
export const productPath = (p) => `automaty/${p.category}/${p.slug}/`;

export const priceText = (c, p) =>
  p.price != null ? czk(p.price, c.site.catalogue.currency, c.site.catalogue.pricesIncludeVat) : 'Cena na dotaz';

export const makerLine = (p) => [p.manufacturer, p.model].filter(Boolean).join(' · ');

export function conditionBadge(c, p) {
  const cond = p.condition && c.site.conditions[p.condition];
  return html`${p.placeholder && '<span class="badge badge-ph">Vzorová položka</span>'}${cond && html`<span class="badge badge-${esc(p.condition)}">${esc(cond.label)}</span>`}`;
}

// First image, or a neutral drawing that says the photo is still to come.
export function productImage(c, p, { index = 0, eager = false, sizes = '(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 360px' } = {}) {
  const img = p.images[index];
  if (!img) {
    return html`<img src="${c.url('assets/img/placeholder-automat.svg')}" alt="Fotografie automatu bude doplněna" width="600" height="450" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  }
  return html`<img src="${c.url(img.src)}"${img.srcset?.length > 0 && html` srcset="${img.srcset.map((s) => `${c.url(s.src)} ${s.w}w`).join(', ')}" sizes="${sizes}"`} alt="${esc(img.alt || p.name)}" width="${img.width || 800}" height="${img.height || 600}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

const specValue = (v) => (v == null || v === '' ? ph('doplní se') : esc(v));

export function productCard(c, p, { headingLevel = 2 } = {}) {
  const href = c.url(productPath(p));
  const h = `h${headingLevel}`;
  const keySpecs = p.specs.filter((s) => s.key).slice(0, 4);
  const search = [p.name, p.manufacturer, p.model, p.summary].filter(Boolean).join(' ').toLowerCase();
  return html`<li class="card" data-name="${esc(p.name.toLowerCase())}" data-manufacturer="${esc(p.manufacturer || '')}" data-condition="${esc(p.condition || '')}" data-type="${esc(p.type || '')}" data-price="${p.price ?? ''}" data-date="${esc(p.dateAdded || '')}" data-search="${esc(search)}">
  <a class="card-media" href="${href}" tabindex="-1" aria-hidden="true">${productImage(c, p)}</a>
  <div class="card-body">
    <div class="card-badges">${conditionBadge(c, p)}</div>
    <p class="card-maker">${makerLine(p) ? esc(makerLine(p)) : ph('Výrobce a model doplníme')}</p>
    <${h} class="card-title"><a href="${href}">${esc(p.name)}</a></${h}>
    <p class="card-summary">${esc(p.summary)}</p>
    ${keySpecs.length > 0 && html`<dl class="card-specs">${keySpecs.map((s) => html`<div><dt>${esc(s.label)}</dt><dd>${specValue(s.value)}</dd></div>`)}</dl>`}
    <p class="card-price${p.price == null ? ' is-on-request' : ''}">${esc(priceText(c, p))}</p>
    <div class="card-actions">
      <a class="btn btn-primary" href="${href}">Zobrazit detail</a>
      <a class="btn btn-ghost" href="${href}#poptavka">Zeptat se na automat</a>
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
  <form class="form" name="poptavka" method="POST" ${attrs} data-enquiry>
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
        <label for="${f('firma')}">Firma</label>
        <input id="${f('firma')}" name="firma" type="text" autocomplete="organization" maxlength="160">
      </div>
      <div class="field">
        <label for="${f('email')}">E-mail <span class="req" aria-hidden="true">*</span></label>
        <input id="${f('email')}" name="email" type="email" autocomplete="email" required maxlength="160">
      </div>
      <div class="field">
        <label for="${f('telefon')}">Telefon</label>
        <input id="${f('telefon')}" name="telefon" type="tel" autocomplete="tel" maxlength="40" pattern="[0-9+()\\s\\-]{9,}">
      </div>
      <div class="field field-wide">
        <label for="${f('zprava')}">Zpráva <span class="req" aria-hidden="true">*</span></label>
        <textarea id="${f('zprava')}" name="zprava" rows="5" required maxlength="4000" placeholder="${esc(messagePlaceholder)}"></textarea>
      </div>
    </div>
    <p class="form-note">Pole označená * jsou povinná. Údaje použijeme jen k vyřízení vaší poptávky.</p>
    <div class="form-actions"><button class="btn btn-primary btn-lg" type="submit">${esc(submit)}</button></div>
    <div class="form-status" role="status" aria-live="polite" tabindex="-1"></div>
  </form>
</section>`;
}

/* ---------- the document ---------- */
export function layout(c, { title, description, body, head = '', scripts = [], bodyClass = '', ogImage }) {
  const fullTitle = c.page.path === '' ? title : `${title} | ${c.site.name}`;
  const canonical = c.absUrl && !c.page.noindex ? c.absUrl(c.page.path) : null;
  const og = ogImage && c.absUrl ? c.absUrl(ogImage) : null;
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="${c.url('assets/css/site.css')}">
${head}<script>document.documentElement.classList.add('js')</script>
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#obsah">Přeskočit na obsah</a>
${header(c)}
<main id="obsah" tabindex="-1">
${body}
</main>
${footer(c)}
<script src="${c.url('assets/js/site.js')}" defer></script>
${scripts.map((s) => html`<script src="${c.url(s)}" defer></script>\n`)}</body>
</html>
`;
}
