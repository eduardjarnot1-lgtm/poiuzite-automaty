// What still stops this site from going public as a finished, compliant site. The build prints the
// list on every run; `node scripts/build.mjs --strict` fails while it is not empty. The list is a
// reminder, not a legal opinion: see LEGAL-AUDIT.md.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function releaseBlockers({ root, site, products }) {
  const out = [];
  const o = site.operator || {};
  const missing = [
    ['legalName', 'obchodní firma / jméno provozovatele'], ['registeredOffice', 'sídlo'], ['register', 'zápis v rejstříku'],
  ].filter(([k]) => !o[k]).map(([, t]) => t);
  if (!site.contact?.companyId) missing.push('IČO');
  if (!site.contact?.email) missing.push('kontaktní e-mail');
  if (o.vatPayer == null) missing.push('plátce DPH ano/ne');
  if (missing.length) out.push(`Operator identity incomplete: ${missing.join(', ')}`);
  if (!site.business?.customers) out.push('Customer type (b2b / b2c / both) not confirmed');
  if ((site.legal?.status || 'draft') !== 'final') out.push('Legal pages are drafts (legal.status) awaiting business facts and legal review');
  if (!site.privacy?.hostingConfirmed) out.push('Hosting / form provider (Netlify) not confirmed');
  const photos = products.flatMap((p) => p.images.filter((i) => i.rights !== 'cleared').map(() => p.id));
  if (photos.length) out.push(`${photos.length} product photo(s) with unverified usage rights (hidden unless --show-unverified-assets): ${[...new Set(photos)].join(', ')}`);
  try {
    const { assets } = JSON.parse(await readFile(join(root, 'data', 'assets.json'), 'utf8'));
    const open = assets.filter((a) => a.status === 'unverified');
    if (open.length) out.push(`${open.length} media group(s) with unverified usage rights: ${open.map((a) => a.files[0]).join(', ')}`);
  } catch { out.push('data/assets.json missing or invalid'); }
  const unverifiedClaims = Object.entries(site.conditions || {}).filter(([, v]) => !v.verified).map(([k]) => k);
  if (unverifiedClaims.length) out.push(`Condition descriptions not confirmed by the business: ${unverifiedClaims.join(', ')}`);
  if (!site.business?.processClaimsConfirmed) out.push('Claims that every machine is checked, cleaned, repaired and tested before sale are not confirmed (business.processClaimsConfirmed)');
  return out;
}
