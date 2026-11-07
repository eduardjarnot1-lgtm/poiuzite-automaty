// Tests for the machine-selection guide: node --test scripts/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  STEPS, OFFER, COFFEE, PLACE, MODE, PAYMENT, BUDGET, PEOPLE, USAGE, usageScale,
  clean, stepErrors, parseBudget, targetCategories, evaluate, assess, answerLines, summaryText, paymentsOf,
} from '../lib/guide.mjs';

const categories = JSON.parse(await readFile(new URL('../../data/categories.json', import.meta.url), 'utf8'));
const realProducts = JSON.parse(await readFile(new URL('../../data/products.json', import.meta.url), 'utf8'));
const NOW = Date.parse('2026-11-06T12:00:00Z');
const m = (id, over = {}) => ({ id, name: id.toUpperCase(), category: 'instantni-kavove-automaty', price: null, availability: null, specs: [], paymentSystems: [], images: [], ...over });
const cat = (products, a, order = []) => evaluate({ products, categories, order }, a, NOW);

test('five steps, and every single-choice question has an "unsure" way out', () => {
  assert.equal(STEPS.length, 5);
  for (const list of [OFFER, PLACE, MODE]) assert.ok(list.some(([k]) => k === 'unsure'));
  for (const list of [COFFEE, PAYMENT]) assert.ok(list.some(([k]) => k === 'help'));
  for (const list of [PEOPLE, ...Object.values(USAGE)]) assert.ok(list.some(([k]) => k === 'unknown'));
  assert.ok(BUDGET.some(([k]) => k === 'none'));
});

test('steps ask for an answer before continuing, budget and extras stay optional', () => {
  assert.ok(stepErrors('nabidka', {}).offer);
  assert.deepEqual(stepErrors('nabidka', { offer: 'unsure' }), {});
  assert.ok(stepErrors('misto', {}).place);
  assert.ok(stepErrors('vydej', {}).mode);
  assert.deepEqual(stepErrors('rozpocet', {}), {});
  assert.deepEqual(stepErrors('doplneni', {}), {});
  assert.ok(stepErrors('rozpocet', { budget: 'max', budgetMax: 'hodně' }).budgetMax);
  assert.deepEqual(stepErrors('rozpocet', { budget: 'max', budgetMax: '80 000' }), {});
});

test('budget input', () => {
  assert.equal(parseBudget('80 000'), 80000);
  assert.equal(parseBudget('80000 Kč'), 80000);
  assert.equal(parseBudget('1.200.000'), 1200000);
  for (const bad of ['', '0', '-5', 'abc', '12,5', null]) assert.equal(parseBudget(bad), null, String(bad));
});

test('changed answers clear the follow-ups that no longer apply', () => {
  const a = { offer: 'hot', coffee: 'beans', place: 'other', placeOther: 'hala', usage: 'u2', usageScale: 'drinks', mode: 'paid', payment: 'card', budget: 'max', budgetMax: '50000', water: 'no' };
  assert.deepEqual(clean(a), a);
  const b = clean({ ...a, offer: 'snack', place: 'office', mode: 'free', budget: 'none' });
  assert.equal(b.coffee, undefined);
  assert.equal(b.placeOther, undefined);
  assert.equal(b.usage, undefined, 'drink servings do not carry over to snack purchases');
  assert.equal(b.payment, undefined);
  assert.equal(b.budgetMax, undefined);
  assert.equal(b.water, undefined);
  assert.equal(usageScale('combo'), 'items');
  // a selected machine is dropped when the category changes
  const products = [m('x')];
  assert.deepEqual(clean({ offer: 'hot', coffee: 'instant', selected: ['x'] }, products).selected, ['x']);
  assert.equal(clean({ offer: 'cold', selected: ['x'] }, products).selected, undefined);
});

test('categories follow what the machine should offer', () => {
  assert.deepEqual(targetCategories({ offer: 'hot', coffee: 'instant' }), ['instantni-kavove-automaty']);
  assert.deepEqual(targetCategories({ offer: 'hot', coffee: 'beans' }), ['automaty-na-zrnkovou-kavu']);
  assert.deepEqual(targetCategories({ offer: 'hot', coffee: 'help' }), ['instantni-kavove-automaty', 'automaty-na-zrnkovou-kavu']);
  assert.deepEqual(targetCategories({ offer: 'hot' }), ['instantni-kavove-automaty', 'automaty-na-zrnkovou-kavu']);
  assert.deepEqual(targetCategories({ offer: 'cold' }), ['napojove-automaty']);
  assert.deepEqual(targetCategories({ offer: 'snack' }), ['snackove-automaty']);
  assert.deepEqual(targetCategories({ offer: 'combo' }), ['kombinovane-automaty']);
  assert.deepEqual(targetCategories({ offer: 'unsure' }), []);
});

test('today\'s catalogue: instant coffee is a category result with examples in catalogue order, no ranking', () => {
  const order = ['wittenborg-5100', 'colibri-c5'];
  const r = cat(realProducts, { offer: 'hot', coffee: 'instant', place: 'office', mode: 'free', budget: 'none' }, order);
  assert.equal(r.branch, 'published');
  assert.equal(r.comparable, false);
  assert.equal(r.shortlist.length, 0);
  assert.deepEqual(r.examples.slice(0, 2).map((x) => x.product.id), order, 'the saved catalogue order, not a ranking');
  assert.equal(r.examples.length, 3);
  assert.equal(r.total, 7);
  assert.equal(r.categories[0].published, 7);
});

test('card payment requested while no machine records a payment system: requested, not confirmed', () => {
  const r = cat(realProducts, { offer: 'hot', coffee: 'instant', place: 'office', mode: 'paid', payment: 'card' });
  assert.equal(r.examples.length, 3);
  for (const x of r.examples) {
    assert.equal(x.confirmed.length, 0);
    assert.ok(x.requested.some((t) => /kartou/.test(t)));
    assert.equal(x.conflicts.length, 0);
  }
});

test('numeric budget with unknown prices: no budget match is claimed', () => {
  const r = cat(realProducts, { offer: 'hot', coffee: 'instant', place: 'office', mode: 'free', budget: 'max', budgetMax: '60000' });
  for (const x of r.examples) {
    assert.ok(!x.confirmed.some((t) => /rozpočtu/.test(t)));
    assert.ok(x.unknown.some((t) => /nejde porovnat/.test(t)));
  }
  assert.equal(r.groups.length, 0);
});

test('on-request categories never borrow instant-coffee machines', () => {
  for (const offer of ['cold', 'snack', 'combo']) {
    const r = cat(realProducts, { offer, place: 'office', mode: 'paid' });
    assert.equal(r.branch, 'onRequest', offer);
    assert.equal(r.examples.length + r.shortlist.length, 0, offer);
    assert.equal(r.categories[0].published, 0);
  }
  const beans = cat(realProducts, { offer: 'hot', coffee: 'beans', place: 'office', mode: 'free' });
  assert.equal(beans.branch, 'onRequest');
  assert.equal(beans.examples.length, 0);
});

test('"Zatím nevím" everywhere still gives a useful, honest result', () => {
  const r = cat(realProducts, { offer: 'unsure', place: 'unsure', mode: 'unsure', budget: 'none' });
  assert.equal(r.branch, 'unsure');
  assert.equal(r.categories.length, categories.length);
  assert.equal(r.examples.length + r.shortlist.length, 0);
  assert.ok(r.clarify.length >= 3);
});

test('hidden, draft, deleted and sold machines are never suggested; reserved ones keep their status', () => {
  const products = [
    m('draft', { status: 'draft' }), m('hidden', { status: 'hidden' }), m('gone', { deletedAt: '2026-11-01' }),
    m('sold', { availability: 'Prodáno' }), m('reserved', { availability: 'Rezervováno' }), m('ok'),
  ];
  const r = cat(products, { offer: 'hot', coffee: 'instant', mode: 'free' });
  assert.deepEqual(r.examples.map((x) => x.product.id).sort(), ['ok', 'reserved']);
});

test('with recorded prices and payment systems, machines are compared and conflicts set aside', () => {
  const products = [
    m('cheap', { price: 40000, paymentSystems: ['mincovník', 'platební terminál'] }),
    m('dear', { price: 90000, paymentSystems: ['mincovník'] }),
    m('coins', { price: 30000, paymentSystems: ['mincovník'] }),
    m('unknown'),
    m('sale', { price: 80000, discount: { enabled: true, method: 'price', value: 55000, start: null, end: null } }),
  ];
  const r = cat(products, { offer: 'hot', coffee: 'instant', mode: 'paid', payment: 'card', budget: 'max', budgetMax: '60 000' });
  assert.equal(r.comparable, true);
  const ids = r.shortlist.map((x) => x.product.id);
  assert.ok(ids.includes('cheap'));
  assert.ok(!ids.includes('dear') && !ids.includes('coins'), 'over budget or without card never recommended');
  assert.deepEqual(r.setAside.map((x) => x.product.id).sort(), ['coins', 'dear']);
  assert.ok(ids.includes('sale'), 'the active discounted price is what counts');
  assert.equal(r.groups[0].id, 'budget');
  assert.ok(r.groups.find((g) => g.id === 'price')?.items.some((x) => x.product.id === 'unknown') || !ids.includes('unknown'));
  assert.ok(r.shortlist.length <= 3);
});

test('payment systems are read only from the record', () => {
  assert.equal(paymentsOf(m('x')), null);
  assert.deepEqual(paymentsOf(m('x', { paymentSystems: ['Mincovník'] })), { text: 'Mincovník', coins: true, card: false });
  assert.equal(paymentsOf(m('x', { specs: [{ label: 'Platební systém', value: 'bezkontaktní terminál' }] })).card, true);
  const x = assess(m('x', { name: 'Card Master 3000' }), { mode: 'paid', payment: 'card' }, NOW);
  assert.equal(x.confirmed.length, 0, 'a name never proves a capability');
});

test('summary: answers in words, machines only when ticked, nothing from the URL', () => {
  const a = { offer: 'hot', coffee: 'instant', place: 'office', people: 'p2', mode: 'paid', payment: 'card', budget: 'max', budgetMax: '80000', region: 'Brno' };
  const r = cat(realProducts, a);
  const plain = summaryText(a, r, { products: realProducts });
  assert.match(plain, /Instantní káva/i);
  assert.match(plain, /80\s000 Kč bez DPH/);
  assert.match(plain, /Platební karta/);
  assert.doesNotMatch(plain, /Vybrané automaty/);
  const ticked = summaryText({ ...a, selected: ['colibri-c5'] }, r, { products: realProducts });
  assert.match(ticked, /Vybrané automaty: Colibri C5 \(colibri-c5\)/);
  assert.ok(answerLines(a).every(([step]) => STEPS.some((s) => s.id === step)));
});
