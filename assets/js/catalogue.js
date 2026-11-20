// Catalogue filters, search and "Seřadit podle". Works on the cards already in the page, which the
// build puts in the recommended order, so the full list stays visible without JS. Only the
// controls the build rendered (because the data supports them) are wired up. The current choice
// is kept in the address bar. Sorting matches sortProducts() in scripts/lib/catalog.mjs: the price
// that applies now, "Cena na dotaz" last in both directions, ties in the recommended order.
// The admin prototype fires "catalogue:refresh" when a discount starts or ends on an open page.
(() => {
  const root = document.querySelector('[data-catalogue]');
  const tools = root?.querySelector('[data-cat-tools]');
  if (!tools) return;
  const list = root.querySelector('[data-cat-list]');
  const status = root.querySelector('[data-cat-status]');
  const empty = root.querySelector('[data-cat-empty]');
  const filters = [...tools.querySelectorAll('[data-filter]')];
  const sort = tools.querySelector('[data-sort]');
  const KEYS = { q: 'hledat', category: 'druh', manufacturer: 'vyrobce', condition: 'stav', type: 'typ', availability: 'dostupnost', pmin: 'cena-od', pmax: 'cena-do', sale: 'sleva' };
  const DEFAULT_SORT = 'doporucene';
  const word = (n) => (n === 1 ? 'automat' : n >= 2 && n <= 4 ? 'automaty' : 'automatů');
  const collator = new Intl.Collator('cs');
  const value = (el) => (el.type === 'checkbox' ? (el.checked ? el.value : '') : el.value.trim());

  // restore from the address bar
  const params = new URLSearchParams(location.search);
  filters.forEach((el) => {
    const v = params.get(KEYS[el.dataset.filter]);
    if (v == null) return;
    if (el.type === 'checkbox') el.checked = v === el.value;
    else if (el.tagName !== 'SELECT' || [...el.options].some((o) => o.value === v)) el.value = v;
  });
  if (params.get('razeni') && [...sort.options].some((o) => o.value === params.get('razeni'))) sort.value = params.get('razeni');

  const priceOf = (card) => (card.dataset.price === '' ? null : Number(card.dataset.price));
  const orderOf = (card) => Number(card.dataset.order) || 0;

  function apply() {
    const cards = [...list.children];
    const f = Object.fromEntries(filters.map((el) => [el.dataset.filter, value(el)]));
    const q = (f.q || '').toLowerCase();
    const pmin = f.pmin ? Number(f.pmin) : null;
    const pmax = f.pmax ? Number(f.pmax) : null;
    let shown = 0;
    cards.forEach((card) => {
      const d = card.dataset;
      const price = priceOf(card);
      const ok = (!q || d.search.includes(q))
        && (!f.category || d.category === f.category)
        && (!f.manufacturer || d.manufacturer === f.manufacturer)
        && (!f.condition || d.condition === f.condition)
        && (!f.type || d.type === f.type)
        && (!f.availability || d.availability === f.availability)
        && (!f.sale || d.sale === '1')
        && (pmin == null || (price != null && price >= pmin))
        && (pmax == null || (price != null && price <= pmax));
      card.hidden = !ok;
      if (ok) shown++;
    });

    const by = sort.value;
    const sorted = [...cards].sort((a, b) => {
      let d = 0;
      if (by === 'cena-vzestupne' || by === 'cena-sestupne') {
        const pa = priceOf(a), pb = priceOf(b);
        if (pa == null || pb == null) d = (pa == null) - (pb == null);
        else d = by === 'cena-vzestupne' ? pa - pb : pb - pa;
      } else if (by === 'nejnovejsi') d = b.dataset.date.localeCompare(a.dataset.date);
      else if (by === 'nazev') d = collator.compare(a.dataset.name, b.dataset.name);
      return d || orderOf(a) - orderOf(b);
    });
    if (sorted.some((card, i) => card !== cards[i])) list.append(...sorted);

    const active = filters.some((el) => value(el));
    status.textContent = active ? `Zobrazeno ${shown} z ${cards.length} ${word(cards.length)}` : `${cards.length} ${word(cards.length)}`;
    empty.hidden = shown > 0;

    const p = new URLSearchParams(location.search);
    Object.values(KEYS).concat('razeni').forEach((k) => p.delete(k));
    filters.forEach((el) => value(el) && p.set(KEYS[el.dataset.filter], value(el)));
    if (by !== DEFAULT_SORT) p.set('razeni', by);
    history.replaceState(history.state, '', (p.toString() ? `?${p}` : location.pathname) + location.hash);
  }

  let t;
  tools.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(apply, e.target.type === 'search' || e.target.type === 'number' ? 200 : 0); });
  tools.addEventListener('change', apply);
  tools.addEventListener('submit', (e) => e.preventDefault());
  tools.addEventListener('reset', () => setTimeout(apply));
  root.querySelector('[data-cat-clear]')?.addEventListener('click', () => { tools.reset(); tools.querySelector('select, input')?.focus(); });
  document.addEventListener('catalogue:refresh', apply);

  tools.hidden = false;
  apply();
})();
