import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Searching names a monster, and awakening does not change which monster it is,
 * so a search reaches the forms above what it matched and never the forms below
 * (`ARTIFACT-CANONICAL.md` §17.15).
 *
 * The fixture holds two awakening chains in different elements plus a
 * three-stage one, so direction and element scope are both observable:
 *   Poison Master (Water) → Kyle,  Poison Master (Fire) → Todd,
 *   Fairy (Water) → Elucia → Elucia (2A).
 */
const account = fileURLToPath(new URL('./fixtures/awakening-search-account.json', import.meta.url));

async function openStorage(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('awakening-search-account.json')).toBeVisible();
  await page.getByRole('button', { name: 'Monsters', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Storage' }).click();
}

function found(page: Page) {
  const table = page.getByRole('table', { name: 'Monsters in Storage' });
  const search = page.getByRole('textbox', { name: 'Filter Storage monsters by name' });
  return async (term: string) => {
    await search.fill(term);
    return table.locator('tbody tr .monster-name').allTextContents();
  };
}

test('a search reaches the awakened forms of what it matched', async ({ page }) => {
  await openStorage(page);
  const search = found(page);

  /* "Poison Master" is the unawakened name in every element, so it matches both
     copies by name and then brings each one's own awakening with it. */
  expect(await search('poison master')).toEqual([
    'Kyle', 'Poison Master (Fire)', 'Poison Master (Water)', 'Todd',
  ]);

  /* All three stages of one chain, from the name only the first stage carries. */
  expect(await search('fairy')).toEqual(['Elucia', 'Elucia (2A)', 'Fairy (Water)']);
});

test('a search does not reach back to less awakened forms', async ({ page }) => {
  await openStorage(page);
  const search = found(page);

  /* Kyle is a form the account has already reached. Poison Master is below it
     and stays out; Todd is the other element's awakening and is a different
     monster, so it stays out too. */
  expect(await search('kyle')).toEqual(['Kyle']);
  expect(await search('todd')).toEqual(['Todd']);

  /* From the middle of a three-stage chain: the 2A above it is included, the
     unawakened Fairy below it is not. */
  expect(await search('elucia')).toEqual(['Elucia', 'Elucia (2A)']);
});
