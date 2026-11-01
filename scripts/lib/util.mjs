// Small helpers shared by the templates.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// Tagged template that drops null/false/undefined and joins arrays, so templates can use
// `${cond && html`...`}` and `${list.map(...)}` without extra plumbing. Values are NOT escaped:
// wrap data in esc() at the point of use.
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += flat(values[i]);
  });
  return out;
}
const flat = (v) => (v == null || v === false ? '' : Array.isArray(v) ? v.map(flat).join('') : String(v));

// A visibly marked gap in the content, for facts the business still has to supply.
export const ph = (text) => `<span class="ph">${esc(text)}</span>`;

// Relative link from the page being rendered to a site path ("" = home, "kontakt/", "assets/x.css").
// Relative links keep the build working on Netlify, in a subfolder and in local previews.
// Pages served at arbitrary depths (404) use root-absolute links instead.
// explicitIndex spells out index.html for hosts without directory indexes (static previews).
export function linker(pagePath, absolute, explicitIndex = false) {
  const depth = pagePath.split('/').filter(Boolean).length;
  const up = '../'.repeat(depth);
  return (target = '') => {
    if (explicitIndex && (target === '' || target.endsWith('/'))) target += 'index.html';
    return absolute ? '/' + target : up + target || './';
  };
}

export const czk = (price, currency, inclVat) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency, maximumFractionDigits: 0 }).format(price) +
  (inclVat ? ' vč. DPH' : ' bez DPH');

// Czech plural forms: 1 automat, 2–4 automaty, 5+ automatů.
export const plural = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
