import { expect, test } from '@playwright/test';
import { currentWallpaper, feedFolder, freshPage, idb, libraryCount, makeImage, storedConfig } from './helpers.mjs';

const status = (page) => page.textContent('#wallpaper-status');

// Vieillit l'image affichée de `minutes`, puis relance applyWallpaper avec la config enregistrée.
async function ageAndApply(page, minutes) {
  await idb(page, `async (req) => {
    const current = await req('wallpaper', 'readonly', (s) => s.get('current'));
    await req('wallpaper', 'readwrite', (s) => s.put({ ...current, since: Date.now() - ${minutes} * 60e3 }, 'current'));
  }`);
  await page.evaluate(async () => {
    const { applyWallpaper } = await import('/js/wallpaper.js');
    await applyWallpaper(JSON.parse(localStorage.getItem('config')));
  });
}

test.beforeEach(async ({ page }) => {
  await freshPage(page);
  await page.click('#settings-open');
});

test('les champs affichés dépendent de la source', async ({ page }) => {
  const visibleLabels = () =>
    page.$$eval('[data-show-when]:not([hidden])', (nodes) => nodes.map((n) => n.querySelector('.field__label')?.textContent.trim() ?? 'bouton'));
  expect(await visibleLabels()).toContain('Adresse de la photo');
  await page.selectOption('[name="wallpaper.mode"]', 'api');
  const labels = await visibleLabels();
  expect(labels).toEqual(expect.arrayContaining(['Thème', 'Collections', 'Changer de photo', "Clé d'accès Unsplash"]));
  await expect(page.locator('#wallpaper-status')).toHaveText("Ajoute ta clé d'accès Unsplash pour choisir des photos par thème.");
});

// Unsplash renvoie 403 à un User-Agent « HeadlessChrome » : on en présente un ordinaire.
// La page d'une photo (unsplash.com/photos/…) n'est accessible que depuis l'extension, grâce
// aux host_permissions ; hors extension, seule l'adresse directe de l'image autorise CORS.
test.describe('avec le réseau', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });

  test('une image Unsplash se charge, puis vient du cache', async ({ page }) => {
    await page.fill('[name="wallpaper.photoUrl"]', 'https://images.unsplash.com/photo-1545987796-200677ee1011');
    await page.dispatchEvent('[name="wallpaper.photoUrl"]', 'change');
    await expect(page.locator('#wallpaper-status')).toHaveText('', { timeout: 15000 });
    await expect(page.locator('#wallpaper')).toHaveClass(/is-visible/);
    const cachedType = await idb(page, `async (req) => (await req('wallpaper', 'readonly', (s) => s.get('current'))).blob?.type`);
    expect(cachedType).toBe('image/jpeg');

    // Au rechargement, l'image vient d'IndexedDB : aucune requête vers Unsplash.
    const requests = [];
    page.on('request', (r) => r.url().includes('unsplash') && requests.push(r.url()));
    await page.reload();
    await expect(page.locator('#wallpaper')).toHaveClass(/is-visible/);
    await expect(page.locator('#wallpaper')).toHaveCSS('background-image', /^url\("blob:/);
    expect(requests).toEqual([]);
  });
});

test('importe un dossier, redimensionne et écarte les fichiers illisibles', async ({ page }) => {
  await page.selectOption('[name="wallpaper.mode"]', 'folder');
  await expect(page.locator('#wallpaper-status')).toHaveText("Choisis un dossier d'images.");
  await makeImage(page, { color: '#c33', name: 'grande.png', width: 6000, height: 4000 });
  await makeImage(page, { color: '#3a6', name: 'b.png' });
  await feedFolder(page, [
    { content: 'pas un png', name: 'cassee.png', type: 'image/png' },
    { content: 'texte', name: 'notes.txt', type: 'text/plain' },
  ]);
  expect(await status(page)).toBe('2 images importées. 1 fichier illisible (format non pris en charge).');
  const sizes = await idb(page, `async (req) => {
    const all = await req('library', 'readonly', (s) => s.getAll());
    return Promise.all(all.map(async (e) => { const b = await createImageBitmap(e.blob); return [e.name, b.width, e.blob.type, !!e.thumb]; }));
  }`);
  expect(sizes[0][1]).toBeLessThanOrEqual(3840);
  expect(sizes[0][2]).toBe('image/jpeg');
  expect(sizes.every((s) => s[3])).toBe(true);
  await expect(page.locator('#library .library__item')).toHaveCount(2);
});

test('« Changer de photo maintenant » ne retombe jamais sur la même image', async ({ page }) => {
  await page.selectOption('[name="wallpaper.mode"]', 'folder');
  for (const [color, name] of [['#c33', 'a.png'], ['#3a6', 'b.png'], ['#36c', 'c.png']]) await makeImage(page, { color, name });
  await feedFolder(page);
  const sequence = [(await currentWallpaper(page)).libraryKey];
  for (let i = 0; i < 6; i++) {
    await page.click('#wallpaper-next');
    await page.waitForTimeout(400);
    sequence.push((await currentWallpaper(page)).libraryKey);
  }
  expect(sequence.every((key, i) => i === 0 || key !== sequence[i - 1])).toBe(true);
});

test('l’intervalle personnalisé est respecté', async ({ page }) => {
  await page.selectOption('[name="wallpaper.mode"]', 'folder');
  await page.selectOption('[name="wallpaper.refresh"]', 'custom');
  await expect(page.locator('[name="wallpaper.refreshEvery"]')).toBeVisible();
  await page.fill('[name="wallpaper.refreshEvery"]', '');
  await page.dispatchEvent('[name="wallpaper.refreshEvery"]', 'change');
  await expect(page.locator('[name="wallpaper.refreshEvery"]')).toHaveValue('1');
  await page.fill('[name="wallpaper.refreshEvery"]', '5');
  await page.dispatchEvent('[name="wallpaper.refreshEvery"]', 'change');
  for (const [color, name] of [['#c33', 'a.png'], ['#3a6', 'b.png'], ['#36c', 'c.png']]) await makeImage(page, { color, name });
  await feedFolder(page);
  expect((await storedConfig(page)).wallpaper).toMatchObject({ refresh: 'custom', refreshEvery: 5, refreshUnit: 'min' });

  const before = (await currentWallpaper(page)).libraryKey;
  await ageAndApply(page, 4);
  expect((await currentWallpaper(page)).libraryKey).toBe(before);
  await ageAndApply(page, 6);
  expect((await currentWallpaper(page)).libraryKey).not.toBe(before);
});

test('retirer une image depuis la grille ou depuis la page, avec annulation', async ({ page }) => {
  await page.selectOption('[name="wallpaper.mode"]', 'folder');
  for (const [color, name] of [['#c33', 'a.png'], ['#3a6', 'b.png'], ['#36c', 'c.png']]) await makeImage(page, { color, name });
  await feedFolder(page);
  await page.hover('#library .library__item:nth-child(3)');
  await page.click('#library .library__item:nth-child(3) .library__remove');
  await expect(page.locator('#library .library__item')).toHaveCount(2);
  await page.click('.toast__action');
  await expect(page.locator('#library .library__item')).toHaveCount(3);

  await page.click('#settings-dialog [data-close]');
  await expect(page.locator('#wallpaper-skip')).toBeVisible();
  await page.click('#wallpaper-skip');
  await expect(page.locator('.toast span')).toHaveText(/retirée de la bibliothèque/);
  expect(await libraryCount(page)).toBe(2);
  await page.click('.toast__action');
  await expect.poll(() => libraryCount(page)).toBe(3);
});

test('un import peut s’ajouter à la bibliothèque', async ({ page }) => {
  await page.selectOption('[name="wallpaper.mode"]', 'folder');
  await makeImage(page, { color: '#c33', name: 'a.png' });
  await feedFolder(page);
  await page.check('#folder-append');
  await makeImage(page, { color: '#3a6', name: 'b.png' });
  await feedFolder(page);
  await expect(page.locator('#library-status')).toHaveText('2 images dans la bibliothèque.');
});

test('le voile automatique se renforce sur une image claire', async ({ page }) => {
  await page.selectOption('[name="wallpaper.mode"]', 'folder');
  await makeImage(page, { color: '#ffffff', name: 'blanche.png' });
  await feedFolder(page);
  const dimAuto = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dim-auto').trim());
  expect(await dimAuto()).toBe('0.35');
  await page.uncheck('[name="wallpaper.autoDim"]');
  expect(await dimAuto()).toBe('0');
});
