// Prices, discounts, visibility and ordering of the catalogue. Pure functions, shared by the build,
// the page templates, the local admin prototype and the tests (scripts/test/catalog.test.mjs).
//
// A machine keeps its standard price (`price`, CZK excluding VAT, or null = "Cena na dotaz") and,
// separately, an optional `discount`:
//   { enabled, method: 'percent' | 'amount' | 'price', value, start: ISO | null, end: ISO | null }
// start null = active from when it was switched on; end null = no time limit. The standard price is
// never overwritten: the final price is always computed from it.

export const TZ = 'Europe/Prague';

/* ---------- money ---------- */

// "45 000", "45000", "45 000 Kč", "45 000,-" -> 45000. Empty, decimals, letters or negatives -> NaN.
export function parseCzk(text) {
  const t = String(text ?? '').replace(/[\s  ]/g, '').replace(/(kč|czk|,-|\.-)$/i, '');
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

const roundCzk = (n) => Math.round(n);

// The discounted price for a standard price, or NaN when the discount cannot apply.
export function discountedPrice(price, d) {
  if (price == null || !d || !Number.isFinite(d.value)) return NaN;
  let final;
  if (d.method === 'percent') {
    if (!(d.value > 0 && d.value < 100)) return NaN;
    final = roundCzk(price * (1 - d.value / 100));
  } else if (d.method === 'amount') final = price - d.value;
  else if (d.method === 'price') final = d.value;
  else return NaN;
  return final > 0 && final < price ? final : NaN;
}

// Why a discount is not valid for this price, in Czech (or '' when it is valid).
export function discountProblem(price, d) {
  if (price == null) return 'Sleva potřebuje uvedenou běžnou cenu. U položky „Cena na dotaz“ ji nelze použít.';
  if (!Number.isFinite(d?.value)) return d?.method === 'percent' ? 'Zadejte procento slevy.' : 'Zadejte částku.';
  if (d.method === 'percent' && !(d.value > 0 && d.value < 100)) return 'Procento slevy musí být větší než 0 a menší než 100.';
  const final = d.method === 'percent' ? roundCzk(price * (1 - d.value / 100)) : d.method === 'amount' ? price - d.value : d.value;
  if (!(final > 0)) return 'Cena po slevě musí být vyšší než 0 Kč.';
  if (!(final < price)) return 'Cena po slevě musí být nižší než běžná cena.';
  if (d.start && d.end && Date.parse(d.end) <= Date.parse(d.start)) return 'Konec slevy musí být později než začátek.';
  return '';
}

/* ---------- discount state over time ---------- */

// 'none' | 'off' | 'invalid' | 'scheduled' | 'active' | 'ended'
export function discountState(p, now = Date.now()) {
  const d = p.discount;
  if (!d) return 'none';
  if (!d.enabled) return 'off';
  if (Number.isNaN(discountedPrice(p.price, d))) return 'invalid';
  if (d.start && now < Date.parse(d.start)) return 'scheduled';
  if (d.end && now >= Date.parse(d.end)) return 'ended';
  return 'active';
}

export const DISCOUNT_LABEL = { none: 'Bez slevy', off: 'Vypnutá', invalid: 'Neplatná', scheduled: 'Naplánovaná', active: 'Aktivní', ended: 'Ukončená' };

// What the customer sees now: null when there is no running discount.
export function sale(p, now = Date.now()) {
  if (discountState(p, now) !== 'active') return null;
  const final = discountedPrice(p.price, p.discount);
  return {
    standard: p.price,
    final,
    saved: p.price - final,
    percent: p.discount.method === 'percent' ? p.discount.value : null,
    end: p.discount.end || null,
  };
}

// The price that counts right now (cards, details, sorting, filters). null = "Cena na dotaz".
export const effectivePrice = (p, now = Date.now()) => sale(p, now)?.final ?? p.price ?? null;

// The next moment any of these machines changes its price (a discount starts or ends), or null.
export function nextBoundary(products, now = Date.now()) {
  let next = null;
  for (const p of products) {
    const d = p.discount;
    if (!d?.enabled || Number.isNaN(discountedPrice(p.price, d))) continue;
    for (const t of [d.start, d.end]) {
      const ms = t ? Date.parse(t) : NaN;
      if (ms > now && (next == null || ms < next)) next = ms;
    }
  }
  return next;
}

/* ---------- visibility ---------- */

// status: 'draft' (Koncept) | 'published' (Zveřejněno) | 'hidden' (Skryto). Data without a status
// is the published catalogue. deletedAt marks the trash.
export const statusOf = (p) => p.status || 'published';
// Detail page reachable by customers.
export const isVisible = (p) => statusOf(p) === 'published' && !p.deletedAt;
// Shown in listings, counts and searches: visible and not sold.
export const isListed = (p) => isVisible(p) && p.availability !== 'Prodáno';

/* ---------- Prague time ---------- */

const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});
function pragueParts(ms) {
  const o = {};
  for (const { type, value } of PARTS.formatToParts(new Date(ms))) o[type] = value;
  return o;
}
// Offset of Prague from UTC at that instant, in ms (+1 h in winter, +2 h in summer).
function offsetAt(ms) {
  const o = pragueParts(ms);
  return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second) - Math.floor(ms / 1000) * 1000;
}

// A Prague wall-clock date and time ("2026-11-10", "08:00") -> UTC ISO string.
// { error: 'invalid' } for malformed input, { error: 'gap' } for a time skipped by the switch to
// summer time. In the repeated autumn hour the earlier (summer-time) moment is used.
export function pragueToUtc(date, time) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  const t = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (!m || !t) return { error: 'invalid' };
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +t[1], +t[2]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return { error: 'invalid' };
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  if (new Date(wall).getUTCDate() !== d) return { error: 'invalid' };
  // try both offsets around the instant; keep those that read back as the same wall time
  const hits = [...new Set([offsetAt(wall - 3 * 3600e3), offsetAt(wall + 3 * 3600e3)])]
    .map((off) => wall - off)
    .filter((ms) => { const o = pragueParts(ms); return +o.year === y && +o.month === mo && +o.day === d && +o.hour === h && +o.minute === mi; })
    .sort((a, b) => a - b);
  if (!hits.length) return { error: 'gap' };
  return { iso: new Date(hits[0]).toISOString() };
}

// UTC ISO -> { date: 'YYYY-MM-DD', time: 'HH:MM' } in Prague.
export function utcToPrague(iso) {
  const o = pragueParts(Date.parse(iso));
  return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}` };
}

// "10. 11. 2026 v 8:00"
export function formatPrague(iso, { time = true } = {}) {
  const o = pragueParts(Date.parse(iso));
  const day = `${+o.day}. ${+o.month}. ${o.year}`;
  return time ? `${day} v ${+o.hour}:${o.minute}` : day;
}

// "Sleva začne 10. 11. 2026 v 8:00 a skončí 17. 11. 2026 ve 23:59."
export function scheduleSentence(d, now = Date.now()) {
  if (!d) return '';
  // "ve 2:00", "ve 14:30", "ve 23:59" but "v 8:00", "v 10:00"
  const v = (iso) => { const s = formatPrague(iso); return / v (2|3|4|12|13|14|2\d):/.test(s) ? s.replace(/ v (\d+:)/, ' ve $1') : s; };
  const started = !d.start || Date.parse(d.start) <= now;
  const from = d.start ? `${started ? 'Sleva platí od' : 'Sleva začne'} ${v(d.start)}` : 'Sleva platí od uložení';
  const to = d.end ? ` a ${Date.parse(d.end) <= now ? 'skončila' : 'skončí'} ${v(d.end)}` : ', bez časového omezení';
  return `${from}${to}.`;
}

/* ---------- ordering ---------- */

const byNewest = (a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '');
// Without a saved order, listings lead with photographed machines, newest first.
export const byShowcase = (a, b) => ((b.images?.length || 0) > 0) - ((a.images?.length || 0) > 0) || byNewest(a, b);

// The "Doporučené" order: featured machines first, then the order saved in the admin (`order`,
// a list of ids), then anything not in it in the showcase order. Returns a new array.
export function recommended(list, order = []) {
  const pos = new Map((order || []).map((id, i) => [id, i]));
  const rank = (p) => (pos.has(p.id) ? pos.get(p.id) : Infinity);
  return [...list].sort((a, b) => (Boolean(b.featured) - Boolean(a.featured)) || (rank(a) - rank(b)) || (rank(a) === Infinity ? byShowcase(a, b) : 0));
}

export const SORTS = [
  ['doporucene', 'Doporučené'],
  ['cena-vzestupne', 'Od nejlevnějšího'],
  ['cena-sestupne', 'Od nejdražšího'],
  ['nejnovejsi', 'Nejnovější'],
  ['nazev', 'Název A–Z'],
];

// Customer sorting of a list that is already in the recommended order. Prices are the ones that
// apply now (discounts included); machines with "Cena na dotaz" go last in both price directions.
// Ties keep the recommended order, so the result is stable. assets/js/catalogue.js does the same
// on the cards in the page.
export function sortProducts(list, by, now = Date.now()) {
  const collator = new Intl.Collator('cs');
  const rows = list.map((p, i) => ({ p, i, price: effectivePrice(p, now) }));
  rows.sort((a, b) => {
    let d = 0;
    if (by === 'cena-vzestupne' || by === 'cena-sestupne') {
      if (a.price == null || b.price == null) d = (a.price == null) - (b.price == null);
      else d = by === 'cena-vzestupne' ? a.price - b.price : b.price - a.price;
    } else if (by === 'nejnovejsi') d = (b.p.dateAdded || '').localeCompare(a.p.dateAdded || '');
    else if (by === 'nazev') d = collator.compare(a.p.name, b.p.name);
    return d || a.i - b.i;
  });
  return rows.map((r) => r.p);
}
