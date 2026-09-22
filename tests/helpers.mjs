// Aides partagées par les tests : page vierge, lecture de la config, images de test.

export async function freshPage(page, { chromeStub = false } = {}) {
  if (chromeStub) await installChromeStub(page);
  await page.goto('/newtab.html');
  await page.evaluate(() => {
    localStorage.clear();
    indexedDB.deleteDatabase('seuil');
  });
  await page.reload();
  await page.waitForSelector('#tiles .tile');
  // window.open est remplacé : on note les adresses au lieu d'ouvrir des fenêtres.
  await page.evaluate(() => {
    window.__opened = [];
    window.open = (url) => {
      window.__opened.push(url);
      return null;
    };
  });
}

export const opened = (page) => page.evaluate(() => window.__opened.splice(0));

// La sauvegarde est différée de 150 ms après une modification : on attend qu'elle existe.
export async function storedConfig(page) {
  await page.waitForFunction(() => localStorage.getItem('config') !== null);
  return page.evaluate(() => JSON.parse(localStorage.getItem('config')));
}

// Écrit une configuration partielle avant le chargement ; le reste prend les valeurs par défaut.
export async function seedConfig(page, partial) {
  await page.evaluate((json) => localStorage.setItem('config', json), JSON.stringify(partial));
  await page.reload();
  await page.waitForSelector('#tiles .tile');
}

export const tileNames = (page, container) =>
  page.$$eval(`${container} .tile[data-id] .tile__label`, (labels) => labels.map((l) => l.textContent));

// Simule le minimum de chrome.* utilisé par la page (stockage, onglets, favicons).
async function installChromeStub(page) {
  await page.addInitScript(() => {
    const memory = {};
    window.__tabs = [];
    window.chrome = {
      runtime: { id: 'stub', getURL: (path) => location.origin + path },
      storage: {
        local: {
          get: async (key) => ({ [key]: memory[key] }),
          set: async (object) => Object.assign(memory, object),
        },
        onChanged: { addListener() {} },
      },
      tabs: {
        getCurrent: async () => ({ index: 4 }),
        create: async (options) => {
          window.__tabs.push(options);
          return {};
        },
      },
    };
  });
}

// Crée une image unie dans la page et l'ajoute à une file d'attente, puis `feedFolder`
// la soumet au champ « Dossier » comme si l'utilisateur avait choisi ces fichiers.
export async function makeImage(page, { color, name, width = 800, height = 500 }) {
  await page.evaluate(
    async ([color, name, width, height]) => {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      (window.__files ??= []).push(new File([blob], name, { type: 'image/png' }));
    },
    [color, name, width, height],
  );
}

export async function feedFolder(page, extraFiles = []) {
  await page.evaluate((extra) => {
    const transfer = new DataTransfer();
    for (const file of window.__files?.splice(0) ?? []) transfer.items.add(file);
    for (const { content, name, type } of extra) transfer.items.add(new File([content], name, { type }));
    const input = document.querySelector('#wallpaper-folder');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, extraFiles);
  await page.waitForFunction(() => /importée|illisible|Aucune/.test(document.querySelector('#wallpaper-status').textContent));
}

// Accès direct à IndexedDB, pour lire l'état sans passer par l'interface.
export const idb = (page, fn) => page.evaluate(`(async () => {
  const db = await new Promise((resolve) => { const q = indexedDB.open('seuil'); q.onsuccess = () => resolve(q.result); });
  const req = (store, mode, run) => new Promise((resolve) => { const r = run(db.transaction(store, mode).objectStore(store)); r.onsuccess = () => resolve(r.result); });
  try { return await (${fn})(req); } finally { db.close(); }
})()`);

export const currentWallpaper = (page) => idb(page, `(req) => req('wallpaper', 'readonly', (s) => s.get('current'))`);
export const libraryCount = (page) => idb(page, `(req) => req('library', 'readonly', (s) => s.count())`);
