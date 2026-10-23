// One function per page type. Each returns { title, description, body, ... } for layout().
import { esc, html, ph, plural } from './util.mjs';
import {
  ARROW, breadcrumbs, productCard, productPath, productImage, priceText, makerLine,
  conditionBadge, specValue, enquiryForm, phoneLink, emailLink, carousel, photoNote, mediaUrl,
} from './components.mjs';

const real = (list) => list.filter((p) => !p.placeholder);
const byNewest = (a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '');
// Carousels lead with photographed machines; ones still waiting for a photo go last.
const byShowcase = (a, b) => (b.images.length > 0) - (a.images.length > 0) || byNewest(a, b);
const countLabel = (n) => `${n} ${plural(n, 'automat', 'automaty', 'automatů')}`;

/* ---------- category icons (line drawings, no fake photos) ---------- */
const ICONS = {
  'instantni-kavove-automaty': '<path d="M7 9h9v6a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4V9z"/><path d="M16 11h1.5a2 2 0 0 1 0 4H16M9 3c0 1.5 1 1.5 1 3M12.5 3c0 1.5 1 1.5 1 3"/>',
  'automaty-na-zrnkovou-kavu': '<ellipse cx="12" cy="12" rx="6" ry="8.5" transform="rotate(30 12 12)"/><path d="M8.5 6.5c3 2 4 7 7 11"/>',
  'snackove-automaty': '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 7h8M8 11h8M8 15h5"/><circle cx="16" cy="17.5" r="1"/>',
  'napojove-automaty': '<path d="M10 3h4v3l2 3v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3V3z"/><path d="M8 13h8"/>',
  'kombinovane-automaty': '<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M12 3v18M6 7h3M6 11h3M6 15h3M15 8h3v5h-3z"/>',
};
const catIcon = (slug) => `<svg class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[slug] || ICONS['kombinovane-automaty']}</svg>`;

function categoryCards(c, { headingLevel = 3, browse = false } = {}) {
  const h = `h${headingLevel}`;
  return html`<ul class="cat-grid">${c.categories.map((cat) => {
    const n = real(c.products.filter((p) => p.category === cat.slug)).length;
    const pick = browse ? ` data-browse-cat="${esc(cat.slug)}" aria-controls="nabidka-${esc(cat.slug)}"` : '';
    return html`<li class="cat-card">
      ${catIcon(cat.slug)}
      <${h}><a href="${c.url(`automaty/${cat.slug}/`)}"${pick}>${esc(cat.name)}</a></${h}>
      <p>${esc(cat.short)}</p>
      <span class="cat-count">${n ? countLabel(n) : 'Nabídka na dotaz'}</span>
    </li>`;
  })}</ul>`;
}

const photoNotice = (list) =>
  list.some((p) => p.images.some((i) => i.illustrative)) &&
  html`<p class="notice" role="note"><strong>Ilustrační fotografie.</strong> Snímky ukazují podobné modely, ne konkrétní kusy. Technické parametry, stav a ceny doplníme.</p>`;

const emptyCategory = (c, cat, h = 'h3') => html`<div class="empty-state">
  ${catIcon(cat.slug)}
  <${h}>Aktuálně nemáme zveřejněné žádné automaty v této kategorii</${h}>
  <p>Nabídka se průběžně mění. Napište nám, jaký automat hledáte, a ozveme se, jakmile bude k dispozici.</p>
  <a class="btn btn-primary" href="${c.url(`automaty/${cat.slug}/`)}#poptavka">Poptat automat</a>
</div>`;

/* ---------- two-level browsing: pick a category, its machines appear below ----------
   Without JS every category card is a plain link to the category page and the panels stay hidden.
   assets/js/browse.js turns the cards into selectors and reveals the chosen panel in place. */
function categoryIndex(c, { headingLevel = 3 } = {}) {
  const h = `h${headingLevel}`;
  return html`<ol class="cat-index">${c.categories.map((cat, i) => {
    const n = real(c.products.filter((p) => p.category === cat.slug)).length;
    return html`<li class="cat-row">
      <span class="cat-no" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
      <${h} class="cat-name"><a href="${c.url(`automaty/${cat.slug}/`)}" data-browse-cat="${esc(cat.slug)}" aria-controls="nabidka-${esc(cat.slug)}">${esc(cat.name)}</a></${h}>
      <p class="cat-short">${esc(cat.short)}</p>
      <span class="cat-count">${n ? countLabel(n) : 'Na dotaz'}</span>
    </li>`;
  })}</ol>`;
}

/* /automaty/: the machine types as alternating editorial rows, a representative photo beside the
   name, description and count. A category without a supplied photo keeps its line drawing in the
   image area instead of borrowing another machine's picture. */
function categoryRows(c, { headingLevel = 2 } = {}) {
  const h = `h${headingLevel}`;
  const picks = c.site.home?.categoryPhotos || {};
  return html`<ol class="type-rows">${c.categories.map((cat, i) => {
    const list = real(c.products.filter((p) => p.category === cat.slug)).sort(byNewest);
    const rep = list.find((p) => p.id === picks[cat.slug]) || list.find((p) => p.images[0]);
    const img = rep?.images[0];
    return html`<li class="type-row">
      <div class="type-media${img ? '' : ' is-empty'}" aria-hidden="true">
        ${img
          ? html`<img src="${mediaUrl(c, img.src)}" data-fallback="${c.url('assets/img/placeholder-automat.svg')}" alt="" width="${img.width || 600}" height="${img.height || 600}" loading="${i ? 'lazy' : 'eager'}" decoding="async">`
          : html`${catIcon(cat.slug)}<span class="type-media-note">Fotografie bude doplněna</span>`}
      </div>
      <div class="type-text">
        <span class="type-no" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
        <${h} class="type-name"><a href="${c.url(`automaty/${cat.slug}/`)}" data-browse-cat="${esc(cat.slug)}" aria-controls="nabidka-${esc(cat.slug)}">${esc(cat.name)}</a></${h}>
        <p class="type-short">${esc(cat.short)}</p>
        <p class="type-count">${list.length ? countLabel(list.length) : 'Nabídka na dotaz'}</p>
      </div>
    </li>`;
  })}</ol>`;
}

/* Homepage: one editorial panel per category that actually has machines, with a representative
   photo (site.home.categoryPhotos picks it, else the newest machine's). Empty categories are listed
   in one quiet line below, as plain links to their pages. */
function categoryPanels(c, { headingLevel = 3 } = {}) {
  const h = `h${headingLevel}`;
  const picks = c.site.home?.categoryPhotos || {};
  const stocked = c.categories.filter((cat) => real(c.products.filter((p) => p.category === cat.slug)).length);
  const others = c.categories.filter((cat) => !stocked.includes(cat));
  return html`<ol class="kinds">${stocked.map((cat, i) => {
    const list = real(c.products.filter((p) => p.category === cat.slug)).sort(byNewest);
    const rep = list.find((p) => p.id === picks[cat.slug]) || list.find((p) => p.images[0]);
    const img = rep?.images[0];
    return html`<li class="kind">
      <span class="kind-no" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
      <div class="kind-text">
        <${h} class="kind-name"><a href="${c.url(`automaty/${cat.slug}/`)}" data-browse-cat="${esc(cat.slug)}" aria-controls="nabidka-${esc(cat.slug)}">${esc(cat.name)}</a></${h}>
        <p class="kind-short">${esc(cat.short)}</p>
        <p class="kind-meta"><span class="kind-count">${countLabel(list.length)}</span><span class="kind-state"><span class="kind-pick">Zobrazit automaty</span><span class="kind-on">Vybráno</span></span></p>
      </div>
      <span class="kind-arrow" aria-hidden="true">${ARROW}</span>
      ${img && html`<span class="kind-photo" aria-hidden="true"><img src="${mediaUrl(c, img.src)}" data-fallback="${c.url('assets/img/placeholder-automat.svg')}" alt="" width="${img.width || 600}" height="${img.height || 600}" loading="lazy" decoding="async"></span>`}
    </li>`;
  })}</ol>
  ${others.length > 0 && html`<p class="kinds-more"><span class="home-label">Další druhy automatů na dotaz</span> ${others.map((cat) => html`<a href="${c.url(`automaty/${cat.slug}/`)}">${esc(cat.name)}</a>`).join('<span aria-hidden="true"> · </span>')}</p>`}`;
}

/* Homepage offer: the machines of a category as an open gallery. Every machine gets the same image
   well, standing on its bottom edge over a faint ground shadow, with its name, description, any
   supplied specs or price and the "Mám zájem" action directly underneath. */
function machineGallery(c, list, { headingLevel = 4, label } = {}) {
  const h = `h${headingLevel}`;
  return html`<ul class="showcase" aria-label="${esc(label)}">${list.map((p) => {
    const href = c.url(productPath(p));
    const keySpecs = p.specs.filter((s) => s.key && s.value != null && s.value !== '').slice(0, 4);
    return html`<li class="showcase-item">
      <a class="showcase-media" href="${href}" tabindex="-1" aria-hidden="true">${productImage(c, p, { sizes: '(max-width: 600px) 92vw, (max-width: 1099px) 46vw, 420px' })}</a>
      ${photoNote(p)}
      <div class="showcase-body">
        ${makerLine(p) && html`<p class="showcase-maker">${esc(makerLine(p))}</p>`}
        <${h} class="showcase-title"><a href="${href}">${esc(p.name)}</a></${h}>
        <p class="showcase-summary">${esc(p.summary)}</p>
        ${keySpecs.length > 0 && html`<dl class="showcase-specs">${keySpecs.map((s) => html`<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`)}</dl>`}
        <div class="showcase-foot">
          ${p.price != null && html`<p class="showcase-price">${esc(priceText(c, p))}</p>`}
          <a class="showcase-btn" href="${href}#poptavka">Mám zájem<span class="visually-hidden">: ${esc(p.name)}</span></a>
        </div>
      </div>
    </li>`;
  })}</ul>`;
}

function categoryBrowser(c, { headingLevel = 3, layout = 'cards', gallery = false } = {}) {
  const h = `h${headingLevel}`;
  const selector = { index: categoryIndex, panels: categoryPanels, rows: categoryRows }[layout];
  return html`<div class="browse browse-${layout}" data-browse>
  ${selector ? selector(c, { headingLevel }) : categoryCards(c, { headingLevel, browse: true })}
  <p class="browse-hint" data-browse-hint hidden>Vyberte kategorii a níže se zobrazí automaty, které v ní nabízíme.</p>
  ${c.categories.map((cat) => {
    const list = c.products.filter((p) => p.category === cat.slug).sort(byShowcase);
    return html`<section class="browse-panel" id="nabidka-${esc(cat.slug)}" aria-labelledby="nabidka-${esc(cat.slug)}-title" tabindex="-1" hidden>
    <div class="browse-head">
      <div>
        <p class="eyebrow">Vybraná kategorie</p>
        <${h} id="nabidka-${esc(cat.slug)}-title">${esc(cat.name)}</${h}>
      </div>
      <a class="text-link" href="${c.url(`automaty/${cat.slug}/`)}">Celá kategorie ${ARROW}</a>
    </div>
    ${list.length
      ? html`${photoNotice(list)}${gallery
        ? machineGallery(c, list, { label: cat.name, headingLevel: headingLevel + 1 })
        : carousel(c, list, { id: `carousel-${cat.slug}`, label: cat.name, headingLevel: headingLevel + 1 })}`
      : emptyCategory(c, cat, `h${headingLevel + 1}`)}
  </section>`;
  })}
</div>`;
}

const placeholderNotice = (list) =>
  list.some((p) => p.placeholder) &&
  html`<div class="notice" role="note"><strong>Ukázkový katalog.</strong> Položky níže jsou vzorové a ukazují jen rozvržení katalogu. Skutečné automaty, fotografie a ceny doplníme.</div>`;

/* ---------- catalogue listing with data-driven controls ----------
   A control is rendered only when the data gives it something to do: a filter needs at least two
   different values, price sorting needs two priced machines, search needs a large enough catalogue.
   The controls start hidden and assets/js/catalogue.js reveals them, so without JS the full list shows. */
function catalogue(c, list, { headingLevel = 2, label = 'Automaty' } = {}) {
  const distinct = (key) => [...new Set(list.map((p) => p[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));
  const makers = distinct('manufacturer');
  const conds = Object.keys(c.site.conditions).filter((k) => list.some((p) => p.condition === k));
  const types = distinct('type');
  const priced = list.filter((p) => p.price != null).length >= 2;
  const search = list.length >= c.site.catalogue.searchMinProducts;
  const select = (name, text, opts) => html`<div class="tool">
      <label for="f-${name}">${text}</label>
      <select id="f-${name}" name="${name}" data-filter="${name}"><option value="">Vše</option>${opts.map(([v, t]) => html`<option value="${esc(v)}">${esc(t)}</option>`)}</select>
    </div>`;
  const hasFilters = search || makers.length > 1 || conds.length > 1 || types.length > 1 || priced;
  const sorted = [...list].sort(byNewest);

  return html`<div class="catalogue" data-catalogue>
  ${list.length > 1 && html`<form class="cat-tools" hidden data-cat-tools role="search" aria-label="Filtrovat a řadit automaty">
    ${search && html`<div class="tool tool-search"><label for="f-q">Hledat</label><input id="f-q" type="search" name="q" data-filter="q" placeholder="Název, výrobce, model"></div>`}
    ${makers.length > 1 && select('manufacturer', 'Výrobce', makers.map((m) => [m, m]))}
    ${conds.length > 1 && select('condition', 'Stav', conds.map((k) => [k, c.site.conditions[k].label]))}
    ${types.length > 1 && select('type', 'Typ automatu', types.map((t) => [t, t]))}
    ${priced && html`<fieldset class="tool tool-price"><legend>Cena (Kč)</legend>
      <label class="visually-hidden" for="f-pmin">Cena od</label><input id="f-pmin" type="number" min="0" step="1000" inputmode="numeric" placeholder="od" data-filter="pmin">
      <span aria-hidden="true">–</span>
      <label class="visually-hidden" for="f-pmax">Cena do</label><input id="f-pmax" type="number" min="0" step="1000" inputmode="numeric" placeholder="do" data-filter="pmax">
    </fieldset>`}
    <div class="tool">
      <label for="f-sort">Řadit</label>
      <select id="f-sort" name="sort" data-sort>
        <option value="newest">Nejnovější</option>
        <option value="name">Název A–Z</option>
        ${priced && '<option value="price-asc">Cena od nejnižší</option><option value="price-desc">Cena od nejvyšší</option>'}
      </select>
    </div>
    ${hasFilters && html`<button class="btn btn-ghost tool-reset" type="reset">Zrušit filtry</button>`}
  </form>`}
  <p class="cat-status" aria-live="polite" data-cat-status></p>
  <ul class="card-grid" data-cat-list aria-label="${esc(label)}">
    ${sorted.map((p) => productCard(c, p, { headingLevel }))}
  </ul>
  <p class="cat-empty" hidden data-cat-empty>Zvoleným filtrům neodpovídá žádný automat. <button class="link-button" type="button" data-cat-clear>Zrušit filtry</button></p>
</div>`;
}

/* ================================================================ */

export function home(c) {
  const machines = real(c.products);
  const hero = c.products.find((p) => p.id === c.site.home?.heroProduct) || c.products.find((p) => p.images[0]);
  const img = hero?.images[0];
  // Each word is its own span so phones can break the headline into four lines.
  const words = (text) => text.split(' ').map((w) => html`<span class="w">${esc(w)}</span>`).join(' ');
  return {
    title: `${c.site.name} | Použité a repasované prodejní automaty`,
    description: 'Prodej použitých, repasovaných a renovovaných prodejních automatů se zaměřením na automaty na instantní kávu a teplé nápoje. Vyberte si druh automatu a prohlédněte si nabídku.',
    bodyClass: 'page-home',
    variant: 'home',
    head: html`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..600;1,6..96,400&display=swap">
<link rel="stylesheet" href="${c.url('assets/css/home.css')}">
${img && html`<link rel="preload" as="image" href="${mediaUrl(c, img.src)}">`}
`,
    scripts: ['assets/js/home.js', 'assets/js/browse.js'],
    body: html`
<section class="hero" aria-labelledby="hero-title">
  <div class="home-wrap hero-inner">
    <p class="home-label hero-label" data-enter>Prodej použitých automatů</p>
    <div class="hero-stage">
      <h1 class="hero-title" id="hero-title">
        <span class="hero-line"><span class="hero-in" data-enter>${words('Použité automaty.')}</span></span>
        <span class="hero-line hero-line-2"><span class="hero-in" data-enter>${words('Nové možnosti.')}</span></span>
      </h1>
      ${img && html`<figure class="hero-figure" data-enter>
        <img src="${mediaUrl(c, img.src)}" data-fallback="${c.url('assets/img/placeholder-automat.svg')}" alt="${esc(img.alt || hero.name)}" width="${img.width || 800}" height="${img.height || 800}" fetchpriority="high" decoding="async">
        <figcaption>${esc(hero.name)}${img.illustrative ? ' · ilustrační foto' : ''}</figcaption>
      </figure>`}
    </div>
    <div class="hero-foot" data-enter>
      <p class="hero-sub">Prodáváme použité, repasované a renovované prodejní automaty. Specializujeme se na automaty na instantní kávu a teplé nápoje.</p>
      <div class="hero-actions">
        <a class="home-btn" href="#nabidka">Prohlédnout nabídku ${ARROW}</a>
        <a class="home-link" href="${c.url('kontakt/')}">Kontaktujte nás</a>
      </div>
    </div>
  </div>
</section>

<section class="intro" aria-labelledby="intro-title" data-reveal>
  <div class="home-wrap intro-grid">
    <p class="home-label">O nabídce</p>
    <h2 class="intro-statement" id="intro-title">${esc(c.site.tagline)}</h2>
    <dl class="intro-facts">
      <div><dt>Zaměření</dt><dd>Instantní káva a teplé nápoje</dd></div>
      <div><dt>Pro koho</dt><dd>Kanceláře, výrobní provozy, školy a provozovatelé automatů</dd></div>
      <div><dt>V nabídce</dt><dd>${machines.length ? countLabel(machines.length) : 'Nabídka na dotaz'}</dd></div>
    </dl>
  </div>
</section>

<section class="offer" id="nabidka" aria-labelledby="offer-title">
  <div class="home-wrap">
    <div class="offer-head" data-reveal>
      <p class="home-label">Nabídka</p>
      <h2 class="offer-title" id="offer-title">Vyberte si druh automatu</h2>
      <p class="offer-lead">Po výběru se níže zobrazí automaty, které v dané kategorii nabízíme.</p>
    </div>
    ${categoryBrowser(c, { headingLevel: 3, layout: 'panels', gallery: true })}
  </div>
</section>

<section class="steps" id="jak-to-funguje" aria-labelledby="steps-title">
  <div class="home-wrap">
    <div class="steps-head" data-reveal>
      <p class="home-label">Postup</p>
      <h2 class="steps-title" id="steps-title">Jak to funguje</h2>
    </div>
    <ol class="steps-list" data-reveal>
      <li><span class="steps-no" aria-hidden="true">01</span><h3>Vyberte druh automatu</h3><p>Začněte kategorií, která odpovídá vašemu provozu.</p></li>
      <li><span class="steps-no" aria-hidden="true">02</span><h3>Prohlédněte si automaty</h3><p>U každého automatu je fotografie a krátký popis.</p></li>
      <li><span class="steps-no" aria-hidden="true">03</span><h3>Klikněte na Mám zájem</h3><p>Vyplníte krátkou poptávku k vybranému automatu.</p></li>
      <li><span class="steps-no" aria-hidden="true">04</span><h3>Ozveme se s nabídkou</h3><p>Na poptávku odpovíme a připravíme nabídku.</p></li>
    </ol>
  </div>
</section>`,
  };
}

export function categoriesIndex(c) {
  return {
    title: 'Kategorie prodejních automatů',
    head: html`<link rel="stylesheet" href="${c.url('assets/css/category-rows.css')}">
`,
    scripts: ['assets/js/carousel.js', 'assets/js/browse.js'],
    description: 'Všechny kategorie použitých a repasovaných prodejních automatů: instantní a zrnkové kávové automaty, automaty na snacky, chlazené nápoje a kombinované automaty.',
    body: html`
<div class="page-head">
  <div class="wrap">
    ${breadcrumbs(c, [['automaty/', 'Automaty']])}
    <h1>Kategorie prodejních automatů</h1>
    <p class="lead">Vyberte kategorii a zobrazí se automaty, které v ní nabízíme. Pokud hledaný automat nevidíte, napište nám a zjistíme, co je k dispozici.</p>
  </div>
</div>
<section class="section"><div class="wrap">${categoryBrowser(c, { headingLevel: 2, layout: 'rows' })}</div></section>`,
  };
}

export function category(c, cat) {
  const list = c.products.filter((p) => p.category === cat.slug);
  const n = real(list).length;
  return {
    title: cat.name,
    description: cat.metaDescription,
    scripts: list.length ? ['assets/js/carousel.js'] : [],
    body: html`
<div class="page-head">
  <div class="wrap">
    ${breadcrumbs(c, [['automaty/', 'Automaty'], [`automaty/${cat.slug}/`, cat.name]])}
    <h1>${esc(cat.name)}</h1>
    <p class="lead">${esc(cat.intro)}</p>
    ${n > 0 && html`<p class="page-count">${countLabel(n)}</p>`}
  </div>
</div>
<section class="section section-tight">
  <div class="wrap">
    ${list.length
      ? html`${placeholderNotice(list)}${photoNotice(list)}${carousel(c, [...list].sort(byShowcase), { id: 'carousel', label: cat.name, headingLevel: 2 })}`
      : emptyCategory(c, cat, 'h2')}
  </div>
</section>
<div class="section section-alt"><div class="wrap">
  ${enquiryForm(c, {
    title: list.length ? 'Nenašli jste vhodný automat?' : 'Poptat automat',
    intro: 'Popište, jaký automat hledáte a kam ho chcete umístit. Ozveme se s nabídkou.',
    kind: `kategorie: ${cat.name}`,
    messagePlaceholder: 'Jaký automat hledáte, kolik nápojů denně, kam ho chcete umístit…',
  })}
</div></div>`,
  };
}

export function product(c, p) {
  const cat = c.categories.find((x) => x.slug === p.category);
  const cond = p.condition && c.site.conditions[p.condition];
  const related = (p.related?.length
    ? p.related.map((id) => c.products.find((x) => x.id === id)).filter(Boolean)
    : c.products.filter((x) => x.category === p.category && x.id !== p.id).sort(byNewest)
  ).slice(0, 12);
  const maker = makerLine(p);
  const ld = c.absUrl && !p.placeholder && {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.summary,
    ...(p.manufacturer && { brand: { '@type': 'Brand', name: p.manufacturer } }),
    ...(p.model && { model: p.model }),
    ...(p.images.some((i) => !i.illustrative) && { image: p.images.filter((i) => !i.illustrative).map((i) => mediaUrl({ url: c.absUrl }, i.src)) }),
    ...(p.price != null && {
      offers: { '@type': 'Offer', price: p.price, priceCurrency: c.site.catalogue.currency, url: c.absUrl(productPath(p)), itemCondition: p.condition === 'pouzity' ? 'https://schema.org/UsedCondition' : 'https://schema.org/RefurbishedCondition' },
    }),
  };
  const facts = [
    ['Stav', cond ? esc(cond.label) : ph('doplní se')],
    ['Typ automatu', p.type ? esc(p.type) : null],
    ['Dostupnost', p.availability ? esc(p.availability) : null],
  ].filter(([, v]) => v);

  return {
    title: [p.name, maker].filter(Boolean).join(' – '),
    description: (p.placeholder ? 'Vzorová položka katalogu. ' : '') + `${p.name}${maker ? ` (${maker})` : ''}: ${p.summary} Technické parametry, stav a poptávka.`.slice(0, 300),
    scripts: [...(p.images.length > 1 ? ['assets/js/gallery.js'] : []), ...(related.length ? ['assets/js/carousel.js'] : [])],
    ogImage: p.images[0]?.src,
    body: html`
<div class="wrap">
  ${breadcrumbs(c, [['automaty/', 'Automaty'], [`automaty/${cat.slug}/`, cat.name], [productPath(p), p.name]])}
</div>
<article class="product">
  <div class="wrap product-top">
    <div class="gallery" data-gallery>
      <figure class="gallery-main">${productImage(c, p, { eager: true, sizes: '(max-width: 900px) 100vw, 640px' })}</figure>
      ${photoNote(p)}
      ${p.images.length > 1 && html`<ul class="gallery-thumbs" aria-label="Další fotografie">
        ${p.images.map((img, i) => html`<li><a href="${mediaUrl(c, img.src)}" data-full="${mediaUrl(c, img.src)}" data-alt="${esc(img.alt || p.name)}"${i === 0 ? ' aria-current="true"' : ''}>
          <img src="${mediaUrl(c, img.thumb || img.src)}" alt="${esc(`Fotografie ${i + 1}: ${img.alt || p.name}`)}" width="120" height="90" loading="lazy" decoding="async"></a></li>`)}
      </ul>`}
    </div>
    <div class="product-summary">
      <div class="card-badges">${conditionBadge(c, p)}</div>
      <p class="product-maker">${maker ? esc(maker) : ph('Výrobce a model doplníme')}</p>
      <h1>${esc(p.name)}</h1>
      <p class="product-lead">${esc(p.summary)}</p>
      <dl class="facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
      <div class="price-box">
        <p class="price${p.price == null ? ' is-on-request' : ''}">${esc(priceText(c, p))}</p>
        <a class="btn btn-primary btn-lg btn-block" href="#poptavka">Poptat tento automat</a>
        <div class="price-direct">${phoneLink(c)}${emailLink(c)}</div>
      </div>
    </div>
  </div>

  <div class="wrap product-details">
    <section aria-labelledby="popis">
      <h2 id="popis">Popis</h2>
      ${p.description.map((t) => html`<p>${esc(t)}</p>`)}
    </section>
    <section aria-labelledby="parametry">
      <h2 id="parametry">Technické parametry</h2>
      <table class="spec-table">
        <caption class="visually-hidden">Technické parametry: ${esc(p.name)}</caption>
        <tbody>
          ${p.manufacturer && html`<tr><th scope="row">Výrobce</th><td>${esc(p.manufacturer)}</td></tr>`}
          ${p.model && html`<tr><th scope="row">Model</th><td>${esc(p.model)}</td></tr>`}
          ${p.specs.map((s) => html`<tr><th scope="row">${esc(s.label)}</th><td>${specValue(s.value)}</td></tr>`)}
        </tbody>
      </table>
    </section>
    <section aria-labelledby="stav">
      <h2 id="stav">Stav a repase</h2>
      ${cond
        ? html`<p><strong>${esc(cond.label)}.</strong> ${cond.verified ? esc(cond.description) : ph(cond.description)}</p>`
        : html`<p>${ph('Stav automatu doplníme.')}</p>`}
      ${p.conditionDetails ? html`<p>${esc(p.conditionDetails)}</p>` : html`<p>${ph('Doplňte, co bylo na tomto kusu zkontrolováno, opraveno nebo vyměněno.')}</p>`}
      <p><a class="text-link" href="${c.url('repasovane-automaty/')}">Jak automaty připravujeme ${ARROW}</a></p>
    </section>
    ${(p.features.length > 0 || p.paymentSystems.length > 0) && html`<section aria-labelledby="vybaveni">
      <h2 id="vybaveni">Vybavení a platební systémy</h2>
      ${p.features.length > 0 && html`<h3>Vybavení</h3><ul class="ticks">${p.features.map((f) => html`<li>${esc(f)}</li>`)}</ul>`}
      ${p.paymentSystems.length > 0 && html`<h3>Kompatibilní platební systémy</h3><ul class="ticks">${p.paymentSystems.map((f) => html`<li>${esc(f)}</li>`)}</ul>`}
    </section>`}
    ${p.warranty && html`<section aria-labelledby="zaruka"><h2 id="zaruka">Záruka</h2><p>${esc(p.warranty)}</p></section>`}
  </div>

  <div class="section section-alt"><div class="wrap">
    ${enquiryForm(c, {
      title: 'Zeptejte se na tento automat',
      intro: 'Napište nám, co vás zajímá, nebo si vyžádejte cenovou nabídku. Ozveme se vám.',
      kind: 'automat',
      product: p,
      submit: 'Poslat poptávku',
      messagePlaceholder: 'Dobrý den, mám zájem o tento automat. Prosím o nabídku…',
    })}
  </div></div>

  ${related.length > 0 && html`<section class="section" aria-labelledby="related-title">
    <div class="wrap">
      <div class="section-head"><h2 id="related-title">Podobné automaty</h2>
        <a class="text-link" href="${c.url(`automaty/${cat.slug}/`)}">${esc(cat.name)} ${ARROW}</a></div>
      ${carousel(c, related, { id: 'carousel-related', label: 'Podobné automaty', headingLevel: 3 })}
    </div>
  </section>`}
</article>
${ld && html`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`}`,
  };
}

export function refurbished(c) {
  const list = c.products.filter((p) => p.condition === 'repasovany' || p.condition === 'renovovany');
  const main = c.categories.find((x) => x.featured) || c.categories[0];
  const v = (f) => c.url(`assets/video/${f}`);
  return {
    title: 'Repasované a renovované automaty',
    description: 'Repasované a renovované prodejní automaty: jak automaty před prodejem kontrolujeme, opravujeme a testujeme a co znamenají jednotlivé stavy.',
    head: html`<link rel="stylesheet" href="${c.url('assets/css/servis.css')}">
<script>
  (function () {
    var v = document.createElement('video');
    var playable = v.canPlayType && (v.canPlayType('video/mp4; codecs="avc1.640028"') || v.canPlayType('video/webm; codecs="vp9"'));
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (playable && !still) document.documentElement.classList.add('js-scrub');
  })();
</script>
`,
    scripts: ['assets/js/scrub.js', ...(list.length > 1 ? ['assets/js/catalogue.js'] : [])],
    body: html`
<div class="page-head">
  <div class="wrap">
    ${breadcrumbs(c, [['repasovane-automaty/', 'Repasované automaty']])}
    <h1>Repasované a renovované automaty</h1>
    <p class="lead">Použité automaty před prodejem kontrolujeme, čistíme a podle stavu opravujeme. U každého automatu uvádíme, v jakém stavu ho prodáváme.</p>
  </div>
</div>

<section class="section section-tight" aria-labelledby="stavy">
  <div class="wrap">
    <h2 id="stavy">Co znamenají stavy automatů</h2>
    <ul class="condition-grid">
      ${Object.entries(c.site.conditions).map(([k, cond]) => html`<li class="condition-card">
        <span class="badge badge-${esc(k)}">${esc(cond.label)}</span>
        <p>${cond.verified ? esc(cond.description) : ph(cond.description)}</p>
      </li>`)}
    </ul>
  </div>
</section>

<!-- Servis: scroll-controlled presentation of how machines are prepared.
     Copy is plain HTML; edit freely. data-from / data-to are seconds in the video where each panel shows.
     Scrolling first folds away the service cover (--cover-distance), then scrubs the video
     (--scrub-distance); both lengths live in assets/css/servis.css. -->
<section class="scrub" id="postup" aria-labelledby="scrub-title" data-duration="25.17">
  <div class="scrub-sticky">
    <div class="scrub-media" aria-hidden="true">
      <video class="scrub-video" id="scrubVideo" muted playsinline preload="none"
             disablepictureinpicture disableremoteplayback tabindex="-1"
             poster="${v('servis-scrub-start.jpg')}">
        <source data-src="${v('servis-scrub-720.mp4')}" media="(max-width: 760px)" type="video/mp4">
        <source data-src="${v('servis-scrub-720.webm')}" media="(max-width: 760px)" type="video/webm">
        <source data-src="${v('servis-scrub-1280.mp4')}" type="video/mp4">
        <source data-src="${v('servis-scrub-1280.webm')}" type="video/webm">
      </video>
      <img class="scrub-poster" src="${v('servis-scrub-poster.jpg')}" alt="" width="1280" height="944" loading="lazy" decoding="async">
    </div>

    <div class="scrub-content">
      <div class="scrub-panels">
        <!-- 0–1.8 s: the closed machine, its door starting to open -->
        <article class="scrub-panel scrub-intro" data-from="0" data-to="1.8">
          <h2 id="scrub-title">Druhá šance začíná důkladnou péčí.</h2>
          <p>Podívejte se, jak připravujeme použité automaty na další provoz.</p>
          <p class="scrub-hint">Posuňte dolů a prohlédněte si postup</p>
        </article>
        <!-- 1.8–10.7 s: panels lift off and the inner parts are laid out -->
        <article class="scrub-panel" data-from="1.8" data-to="10.7">
          <span class="scrub-no">01</span>
          <h3>Důkladná kontrola</h3>
          <p>Prověříme technický stav a funkčnost důležitých součástí automatu.</p>
        </article>
        <!-- 10.7–20.7 s: close-ups of shelves, control board, cooling unit, dispenser and coin box -->
        <article class="scrub-panel" data-from="10.7" data-to="20.7">
          <span class="scrub-no">02</span>
          <h3>Servis a opravy</h3>
          <p>Automat vyčistíme a podle jeho stavu opravíme nebo vyměníme opotřebené díly.</p>
        </article>
        <!-- 20.7–23.7 s: the parts come back together and the door closes -->
        <article class="scrub-panel" data-from="20.7" data-to="23.7">
          <span class="scrub-no">03</span>
          <h3>Závěrečné testování</h3>
          <p>Před předáním ověříme funkčnost a připravenost automatu k používání.</p>
        </article>
        <!-- 23.7 s to the end: the complete machine -->
        <article class="scrub-panel scrub-closing" data-from="23.7">
          <h3>Připravený na další provoz.</h3>
          <a class="btn btn-primary btn-lg" href="${c.url(`automaty/${main.slug}/`)}">Prohlédnout dostupné automaty ${ARROW}</a>
        </article>
      </div>

      <div class="scrub-progress" aria-hidden="true">
        <span class="scrub-track"><span class="scrub-fill"></span></span>
        <span class="scrub-marks"><span data-step="1">01</span><span data-step="2">02</span><span data-step="3">03</span></span>
      </div>
      <p class="scrub-note">Ilustrační animace</p>
    </div>

    <!-- Service cover: folds away as the section is entered (assets/js/scrub.js). Decorative only. -->
    <div class="scrub-cover" aria-hidden="true">
      <div class="cover-dim"></div>
      <div class="cover-leaf cover-top">
        <span class="cover-mark"><svg viewBox="0 0 32 32"><path d="M27 4C14 4 5 10 5 20c0 3 1 5.5 2.5 7.5C9 18 15 13 22 10 16 14 11 19 9 28.5 11 29.5 13 30 15 30c9 0 14-8 12-26z" fill="currentColor"/></svg></span>
        <div class="cover-leaf cover-bottom"><span class="cover-handle"></span></div>
      </div>
    </div>
  </div>
</section>

<section class="section" aria-labelledby="refurb-list">
  <div class="wrap">
    <h2 id="refurb-list">Repasované a renovované automaty v nabídce</h2>
    ${list.length
      ? catalogue(c, list, { headingLevel: 3, label: 'Repasované a renovované automaty' })
      : html`<div class="empty-state">
          <p>Momentálně nemáme zveřejněné žádné automaty označené jako repasované nebo renovované. Stav každého automatu najdete u jeho popisu v katalogu.</p>
          <a class="btn btn-primary" href="${c.url('automaty/')}">Prohlédnout všechny automaty</a>
        </div>`}
  </div>
</section>

<div class="section section-alt"><div class="wrap">
  ${enquiryForm(c, { title: 'Poptat repasovaný automat', intro: 'Napište, jaký automat hledáte. Ozveme se s nabídkou.', kind: 'repasovany automat' })}
</div></div>`,
  };
}

export function parts(c) {
  return {
    title: 'Náhradní díly a příslušenství pro prodejní automaty',
    description: 'Náhradní díly a příslušenství pro prodejní automaty. Napište výrobce a model automatu a díl, který potřebujete, a my ověříme dostupnost.',
    body: html`
<div class="page-head">
  <div class="wrap">
    ${breadcrumbs(c, [['nahradni-dily/', 'Náhradní díly']])}
    <h1>Náhradní díly a příslušenství</h1>
    <p class="lead">Sháníte díl nebo příslušenství do svého automatu? Napište nám, co potřebujete, a ověříme dostupnost a cenu.</p>
  </div>
</div>
<section class="section section-tight">
  <div class="wrap split">
    <div>
      <h2>Co nám do poptávky napsat</h2>
      <ol class="steps">
        <li><strong>Výrobce a model automatu.</strong> Najdete je na typovém štítku, obvykle uvnitř dveří.</li>
        <li><strong>Název nebo číslo dílu</strong>, pokud je znáte. Pomůže i popis, k čemu díl slouží.</li>
        <li><strong>Počet kusů</strong> a kam díl potřebujete dodat.</li>
      </ol>
      <p>Fotografii štítku nebo dílu nám můžete poslat e-mailem.</p>
    </div>
    <aside class="side-box">
      <h2>Katalog dílů</h2>
      <p>${ph('Doplňte, jaké díly a pro které značky běžně dodáváte. Seznam dílů lze později přidat jako samostatný katalog.')}</p>
    </aside>
  </div>
</section>
<div class="section section-alt"><div class="wrap">
  ${enquiryForm(c, {
    title: 'Poptat náhradní díl',
    kind: 'nahradni dil',
    submit: 'Odeslat poptávku dílu',
    messagePlaceholder: 'Výrobce a model automatu, název nebo číslo dílu, počet kusů…',
  })}
</div></div>`,
  };
}

export function service(c) {
  return {
    title: 'Opravy, servis a údržba prodejních automatů',
    description: 'Opravy, servis a pravidelná údržba prodejních automatů. Popište závadu a ozveme se s dalším postupem.',
    body: html`
<div class="page-head">
  <div class="wrap">
    ${breadcrumbs(c, [['servis/', 'Servis']])}
    <h1>Opravy, servis a údržba</h1>
    <p class="lead">Pomůžeme s diagnostikou závad, opravami a pravidelnou údržbou prodejních automatů.</p>
  </div>
</div>
<section class="section section-tight">
  <div class="wrap">
    <ul class="service-grid">
      <li class="service-card"><h2>Diagnostika a opravy</h2><p>Zjistíme příčinu závady a navrhneme opravu nebo výměnu dílu.</p></li>
      <li class="service-card"><h2>Pravidelná údržba</h2><p>Čištění a kontrola automatu pomáhají předcházet poruchám a výpadkům prodeje.</p></li>
      <li class="service-card"><h2>Výměna opotřebených dílů</h2><p>Opotřebené díly vyměníme a ověříme, že automat funguje, jak má.</p></li>
    </ul>
    <div class="split split-top">
      <div>
        <h2>Jak postupujeme</h2>
        <ol class="steps">
          <li><strong>Popíšete nám závadu</strong> a automat: výrobce, model a co přesně nefunguje.</li>
          <li><strong>Ozveme se</strong> a domluvíme další postup.</li>
          <li><strong>Automat opravíme</strong> a před předáním otestujeme.</li>
        </ol>
      </div>
      <aside class="side-box">
        <h2>Značky a oblast působnosti</h2>
        <p>${ph('Doplňte, které značky automatů servisujete, v jaké oblasti jezdíte a jak se účtuje výjezd.')}</p>
      </aside>
    </div>
  </div>
</section>
<div class="section section-alt"><div class="wrap">
  ${enquiryForm(c, {
    title: 'Objednat servis',
    kind: 'servis',
    submit: 'Odeslat požadavek na servis',
    messagePlaceholder: 'Výrobce a model automatu, popis závady, kde automat stojí…',
  })}
</div></div>`,
  };
}

export function about(c) {
  return {
    title: 'O nás',
    description: `${c.site.name}: prodej použitých, repasovaných a renovovaných prodejních automatů, náhradní díly a servis.`,
    body: html`
<div class="page-head">
  <div class="wrap">
    ${breadcrumbs(c, [['o-nas/', 'O nás']])}
    <h1>O nás</h1>
    <p class="lead">Prodáváme použité, repasované a renovované prodejní automaty a staráme se o jejich servis.</p>
  </div>
</div>
<section class="section section-tight">
  <div class="wrap split">
    <div class="prose">
      <h2>Kdo jsme</h2>
      <p>${ph('Doplňte příběh firmy: od kdy působíte, kdo za firmou stojí, kde máte dílnu a sklad.')}</p>
      <h2>Co děláme</h2>
      <ul class="ticks">
        <li>Prodej použitých, repasovaných a renovovaných prodejních automatů</li>
        <li>Specializace na automaty na instantní kávu a teplé nápoje</li>
        <li>Náhradní díly a příslušenství</li>
        <li>Opravy, servis a údržba</li>
      </ul>
      <h2>Pro koho pracujeme</h2>
      <p>${ph('Doplňte, komu nejčastěji prodáváte: provozovatelům automatů, firmám, školám…')}</p>
    </div>
    <aside class="side-box">
      <h2>Firemní údaje</h2>
      <dl class="facts">
        <div><dt>Název</dt><dd>${esc(c.site.name)}</dd></div>
        <div><dt>IČO</dt><dd>${c.site.contact.companyId ? esc(c.site.contact.companyId) : ph('doplní se')}</dd></div>
        <div><dt>Adresa</dt><dd>${c.site.contact.address ? esc(c.site.contact.address) : ph('doplní se')}</dd></div>
      </dl>
      <a class="btn btn-primary btn-block" href="${c.url('kontakt/')}">Kontaktujte nás</a>
    </aside>
  </div>
</section>`,
  };
}

export function contact(c) {
  const ct = c.site.contact;
  return {
    title: 'Kontakt',
    description: `Kontaktujte ${c.site.name}: telefon, e-mail a poptávkový formulář. Rádi poradíme s výběrem automatu, dílů i servisu.`,
    body: html`
<div class="page-head">
  <div class="wrap">
    ${breadcrumbs(c, [['kontakt/', 'Kontakt']])}
    <h1>Kontakt</h1>
    <p class="lead">Zavolejte, napište e-mail nebo vyplňte formulář. Rádi poradíme s výběrem automatu, náhradními díly i servisem.</p>
  </div>
</div>
<section class="section section-tight">
  <div class="wrap">
    <ul class="contact-grid">
      <li class="contact-card"><h2>Telefon</h2>${phoneLink(c, 'contact-big')}</li>
      <li class="contact-card"><h2>E-mail</h2>${emailLink(c, 'contact-big')}</li>
      <li class="contact-card"><h2>Adresa</h2><p>${ct.address ? esc(ct.address) : ph('Adresa doplníme')}</p>
        <p class="muted">${ct.hours ? esc(ct.hours) : ph('Otevírací doba doplníme')}</p></li>
    </ul>
  </div>
</section>
<div class="section section-alt"><div class="wrap">
  ${enquiryForm(c, { id: 'formular', title: 'Napište nám', intro: 'Odpovíme vám e-mailem nebo telefonicky.', kind: 'kontakt', submit: 'Odeslat zprávu' })}
</div></div>`,
  };
}

export function thanks(c) {
  return {
    title: 'Děkujeme za poptávku',
    description: 'Vaši poptávku jsme přijali.',
    body: html`
<section class="section"><div class="wrap narrow center">
  <h1>Děkujeme, zprávu jsme přijali</h1>
  <p class="lead">Ozveme se vám co nejdříve.</p>
  <p><a class="btn btn-primary" href="${c.url('automaty/')}">Zpět na nabídku automatů</a></p>
</div></section>`,
  };
}

export function notFound(c) {
  return {
    title: 'Stránka nenalezena',
    description: 'Požadovaná stránka neexistuje.',
    body: html`
<section class="section"><div class="wrap narrow center">
  <h1>Stránku jsme nenašli</h1>
  <p class="lead">Odkaz je možná zastaralý nebo automat už není v nabídce.</p>
  <p class="center-actions"><a class="btn btn-primary" href="${c.url('automaty/')}">Prohlédnout automaty</a> <a class="btn btn-ghost" href="${c.url('kontakt/')}">Kontaktujte nás</a></p>
</div></section>`,
  };
}
