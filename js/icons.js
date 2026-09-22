// Nom et icône d'un raccourci, partagés par la grille et par les suggestions de recherche.

import { isExtension } from './store.js';

// 'browser' : favicons connues de Brave, sans requête vers un tiers. 'duckduckgo' :
// service d'icônes de DuckDuckGo, qui couvre aussi les sites jamais visités.
let source = 'browser';
export function setIconSource(mode) {
  source = mode;
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const labelOf = (link) => link.title || hostOf(link.url);

function initial(link) {
  const span = document.createElement('span');
  span.className = 'icon icon--text';
  span.textContent = labelOf(link).slice(0, 1).toUpperCase();
  return span;
}

export function iconOf(link) {
  const custom = link.icon.trim();
  if (custom && !/^(https?:|data:image\/)/i.test(custom)) {
    const span = document.createElement('span');
    span.className = 'icon icon--text';
    span.textContent = custom;
    return span;
  }
  if (!custom && source !== 'duckduckgo' && !isExtension) return initial(link);

  const img = document.createElement('img');
  img.className = 'icon';
  img.alt = '';
  img.draggable = false;
  img.addEventListener('error', () => img.replaceWith(initial(link)), { once: true });
  if (custom) {
    img.src = custom;
  } else if (source === 'duckduckgo') {
    img.src = `https://icons.duckduckgo.com/ip3/${hostOf(link.url)}.ico`;
  } else {
    // Favicon servie depuis le cache du navigateur : aucun service tiers sollicité.
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', link.url);
    url.searchParams.set('size', '64');
    img.src = url.toString();
  }
  return img;
}
