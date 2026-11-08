import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Searching names a monster, and awakening does not change which monster it is,
 * so a search reaches the forms above what it matched and never the forms below
 * (`ACCOUNT-TABLES.md` §3).
 *
 * Both monster tables are held to it, from the same fixture and the same
 * expectations: the two strips present the same search control, so they must
 * answer the same term the same way. Stats and Numbers list a different row per
 * monster — Numbers carries the shrine tabs as well — but the *names* a term
 * reaches are the property under test, and those are identical.
 *
 * The fixture holds two awakening chains in different elements plus a
 * three-stage one, so direction and element scope are both observable:
 *   Poison Master (Water) → Kyle,  Poison Master (Fire) → Todd,
 *   Fairy (Water) → Elucia → Elucia (2A).
 */
const account = fileURLToPath(new URL('./fixtures/awakening-search-account.json', import.meta.url));

/** The two tables, each with the label of its own search box and table. */
const pages = [
  {
    section: 'Stats',
    table: 'Monster stats',
    search: 'Filter monsters by name or set',
    /* Stats hides monsters below the level cap by default and the fixture is
       mostly under it, so that filter is lifted before searching. */
    prepare: async (page: Page) => { await page.getByRole('button', { name: 'Lvl. < 40' }).click(); },
  },
  {
    section: 'Numbers',
    table: 'Monster numbers',
    search: 'Filter Numbers monsters by name',
    /* Numbers shows every level by default, so nothing needs lifting. */
    prepare: async () => {},
  },
] as const;

async function openAccount(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('awakening-search-account.json')).toBeVisible();
  await page.getByRole('button', { name: 'Monster Overview', exact: true }).click();
}

/** Opens one section and returns a search reporting the names it leaves. */
async function searching(page: Page, entry: typeof pages[number]) {
  await page.getByRole('navigation').getByRole('button', { name: entry.section === 'Stats' ? 'Monster Overview' : 'Monster Usage', exact: true }).click();
  await entry.prepare(page);
  const table = page.getByRole('table', { name: entry.table });
  const field = page.getByRole('textbox', { name: entry.search });
  return async (term: string) => {
    await field.fill(term);
    /* Sorted and de-duplicated: the question is which monsters a term reaches,
       not how many copies of one the fixture happens to hold. */
    const names = await table.locator('tbody tr .monster-name').allTextContents();
    return [...new Set(names.map((name) => name.trim()))].sort();
  };
}

for (const entry of pages) {
  test(`${entry.section}: a search reaches the awakened forms of what it matched`, async ({ page }) => {
    await openAccount(page);
    const search = await searching(page, entry);

    /* "Poison Master" is the unawakened name in every element, so it matches
       both copies by name and then brings each one's own awakening with it. */
    expect(await search('poison master')).toEqual([
      'Kyle', 'Poison Master (Fire)', 'Poison Master (Water)', 'Todd',
    ]);

    /* Every stage the page can list, from the name only the first stage carries.
       Both chains answer: the Water one is held as units throughout, while the
       Fire one is held the way accounts usually hold a finished monster — the
       unawakened Fairy sealed in the shrine, only Iselia (2A) left as a unit.

       The two pages differ in the rows they list, not in the monsters the term
       reaches: Numbers carries the shrine tabs and so shows the sealed Fairy
       itself, while Stats is a stat sheet for units and shows what it became.
       Iselia (2A) is the assertion that matters — its own name holds no "fairy",
       so it is there only because the sealed stack seeded the lineage. */
    expect(await search('fairy')).toEqual(entry.section === 'Numbers'
      ? ['Elucia', 'Elucia (2A)', 'Fairy (Fire)', 'Fairy (Water)', 'Iselia (2A)']
      : ['Elucia', 'Elucia (2A)', 'Fairy (Water)', 'Iselia (2A)']);
  });

  test(`${entry.section}: a search does not reach back to less awakened forms`, async ({ page }) => {
    await openAccount(page);
    const search = await searching(page, entry);

    /* Kyle is a form the account has already reached. Poison Master is below it
       and stays out; Todd is the other element's awakening and is a different
       monster, so it stays out too. */
    expect(await search('kyle')).toEqual(['Kyle']);
    expect(await search('todd')).toEqual(['Todd']);

    /* From the middle of a three-stage chain: the 2A above it is included, the
       unawakened Fairy below it is not. */
    expect(await search('elucia')).toEqual(['Elucia', 'Elucia (2A)']);
  });
}
