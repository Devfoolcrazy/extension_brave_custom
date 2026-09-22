import { expect, test } from '@playwright/test';
import { freshPage, storedConfig, tileNames } from './helpers.mjs';

// Simule un glisser-déposer HTML5 (Playwright ne pilote pas le geste natif de façon fiable).
async function dragTo(page, sourceSelector, targetSelector, { xRatio = 0.5 } = {}) {
  await page.evaluate(
    ([source, target, xRatio]) => {
      const from = document.querySelector(source);
      const to = document.querySelector(target);
      const rect = to.getBoundingClientRect();
      const clientX = rect.left + rect.width * xRatio;
      const event = (type, el) =>
        el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, clientX, dataTransfer: new DataTransfer() }));
      event('dragstart', from);
      event('dragover', to);
      event('drop', to);
    },
    [sourceSelector, targetSelector, xRatio],
  );
}

test.beforeEach(async ({ page }) => freshPage(page));

test('raccourcis sur une rangée, dossiers sur une autre', async ({ page }) => {
  expect(await tileNames(page, '#tiles')).toEqual(['GitHub', 'GitLab', 'Gmail', 'YouTube']);
  expect(await tileNames(page, '#folders')).toEqual(['Outils']);
});

test('ajoute un raccourci et refuse une adresse javascript:', async ({ page }) => {
  await page.click('#edit-toggle');
  await page.click('#tiles [data-action="add-link"]');
  await page.fill('#link-form [name=url]', 'javascript:alert(1)');
  await page.click('#link-form [type=submit]');
  await expect(page.locator('#link-error')).toBeVisible();

  await page.fill('#link-form [name=url]', 'news.ycombinator.com');
  await page.fill('#link-form [name=title]', 'HN');
  await page.fill('#link-form [name=icon]', '🗞️');
  await page.click('#link-form [type=submit]');
  expect(await tileNames(page, '#tiles')).toContain('HN');
  await expect(page.locator('#tiles a.tile').last()).toHaveAttribute('href', 'https://news.ycombinator.com/');
});

test('déplace un raccourci dans un dossier via le champ Emplacement, puis le renomme', async ({ page }) => {
  await page.click('#edit-toggle');
  await page.locator('#tiles .tile[data-id]').first().click();
  await page.selectOption('#link-form [name=parent]', { label: 'Outils' });
  await page.click('#link-form [type=submit]');
  expect(await tileNames(page, '#tiles')).toEqual(['GitLab', 'Gmail', 'YouTube']);

  await page.click('#folders .tile--folder');
  expect(await tileNames(page, '#folder-tiles')).toEqual(['Claude', 'Unsplash', 'MDN', 'GitHub']);
  await page.fill('#folder-name', 'Boîte à outils');
  expect(await tileNames(page, '#folders')).toEqual(['Boîte à outils']);
});

test('glisser un raccourci au centre d’un dossier l’y range', async ({ page }) => {
  await page.click('#edit-toggle');
  await dragTo(page, '#tiles .tile[data-id]', '#folders .tile--folder');
  expect(await tileNames(page, '#tiles')).toEqual(['GitLab', 'Gmail', 'YouTube']);
  await expect
    .poll(async () => (await storedConfig(page)).items.find((i) => i.type === 'folder').items.map((i) => i.title))
    .toContain('GitHub');
});

test('un dossier ne peut pas être déposé parmi les raccourcis', async ({ page }) => {
  await page.click('#edit-toggle');
  const accepted = await page.evaluate(() => {
    const folder = document.querySelector('#folders .tile--folder');
    const link = document.querySelector('#tiles .tile[data-id]');
    folder.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: link.getBoundingClientRect().left + 2, dataTransfer: new DataTransfer() });
    link.dispatchEvent(over);
    return over.defaultPrevented;
  });
  expect(accepted).toBe(false);
});

test('glisser hors d’un dossier ouvert ramène le raccourci à l’accueil', async ({ page }) => {
  await page.click('#edit-toggle');
  await page.click('#folders .tile--folder');
  await dragTo(page, '#folder-tiles .tile[data-id]', '#folder-out');
  expect(await tileNames(page, '#folder-tiles')).toEqual(['Unsplash', 'MDN']);
  expect(await tileNames(page, '#tiles')).toEqual(['GitHub', 'GitLab', 'Gmail', 'YouTube', 'Claude']);
  await expect(page.locator('#folder-out')).toBeHidden();
});

test('une suppression peut être annulée', async ({ page }) => {
  await page.click('#edit-toggle');
  await page.locator('#tiles .tile[data-id]').nth(1).click();
  await page.click('#link-delete');
  expect(await tileNames(page, '#tiles')).toEqual(['GitHub', 'Gmail', 'YouTube']);
  await expect(page.locator('.toast span')).toHaveText('Raccourci « GitLab » supprimé.');
  await page.click('.toast__action');
  expect(await tileNames(page, '#tiles')).toEqual(['GitHub', 'GitLab', 'Gmail', 'YouTube']);
});

test('supprimer un dossier se fait sans confirmation et s’annule', async ({ page }) => {
  await page.click('#edit-toggle');
  await page.click('#folders .tile--folder');
  await page.click('#folder-delete');
  expect(await tileNames(page, '#folders')).toEqual([]);
  await expect(page.locator('.toast span')).toHaveText('Dossier « Outils » et ses 3 raccourcis supprimés.');
  await page.click('.toast__action');
  expect(await tileNames(page, '#folders')).toEqual(['Outils']);
});

test('le clic molette sur un dossier ouvre ses raccourcis en arrière-plan', async ({ page }) => {
  await freshPage(page, { chromeStub: true });
  const folder = page.locator('#folders .tile--folder');
  await expect(folder).toHaveAttribute('title', 'Clic molette : ouvrir les 3 raccourcis dans des onglets');
  await folder.click({ button: 'middle' });
  await expect.poll(() => page.evaluate(() => window.__tabs.length)).toBe(3);
  expect(await page.evaluate(() => window.__tabs)).toEqual([
    { url: 'https://claude.ai', active: false, index: 5 },
    { url: 'https://unsplash.com', active: false, index: 6 },
    { url: 'https://developer.mozilla.org', active: false, index: 7 },
  ]);
  await expect(page.locator('#folder-dialog')).toBeHidden();
});

test('touches 1 à 9 et e, une fois le focus rendu à la page', async ({ page }) => {
  await page.keyboard.press('Escape'); // le champ de recherche a le focus au chargement
  await page.keyboard.press('e');
  await expect(page.locator('body')).toHaveClass(/is-editing/);
  await page.keyboard.press('e');
  await expect(page.locator('body')).not.toHaveClass(/is-editing/);
  await page.keyboard.press('Shift+2');
  expect(await page.evaluate(() => window.__opened)).toEqual(['https://gitlab.com']);
});
