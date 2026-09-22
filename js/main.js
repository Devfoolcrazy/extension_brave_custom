import { load, normalize, onExternalChange, save } from './store.js';
import { applyLook, applyWallpaper, paintPlaceholder, rotates } from './wallpaper.js';
import { initSearch } from './search.js';
import { initTiles } from './tiles.js';
import { initSettings } from './settings.js';
import { setIconSource } from './icons.js';
import { currentLibraryKey, libraryRemove, libraryRestore } from './wallpaper.js';
import { toast } from './toast.js';

paintPlaceholder();

const config = await load();

// Empreinte d'une configuration, indépendante de l'ordre de ses clés.
const fingerprint = (value) => JSON.stringify(normalize(value));

let saveTimer;
let lastWritten = fingerprint(config);
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    lastWritten = fingerprint(config);
    save(config);
  }, 150);
}

/* ---------- Horloge ---------- */

const timeEl = document.getElementById('clock-time');
const dateEl = document.getElementById('clock-date');

function tick() {
  const now = new Date();
  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: config.clock.hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    second: config.clock.seconds ? '2-digit' : undefined,
    hour12: config.clock.hour12,
  }).format(now);
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);

  if (timeEl.textContent !== time) {
    timeEl.textContent = time;
    timeEl.dateTime = now.toISOString();
  }
  if (dateEl.textContent !== date) dateEl.textContent = date;
}

function scheduleTick() {
  tick();
  setTimeout(scheduleTick, 1000 - (Date.now() % 1000));
}

/* ---------- Boîtes de dialogue ---------- */

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) return dialog.close();
    // Un clic sur le fond arrive sur le <dialog> lui-même, mais hors de son rectangle.
    const box = dialog.getBoundingClientRect();
    const outside =
      event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (event.target === dialog && outside) dialog.close();
  });
}

/* ---------- Démarrage ---------- */

function applyAccent() {
  document.documentElement.style.setProperty('--accent', config.accent);
}

/* ---------- Rappel de sauvegarde ---------- */

const MONTH = 30 * 86400e3;
const backupHint = document.getElementById('backup-hint');

// Un mois sans export (ou depuis la première utilisation), et pas de « plus tard » récent.
function applyBackupHint() {
  const reference = Math.max(config.lastExport, config.backupSnoozedAt, config.createdAt);
  backupHint.hidden = Date.now() - reference < MONTH;
}

document.getElementById('backup-export').addEventListener('click', () => {
  settings.exportConfig(false);
  toast('Configuration exportée dans tes téléchargements.');
});
document.getElementById('backup-later').addEventListener('click', () => {
  config.backupSnoozedAt = Date.now();
  persist();
  applyBackupHint();
});

/* ---------- Image en cours (dossier d'images) ---------- */

const skipButton = document.getElementById('wallpaper-skip');

function applySkipButton() {
  skipButton.hidden = config.wallpaper.mode !== 'folder';
}

skipButton.addEventListener('click', async () => {
  const key = await currentLibraryKey();
  if (key === undefined) return;
  const entry = await libraryRemove(key);
  await applyWallpaper(config, { force: true });
  toast(`Image « ${entry?.name ?? ''} » retirée de la bibliothèque.`, {
    action: 'Annuler',
    onAction: () => entry && libraryRestore(entry),
  });
});

/* ---------- Raccourcis clavier ---------- */

// 1 à 9 : n-ième raccourci de l'accueil. e : mode modification.
document.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
  if (document.querySelector('dialog[open]')) return;
  if (/^[1-9]$/.test(event.key)) {
    const link = tiles.rootLink(Number(event.key));
    if (!link) return;
    event.preventDefault();
    if (event.shiftKey) window.open(link.url, '_blank', 'noopener');
    else location.href = link.url;
  } else if (event.key === 'e' || event.key === 'E') {
    event.preventDefault();
    tiles.toggleEdit();
  }
});

function applyAll() {
  applyAccent();
  applyLook(config);
  setIconSource(config.icons);
  search.apply();
  tick();
  applyBackupHint();
  applySkipButton();
}

const search = initSearch({ config });
const tiles = initTiles({ config, persist });
const settings = initSettings({
  config,
  persist,
  onChange() {
    applyAll();
    tiles.render();
  },
});
applyAll();
scheduleTick();
applyWallpaper(config);

// Onglet laissé ouvert : la rotation continue. applyWallpaper ne change l'image
// que si l'intervalle choisi est écoulé.
setInterval(() => {
  if (rotates(config.wallpaper) && config.wallpaper.refresh !== 'tab' && !document.hidden) applyWallpaper(config);
}, 60e3);

// La configuration a été modifiée dans un autre onglet : on l'adopte telle quelle.
// Sans cela, la prochaine sauvegarde d'ici écraserait ce qui a été fait là-bas.
onExternalChange((fresh) => {
  // chrome.storage notifie aussi l'onglet qui écrit. Cet écho peut arriver alors que
  // d'autres modifications locales attendent déjà leur sauvegarde : il ne doit rien écraser.
  const incoming = fingerprint(fresh);
  if (incoming === lastWritten || incoming === fingerprint(config)) return;
  lastWritten = incoming;
  clearTimeout(saveTimer);
  for (const key of Object.keys(config)) delete config[key];
  Object.assign(config, fresh);

  applyAll();
  tiles.render();
  settings.refresh();
  applyWallpaper(config);
});
