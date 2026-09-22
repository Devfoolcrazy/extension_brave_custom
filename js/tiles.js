// Grille de raccourcis et de dossiers, mode édition, glisser-déposer.

import { isExtension, uid } from './store.js';
import { iconOf, labelOf } from './icons.js';
import { toast } from './toast.js';

const ROOT = '';

export function initTiles({ config, persist }) {
  const grid = document.getElementById('tiles');
  const folderRow = document.getElementById('folders');
  const editToggle = document.getElementById('edit-toggle');

  const folderDialog = document.getElementById('folder-dialog');
  const folderGrid = document.getElementById('folder-tiles');
  const folderTitle = document.getElementById('folder-title');
  const folderName = document.getElementById('folder-name');
  const folderFoot = document.getElementById('folder-foot');
  const folderDelete = document.getElementById('folder-delete');
  const folderOut = document.getElementById('folder-out');

  const linkDialog = document.getElementById('link-dialog');
  const linkForm = document.getElementById('link-form');
  const linkHeading = document.getElementById('link-dialog-title');
  const linkDelete = document.getElementById('link-delete');
  const linkError = document.getElementById('link-error');

  let editing = false;
  let openFolderId = null;
  let editingLinkId = null; // null pendant la création
  let drag = null; // { id, parentId }

  /* ---------- Accès aux données ---------- */

  const folders = () => config.items.filter((item) => item.type === 'folder');
  const folderById = (id) => folders().find((folder) => folder.id === id);
  const listOf = (parentId) => (parentId ? folderById(parentId)?.items : config.items);

  function locate(id) {
    for (const parentId of [ROOT, ...folders().map((folder) => folder.id)]) {
      const list = listOf(parentId);
      const index = list.findIndex((item) => item.id === id);
      if (index !== -1) return { item: list[index], list, index, parentId };
    }
    return null;
  }

  function commit() {
    persist();
    render();
  }

  // Supprime sans demander confirmation, mais laisse quelques secondes pour annuler.
  function removeWithUndo(found, message) {
    found.list.splice(found.index, 1);
    commit();
    toast(message, {
      action: 'Annuler',
      onAction() {
        // Le dossier d'origine a pu disparaître entre-temps : retour à l'accueil.
        const list = listOf(found.parentId) ?? config.items;
        list.splice(Math.min(found.index, list.length), 0, found.item);
        commit();
      },
    });
  }

  /* ---------- Rendu ---------- */

  function tile(item, parentId) {
    const isFolder = item.type === 'folder';
    const el = document.createElement(isFolder ? 'button' : 'a');
    el.className = `tile${isFolder ? ' tile--folder' : ''}`;
    el.dataset.id = item.id;
    el.dataset.parent = parentId;
    el.draggable = editing;

    const plate = document.createElement('span');
    plate.className = 'tile__plate';
    const label = document.createElement('span');
    label.className = 'tile__label';

    if (isFolder) {
      el.type = 'button';
      plate.classList.add('tile__plate--folder');
      plate.append(...item.items.slice(0, 4).map(iconOf));
      label.textContent = item.title;
      const count = item.items.length;
      if (count === 1) el.title = 'Clic molette : ouvrir le raccourci dans un onglet';
      if (count > 1) el.title = `Clic molette : ouvrir les ${count} raccourcis dans des onglets`;
    } else {
      el.href = item.url;
      el.title = item.url;
      plate.append(iconOf(item));
      label.textContent = labelOf(item);
    }
    el.append(plate, label);
    return el;
  }

  function adder(text, action, parentId) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'tile tile--add';
    el.dataset.action = action;
    el.dataset.parent = parentId;
    const plate = document.createElement('span');
    plate.className = 'tile__plate';
    plate.textContent = '+';
    const label = document.createElement('span');
    label.className = 'tile__label';
    label.textContent = text;
    el.append(plate, label);
    return el;
  }

  // kind limite le rendu à un type d'élément : à l'accueil, raccourcis et dossiers
  // vivent dans la même liste mais s'affichent sur deux rangées distinctes.
  function fill(container, parentId, kind) {
    const all = listOf(parentId) ?? [];
    const items = kind ? all.filter((item) => item.type === kind) : all;
    const nodes = items.map((item) => tile(item, parentId));
    if (editing) {
      nodes.push(
        kind === 'folder'
          ? adder('Ajouter un dossier', 'add-folder', parentId)
          : adder('Ajouter un raccourci', 'add-link', parentId),
      );
    } else if (!all.length && kind !== 'folder') {
      const empty = document.createElement('p');
      empty.className = 'tiles__empty';
      empty.textContent = parentId
        ? 'Ce dossier est vide. Passe en mode modification pour y ajouter des raccourcis.'
        : 'Aucun raccourci pour le moment. Clique sur « Modifier les raccourcis » pour en ajouter.';
      nodes.push(empty);
    }
    container.replaceChildren(...nodes);
    container.hidden = !nodes.length;
  }

  function fillHome() {
    fill(grid, ROOT, 'link');
    fill(folderRow, ROOT, 'folder');
  }

  function render() {
    document.body.classList.toggle('is-editing', editing);
    editToggle.textContent = editing ? 'Terminer' : 'Modifier les raccourcis';
    editToggle.setAttribute('aria-pressed', String(editing));
    fillHome();

    const folder = openFolderId && folderById(openFolderId);
    if (!folder) {
      openFolderId = null;
      if (folderDialog.open) folderDialog.close();
      return;
    }
    folderTitle.textContent = folder.title;
    folderTitle.hidden = editing;
    folderName.hidden = !editing;
    if (document.activeElement !== folderName) folderName.value = folder.title;
    folderFoot.hidden = !editing;
    fill(folderGrid, folder.id);
  }

  /* ---------- Dossiers ---------- */

  function openFolder(id) {
    openFolderId = id;
    render();
    if (!folderDialog.open) folderDialog.showModal();
  }

  folderDialog.addEventListener('close', () => {
    openFolderId = null;
  });

  folderName.addEventListener('input', () => {
    const folder = folderById(openFolderId);
    if (!folder) return;
    folder.title = folderName.value.trim() || 'Dossier';
    persist();
    fillHome();
  });

  folderDelete.addEventListener('click', () => {
    const found = locate(openFolderId);
    if (!found) return;
    const count = found.item.items.length;
    const name = `Dossier « ${found.item.title} »`;
    let message = `${name} supprimé.`;
    if (count === 1) message = `${name} et son raccourci supprimés.`;
    if (count > 1) message = `${name} et ses ${count} raccourcis supprimés.`;
    removeWithUndo(found, message);
  });

  /* ---------- Raccourcis ---------- */

  function openLinkDialog(link, parentId) {
    editingLinkId = link?.id ?? null;
    linkHeading.textContent = link ? 'Modifier le raccourci' : 'Nouveau raccourci';
    linkDelete.hidden = !link;
    linkError.hidden = true;

    const options = [new Option('Accueil', ROOT), ...folders().map((f) => new Option(f.title, f.id))];
    linkForm.elements.parent.replaceChildren(...options);

    linkForm.elements.url.value = link?.url ?? '';
    linkForm.elements.title.value = link?.title ?? '';
    linkForm.elements.icon.value = link?.icon ?? '';
    linkForm.elements.parent.value = parentId;
    linkDialog.showModal();
    linkForm.elements.url.focus();
  }

  function parseUrl(input) {
    const text = input.trim();
    if (!text) return null;
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
      return /^(javascript|data|vbscript):$/i.test(url.protocol) ? null : url.toString();
    } catch {
      return null;
    }
  }

  linkForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = parseUrl(linkForm.elements.url.value);
    if (!url) {
      linkError.textContent = "Cette adresse n'est pas valide. Exemple : exemple.fr";
      linkError.hidden = false;
      linkForm.elements.url.focus();
      return;
    }
    const values = {
      url,
      title: linkForm.elements.title.value.trim(),
      icon: linkForm.elements.icon.value.trim(),
    };
    const target = listOf(linkForm.elements.parent.value) ?? config.items;

    const found = editingLinkId && locate(editingLinkId);
    if (found) {
      Object.assign(found.item, values);
      if (found.list !== target) {
        found.list.splice(found.index, 1);
        target.push(found.item);
      }
    } else {
      target.push({ id: uid(), type: 'link', ...values });
    }
    linkDialog.close();
    commit();
  });

  linkDelete.addEventListener('click', () => {
    const found = editingLinkId && locate(editingLinkId);
    linkDialog.close();
    if (found) removeWithUndo(found, `Raccourci « ${labelOf(found.item)} » supprimé.`);
  });

  /* ---------- Ouvrir tout un dossier ---------- */

  // Clic molette (ou Cmd/Ctrl + clic) sur un dossier : chaque raccourci s'ouvre dans
  // un onglet d'arrière-plan, à la suite de l'onglet courant et dans l'ordre du dossier.
  async function openAll(folder) {
    const urls = folder.items.map((link) => link.url);
    if (!urls.length) return;
    if (!isExtension) {
      // Hors extension, le navigateur peut bloquer les fenêtres après la première.
      for (const url of urls) window.open(url, '_blank', 'noopener');
      return;
    }
    const here = await chrome.tabs.getCurrent();
    for (const [offset, url] of urls.entries()) {
      await chrome.tabs
        .create({ url, active: false, index: here ? here.index + 1 + offset : undefined })
        .catch(() => {}); // adresse refusée par le navigateur : on passe à la suivante
    }
  }

  function folderFromEvent(event) {
    const el = event.target.closest('.tile--folder');
    return el && !editing ? folderById(el.dataset.id) : null;
  }

  function onAuxClick(event) {
    if (event.button !== 1) return;
    const folder = folderFromEvent(event);
    if (!folder) return;
    event.preventDefault();
    openAll(folder);
  }

  // Sans cela, le clic molette lance le défilement automatique sous Windows et Linux.
  function onMiddleDown(event) {
    if (event.button === 1 && folderFromEvent(event)) event.preventDefault();
  }

  /* ---------- Clics ---------- */

  function onClick(event) {
    const el = event.target.closest('.tile');
    if (!el) return;
    const parentId = el.dataset.parent;

    if (el.dataset.action === 'add-link') return openLinkDialog(null, parentId);
    if (el.dataset.action === 'add-folder') {
      const folder = { id: uid(), type: 'folder', title: 'Nouveau dossier', items: [] };
      config.items.push(folder);
      persist();
      openFolder(folder.id);
      folderName.focus();
      folderName.select();
      return;
    }

    const found = locate(el.dataset.id);
    if (!found) return;
    if (found.item.type === 'folder') {
      if ((event.metaKey || event.ctrlKey) && !editing) return openAll(found.item);
      return openFolder(found.item.id);
    }
    if (editing) {
      event.preventDefault();
      openLinkDialog(found.item, parentId);
    }
  }

  /* ---------- Glisser-déposer (mode édition) ---------- */

  function dropMode(el, event) {
    const rect = el.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const dragged = locate(drag.id)?.item;
    const intoFolder =
      el.classList.contains('tile--folder') && dragged?.type === 'link' && ratio > 0.25 && ratio < 0.75;
    if (intoFolder) return 'into';
    // Réordonner n'a de sens qu'entre éléments de même type (une rangée chacun).
    if (dragged?.type !== locate(el.dataset.id)?.item.type) return null;
    return ratio < 0.5 ? 'before' : 'after';
  }

  function clearDropMarks() {
    document.querySelectorAll('[data-drop]').forEach((node) => node.removeAttribute('data-drop'));
  }

  function onDragStart(event) {
    const el = event.target.closest('.tile[data-id]');
    if (!editing || !el) return;
    drag = { id: el.dataset.id, parentId: el.dataset.parent };
    // Depuis un dossier ouvert, une zone apparaît pour ramener le raccourci à l'accueil.
    folderOut.hidden = !drag.parentId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', el.dataset.id);
    requestAnimationFrame(() => el.classList.add('is-dragged'));
  }

  function onDragOver(event) {
    if (!drag) return;
    const el = event.target.closest('.tile[data-id]');
    if (!el || el.dataset.id === drag.id) return;
    // Un dossier ne se range pas dans un dossier.
    if (el.dataset.parent && locate(drag.id)?.item.type === 'folder') return;
    const mode = dropMode(el, event);
    clearDropMarks();
    if (!mode) return;
    event.preventDefault();
    el.dataset.drop = mode;
  }

  function onDrop(event) {
    if (!drag) return;
    const el = event.target.closest('.tile[data-id]');
    if (!el || el.dataset.id === drag.id) return;
    const mode = dropMode(el, event);
    const source = locate(drag.id);
    if (!mode || !source) return;
    event.preventDefault();
    source.list.splice(source.index, 1);

    const target = locate(el.dataset.id);
    if (mode === 'into') target.item.items.push(source.item);
    else target.list.splice(target.index + (mode === 'after' ? 1 : 0), 0, source.item);
    // Le rendu retire la tuile source du DOM : son « dragend » ne remontera pas jusqu'ici.
    onDragEnd();
    commit();
  }

  // Sortie d'un dossier : dépôt sur la zone prévue, ou n'importe où hors de la fenêtre du dossier.
  function isOutTarget(event) {
    return drag?.parentId && (event.target === folderDialog || event.target.closest('#folder-out'));
  }

  folderDialog.addEventListener('dragover', (event) => {
    if (!isOutTarget(event)) return;
    event.preventDefault();
    folderOut.classList.add('is-over');
  });
  folderDialog.addEventListener('dragleave', (event) => {
    if (event.target.closest('#folder-out') && !folderOut.contains(event.relatedTarget)) {
      folderOut.classList.remove('is-over');
    }
  });
  folderDialog.addEventListener('drop', (event) => {
    if (!isOutTarget(event)) return;
    event.preventDefault();
    const source = locate(drag.id);
    onDragEnd();
    if (!source) return;
    source.list.splice(source.index, 1);
    config.items.push(source.item);
    commit();
    toast(`« ${labelOf(source.item)} » est revenu à l'accueil.`);
  });

  function onDragEnd() {
    drag = null;
    folderOut.hidden = true;
    folderOut.classList.remove('is-over');
    clearDropMarks();
    document.querySelectorAll('.is-dragged').forEach((node) => node.classList.remove('is-dragged'));
  }

  for (const container of [grid, folderRow, folderGrid]) {
    container.addEventListener('click', onClick);
    container.addEventListener('auxclick', onAuxClick);
    container.addEventListener('mousedown', onMiddleDown);
    container.addEventListener('dragstart', onDragStart);
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);
    container.addEventListener('dragend', onDragEnd);
    container.addEventListener('dragleave', (event) => {
      if (!container.contains(event.relatedTarget)) clearDropMarks();
    });
  }

  editToggle.addEventListener('click', () => {
    editing = !editing;
    render();
  });

  render();
  return {
    render,
    toggleEdit() {
      editing = !editing;
      render();
    },
    // Raccourci clavier : n-ième raccourci de l'accueil (dossiers exclus).
    rootLink(n) {
      return config.items.filter((item) => item.type === 'link')[n - 1] ?? null;
    },
  };
}
