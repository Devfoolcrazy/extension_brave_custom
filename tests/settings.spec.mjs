import { expect, test } from '@playwright/test';
import { freshPage, seedConfig, storedConfig, tileNames } from './helpers.mjs';

// Intercepte les téléchargements déclenchés par un <a download> : le JSON est lu dans la page.
async function captureExports(page) {
  await page.evaluate(() => {
    window.__exports = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = async function () {
      if (this.download) window.__exports.push(await (await fetch(this.href)).json());
      else click.call(this);
    };
  });
}

async function importFile(page, object) {
  await page.evaluate((json) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([json], 'seuil.json', { type: 'application/json' }));
    const input = document.querySelector('#config-file');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, JSON.stringify(object));
  await page.waitForLoadState('load');
  await page.waitForSelector('#tiles .tile');
}

test.beforeEach(async ({ page }) => freshPage(page));

test('horloge : secondes et format 12 heures', async ({ page }) => {
  await page.click('#settings-open');
  await page.check('[name="clock.seconds"]');
  await expect(page.locator('#clock-time')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
  await page.uncheck('[name="clock.seconds"]');
  await page.check('[name="clock.hour12"]');
  await expect(page.locator('#clock-time')).toHaveText(/(AM|PM)/);
});

test('éditeur de mots-clés : nettoyage, avertissement, prise en compte', async ({ page }) => {
  await page.click('#settings-open');
  await expect(page.locator('#keywords .keyword')).toHaveCount(4);
  await page.click('#keyword-add');
  const row = page.locator('#keywords .keyword').last();
  await row.locator('[data-field=key]').fill('H N');
  await expect(row.locator('[data-field=key]')).toHaveValue('hn');
  await row.locator('[data-field=name]').fill('Hacker News');
  await row.locator('[data-field=url]').fill('https://hn.algolia.com/?q=');
  await expect(page.locator('#keywords-status')).toHaveText('Chaque adresse doit contenir %s, à la place de la recherche.');
  await row.locator('[data-field=url]').fill('https://hn.algolia.com/?q=%s');
  await expect(page.locator('#keywords-status')).toBeHidden();
  await page.click('#settings-dialog [data-close]');
  await page.fill('#search-input', 'hn rust async');
  await expect(page.locator('#search-suggestions .suggestion__label')).toHaveText(['Rechercher « rust async » sur Hacker News']);
});

test('export sans clé par défaut, avec clé sur demande, sans dates internes', async ({ page }) => {
  await page.click('#settings-open');
  await page.fill('[name="wallpaper.apiKey"]', 'SECRET123');
  await page.dispatchEvent('[name="wallpaper.apiKey"]', 'change');
  await captureExports(page);
  await page.click('#config-export');
  await page.check('#export-key');
  await page.click('#config-export');
  await expect.poll(() => page.evaluate(() => window.__exports.length)).toBe(2);
  const [withoutKey, withKey] = await page.evaluate(() => window.__exports);
  expect(withoutKey.wallpaper.apiKey).toBe('');
  expect(withoutKey).not.toHaveProperty('createdAt');
  expect(withoutKey).not.toHaveProperty('lastExport');
  expect(withKey.wallpaper.apiKey).toBe('SECRET123');
  await expect.poll(async () => (await storedConfig(page)).lastExport).toBeGreaterThan(0);
});

test('importer un fichier sans clé conserve la clé en place', async ({ page }) => {
  await page.click('#settings-open');
  await page.fill('[name="wallpaper.apiKey"]', 'SECRET123');
  await page.dispatchEvent('[name="wallpaper.apiKey"]', 'change');
  await page.waitForTimeout(300);
  const config = await storedConfig(page);
  await importFile(page, { ...config, wallpaper: { ...config.wallpaper, apiKey: '' }, items: config.items.slice(0, 2) });
  const after = await storedConfig(page);
  expect(after.wallpaper.apiKey).toBe('SECRET123');
  expect(after.items).toHaveLength(2);
});

test('un fichier invalide est refusé sans rien modifier', async ({ page }) => {
  await page.click('#settings-open');
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['{"nope":1}'], 'x.json', { type: 'application/json' }));
    const input = document.querySelector('#config-file');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#config-status')).toHaveText(/n'est pas une configuration Seuil valide/);
  expect(await tileNames(page, '#tiles')).toHaveLength(4);
});

test('rappel de sauvegarde après un mois, repoussé par « Plus tard »', async ({ page }) => {
  await expect(page.locator('#backup-hint')).toBeHidden();
  const old = Date.now() - 40 * 86400e3;
  await seedConfig(page, { createdAt: old, lastExport: old });
  await expect(page.locator('#backup-hint')).toBeVisible();
  await page.click('#backup-later');
  await expect(page.locator('#backup-hint')).toBeHidden();
  await expect.poll(async () => (await storedConfig(page)).backupSnoozedAt).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('#backup-hint')).toBeHidden();
});

test('icônes : DuckDuckGo en option, initiale sinon hors extension', async ({ page }) => {
  await page.click('#settings-open');
  await page.selectOption('[name=icons]', 'duckduckgo');
  await expect(page.locator('#tiles .tile[data-id] img').first()).toHaveAttribute('src', 'https://icons.duckduckgo.com/ip3/github.com.ico');
  await page.selectOption('[name=icons]', 'browser');
  await expect(page.locator('#tiles .tile[data-id] .icon').first()).toHaveText('G');
});

test('deux onglets restent synchronisés sans s’écraser', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/newtab.html');
  await other.waitForSelector('#tiles .tile');

  await other.click('#edit-toggle');
  await other.click('#tiles [data-action="add-link"]');
  await other.fill('#link-form [name=url]', 'lemonde.fr');
  await other.fill('#link-form [name=title]', 'Le Monde');
  await other.click('#link-form [type=submit]');
  await expect.poll(() => tileNames(page, '#tiles')).toContain('Le Monde');

  await page.click('#settings-open');
  await page.selectOption('[name="search.engine"]', 'kagi');
  await expect(other.locator('#search-input')).toHaveAttribute('placeholder', 'Rechercher avec Kagi');
  await expect.poll(async () => (await storedConfig(page)).search.engine).toBe('kagi');
  expect((await storedConfig(page)).items.map((i) => i.title)).toContain('Le Monde');
});
