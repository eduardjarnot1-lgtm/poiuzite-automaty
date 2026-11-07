// Tests for prices, discounts, Prague time, visibility and ordering: node --test scripts/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCzk, discountedPrice, discountProblem, discountState, sale, effectivePrice, nextBoundary,
  isVisible, isListed, pragueToUtc, utcToPrague, formatPrague, scheduleSentence, recommended, sortProducts,
} from '../lib/catalog.mjs';

const T = (iso) => Date.parse(iso);
const machine = (over = {}) => ({ id: 'a', name: 'A', price: 40000, images: [], ...over });

test('Czech price input', () => {
  assert.equal(parseCzk('45 000'), 45000);
  assert.equal(parseCzk('45000'), 45000);
  assert.equal(parseCzk('45 000 Kč'), 45000);
  assert.equal(parseCzk('45 000,-'), 45000);
  assert.equal(parseCzk(' 1 200 kč '), 1200);
  for (const bad of ['', '  ', '0,5', '45.000,50', '-100', 'abc', '12a']) assert.ok(Number.isNaN(parseCzk(bad)), bad);
});

test('discount methods', () => {
  assert.equal(discountedPrice(40000, { method: 'percent', value: 10 }), 36000);
  assert.equal(discountedPrice(39999, { method: 'percent', value: 15 }), 33999); // rounded to whole crowns
  assert.equal(discountedPrice(40000, { method: 'amount', value: 5000 }), 35000);
  assert.equal(discountedPrice(40000, { method: 'price', value: 32000 }), 32000);
});

test('invalid discounts never apply', () => {
  for (const d of [
    { method: 'percent', value: 0 }, { method: 'percent', value: 100 }, { method: 'percent', value: 120 },
    { method: 'amount', value: 40000 }, { method: 'amount', value: 50000 }, { method: 'price', value: 40000 },
    { method: 'price', value: 0 }, { method: 'price', value: 45000 }, { method: 'percent', value: NaN },
  ]) assert.ok(Number.isNaN(discountedPrice(40000, d)), JSON.stringify(d));
  assert.ok(Number.isNaN(discountedPrice(null, { method: 'percent', value: 10 })), 'price on request');
  assert.match(discountProblem(null, { method: 'percent', value: 10 }), /na dotaz/i);
  assert.match(discountProblem(40000, { method: 'percent', value: 100 }), /menší než 100/);
  assert.match(discountProblem(40000, { method: 'amount', value: 40000 }), /vyšší než 0/);
  assert.match(discountProblem(40000, { method: 'price', value: 41000 }), /nižší než běžná/);
  assert.match(discountProblem(40000, { method: 'percent', value: 10, start: '2026-11-10T07:00:00Z', end: '2026-11-10T07:00:00Z' }), /později/);
  assert.equal(discountProblem(40000, { method: 'percent', value: 10 }), '');
});

test('standard price is kept and the final price is computed', () => {
  const p = machine({ discount: { enabled: true, method: 'percent', value: 25, start: null, end: null } });
  const s = sale(p);
  assert.deepEqual([s.standard, s.final, s.saved, s.percent], [40000, 30000, 10000, 25]);
  assert.equal(p.price, 40000);
  // changing the standard price recalculates the discount
  assert.equal(sale({ ...p, price: 60000 }).final, 45000);
});

test('time-limited discount states and boundaries (start inclusive, end exclusive)', () => {
  const d = { enabled: true, method: 'amount', value: 5000, start: '2026-11-10T07:00:00.000Z', end: '2026-11-17T22:59:00.000Z' };
  const p = machine({ discount: d });
  assert.equal(discountState(p, T('2026-11-10T06:59:59.999Z')), 'scheduled');
  assert.equal(effectivePrice(p, T('2026-11-10T06:59:59.999Z')), 40000);
  assert.equal(discountState(p, T('2026-11-10T07:00:00.000Z')), 'active');
  assert.equal(effectivePrice(p, T('2026-11-10T07:00:00.000Z')), 35000);
  assert.equal(discountState(p, T('2026-11-17T22:58:59.999Z')), 'active');
  assert.equal(discountState(p, T('2026-11-17T22:59:00.000Z')), 'ended');
  assert.equal(effectivePrice(p, T('2026-11-17T22:59:00.000Z')), 40000);
  assert.equal(discountState({ ...p, discount: { ...d, enabled: false } }, T('2026-11-12T00:00:00Z')), 'off');
  assert.equal(discountState(machine(), 0), 'none');
  assert.equal(discountState({ ...p, price: null }, T('2026-11-12T00:00:00Z')), 'invalid');
  assert.equal(effectivePrice({ ...p, price: null }, T('2026-11-12T00:00:00Z')), null);
});

test('next price change across machines', () => {
  const a = machine({ id: 'a', discount: { enabled: true, method: 'percent', value: 10, start: '2026-11-10T07:00:00Z', end: '2026-11-20T07:00:00Z' } });
  const b = machine({ id: 'b', discount: { enabled: true, method: 'percent', value: 10, start: null, end: '2026-11-12T07:00:00Z' } });
  const off = machine({ id: 'c', discount: { enabled: false, method: 'percent', value: 10, start: '2026-11-09T07:00:00Z' } });
  assert.equal(nextBoundary([a, b, off], T('2026-11-01T00:00:00Z')), T('2026-11-10T07:00:00Z'));
  assert.equal(nextBoundary([a, b, off], T('2026-11-10T07:00:00Z')), T('2026-11-12T07:00:00Z'));
  assert.equal(nextBoundary([a, b], T('2026-11-12T07:00:00Z')), T('2026-11-20T07:00:00Z'));
  assert.equal(nextBoundary([a, b], T('2026-11-21T00:00:00Z')), null);
});

test('Prague time: winter, summer and both DST switches', () => {
  assert.equal(pragueToUtc('2026-11-10', '08:00').iso, '2026-11-10T07:00:00.000Z'); // CET +1
  assert.equal(pragueToUtc('2026-07-01', '08:00').iso, '2026-07-01T06:00:00.000Z'); // CEST +2
  // 29 March 2026: 2:00 jumps to 3:00
  assert.deepEqual(pragueToUtc('2026-03-29', '02:30'), { error: 'gap' });
  assert.equal(pragueToUtc('2026-03-29', '01:59').iso, '2026-03-29T00:59:00.000Z');
  assert.equal(pragueToUtc('2026-03-29', '03:00').iso, '2026-03-29T01:00:00.000Z');
  // 25 October 2026: 3:00 goes back to 2:00, so 2:30 happens twice; the first one is used
  assert.equal(pragueToUtc('2026-10-25', '02:30').iso, '2026-10-25T00:30:00.000Z');
  assert.equal(pragueToUtc('2026-10-25', '03:30').iso, '2026-10-25T02:30:00.000Z');
  for (const [d, t] of [['2026-02-30', '08:00'], ['2026-13-01', '08:00'], ['2026-11-10', '24:00'], ['', '08:00'], ['2026-11-10', '']]) {
    assert.deepEqual(pragueToUtc(d, t), { error: 'invalid' }, `${d} ${t}`);
  }
  assert.deepEqual(utcToPrague('2026-11-10T07:00:00.000Z'), { date: '2026-11-10', time: '08:00' });
  assert.deepEqual(utcToPrague('2026-07-01T21:59:00.000Z'), { date: '2026-07-01', time: '23:59' });
  assert.equal(formatPrague('2026-11-10T07:00:00.000Z'), '10. 11. 2026 v 8:00');
  assert.equal(formatPrague('2026-11-10T07:00:00.000Z', { time: false }), '10. 11. 2026');
});

test('Czech schedule sentence', () => {
  const d = { start: '2026-11-10T07:00:00.000Z', end: '2026-11-17T22:59:00.000Z' };
  assert.equal(scheduleSentence(d, T('2026-11-01T00:00:00Z')), 'Sleva začne 10. 11. 2026 v 8:00 a skončí 17. 11. 2026 ve 23:59.');
  assert.equal(scheduleSentence(d, T('2026-11-12T00:00:00Z')), 'Sleva platí od 10. 11. 2026 v 8:00 a skončí 17. 11. 2026 ve 23:59.');
  assert.equal(scheduleSentence(d, T('2026-11-20T00:00:00Z')), 'Sleva platí od 10. 11. 2026 v 8:00 a skončila 17. 11. 2026 ve 23:59.');
  assert.equal(scheduleSentence({ start: null, end: null }), 'Sleva platí od uložení, bez časového omezení.');
});

test('visibility: drafts, hidden, deleted and sold machines', () => {
  assert.ok(isListed(machine()));                                   // data without a status is published
  assert.ok(isListed(machine({ status: 'published', availability: 'Skladem' })));
  assert.ok(!isVisible(machine({ status: 'draft' })));
  assert.ok(!isVisible(machine({ status: 'hidden' })));
  assert.ok(!isVisible(machine({ deletedAt: '2026-11-04T10:00:00Z' })));
  const sold = machine({ availability: 'Prodáno' });
  assert.ok(isVisible(sold) && !isListed(sold));                    // detail page stays, listings drop it
  assert.ok(isListed(machine({ availability: 'Rezervováno' })));
});

test('recommended order: featured, saved order, then photographed and newest', () => {
  const list = [
    machine({ id: 'old', dateAdded: '2026-10-01', images: [{}] }),
    machine({ id: 'new', dateAdded: '2026-10-10', images: [{}] }),
    machine({ id: 'nophoto', dateAdded: '2026-10-20', images: [] }),
    machine({ id: 'b', dateAdded: '2026-09-01' }),
    machine({ id: 'a', dateAdded: '2026-09-02' }),
    machine({ id: 'star', featured: true }),
  ];
  assert.deepEqual(recommended(list, ['b', 'a']).map((p) => p.id), ['star', 'b', 'a', 'new', 'old', 'nophoto']);
  assert.deepEqual(recommended(list).map((p) => p.id), ['star', 'new', 'old', 'nophoto', 'a', 'b']);
});

test('customer sorting uses the price that applies now and keeps "na dotaz" last', () => {
  const now = T('2026-11-12T00:00:00Z');
  const list = [
    machine({ id: 'ask1', name: 'Žluťoučký', price: null, dateAdded: '2026-10-05' }),
    machine({ id: 'p50', name: 'Bravo', price: 50000, dateAdded: '2026-10-01' }),
    machine({ id: 'sale', name: 'Alfa', price: 60000, dateAdded: '2026-10-03', discount: { enabled: true, method: 'price', value: 30000, start: null, end: null } }),
    machine({ id: 'p40a', name: 'Čaj', price: 40000, dateAdded: '2026-10-02' }),
    machine({ id: 'ask2', name: 'Charlie', price: null, dateAdded: '2026-10-04' }),
    machine({ id: 'p40b', name: 'Delta', price: 40000, dateAdded: '2026-10-02' }),
  ];
  const ids = (by) => sortProducts(list, by, now).map((p) => p.id);
  assert.deepEqual(ids('cena-vzestupne'), ['sale', 'p40a', 'p40b', 'p50', 'ask1', 'ask2']);
  assert.deepEqual(ids('cena-sestupne'), ['p50', 'p40a', 'p40b', 'sale', 'ask1', 'ask2']);
  assert.deepEqual(ids('nejnovejsi'), ['ask1', 'ask2', 'sale', 'p40a', 'p40b', 'p50']);
  assert.deepEqual(ids('nazev'), ['sale', 'p50', 'p40a', 'p40b', 'ask2', 'ask1']); // Czech: Č after C, Ch after H
  assert.deepEqual(ids('doporucene'), list.map((p) => p.id));
  // after the discount ends, the machine sorts by its standard price again
  const later = { ...list[2], discount: { ...list[2].discount, end: '2026-11-11T00:00:00Z' } };
  assert.deepEqual(sortProducts([list[1], later], 'cena-vzestupne', now).map((p) => p.id), ['p50', 'sale']);
});
