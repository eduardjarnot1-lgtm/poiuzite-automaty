// Checks the German and Slovak translations:
//  1. every dictionary (i18n/<lang>/*.json) has the same keys in both languages, no empty value and
//     the same placeholders (<1>…</1>, <2/>, {0}) as the Czech key;
//  2. a full build has no page text without a translation (it lists the texts that are missing);
//  3. product descriptions (data/products.json → i18n): missing or waiting for a check after the
//     Czech text changed. Those are shown in Czech with a note, so they are reported, not errors.
// Usage: node scripts/i18n-check.mjs        (exit code 1 when something must be fixed)
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { placeholders, translationState } from './lib/i18n.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['de', 'sk'];
const problems = [];
const notes = [];

// 1. dictionaries
const dicts = {};
for (const lang of LANGS) {
  dicts[lang] = {};
  for (const f of (await readdir(join(root, 'i18n', lang))).filter((x) => x.endsWith('.json')).sort()) {
    const d = JSON.parse(await readFile(join(root, 'i18n', lang, f), 'utf8'));
    for (const [k, v] of Object.entries(d)) {
      const where = `i18n/${lang}/${f}`;
      if (typeof v !== 'string' || !v.trim()) problems.push(`${where}: empty translation for ${JSON.stringify(k)}`);
      else if (placeholders(k) !== placeholders(v)) problems.push(`${where}: placeholders differ for ${JSON.stringify(k)}\n    cs: ${placeholders(k)}\n    ${lang}: ${placeholders(v)}`);
      if (/[⁣⁤]/.test(v)) problems.push(`${where}: invisible marker characters in ${JSON.stringify(k)}`);
      dicts[lang][k] = f;
    }
  }
}
const [a, b] = LANGS.map((l) => new Set(Object.keys(dicts[l])));
for (const k of a) if (!b.has(k)) problems.push(`sk is missing a key that de has: ${JSON.stringify(k)}`);
for (const k of b) if (!a.has(k)) problems.push(`de is missing a key that sk has: ${JSON.stringify(k)}`);

// 2. build and list untranslated page texts
const out = await mkdtemp(join(tmpdir(), 'i18n-check-'));
try {
  const report = join(out, 'missing.json');
  execFileSync(process.execPath, [join(root, 'scripts', 'build.mjs'), '--out', join(out, 'site'), '--explicit-index', '--prototype', '--show-unverified-assets', '--i18n-report', report], { stdio: ['ignore', 'ignore', 'pipe'] });
  const missing = JSON.parse(await readFile(report, 'utf8'));
  for (const lang of LANGS) for (const k of missing[lang] || []) problems.push(`${lang}: page text without a translation: ${JSON.stringify(k)}`);
} finally {
  await rm(out, { recursive: true, force: true });
}

// 3. product descriptions
const products = JSON.parse(await readFile(join(root, 'data', 'products.json'), 'utf8'));
for (const p of products) {
  for (const lang of LANGS) {
    const st = translationState(p, lang);
    if (st === 'missing') notes.push(`${p.id}: ${lang} description missing (Czech is shown)`);
    if (st === 'stale') notes.push(`${p.id}: ${lang} description waits for a check, the Czech text changed (Czech is shown)`);
    const t = p.i18n?.[lang];
    if (t && st === 'current' && (t.description || []).length !== (p.description || []).length) notes.push(`${p.id}: ${lang} description has ${t.description.length} paragraph(s), Czech has ${(p.description || []).length}`);
  }
}

console.log(`Dictionaries: ${a.size} keys (de), ${b.size} keys (sk).`);
for (const n of notes) console.log(`note: ${n}`);
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  console.error(`${problems.length} problem(s).`);
  process.exit(1);
}
console.log('✓ No missing translations, placeholders match.');
