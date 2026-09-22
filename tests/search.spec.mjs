import { expect, test } from '@playwright/test';
import { freshPage, opened } from './helpers.mjs';

const rows = (page) =>
  page.$$eval('#search-suggestions .suggestion', (items) =>
    items.map((item) => ({
      label: item.querySelector('.suggestion__label').textContent,
      detail: item.querySelector('.suggestion__detail')?.textContent ?? '',
      selected: item.getAttribute('aria-selected') === 'true',
    })),
  );

test.beforeEach(async ({ page }) => freshPage(page));

test('propose les raccourcis correspondants puis la recherche web', async ({ page }) => {
  await page.fill('#search-input', 'git');
  const list = await rows(page);
  expect(list.map((r) => r.label)).toEqual(['GitHub', 'GitLab', 'Rechercher « git » avec Brave Search']);
  expect(list[0].selected).toBe(true);
});

test('trouve un raccourci rangé dans un dossier', async ({ page }) => {
  await page.fill('#search-input', 'clau');
  const list = await rows(page);
  expect(list[0]).toMatchObject({ label: 'Claude', detail: 'Outils' });
});

test('ignore les accents', async ({ page }) => {
  await page.click('#edit-toggle');
  await page.click('#tiles [data-action="add-link"]');
  await page.fill('#link-form [name=url]', 'telerama.fr');
  await page.fill('#link-form [name=title]', 'Télérama');
  await page.click('#link-form [type=submit]');
  await page.click('#edit-toggle');
  await page.fill('#search-input', 'telerama');
  expect((await rows(page))[0].label).toBe('Télérama');
});

test('les flèches choisissent, Cmd/Ctrl + Entrée ouvre dans un nouvel onglet', async ({ page }) => {
  await page.fill('#search-input', 'git');
  await page.keyboard.press('ArrowDown');
  expect((await rows(page))[1].selected).toBe(true);
  await page.keyboard.press('ControlOrMeta+Enter');
  expect(await opened(page)).toEqual(['https://gitlab.com']);
});

test('Échap ferme la liste et Entrée lance alors la recherche web', async ({ page }) => {
  await page.fill('#search-input', 'git');
  await page.keyboard.press('Escape');
  expect(await rows(page)).toEqual([]);
  expect(await page.getAttribute('#search-input', 'aria-expanded')).toBe('false');
  await page.keyboard.press('ControlOrMeta+Enter');
  expect(await opened(page)).toEqual(['https://search.brave.com/search?q=git']);
});

test('un mot-clé cible son moteur', async ({ page }) => {
  await page.fill('#search-input', 'yt lofi hip hop');
  expect((await rows(page)).map((r) => r.label)).toEqual(['Rechercher « lofi hip hop » sur YouTube']);
  await page.keyboard.press('ControlOrMeta+Enter');
  expect(await opened(page)).toEqual(['https://www.youtube.com/results?search_query=lofi%20hip%20hop']);
});

test('une adresse ouvre le site', async ({ page }) => {
  await page.fill('#search-input', 'exemple.fr');
  expect((await rows(page))[0].label).toBe('Ouvrir exemple.fr');
  await page.keyboard.press('ControlOrMeta+Enter');
  expect(await opened(page)).toEqual(['https://exemple.fr']);
});

test('le moteur choisi dans les réglages est utilisé', async ({ page }) => {
  await page.click('#settings-open');
  await page.selectOption('[name="search.engine"]', 'duckduckgo');
  await page.click('#settings-dialog [data-close]');
  await expect(page.locator('#search-input')).toHaveAttribute('placeholder', 'Rechercher avec DuckDuckGo');
  await page.fill('#search-input', 'brave');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+Enter');
  expect(await opened(page)).toEqual(['https://duckduckgo.com/?q=brave']);
});
