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
  await expect(requirements.getByText('The preset names no build, so any will do')).toBeVisible();

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
  await page.screenshot({ path: testInfo.outputPath('optimization-build.png') });
  await page.keyboard.press('Escape');
  await expect(detail).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await box(table)).toEqual(tableBefore);

  /* Every column sorts. */
  await table.getByRole('button', { name: 'E.HP', exact: true }).click();
  await expect(table.getByRole('columnheader', { name: 'E.HP', exact: true })).toHaveAttribute('aria-sort', 'descending');

  /* The calculation's own changes never reach the profile. */
  const stored = await storedPreferences(page);
  /* A fresh workspace writes nothing until a choice is saved, so no document at all passes too. */
  expect((stored?.monsterPreferences as Record<string, unknown> | undefined)?.['11']).toBeUndefined();

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

test('an open build follows the runes as the player works on them', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const settings = page.getByRole('complementary', { name: 'Settings' });
  await settings.getByRole('radio', { name: 'Theoretical' }).nth(0).check();
  await settings.getByRole('radio', { name: 'Theoretical' }).nth(1).check();
  await page.getByRole('button', { name: 'Find builds' }).click();
  const table = page.getByRole('table', { name: 'Rune builds' });
  await page.getByRole('button', { name: 'Show build 2', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Build 2' });
  /* Build 2 puts a Gem on rune 5037's ATK +19% line, turning it into SPD, and grinds it. */
  const slot4 = detail.getByRole('region', { name: 'Slot 4 modifications' });
  await expect(slot4.getByText('Enchanted Gem')).toBeVisible();
  await expect(slot4.getByText('Grindstone')).toBeVisible();
  const rowBefore = await table.getByRole('row').filter({ has: page.getByRole('button', { name: 'Show build 2', exact: true }) }).innerText();

  /* The player gems the line in the game, rolls SPD +5 rather than the +7 the search
     assumed, and the sync brings it back while the overlay is still open. */
  const game = JSON.parse(readFileSync(account, 'utf8')) as { runes: Array<{ rune_id: number; sec_eff: number[][] }> };
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

  /* The table is still there, says the runes changed, and the build's figures follow the roll. */
  await expect(page.getByRole('status').filter({ hasText: 'builds checked' })).toContainText('your runes changed since');
  const rowAfter = await table.getByRole('row').filter({ has: page.getByRole('button', { name: 'Show build 2', exact: true }) }).innerText();
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
  const runeDialog = page.getByRole('dialog').filter({ has: page.getByText('Lock to monster') });
  await runeDialog.getByLabel('Lock to monster').check();
  await page.keyboard.press('Escape');
  await expect(runeDialog).toBeHidden();

  /* The build stays open and says which rune is in its way; the table keeps the row
     where it was, dimmed and marked, and the status line says the locks changed. */
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('region', { name: `${slot} modifications` })).toContainText('The rune is locked to');
  await expect(card).toContainText('Locked to');
  await page.screenshot({ path: testInfo.outputPath('optimization-after-lock.png') });
  await page.keyboard.press('Escape');
  await expect(row.getByRole('img', { name: new RegExp(`${slot}: The rune is locked to`) })).toBeVisible();
  await expect(row).toHaveAttribute('data-stale', 'true');
  expect(await box(row)).toEqual(rowBox);
  await expect(page.getByRole('status').filter({ hasText: 'builds checked' })).toContainText('your locks changed since');
  await expect(page.getByText('You should rebuild.', { exact: false })).toBeHidden();

  /* Then the rune is sold: the row has no figures left to show, and says why. */
  const runeId = await page.evaluate(() => {
    const stored = JSON.parse(window.localStorage.getItem('jaswa-preferences') ?? '{}') as { runeHolds?: Record<string, unknown> };
    return Object.keys(stored.runeHolds ?? {})[0];
  });
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

test('a monster that always crits is counted at a certain crit and shows its own CRI Rate', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const targets = page.getByRole('group', { name: 'Stats', exact: true });
  const before = await targets.innerText();

  await page.getByRole('button', { name: 'Open preset' }).click();
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

  /* Nothing chosen: the preset cannot be opened and there is nothing to find, but
     every control is already in its place. */
  const openPreset = page.getByRole('button', { name: 'Open preset' });
  const find = page.getByRole('button', { name: 'Find builds' });
  const stop = page.getByRole('button', { name: 'Stop the search' });
  await expect(openPreset).toBeDisabled();
  await expect(find).toBeDisabled();
  await expect(stop).toBeDisabled();
  const before = { preset: await box(openPreset), find: await box(find), stop: await box(stop) };
  await page.screenshot({ path: testInfo.outputPath('optimization-layout-empty.png'), fullPage: true });

  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await expect(openPreset).toBeEnabled();
  /* Choosing a monster moves none of them (`AGENTS.md` §2). */
  expect({ preset: await box(openPreset), find: await box(find), stop: await box(stop) }).toEqual(before);

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
  /* Open preset sits under the monster, not beside it. */
  const select = await box(page.getByLabel('Monster', { exact: true }));
  expect(before.preset.y).toBeGreaterThan(select.y + select.height - 1);
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
  /* Each row is the set's name and nothing else. */
  await expect(column('Four-piece sets').getByRole('button')).toHaveText(['Despair', 'Fatal', 'Rage', 'Swift', 'Vampire', 'Violent']);
  const first = await box(column('Two-piece sets'));
  await column('Two-piece sets').getByRole('button', { name: 'Will', exact: true }).hover();
  await column('After Will').getByRole('button', { name: 'Blade', exact: true }).hover();
  await expect(column('After Will and Blade')).toBeVisible();
  /* Every column whole, inside the window — and the first did not slide as the others opened. */
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('no viewport');
  for (const name of ['Four-piece sets', 'Two-piece sets', 'After Will', 'After Will and Blade']) {
    const right = await column(name).evaluate((element) => element.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(viewport.width);
  }
  expect(await box(column('Two-piece sets'))).toEqual(first);
  /* Sixteen two-piece sets fit with no scrollbar. */
  expect(await column('Two-piece sets').evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('optimization-build-menu.png') });
  await page.keyboard.press('Escape');
});

test('a lone four-set, a ceiling and a reset to the preset', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('rune-optimization-account.json').first()).toBeVisible();
  await openOptimization(page);
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const reset = page.getByRole('button', { name: 'Reset to preset' });
  await expect(reset).toBeDisabled();

  /* `Violent` alone: four Violent runes and, with broken sets refused, a whole
     two-set beside them — whichever does most. */
  await page.getByRole('button', { name: /^Desired rune builds/ }).click();
  await page.getByRole('dialog', { name: 'Desired rune builds' }).getByRole('list', { name: 'Four-piece sets' })
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

  /* Resetting asks first, keeps everything on the safe answer, and only then puts the preset back. */
  await expect(reset).toBeEnabled();
  await reset.click();
  const confirm = page.getByRole('dialog', { name: 'Put back what the preset says?' });
  await expect(confirm.getByRole('button', { name: 'Keep my changes' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Keep my changes' }).click();
  await expect(page.getByLabel('Spd: at most')).toHaveValue('170');
  await reset.click();
  await confirm.getByRole('button', { name: 'Reset to preset' }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByLabel('Spd: at most')).toHaveValue('');
  await expect(page.getByRole('button', { name: /^Desired rune builds/ })).toHaveAttribute('aria-label', 'Desired rune builds: Any build');
  await expect(reset).toBeDisabled();
});
