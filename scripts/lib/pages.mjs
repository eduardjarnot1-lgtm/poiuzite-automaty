// One function per page type. Each returns { title, description, body, ... } for layout().
import { esc, html, ph, plural } from './util.mjs';
import {
  ARROW, CHECK, INFO, SERVICE_NAV, breadcrumbs, productCard, productPath, productImage, priceText, makerLine,
  conditionBadge, filledSpecs, enquiryForm, phoneLink, emailLink, photoNote, mediaUrl, ctaBand, priceSlot, nowOf,
} from './components.mjs';
import { isListed, recommended, sale, effectivePrice, discountState, SORTS } from './catalog.mjs';

// Listings show published machines that are not sold (drafts, hidden, deleted and sold ones never
// appear), in the recommended order: featured first, then the order saved in the admin, then
// photographed machines, newest first.
const real = (list) => list.filter((p) => !p.placeholder && isListed(p));
const ordered = (c, list, cat) => recommended(list, (cat && c.catOrder?.[cat]) || c.order);
const countLabel = (n) => `${n} ${plural(n, 'automat', 'automaty', 'automatů')}`;
const publishedLabel = (n) => `${n} ${plural(n, 'zveřejněný automat', 'zveřejněné automaty', 'zveřejněných automatů')}`;
const inCategory = (c, cat) => c.products.filter((p) => p.category === cat.slug && isListed(p));

/* ---------- category icons (line drawings, no fake photos) ---------- */
const ICONS = {
  'instantni-kavove-automaty': '<path d="M7 9h9v6a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4V9z"/><path d="M16 11h1.5a2 2 0 0 1 0 4H16M9 3c0 1.5 1 1.5 1 3M12.5 3c0 1.5 1 1.5 1 3"/>',
  'automaty-na-zrnkovou-kavu': '<ellipse cx="12" cy="12" rx="6" ry="8.5" transform="rotate(30 12 12)"/><path d="M8.5 6.5c3 2 4 7 7 11"/>',
  'snackove-automaty': '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M8 7h8M8 11h8M8 15h5"/><circle cx="16" cy="17.5" r="1"/>',
  'napojove-automaty': '<path d="M10 3h4v3l2 3v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3V3z"/><path d="M8 13h8"/>',
  'kombinovane-automaty': '<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M12 3v18M6 7h3M6 11h3M6 15h3M15 8h3v5h-3z"/>',
};
const catIcon = (slug) => `<svg class="cat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[slug] || ICONS['kombinovane-automaty']}</svg>`;

/* ---------- shared listing parts ---------- */

// One short line above every listing: published machines are not a stock confirmation, and
// reference photos show similar models.
const listingNotice = (list) => {
  const illustrative = list.some((p) => p.images.some((i) => i.illustrative));
  return html`<div class="notice" role="note">${INFO}<p><strong>Zveřejněné automaty z naší nabídky.</strong> Stav, cenu a dostupnost konkrétního kusu vám potvrdíme v odpovědi na poptávku.${illustrative ? ' Fotografie jsou ilustrační a ukazují podobné modely.' : ''}</p></div>`;
};

const productGrid = (c, list, { headingLevel = 3, label }) =>
  html`<ul class="card-grid" aria-label="${esc(label)}">${list.map((p, i) => productCard(c, p, { headingLevel, order: i }))}</ul>`;

// Categories without published machines: plainly "na dotaz", no counts or photos that would make
// them look like populated catalogues. Each links to its category page, which carries the form.
function askCards(c, cats, { headingLevel = 3 } = {}) {
  const h = `h${headingLevel}`;
  return html`<ul class="ask-grid">${cats.map((cat) => html`<li class="ask-card">
    ${catIcon(cat.slug)}
    <${h}><a href="${c.url(`automaty/${cat.slug}/`)}">${esc(cat.name)}</a></${h}>
    <p>${esc(cat.short)}</p>
    <p class="ask-state">Bez zveřejněných automatů</p>
    <span class="ask-go" aria-hidden="true">Poptat ${ARROW}</span>
  </li>`)}</ul>`;
}

const splitCategories = (c) => {
  const stocked = c.categories.filter((cat) => real(inCategory(c, cat)).length);
  return { stocked, onRequest: c.categories.filter((cat) => !stocked.includes(cat)) };
};

const emptyCategory = (c, cat, h = 'h2') => html`<div class="empty-state">
  ${catIcon(cat.slug)}
  <div>
    <${h}>V této kategorii zatím nemáme zveřejněné žádné automaty</${h}>
    <p>Nabídka se průběžně mění. Napište nám, jaký automat hledáte, a ozveme se, jakmile bude k dispozici.</p>
    <div class="empty-actions">
      <a class="btn btn-primary" href="#poptavka">Poptat ${esc(cat.name.toLowerCase())}</a>
      <a class="btn btn-secondary" href="${c.url('automaty/')}">Zveřejněné automaty</a>
    </div>
  </div>
</div>`;

const serviceSubnav = (c) => html`<ul class="subnav" aria-label="Repase a servis">${SERVICE_NAV.map(([path, label]) =>
  html`<li><a href="${c.url(path)}"${c.page.section === path ? ' aria-current="page"' : ''}>${label}</a></li>`)}</ul>`;

const placeholderNotice = (list) =>
  list.some((p) => p.placeholder) &&
  html`<div class="notice" role="note"><strong>Ukázkový katalog.</strong> Položky níže jsou vzorové a ukazují jen rozvržení katalogu. Skutečné automaty, fotografie a ceny doplníme.</div>`;

/* ---------- catalogue listing with data-driven controls ----------
   "Seřadit podle" is there whenever there is more than one machine. A filter is rendered only when
   the data gives it something to do: category, availability, condition or manufacturer need at
   least two different values, the price range needs two priced machines, "Pouze ve slevě" a
   discount that is running or scheduled, search a large enough catalogue. `list` comes in the
   recommended order. The controls start hidden and assets/js/catalogue.js reveals them, so
   without JS the full list shows in the recommended order. */
function catalogue(c, list, { headingLevel = 2, label = 'Automaty', categories = false } = {}) {
  const distinct = (key) => [...new Set(list.map((p) => p[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'cs'));
  const makers = distinct('manufacturer');
  const conds = Object.keys(c.site.conditions).filter((k) => list.some((p) => p.condition === k));
  const types = distinct('type');
  const cats = categories ? c.categories.filter((cat) => list.some((p) => p.category === cat.slug)) : [];
  const avail = ['Skladem', 'Na objednávku', 'Rezervováno'].filter((a) => list.some((p) => p.availability === a));
  const priced = list.filter((p) => effectivePrice(p, nowOf(c)) != null).length >= 2;
  const discounts = list.some((p) => ['active', 'scheduled'].includes(discountState(p, nowOf(c))));
  const search = list.length >= c.site.catalogue.searchMinProducts;
  const select = (name, text, opts) => html`<div class="tool">
      <label for="f-${name}">${text}</label>
      <select id="f-${name}" name="${name}" data-filter="${name}"><option value="">Vše</option>${opts.map(([v, t]) => html`<option value="${esc(v)}">${esc(t)}</option>`)}</select>
    </div>`;
  const hasFilters = search || makers.length > 1 || conds.length > 1 || types.length > 1 || cats.length > 1 || avail.length > 1 || priced || discounts;

  return html`<div class="catalogue" data-catalogue>
  ${list.length > 1 && html`<form class="cat-tools" hidden data-cat-tools role="search" aria-label="Filtrovat a řadit automaty">
    ${search && html`<div class="tool tool-search"><label for="f-q">Hledat</label><input id="f-q" type="search" name="q" data-filter="q" placeholder="Název, výrobce, model"></div>`}
    ${cats.length > 1 && select('category', 'Druh automatu', cats.map((cat) => [cat.slug, cat.name]))}
    ${makers.length > 1 && select('manufacturer', 'Výrobce', makers.map((m) => [m, m]))}
    ${conds.length > 1 && select('condition', 'Stav', conds.map((k) => [k, c.site.conditions[k].label]))}
    ${types.length > 1 && select('type', 'Typ automatu', types.map((t) => [t, t]))}
    ${avail.length > 1 && select('availability', 'Dostupnost', avail.map((a) => [a, a]))}
    ${priced && html`<fieldset class="tool tool-price"><legend>Cena (Kč)</legend>
      <label class="visually-hidden" for="f-pmin">Cena od</label><input id="f-pmin" type="number" min="0" step="1000" inputmode="numeric" placeholder="od" data-filter="pmin">
      <span aria-hidden="true">–</span>
      <label class="visually-hidden" for="f-pmax">Cena do</label><input id="f-pmax" type="number" min="0" step="1000" inputmode="numeric" placeholder="do" data-filter="pmax">
    </fieldset>`}
    ${discounts && html`<div class="tool tool-check"><label><input type="checkbox" data-filter="sale" value="1"> Pouze ve slevě</label></div>`}
    <div class="tool">
      <label for="f-sort">Seřadit podle</label>
      <select id="f-sort" name="sort" data-sort>
        ${SORTS.map(([v, t]) => html`<option value="${v}">${t}</option>`)}
      </select>
    </div>
    ${hasFilters && html`<button class="btn btn-ghost tool-reset" type="reset">Zrušit filtry</button>`}
  </form>`}
  <p class="cat-status" aria-live="polite" data-cat-status></p>
  <ul class="card-grid" data-cat-list aria-label="${esc(label)}">
    ${list.map((p, i) => productCard(c, p, { headingLevel, order: i }))}
  </ul>
  <div class="cat-empty" hidden data-cat-empty><p>Zvoleným filtrům neodpovídá žádný automat.</p><button class="btn btn-secondary" type="button" data-cat-clear>Zrušit filtry</button></div>
</div>`;
}

/* ================================================================ */

export function home(c) {
  const machines = ordered(c, real(c.products));
  const { stocked, onRequest } = splitCategories(c);
  const shown = c.products.filter(isListed);
  const hero = shown.find((p) => p.id === c.site.home?.heroProduct) || shown.find((p) => p.images[0]);
  const img = hero?.images[0];
  const main = stocked[0];
  return {
    title: `${c.site.name} | Použité a repasované prodejní automaty`,
    description: 'Prodej použitých, repasovaných a renovovaných prodejních automatů se zaměřením na automaty na instantní kávu a teplé nápoje. Vyberte si druh automatu a prohlédněte si nabídku.',
    head: img ? html`<link rel="preload" as="image" href="${mediaUrl(c, img.src)}">\n` : '',
    bodyClass: 'is-home',
    body: html`
<div class="home-backdrop" aria-hidden="true"></div>
<section class="hero" aria-labelledby="hero-title">
  <div class="wrap hero-grid">
    <div class="hero-text">
      <p class="eyebrow">Prodej použitých automatů</p>
      <h1 id="hero-title">Použité a repasované prodejní automaty</h1>
      <p class="hero-lead">Prodáváme použité, repasované a renovované prodejní automaty pro firmy a provozovatele. Specializujeme se na automaty na instantní kávu a teplé nápoje.</p>
      <div class="hero-actions">
        <a class="btn btn-primary btn-lg" href="#nabidka">Prohlédnout nabídku</a>
        <a class="btn btn-secondary btn-lg" href="${c.url('kontakt/')}#formular">Poradit s výběrem</a>
      </div>
      <ul class="hero-points">
        ${machines.length > 0 && html`<li>${CHECK}${publishedLabel(machines.length)}</li>`}
        <li>${CHECK}Další druhy automatů na dotaz</li>
        <li>${CHECK}Servis a náhradní díly</li>
      </ul>
    </div>
    ${img && html`<figure class="hero-media">
      <div class="hero-well"><img src="${mediaUrl(c, img.src)}" data-fallback="${c.url('assets/img/placeholder-automat.svg')}" alt="${esc(img.alt || hero.name)}" width="${img.width || 800}" height="${img.height || 800}" fetchpriority="high" decoding="async"></div>
      <figcaption>${esc(hero.name)}${img.illustrative ? html` · ilustrační foto podobného modelu${img.credit && html` · zdroj <a href="${esc(img.credit.url)}" rel="noopener nofollow" target="_blank">${esc(img.credit.label)}<span class="visually-hidden"> (otevře se v novém okně)</span></a>`}` : ''}</figcaption>
    </figure>`}
  </div>
</section>

<section class="section section-tight" id="nabidka" aria-labelledby="offer-title">
  <div class="wrap">
    <div class="section-head">
      <div class="section-head-text">
        <h2 id="offer-title">Nabídka automatů</h2>
        <p>${main ? html`${esc(main.name)}, které máme zveřejněné v katalogu. Otevřete detail automatu nebo rovnou pošlete poptávku.` : 'Aktuálně nemáme zveřejněné žádné automaty. Napište nám, co hledáte.'}</p>
      </div>
      ${main && html`<a class="text-link" href="${c.url(`automaty/${main.slug}/`)}">${esc(main.name)} ${ARROW}</a>`}
    </div>
    ${machines.length > 0 && html`${listingNotice(machines)}${catalogue(c, machines, { headingLevel: 3, label: 'Zveřejněné automaty', categories: true })}`}
  </div>
</section>

${onRequest.length > 0 && html`<section class="section section-alt" id="na-dotaz" aria-labelledby="ask-title">
  <div class="wrap">
    <div class="section-head"><div class="section-head-text">
      <h2 id="ask-title">Další druhy automatů na dotaz</h2>
      <p>Tyto automaty zatím nemáme zveřejněné v katalogu. Napište nám, jaký automat hledáte, a zjistíme, co je k dispozici.</p>
    </div></div>
    ${askCards(c, onRequest)}
  </div>
</section>`}

<section class="section" id="jak-poptat" aria-labelledby="how-title">
  <div class="wrap">
    <div class="section-head"><div class="section-head-text">
      <h2 id="how-title">Jak poptávka funguje</h2>
      <p>Poptávka je nezávazná. Na jejím základě vám připravíme nabídku.</p>
    </div></div>
    <ol class="how">
      <li><h3>Vyberte automat nebo popište, co hledáte</h3><p>Otevřete detail automatu z nabídky, nebo nám napište, jaký automat a pro jaký provoz potřebujete.</p></li>
      <li><h3>Pošlete poptávku</h3><p>Vyplníte krátký formulář. Když poptáváte z detailu automatu, jeho název se do poptávky doplní sám.</p></li>
      <li><h3>Ozveme se s nabídkou</h3><p>Na poptávku odpovíme a upřesníme stav, cenu a dostupnost konkrétního automatu.</p></li>
    </ol>
  </div>
</section>

<section class="section section-alt" id="repase-a-servis" aria-labelledby="service-title">
  <div class="wrap service-split">
    <div>
      <h2 id="service-title">Repase a servis</h2>
      <p class="lead">Použité automaty před prodejem kontrolujeme, čistíme a podle stavu opravujeme. U každého automatu uvádíme, v jakém stavu ho prodáváme.</p>
      <a class="text-link" href="${c.url('repasovane-automaty/')}">Jak automaty připravujeme ${ARROW}</a>
    </div>
    <ul class="service-list">
      <li class="service-link"><h3><a href="${c.url('repasovane-automaty/')}">Repasované automaty</a></h3><p>Co znamenají stavy použitý, repasovaný a plně renovovaný.</p>${ARROW}</li>
      <li class="service-link"><h3><a href="${c.url('servis/')}">Servis a opravy</a></h3><p>Diagnostika závad, opravy a pravidelná údržba prodejních automatů.</p>${ARROW}</li>
      <li class="service-link"><h3><a href="${c.url('nahradni-dily/')}">Náhradní díly</a></h3><p>Napište výrobce a model automatu a díl, který potřebujete. Ověříme dostupnost a cenu.</p>${ARROW}</li>
    </ul>
  </div>
</section>

${insideLook(c)}

${ctaBand(c)}`,
    scripts: ['assets/js/inside.js', ...(machines.length > 1 ? ['assets/js/catalogue.js'] : [])],
  };
}

/* An illustrative 3D animation of a machine opening into an exploded view. Labelled as a
   visualisation, not footage of a real inspection. assets/js/inside.js plays it once when half of
   it is in view and adds the play / pause / replay control; without JS the native controls show. */
// The stages of the illustrative 3D animation, as they appear in the footage (seconds). The same
// list drives the scroll-controlled video and the explanation next to it (assets/js/inside.js).
// Describes only what is visible; the animation is not a specific machine.
export const INSIDE_DURATION = 25.17;
export const INSIDE_STEPS = [
  { from: 0, to: 1.3, title: 'Celý automat', text: 'Výchozí pohled na zavřený automat: prosklená dvířka se zbožím, dotykový displej a platební panel na pravé straně.' },
  { from: 1.3, to: 10.6, title: 'Otevření a rozložení', text: 'Dvířka se otevřou a horní kryt, boční panely i elektronika se oddálí od rámu. Rozložený automat se pomalu otáčí, aby byly vidět jednotlivé díly.' },
  { from: 10.6, to: 13.8, title: 'Police se zbožím a ovládací panel', text: 'Bližší pohled na police se spirálami, ve kterých stojí zboží, a na ovládací panel s displejem a platebním terminálem.' },
  { from: 13.8, to: 16.8, title: 'Spodní část automatu', text: 'Ve spodní části rámu je technická jednotka s ventilátorem a kompresorem. Pod policemi je výdejní přihrádka, do které zboží padá.' },
  { from: 16.8, to: 20.9, title: 'Mincovník', text: 'Detail mincovníku s tubami na mince a schránky pod ním, vedle nejnižší police s nápoji.' },
  { from: 20.9, to: INSIDE_DURATION, title: 'Zpět v celku', text: 'Díly se vrátí na své místo a automat se znovu zavře.' },
];

function insideLook(c) {
  const n = INSIDE_STEPS.length;
  const num = (i) => String(i + 1).padStart(2, '0');
  return html`<section class="section inside" id="pohled-dovnitr" aria-labelledby="inside-title" data-inside data-duration="${INSIDE_DURATION}">
  <div class="inside-track" data-inside-track>
  <div class="wrap inside-grid" data-inside-stage>
    <div class="inside-text">
      <p class="eyebrow">Technický pohled</p>
      <h2 id="inside-title">Podívejte se dovnitř automatu.</h2>
      <div class="inside-step-head">
        <p class="inside-count" data-inside-count><span class="visually-hidden">Krok </span><span data-inside-current>01</span> / ${num(n - 1)}</p>
        <div class="inside-progress" aria-hidden="true"><span data-inside-bar></span>${INSIDE_STEPS.slice(1).map((s) => html`<i style="left:${((s.from / INSIDE_DURATION) * 100).toFixed(2)}%"></i>`)}</div>
      </div>
      <div class="inside-steps" data-inside-steps>
        ${INSIDE_STEPS.map((s, i) => html`<div class="inside-step${i === 0 ? ' is-active' : ''}" data-from="${s.from}" data-to="${s.to}"${i === 0 ? '' : ' hidden'}>
          <h3>${esc(s.title)}</h3>
          <p>${esc(s.text)}</p>
        </div>`)}
      </div>
      <p class="inside-hint" data-inside-hint hidden>Posouvejte dolů a prohlédněte si jednotlivé části.</p>
      <div class="inside-nav" data-inside-nav hidden>
        <button class="btn btn-secondary btn-sm" type="button" data-inside-prev>Předchozí krok</button>
        <button class="btn btn-secondary btn-sm" type="button" data-inside-next>Další krok</button>
      </div>
      <p class="visually-hidden" aria-live="polite" data-inside-live></p>
      <details class="inside-all" data-inside-all>
        <summary>Zobrazit celý popis</summary>
        <ol>${INSIDE_STEPS.map((s) => html`<li><strong>${esc(s.title)}.</strong> ${esc(s.text)}</li>`)}</ol>
      </details>
      <a class="btn btn-primary btn-lg inside-cta" href="${c.url('kontakt/')}#formular">Zeptat se na konkrétní automat</a>
    </div>
    <figure class="inside-media">
      <div class="inside-frame" data-inside-frame>
        <video controls muted playsinline preload="none" width="1024" height="756"
          poster="${c.url('assets/img/automat-zevnitr-poster.webp')}"
          aria-label="Ilustrační animace: automat se otevře, rozloží na hlavní části a znovu složí">
          <source src="${c.url('assets/video/automat-zevnitr.webm')}" type="video/webm">
          <source src="${c.url('assets/video/automat-zevnitr.mp4')}" type="video/mp4">
        </video>
      </div>
      <figcaption>Ilustrační 3D vizualizace. Konstrukce jednotlivých modelů se může lišit.</figcaption>
    </figure>
  </div>
  </div>
</section>`;
}

export function categoriesIndex(c) {
  const { stocked, onRequest } = splitCategories(c);
  return {
    title: 'Kategorie prodejních automatů',
    description: 'Všechny kategorie použitých a repasovaných prodejních automatů: instantní a zrnkové kávové automaty, automaty na snacky, chlazené nápoje a kombinované automaty.',
    body: html`
<div class="page-head">
  <div class="wrap">
    ${breadcrumbs(c, [['automaty/', 'Nabídka automatů']])}
    <h1>Nabídka automatů</h1>
    <p class="lead">Níže najdete automaty, které máme zveřejněné, a další druhy automatů, které vám zajistíme na dotaz. Pokud hledaný automat nevidíte, napište nám a zjistíme, co je k dispozici.</p>
  </div>
</div>
${stocked.map((cat) => {
  const list = ordered(c, real(inCategory(c, cat)), cat.slug);
  return html`<section class="section section-tight" aria-labelledby="cat-${esc(cat.slug)}">
  <div class="wrap">
    <div class="section-head">
      <div class="section-head-text">
        <h2 id="cat-${esc(cat.slug)}">${esc(cat.name)}</h2>
        <p>${esc(cat.short)} ${publishedLabel(list.length)}.</p>
      </div>
      <a class="text-link" href="${c.url(`automaty/${cat.slug}/`)}">Stránka kategorie ${ARROW}</a>
    </div>
    ${listingNotice(list)}
    ${productGrid(c, list, { headingLevel: 3, label: cat.name })}
  </div>
</section>`;
})}
${onRequest.length > 0 && html`<section class="section section-alt" aria-labelledby="ask-title">
  <div class="wrap">
    <div class="section-head"><div class="section-head-text">
      <h2 id="ask-title">Další druhy automatů na dotaz</h2>
      <p>Tyto automaty zatím nemáme zveřejněné v katalogu. Napište nám, jaký automat hledáte, a zjistíme, co je k dispozici.</p>
    </div></div>
    ${askCards(c, onRequest)}
  </div>
</section>`}
${ctaBand(c)}`,
  };
}

export function category(c, cat) {
  const list = inCategory(c, cat);
  const n = real(list).length;
  return {
    title: cat.name,
    description: cat.metaDescription,
    scripts: list.length > 1 ? ['assets/js/catalogue.js'] : [],
    body: html`
<div class="page-head">
  <div class="wrap">
    ${breadcrumbs(c, [['automaty/', 'Nabídka automatů'], [`automaty/${cat.slug}/`, cat.name]])}
    <h1>${esc(cat.name)}</h1>
    <p class="lead">${esc(cat.intro)}</p>
    <p class="page-count">${n > 0 ? publishedLabel(n) : 'Na dotaz, bez zveřejněných automatů'}</p>
  </div>
</div>
<section class="section section-tight" aria-label="${list.length ? 'Automaty v kategorii' : 'Automaty na dotaz'}">
  <div class="wrap">
    ${list.length
      ? html`${placeholderNotice(list)}${listingNotice(list)}${catalogue(c, ordered(c, list, cat.slug), { headingLevel: 2, label: cat.name })}`
      : emptyCategory(c, cat, 'h2')}
  </div>
</section>
<div class="section section-alt"><div class="wrap">
  ${enquiryForm(c, {
    title: list.length ? 'Nenašli jste vhodný automat?' : `Poptat: ${cat.name.toLowerCase()}`,
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
  const sold = p.availability === 'Prodáno';
  const related = (p.related?.length
    ? real(p.related.map((id) => c.products.find((x) => x.id === id)).filter(Boolean))
    : ordered(c, real(c.products.filter((x) => x.category === p.category && x.id !== p.id)), p.category)
  ).slice(0, 3);
  const s = sale(p, nowOf(c));
  const maker = makerLine(p);
  const filled = filledSpecs(p);
  const missing = p.specs.filter((s) => !filled.includes(s)).map((s) => s.label);
  const ld = c.absUrl && !p.placeholder && {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: p.summary,
    ...(p.manufacturer && { brand: { '@type': 'Brand', name: p.manufacturer } }),
    ...(p.model && { model: p.model }),
    ...(p.images.some((i) => !i.illustrative) && { image: p.images.filter((i) => !i.illustrative).map((i) => mediaUrl({ url: c.absUrl }, i.src)) }),
    ...(p.price != null && !sold && {
      offers: { '@type': 'Offer', price: s ? s.final : p.price, priceCurrency: c.site.catalogue.currency, url: c.absUrl(productPath(p)), itemCondition: p.condition === 'pouzity' ? 'https://schema.org/UsedCondition' : 'https://schema.org/RefurbishedCondition' },
    }),
  };
  const facts = [
    ['Kategorie', html`<a href="${c.url(`automaty/${cat.slug}/`)}">${esc(cat.name)}</a>`],
    ['Stav', cond ? esc(cond.label) : ph('doplní se')],
    ['Typ automatu', p.type ? esc(p.type) : null],
    ['Rok výroby', p.year ? esc(p.year) : null],
    ['Dostupnost', p.availability ? esc(p.availability + (p.stock > 1 && p.availability === 'Skladem' ? ` (${p.stock} ks)` : '')) : null],
    ['Umístění', p.location ? esc(p.location) : null],
  ].filter(([, v]) => v);

  return {
    title: [p.name, maker].filter(Boolean).join(' – '),
    description: (p.placeholder ? 'Vzorová položka katalogu. ' : '') + `${p.name}${maker ? ` (${maker})` : ''}: ${p.summary} Technické parametry, stav a poptávka.`.slice(0, 300),
    scripts: p.images.length > 1 ? ['assets/js/gallery.js'] : [],
    ogImage: p.images[0]?.src,
    body: html`
<div class="wrap product-crumbs">
  ${breadcrumbs(c, [['automaty/', 'Nabídka automatů'], [`automaty/${cat.slug}/`, cat.name], [productPath(p), p.name]])}
</div>
<article class="product">
  <div class="wrap product-top">
    <div class="gallery" data-gallery>
      <figure class="gallery-main">${productImage(c, p, { eager: true, sizes: '(max-width: 900px) 100vw, 680px' })}</figure>
      ${p.images.length ? photoNote(p) : html`<p class="photo-note">Fotografie tohoto automatu bude doplněna.</p>`}
      ${p.video && html`<p class="product-video"><a class="text-link" href="${esc(p.video)}" rel="noopener nofollow" target="_blank">Video automatu<span class="visually-hidden"> (otevře se v novém okně)</span>${ARROW}</a></p>`}
      ${p.images.length > 1 && html`<ul class="gallery-thumbs" aria-label="Další fotografie">
        ${p.images.map((img, i) => html`<li><a href="${mediaUrl(c, img.src)}" data-full="${mediaUrl(c, img.src)}" data-alt="${esc(img.alt || p.name)}"${i === 0 ? ' aria-current="true"' : ''}>
          <img src="${mediaUrl(c, img.thumb || img.src)}" alt="${esc(`Fotografie ${i + 1}: ${img.alt || p.name}`)}" width="120" height="90" loading="lazy" decoding="async"></a></li>`)}
      </ul>`}
    </div>
    <div class="product-summary">
      <div class="card-badges">${sold ? '<span class="badge badge-sold">Prodáno</span>' : conditionBadge(c, p)}</div>
      ${maker && html`<p class="product-maker">${esc(maker)}</p>`}
      <h1>${esc(p.name)}</h1>
      ${sold && html`<div class="notice notice-sold" role="note">${INFO}<p><strong>Tento automat je už prodaný.</strong> ${related.length ? 'Podobné automaty najdete níže na této stránce, ' : ''}celou nabídku najdete v kategorii <a href="${c.url(`automaty/${cat.slug}/`)}">${esc(cat.name)}</a>.</p></div>`}
      <p class="product-lead">${esc(p.summary)}</p>
      <dl class="facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
      <div class="price-box">
        ${priceSlot(c, p, 'detail')}
        ${sold
          ? html`<p class="price-hint">Napište nám, jaký automat hledáte, a nabídneme vám podobný.</p>
        <a class="btn btn-primary btn-lg btn-block" href="${related.length ? '#related-title' : '#poptavka'}">${related.length ? 'Zobrazit podobné automaty' : 'Poptat podobný automat'}</a>`
          : html`<p class="price-hint">Stav, cenu a dostupnost konkrétního kusu vám potvrdíme v odpovědi na poptávku.</p>
        <a class="btn btn-primary btn-lg btn-block" href="#poptavka">Poptat tento automat</a>`}
        ${(c.site.contact.phone || c.site.contact.email) && html`<div class="price-direct">${c.site.contact.phone && phoneLink(c)}${c.site.contact.email && emailLink(c)}</div>`}
      </div>
      <ul class="product-jump" aria-label="Na této stránce">
        <li><a href="#parametry">Parametry</a></li>
        <li><a href="#stav">Stav</a></li>
        <li><a href="#poptavka">Poptávka</a></li>
      </ul>
    </div>
  </div>

  <div class="wrap product-details">
    <section class="detail-box detail-box-wide" aria-labelledby="popis">
      <h2 id="popis">Popis</h2>
      ${p.description.map((t) => html`<p>${esc(t)}</p>`)}
    </section>
    <section class="detail-box" aria-labelledby="parametry">
      <h2 id="parametry">Technické parametry</h2>
      ${(p.manufacturer || p.model || filled.length > 0) && html`<table class="spec-table">
        <caption class="visually-hidden">Technické parametry: ${esc(p.name)}</caption>
        <tbody>
          ${p.manufacturer && html`<tr><th scope="row">Výrobce</th><td>${esc(p.manufacturer)}</td></tr>`}
          ${p.model && html`<tr><th scope="row">Model</th><td>${esc(p.model)}</td></tr>`}
          ${filled.map((s) => html`<tr><th scope="row">${esc(s.label)}</th><td>${esc(s.value)}</td></tr>`)}
        </tbody>
      </table>`}
      ${missing.length > 0 && html`<p class="spec-missing"><strong>${filled.length ? 'Zatím neuvedeno' : 'Parametry zatím nejsou zveřejněné'}:</strong> ${esc(missing.join(', ').toLowerCase())}. Pokud je potřebujete znát, uveďte to v poptávce.</p>`}
    </section>
    <section class="detail-box" aria-labelledby="stav">
      <h2 id="stav">Stav a repase</h2>
      ${cond
        ? html`<p><strong>${esc(cond.label)}.</strong> ${cond.verified ? esc(cond.description) : ph(cond.description)}</p>`
        : html`<p>${ph('Stav automatu doplníme.')}</p>`}
      ${p.conditionDetails ? html`<p>${esc(p.conditionDetails)}</p>` : html`<p>${ph('Doplňte, co bylo na tomto kusu zkontrolováno, opraveno nebo vyměněno.')}</p>`}
      ${p.defects && html`<h3>Známé vady a opotřebení</h3><p>${esc(p.defects)}</p>`}
      <p><a class="text-link" href="${c.url('repasovane-automaty/')}">Jak automaty připravujeme ${ARROW}</a></p>
    </section>
    ${(p.features.length > 0 || p.paymentSystems.length > 0) && html`<section class="detail-box" aria-labelledby="vybaveni">
      <h2 id="vybaveni">Vybavení a platební systémy</h2>
      ${p.features.length > 0 && html`<h3>Vybavení</h3><ul class="ticks">${p.features.map((f) => html`<li>${esc(f)}</li>`)}</ul>`}
      ${p.paymentSystems.length > 0 && html`<h3>Kompatibilní platební systémy</h3><ul class="ticks">${p.paymentSystems.map((f) => html`<li>${esc(f)}</li>`)}</ul>`}
    </section>`}
    ${p.warranty && html`<section class="detail-box" aria-labelledby="zaruka"><h2 id="zaruka">Záruka</h2><p>${esc(p.warranty)}</p></section>`}
    ${p.delivery && html`<section class="detail-box" aria-labelledby="doprava"><h2 id="doprava">Doprava a předání</h2><p>${esc(p.delivery)}</p></section>`}
  </div>

  <div class="section section-alt"><div class="wrap">
    ${enquiryForm(c, {
      title: sold ? 'Hledáte podobný automat?' : 'Poptat tento automat',
      intro: 'Napište nám, co vás zajímá, nebo si vyžádejte cenovou nabídku. Ozveme se vám.',
      kind: 'automat',
      product: p,
      submit: 'Poslat poptávku',
      messagePlaceholder: 'Dobrý den, mám zájem o tento automat. Prosím o nabídku…',
    })}
  </div></div>

  ${related.length > 0 && html`<section class="section" aria-labelledby="related-title">
    <div class="wrap">
      <div class="section-head"><h2 id="related-title">${sold ? 'Podobné automaty v nabídce' : 'Další automaty v nabídce'}</h2>
        <a class="text-link" href="${c.url(`automaty/${cat.slug}/`)}">${esc(cat.name)} ${ARROW}</a></div>
      ${productGrid(c, related, { headingLevel: 3, label: 'Další automaty v nabídce' })}
    </div>
  </section>`}
</article>
${ld && html`<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`}`,
  };
}

export function refurbished(c) {
  const list = ordered(c, c.products.filter((p) => isListed(p) && (p.condition === 'repasovany' || p.condition === 'renovovany')));
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
    ${serviceSubnav(c)}
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
      : html`<div class="empty-state is-plain">
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
    ${serviceSubnav(c)}
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
    ${serviceSubnav(c)}
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
      <a class="btn btn-primary btn-block" href="${c.url('kontakt/')}">Kontakt</a>
    </aside>
  </div>
</section>
${ctaBand(c, { title: 'Chcete se na něco zeptat?', text: 'Napište nám nebo pošlete poptávku. Rádi poradíme s výběrem automatu, náhradními díly i servisem.' })}`,
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
