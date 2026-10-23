import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Six craft stacks against four runes. Every row in the fixture exercises one
 * placement rule of `docs/RUNE-CRAFT-ITEMS.md`, so the counts asserted here are
 * the rules themselves rather than a snapshot of an account.
 */
const craftAccount = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

async function openWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('button', { name: 'Gems & Grinds' }).click();
  await expect(page.getByRole('heading', { name: 'Gems & Grinds' })).toBeVisible();
}

async function importCraftAccount(page: Page) {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(craftAccount);
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('button', { name: 'Gems & Grinds' }).click();
  await expect(page.locator('.craft-grid tbody tr').first()).toBeVisible();
}

async function chooseItem(page: Page, group: string, ...parts: string[]) {
  const chooser = page.getByRole('combobox', { name: 'Choose a gem or grindstone to place' });
  const value = await chooser.evaluate((select: HTMLSelectElement, [label, want]: [string, string[]]) => {
    const optgroup = [...select.querySelectorAll('optgroup')].find((entry) => entry.label === label);
    const option = [...(optgroup?.children ?? [])]
      .find((entry) => want.every((part) => entry.textContent?.includes(part)));
    return (option as HTMLOptionElement | undefined)?.value ?? '';
  }, [group, parts] as [string, string[]]);
  expect(value, `no ${group} option matching ${parts.join(', ')}`).not.toBe('');
  await chooser.selectOption(value);
}

test('the box says what to do when nothing has been imported', async ({ page }, testInfo) => {
  await openWorkspace(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.getByRole('heading', { name: 'Nothing to show until a game file is imported.' })).toBeVisible();
  await expect(page.getByText('Go to Home and drop in the JSON file exported from Summoners War.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('gems-empty.png'), fullPage: true });
});

test('the account badge and the box agree on how many items there are', async ({ page }) => {
  await openWorkspace(page);
  await importCraftAccount(page);
  /* §0.1 part 2: the count on the badge is the count the user can reach. Both
     figures are the sum of the stacks, not the number of stacks. */
  await expect(page.locator('.import-badge')).toContainText('9 gems & grinds');
  await expect(page.locator('.craft-held-balance')).toContainText('9');
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(6);
});

test('a same-stat gem remains usable when its best roll can raise the rune', async ({ page }) => {
  await openWorkspace(page);
  const accuracyAccount = fileURLToPath(new URL('./fixtures/craft-accuracy-regem-account.json', import.meta.url));
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(accuracyAccount);
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('button', { name: 'Gems & Grinds' }).click();

  const row = page.locator('.craft-grid tbody tr').filter({ hasText: 'Accuracy' });
  await expect(row).toHaveCount(1);
  await expect(row.locator('td').nth(6)).toHaveText('1');
  await expect(row.locator('td').nth(6)).toHaveAttribute('title', /same-stat Gem needs a higher possible roll/);
  await expect(row.locator('td').nth(7)).toHaveText('1 in inventory');
  /* One Accuracy rune has a weak SPD line the Legend Gem could raise; the
     other is already at the Gem's ceiling and does not inflate Fits. */
  await expect(row.locator('td').nth(7)).not.toContainText('2 in inventory');
});

test('every stack says how far it reaches, and a dead one says why', async ({ page }) => {
  await openWorkspace(page);
  await importCraftAccount(page);

  const rows = page.locator('.craft-grid tbody tr');
  /* A gem for a set the account owns no rune of has nowhere to go, and the row
     names the rule it failed rather than printing a bare zero. */
  const rage = rows.filter({ hasText: 'Rage' });
  await expect(rage).toContainText('You own no Rage rune');
  /* A gem whose only home is engraved on a monster costs a build before it costs a
     gem, which is the difference the last column exists to show. */
  await expect(rows.filter({ hasText: 'Fatal' })).toContainText('1 engraved');
  await expect(rows.filter({ hasText: 'Immemorial' })).toContainText('1 in inventory · 1 engraved');
  /* Ancient items carry their own verified ranges, not a borrowed ordinary
     table. The row is found by the mark rather than by the word: the Set column
     names the set and the mark says Ancient, and there is no Family column. */
  const ancient = rows.filter({ has: page.getByTitle('Ancient') });
  await expect(ancient).toHaveCount(1);
  const ancientSet = ancient.locator('td').nth(1);
  await expect(ancientSet).toContainText('Violent');
  await expect(ancientSet).not.toContainText('Ancient');
  await expect(ancientSet.getByTitle('Ancient')).toHaveText('A');
  await expect(ancient.locator('td').nth(4)).not.toHaveText('—');
});

test('filters narrow the box without moving it', async ({ page }, testInfo) => {
  await openWorkspace(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importCraftAccount(page);

  const strip = page.locator('.craft-filter-strip');
  const before = await strip.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('gems-filters-before.png'), fullPage: true });
  /* With neither fit choice selected the group does not narrow the box. */
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(6);
  const fit = page.getByRole('group', { name: 'Choose which items to include' });
  await fit.getByRole('button', { name: 'Usable' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath('gems-filters-usable.png'), fullPage: true });
  await fit.getByRole('button', { name: 'Dead stock' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(6);
  await fit.getByRole('button', { name: 'Usable' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(1);
  await fit.getByRole('button', { name: 'Dead stock' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(6);

  await page.getByRole('group', { name: 'Filter by item' }).getByRole('button', { name: 'Grind' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(1);
  /* Rule 2: the control the user clicked changed, and nothing around it moved. */
  expect(await strip.boundingBox()).toEqual(before);

  await page.getByRole('button', { name: 'Reset items filters' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(6);

  /* The stock threshold is optional. It stays in the layout while disabled,
     and when enabled it compares each stack's held count. */
  const minimum = page.getByRole('slider', { name: 'Minimum gem and grind quantity' });
  await expect(minimum).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Have ≥' }).check();
  await expect(minimum).toBeEnabled();
  await minimum.fill('2');
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(2);
  await expect(page.locator('.craft-grid tbody tr td:nth-child(6)')).toHaveText(['3', '2']);
  await minimum.fill('3');
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(1);
  await expect(page.locator('.craft-grid tbody tr td:nth-child(6)')).toHaveText('3');
  await page.screenshot({ path: testInfo.outputPath('gems-filters-quantity.png'), fullPage: true });
  expect(await strip.boundingBox()).toEqual(before);

  await page.getByRole('button', { name: 'Reset items filters' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(6);
  await expect(minimum).toBeDisabled();
  await expect(minimum).toHaveValue('1');
  expect(await strip.boundingBox()).toEqual(before);
});

test('best use ranks the runes one gem can be spent on', async ({ page }) => {
  await openWorkspace(page);
  await importCraftAccount(page);
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();
  await expect(page.locator('.craft-best-use-filters')).toBeVisible();
  await expect(page.getByText('Choose a gem or grindstone above.')).toBeVisible();

  await chooseItem(page, 'Violent', 'Gem', 'SPD', 'Legend');
  await expect(page.getByRole('heading', { name: 'Legend Violent SPD Gem' })).toBeVisible();
  await expect(page.locator('.craft-best-use-facts')).toContainText('7–10');
  /* The score is the one figure here that is not yet the real answer, and it
     says so where it is read. */
  await expect(page.locator('.craft-best-use .notice').first()).toContainText('Provisional score');

  const strongest = page.locator('.craft-best-use-results .best-artifact-result').first();
  await expect(strongest.locator('tbody tr')).toHaveCount(1);
  await expect(strongest.locator('tbody tr').first()).toContainText('Violent');
  await expect(strongest.locator('tbody tr').first()).toContainText('Inventory');

  /* A Violent gem cannot reach the Fatal rune, whatever the filters say. */
  await expect(strongest.locator('tbody')).not.toContainText('Fatal');
});

test('a gem can be followed by a grindstone, and only a gem can', async ({ page }) => {
  await openWorkspace(page);
  await importCraftAccount(page);
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();

  const grindGroup = page.getByRole('group', { name: 'Grind the gemmed property afterwards' });
  await chooseItem(page, 'Violent', 'Grind', 'SPD');
  /* A grindstone has nothing to follow, so the control dims in place rather
     than disappearing and closing the gap under the pointer (rule 2). */
  await expect(grindGroup.getByRole('button', { name: 'Yes' })).toBeDisabled();
  await expect(page.locator('.craft-best-use-table th').nth(2)).toHaveText('Improves');

  await chooseItem(page, 'Violent', 'Gem', 'SPD', 'Legend');
  await expect(page.locator('.craft-best-use-table th').nth(2)).toHaveText('Replaces');
  const row = page.locator('.craft-best-use-results .best-artifact-result').first().locator('tbody tr').first();
  const withoutGrind = await row.textContent();
  await grindGroup.getByRole('button', { name: 'Yes' }).click();
  await expect(page.locator('.craft-best-use-facts')).toContainText('Legend grindstone');
  expect(await row.textContent()).not.toBe(withoutGrind);
});

test('an Ancient item is placed and projected from its own range', async ({ page }) => {
  await openWorkspace(page);
  await importCraftAccount(page);
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();

  /* An `<optgroup>` holds text and no markup, so the chooser spells the mark
     out where the tables draw it. */
  await chooseItem(page, 'Violent A', 'Gem', 'SPD');
  const chosen = page.locator('.craft-best-use-item h3');
  await expect(chosen).toContainText('Legend Violent');
  await expect(chosen.getByTitle('Ancient')).toHaveText('A');

  const row = page.locator('.craft-best-use-results .best-artifact-result').first().locator('tbody tr').first();
  /* The rune is named — as its set plus the mark, never as a set of its own —
     and its before/after figures are calculated from the Ancient table, never
     an ordinary fallback. */
  const runeName = row.locator('td').first().locator('.craft-rune-name');
  await expect(runeName).toContainText('Violent');
  await expect(runeName).not.toContainText('Ancient');
  await expect(runeName.getByTitle('Ancient')).toHaveText('A');
  await expect(row.locator('td').nth(4)).not.toHaveText('—');
  await expect(row.locator('td').nth(5)).not.toHaveText('—');
});

test('a role narrows which runes are offered', async ({ page }) => {
  await openWorkspace(page);
  await importCraftAccount(page);
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();

  await chooseItem(page, 'Immemorial', 'Gem', 'Resistance');
  const strongest = page.locator('.craft-best-use-results .best-artifact-result').first();
  await expect(strongest.locator('tbody tr')).toHaveCount(2);

  /* Bomber takes both sets but wants ATK % or HP % in slot 4, so the CRI Dmg
     rune the Fatal gem lives on falls out of the role and the Violent one
     stays. Neither rune's own figures move: a role narrows the candidates. */
  await page.getByRole('combobox', { name: 'Judge the runes against one role' })
    .selectOption({ label: 'Bomber' });
  await expect(strongest.locator('tbody tr')).toHaveCount(1);
  await expect(strongest.locator('tbody tr').first()).toContainText('Violent');

  /* Turning off both locations leaves nothing, and the page says which
     control to widen rather than looking broken. */
  const scope = page.getByRole('group', { name: 'Choose rune locations' });
  await scope.getByRole('button', { name: 'Engraved' }).click();
  await scope.getByRole('button', { name: 'Inventory' }).click();
  await expect(page.locator('.craft-best-use .notice.warning'))
    .toContainText('No rune matches the Role and the Location filters above.');
});
