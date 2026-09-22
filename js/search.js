// Barre de recherche : lanceur de raccourcis, mots-clés (« yt lofi ») et recherche web.

import { ENGINES } from './store.js';
import { hostOf, iconOf, labelOf } from './icons.js';

const MAX_LINKS = 6;

// Comparaison sans casse ni accents : « telerama » trouve « Télérama ».
const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function initSearch({ config }) {
  const form = document.getElementById('search');
  const input = document.getElementById('search-input');
  const list = document.getElementById('search-suggestions');

  let rows = [];
  let active = -1;
  let dismissed = false; // Échap : la prochaine validation part en recherche, sans suggestion

  /* ---------- Cibles ---------- */

  function engine() {
    const { engine: id, customUrl } = config.search;
    if (id === 'custom' && customUrl.includes('%s')) return { name: 'ton moteur', url: customUrl };
    return ENGINES[id]?.url ? ENGINES[id] : ENGINES.brave;
  }

  const fill = (template, query) => template.replace('%s', encodeURIComponent(query));

  // « exemple.fr » ou « localhost:3000 » ouvrent le site plutôt qu'une recherche.
  function asAddress(text) {
    if (/\s/.test(text)) return null;
    if (/^https?:\/\//i.test(text)) return text;
    if (/^localhost(:\d+)?(\/.*)?$/i.test(text)) return `http://${text}`;
    if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(text)) return `https://${text}`;
    return null;
  }

  function keywordSearch(text) {
    const match = text.match(/^(\S+)\s+(.+)$/);
    if (!match) return null;
    const keyword = config.search.keywords.find(
      (entry) => entry.key && entry.key === match[1].toLowerCase() && entry.url.includes('%s'),
    );
    if (!keyword) return null;
    const query = match[2].trim();
    return {
      kind: 'search',
      label: `Rechercher « ${query} » sur ${keyword.name || hostOf(keyword.url)}`,
      target: fill(keyword.url, query),
    };
  }

  function webSearch(text) {
    return { kind: 'search', label: `Rechercher « ${text} » avec ${engine().name}`, target: fill(engine().url, text) };
  }

  /* ---------- Raccourcis correspondants ---------- */

  function everyLink() {
    return config.items.flatMap((item) =>
      item.type === 'folder'
        ? item.items.map((link) => ({ link, folder: item.title }))
        : [{ link: item, folder: '' }],
    );
  }

  // Plus le score est bas, meilleure est la correspondance ; -1 : aucune.
  function score(link, query) {
    const title = fold(labelOf(link));
    const host = fold(hostOf(link.url));
    if (title.startsWith(query)) return 0;
    if (title.split(/[\s\-_./]+/).some((word) => word.startsWith(query))) return 1;
    if (host.startsWith(query)) return 2;
    if (title.includes(query)) return 3;
    if (fold(link.url).includes(query)) return 4;
    return -1;
  }

  function matchingLinks(text) {
    const query = fold(text);
    return everyLink()
      .map((entry, order) => ({ ...entry, order, rank: score(entry.link, query) }))
      .filter((entry) => entry.rank !== -1)
      .sort((a, b) => a.rank - b.rank || a.order - b.order)
      .slice(0, MAX_LINKS)
      .map(({ link, folder }) => ({
        kind: 'link',
        link,
        label: labelOf(link),
        detail: folder || hostOf(link.url),
        target: link.url,
      }));
  }

  function suggest(text) {
    if (!text) return [];
    const keyword = keywordSearch(text);
    if (keyword) return [keyword];
    const address = asAddress(text);
    const open = address ? [{ kind: 'address', label: `Ouvrir ${text}`, target: address }] : [];
    return [...matchingLinks(text), ...open, webSearch(text)];
  }

  // Sans suggestion (liste fermée par Échap) : mot-clé, adresse, sinon recherche web.
  function fallback(text) {
    return keywordSearch(text) ?? (asAddress(text) ? { target: asAddress(text) } : webSearch(text));
  }

  /* ---------- Affichage ---------- */

  function glyph() {
    const span = document.createElement('span');
    span.className = 'suggestion__glyph';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  function render() {
    list.replaceChildren(
      ...rows.map((row, index) => {
        const li = document.createElement('li');
        li.className = 'suggestion';
        li.id = `suggestion-${index}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(index === active));
        li.dataset.index = index;

        const label = document.createElement('span');
        label.className = 'suggestion__label';
        label.textContent = row.label;
        li.append(row.kind === 'link' ? iconOf(row.link) : glyph(), label);

        if (row.detail) {
          const detail = document.createElement('span');
          detail.className = 'suggestion__detail';
          detail.textContent = row.detail;
          li.append(detail);
        }
        return li;
      }),
    );
    const open = rows.length > 0;
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (open && active >= 0) input.setAttribute('aria-activedescendant', `suggestion-${active}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function update() {
    rows = dismissed ? [] : suggest(input.value.trim());
    active = rows.length ? 0 : -1;
    render();
  }

  function close() {
    rows = [];
    active = -1;
    render();
  }

  /* ---------- Actions ---------- */

  function go(target, inNewTab) {
    if (inNewTab || config.search.newTab) {
      window.open(target, '_blank', 'noopener');
      input.value = '';
      close();
    } else {
      location.href = target;
    }
  }

  function submit(inNewTab) {
    const text = input.value.trim();
    if (!text) return;
    go((rows[active] ?? fallback(text)).target, inNewTab);
  }

  input.addEventListener('input', () => {
    dismissed = false;
    update();
  });
  input.addEventListener('focus', update);
  input.addEventListener('blur', close);

  input.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!rows.length) return;
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      active = (active + step + rows.length) % rows.length;
      render();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (rows.length) {
        dismissed = true;
        close();
      } else {
        // Liste déjà fermée : rendre le focus à la page, pour les raccourcis clavier.
        input.blur();
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      submit(event.metaKey || event.ctrlKey);
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit(false);
  });

  // mousedown plutôt que click : le champ ne perd pas le focus, la liste reste ouverte.
  list.addEventListener('mousedown', (event) => {
    const li = event.target.closest('.suggestion');
    if (!li || event.button > 1) return;
    event.preventDefault();
    go(rows[Number(li.dataset.index)].target, event.button === 1 || event.metaKey || event.ctrlKey);
  });

  document.addEventListener('keydown', (event) => {
    const typing = event.target.closest?.('input, textarea, select, [contenteditable]');
    if (event.key === '/' && !typing && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      input.focus();
    }
  });

  function apply() {
    input.placeholder = `Rechercher avec ${engine().name}`;
    if (document.activeElement === input) update();
  }

  apply();
  return { apply };
}
