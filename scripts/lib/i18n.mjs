// Language versions (cs = source and default, de, sk). No dependencies; runs in Node (build) and in
// the browser (prototype, page scripts via the classic bundle assets/js/i18n/<lang>.js).
//
// How it works: the templates stay in Czech. After a page is rendered, translateHtml() walks the
// HTML, cuts it into block-level text segments (text plus inline tags such as <a>, <strong>) and
// looks each one up in the dictionary for the language (i18n/<lang>/*.json), keyed by the Czech
// source. Inline tags become numbered placeholders (<1>…</1>, <2/>) and numbers become {0}, {1}…,
// so the translation can reorder them but never loses or invents a link, a tag or a figure:
//   "Zobrazeno 3 z 5 automatů"            -> key "Zobrazeno {0} z {1} automatů"
//   'Více v <a href="…">zásadách</a>.'    -> key "Více v <1>zásadách</1>."
// Data that must not be translated (product names, texts a translator already provided) is wrapped
// in keep() by the templates; elements with a lang attribute are skipped as a whole, which is how
// a Czech fallback (lang="cs") stays Czech. Missing entries keep the Czech text, wrapped in
// <span lang="cs"> where that is safe, and are reported by the build and the checks.

export const LANGS = ['cs', 'de', 'sk'];
export const DEFAULT_LANG = 'cs';
export const LANG_NAMES = { cs: 'Čeština', de: 'Deutsch', sk: 'Slovenčina' };
export const OG_LOCALE = { cs: 'cs_CZ', de: 'de_DE', sk: 'sk_SK' };
// Paths that exist only once, in Czech, for every language (files, the internal admin prototype).
export const SHARED_PATHS = ['assets/', 'sprava-nabidky/'];

const KEEP_OPEN = '\u2063';
const KEEP_CLOSE = '\u2064';
let current = { lang: DEFAULT_LANG, dict: null, report: null };

// Sets the language for keep(), tx(), productText() and the page layout (one page at a time).
// report(key) receives every text that has no translation.
export function setLang(lang, dict, report) {
  current = { lang: LANGS.includes(lang) ? lang : DEFAULT_LANG, dict: dict || null, report: report || null };
}
export const getLang = () => current.lang;
export const currentDict = () => current.dict;
export const currentReport = () => current.report;

// Marks a value that must reach the page as it is (a product name, a figure, an already
// translated text). The markers are removed by translateHtml(); in Czech nothing is added.
export const keep = (s) => (current.lang === DEFAULT_LANG || s == null || s === '' ? s : KEEP_OPEN + s + KEEP_CLOSE);
// Translates a plain string now (current language) and keeps the result as it is.
export const tt = (s) => (current.lang === DEFAULT_LANG || !current.dict ? s : translateText(s, current.dict));
export const tx = (s) => keep(tt(s));
export const stripMarks = (s) => String(s).replace(/[\u2063\u2064]/g, '');

// Language prefix of a site path: "" for Czech, "de/" for German.
export const langPrefix = (lang) => (lang && lang !== DEFAULT_LANG ? `${lang}/` : '');
export const isShared = (path) => SHARED_PATHS.some((p) => path.startsWith(p));
// "de/automaty/x/" -> { lang: 'de', path: 'automaty/x/' }
export function splitLang(path) {
  const m = /^([a-z]{2})\/(.*)$/.exec(path || '');
  return m && LANGS.includes(m[1]) && m[1] !== DEFAULT_LANG ? { lang: m[1], path: m[2] } : { lang: DEFAULT_LANG, path: path || '' };
}

/* ---------- product texts ---------- */

// Stable hash of the Czech texts a product translation was made from (FNV-1a, 32 bit).
export function sourceHash(p) {
  const s = JSON.stringify([p.summary || '', p.description || []]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// State of a product's translation into lang: 'source' (Czech page), 'current', 'stale' (the
// Czech text changed after it was translated) or 'missing'.
export function translationState(p, lang = current.lang) {
  if (lang === DEFAULT_LANG) return 'source';
  const t = p.i18n?.[lang];
  if (!t || !t.summary) return 'missing';
  return t.sourceHash === sourceHash(p) ? 'current' : 'stale';
}

// The product's summary / description paragraphs for the current language.
// { text | paras, lang, fallback } – fallback is true when the Czech text is shown instead.
export function productText(p, field) {
  const state = translationState(p);
  if (state === 'current') {
    const v = p.i18n[current.lang][field];
    return { value: field === 'description' ? (v || []) : v, lang: current.lang, fallback: false };
  }
  const v = p[field];
  return { value: field === 'description' ? (v || []) : v, lang: DEFAULT_LANG, fallback: state !== 'source' };
}

/* ---------- message keys ---------- */

const ENT = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ', '&#160;': ' ', '&lt;': '‹', '&gt;': '›' };
const decode = (s) => s.replace(/&(?:amp|quot|#39|nbsp|#160|lt|gt);/g, (e) => ENT[e]);
const encodeText = (s) => s.replace(/&(?![a-zA-Z]+;|#\d+;)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/‹/g, '&lt;').replace(/›/g, '&gt;');
const encodeAttr = (s) => encodeText(s).replace(/"/g, '&quot;');
const NUM = /(?<![\p{L}\d])\d+(?:[.,  ]\d+)*(?![\p{L}])/gu;
const HAS_WORD = /\p{L}{2,}/u;

// Text -> key: whitespace collapsed, numbers replaced by {0}, {1}… (returned in nums).
function keyText(s, nums) {
  return decode(s).replace(/[\s ]+/g, ' ').replace(NUM, (n) => `{${nums.push(n) - 1}}`);
}

/* ---------- HTML tokens ---------- */

const INLINE = new Set(['a', 'strong', 'em', 'b', 'i', 'span', 'small', 'abbr', 'sup', 'sub', 's', 'time', 'u', 'mark', 'q', 'cite', 'bdi', 'data', 'kbd', 'code']);
const ATOMIC = new Set(['br', 'wbr', 'img']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const NOMARK = new Set(['title', 'option', 'textarea']);
const RAW = new Set(['script', 'style', 'textarea', 'pre']);
const ATTRS = ['alt', 'title', 'aria-label', 'placeholder', 'data-alt', 'data-note', 'data-label', 'aria-description'];
const TAG = /<!--[\s\S]*?-->|<![^>]*>|<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;

const attrOf = (attrs, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
};

// One attribute value: translated with the same rules as text (" | " titles too).
function translateValue(raw, dict, report) {
  const plain = decode(raw);
  if (!HAS_WORD.test(plain.replace(/\u2063[^\u2064]*\u2064/g, ''))) return raw;
  const t = lookupText(plain, dict, report);
  return t != null ? encodeAttr(t) : raw;
}

// Plain text (no tags) -> translation, or null. Kept regions become {k0}, {k1}… internally.
const flatMarks = (s) => String(s).replace(/\u2063+/g, '\u2063').replace(/\u2064+/g, '\u2064');
function lookupText(text, dict, report) {
  text = flatMarks(text);
  const kept = [];
  // kept regions are masked with private-use characters (never digits, which become {0}…)
  const masked = text.replace(/\u2063([^\u2064]*)\u2064/g, (m, v) => String.fromCharCode(0xe000 + kept.push(v) - 1));
  const nums = [];
  const key = keyText(masked, nums).trim().replace(/[\ue000-\ue0ff]/g, (m) => `<${m.charCodeAt(0) - 0xe000 + 1}/>`);
  if (!HAS_WORD.test(key.replace(/<\d+\/>|\{\d+\}/g, ''))) return text;
  let t = get(dict, key);
  if (t == null && key.includes(' | ')) {
    const parts = key.split(' | ').map((k) => (HAS_WORD.test(k) ? get(dict, k) : k));
    if (parts.every((x) => x != null)) t = parts.join(' | ');
  }
  if (t == null && key.includes(' – ')) {
    // "Rhea XS – pohled na automat": a name before the dash stays, the description is translated
    const [head, ...tail] = key.split(' – ');
    const rest = tail.join(' – ');
    if (get(dict, rest) != null) t = `${head} – ${get(dict, rest)}`;
  }
  if (t == null) { if (report) report(key); return null; }
  return fillNumbers(t, nums).replace(/<(\d+)\/>/g, (m, i) => kept[+i - 1] ?? '');
}

const get = (dict, k) => (Object.hasOwn(dict, k) ? dict[k] : null);
const fillNumbers = (t, nums) => t.replace(/\{(\d+)\}/g, (m, i) => nums[+i] ?? m);

// Translates a rendered HTML document or fragment. report(key) is called for every missing key.
// markMissing wraps untranslated segments in <span lang="cs"> so screen readers read them as Czech.
export function translateHtml(src, dict, { report, markMissing = true } = {}) {
  if (!dict) return stripMarks(src);
  src = flatMarks(src);
  const out = [];
  let run = [];           // tokens of the current inline run
  let skip = 0;           // depth inside a skipped element (lang=…, translate="no", raw text)
  const stack = [];       // open elements, to find where a skipped element ends
  let atomic = 0;         // depth inside a subtree kept as one token (<svg>, skipped inline)

  // text inside <title> and <option> can't hold a <span lang="cs">
  const noMark = () => stack.length && NOMARK.has(stack[stack.length - 1]);
  const flush = () => {
    if (run.length) out.push(translateRun(run, dict, report, markMissing && !noMark()));
    run = [];
  };

  for (const m of String(src).matchAll(TAG)) {
    const [tok, close, rawName, attrs = ''] = m;
    const name = rawName && rawName.toLowerCase();
    const selfClose = name && (/\/\s*$/.test(attrs) || VOID.has(name));
    if (skip) {
      out.push(tok);
      if (name && !selfClose) {
        if (close) { stack.pop(); if (stack.length < skip) skip = 0; } else stack.push(name);
      }
      continue;
    }
    if (atomic) {
      // inside an <svg> or a skipped inline element: one token for the whole subtree
      run[run.length - 1].atom += tok;
      if (name && !selfClose) atomic += close ? -1 : 1;
      continue;
    }
    if (!name) {
      if (tok.startsWith('<!')) { flush(); out.push(tok); continue; }
      run.push({ text: tok });
      continue;
    }
    const skipThis = !close && !selfClose && (RAW.has(name) || (name !== 'html' && /\slang="/.test(attrs)) || /\s(translate="no"|data-i18n-done)/.test(attrs));
    if (!close && !selfClose && (name === 'svg' || (INLINE.has(name) && skipThis))) { run.push({ atom: tok }); atomic = 1; continue; }
    let tag = tok;
    if (!close && attrs) tag = translateAttrs(tok, name, attrs, dict, report);
    if (INLINE.has(name)) { run.push(close ? { close: name, tag } : { open: name, tag }); continue; }
    if (ATOMIC.has(name)) { run.push({ atom: tag }); continue; }
    // block boundary
    flush();
    out.push(tag);
    if (!selfClose) {
      if (close) stack.pop();
      else { stack.push(name); if (skipThis) skip = stack.length; }
    }
  }
  flush();
  return stripMarks(out.join(''));
}

function translateAttrs(tok, name, attrs, dict, report) {
  let tag = tok;
  const names = [...ATTRS];
  if (name === 'meta' && /\s(name="description"|property="og:(title|description)")/.test(attrs)) names.push('content');
  if (name === 'input' && /\stype="(submit|button)"/.test(attrs)) names.push('value');
  for (const a of names) {
    const v = attrOf(attrs, a);
    if (v == null || v === '') continue;
    const t = translateValue(v, dict, report);
    if (t !== v) tag = tag.replace(`${a}="${v}"`, `${a}="${t}"`);
  }
  return tag;
}

// One inline run -> translated HTML.
function translateRun(run, dict, report, markMissing) {
  const raw = run.map((t) => t.text ?? t.tag ?? t.atom).join('');
  // an empty element (<span class="bars"></span>) is one token
  run = run.reduce((acc, t) => {
    const prev = acc[acc.length - 1];
    if (t.close && prev?.open === t.close) acc[acc.length - 1] = { atom: prev.tag + t.tag };
    else acc.push({ ...t });
    return acc;
  }, []);
  // pair up the inline tags; unmatched ones count as single placeholders
  const open = [];
  run.forEach((t, i) => {
    if (t.open) open.push(i);
    else if (t.close) {
      const j = open.length && run[open[open.length - 1]].open === t.close ? open.pop() : -1;
      if (j > -1) { run[j].pair = i; t.pair = j; }
    }
  });
  const isAtom = (t) => t.atom != null || ((t.open || t.close) && t.pair == null);
  const blank = (t) => t.text != null && !t.text.trim();
  // peel leading/trailing whitespace, single tokens and tags that wrap the whole segment
  let a = 0;
  let b = run.length - 1;
  for (;;) {
    while (a <= b && (blank(run[a]) || isAtom(run[a]))) a++;
    while (b >= a && (blank(run[b]) || isAtom(run[b]))) b--;
    if (a < b && run[a].open && run[a].pair === b) { a++; b--; continue; }
    break;
  }
  if (a > b) return raw;
  const core = run.slice(a, b + 1);
  if (core.some((t) => (t.open && (t.pair < a || t.pair > b)) || (t.close && (t.pair < a || t.pair > b)))) {
    // a tag pair crosses the edge of the segment: treat the outside part as a single token
    for (const t of core) if ((t.open || t.close) && (t.pair < a || t.pair > b)) { t.atom = t.tag; t.pair = null; }
  }
  // build the key
  const nums = [];
  const kept = [];
  const ph = new Map();
  let n = 0;
  let key = '';
  for (let i = 0; i < core.length; i++) {
    const t = core[i];
    if (t.text != null) {
      const parts = t.text.split(/(\u2063[^\u2064]*\u2064)/);
      for (const part of parts) {
        if (part.startsWith('\u2063')) { kept.push(part); key += `<${++n}/>`; ph.set(n, { atom: part }); }
        else key += keyText(part, nums);
      }
    } else if (isAtom(t)) { key += `<${++n}/>`; ph.set(n, { atom: t.atom ?? t.tag }); }
    else if (t.open) { t.n = ++n; key += `<${n}>`; ph.set(n, { open: t.tag, close: core[t.pair - a].tag }); }
    else key += `</${core[t.pair - a].n}>`;
  }
  key = key.replace(/\s+/g, ' ').trim();
  const prefix = run.slice(0, a).map((t) => t.text ?? t.tag ?? t.atom).join('');
  const suffix = run.slice(b + 1).map((t) => t.text ?? t.tag ?? t.atom).join('');
  const coreRaw = core.map((t) => t.text ?? t.tag ?? t.atom).join('');
  if (!HAS_WORD.test(key.replace(/<\/?\d+\/?>|\{\d+\}/g, ''))) return raw;
  let t = get(dict, key);
  if (t == null && key.includes(' | ')) {
    const parts = key.split(' | ').map((k) => get(dict, k) ?? (HAS_WORD.test(k) ? null : k));
    if (parts.every((x) => x != null)) t = parts.join(' | ');
  }
  if (t == null) {
    if (report) report(key);
    const safe = markMissing && !core.some((x) => (x.open || x.close) && x.pair == null && x.atom != null && /^<\/?(a|span|strong|em|b|i)\b/.test(x.atom));
    return safe ? `${prefix}<span lang="cs">${coreRaw}</span>${suffix}` : raw;
  }
  // rebuild: numbers, then placeholders, text escaped
  const body = fillNumbers(t, nums).split(/(<\/?\d+\/?>)/).map((part) => {
    const m = /^<(\/?)(\d+)(\/?)>$/.exec(part);
    if (!m) return encodeText(part);
    const p = ph.get(+m[2]);
    if (!p) return '';
    if (m[3]) return p.atom ?? '';
    return m[1] ? p.close : p.open;
  }).join('');
  return prefix + body + suffix;
}

// Translates one plain string (page scripts): same keys as the HTML, numbers kept.
export function translateText(s, dict) {
  if (s == null) return s;
  if (!dict) return stripMarks(s);
  return stripMarks(lookupText(String(s), dict) ?? String(s));
}

// Lists every key of a rendered page, for the extraction script and the checks.
export function collectKeys(src) {
  const keys = new Set();
  translateHtml(src, {}, { report: (k) => keys.add(k), markMissing: false });
  return keys;
}

// The placeholders a key or a translation uses, to check that a translation keeps all of them.
export function placeholders(s) {
  return [...String(s).matchAll(/<\/?\d+\/?>|\{\d+\}/g)].map((m) => m[0]).sort().join(' ');
}
