// Data access for the local admin prototype. Everything the admin and the customer pages read or
// write goes through the object createLocalStore() returns, so a real backend can replace this file
// with the same methods (load, save, putPhoto, photoUrls, deletePhotos, usage, exportBackup,
// readBackup, importBackup, reset) talking to an API instead of the browser.
//
// Here: the catalogue (texts, prices, order) is one JSON document in localStorage; photos are
// Blobs in IndexedDB, referenced from the catalogue as "idb:<id>". Both stay in this browser on
// this device only.
import { isListed } from './lib/catalog.js';

export const KEY = 'pouzite-automaty:prototyp:v2';
const OLD_KEY = 'pouzite-automaty:prototyp:v1';
const DB_NAME = 'pouzite-automaty-prototyp';
const PHOTOS = 'fotky';
export const BACKUP_FORMAT = 'pouzite-automaty-katalog';
export const STATUSES = ['published', 'draft', 'hidden'];
export const AVAILABILITY = ['Skladem', 'Na objednávku', 'Rezervováno', 'Prodáno'];
export const MAX_PRICE = 50000000;

const clone = (v) => JSON.parse(JSON.stringify(v));

export class StoreError extends Error {
  constructor(userMessage, cause) { super(userMessage); this.userMessage = userMessage; this.cause = cause; }
}
const quota = (e) => e && (e.name === 'QuotaExceededError' || e.code === 22 || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
const saveError = (e) => new StoreError(quota(e)
  ? 'Změny se nepodařilo uložit: úložiště tohoto prohlížeče je plné. Odeberte některé fotografie nebo stáhněte zálohu a smažte staré automaty z koše. Nic nebylo uloženo.'
  : 'Změny se nepodařilo uložit, protože prohlížeč ukládání nepovoluje (například v anonymním okně nebo se zablokovanými daty webů). Nic nebylo uloženo.', e);

/* ---------- IndexedDB for photos (with a fallback to inline data URLs) ---------- */
let dbPromise;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('no-idb'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(PHOTOS);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    }).catch((e) => { dbPromise = null; throw e; });
  }
  return dbPromise;
}
function tx(mode, run) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(PHOTOS, mode);
    const store = t.objectStore(PHOTOS);
    let result;
    Promise.resolve(run(store, (r) => { result = r; })).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('abort'));
  }));
}
const reqValue = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});
function dataUrlToBlob(url) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
  if (!m) return null;
  const bin = atob(m[2].replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
export const isStoredPhoto = (src) => typeof src === 'string' && src.startsWith('idb:');

// Every photo reference in the catalogue (including the trash), for "is anything still using it".
export const photoRefs = (products) => new Set(products.flatMap((p) => (p.images || []).map((i) => i.src)).filter(isStoredPhoto));

/* ---------- catalogue document ---------- */
// Older saves (v1, from the first prototype) had only products; everything new gets defaults.
function normalise(data) {
  const products = (data.products || []).map((p) => ({
    description: [], specs: [], features: [], paymentSystems: [], images: [],
    ...p,
    status: STATUSES.includes(p.status) ? p.status : 'published',
  }));
  return {
    version: 2,
    savedAt: data.savedAt || null,
    products,
    order: Array.isArray(data.order) ? data.order.filter((id) => typeof id === 'string') : [],
    catOrder: data.catOrder && typeof data.catOrder === 'object' ? data.catOrder : {},
  };
}

export function createLocalStore(seed) {
  const fromSeed = () => normalise({ products: clone(seed.products) });

  return {
    kind: 'local',
    describe: 'jen v tomto prohlížeči na tomto zařízení',

    // { state, source: 'local' | 'seed', error? }. Never throws: a broken save falls back to the
    // built catalogue and reports why.
    load() {
      try {
        const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
        if (!raw) return { state: fromSeed(), source: 'seed' };
        const data = JSON.parse(raw);
        if (!data || !Array.isArray(data.products)) throw new Error('Neplatná data');
        return { state: normalise(data), source: 'local' };
      } catch (e) {
        return { state: fromSeed(), source: 'seed', error: e };
      }
    },

    // Writes the whole catalogue and reads it back; resolves only once it is really stored.
    async save(state) {
      const doc = { ...normalise(state), savedAt: new Date().toISOString() };
      const json = JSON.stringify(doc);
      try {
        localStorage.setItem(KEY, json);
        if (localStorage.getItem(KEY) !== json) throw new Error('verify');
        localStorage.removeItem(OLD_KEY);
      } catch (e) {
        throw saveError(e);
      }
      return doc;
    },

    // Stores a photo and returns the reference to put in images[].src.
    async putPhoto(blob) {
      try {
        const id = `idb:${newId()}`;
        await tx('readwrite', (s) => { s.put(blob, id); });
        return id;
      } catch (e) {
        if (quota(e)) throw saveError(e);
        // IndexedDB unavailable: keep the photo inline in the catalogue (smaller capacity)
        return blobToDataUrl(blob);
      }
    },

    // Map of reference -> object URL for the stored photos asked for (missing ones are left out).
    async photoUrls(refs) {
      const out = new Map();
      const want = [...refs].filter(isStoredPhoto);
      if (!want.length) return out;
      try {
        await tx('readonly', async (s) => {
          for (const ref of want) {
            const blob = await reqValue(s.get(ref));
            if (blob) out.set(ref, URL.createObjectURL(blob));
          }
        });
      } catch (e) { /* no IndexedDB: those photos show the neutral drawing */ }
      return out;
    },

    // Deletes stored photos that nothing in `keepFrom` uses any more: only the `candidates` given,
    // or every stored photo when none are given (reset, import). A photo shared by a duplicate
    // stays while any machine, including one in the trash, still uses it. Photos of the built
    // site (files) are never touched.
    async deleteUnused(keepFrom, candidates = null) {
      const keep = photoRefs(keepFrom);
      try {
        await tx('readwrite', async (s) => {
          const keys = candidates ? [...candidates].filter(isStoredPhoto) : await reqValue(s.getAllKeys());
          for (const k of keys) if (!keep.has(k)) s.delete(k);
        });
      } catch (e) { /* nothing to clean */ }
    },

    async usage(state) {
      let photos = 0;
      try { photos = await tx('readonly', (s, done) => reqValue(s.count()).then(done)); } catch (e) { /* none */ }
      let estimate = null;
      try { estimate = await navigator.storage?.estimate?.(); } catch (e) { /* unknown */ }
      return { catalogueBytes: new Blob([JSON.stringify(state)]).size, photos, estimate };
    },

    // The whole catalogue as one JSON-ready object, photos included as data URLs.
    async exportBackup(state) {
      const media = {};
      const refs = photoRefs(state.products);
      const blobs = new Map();
      if (refs.size) {
        // read every blob inside the transaction, convert after it (FileReader would end it)
        await tx('readonly', async (s) => {
          for (const ref of refs) {
            const blob = await reqValue(s.get(ref));
            if (blob) blobs.set(ref, blob);
          }
        }).catch(() => {});
      }
      for (const [ref, blob] of blobs) media[ref] = await blobToDataUrl(blob);
      return { format: BACKUP_FORMAT, version: 2, exportedAt: new Date().toISOString(), ...normalise(state), media };
    },

    // Parses and checks a backup file. Returns { ok, errors, warnings, summary, data }.
    readBackup(text) {
      return validateBackup(text, seed);
    },

    // Replaces the catalogue in this browser with a checked backup.
    async importBackup(data) {
      const map = new Map();
      for (const [ref, url] of Object.entries(data.media || {})) {
        const blob = dataUrlToBlob(url);
        if (blob) map.set(ref, await this.putPhoto(blob));
      }
      const products = data.products.map((p) => ({
        ...p,
        images: (p.images || []).flatMap((img) => {
          if (!isStoredPhoto(img.src)) return [img];
          return map.has(img.src) ? [{ ...img, src: map.get(img.src) }] : [];
        }),
      }));
      const doc = await this.save({ ...data, products });
      await this.deleteUnused(doc.products);
      return normalise(doc);
    },

    async reset() {
      try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch (e) { throw saveError(e); }
      await this.deleteUnused([]);
      return fromSeed();
    },
  };
}

/* ---------- backup checks ---------- */
const MEDIA_RE = /^data:image\/(?:jpeg|png|webp|gif);base64,/;
export function validateBackup(text, seed) {
  const errors = [];
  const warnings = [];
  let data;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, errors: ['Soubor není platná záloha: nejde o soubor JSON.'], warnings }; }
  if (!data || typeof data !== 'object' || !Array.isArray(data.products)) {
    return { ok: false, errors: ['Soubor není záloha katalogu: chybí seznam automatů.'], warnings };
  }
  if (data.format && data.format !== BACKUP_FORMAT) errors.push('Soubor je záloha jiného typu.');
  const cats = new Set(seed.categories.map((c) => c.slug));
  const ids = new Set();
  const media = data.media && typeof data.media === 'object' ? data.media : {};
  for (const [ref, url] of Object.entries(media)) {
    if (!isStoredPhoto(ref) || typeof url !== 'string' || !MEDIA_RE.test(url)) errors.push(`Fotografie ${String(ref).slice(0, 40)} v záloze je poškozená.`);
  }
  let missingPhotos = 0;
  data.products.forEach((p, i) => {
    const where = `Automat č. ${i + 1}${p && typeof p.name === 'string' && p.name ? ` („${p.name.slice(0, 60)}“)` : ''}`;
    if (!p || typeof p !== 'object') { errors.push(`${where}: neplatný záznam.`); return; }
    if (typeof p.id !== 'string' || !p.id) errors.push(`${where}: chybí identifikátor.`);
    else if (ids.has(p.id)) errors.push(`${where}: identifikátor se opakuje.`);
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim()) errors.push(`${where}: chybí název.`);
    if (typeof p.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)) errors.push(`${where}: neplatná adresa stránky.`);
    if (!cats.has(p.category)) errors.push(`${where}: neznámá kategorie.`);
    if (p.price != null && !(Number.isInteger(p.price) && p.price > 0 && p.price <= MAX_PRICE)) errors.push(`${where}: cena musí být celé kladné číslo, nebo prázdná (Cena na dotaz).`);
    if (p.status != null && !STATUSES.includes(p.status)) errors.push(`${where}: neznámý stav zveřejnění.`);
    if (p.availability != null && !AVAILABILITY.includes(p.availability)) errors.push(`${where}: neznámá dostupnost.`);
    if (p.condition && !seed.site.conditions[p.condition]) errors.push(`${where}: neznámý stav automatu.`);
    if (p.images != null && !Array.isArray(p.images)) errors.push(`${where}: fotografie mají neplatný formát.`);
    for (const img of p.images || []) {
      if (!img || typeof img.src !== 'string') { errors.push(`${where}: fotografie bez souboru.`); continue; }
      if (isStoredPhoto(img.src) && !media[img.src]) missingPhotos++;
    }
    const d = p.discount;
    if (d != null && (typeof d !== 'object' || !['percent', 'amount', 'price'].includes(d.method) || (d.start && Number.isNaN(Date.parse(d.start))) || (d.end && Number.isNaN(Date.parse(d.end))))) {
      errors.push(`${where}: sleva má neplatný formát.`);
    }
  });
  if (missingPhotos) warnings.push(`${missingPhotos} ${missingPhotos === 1 ? 'fotografie v záloze chybí a nebude obnovena' : 'fotografií v záloze chybí a nebudou obnoveny'}.`);
  const list = data.products;
  const live = list.filter((p) => !p.deletedAt);
  const summary = {
    total: list.length,
    published: live.filter((p) => (p.status || 'published') === 'published').length,
    listed: live.filter((p) => isListed(p)).length,
    draft: live.filter((p) => p.status === 'draft').length,
    hidden: live.filter((p) => p.status === 'hidden').length,
    trash: list.length - live.length,
    photos: Object.keys(media).length,
    exportedAt: typeof data.exportedAt === 'string' && !Number.isNaN(Date.parse(data.exportedAt)) ? data.exportedAt : null,
  };
  return { ok: errors.length === 0, errors, warnings, summary, data: errors.length ? null : data };
}
