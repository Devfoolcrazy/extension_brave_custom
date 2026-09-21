import { load, normalize, onExternalChange, save } from './store.js';
import { applyLook, applyWallpaper, paintPlaceholder, rotates } from './wallpaper.js';
import { initSearch } from './search.js';
import { initTiles } from './tiles.js';
import { initSettings } from './settings.js';

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

applyAccent();
applyLook(config);
scheduleTick();
const search = initSearch({ config });
const tiles = initTiles({ config, persist });
const settings = initSettings({
  config,
  persist,
  onChange() {
    applyAccent();
    search.apply();
    tick();
  },
});
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

  applyAccent();
  applyLook(config);
  search.apply();
  tick();
  tiles.render();
  settings.refresh();
  applyWallpaper(config);
});
