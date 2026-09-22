// Configuration persistée. chrome.storage.local dans l'extension,
// localStorage quand la page est ouverte hors extension (développement).

const KEY = 'config';

export const isExtension =
  typeof chrome !== 'undefined' && !!chrome.storage?.local && !!chrome.runtime?.id;

export const ENGINES = {
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  kagi: { name: 'Kagi', url: 'https://kagi.com/search?q=%s' },
  qwant: { name: 'Qwant', url: 'https://www.qwant.com/?q=%s' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/sp/search?query=%s' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
  custom: { name: 'Autre moteur', url: '' },
};

export const uid = () => Math.random().toString(36).slice(2, 10);

const link = (title, url) => ({ id: uid(), type: 'link', title, url, icon: '' });

export function defaults() {
  return {
    version: 1,
    search: {
      engine: 'brave',
      customUrl: '',
      newTab: false,
      keywords: [
        { key: 'yt', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
        { key: 'gh', name: 'GitHub', url: 'https://github.com/search?q=%s' },
        { key: 'w', name: 'Wikipédia', url: 'https://fr.wikipedia.org/w/index.php?search=%s' },
        { key: 'mdn', name: 'MDN', url: 'https://developer.mozilla.org/fr/search?q=%s' },
      ],
    },
    clock: { hour12: false, seconds: false },
    wallpaper: {
      mode: 'url',
      photoUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4',
      apiKey: '',
      query: '',
      collections: '',
      refresh: 'daily',
      refreshEvery: 30,
      refreshUnit: 'min',
      autoDim: true,
      dim: 25,
      blur: 0,
    },
    accent: '#f2b84b',
    icons: 'browser', // ou 'duckduckgo'
    createdAt: Date.now(),
    lastExport: 0,
    backupSnoozedAt: 0,
    items: [
      link('GitHub', 'https://github.com'),
      link('GitLab', 'https://gitlab.com'),
      link('Gmail', 'https://mail.google.com'),
      link('YouTube', 'https://www.youtube.com'),
      {
        id: uid(),
        type: 'folder',
        title: 'Outils',
        items: [
          link('Claude', 'https://claude.ai'),
          link('Unsplash', 'https://unsplash.com'),
          link('MDN', 'https://developer.mozilla.org'),
        ],
      },
    ],
  };
}

// Fusionne une config sauvegardée (ou importée) avec les valeurs par défaut,
// pour qu'un champ ajouté dans une version ultérieure ait toujours une valeur.
export function normalize(saved) {
  const base = defaults();
  if (!saved || typeof saved !== 'object') return base;
  return {
    ...base,
    ...saved,
    search: {
      ...base.search,
      ...saved.search,
      keywords: Array.isArray(saved.search?.keywords)
        ? saved.search.keywords.map(cleanKeyword).filter(Boolean)
        : base.search.keywords,
    },
    clock: { ...base.clock, ...saved.clock },
    wallpaper: { ...base.wallpaper, ...saved.wallpaper },
    items: Array.isArray(saved.items) ? saved.items.map(cleanItem).filter(Boolean) : base.items,
  };
}

function cleanKeyword(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return { key: String(entry.key || ''), name: String(entry.name || ''), url: String(entry.url || '') };
}

function cleanItem(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.type === 'folder') {
    return {
      id: item.id || uid(),
      type: 'folder',
      title: String(item.title || 'Dossier'),
      items: (Array.isArray(item.items) ? item.items : [])
        .filter((child) => child?.type !== 'folder')
        .map(cleanItem)
        .filter(Boolean),
    };
  }
  if (!item.url) return null;
  return {
    id: item.id || uid(),
    type: 'link',
    title: String(item.title || ''),
    url: String(item.url),
    icon: String(item.icon || ''),
  };
}

export async function load() {
  if (isExtension) {
    const stored = await chrome.storage.local.get(KEY);
    return normalize(stored[KEY]);
  }
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return defaults();
  }
}

export async function save(config) {
  if (isExtension) {
    await chrome.storage.local.set({ [KEY]: config });
  } else {
    localStorage.setItem(KEY, JSON.stringify(config));
  }
}

// Prévient quand la configuration est réécrite depuis un autre onglet.
// (L'onglet qui écrit est aussi notifié par chrome.storage : à l'appelant d'ignorer ses propres écritures.)
export function onExternalChange(callback) {
  if (isExtension) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[KEY]?.newValue) callback(normalize(changes[KEY].newValue));
    });
    return;
  }
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY || !event.newValue) return;
    try {
      callback(normalize(JSON.parse(event.newValue)));
    } catch {}
  });
}
