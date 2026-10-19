// Catalogue filters, search and sorting. Works on the cards already in the page, so the full
// list stays visible without JS. Only the controls the build rendered (because the data
// supports them) are wired up. The current choice is kept in the address bar.
(() => {
  const root = document.querySelector('[data-catalogue]');
  const tools = root?.querySelector('[data-cat-tools]');
  if (!tools) return;
  const list = root.querySelector('[data-cat-list]');
  const cards = [...list.children];
  const status = root.querySelector('[data-cat-status]');
  const empty = root.querySelector('[data-cat-empty]');
  const filters = [...tools.querySelectorAll('[data-filter]')];
  const sort = tools.querySelector('[data-sort]');
  const KEYS = { q: 'hledat', manufacturer: 'vyrobce', condition: 'stav', type: 'typ', pmin: 'cena-od', pmax: 'cena-do' };
  const word = (n) => (n === 1 ? 'automat' : n >= 2 && n <= 4 ? 'automaty' : 'automatů');
  const collator = new Intl.Collator('cs');

  // restore from the address bar
  const params = new URLSearchParams(location.search);
  filters.forEach((el) => { const v = params.get(KEYS[el.dataset.filter]); if (v != null) el.value = v; });
  if (params.get('razeni') && [...sort.options].some((o) => o.value === params.get('razeni'))) sort.value = params.get('razeni');

  function apply() {
    const f = Object.fromEntries(filters.map((el) => [el.dataset.filter, el.value.trim()]));
    const q = (f.q || '').toLowerCase();
    const pmin = f.pmin ? Number(f.pmin) : null;
    const pmax = f.pmax ? Number(f.pmax) : null;
    let shown = 0;
    cards.forEach((card) => {
      const d = card.dataset;
      const price = d.price === '' ? null : Number(d.price);
      const ok = (!q || d.search.includes(q))
        && (!f.manufacturer || d.manufacturer === f.manufacturer)
        && (!f.condition || d.condition === f.condition)
        && (!f.type || d.type === f.type)
        && (pmin == null || (price != null && price >= pmin))
        && (pmax == null || (price != null && price <= pmax));
      card.hidden = !ok;
      if (ok) shown++;
    });

    const by = sort.value;
    const priceOf = (c) => (c.dataset.price === '' ? null : Number(c.dataset.price));
    const sorted = [...cards].sort((a, b) => {
      if (by === 'name') return collator.compare(a.dataset.name, b.dataset.name);
      if (by.startsWith('price')) {
        const pa = priceOf(a), pb = priceOf(b);
        if (pa == null || pb == null) return (pa == null) - (pb == null);   // "price on request" last
        return by === 'price-asc' ? pa - pb : pb - pa;
      }
      return b.dataset.date.localeCompare(a.dataset.date);
    });
    list.append(...sorted);

    const active = filters.some((el) => el.value.trim());
    status.textContent = active ? `Zobrazeno ${shown} z ${cards.length} ${word(cards.length)}` : `${cards.length} ${word(cards.length)}`;
    empty.hidden = shown > 0;

    const p = new URLSearchParams();
    filters.forEach((el) => el.value.trim() && p.set(KEYS[el.dataset.filter], el.value.trim()));
    if (by !== 'newest') p.set('razeni', by);
    history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname);
  }

  let t;
  tools.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(apply, e.target.type === 'search' || e.target.type === 'number' ? 200 : 0); });
  tools.addEventListener('change', apply);
  tools.addEventListener('submit', (e) => e.preventDefault());
  tools.addEventListener('reset', () => setTimeout(apply));
  root.querySelector('[data-cat-clear]')?.addEventListener('click', () => { tools.reset(); });

  tools.hidden = false;
  apply();
})();
