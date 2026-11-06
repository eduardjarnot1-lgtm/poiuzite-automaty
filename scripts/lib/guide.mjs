// "Pomůžeme vám vybrat automat": the questions, which of them apply, and how the answers are
// read against the catalogue. Pure functions, shared by the guide page in the browser (the build
// copies this file to assets/js/lib/guide.js) and the tests (scripts/test/guide.test.mjs).
//
// The rules are plain on purpose:
// - Only machines customers can see count (published, not deleted, not sold); reserved and
//   to-order machines are shown with their status.
// - What the machine should offer decides the category. The place of use and the number of
//   people never prove suitability and never stand in for capacity; they only go into the summary.
// - A requirement is "confirmed" only by the machine's own record, "requested" while the record
//   says nothing, and a "conflict" when the record contradicts it (price over the budget, a
//   recorded payment system without the requested method). Missing data is never a match.
// - Machines are compared only when their records allow it (a price or a payment record). With
//   today's catalogue they don't, so the category is the result and machines appear as examples
//   in the catalogue's own order, never as a ranked shortlist.
import { effectivePrice, isListed } from './catalog.mjs';

/* ---------- options ---------- */

export const OFFER = [
  ['hot', 'Kávu a teplé nápoje'],
  ['cold', 'Chlazené nápoje'],
  ['snack', 'Snacky a balené potraviny'],
  ['combo', 'Snacky i chlazené nápoje'],
  ['unsure', 'Zatím nevím'],
];
export const COFFEE = [
  ['instant', 'Instantní káva', 'Nápoje se připravují z rozpustných surovin, například z instantní kávy, mléka nebo čokolády.'],
  ['beans', 'Zrnková káva', 'Káva se připravuje z čerstvě namletých zrn.'],
  ['help', 'Potřebuji poradit', 'Rozdíly vám vysvětlíme v nabídce.'],
];
export const PLACE = [
  ['office', 'Kancelář'],
  ['production', 'Výroba nebo sklad'],
  ['shop', 'Obchod nebo jiná provozovna'],
  ['school', 'Škola nebo veřejný prostor'],
  ['lodging', 'Ubytovací zařízení'],
  ['other', 'Jiné místo'],
  ['unsure', 'Zatím nevím'],
];
export const PEOPLE = [['p1', 'Do 20 lidí'], ['p2', '20–50 lidí'], ['p3', '50–150 lidí'], ['p4', 'Více než 150 lidí'], ['unknown', 'Nevím']];
// Broad daily ranges: hot drinks are counted as servings, the rest as purchases.
export const USAGE = {
  drinks: [['u1', 'Do 30 nápojů denně'], ['u2', '30–80 nápojů denně'], ['u3', '80–150 nápojů denně'], ['u4', 'Více než 150 nápojů denně'], ['unknown', 'Nevím']],
  items: [['u1', 'Do 20 nákupů denně'], ['u2', '20–50 nákupů denně'], ['u3', '50–100 nákupů denně'], ['u4', 'Více než 100 nákupů denně'], ['unknown', 'Nevím']],
  mixed: [['u1', 'Do 30 nápojů nebo nákupů denně'], ['u2', '30–80 denně'], ['u3', '80–150 denně'], ['u4', 'Více než 150 denně'], ['unknown', 'Nevím']],
};
export const MODE = [['free', 'Zdarma pro zaměstnance nebo návštěvníky'], ['paid', 'Placený prodej'], ['unsure', 'Zatím nevím']];
export const PAYMENT = [['coins', 'Mince'], ['card', 'Platební karta'], ['both', 'Mince i karta'], ['help', 'Potřebuji poradit']];
export const BUDGET = [['max', 'Mám představu o maximální částce'], ['none', 'Nemám zatím stanovený rozpočet']];
export const PLACEMENT = [['indoor', 'Uvnitř budovy'], ['outdoor', 'Venku nebo pod přístřeškem'], ['unsure', 'Nevím']];
export const WATER = [['yes', 'Ano, přípojka vody je k dispozici'], ['no', 'Ne, přípojka vody není'], ['unsure', 'Nevím']];
export const WHEN = [['asap', 'Co nejdříve'], ['m1', 'Do měsíce'], ['m3', 'Do 3 měsíců'], ['later', 'Později'], ['unsure', 'Zatím nevím']];

export const CATEGORY_FOR = {
  instant: 'instantni-kavove-automaty',
  beans: 'automaty-na-zrnkovou-kavu',
  cold: 'napojove-automaty',
  snack: 'snackove-automaty',
  combo: 'kombinovane-automaty',
};

export const label = (list, v) => list.find(([k]) => k === v)?.[1] ?? '';
export const usageScale = (offer) => (offer === 'hot' ? 'drinks' : ['cold', 'snack', 'combo'].includes(offer) ? 'items' : 'mixed');

/* ---------- steps ---------- */

export const STEPS = [
  { id: 'nabidka', title: 'Co má automat nabízet?' },
  { id: 'misto', title: 'Kde bude automat sloužit?' },
  { id: 'vydej', title: 'Jak má výdej fungovat?' },
  { id: 'rozpocet', title: 'Jaký máte přibližný rozpočet na pořízení automatu?' },
  { id: 'doplneni', title: 'Chcete doplnit něco důležitého?' },
];
// Answers the steps need before "Pokračovat". Everything else is optional.
export const REQUIRED = { nabidka: 'offer', misto: 'place', vydej: 'mode' };

export const applies = {
  coffee: (a) => a.offer === 'hot',
  placeOther: (a) => a.place === 'other',
  payment: (a) => a.mode === 'paid',
  budgetMax: (a) => a.budget === 'max',
  water: (a) => a.offer === 'hot' || a.offer === 'unsure',   // only where a drinks machine may need it
};

// A whole number of crowns from what the visitor typed ("80 000", "80000 Kč"), or null.
export function parseBudget(text) {
  if (text == null) return null;
  const digits = String(text).replace(/[\s .]|kč/gi, '');
  if (!/^\d{1,9}$/.test(digits)) return null;
  const n = Number(digits);
  return n > 0 ? n : null;
}

// Validation of one step; returns { field: message } for anything that stops "Pokračovat".
export function stepErrors(stepId, a) {
  const e = {};
  if (REQUIRED[stepId] && !a[REQUIRED[stepId]]) e[REQUIRED[stepId]] = 'Vyberte prosím jednu možnost. Pokud si nejste jistí, zvolte „Zatím nevím“.';
  if (stepId === 'rozpocet' && a.budget === 'max' && parseBudget(a.budgetMax) == null) e.budgetMax = 'Zadejte částku v korunách, například 80 000. Nebo zvolte „Nemám zatím stanovený rozpočet“.';
  return e;
}

// Removes answers that no longer apply after an earlier answer changed (also a usage range on
// the wrong scale, servings vs purchases), and any selected machine outside the new category.
export function clean(answers, products = null) {
  const a = { ...answers };
  if (!applies.coffee(a)) delete a.coffee;
  if (!applies.placeOther(a)) delete a.placeOther;
  if (a.usage && a.usageScale && a.usageScale !== usageScale(a.offer)) delete a.usage;
  if (a.usage) a.usageScale = usageScale(a.offer); else delete a.usageScale;
  if (!applies.payment(a)) delete a.payment;
  if (!applies.budgetMax(a)) delete a.budgetMax;
  if (!applies.water(a)) delete a.water;
  if (products && a.selected?.length) {
    const cats = targetCategories(a);
    a.selected = a.selected.filter((id) => products.some((p) => p.id === id && isListed(p) && cats.includes(p.category)));
  }
  if (a.selected && !a.selected.length) delete a.selected;
  return a;
}

/* ---------- what a machine's record says ---------- */

const specOf = (p, re) => (p.specs || []).find((s) => re.test(s.label) && s.value != null && String(s.value).trim() !== '')?.value ?? null;
export const recorded = (p) => ({ dimensions: specOf(p, /^rozměry/i), water: specOf(p, /připojení vody/i), capacity: specOf(p, /^kapacita/i) });
export function paymentsOf(p) {
  const items = [...(p.paymentSystems || []), specOf(p, /platební systém/i)].filter((x) => x && String(x).trim());
  if (!items.length) return null;
  const text = items.join(', ');
  return { text, coins: /minc|coin/i.test(text), card: /kart|terminál|terminal|bezkontakt|contactless|card|nfc/i.test(text) };
}

/* ---------- categories ---------- */

export function targetCategories(a) {
  if (a.offer === 'hot') return a.coffee === 'beans' ? [CATEGORY_FOR.beans] : a.coffee === 'instant' ? [CATEGORY_FOR.instant] : [CATEGORY_FOR.instant, CATEGORY_FOR.beans];
  return CATEGORY_FOR[a.offer] ? [CATEGORY_FOR[a.offer]] : [];
}
export const budgetMax = (a) => (a.budget === 'max' ? parseBudget(a.budgetMax) : null);
export const requestedPayments = (a) => (a.mode !== 'paid' ? [] : a.payment === 'coins' ? ['coins'] : a.payment === 'card' ? ['card'] : a.payment === 'both' ? ['coins', 'card'] : []);
const PAY_WORD = { coins: 'platba mincemi', card: 'platba kartou' };

// One machine against the answers.
export function assess(p, a, now = Date.now()) {
  const confirmed = [];
  const requested = [];
  const unknown = [];
  const conflicts = [];
  const price = effectivePrice(p, now);
  const max = budgetMax(a);
  if (price == null) unknown.push(max != null ? 'Cena je na dotaz, proto ji zatím nejde porovnat s vaším rozpočtem.' : 'Cena je na dotaz.');
  else if (max != null && price > max) conflicts.push('Aktuální cena je vyšší než váš rozpočet.');
  else if (max != null) confirmed.push('Aktuální cena je v rámci vašeho rozpočtu.');

  const need = requestedPayments(a);
  const pay = paymentsOf(p);
  if (need.length) {
    if (!pay) requested.push(`Požadujete: ${need.map((k) => PAY_WORD[k]).join(' a ')}. U tohoto automatu to zatím není ověřené.`);
    else {
      const missing = need.filter((k) => !pay[k]);
      if (missing.length) conflicts.push(`Podle údajů automatu: ${pay.text}. Chybí ${missing.map((k) => PAY_WORD[k]).join(' a ')}.`);
      else confirmed.push(`Platební systém podle údajů automatu: ${pay.text}.`);
    }
  }
  if (a.mode === 'free') requested.push('Výdej zdarma: nastavení ověříme u konkrétního automatu.');

  const r = recorded(p);
  unknown.push(r.capacity ? `Kapacita podle údajů automatu: ${r.capacity}. Porovnáme ji s vaším provozem.` : 'Kapacita automatu zatím není uvedená.');
  unknown.push(r.dimensions ? `Rozměry podle údajů automatu: ${r.dimensions}.` : 'Rozměry automatu zatím nejsou uvedené.');
  if (a.water === 'yes' || a.water === 'no') unknown.push(r.water ? `Připojení vody podle údajů automatu: ${r.water}.` : 'Zda automat potřebuje přípojku vody, zatím není uvedeno.');
  if (a.placement === 'outdoor') requested.push('Umístění venku: musí ho snést konkrétní automat, ověříme to.');
  if (!p.availability) unknown.push('Dostupnost a stav konkrétního kusu potvrdíme.');
  return { price, confirmed, requested, unknown, conflicts };
}

// The result for a set of answers. `products` and `categories` come from the shared catalogue.
export function evaluate({ products, categories, order = [] }, answers, now = Date.now()) {
  const a = clean(answers, products);
  const listed = products.filter((p) => isListed(p) && !p.placeholder);
  const pos = new Map((order || []).map((id, i) => [id, i]));
  const inOrder = (list) => [...list].sort((x, y) => (pos.has(x.id) ? pos.get(x.id) : 1e6 + listed.indexOf(x)) - (pos.has(y.id) ? pos.get(y.id) : 1e6 + listed.indexOf(y)));
  const info = (slug) => {
    const cat = categories.find((c) => c.slug === slug);
    return cat && { slug, name: cat.name, short: cat.short, published: listed.filter((p) => p.category === slug).length };
  };

  const targets = targetCategories(a);
  const branch = !targets.length ? 'unsure' : targets.some((s) => info(s)?.published) ? 'published' : 'onRequest';
  const cats = (targets.length ? targets : categories.map((c) => c.slug)).map(info).filter(Boolean);
  const pool = inOrder(listed.filter((p) => targets.includes(p.category)));
  const assessed = pool.map((p) => ({ product: p, ...assess(p, a, now) }));
  const comparable = pool.some((p) => effectivePrice(p, now) != null || paymentsOf(p));
  const fits = assessed.filter((x) => !x.conflicts.length);

  let shortlist = [];
  let examples = [];
  if (comparable) {
    // a real comparison: known prices first, then more confirmed facts; the catalogue order breaks ties
    shortlist = [...fits].sort((x, y) => (x.price == null) - (y.price == null) || y.confirmed.length - x.confirmed.length).slice(0, 3);
  } else {
    examples = fits.slice(0, 3);
  }
  const max = budgetMax(a);
  return {
    answers: a,
    branch,
    targets,
    categories: cats,
    comparable,
    shortlist,
    groups: max != null
      ? [{ id: 'budget', title: 'V rámci rozpočtu', items: shortlist.filter((x) => x.price != null) }, { id: 'price', title: 'Cena na dotaz – k ověření', items: shortlist.filter((x) => x.price == null) }].filter((g) => g.items.length)
      : shortlist.length ? [{ id: 'all', title: '', items: shortlist }] : [],
    examples,
    total: fits.length,
    setAside: assessed.filter((x) => x.conflicts.length).map((x) => ({ product: x.product, reasons: x.conflicts })),
    clarify: clarifications(a),
  };
}

// What still needs a conversation, in the visitor's words.
export function clarifications(a) {
  const out = [];
  if (!a.offer || a.offer === 'unsure') out.push('jaký druh automatu dává smysl (káva, chlazené nápoje, snacky nebo kombinace)');
  if (a.offer === 'hot' && (!a.coffee || a.coffee === 'help')) out.push('zda se víc hodí instantní, nebo zrnková káva');
  if (!a.place || a.place === 'unsure') out.push('kde bude automat stát');
  if (a.mode === 'unsure') out.push('zda bude výdej zdarma, nebo placený');
  if (a.mode === 'paid' && (!a.payment || a.payment === 'help')) out.push('jaké placení zvolit');
  if (!a.budget) out.push('přibližný rozpočet');
  out.push('kapacita, rozměry, technické připojení, stav, cena a dostupnost konkrétního automatu');
  return out;
}

/* ---------- the summary ---------- */

const fmtCzk = (n) => `${new Intl.NumberFormat('cs-CZ').format(n)} Kč bez DPH`;
export function answerLines(answers) {
  const a = clean(answers);
  const lines = [];
  if (a.offer) lines.push(['nabidka', 'Co má automat nabízet', label(OFFER, a.offer) + (a.coffee ? ` – ${label(COFFEE, a.coffee).toLowerCase()}` : '')]);
  if (a.place) lines.push(['misto', 'Místo', label(PLACE, a.place) + (a.placeOther ? `: ${a.placeOther}` : '')]);
  if (a.people) lines.push(['misto', 'Počet lidí', label(PEOPLE, a.people)]);
  if (a.usage) lines.push(['misto', 'Odhad využití', label(USAGE[usageScale(a.offer)], a.usage)]);
  if (a.mode) lines.push(['vydej', 'Výdej', label(MODE, a.mode)]);
  if (a.payment) lines.push(['vydej', 'Požadované placení', label(PAYMENT, a.payment)]);
  if (a.budget === 'max' && budgetMax(a) != null) lines.push(['rozpocet', 'Rozpočet', `nejvýše ${fmtCzk(budgetMax(a))}`]);
  if (a.budget === 'none') lines.push(['rozpocet', 'Rozpočet', 'zatím nestanovený']);
  if (a.placement) lines.push(['doplneni', 'Umístění', label(PLACEMENT, a.placement)]);
  if (a.space) lines.push(['doplneni', 'Prostor pro automat', a.space]);
  if (a.water) lines.push(['doplneni', 'Přípojka vody', label(WATER, a.water)]);
  if (a.when) lines.push(['doplneni', 'Kdy automat potřebujete', label(WHEN, a.when)]);
  if (a.region) lines.push(['doplneni', 'Oblast dodání', a.region]);
  if (a.other) lines.push(['doplneni', 'Další požadavky', a.other]);
  return lines;
}

// Plain text for the enquiry message, the copy button and the download. Machines appear only
// when the visitor ticked them.
export function summaryText(answers, result, { products = [] } = {}) {
  const a = clean(answers, products.length ? products : null);
  const out = ['Požadavky z průvodce výběrem automatu', ''];
  for (const [, k, v] of answerLines(a)) out.push(`${k}: ${v}`);
  if (result?.categories?.length && result.targets.length) out.push('', `Kategorie: ${result.categories.map((c) => `${c.name}${c.published ? '' : ' (na dotaz)'}`).join(', ')}`);
  const chosen = (a.selected || []).map((id) => products.find((p) => p.id === id)).filter(Boolean);
  if (chosen.length) out.push(`Vybrané automaty: ${chosen.map((p) => `${p.name} (${p.id})`).join(', ')}`);
  if (result?.clarify?.length) out.push('', 'Potřebuji poradit nebo ověřit:', ...result.clarify.map((x) => `- ${x}`));
  return out.join('\n');
}
