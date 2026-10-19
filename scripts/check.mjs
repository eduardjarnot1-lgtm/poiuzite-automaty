// Checks the built site in dist/: every internal link, image and script resolves, in-page anchors
// exist, and each page has a unique title, a meta description, one h1 and alt text on images.
// `node scripts/check.mjs [--out dist]`
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--out');
const out = resolve(root, i > -1 ? process.argv[i + 1] : 'dist');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])))).flat();
}
const exists = (p) => stat(p).then(() => true, () => false);
const files = (await walk(out)).filter((f) => f.endsWith('.html'));
const problems = [];
const titles = new Map();
const idsCache = new Map();
const idsOf = async (file) => {
  if (!idsCache.has(file)) idsCache.set(file, new Set([...(await readFile(file, 'utf8')).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idsCache.get(file);
};

for (const file of files) {
  const page = relative(out, file);
  const src = await readFile(file, 'utf8');
  const report = (msg) => problems.push(`${page}: ${msg}`);

  const title = src.match(/<title>([^<]*)<\/title>/)?.[1];
  if (!title) report('missing <title>');
  else if (titles.has(title)) report(`title duplicates ${titles.get(title)}`);
  else titles.set(title, page);
  if (!/<meta name="description" content="[^"]{20,}">/.test(src)) report('missing or short meta description');
  const h1s = src.match(/<h1[\s>]/g)?.length || 0;
  if (h1s !== 1) report(`${h1s} <h1> elements`);
  for (const m of src.matchAll(/<img\b[^>]*>/g)) if (!/\salt="/.test(m[0])) report(`img without alt: ${m[0].slice(0, 80)}`);
  for (const m of src.matchAll(/<(button|a)\b[^>]*>\s*<\/\1>/g)) report(`empty ${m[1]}: ${m[0]}`);

  // 404.html is served at any depth, so it uses root-absolute links
  const isAbsPage = page === '404.html';
  for (const m of src.matchAll(/\s(?:href|src|data-src|poster|data-full)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|tel:|data:)/.test(url)) continue;
    const [path, hash] = url.split('#');
    let target;
    if (!path) target = file;
    else if (path.startsWith('/')) {
      if (!isAbsPage) report(`root-absolute link ${url}`);
      target = join(out, path);
    } else target = resolve(dirname(file), path);
    if (path && (path.endsWith('/') || path === '.' || path === './')) target = join(target, 'index.html');
    if (!(await exists(target))) { report(`broken link ${url}`); continue; }
    if (hash && target.endsWith('.html') && !(await idsOf(target)).has(hash)) report(`missing anchor ${url}`);
  }
}

if (problems.length) {
  console.error(`${problems.length} problem(s):\n  ` + problems.join('\n  '));
  process.exit(1);
}
console.log(`Checked ${files.length} pages: links, anchors, titles, descriptions, headings and alt text are fine.`);
