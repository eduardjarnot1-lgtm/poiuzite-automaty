// Builds the static site into dist/ from the data files in data/.
// No dependencies: `node scripts/build.mjs [--data data] [--out dist] [--explicit-index]`.
// --explicit-index writes links as .../index.html, for previews on hosts without directory indexes.
// --prototype adds the local admin prototype (switch, admin page, browser storage) for previews only;
// the Netlify build never passes it.
import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linker } from './lib/util.mjs';
import { layout, productPath } from './lib/components.mjs';
import * as pages from './lib/pages.mjs';
import { proto, adminPage, previewPage, ADMIN_PATH, PREVIEW_PATH } from './lib/prototype.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return resolve(root, i > -1 ? process.argv[i + 1] : fallback);
};
const dataDir = arg('data', 'data');
const out = arg('out', 'dist');
const explicitIndex = process.argv.includes('--explicit-index');
const prototype = process.argv.includes('--prototype');

const load = async (f) => JSON.parse(await readFile(join(dataDir, f), 'utf8'));
const site = await load('site.json');
const categories = await load('categories.json');
const products = await load('products.json');

/* ---------- validate the data so mistakes fail the build, not the visitor ---------- */
const errors = [];
const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const seen = new Set();
for (const cat of categories) if (!slugRe.test(cat.slug)) errors.push(`category "${cat.slug}": slug must be lowercase-with-dashes`);
for (const p of products) {
  const where = `product "${p.id || p.slug || p.name}"`;
  for (const k of ['id', 'slug', 'name', 'category', 'summary']) if (!p[k]) errors.push(`${where}: missing "${k}"`);
  if (p.slug && !slugRe.test(p.slug)) errors.push(`${where}: slug must be lowercase-with-dashes`);
  if (!categories.some((c) => c.slug === p.category)) errors.push(`${where}: unknown category "${p.category}"`);
  if (p.condition && !site.conditions[p.condition]) errors.push(`${where}: unknown condition "${p.condition}" (use ${Object.keys(site.conditions).join(', ')})`);
  if (p.price != null && typeof p.price !== 'number') errors.push(`${where}: price must be a number or null`);
  for (const img of p.images || []) if (!img.src || !img.alt) errors.push(`${where}: every image needs "src" and "alt"`);
  const key = `${p.category}/${p.slug}`;
  if (seen.has(key) || seen.has(p.id)) errors.push(`${where}: duplicate id or slug`);
  seen.add(key); seen.add(p.id);
  p.description ??= []; p.specs ??= []; p.features ??= []; p.paymentSystems ??= []; p.images ??= [];
}
if (errors.length) {
  console.error('Data errors:\n  ' + errors.join('\n  '));
  process.exit(1);
}

/* ---------- render ---------- */
// Absolute URLs (canonical, sitemap, structured data) need a known origin: site.json baseUrl,
// or the URL Netlify sets during its builds.
const base = (site.baseUrl || process.env.URL || '').replace(/\/$/, '');
const absUrl = base ? (path) => `${base}/${path}` : null;

const routes = [
  { path: '', section: '', kind: 'home', render: pages.home },
  { path: 'automaty/', section: 'automaty/', kind: 'index', render: pages.categoriesIndex },
  ...categories.map((cat) => ({ path: `automaty/${cat.slug}/`, section: 'automaty/', kind: 'category', category: cat.slug, render: (c) => pages.category(c, cat) })),
  ...products.map((p) => ({ path: productPath(p), section: 'automaty/', kind: 'product', id: p.id, render: (c) => pages.product(c, p), noindex: p.placeholder })),
  { path: 'repasovane-automaty/', section: 'repasovane-automaty/', render: pages.refurbished },
  { path: 'nahradni-dily/', section: 'nahradni-dily/', render: pages.parts },
  { path: 'servis/', section: 'servis/', render: pages.service },
  { path: 'o-nas/', section: 'o-nas/', render: pages.about },
  { path: 'kontakt/', section: 'kontakt/', render: pages.contact },
  { path: 'dekujeme/', section: '', render: pages.thanks, noindex: true },
  { path: '404', file: '404.html', section: '', render: pages.notFound, noindex: true, absolute: true },
  ...(prototype ? [
    { path: ADMIN_PATH, section: ADMIN_PATH, kind: 'admin', render: adminPage, noindex: true },
    { path: PREVIEW_PATH, section: 'automaty/', kind: 'preview', render: previewPage, noindex: true },
  ] : []),
];

await rm(out, { recursive: true, force: true });
for (const route of routes) {
  const c = { site, categories, products, page: route, url: linker(route.path, route.absolute, explicitIndex), absUrl, explicitIndex, ...(prototype && { proto }) };
  const file = join(out, route.file || join(route.path, 'index.html'));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, layout(c, route.render(c)));
}

for (const dir of ['css', 'js', 'img', 'video', 'products']) {
  await cp(join(root, 'assets', dir), join(out, 'assets', dir), { recursive: true }).catch((e) => {
    if (e.code !== 'ENOENT') throw e;
  });
}

// The prototype runs the same page templates in the browser, on one shared catalogue: the data
// as built (seed) plus whatever was saved in this browser.
if (prototype) {
  const dir = join(out, 'assets', 'proto');
  await mkdir(join(dir, 'lib'), { recursive: true });
  for (const f of ['util', 'components', 'pages']) {
    const src = await readFile(join(root, 'scripts', 'lib', `${f}.mjs`), 'utf8');
    await writeFile(join(dir, 'lib', `${f}.js`), src.replace(/from '\.\/(\w+)\.mjs'/g, "from './$1.js'"));
  }
  await writeFile(join(dir, 'seed.js'), `// Generated by scripts/build.mjs from data/*.json.\nexport default ${JSON.stringify({ site, categories, products })};\n`);
  for (const f of ['proto.js', 'proto.css']) await cp(join(root, 'assets', 'proto', f), join(dir, f));
}

const indexed = routes.filter((r) => !r.noindex);
if (absUrl) {
  await writeFile(join(out, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexed.map((r) => `  <url><loc>${absUrl(r.path)}</loc></url>`).join('\n')}\n</urlset>\n`);
}
await writeFile(join(out, 'robots.txt'), prototype ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\n${absUrl ? `Sitemap: ${absUrl('sitemap.xml')}\n` : ''}`);

console.log(`Built ${routes.length} pages into ${out}${absUrl ? ` for ${base}` : ' (no baseUrl: canonical links and sitemap skipped)'}`);
