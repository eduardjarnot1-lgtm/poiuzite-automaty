// Local admin prototype: only in builds made with --prototype (the preview), never in the
// Netlify build. It adds the "Pohled zákazníka / Správa nabídky" switch, the admin page and a
// preview page for machines added in the browser. Changes live in this browser's localStorage;
// nothing here is authentication, and nothing is published to other visitors.
import { esc, html } from './util.mjs';

export const ADMIN_PATH = 'sprava-nabidky/';
export const PREVIEW_PATH = 'automaty/nahled/';

// Which page this is, so assets/proto/proto.js can render it again from the stored catalogue.
function routeInfo(c) {
  const r = c.page;
  return { path: r.path, section: r.section, absolute: Boolean(r.absolute), explicitIndex: c.explicitIndex, kind: r.kind || 'other', id: r.id || null, category: r.category || null };
}

export const proto = {
  // Hides the page body for the moment it takes to re-render it from saved changes, so visitors
  // of this preview don't see the old prices flash. Only when something was saved.
  head: (c) => html`<link rel="stylesheet" href="${c.url('assets/proto/proto.css')}">
<script>try{if(localStorage.getItem('pouzite-automaty:prototyp:v1'))document.documentElement.classList.add('proto-pending')}catch(e){}</script>
`,
  foot: (c) => {
    const admin = c.page.path === ADMIN_PATH;
    return html`<nav class="proto-switch" aria-label="Náhled prototypu">
  <span class="proto-switch-label" aria-hidden="true">Prototyp</span>
  <a href="${c.url('')}" data-proto-customer${admin ? '' : ' aria-current="page"'}>Pohled zákazníka</a>
  <a href="${c.url(ADMIN_PATH)}"${admin ? ' aria-current="page"' : ''}>Správa nabídky</a>
</nav>
<script type="application/json" id="proto-route">${JSON.stringify(routeInfo(c)).replace(/</g, '\\u003c')}</script>
<script type="module" src="${c.url('assets/proto/proto.js')}"></script>
`;
  },
};

export const STORAGE_NOTE = 'Změny se ukládají jen v tomto prohlížeči na tomto zařízení. Ostatní návštěvníci je neuvidí a živý web se jimi nemění.';

export function adminPage(c) {
  return {
    title: 'Správa nabídky (prototyp)',
    description: 'Místní prototyp správy nabídky automatů. Změny zůstávají jen v tomto prohlížeči.',
    body: html`
<div class="page-head">
  <div class="wrap">
    <h1>Správa nabídky</h1>
    <p class="lead">Přidejte automat nebo upravte název, kategorii, popis, cenu, fotografii a dostupnost. Uložené změny se hned projeví v pohledu zákazníka.</p>
  </div>
</div>
<section class="section section-tight" aria-label="Automaty v nabídce">
  <div class="wrap">
    <div class="proto-note" role="note"><strong>Prototyp pro vyzkoušení, ne ostrá správa webu.</strong> ${esc(STORAGE_NOTE)}</div>
    <div data-proto-admin><noscript><p>Správa nabídky potřebuje zapnutý JavaScript.</p></noscript></div>
  </div>
</section>`,
  };
}

export function previewPage(c) {
  return {
    title: 'Náhled automatu',
    description: 'Náhled automatu přidaného v místním prototypu správy nabídky.',
    body: html`
<div class="page-head">
  <div class="wrap">
    <h1>Automat nebyl nalezen</h1>
    <p class="lead">Tento automat byl přidán v prototypu správy nabídky v jiném prohlížeči nebo už není uložený. <a href="${c.url('automaty/')}">Zobrazit nabídku automatů</a></p>
  </div>
</div>`,
  };
}
