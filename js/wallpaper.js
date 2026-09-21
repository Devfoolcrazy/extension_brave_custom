// Fond d'écran : récupération (Unsplash ou adresse directe), cache IndexedDB, affichage.
//
// L'image affichée vient toujours du cache quand il existe. Quand elle est périmée
// (mode « par thème »), la suivante est téléchargée en arrière-plan et montrée au
// prochain onglet : jamais d'attente réseau à l'ouverture.

const DB_NAME = 'seuil';
const STORE = 'wallpaper';
const LIBRARY = 'library'; // images importées depuis un dossier
const COLOR_KEY = 'wallpaper-color';
const REFERRAL = 'utm_source=seuil&utm_medium=referral';

const layer = () => document.getElementById('wallpaper');

/* ---------- IndexedDB ---------- */

let dbPromise;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const names = req.result.objectStoreNames;
      if (!names.contains(STORE)) req.result.createObjectStore(STORE);
      if (!names.contains(LIBRARY)) req.result.createObjectStore(LIBRARY, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idb(mode, run, storeName = STORE) {
  const store = (await db()).transaction(storeName, mode).objectStore(storeName);
  return new Promise((resolve, reject) => {
    const req = run(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const get = (key) => idb('readonly', (s) => s.get(key)).catch(() => undefined);
const put = (key, value) => idb('readwrite', (s) => s.put(value, key));
const del = (key) => idb('readwrite', (s) => s.delete(key)).catch(() => {});

const libraryKeys = () => idb('readonly', (s) => s.getAllKeys(), LIBRARY).catch(() => []);
const libraryGet = (key) => idb('readonly', (s) => s.get(key), LIBRARY);

/* ---------- Apparence ---------- */

export function applyLook({ wallpaper }) {
  const root = document.documentElement.style;
  root.setProperty('--dim', String(wallpaper.dim / 100));
  root.setProperty('--blur', `${wallpaper.blur}px`);
}

// Couleur dominante de la dernière photo, posée avant toute lecture asynchrone
// pour que l'onglet ne s'ouvre pas sur un aplat sans rapport avec l'image.
export function paintPlaceholder() {
  try {
    const color = localStorage.getItem(COLOR_KEY);
    if (color) document.documentElement.style.setProperty('--placeholder', color);
  } catch {}
}

function rememberColor(color) {
  try {
    if (color) localStorage.setItem(COLOR_KEY, color);
    else localStorage.removeItem(COLOR_KEY);
  } catch {}
}

/* ---------- Unsplash ---------- */

function apiError(status) {
  if (status === 401) return "Unsplash refuse cette clé d'accès. Vérifie-la.";
  if (status === 403 || status === 429) return 'Limite de requêtes Unsplash atteinte. Réessaie dans une heure.';
  if (status === 404) return 'Aucune photo ne correspond.';
  return `Unsplash a répondu avec une erreur (${status}).`;
}

async function api(pathOrUrl, key) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `https://api.unsplash.com${pathOrUrl}`;
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
  });
  if (!res.ok) throw new Error(apiError(res.status));
  return res.json();
}

const targetWidth = () =>
  Math.min(3840, Math.max(1600, Math.ceil(screen.width * (window.devicePixelRatio || 1))));

function sized(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.set('w', targetWidth());
  url.searchParams.set('q', '80');
  url.searchParams.set('fm', 'jpg');
  url.searchParams.set('fit', 'max');
  return url.toString();
}

function fromApiPhoto(photo, key) {
  // Exigé par les conditions de l'API : signaler l'utilisation de la photo.
  if (photo.links?.download_location) api(photo.links.download_location, key).catch(() => {});
  return {
    imageUrl: sized(photo.urls.raw),
    meta: {
      author: photo.user?.name || '',
      authorUrl: photo.user?.links?.html ? `${photo.user.links.html}?${REFERRAL}` : '',
      pageUrl: photo.links?.html ? `${photo.links.html}?${REFERRAL}` : '',
      color: photo.color || '',
    },
  };
}

// L'identifiant d'une photo Unsplash : les 11 derniers caractères de son adresse.
function unsplashPhotoId(url) {
  if (!/(^|\.)unsplash\.com$/.test(url.hostname) || url.hostname.startsWith('images.')) return null;
  const match = url.pathname.match(/^\/(?:[a-z]{2}\/)?photos\/([^/]+)/);
  return match ? match[1].slice(-11) : null;
}

async function resolve(wallpaper) {
  const key = wallpaper.apiKey.trim();

  if (wallpaper.mode === 'api') {
    if (!key) throw new Error("Ajoute ta clé d'accès Unsplash pour choisir des photos par thème.");
    const params = new URLSearchParams({ orientation: 'landscape', content_filter: 'high' });
    if (wallpaper.query.trim()) params.set('query', wallpaper.query.trim());
    if (wallpaper.collections.trim()) params.set('collections', wallpaper.collections.replace(/\s+/g, ''));
    return fromApiPhoto(await api(`/photos/random?${params}`, key), key);
  }

  const input = wallpaper.photoUrl.trim();
  if (!input) throw new Error("Colle l'adresse d'une photo.");
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error("Cette adresse n'est pas valide.");
  }

  const id = unsplashPhotoId(url);
  if (id && key) return fromApiPhoto(await api(`/photos/${id}`, key), key);
  if (id) {
    return {
      imageUrl: `https://unsplash.com/photos/${id}/download?force=true&w=${targetWidth()}`,
      meta: { pageUrl: `https://unsplash.com/photos/${id}?${REFERRAL}` },
    };
  }
  if (url.hostname === 'images.unsplash.com') {
    return { imageUrl: sized(`${url.origin}${url.pathname}`), meta: {} };
  }
  return { imageUrl: url.toString(), meta: {} };
}

async function fetchRecord(wallpaper, key) {
  const { imageUrl, meta } = await resolve(wallpaper);
  const record = { key, meta, since: Date.now() };
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    if (!blob.type.startsWith('image/')) throw new Error('type');
    record.blob = blob;
  } catch {
    // Hôte sans CORS : l'image s'affiche quand même, mais sans cache local.
    record.directUrl = imageUrl;
  }
  return record;
}

/* ---------- Affichage ---------- */

let objectUrl;
let shownId;

// Identifie ce qui est à l'écran, pour ne pas rejouer le fondu sur la même image
// quand la minuterie de rotation repasse sans que l'intervalle soit écoulé.
const idOf = (record) => `${record.key}|${record.libraryKey ?? ''}|${record.since}`;

async function show(record) {
  const el = layer();
  if (shownId === idOf(record) && el.classList.contains('is-visible')) return;
  const src = record.blob ? URL.createObjectURL(record.blob) : record.directUrl;

  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    if (record.blob) URL.revokeObjectURL(src);
    throw new Error("L'image n'a pas pu être chargée. Vérifie l'adresse.");
  }

  if (el.classList.contains('is-visible')) {
    el.classList.remove('is-visible');
    await new Promise((done) => setTimeout(done, 260));
  }
  el.style.backgroundImage = `url("${src}")`;
  el.classList.add('is-visible');
  document.body.classList.add('has-wallpaper');

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = record.blob ? src : undefined;
  shownId = idOf(record);

  rememberColor(record.meta?.color);
  renderCredit(record.meta);
}

function clear() {
  const el = layer();
  shownId = undefined;
  el.classList.remove('is-visible');
  el.style.backgroundImage = '';
  document.body.classList.remove('has-wallpaper');
  rememberColor('');
  renderCredit(null);
}

function anchor(text, href) {
  const a = document.createElement('a');
  a.textContent = text;
  a.href = href;
  a.rel = 'noopener';
  return a;
}

function renderCredit(meta) {
  const el = document.getElementById('credit');
  el.replaceChildren();
  if (!meta) return;
  if (meta.author) {
    el.append(
      'Photo de ',
      meta.authorUrl ? anchor(meta.author, meta.authorUrl) : meta.author,
      ' sur ',
      anchor('Unsplash', meta.pageUrl || `https://unsplash.com/?${REFERRAL}`),
    );
  } else if (meta.pageUrl) {
    el.append(anchor('Voir la photo sur Unsplash', meta.pageUrl));
  }
}

/* ---------- Orchestration ---------- */

function sourceKey(w) {
  return w.mode === 'api'
    ? `api|${w.query.trim()}|${w.collections.trim()}`
    : `url|${w.photoUrl.trim()}|${w.apiKey.trim() ? 'key' : ''}`;
}

const UNIT_MS = { min: 60e3, hour: 3600e3, day: 86400e3 };

export function rotates({ mode }) {
  return mode === 'api' || mode === 'folder';
}

function isStale(record, wallpaper) {
  if (!rotates(wallpaper)) return false;
  const age = Date.now() - record.since;
  switch (wallpaper.refresh) {
    case 'tab': return true;
    case 'quarter': return age > 900e3;
    case 'custom': return age > Math.max(1, wallpaper.refreshEvery) * UNIT_MS[wallpaper.refreshUnit];
    case 'hourly': return age > 3600e3;
    case 'daily': return new Date(record.since).toDateString() !== new Date().toDateString();
    default: return false;
  }
}

// Renvoie un message d'erreur à afficher, ou '' si tout s'est bien passé.
export async function applyWallpaper({ wallpaper }, { force = false } = {}) {
  try {
    if (wallpaper.mode === 'none') {
      clear();
      return '';
    }

    if (wallpaper.mode === 'file') {
      const file = await get('file');
      if (!file) {
        clear();
        return 'Choisis une image.';
      }
      await show(file);
      return '';
    }

    if (wallpaper.mode === 'folder') {
      const keys = await libraryKeys();
      if (!keys.length) {
        clear();
        return "Choisis un dossier d'images.";
      }
      let current = await get('current');
      if (current?.key !== 'folder' || !keys.includes(current.libraryKey)) current = null;
      if (force || !current || isStale(current, wallpaper)) {
        const others = keys.filter((key) => key !== current?.libraryKey);
        const pool = others.length ? others : keys;
        current = { key: 'folder', libraryKey: pool[Math.floor(Math.random() * pool.length)], since: Date.now() };
        await put('current', current);
      }
      await show({ ...current, blob: (await libraryGet(current.libraryKey)).blob, meta: {} });
      return '';
    }

    const key = sourceKey(wallpaper);
    let current = await get('current');
    let next = await get('next');
    if (current?.key !== key) current = null;
    if (next?.key !== key) next = null;

    if (force || !current) {
      try {
        const fresh = await fetchRecord(wallpaper, key);
        await show(fresh);
        current = fresh;
        await put('current', fresh);
        await del('next');
        next = null;
      } catch (error) {
        // On garde l'ancienne image à l'écran plutôt qu'un fond vide.
        if (current) await show(current).catch(() => {});
        else clear();
        throw error;
      }
    } else {
      if (next && isStale(current, wallpaper)) {
        current = { ...next, since: Date.now() };
        await put('current', current);
        await del('next');
        next = null;
      }
      await show(current);
    }

    if (!next && isStale(current, wallpaper)) {
      fetchRecord(wallpaper, key).then((record) => put('next', record)).catch(() => {});
    }
    return '';
  } catch (error) {
    return error.message || "Le fond d'écran n'a pas pu être chargé.";
  }
}

export const libraryCount = () => idb('readonly', (s) => s.count(), LIBRARY).catch(() => 0);

// Ramène une image à la largeur utile de l'écran : un dossier de photos d'appareil
// pèserait sinon plusieurs centaines de Mo une fois copié dans le navigateur.
async function fitToScreen(file) {
  const bitmap = await createImageBitmap(file);
  const limit = targetWidth();
  const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1.5e6) {
    bitmap.close();
    return file;
  }
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });
}

// Remplace la bibliothèque par les images du dossier choisi (sous-dossiers compris).
// Renvoie { added, skipped } ; ne touche à rien si aucune image n'est lisible.
export async function importFolder(fileList, onProgress = () => {}) {
  const files = [...fileList].filter((file) => file.type.startsWith('image/'));
  const blobs = [];
  let skipped = 0;
  for (const [index, file] of files.entries()) {
    onProgress(index + 1, files.length);
    try {
      blobs.push({ blob: await fitToScreen(file), name: file.name });
    } catch {
      skipped += 1; // format que le navigateur ne sait pas décoder (HEIC, RAW…)
    }
  }
  if (!blobs.length) throw new Error("Aucune image lisible dans ce dossier.");

  await idb('readwrite', (s) => s.clear(), LIBRARY);
  for (const entry of blobs) await idb('readwrite', (s) => s.add(entry), LIBRARY);
  await del('current');
  return { added: blobs.length, skipped };
}

export async function storeFile(file) {
  if (!file.type.startsWith('image/')) throw new Error("Ce fichier n'est pas une image.");
  await put('file', { blob: file, meta: {}, since: Date.now() });
}
