// Language versions: the post-render translator, kept data, Czech fallback and product texts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { translateHtml, collectKeys, placeholders, keep, setLang, productText, translationState, sourceHash, splitLang } from '../lib/i18n.mjs';

const dict = Object.assign(Object.create(null), {
  'Zobrazeno {0} z {1} automatů': '{0} von {1} Automaten angezeigt',
  'Více v <1>zásadách</1>.': 'Mehr in den <1>Grundsätzen</1>.',
  'Napište nám na <1><2/></1>.': 'Schreiben Sie uns an <1><2/></1>.',
  'Nabídka automatů': 'Automatenangebot',
  'Poptat automat': 'Automat anfragen',
});

test('numbers and inline tags become placeholders and come back in place', () => {
  assert.equal(translateHtml('<p>Zobrazeno 3 z 12 automatů</p>', dict), '<p>3 von 12 Automaten angezeigt</p>');
  assert.equal(translateHtml('<p>Více v <a href="/x/">zásadách</a>.</p>', dict), '<p>Mehr in den <a href="/x/">Grundsätzen</a>.</p>');
  assert.deepEqual([...collectKeys('<p>Více v <a href="/x/">zásadách</a>.</p><p>Zobrazeno 1 200 z 5 automatů</p>')], ['Více v <1>zásadách</1>.', 'Zobrazeno {0} z {1} automatů']);
});

test('kept data (names, e-mails) is never translated and loses its markers', () => {
  setLang('de', dict);
  const src = `<p>Napište nám na <a href="mailto:a@b.cz">${keep('a@b.cz')}</a>.</p>`;
  assert.equal(translateHtml(src, dict), '<p>Schreiben Sie uns an <a href="mailto:a@b.cz">a@b.cz</a>.</p>');
  setLang('cs');
  assert.equal(keep('x'), 'x');
});

test('attributes, lang="cs" blocks and missing texts', () => {
  assert.equal(translateHtml('<a aria-label="Poptat automat">x</a>', dict).includes('aria-label="Automat anfragen"'), true);
  assert.equal(translateHtml('<div lang="cs"><p>Nabídka automatů</p></div>', dict), '<div lang="cs"><p>Nabídka automatů</p></div>');
  const missing = [];
  const out = translateHtml('<p>Tohle chybí</p>', dict, { report: (k) => missing.push(k) });
  assert.equal(out, '<p><span lang="cs">Tohle chybí</span></p>');
  assert.deepEqual(missing, ['Tohle chybí']);
  // no <span> inside <title> or <option>
  assert.equal(translateHtml('<title>Tohle chybí</title>', dict), '<title>Tohle chybí</title>');
});

test('placeholders() compares keys and translations', () => {
  assert.equal(placeholders('Více v <1>zásadách</1> {0}'), placeholders('{0} Mehr in den <1>Grundsätzen</1>'));
  assert.notEqual(placeholders('Více v <1>zásadách</1>'), placeholders('Mehr in den Grundsätzen'));
});

test('a product translation is served only while the Czech text is unchanged', () => {
  const p = { summary: 'Automat', description: ['Mincovník vrací.'] };
  p.i18n = { de: { summary: 'Automat (de)', description: ['Gibt Wechselgeld zurück.'], sourceHash: sourceHash(p) } };
  setLang('de', dict);
  assert.equal(translationState(p), 'current');
  assert.deepEqual(productText(p, 'summary'), { value: 'Automat (de)', lang: 'de', fallback: false });
  p.summary = 'Automat na kávu';
  assert.equal(translationState(p), 'stale');
  assert.deepEqual(productText(p, 'summary'), { value: 'Automat na kávu', lang: 'cs', fallback: true });
  assert.equal(translationState(p, 'sk'), 'missing');
  setLang('cs');
  assert.equal(productText(p, 'summary').fallback, false);
});

test('language prefixes', () => {
  assert.deepEqual(splitLang('de/automaty/'), { lang: 'de', path: 'automaty/' });
  assert.deepEqual(splitLang('en/automaty/'), { lang: 'cs', path: 'en/automaty/' });
  assert.deepEqual(splitLang('cs/x/'), { lang: 'cs', path: 'cs/x/' });
});

test('the dictionaries have the same keys and placeholders in German and Slovak', () => {
  const load = (l) => Object.assign({}, ...readdirSync(new URL(`../../i18n/${l}/`, import.meta.url)).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(new URL(`../../i18n/${l}/${f}`, import.meta.url), 'utf8'))));
  const de = load('de');
  const sk = load('sk');
  assert.deepEqual(Object.keys(de).sort(), Object.keys(sk).sort());
  for (const [k, v] of Object.entries(de)) assert.equal(placeholders(v), placeholders(k), k);
  for (const [k, v] of Object.entries(sk)) assert.equal(placeholders(v), placeholders(k), k);
});

test('products in data/products.json have current German and Slovak descriptions', () => {
  const products = JSON.parse(readFileSync(new URL('../../data/products.json', import.meta.url), 'utf8'));
  for (const p of products) for (const l of ['de', 'sk']) assert.equal(translationState(p, l), 'current', `${p.id} ${l}`);
});
