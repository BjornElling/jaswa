import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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

test('the account badge and the table quantities agree on how many items there are', async ({ page }) => {
  await openWorkspace(page);
  await importCraftAccount(page);
  /* §0.1 part 2: the count on the badge is the count the user can reach. Both
     figures are the sum of the stacks, not the number of stacks. */
  await expect(page.locator('.import-badge')).toContainText('9 gems & grinds');
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(6);
  const quantities = await page.locator('.craft-grid tbody tr td:nth-child(6)').allTextContents();
  expect(quantities).toEqual(['1', '1', '1', '1', '3', '2']);
  expect(quantities.map(Number).reduce((total, quantity) => total + quantity, 0)).toBe(9);
  const headers = page.locator('.craft-grid thead th');
  await expect(headers).toHaveCount(7);
  await expect(page.getByRole('columnheader', { name: 'Quantity' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /^Can improve/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /^(Held|Fits|Availability)/ })).toHaveCount(0);
  const columnWidths = await page.locator('.craft-grid').first().locator('col')
    .evaluateAll((columns) => columns.map((column) => column.getBoundingClientRect().width));
  expect(columnWidths).toHaveLength(7);
  const widthsWithoutRolls = columnWidths.filter((_, index) => index !== 4);
  const widthSpread = widthsWithoutRolls.length
    ? Math.max(...widthsWithoutRolls) - Math.min(...widthsWithoutRolls)
    : Infinity;
  expect(widthSpread).toBeLessThanOrEqual(1);
  const narrowestOtherColumn = widthsWithoutRolls.length ? Math.min(...widthsWithoutRolls) : -Infinity;
  expect(columnWidths[4]).toBeLessThan(narrowestOtherColumn);
});

test('the box opens by item, set, Ancient, stat and quality, while a chosen sort leads', async ({ page }) => {
  await openWorkspace(page);
  const account = JSON.parse(await readFile(craftAccount, 'utf8')) as {
    rune_craft_item_list: Record<string, unknown>[];
  };
  account.rune_craft_item_list.push(
    { craft_item_id: 9007, craft_type: 1, craft_type_id: 130804, amount: 1, sell_value: 25000 },
    { craft_item_id: 9008, craft_type: 1, craft_type_id: 130404, amount: 1, sell_value: 25000 },
  );
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'craft-sort-account.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('button', { name: 'Gems & Grinds' }).click();

  const rows = page.locator('.craft-grid tbody tr');
  await expect(rows.locator('td:nth-child(1)'))
    .toHaveText(['Gem', 'Gem', 'Gem', 'Gem', 'Gem', 'Gem', 'Gem', 'Grind']);
  await expect(rows.locator('td:nth-child(2)'))
    .toContainText(['Fatal', 'Immemorial', 'Rage', 'Violent', 'Violent', 'Violent', 'Violent', 'Violent']);
  await expect(rows.locator('td:nth-child(4)'))
    .toHaveText(['Legend', 'Legend', 'Legend', 'Legend', 'Hero', 'Legend', 'Hero', 'Hero']);
  await expect(rows.locator('td:nth-child(3)'))
    .toHaveText(['SPD', 'Resistance', 'SPD', 'SPD', 'ATK %', 'SPD', 'SPD', 'SPD']);
  await expect(rows.nth(3).locator('td').nth(1).getByTitle('Ancient')).toHaveText('A');
  await expect(rows.nth(4).locator('td').nth(1).getByTitle('Ancient')).toHaveCount(0);

  /* Quantity takes the lead when chosen; ties return to Gem/Grind, Set, Ancient,
     Stat and descending quality instead of falling back to import order. */
  await page.getByRole('columnheader', { name: 'Quantity' }).getByRole('button').click();
  await expect(rows.locator('td:nth-child(6)')).toHaveText(['3', '2', '1', '1', '1', '1', '1', '1']);
  await expect(rows.locator('td:nth-child(1)'))
    .toHaveText(['Gem', 'Grind', 'Gem', 'Gem', 'Gem', 'Gem', 'Gem', 'Gem']);
  await expect(rows.nth(2).locator('td').nth(1)).toContainText('Fatal');
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
  await expect(row.locator('td').nth(6)).toHaveAttribute('title', /If a rune already has SPD, the Gem's best roll must exceed its current value/);
  /* One Accuracy rune has a weak SPD line the Legend Gem could raise; the
     other is already at the Gem's ceiling and does not inflate the count. */
  await expect(row.locator('td')).toHaveCount(7);
});

test('a grindstone says when none of the matching runes has its stat', async ({ page }) => {
  await openWorkspace(page);
  const ancientAccount = fileURLToPath(new URL('./fixtures/craft-ancient-destroy-no-hp-percent.json', import.meta.url));
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(ancientAccount);
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('button', { name: 'Gems & Grinds' }).click();

  const row = page.locator('.craft-grid tbody tr').filter({ hasText: 'Destroy' });
  await expect(row).toHaveCount(1);
  await expect(row.locator('td').nth(6)).toHaveText('0');
  await expect(row.locator('td').nth(6)).toHaveAttribute('title', 'No Ancient Destroy rune has HP %');
});

test('the count covers each rune the item can improve, including engraved runes', async ({ page }, testInfo) => {
  await openWorkspace(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importCraftAccount(page);

  const rows = page.locator('.craft-grid tbody tr');
  /* A gem for a set the account owns no rune of shows zero and explains why in
     the count's title. */
  const rage = rows.filter({ hasText: 'Rage' });
  await expect(rage.locator('td').nth(6)).toHaveText('0');
  await expect(rage.locator('td').nth(6)).toHaveAttribute('title', 'You own no Rage rune');
  await expect(rows.filter({ hasText: 'Fatal' }).locator('td').nth(6)).toHaveText('1');
  await expect(rows.filter({ hasText: 'Immemorial' }).locator('td').nth(6)).toHaveText('2');
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

  const tables = page.locator('.craft-grid');
  const tableBounds = await tables.evaluateAll((elements) => elements.map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const improveHeader = page.getByRole('columnheader', { name: /^Can improve/ });
  await page.screenshot({ path: testInfo.outputPath('gems-can-improve-before-sort.png'), fullPage: true });
  await improveHeader.getByRole('button').click();
  await page.screenshot({ path: testInfo.outputPath('gems-can-improve-after-sort.png'), fullPage: true });
  expect(await tables.evaluateAll((elements) => elements.map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }))).toEqual(tableBounds);
  await expect(rows.first().locator('td').nth(6)).toHaveText('2');
});

test('filters narrow the box without moving it', async ({ page }, testInfo) => {
  await openWorkspace(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importCraftAccount(page);

  const strip = page.locator('.craft-filter-strip');
  const before = await strip.boundingBox();
  const setGroupBounds = await page.locator('.craft-filter-set').boundingBox();
  const statGroupBounds = await page.locator('.craft-filter-stat').boundingBox();
  expect(setGroupBounds).not.toBeNull();
  expect(statGroupBounds).not.toBeNull();
  expect(setGroupBounds!.y).toBe(statGroupBounds!.y);
  expect(setGroupBounds!.x).toBeLessThan(statGroupBounds!.x);
  const setFilter = page.getByRole('combobox', { name: 'Filter by the rune set the item belongs to' });
  const statFilter = page.getByRole('combobox', { name: 'Filter by the stat the item gives' });
  const setBounds = await setFilter.boundingBox();
  const statBounds = await statFilter.boundingBox();
  expect(setBounds).not.toBeNull();
  expect(statBounds).not.toBeNull();
  expect(setBounds!.width).toBeCloseTo(statBounds!.width, 0);
  expect(setBounds!.width).toBe(260);
  await expect(strip.getByRole('textbox')).toHaveCount(0);
  const groups = strip.locator('.filter-group');
  await expect(groups.locator('.filter-label')).toHaveText(['Item', 'Set', 'Stat', 'Family', 'Grade', 'Fit', 'Quantity']);
  const groupBoxes = await groups.evaluateAll((elements) => elements.map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));
  expect(groupBoxes[0].y).toBe(groupBoxes[1].y);
  expect(groupBoxes[1].y).toBe(groupBoxes[2].y);
  expect(groupBoxes[3].y).toBeGreaterThan(groupBoxes[0].y);
  expect(groupBoxes[3].x).toBe(groupBoxes[0].x);
  expect(groupBoxes[4].x).toBe(groupBoxes[1].x);
  await setFilter.selectOption({ label: 'Fatal' });
  await expect(setFilter).toHaveValue('Fatal');
  expect(await strip.boundingBox()).toEqual(before);
  await statFilter.selectOption({ label: 'SPD' });
  await expect(statFilter).toHaveValue('8');
  expect(await strip.boundingBox()).toEqual(before);
  await page.getByRole('button', { name: 'Reset items filters' }).click();
  expect(await strip.boundingBox()).toEqual(before);
  const filterFrame = page.locator('.data-table-filter-panel');
  expect(await filterFrame.evaluate((element) => getComputedStyle(element).borderWidth)).toBe('0px');
  expect(await filterFrame.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  expect(Number.parseFloat(await page.locator('.craft-filter-kind').evaluate((element) => getComputedStyle(element).borderLeftWidth))).toBeGreaterThan(0);
  const dropdownGaps = await Promise.all(['craft-stat', 'craft-set'].map((id) => page.locator(`#${id}`).evaluate((element) => {
    const group = element.parentElement?.parentElement;
    if (!group) return -1;
    return group.getBoundingClientRect().right - element.getBoundingClientRect().right;
  })));
  expect(dropdownGaps[0]).toBeGreaterThanOrEqual(15);
  expect(dropdownGaps[1]).toBeGreaterThanOrEqual(15);
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
  const minimum = page.getByRole('slider', { name: 'Minimum quantity of this item' });
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

test('best use ranks the runes one gem can be spent on', async ({ page }, testInfo) => {
  await openWorkspace(page);
  await importCraftAccount(page);
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();
  await expect(page.locator('.craft-best-use-filters')).toBeVisible();
  expect(await page.locator('.craft-best-use-filters').evaluate((element) => getComputedStyle(element).borderWidth)).toBe('0px');
  expect(await page.locator('.craft-best-use-filters').evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  expect(Number.parseFloat(await page.locator('.craft-best-use-kind').evaluate((element) => getComputedStyle(element).borderLeftWidth))).toBeGreaterThan(0);
  await expect(page.getByText('Choose a gem or grindstone above.')).toBeVisible();
  const filterBox = page.locator('.craft-best-use-filters');
  const filterBoxBefore = await filterBox.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('gems-best-use-filters-before.png'), fullPage: true });

  await chooseItem(page, 'Violent', 'Gem', 'SPD', 'Legend');
  expect(await filterBox.boundingBox()).toEqual(filterBoxBefore);
  await page.screenshot({ path: testInfo.outputPath('gems-best-use-filters-after.png'), fullPage: true });
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

test('best-use location names Scenario and counts the other placement', async ({ page }, testInfo) => {
  await openWorkspace(page);
  const account = JSON.parse(await readFile(craftAccount, 'utf8')) as {
    runes: Record<string, unknown>[];
    unit_list: { runes: Record<string, unknown>[] }[];
    deck_list?: unknown[];
  };
  const rune = account.runes.find((entry: Record<string, unknown>) => entry.rune_id === 101);
  if (!rune || !account.unit_list[0]) throw new Error('The placement fixture is incomplete.');
  rune.occupied_type = 1;
  rune.occupied_id = 1;
  account.unit_list[0].runes.push(rune);
  const gear = (unit_id: number, rune_id_list: number[]) => ({ unit_id, rune_id_list, artifact_id_list: [] });
  account.deck_list = [{ deck_type: 1, deck_seq: 1, unit_id_list: [1, 2], equip: [gear(1, []), gear(2, [101])] }];
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'scenario-and-preset.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('button', { name: 'Gems & Grinds' }).click();
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();
  await chooseItem(page, 'Violent', 'Gem', 'SPD', 'Legend');

  const strongest = page.locator('.craft-best-use-results .best-artifact-result').first();
  const location = strongest.locator('tbody tr').first().locator('td:nth-child(2) .engraved-place');
  await expect(location).toHaveText('Elucia (2A) (+ 1)');
  await expect(location).toHaveAttribute('title', /Scenario/);
  await expect(location).toHaveAttribute('title', /Arena Attack 1/);
  await page.screenshot({ path: testInfo.outputPath('gems-best-use-scenario-and-preset.png'), fullPage: true });
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
