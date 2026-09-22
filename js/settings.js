// Panneau de réglages : chaque champ porte le chemin de la valeur qu'il pilote
// (name="wallpaper.dim") et s'applique dès qu'il change.

import { ENGINES, normalize, save } from './store.js';
import {
  applyLook,
  applyWallpaper,
  importFolder,
  libraryEntries,
  libraryRemove,
  libraryRestore,
  storeFile,
} from './wallpaper.js';
import { toast } from './toast.js';

const WALLPAPER_SOURCE_FIELDS = new Set([
  'wallpaper.mode',
  'wallpaper.photoUrl',
  'wallpaper.apiKey',
  'wallpaper.query',
  'wallpaper.collections',
]);

export function initSettings({ config, persist, onChange }) {
  const dialog = document.getElementById('settings-dialog');
  const form = document.getElementById('settings-form');
  const wallpaperStatus = document.getElementById('wallpaper-status');
  const configStatus = document.getElementById('config-status');
  const fileInput = document.getElementById('wallpaper-file');
  const folderInput = document.getElementById('wallpaper-folder');
  const folderAppend = document.getElementById('folder-append');
  const library = document.getElementById('library');
  const libraryStatus = document.getElementById('library-status');
  const exportKey = document.getElementById('export-key');
  const importInput = document.getElementById('config-file');

  const read = (path) => path.split('.').reduce((node, key) => node?.[key], config);
  function write(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((node, key) => node[key], config)[last] = value;
  }

  form.elements['search.engine'].replaceChildren(
    ...Object.entries(ENGINES).map(([id, engine]) => new Option(engine.name, id)),
  );

  function syncVisibility() {
    for (const node of form.querySelectorAll('[data-show-when]')) {
      const [path, accepted] = node.dataset.showWhen.split('=');
      node.hidden = !accepted.split(',').includes(String(read(path)));
    }
    document.getElementById('dim-out').textContent = `${config.wallpaper.dim} %`;
    document.getElementById('blur-out').textContent = `${config.wallpaper.blur} px`;
  }

  /* ---------- Mots-clés de recherche ---------- */

  const keywordList = document.getElementById('keywords');
  const keywordStatus = document.getElementById('keywords-status');
  const KEYWORD_FIELDS = [
    ['key', 'Mot-clé', 'yt'],
    ['name', 'Nom', 'YouTube'],
    ['url', 'Adresse de recherche', 'https://exemple.fr/search?q=%s'],
  ];

  function checkKeywords() {
    const keywords = config.search.keywords;
    const keys = keywords.map((entry) => entry.key).filter(Boolean);
    let message = '';
    if (keywords.some((entry) => entry.url && !entry.url.includes('%s'))) {
      message = 'Chaque adresse doit contenir %s, à la place de la recherche.';
    } else if (new Set(keys).size !== keys.length) {
      message = 'Deux mots-clés sont identiques : seul le premier sera utilisé.';
    }
    keywordStatus.textContent = message;
    keywordStatus.hidden = !message;
  }

  function renderKeywords() {
    keywordList.replaceChildren(
      ...config.search.keywords.map((entry, index) => {
        const row = document.createElement('div');
        row.className = 'keyword';
        row.dataset.index = index;
        for (const [field, label, placeholder] of KEYWORD_FIELDS) {
          const input = document.createElement('input');
          input.className = 'field__input';
          input.type = 'text';
          input.value = entry[field];
          input.placeholder = placeholder;
          input.setAttribute('aria-label', label);
          input.dataset.field = field;
          input.spellcheck = false;
          row.append(input);
        }
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn--danger';
        remove.textContent = 'Retirer';
        remove.setAttribute('aria-label', `Retirer le mot-clé ${entry.key || entry.name}`.trim());
        row.append(remove);
        return row;
      }),
    );
    checkKeywords();
  }

  keywordList.addEventListener('input', (event) => {
    const { field } = event.target.dataset;
    const entry = config.search.keywords[event.target.closest('.keyword')?.dataset.index];
    if (!field || !entry) return;
    // Un mot-clé est un seul mot, en minuscules : c'est ainsi qu'il est reconnu à la saisie.
    if (field === 'key') event.target.value = event.target.value.replace(/\s+/g, '').toLowerCase();
    entry[field] = event.target.value.trim();
    persist();
    checkKeywords();
  });

  keywordList.addEventListener('click', (event) => {
    const row = event.target.closest('.keyword');
    if (!row || event.target.tagName !== 'BUTTON') return;
    config.search.keywords.splice(Number(row.dataset.index), 1);
    persist();
    renderKeywords();
  });

  document.getElementById('keyword-add').addEventListener('click', () => {
    config.search.keywords.push({ key: '', name: '', url: '' });
    persist();
    renderKeywords();
    keywordList.lastElementChild.querySelector('input').focus();
  });

  function fillForm() {
    for (const field of form.elements) {
      if (!field.name) continue;
      if (field.type === 'checkbox') field.checked = !!read(field.name);
      else field.value = read(field.name) ?? '';
    }
    renderKeywords();
    syncVisibility();
  }

  async function refreshWallpaper(options) {
    wallpaperStatus.textContent = 'Chargement…';
    wallpaperStatus.textContent = await applyWallpaper(config, options);
  }

  /* ---------- Bibliothèque d'images ---------- */

  const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;

  async function renderLibrary() {
    if (config.wallpaper.mode !== 'folder') return;
    for (const img of library.querySelectorAll('img')) URL.revokeObjectURL(img.src);
    const entries = await libraryEntries();
    library.replaceChildren(
      ...entries.map(({ key, name, thumb }) => {
        const item = document.createElement('figure');
        item.className = 'library__item';
        item.dataset.key = key;
        const img = document.createElement('img');
        img.alt = name;
        img.title = name;
        img.loading = 'lazy';
        if (thumb) img.src = URL.createObjectURL(thumb);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'library__remove';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Retirer ${name}`);
        item.append(img, remove);
        return item;
      }),
    );
    library.hidden = !entries.length;
    libraryStatus.textContent = entries.length ? `${plural(entries.length, 'image')} dans la bibliothèque.` : '';
  }

  library.addEventListener('click', async (event) => {
    const item = event.target.closest('.library__item');
    if (!item || !event.target.closest('.library__remove')) return;
    const entry = await libraryRemove(Number(item.dataset.key));
    await renderLibrary();
    await applyWallpaper(config);
    toast(`Image « ${entry?.name ?? '' } » retirée.`, {
      action: 'Annuler',
      async onAction() {
        if (entry) await libraryRestore(entry);
        await renderLibrary();
      },
    });
  });

  function onField(event) {
    const field = event.target;
    if (!field.name) return;
    let value = field.value;
    if (field.type === 'checkbox') value = field.checked;
    else if (field.type === 'range') value = Number(field.value);
    // Champ vide ou valeur invalide en cours de saisie : on retient le minimum.
    else if (field.type === 'number') value = Math.max(1, Math.round(Number(field.value)) || 1);
    write(field.name, value);
    persist();
    syncVisibility();
    applyLook(config);
    onChange();
    if (event.type === 'change' && field.type === 'number') field.value = value;
    // Les champs texte ne relancent un téléchargement qu'une fois la saisie validée.
    if (event.type === 'change' && WALLPAPER_SOURCE_FIELDS.has(field.name)) refreshWallpaper();
  }

  form.addEventListener('input', onField);
  form.addEventListener('change', onField);
  form.addEventListener('submit', (event) => event.preventDefault());

  document.getElementById('wallpaper-next').addEventListener('click', () => refreshWallpaper({ force: true }));

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      await storeFile(file);
      await refreshWallpaper();
    } catch (error) {
      wallpaperStatus.textContent = error.message;
    }
  });

  folderInput.addEventListener('change', async () => {
    const files = folderInput.files;
    if (!files.length) return;
    try {
      const { added, skipped } = await importFolder(
        files,
        (done, total) => {
          wallpaperStatus.textContent = `Import des images : ${done} sur ${total}…`;
        },
        { append: folderAppend.checked },
      );
      await applyWallpaper(config, { force: true });
      await renderLibrary();
      wallpaperStatus.textContent =
        `${plural(added, 'image')} ${added > 1 ? 'importées' : 'importée'}.` +
        (skipped ? ` ${plural(skipped, 'fichier')} illisible${skipped > 1 ? 's' : ''} (format non pris en charge).` : '');
    } catch (error) {
      wallpaperStatus.textContent = error.message;
    }
    folderInput.value = '';
  });

  // Le fichier exporté n'emporte ni les dates internes ni, sauf demande, la clé Unsplash :
  // il peut alors être partagé ou versionné sans risque.
  function exportConfig(includeKey) {
    const { createdAt, lastExport, backupSnoozedAt, ...rest } = config;
    const out = structuredClone(rest);
    if (!includeKey) out.wallpaper.apiKey = '';
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `seuil-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    config.lastExport = Date.now();
    persist();
    onChange();
  }

  document.getElementById('config-export').addEventListener('click', () => {
    exportConfig(exportKey.checked);
    configStatus.textContent = exportKey.checked
      ? 'Configuration exportée, avec ta clé Unsplash.'
      : 'Configuration exportée, sans la clé Unsplash.';
  });

  document.getElementById('config-import').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    importInput.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.items)) throw new Error('format');
      const next = normalize(parsed);
      // Un fichier exporté sans clé ne doit pas effacer celle déjà en place.
      if (!next.wallpaper.apiKey) next.wallpaper.apiKey = config.wallpaper.apiKey;
      Object.assign(next, { createdAt: config.createdAt, lastExport: config.lastExport, backupSnoozedAt: 0 });
      await save(next);
      location.reload();
    } catch {
      configStatus.textContent = "Ce fichier n'est pas une configuration Seuil valide. Rien n'a été modifié.";
    }
  });

  document.getElementById('settings-open').addEventListener('click', () => {
    fillForm();
    wallpaperStatus.textContent = '';
    configStatus.textContent = '';
    exportKey.checked = false;
    renderLibrary();
    dialog.showModal();
  });

  form.elements['wallpaper.mode'].addEventListener('change', renderLibrary);

  return {
    exportConfig,
    // Configuration remplacée depuis un autre onglet : on rafraîchit le panneau s'il est ouvert.
    refresh() {
      if (dialog.open) fillForm();
    },
  };
}
