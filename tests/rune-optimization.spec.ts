import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Rune Optimization's own contracts (`docs/RUNE-OPTIMIZATION.md` §8).
 *
 * The ones held here are the ones a reader of the code cannot see fail: that a
 * change made for one calculation never writes itself back into the monster's
 * profile; that the settings the page does own survive a reload; that the table
 * answers the question on screen and says when it no longer does; and that
 * choosing a build, or a requirement, moves nothing but what was chosen.
 */

const account = fileURLToPath(new URL('./fixtures/rune-optimization-account.json', import.meta.url));

async function freshWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('jaswa-local');
      request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
    });
  });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
}

async function openOptimization(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization' }).click();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
}

/* In page coordinates, not the viewport's: Playwright scrolls a control into view
   before clicking it, and a box that moved only because the page scrolled has not
   moved under the user. */
async function box(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
  });
}

function storedPreferences(page: Page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem('jaswa-preferences');
    return raw ? JSON.parse(raw) as Record<string, unknown> : undefined;
  });
}

test('without an import the page says what it needs', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await openOptimization(page);
  await expect(page.getByText('Import your game data first.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find builds' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('optimization-no-import.png'), fullPage: true });
});

test('engraving a build moves its runes into the saved account and survives reload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  const count = await page.getByRole('button', { name: /^Show build \d+$/ }).count();
  let chosen = 0;
  for (let index = 1; index <= count; index += 1) {
    await page.getByRole('button', { name: `Show build ${index}`, exact: true }).click();
    if (await page.getByRole('dialog', { name: `Build ${index}` }).locator('.rune-build-card-where-value .monster-link').count()) {
      chosen = index;
      break;
    }
    await page.keyboard.press('Escape');
  }
  expect(chosen).toBeGreaterThan(0);
  const detail = page.getByRole('dialog', { name: `Build ${chosen}` });
  const action = detail.getByRole('button', { name: 'Engrave on monster' });
  await expect(action).toBeEnabled();
  await expect(detail.locator('.rune-build-card-where-value .monster-link').first()).toBeVisible();
  const cards = detail.locator('.rune-build-card');
  const cardBoxes = () => cards.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(',');
  }));
  const previously = detail.locator('.rune-build-card-where[data-visible="true"]').filter({ hasText: 'Previously' });
  /* Nothing has moved since the import, so no card has a past to report. */
  await expect(previously).toHaveCount(0);
  const before = await box(detail.locator('.rune-build-head'));
  const cardsBefore = await cardBoxes();
  const buttonBefore = await box(action);
  await page.screenshot({ path: testInfo.outputPath('engrave-before.png') });
  await action.click();

  /* The overlay stays open; the button is the confirmation, in green. */
  const engraved = detail.getByRole('button', { name: 'Engraved', exact: true });
  await expect(engraved).toBeDisabled();
  await expect(engraved).toHaveAttribute('data-done', 'true');
  await expect(detail.locator('.rune-build-card-where-value').filter({ hasText: 'This monster' })).toHaveCount(6);
  /* Each rune that moved names where the import had it; one that was already
     on this monster has nothing to say. */
  await expect(previously.first()).toBeVisible();
  await expect(previously.locator('.monster-link').first()).toBeVisible();
  const moved = await previously.count();
  expect(moved).toBeGreaterThan(0);
  expect(moved).toBeLessThanOrEqual(6);
  expect(await box(detail.locator('.rune-build-head'))).toEqual(before);
  expect(await cardBoxes()).toEqual(cardsBefore);
  expect(await box(engraved)).toEqual(buttonBefore);
  await page.screenshot({ path: testInfo.outputPath('engrave-after.png') });

  /* Reopened after a reload, the build still says where its runes came from. */
  await page.reload();
  await openOptimization(page);
  await expect(page.getByLabel('Monster', { exact: true })).toHaveValue('11');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await page.getByRole('button', { name: `Show build ${chosen}`, exact: true }).click();
  await expect(previously).toHaveCount(moved);
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();
  const stored = await page.evaluate(async () => new Promise<{ runes: Array<{ rune_id: number; occupied_id: number; occupied_type: number }>; unit_list: Array<{ unit_id: number; runes: Array<{ rune_id: number }> }> }>((resolve) => {
    const request = indexedDB.open('jaswa-local', 1);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('workspace', 'readonly').objectStore('workspace').get('imported-game');
      read.onsuccess = () => { resolve(read.result.data); db.close(); };
    };
  }));
  const onMonster = stored.runes.filter((rune) => rune.occupied_type === 1 && rune.occupied_id === 11);
  expect(onMonster).toHaveLength(6);
  const original = JSON.parse(readFileSync(account, 'utf8')) as { unit_list: Array<{ runes: Array<{ rune_id: number; occupied_id: number }> }> };
  const imported = original.unit_list.flatMap((unit) => unit.runes);
  expect(onMonster.some((rune) => imported.some((old) => old.rune_id === rune.rune_id && old.occupied_id === 12))).toBe(true);
  expect(stored.runes.some((rune) => rune.occupied_type === 2 && imported.some((old) =>
    old.rune_id === rune.rune_id && old.occupied_id === 11))).toBe(true);
  expect(stored.unit_list.find((unit) => unit.unit_id === 11)?.runes.map((rune) => rune.rune_id).sort())
    .toEqual(onMonster.map((rune) => rune.rune_id).sort());
  for (const unit of stored.unit_list) expect(unit.runes.map((rune) => rune.rune_id).sort())
    .toEqual(stored.runes.filter((rune) => rune.occupied_type === 1 && rune.occupied_id === unit.unit_id)
      .map((rune) => rune.rune_id).sort());

  /* A fresh import is the account as the game has it: nothing has moved, and no
     card remembers a place from the import before. */
  await page.getByRole('button', { name: 'Home', exact: true }).first().click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('dialog').getByRole('button', { name: 'Replace data', exact: true }).click();
  await openOptimization(page);
  await page.getByRole('button', { name: 'Find builds' }).click();
  await page.getByRole('button', { name: `Show build ${chosen}`, exact: true }).click();
  await expect(detail.getByRole('button', { name: 'Engrave on monster' })).toBeEnabled();
  await expect(previously).toHaveCount(0);
});

test('live synchronization explains why engraving is unavailable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('http://127.0.0.1:37654/**', (route) => route.fulfill({ status: 503, body: '' }));
  await freshWorkspace(page);
  await page.evaluate(() => {
    const preferences = JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}');
    localStorage.setItem('jaswa-preferences', JSON.stringify({ ...preferences, importRoute: 'direct', directImportMode: 'live',
      updatedAt: new Date(Date.now() + 1000).toISOString() }));
  });
  await page.reload();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Build 1' });
  await expect(detail.getByRole('button', { name: 'Engrave on monster' })).toBeDisabled();
  await expect(detail.getByRole('img', { name: /Read on game start or Load a JSON file/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('engrave-live-disabled.png') });
});

test('finds builds from the profile, keeps the profile untouched, and moves nothing it did not choose', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);

  /* Nothing is chosen until a monster is: no requirements to show, nothing to find. */
  await expect(page.getByRole('button', { name: 'Find builds' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('optimization-empty.png'), fullPage: true });

  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const requirements = page.getByRole('region', { name: 'Requirements for this calculation' });
  await expect(requirements).toBeVisible();
  /* This copy has no profile, so the builds are open and the figures are its own. */
  await expect(requirements.getByText('The profile names no build, so any will do')).toBeVisible();

  /* Intangible runes and Immemorial items are allowed until the owner says not. */
  await expect(requirements.getByLabel('Allow Intangible runes')).toBeChecked();
  await expect(requirements.getByLabel('Allow Immemorial Gems and Grindstones')).toBeChecked();

  /* A requirement changed here changes that field's caption and nothing else. */
  const panelBefore = await box(requirements);
  await requirements.getByLabel('Allow Intangible runes').uncheck();
  await expect(requirements.getByText('Changed for this calculation')).toBeVisible();
  expect(await box(requirements)).toEqual(panelBefore);

  await page.getByRole('button', { name: 'Find builds' }).click();
  const table = page.getByRole('table', { name: 'Rune builds' });
  await expect(table.getByRole('row')).not.toHaveCount(1);
  await expect(page.getByRole('status').filter({ hasText: 'builds checked' })).toContainText('Processor');
  await expect(table.getByRole('row', { name: /^Now/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('optimization-results.png'), fullPage: true });

  /* Choosing a build opens its six runes in an overlay, in the game's circle, with
     what the build assumes beside them; closing it hands focus back to the row and
     leaves the table where it was. */
  const tableBefore = await box(table);
  const opener = page.getByRole('button', { name: 'Show build 1', exact: true });
  await opener.click();
  const detail = page.getByRole('dialog', { name: 'Build 1' });
  await expect(detail).toBeVisible();
  const circle = detail.getByRole('list', { name: 'Runes' });
  await expect(circle.getByRole('listitem', { name: /^Slot \d$/ })).toHaveCount(6);
  /* Slot 1 sits above slot 4, and slot 2 to the right of slot 6, as in the game. */
  const [slot1, slot2, slot4, slot6] = await Promise.all([1, 2, 4, 6]
    .map((slot) => box(circle.getByRole('listitem', { name: `Slot ${slot}`, exact: true }))));
  expect(slot1.y).toBeLessThan(slot4.y);
  expect(slot1.x).toBe(slot4.x);
  expect(slot2.x).toBeGreaterThan(slot1.x);
  expect(slot6.x).toBeLessThan(slot1.x);
  const changes = detail.getByRole('region', { name: 'Modifications' });
  await expect(changes.getByRole('region', { name: /^Slot \d modifications$/ })).toHaveCount(6);
  await detail.locator('img').evaluateAll((images) => Promise.all(images.map((image) => (image as HTMLImageElement).decode().catch(() => undefined))));
  await detail.locator('.rune-build-centre .monster-portrait').evaluate(async (element) => {
    const background = getComputedStyle(element).backgroundImage;
    if (background === 'none') return;
    const image = new Image();
    image.src = background.slice(5, -2);
    await image.decode().catch(() => undefined);
  });
  await page.screenshot({ path: testInfo.outputPath('optimization-build.png') });
  const monsterLink = detail.locator('.rune-build-centre').getByRole('button');
  const centreBefore = await box(detail.locator('.rune-build-centre'));
  await monsterLink.locator('.rune-build-centre-name').click();
  const monsterDetail = page.getByRole('dialog').filter({ has: page.locator('#monster-overlay-title') });
  await expect(monsterDetail).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('optimization-monster.png') });
  await page.keyboard.press('Escape');
  await expect(monsterDetail).toBeHidden();
  await expect(monsterLink).toBeFocused();
  expect(await box(detail.locator('.rune-build-centre'))).toEqual(centreBefore);
  await page.screenshot({ path: testInfo.outputPath('optimization-build-return.png') });
  await monsterLink.locator('.monster-portrait').click();
  await expect(monsterDetail).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('optimization-monster-from-portrait.png') });
  await page.keyboard.press('Escape');
  await expect(monsterLink).toBeFocused();
  expect(await box(detail.locator('.rune-build-centre'))).toEqual(centreBefore);
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await box(table)).toEqual(tableBefore);

  /* The table holds the best builds by one figure, so its headers do not sort it:
     choosing another figure to rank by searches again, in place. */
  const ranked = (await table.getByRole('columnheader').allInnerTexts()).map((text) => text.trim());
  await expect(table.locator('thead th[aria-sort]')).toHaveCount(1);
  await expect(table.locator('thead button')).toHaveCount(0);
  /* This copy ranks by SPD from its type; choosing it again starts nothing. */
  await expect(page.getByLabel('Rank by', { exact: true })).toHaveValue('spd');
  await page.getByLabel('Rank by', { exact: true }).selectOption('spd');
  await expect(page.getByRole('button', { name: 'Find builds' })).toBeEnabled();
  const ehpAt = ranked.indexOf('E.HP');
  const buildRows = table.getByRole('row').filter({ has: page.getByRole('button', { name: /^Show build \d+$/ }) });
  const column = (at: number) => buildRows.evaluateAll((rows, index) =>
    rows.map((row) => Number((row.children[index] as HTMLElement).innerText.replace(/\D/g, ''))), at);
  const bySpeed = await column(ehpAt);
  const headingColour = (name: string) => table.getByRole('columnheader', { name, exact: true })
    .locator('.rank-heading').evaluate((element) => getComputedStyle(element).color);
  const labelsBefore = await Promise.all((await table.locator('.rank-heading-label').all()).map(box));
  expect(await headingColour('Spd')).not.toBe(await headingColour('E.HP'));
  await page.getByLabel('Rank by', { exact: true }).selectOption('ehp');
  await expect(table.getByRole('columnheader', { name: 'E.HP', exact: true })).toHaveAttribute('aria-sort', 'descending');
  /* The clear ink and the mark move to the new column; no heading moves with them. */
  await expect(table.getByRole('columnheader', { name: 'Spd', exact: true })).not.toHaveAttribute('aria-sort');
  expect(await Promise.all((await table.locator('.rank-heading-label').all()).map(box))).toEqual(labelsBefore);
  expect(await headingColour('E.HP')).not.toBe(await headingColour('Spd'));
  expect(await table.getByRole('columnheader', { name: 'E.HP', exact: true }).locator('.sort-mark')
    .getAttribute('data-direction')).toBe('descending');
  await expect(page.getByRole('button', { name: 'Find builds' })).toBeEnabled();
  await expect(page.locator('.rune-optimization-stale')).not.toHaveAttribute('data-shown', 'true');
  const lives = await column(ehpAt);
  expect(lives.length).toBeGreaterThan(0);
  expect(lives).toEqual([...lives].sort((left, right) => right - left));
  /* A search, not a re-sort: its best E.HP is at least the best the SPD table held. */
  expect(lives[0]).toBeGreaterThanOrEqual(Math.max(...bySpeed));
  await page.screenshot({ path: testInfo.outputPath('optimization-reranked.png'), fullPage: true });

  /* The calculation's own changes never reach the profile. */
  const stored = await storedPreferences(page);
  /* A fresh workspace writes nothing until a choice is saved, so no document at all passes too. */
  expect(Object.values((stored?.monsterPreferences ?? {}) as Record<string, Record<string, unknown>>)
    .some((profiles) => profiles['11'] !== undefined)).toBe(false);

  /* The page's settings are the user's and are kept; changing one says the table is stale. */
  const settings = page.getByRole('complementary', { name: 'Settings' });
  const gradeSelect = settings.getByLabel('Gems: grade');
  await expect(gradeSelect).toBeDisabled();
  const settingsBefore = await box(settings);
  const findBefore = await box(page.getByRole('button', { name: 'Find builds' }));
  const rowsBefore = await table.getByRole('row').count();
  await page.screenshot({ path: testInfo.outputPath('optimization-before-stale.png') });
  await settings.getByRole('radio', { name: 'Theoretical' }).first().check();
  await expect(gradeSelect).toBeEnabled();
  expect(await box(settings)).toEqual(settingsBefore);
  /* The table stays; the warning beside Find builds says it answers the earlier
     question, and appearing moves neither the button nor the table. */
  await expect(page.getByText('You should rebuild.', { exact: false })).toBeVisible();
  expect(await box(page.getByRole('button', { name: 'Find builds' }))).toEqual(findBefore);
  await expect(table.getByRole('row')).toHaveCount(rowsBefore);
  await page.screenshot({ path: testInfo.outputPath('optimization-stale.png') });
  await expect.poll(async () => ((await storedPreferences(page))?.runeOptimization as Record<string, unknown>)?.gems).toBe('theoretical');
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await expect(page.getByRole('complementary', { name: 'Settings' }).getByRole('radio', { name: 'Theoretical' }).first()).toBeChecked();
});

test('Optimize from a build monster returns to a fresh search for that copy', async ({ page }) => {
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  const build = page.getByRole('dialog', { name: 'Build 1' });
  await build.locator('.rune-build-centre').getByRole('button').click();
  const monster = page.getByRole('dialog').filter({ has: page.locator('#monster-overlay-title') });
  await monster.getByRole('button', { name: /^Optimize runes for / }).click();
  await expect(monster).toBeHidden();
  await expect(build).toBeHidden();
  await expect(page.getByLabel('Monster', { exact: true })).toHaveValue('11');
  await expect(page.getByRole('button', { name: 'Find builds' })).toBeEnabled();
});

test('an Ancient rune carries its A at the right edge of a build card', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  const game = JSON.parse(readFileSync(account, 'utf8')) as {
    runes: Array<{ class: number }>;
    unit_list: Array<{ runes: Array<{ class: number }> }>;
  };
  for (const rune of game.runes) rune.class = 16;
  for (const monster of game.unit_list) for (const rune of monster.runes) rune.class = 16;
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'ancient-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(game)),
  });
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  const cards = page.getByRole('dialog', { name: 'Build 1' }).locator('.rune-build-card');
  await expect(cards).toHaveCount(6);
  for (const card of await cards.all()) {
    const mark = card.getByRole('img', { name: 'Ancient' });
    await expect(mark).toBeVisible();
    const cardBox = await card.boundingBox();
    const markBox = await mark.boundingBox();
    expect(markBox!.x + markBox!.width).toBeGreaterThan(cardBox!.x + cardBox!.width - 40);
  }
  await page.screenshot({ path: testInfo.outputPath('optimization-ancient-build.png') });
});

test('an open build follows the runes as the player works on them', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  /* Keep one physical Slot 4 choice so ranking other slots cannot change the rune this sync exercises. */
  type GameRune = { rune_id: number; slot_no: number; sec_eff: number[][] };
  const game = JSON.parse(readFileSync(account, 'utf8')) as {
    runes: GameRune[]; unit_list: Array<{ runes: GameRune[] }>;
  };
  game.runes = game.runes.filter((rune) => rune.slot_no !== 4 || rune.rune_id === 5037);
  for (const unit of game.unit_list) unit.runes = unit.runes.filter((rune) => rune.slot_no !== 4);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'rune-optimization-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(game)),
  });
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const settings = page.getByRole('complementary', { name: 'Settings' });
  await settings.getByRole('radio', { name: 'Theoretical' }).nth(0).check();
  await settings.getByRole('radio', { name: 'Theoretical' }).nth(1).check();
  await page.getByRole('button', { name: 'Find builds' }).click();
  const table = page.getByRole('table', { name: 'Rune builds' });
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Build 1' });
  /* The build puts a Gem on rune 5037's ATK +19% line, turning it into SPD, and grinds it. */
  const slot4 = detail.getByRole('region', { name: 'Slot 4 modifications' });
  await expect(slot4.getByText('Enchanted Gem')).toBeVisible();
  await expect(slot4.getByText('Grindstone')).toBeVisible();
  await expect(slot4.locator('[data-kind="gem"]')).toContainText('+19%');
  const rowBefore = await table.getByRole('row').filter({ has: page.getByRole('button', { name: 'Show build 1', exact: true }) }).innerText();

  /* The player gems the line in the game, rolls SPD +5 rather than the +7 the search
     assumed, and the sync brings it back while the overlay is still open. */
  const rune = game.runes.find((entry) => entry.rune_id === 5037);
  if (!rune) throw new Error('the fixture no longer holds rune 5037');
  rune.sec_eff[0] = [8, 5, 1, 0];
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'rune-optimization-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(game)),
  });
  await page.getByRole('button', { name: 'Replace data' }).click();

  /* The overlay stays, the Gem is done at what it rolled, the stone is still to come. */
  await expect(slot4.getByText('Enchanted Gem')).toHaveCount(0);
  await expect(slot4.getByText('Grindstone')).toBeVisible();
  await expect(detail.getByRole('listitem', { name: 'Slot 4', exact: true }).getByText('+5', { exact: true })).toBeVisible();
  await expect(detail).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('optimization-build-followed.png') });
  await page.keyboard.press('Escape');

  /* The table is still there, the status line still only reports the search, and the build's figures follow the roll. */
  await expect(page.getByRole('status').filter({ hasText: 'builds checked' })).not.toContainText('changed since');
  const rowAfter = await table.getByRole('row').filter({ has: page.getByRole('button', { name: 'Show build 1', exact: true }) }).innerText();
  expect(rowAfter).not.toEqual(rowBefore);
  await expect(page.getByText('You should rebuild.', { exact: false })).toBeHidden();
});

test('an open build names the rune a lock or a sale has taken from it, and keeps its row', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByRole('button', { name: 'Find builds' }).click();
  const table = page.getByRole('table', { name: 'Rune builds' });
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();

  /* The first build that takes a rune off the other monster. */
  const rows = await table.getByRole('button', { name: /^Show build \d+$/ }).count();
  let chosen = 0;
  let card = page.locator('.rune-build-card').first();
  for (let build = 1; build <= rows && chosen === 0; build += 1) {
    await page.getByRole('button', { name: `Show build ${build}`, exact: true }).click();
    const borrowed = page.getByRole('dialog', { name: `Build ${build}` }).getByRole('listitem')
      .filter({ has: page.locator('.rune-build-card-where-value .monster-link') });
    if (await borrowed.count() > 0) { chosen = build; card = borrowed.first(); break; }
    await page.keyboard.press('Escape');
  }
  expect(chosen, 'no build borrows a rune from the other monster').toBeGreaterThan(0);
  const detail = page.getByRole('dialog', { name: `Build ${chosen}` });
  const slot = (await card.getAttribute('aria-label')) ?? '';
  const row = table.getByRole('row').filter({ has: page.getByRole('button', { name: `Show build ${chosen}`, exact: true }) });
  const rowBox = await box(row);
  await page.screenshot({ path: testInfo.outputPath('optimization-before-lock.png') });

  /* The player locks that rune to the monster it is on, from its own overlay. */
  await card.getByRole('button', { name: new RegExp(`^${slot} `) }).click();
  const runeDialog = page.getByRole('dialog').filter({ has: page.getByRole('checkbox', { name: 'Lock', exact: true }) });
  await runeDialog.getByLabel('Lock', { exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(runeDialog).toBeHidden();

  /* The build stays open and says which rune is in its way; the table keeps the row
     where it was, dimmed and marked. The status line stays a report of the search:
     the row already says what changed. */
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('region', { name: `${slot} modifications` })).toContainText('The rune is locked to');
  await expect(card).toContainText('Locked to');
  await page.screenshot({ path: testInfo.outputPath('optimization-after-lock.png') });
  await page.keyboard.press('Escape');
  await expect(row.getByRole('img', { name: new RegExp(`${slot}: The rune is locked to`) })).toBeVisible();
  await expect(row).toHaveAttribute('data-stale', 'true');
  expect(await box(row)).toEqual(rowBox);
  await expect(page.getByRole('status').filter({ hasText: 'builds checked' })).not.toContainText('changed since');
  await expect(page.getByText('You should rebuild.', { exact: false })).toBeHidden();

  /* Then the rune is sold: the row has no figures left to show, and says why. */
  /* The lock lives with the import, by scope, monster and rune. */
  const runeId = await page.evaluate(async () => new Promise<string>((resolve) => {
    const request = indexedDB.open('jaswa-local', 1);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction('workspace', 'readonly').objectStore('workspace').get('imported-game');
      read.onsuccess = () => {
        const locks = (read.result.runeLocks ?? {}) as Record<string, Record<string, Record<string, string>>>;
        resolve(Object.keys(Object.values(locks.default ?? {})[0] ?? {})[0]);
        db.close();
      };
    };
  }));
  const game = JSON.parse(readFileSync(account, 'utf8')) as {
    runes: Array<{ rune_id: number }>; unit_list: Array<{ runes: Array<{ rune_id: number }> }>;
  };
  game.runes = game.runes.filter((entry) => String(entry.rune_id) !== runeId);
  for (const unit of game.unit_list) unit.runes = unit.runes.filter((entry) => String(entry.rune_id) !== runeId);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'rune-optimization-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(game)),
  });
  await page.getByRole('button', { name: 'Replace data' }).click();
  await expect(row.getByRole('img', { name: new RegExp(`${slot}: The rune is no longer in the account`) })).toBeVisible();
  await expect(row.getByRole('cell', { name: '—', exact: true })).toHaveCount(11);
  await page.screenshot({ path: testInfo.outputPath('optimization-after-sale.png') });
});

/* The import's locks as stored, by scope, monster and rune. */
const storedLocks = (page: Page) => page.evaluate(async () => new Promise<unknown>((resolve) => {
  const request = indexedDB.open('jaswa-local', 1);
  request.onsuccess = () => {
    const db = request.result;
    const read = db.transaction('workspace', 'readonly').objectStore('workspace').get('imported-game');
    read.onsuccess = () => { resolve(read.result.runeLocks); db.close(); };
  };
}));

test('Lock and Exclude on a build card bind one rune to this monster, move nothing, and last until the next import', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();

  /* A build that takes a rune off the other monster, so the lock has to engrave it. */
  const rows = await page.getByRole('table', { name: 'Rune builds' }).getByRole('button', { name: /^Show build \d+$/ }).count();
  let chosen = 0;
  let card = page.locator('.rune-build-card').first();
  for (let build = 1; build <= rows && chosen === 0; build += 1) {
    await page.getByRole('button', { name: `Show build ${build}`, exact: true }).click();
    const borrowed = page.getByRole('dialog', { name: `Build ${build}` }).getByRole('listitem')
      .filter({ has: page.locator('.rune-build-card-where-value .monster-link') });
    if (await borrowed.count() > 0) { chosen = build; card = borrowed.first(); break; }
    await page.keyboard.press('Escape');
  }
  expect(chosen, 'no build borrows a rune from the other monster').toBeGreaterThan(0);
  const detail = page.getByRole('dialog', { name: `Build ${chosen}` });
  /* Each card held by its slot: what found it changes when its rune moves. */
  const slot = (await card.getAttribute('aria-label')) ?? '';
  card = detail.getByRole('listitem', { name: slot, exact: true });
  /* A card whose rune this monster already carries. */
  const carried = detail.locator('.rune-build-card')
    .filter({ has: page.locator('.rune-build-card-where-value').getByText('This monster', { exact: true }) }).first();
  await expect(carried, 'the build keeps none of the monster\'s own runes').toHaveCount(1);
  const otherSlot = (await carried.getAttribute('aria-label')) ?? '';
  const other = detail.getByRole('listitem', { name: otherSlot, exact: true });
  const lockOf = (of: Locator) => of.locator('.rune-build-card-locks button').nth(0);
  const excludeOf = (of: Locator) => of.locator('.rune-build-card-locks button').nth(1);
  const cards = detail.locator('.rune-build-card');
  const choices = detail.locator('.rune-build-card-locks button');
  const boxes = async () => Promise.all([...await cards.all(), ...await choices.all()].map(box));
  /* Every box stands inside its card's border, whatever the card holds. */
  const spilling = () => cards.evaluateAll((list) => list.filter((card) => {
    const edge = card.getBoundingClientRect();
    return [...card.querySelectorAll('.rune-build-card-locks button')].some((button) => {
      const inner = button.getBoundingClientRect();
      return inner.bottom > edge.bottom - 1 || inner.right > edge.right - 1;
    });
  }).length);
  expect(await spilling()).toBe(0);

  /* Nothing chosen: every box is there, none pressed. */
  await expect(choices).toHaveCount(12);
  for (const choice of await choices.all()) await expect(choice).toHaveAttribute('aria-pressed', 'false');
  const before = await boxes();
  await page.screenshot({ path: testInfo.outputPath('build-locks-empty.png') });

  /* Each box names the move it makes: a rune on another monster is engraved to be
     locked, one this monster carries is taken off to be excluded. */
  await expect(lockOf(card)).toHaveAccessibleName('Engrave and lock');
  await expect(excludeOf(card)).toHaveAccessibleName('Exclude');
  await expect(lockOf(other)).toHaveAccessibleName('Lock');
  await expect(excludeOf(other)).toHaveAccessibleName('Remove and exclude');

  /* Engrave and lock: the rune comes here and is locked, the box now says Lock, and nothing in the circle moves. */
  await lockOf(card).click();
  await expect(lockOf(card)).toHaveAttribute('aria-pressed', 'true');
  await expect(lockOf(card)).toHaveAccessibleName('Lock');
  await expect(card.locator('.rune-build-card-where-value').first()).toHaveText('This monster');
  await expect(detail.getByRole('region', { name: `${slot} modifications` })).toContainText('Locked, used as engraved');
  expect(await boxes()).toEqual(before);

  /* Remove and exclude: the rune leaves this monster and is out of its builds, and this build says so. */
  await excludeOf(other).click();
  await expect(excludeOf(other)).toHaveAttribute('aria-pressed', 'true');
  await expect(excludeOf(other)).toHaveAccessibleName('Exclude');
  await expect(lockOf(other)).toHaveAccessibleName('Engrave and lock');
  await expect(other.locator('.rune-build-card-where-value').first()).toHaveText('Inventory');
  await expect(detail.getByRole('region', { name: `${otherSlot} modifications` })).toContainText('The rune is excluded from this monster');
  expect(await boxes()).toEqual(before);
  expect(await spilling()).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('build-locks-full.png') });

  /* Lock and Exclude are one choice: locking the excluded rune replaces the exclusion; pressing it again takes the lock off and leaves the rune engraved. */
  await lockOf(other).click();
  await expect(lockOf(other)).toHaveAttribute('aria-pressed', 'true');
  await expect(excludeOf(other)).toHaveAttribute('aria-pressed', 'false');
  await lockOf(other).click();
  await expect(lockOf(other)).toHaveAttribute('aria-pressed', 'false');
  await expect(lockOf(other)).toHaveAccessibleName('Lock');
  await excludeOf(other).click();
  await expect(excludeOf(other)).toHaveAttribute('aria-pressed', 'true');

  /* Searched again, every build takes the locked rune as its slot's answer. */
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  const total = await page.getByRole('table', { name: 'Rune builds' }).getByRole('button', { name: /^Show build \d+$/ }).count();
  for (let build = 1; build <= total; build += 1) {
    await page.getByRole('button', { name: `Show build ${build}`, exact: true }).click();
    const shown = page.getByRole('dialog', { name: `Build ${build}` });
    const locked = lockOf(shown.getByRole('listitem', { name: slot, exact: true }));
    await expect(locked).toHaveAttribute('aria-pressed', 'true');
    await expect(locked).toHaveAccessibleName('Lock');
    await expect(excludeOf(shown.getByRole('listitem', { name: otherSlot, exact: true }))).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
  }

  /* The choices are stored with the import and reload with it; a new import is the game's word, and has none. */
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  expect(await storedLocks(page)).toBeTruthy();
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('button', { name: 'Replace data', exact: true }).click();
  await expect.poll(() => storedLocks(page)).toBeUndefined();
});

test('Lock and Exclude are off while JASWA is synchronized with the game', async ({ page }) => {
  await page.route('http://127.0.0.1:37654/**', (route) => route.fulfill({ status: 503, body: '' }));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.evaluate(() => {
    const preferences = JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}');
    localStorage.setItem('jaswa-preferences', JSON.stringify({ ...preferences, importRoute: 'direct', directImportMode: 'live',
      updatedAt: new Date(Date.now() + 1000).toISOString() }));
  });
  await page.reload();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  const choices = page.getByRole('dialog', { name: 'Build 1' }).locator('.rune-build-card-locks button');
  await expect(choices).toHaveCount(12);
  for (const choice of await choices.all()) await expect(choice).toBeDisabled();
});

test('a monster that always crits is counted at a certain crit and shows its own CRI Rate', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const targets = page.getByRole('group', { name: 'Stats', exact: true });
  const before = await targets.innerText();

  await page.getByRole('button', { name: 'Open profile' }).click();
  const profile = page.getByRole('dialog').filter({ has: page.getByLabel('Always crits') });
  const toggle = profile.getByLabel('Always crits');
  await expect(toggle).not.toBeChecked();
  const stats = profile.locator('.stat-ranges');
  const statsBefore = await box(stats);
  await page.screenshot({ path: testInfo.outputPath('always-crits-off.png') });
  await toggle.check();
  /* The choice moves nothing beside it: the mark's place was already kept. */
  expect(await box(stats)).toEqual(statsBefore);
  await expect(profile.getByRole('img', { name: 'Always crits' })).toBeVisible();
  await expect(profile.getByLabel('CtR%: at least')).toBeDisabled();
  await expect(profile.getByLabel('CtR%: at most')).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('always-crits-on.png') });
  await profile.getByRole('button', { name: 'Save changes' }).click();
  await expect(profile).toBeHidden();

  /* CRI Rate reads the same; DMG is now counted with every hit a crit. */
  await expect(targets.getByRole('img', { name: 'Always crits' })).toBeVisible();
  await expect(targets.getByLabel('CtR%: at least')).toBeDisabled();
  const after = await targets.innerText();
  const figure = (text: string, at: number) => text.split('\n').map((line) => line.trim()).filter((line) => /^[\d.,]+$/.test(line))[at];
  expect(figure(after, 4)).toEqual(figure(before, 4));
  expect(Number(figure(after, 8).replace(/\D/g, ''))).toBeGreaterThan(Number(figure(before, 8).replace(/\D/g, '')));

  await page.getByRole('button', { name: 'Find builds' }).click();
  const table = page.getByRole('table', { name: 'Rune builds' });
  await expect(table.getByRole('row')).not.toHaveCount(1);
  /* The mark stays above, by the field; the table reads figures only. */
  await expect(table.getByRole('img', { name: 'Always crits' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('always-crits-table.png'), fullPage: true });
});

test('a CRI Rate range names the copy\'s own CRI Rate, and DMG is dealt with the crit lead', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const stats = page.getByRole('group', { name: 'Stats', exact: true });
  const rate = stats.locator('.stat-range[data-figure="criRate"]');
  const before = await box(rate);
  const shown = await rate.locator('.overlay-stat-current').innerText();
  await page.screenshot({ path: testInfo.outputPath('raw-crit-range-empty.png') });
  await page.getByRole('button', { name: 'Open profile' }).click();
  const profile = page.getByRole('dialog').filter({ has: page.getByRole('spinbutton', { name: 'Crit lead, in percent' }) });
  await profile.getByRole('spinbutton', { name: 'Crit lead, in percent' }).fill('33');
  await profile.getByRole('button', { name: 'Save changes' }).click();
  await rate.getByRole('spinbutton', { name: 'CtR%: at least' }).fill('34');
  await rate.getByRole('spinbutton', { name: 'CtR%: at most' }).fill('36');
  await expect(rate.getByRole('img', { name: /Crit lead adds 33% CRI Rate to DMG/ })).toBeVisible();
  await expect(rate.locator('.overlay-stat-current')).toHaveText(shown);
  expect(await box(rate)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('raw-crit-range-filled.png') });
  await page.getByRole('button', { name: 'Find builds' }).click();
  const table = page.getByRole('table', { name: 'Rune builds' });
  await expect(table).toBeVisible();
  const rows = table.getByRole('row').filter({ has: page.getByRole('button', { name: /^Show build \d+$/ }) });
  /* The range is met by the copy's own CRI Rate, which the column shows; the lead
     reaches DMG only, which is dealt at the CRI Rate the fight gives it. */
  expect(await rows.count()).toBeGreaterThan(0);
  const figure = async (row: Locator, at: number) => Number((await row.getByRole('cell').nth(at).innerText()).replace(/\D/g, ''));
  for (const row of await rows.all()) {
    const own = await figure(row, 7);
    expect(own).toBeGreaterThanOrEqual(34);
    expect(own).toBeLessThanOrEqual(36);
    expect(await figure(row, 11)).toBe(Math.floor(await figure(row, 4) * (1 + Math.min(100, own + 33) / 100 * await figure(row, 8) / 100)));
  }
  await page.screenshot({ path: testInfo.outputPath('raw-crit-range-results.png'), fullPage: true });
});
test('a target nothing can reach is answered with an empty table that says why', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByLabel('Spd: at least').fill('999');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByText('No build meets every requirement.', { exact: false })).toBeVisible();
  /* The current build is still there to read against. */
  await expect(page.getByRole('table', { name: 'Rune builds' }).getByRole('row', { name: /^Now/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('optimization-unreachable.png'), fullPage: true });
});

test('the page wears the house panels, and its controls say what they do', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);

  /* Nothing chosen: the profile cannot be opened and there is nothing to find, but
     every control is already in its place. */
  const openProfile = page.getByRole('button', { name: 'Open profile' });
  const find = page.getByRole('button', { name: 'Find builds' });
  const stop = page.getByRole('button', { name: 'Stop the search' });
  await expect(openProfile).toBeDisabled();
  await expect(find).toBeDisabled();
  await expect(stop).toBeDisabled();
  const before = { profile: await box(openProfile), find: await box(find), stop: await box(stop) };
  await page.screenshot({ path: testInfo.outputPath('optimization-layout-empty.png'), fullPage: true });

  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await expect(openProfile).toBeEnabled();
  /* Choosing a monster moves none of them (`AGENTS.md` §2). */
  expect({ profile: await box(openProfile), find: await box(find), stop: await box(stop) }).toEqual(before);

  /* The raised ground of every other workspace, not the sunk ground of a filter strip. */
  const ground = (selector: string) => page.locator(selector).first().evaluate((element) => getComputedStyle(element).backgroundColor);
  const raised = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'panel';
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  });
  expect(await ground('.rune-optimization-monster-panel')).toBe(raised);
  expect(await ground('.rune-optimization-requirements')).toBe(raised);
  /* Find builds is the filled button the other workspaces end on; Stop is a mark
     beside it, square and smaller than it, whose mark is actually drawn. */
  await expect(find).toHaveClass(/\bprimary\b/);
  const stopBox = await box(stop);
  expect(stopBox.width).toBe(stopBox.height);
  expect(stopBox.width).toBeLessThan(before.find.width);
  expect(await stop.locator('svg').evaluate((svg) => svg.getBoundingClientRect().width)).toBeGreaterThan(0);
  /* Open profile sits under the monster, not beside it. */
  const select = await box(page.getByLabel('Monster', { exact: true }));
  expect(before.profile.y).toBeGreaterThan(select.y + select.height - 1);
  /* And the preset under both: the monster comes first, its button with it. */
  const preset = await box(page.getByLabel('Preset', { exact: true }));
  expect(preset.y).toBeGreaterThan(before.profile.y + before.profile.height - 1);
  await expect(page.locator('.rune-optimization-monster-select .monster-portrait')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('optimization-layout-chosen.png'), fullPage: true });
});

test('the build menu cascades three deep, past the edge of its own line, without moving', async ({ page }, testInfo) => {
  /* Narrow enough that the builds line ends well before the third column would. */
  await page.setViewportSize({ width: 1280, height: 900 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');

  const line = page.getByRole('button', { name: /^Desired rune builds/ });
  await line.click();
  const menu = page.getByRole('dialog', { name: 'Desired rune builds' });
  const column = (name: string) => menu.getByRole('list', { name, exact: true });
  /* One first column holds every set, four-sets first, each row the set's name and nothing else. */
  await expect(menu.getByRole('list')).toHaveCount(1);
  const names = await column('Sets').getByRole('button').allInnerTexts();
  expect(names).toHaveLength(22);
  expect(names.slice(0, 6)).toEqual(['Despair', 'Fatal', 'Rage', 'Swift', 'Vampire', 'Violent']);
  const first = await box(column('Sets'));
  await column('Sets').getByRole('button', { name: 'Will', exact: true }).hover();
  await column('After Will').getByRole('button', { name: 'Blade', exact: true }).hover();
  await expect(column('After Will and Blade')).toBeVisible();
  /* Every column whole, inside the window — and the first did not slide as the others opened. */
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  for (const name of ['Sets', 'After Will', 'After Will and Blade']) {
    const right = await column(name).evaluate((element) => element.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(viewport.width);
  }
  expect(await box(column('Sets'))).toEqual(first);
  /* All twenty-two sets fit with no scrollbar. */
  expect(await column('Sets').evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('optimization-build-menu.png') });

  /* A set may be chosen in every column: three Will sets are one build. */
  await column('After Will').getByRole('button', { name: 'Will', exact: true }).hover();
  await column('After Will and Will').getByRole('button', { name: 'Will', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(line).toHaveAttribute('aria-label', 'Desired rune builds: Will/Will/Will');

  /* A four-set and a two-set fill the six slots, so no third column opens. And a
     pointer crossing the first column on its way to the second does not swap the
     set that leads: Despair stays the lead though the path brushes past others. */
  await line.click();
  const despair = column('Sets').getByRole('button', { name: 'Despair', exact: true });
  await despair.hover();
  const target = column('After Despair').getByRole('button', { name: 'Will', exact: true });
  const to = await target.boundingBox();
  if (!to) throw new Error('no row box');
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await expect(column('After Despair and Will')).toHaveCount(0);
  await target.click();
  await expect(line).toHaveAttribute('aria-label', 'Desired rune builds: Will/Will/Will, Despair/Will');
});

test('all stat ranges keep an exact speed endpoint and fixed controls', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.getByLabel('Use the graphics card for heavy calculations').uncheck();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByLabel('Rank by', { exact: true }).selectOption('spd');
  await page.getByRole('slider', { name: 'Depth', exact: true }).press('End');
  const requirements = page.getByRole('region', { name: 'Requirements for this calculation' });
  await expect(requirements.locator('.stat-ranges input[type="number"]')).toHaveCount(22);
  for (const field of await requirements.locator('.stat-ranges input[type="number"]').all()) await expect(field).toHaveValue('');
  const find = page.getByRole('button', { name: 'Find builds', exact: true });
  await find.click();
  await expect(find).toBeEnabled();
  const table = page.getByRole('table', { name: 'Rune builds' });
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  const first = table.getByRole('row').filter({ has: page.getByRole('button', { name: 'Show build 1', exact: true }) });
  const cells = await first.getByRole('cell').allInnerTexts();
  const values = cells.slice(3).map((text) => Number(text.replace(/\D/g, '')));
  expect(values).toHaveLength(11);
  const before = await box(requirements);
  await page.screenshot({ path: testInfo.outputPath('intervals-empty.png'), fullPage: true });
  const ranges = requirements.locator('.stat-range');
  for (let at = 0; at < values.length; at += 1) {
    await ranges.nth(at).getByRole('spinbutton').nth(0).fill('0');
    await ranges.nth(at).getByRole('spinbutton').nth(1).fill(String(values[at]));
  }
  await page.getByLabel('Spd: at least').fill(String(values[3]));
  expect(await box(requirements)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('intervals-filled.png'), fullPage: true });
  await find.click();
  await expect(find).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  const rows = table.getByRole('row').filter({ has: page.getByRole('button', { name: /^Show build \d+$/ }) });
  for (const row of await rows.all()) {
    const figures = (await row.getByRole('cell').allInnerTexts()).slice(3)
      .map((text) => Number(text.replace(/\D/g, '')));
    expect(figures[3]).toBe(values[3]);
    figures.forEach((value, at) => expect(value).toBeLessThanOrEqual(values[at]));
    await expect(row).not.toHaveAttribute('data-stale', 'true');
  }
  expect(await box(requirements)).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('intervals-results.png'), fullPage: true });
});

test('a lone four-set, a ceiling and a reset to the profile', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const reset = page.getByRole('button', { name: 'Reset to profile' });
  await expect(reset).toBeDisabled();

  /* `Violent` alone: four Violent runes and, with broken sets refused, a whole
     two-set beside them — whichever does most. */
  await page.getByRole('button', { name: /^Desired rune builds/ }).click();
  await page.getByRole('dialog', { name: 'Desired rune builds' }).getByRole('list', { name: 'Sets' })
    .getByRole('button', { name: 'Violent', exact: true }).click();
  await expect(page.getByLabel('Allow broken sets')).not.toBeChecked();
  await page.getByLabel('Spd: at most').fill('170');
  await page.getByRole('button', { name: 'Find builds' }).click();
  const table = page.getByRole('table', { name: 'Rune builds' });
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  const rows = table.getByRole('row').filter({ has: page.getByRole('button', { name: /^Show build \d+$/ }) });
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  const headers = await table.getByRole('columnheader').allInnerTexts();
  const spdColumn = headers.findIndex((text) => text.trim() === 'SPD');
  expect(spdColumn).toBeGreaterThan(0);
  for (let at = 0; at < count; at += 1) {
    const cells = await rows.nth(at).getByRole('cell').allInnerTexts();
    expect(cells[1]).toMatch(/^Violent\/[A-Z][a-z]+$/);
    expect(Number(cells[spdColumn].replace(/\D/g, ''))).toBeLessThanOrEqual(170);
  }
  await page.screenshot({ path: testInfo.outputPath('optimization-ceiling.png'), fullPage: true });

  /* A range moved after the search dims exactly the rows it now excludes, and
     dims them in place: the table keeps its rows and its box. */
  const spds: number[] = [];
  for (let at = 0; at < count; at += 1) {
    spds.push(Number((await rows.nth(at).getByRole('cell').nth(spdColumn).innerText()).replace(/\D/g, '')));
  }
  const tableBefore = await box(table);
  const lowered = Math.max(...spds) - 1;
  await page.getByLabel('Spd: at most').fill(String(lowered));
  for (let at = 0; at < count; at += 1) {
    if (spds[at] > lowered) await expect(rows.nth(at)).toHaveAttribute('data-stale', 'true');
    else await expect(rows.nth(at)).not.toHaveAttribute('data-stale', 'true');
  }
  expect(await box(table)).toEqual(tableBefore);
  await page.screenshot({ path: testInfo.outputPath('optimization-ceiling-lowered.png'), fullPage: true });
  /* Back inside every range, nothing is dimmed; a floor above them all dims every row. */
  await page.getByLabel('Spd: at most').fill('170');
  for (let at = 0; at < count; at += 1) await expect(rows.nth(at)).not.toHaveAttribute('data-stale', 'true');
  await page.getByLabel('Spd: at least').fill(String(Math.max(...spds) + 1));
  for (let at = 0; at < count; at += 1) await expect(rows.nth(at)).toHaveAttribute('data-stale', 'true');
  expect(await box(table)).toEqual(tableBefore);
  await page.getByLabel('Spd: at least').fill('');
  for (let at = 0; at < count; at += 1) await expect(rows.nth(at)).not.toHaveAttribute('data-stale', 'true');

  /* Resetting asks first, keeps everything on the safe answer, and only then puts the profile back. */
  await expect(reset).toBeEnabled();
  await reset.click();
  const confirm = page.getByRole('dialog', { name: 'Put back what the profile says?' });
  await expect(confirm.getByRole('button', { name: 'Keep my changes' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Keep my changes' }).click();
  await expect(page.getByLabel('Spd: at most')).toHaveValue('170');
  await reset.click();
  await confirm.getByRole('button', { name: 'Reset to profile' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByLabel('Spd: at most')).toHaveValue('');
  await expect(page.getByRole('button', { name: /^Desired rune builds/ })).toHaveAttribute('aria-label', 'Desired rune builds: Any build');
  await expect(reset).toBeDisabled();
});

test('owned craft work respects a tight ceiling and leaves full requirement panels in place', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await openOptimization(page);
  await page.screenshot({ path: testInfo.outputPath('craft-ranges-empty.png'), fullPage: true });
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByRole('slider', { name: 'Depth', exact: true }).press('Home');
  await page.getByLabel('Rank by', { exact: true }).selectOption('dmg');
  const requirements = page.getByRole('region', { name: 'Requirements for this calculation' });
  for (const input of await requirements.locator('.stat-ranges input[type="number"]').all()) {
    await input.fill((await input.getAttribute('aria-label'))?.includes('at most') ? '1000000000' : '0');
  }
  await page.getByLabel('Spd: at most', { exact: true }).fill('170');
  const settings = page.getByRole('complementary', { name: 'Settings' });
  for (const radio of await settings.getByRole('radio', { name: 'Owned only', exact: true }).all()) await radio.check();
  const panel = page.locator('.rune-optimization-monster-panel');
  const before = { panel: await box(panel), requirements: await box(requirements) };
  await page.screenshot({ path: testInfo.outputPath('craft-ranges-before.png'), fullPage: true });
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Find builds' })).toBeEnabled();
  const table = page.getByRole('table', { name: 'Rune builds' });
  const headers = await table.getByRole('columnheader').allInnerTexts();
  const speed = headers.findIndex((text) => text.trim() === 'SPD');
  expect(speed).toBeGreaterThan(0);
  const rows = table.getByRole('row').filter({ has: page.getByRole('button', { name: /^Show build \d+$/ }) });
  expect(await rows.count()).toBeGreaterThan(0);
  for (const row of await rows.all()) {
    expect(Number((await row.getByRole('cell').nth(speed).innerText()).replace(/\D/g, ''))).toBeLessThanOrEqual(170);
    await expect(row).not.toHaveAttribute('data-stale', 'true');
  }
  expect(await box(panel)).toEqual(before.panel);
  expect(await box(requirements)).toEqual(before.requirements);
  await expect(page.getByLabel('Spd: at most', { exact: true })).toHaveValue('170');
  await page.screenshot({ path: testInfo.outputPath('craft-ranges-after.png'), fullPage: true });
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Build 1', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('craft-ranges-build.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeFocused();
});


test('selection and adjustment choices keep their boxes and survive a reload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await openOptimization(page);
  /* The preset leads the panel; an account with no saved decks has Default alone, chosen. */
  const preset = page.getByLabel('Preset', { exact: true });
  await expect(preset).toHaveValue('default');
  await expect(preset.locator('option')).toHaveText(['Default']);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const settings = page.getByRole('complementary', { name: 'Settings' });
  const before = await box(settings);
  const fields = settings.locator('input, select');
  const positions = await Promise.all((await fields.all()).map(box));
  await page.screenshot({ path: testInfo.outputPath('selection-before.png'), fullPage: true });
  const odd = settings.getByLabel('Slot 1/3/5 only counts at +12');
  await odd.check();
  await settings.getByLabel('Count unfinished runes at their +15 main stat').uncheck();
  await expect(odd).toBeDisabled(); await expect(odd).toBeChecked();
  await settings.getByLabel('Limit changes').check();
  const maximum = settings.getByLabel('Maximum changes');
  await expect(maximum).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Find builds' })).toBeDisabled();
  await maximum.fill('0'); await expect(maximum).toHaveValue('');
  await maximum.fill('7'); await expect(maximum).toHaveValue('');
  await maximum.fill('1');
  await expect(page.getByRole('button', { name: 'Find builds' })).toBeEnabled();
  await maximum.fill('6');
  await settings.getByLabel('Just fill in empty slots').check();
  await settings.getByLabel('Only runes not engraved on others').check();
  await settings.getByLabel('Include runes from higher-priority monsters').check();
  await settings.getByLabel('Count unfinished runes at their +15 main stat').check();
  await settings.getByRole('radio', { name: 'Theoretical', exact: true }).first().check();
  await settings.getByRole('radio', { name: 'Theoretical', exact: true }).last().check();
  await settings.getByLabel('Gems: grade').selectOption('Legend');
  await settings.getByLabel('Grindstones: grade').selectOption('Legend');
  await settings.getByLabel('Gems: roll').selectOption('maximum');
  expect(await box(settings)).toEqual(before);
  expect(await Promise.all((await fields.all()).map(box))).toEqual(positions);
  await page.screenshot({ path: testInfo.outputPath('selection-after.png'), fullPage: true });
  await page.getByRole('button', { name: 'Find builds' }).click();
  const table = page.getByRole('table', { name: 'Rune builds' });
  await expect(table.getByRole('columnheader', { name: 'Changes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show build 2', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show build 1', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Build 1' });
  await expect(detail.getByText('As it is', { exact: true })).toHaveCount(6);
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(settings.getByLabel('Just fill in empty slots')).toBeChecked();
  await expect(settings.getByLabel('Slot 1/3/5 only counts at +12')).toBeChecked();
  await expect(settings.getByLabel('Only runes not engraved on others')).toBeChecked();
  await expect(settings.getByLabel('Maximum changes')).toHaveValue('6');
  await expect(settings.getByLabel('Gems: grade')).toHaveValue('Legend');
  await maximum.fill('');
  await settings.getByLabel('Limit changes').uncheck();
  await page.reload();
  await expect(maximum).toHaveValue('');
  await expect(settings.getByLabel('Just fill in empty slots')).toBeChecked();
});

test('an empty monster respects the maximum changes when filling its six slots', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  const game = JSON.parse(readFileSync(account, 'utf8'));
  const monster = game.unit_list.find((unit: { unit_id: number }) => unit.unit_id === 11);
  monster.runes = [];
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'empty-slots.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(game)),
  });
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await page.getByLabel('Just fill in empty slots').check();
  await page.getByLabel('Limit changes').check();
  await page.getByLabel('Maximum changes').fill('1');
  await page.screenshot({ path: testInfo.outputPath('empty-slots-before.png'), fullPage: true });
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'builds checked' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toHaveCount(0);
  await page.getByLabel('Maximum changes').fill('6');
  await page.getByRole('button', { name: 'Find builds' }).click();
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  const table = page.getByRole('table', { name: 'Rune builds' });
  const changesHeading = table.getByRole('columnheader', { name: 'Changes', exact: true });
  expect(await changesHeading.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const column = await table.getByRole('columnheader').allTextContents();
  const at = column.findIndex((text) => text.includes('Changes'));
  for (const row of await table.locator('tbody tr').all()) {
    if (await row.getByRole('button', { name: /^Show build/ }).count()) await expect(row.getByRole('cell').nth(at)).toHaveText('6');
  }
  await page.screenshot({ path: testInfo.outputPath('empty-slots-after.png'), fullPage: true });
});
