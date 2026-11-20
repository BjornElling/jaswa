import { expect, test, type Page } from './test-fixtures';
import { fileURLToPath } from 'node:url';

/**
 * The Location filter chooses which rows are shown. It must not change what the
 * account is judged to contain: "Have ≥" and the "Only show if" conditions are
 * answered across every location, so a row keeps the same verdict however the
 * Location boxes are set. "Only show if" also reads every awakening stage;
 * "Have ≥" counts the row's own form only (`ACCOUNT-TABLES.md` §4.1).
 *
 * The fixture splits three awakening stages of one monster across three
 * locations, with a Fire sibling standing by to prove the tally does not simply
 * count everything.
 */
const account = fileURLToPath(new URL('./fixtures/storage-location-account.json', import.meta.url));
const formCountAccount = fileURLToPath(new URL('./fixtures/storage-form-count-account.json', import.meta.url));

async function openStorage(page: Page, file = account) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(file);
  await expect(page.getByText(file.split(/[\\/]/).pop()!)).toBeVisible();
  await page.getByRole('button', { name: 'Monster Overview', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Usage', exact: true }).click();
}

function storage(page: Page) {
  const locations = page.getByRole('group', { name: 'Choose which locations to include' });
  const table = page.getByRole('table', { name: 'Monster numbers' });
  return {
    locations,
    table,
    location: (name: string | RegExp) => locations.locator('label').filter({ hasText: name }).locator('input'),
    /** The monster names the table currently lists, in row order. */
    names: () => table.locator('tbody tr .monster-name').allTextContents(),
    haveAtLeast: page.getByRole('group', { name: 'Only show Numbers monsters if' })
      .locator('label').filter({ hasText: 'Have ≥' }).locator('input'),
    quantity: page.getByRole('slider', { name: 'Minimum monster quantity' }),
    level40: page.getByText('Already have lvl 40 of this mon'),
    familySkilled: page.getByText('All lvl 40 of this family max skilled'),
  };
}

test('Location is first offered as Inventory and lists every place a monster can be', async ({ page }) => {
  await openStorage(page);
  const view = storage(page);
  await expect(view.locations.locator('label')).toHaveText([
    'Inventory', 'Storage', 'Sealed Shrine · Summoned', 'Sealed Shrine · Normal',
  ]);
  for (const box of await view.locations.locator('input[type="checkbox"]').all()) await expect(box).toBeChecked();

  /* One monster in each of the three locations the fixture fills, plus the
     Fire sibling in Inventory. Rows are sorted by name, so the awakened copy
     in Storage leads and the two Inventory monsters are not adjacent. */
  await expect(view.table.locator('tbody tr')).toHaveCount(4);
  expect(await view.names()).toEqual(['Elucia', 'Elucia (2A)', 'Fairy (Water)', 'Iselia (2A)']);
  await expect(view.table.locator('tbody tr td:nth-child(3)')).toHaveText([
    'Storage', 'Sealed Shrine · Summoned', 'Inventory', 'Inventory',
  ]);
});

test('"Have ≥" counts one form across every location, shown or hidden', async ({ page }) => {
  await openStorage(page, formCountAccount);
  const view = storage(page);
  await expect(view.table.locator('tbody tr')).toHaveCount(4);

  /* Fairy is held three times, its two awakened forms once each. The awakened
     rows must not inherit the unawakened copies (`ACCOUNT-TABLES.md` §4.1). */
  await view.haveAtLeast.check();
  await view.quantity.fill('2');
  expect(await view.names()).toEqual(['Fairy (Water)', 'Fairy (Water)']);
  await view.quantity.fill('3');
  expect(await view.names()).toEqual(['Fairy (Water)', 'Fairy (Water)']);

  /* Hiding the shrine must not lower the tally: the Inventory copy is still
     one of three. */
  await view.location('Sealed Shrine · Summoned').uncheck();
  expect(await view.names()).toEqual(['Fairy (Water)']);

  /* Four would be more than the account holds, at any Location setting. */
  await view.quantity.fill('4');
  expect(await view.names()).toEqual([]);
});

test('"Only show if" reads the whole account, not just the visible locations', async ({ page }) => {
  await openStorage(page);
  const view = storage(page);

  /* The Lv. 40 copy of this monster sits in Storage, and it is the only copy
     carrying the level the first condition asks about: the Inventory row is
     Lv. 25 and the shrine row has no level at all. Both conditions must
     therefore hold for those two as well — the question is what the account
     owns, not what this row is. The Lv. 40 copies themselves are the evidence,
     so the table leaves them out. */
  await view.level40.click();
  expect(await view.names()).toEqual(['Elucia (2A)', 'Fairy (Water)']);
  await view.familySkilled.click();
  expect(await view.names()).toEqual(['Elucia (2A)', 'Fairy (Water)']);

  /* Hiding the location that holds the only Lv. 40 copy must not withdraw the
     evidence: the rows that remain still belong to a monster the account owns
     at Lv. 40, fully skilled. Were either index built from the visible rows,
     these would empty out instead. */
  await view.location(/^Storage$/).uncheck();
  expect(await view.names()).toEqual(['Elucia (2A)', 'Fairy (Water)']);

  await view.location('Sealed Shrine · Summoned').uncheck();
  expect(await view.names()).toEqual(['Fairy (Water)']);

  /* Down to one location, and the verdict still stands. */
  await view.location('Inventory').uncheck();
  expect(await view.names()).toEqual([]);
  await view.location('Inventory').check();
  expect(await view.names()).toEqual(['Fairy (Water)']);

  /* Each condition alone hides the Lv. 40 copies too. */
  await view.familySkilled.click();
  expect(await view.names()).toEqual(['Fairy (Water)']);
  await view.level40.click();
  await view.familySkilled.click();
  expect(await view.names()).toEqual(['Fairy (Water)']);
});
