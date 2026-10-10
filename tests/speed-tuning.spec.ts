import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Speed Tuning reads the account's presets (`docs/DECK-PRESETS.md` §5): every
 * preset with a monster is a line in its content's column, its monsters and
 * leader are the game's, and only the turn order wanted and the what-ifs tried
 * are the user's to state.
 */

/* Bernard 1, Megan 2, Verdehile 3, Lushen #1 4, Lushen #2 5, Veromos 6. */
const base = JSON.parse(readFileSync(new URL('./fixtures/speed-account.json', import.meta.url), 'utf8'));
const deck = (type: number, seq: number, members: number[], extra: Record<string, unknown> = {}) =>
  ({ deck_type: type, deck_seq: seq, unit_id_list: members, equip: null, ...extra });
const withPresets = {
  ...base,
  deck_list: [
    deck(24, 101, [2, 1, 4, 6, 3]),
    deck(24, 102, [4, 5, 0, 0, 0]),
    deck(24, 201, [2, 1], { leader_unit_id: 2 }),
    deck(24, 301, [3, 6], { leader_unit_id: 3 }),
    deck(1, 1, [1, 4, 5, 2]),
    deck(1, 2, [6, 0, 0, 0]),
    /* A saved deck with nobody in it is no team to tune. */
    deck(1, 3, [0, 0, 0, 0]),
    deck(6, 1, [6]),
    deck(99, 1, [1]),
  ],
  defense_deck_info: { unit_id_list: [5, 0, 0, 0], equip: null },
};

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

async function importAccount(page: Page, data: unknown = withPresets, name = 'speed-presets.json') {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByText(name).first()).toBeVisible();
}

async function openSpeedTuning(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Speed Tuning' }).click();
  await expect(page.getByRole('heading', { name: 'Speed Tuning', exact: true })).toBeVisible();
}

/* A preset's line, named by its preset. */
const presetLine = (scope: Page | Locator, name: string) =>
  scope.getByRole('button', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}: `) });

/* Collapsed table borders land rows on half pixels, so heights agree within one. */
function expectSameHeight(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
}

async function box(locator: Locator) {
  const measured = await locator.boundingBox();
  if (!measured) throw new Error('The element has no box.');
  return measured;
}

test('an empty workspace says what Speed Tuning needs', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await openSpeedTuning(page);
  await expect(page.getByText('Import your game data first.', { exact: false })).toBeVisible();
  /* The presets are the teams: there is nothing to add here. */
  await expect(page.getByRole('button', { name: 'Add…' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('speed-no-import.png') });
});

test('an account without presets shows three empty columns and its totem', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await importAccount(page, base, 'speed-account.json');
  await openSpeedTuning(page);
  await expect(page.getByRole('region', { name: 'Sky Tribe Totem' })).toContainText('Level 20 of 20+15 % of base speed');
  await expect(page.getByText('No dungeon presets.', { exact: true })).toBeVisible();
  await expect(page.getByText('No arena presets.', { exact: true })).toBeVisible();
  await expect(page.getByText('No other presets.', { exact: true })).toBeVisible();
  await expect(page.locator('.speed-summary')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('speed-empty.png') });
});

test('every preset with a monster is a line under its content, and every line opens its team', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await freshWorkspace(page);
  await importAccount(page);
  await openSpeedTuning(page);

  const dungeons = page.getByRole('region', { name: 'Dungeons', exact: true });
  const arena = page.getByRole('region', { name: 'Arena', exact: true });
  const other = page.getByRole('region', { name: 'Other presets', exact: true });
  /* Grouped by content in the game's order, numbered within each. */
  await expect(dungeons.locator('.speed-group-title')).toHaveText(["Giant's Keep", "Dragon's Lair", 'Necropolis']);
  await expect(dungeons.getByRole('region', { name: "Giant's Keep" }).locator('.speed-summary-preset')).toHaveText(['1', '2']);
  /* The arena column opens on its defences, above the attack teams. */
  await expect(arena.locator('.speed-group-title')).toHaveText(['Arena Defense', 'Arena Attack']);
  /* Arena Attack 3 saved nobody, so it is no line. */
  await expect(arena.getByRole('region', { name: 'Arena Attack' }).locator('.speed-summary')).toHaveCount(2);
  await expect(other.locator('.speed-group-title')).toHaveText(['Trial of Ascension', 'Not yet named']);

  /* A content without enemy data, and a deck whose content is not yet named,
     are teams like any other: judged on their own turn order and opened alike. */
  const trial = presetLine(other, 'Trial of Ascension 1');
  await expect(trial).toBeEnabled();
  await expect(trial.locator('.speed-summary-state')).toHaveText('Turn order holds');
  await expect(trial.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'good');
  const unnamed = presetLine(other, 'Deck 99 · 1');
  await expect(unnamed).toBeEnabled();
  await expect(unnamed.locator('.speed-summary-name')).toHaveText(['Bernard (2A)']);
  await page.screenshot({ path: testInfo.outputPath('speed-page-presets.png'), fullPage: true });

  await trial.click();
  const trialTeam = page.getByRole('dialog', { name: 'Trial of Ascension 1' });
  /* Five places, as a Trial of Ascension deck has, and no enemies to cut in. */
  await expect(trialTeam.locator('.speed-slot')).toHaveCount(5);
  await expect(trialTeam.getByRole('columnheader', { name: 'Dungeon speed' })).toBeVisible();
  await expect(trialTeam.getByText('No enemy data for this content')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('speed-trial-team.png') });
  await trialTeam.getByRole('button', { name: 'Close' }).click();
  await expect(trialTeam).toBeHidden();

  await unnamed.click();
  const unnamedTeam = page.getByRole('dialog', { name: 'Deck 99 · 1' });
  /* Nothing says how many a deck of an unknown content holds, so it has the places it fills. */
  await expect(unnamedTeam.locator('.speed-slot')).toHaveCount(1);
  await expect(unnamedTeam.getByRole('columnheader', { name: 'Combat speed' })).toBeVisible();
});

test('a team marked as not speed tuned drops its enemy cut-in and reads green on the page', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await freshWorkspace(page);
  await importAccount(page);
  await openSpeedTuning(page);
  const line = presetLine(page.getByRole('region', { name: 'Dungeons', exact: true }), "Giant's Keep 1");
  await expect(line.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'bad');
  await line.click();
  const card = page.getByRole('dialog', { name: "Giant's Keep 1" });
  const toggle = card.getByRole('checkbox', { name: 'No speed tuning' });
  /* Off until the user says otherwise, at the right edge under the last slot. */
  await expect(toggle).not.toBeChecked();
  const [label, lastSlot, enemySection] = [card.locator('.speed-no-tuning .checkbox-row'), card.locator('.speed-slot').last(),
    card.getByRole('region', { name: 'Enemy cut in' })];
  const [cardBefore, labelBox, slotBox] = [await box(card), await box(label), await box(lastSlot)];
  /* It opens centred in the backdrop's room, as every overlay does — within a
     few pixels, and far from the top it would hug if it were pinned there. */
  const room = await card.evaluate((panel) => {
    const backdrop = panel.parentElement as HTMLElement;
    const style = getComputedStyle(backdrop);
    const outer = backdrop.getBoundingClientRect();
    return { top: outer.top + parseFloat(style.paddingTop), bottom: outer.bottom - parseFloat(style.paddingBottom) };
  });
  expect(Math.abs((cardBefore.y - room.top) - (room.bottom - cardBefore.y - cardBefore.height))).toBeLessThanOrEqual(8);
  expect(labelBox.y).toBeGreaterThanOrEqual(slotBox.y + slotBox.height - 1);
  expect(Math.abs(labelBox.x + labelBox.width - (slotBox.x + slotBox.width))).toBeLessThanOrEqual(1);
  await expect(enemySection).toBeVisible();
  await card.screenshot({ path: testInfo.outputPath('speed-tuned.png') });

  await toggle.check();
  /* The whole enemy section goes — heading, table and Ticks — and the overlay
     closes up on what is left. It is held at the top, so only its bottom edge
     comes up: the top, the slots and the switch stay exactly where they were. */
  await expect(enemySection).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Ticks' })).toHaveCount(0);
  const cardAfter = await box(card);
  expect(cardAfter.height).toBeLessThan(cardBefore.height);
  expect(cardAfter.y).toBe(cardBefore.y);
  expect(await box(label)).toEqual(labelBox);
  expect(await box(lastSlot)).toEqual(slotBox);
  /* Each monster still says whether it is in place and which turns it takes, and nothing about enemies. */
  const verdicts = card.locator('.speed-verdict');
  await expect(verdicts.first()).toContainText(/In place|Too fast|Tied/);
  for (const text of await verdicts.allTextContents()) {
    expect(text).not.toContain('cuts in');
    /* A place in the team's own order, with no enemy turn counted in it: five monsters, five places. */
    for (const [, place] of text.matchAll(/moves (\d+)/g)) expect(Number(place)).toBeLessThanOrEqual(5);
  }
  /* Megan moved 8th behind the enemies' turns and needed 154+ to beat them; now
     her place and her range are the team's own. */
  await expect(verdicts.first()).toHaveText('In place · moves 5th · needs 114+ display speed');
  await card.screenshot({ path: testInfo.outputPath('speed-not-tuned.png') });

  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(card).toHaveCount(0);
  await expect(line.locator('.speed-summary-state')).toHaveText('No speed tuning');
  await expect(line.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'good');
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}').speedTuning?.presets?.['deck-24-101']?.noSpeedTuning))
    .toBe(true);

  /* Kept across a reload, and undone the same way. */
  await page.reload();
  await openSpeedTuning(page);
  await expect(line.locator('.speed-summary-state')).toHaveText('No speed tuning');
  await line.click();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(line.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'bad');
});

test('a tied dungeon preset gets a green check on the overview', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await importAccount(page);
  await openSpeedTuning(page);
  const team = presetLine(page.getByRole('region', { name: 'Dungeons', exact: true }), "Giant's Keep 2");
  await expect(team.locator('.speed-summary-name')).toHaveText(['Lushen #1', 'Lushen #2']);
  await expect(team.locator('.speed-summary-state')).toContainText('Tied · position decides');
  await expect(team.locator('.speed-summary-state')).not.toContainText('out of place');
  await expect(team.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'good');
  await team.screenshot({ path: testInfo.outputPath('speed-tied-team-good.png') });
  await team.click();
  const dialog = page.getByRole('dialog', { name: "Giant's Keep 2" });
  await expect(dialog.locator('.speed-slot').nth(0).locator('.speed-verdict')).toHaveText('Tied with Lushen #2. Position decides.');
  await expect(dialog.locator('.speed-slot').nth(1).locator('.speed-verdict')).toHaveText('Tied with Lushen #1. Position decides.');
  /* The slots the preset leaves empty keep their rows. */
  await expect(dialog.locator('.speed-slot')).toHaveCount(5);
  await expect(dialog.locator('.speed-slot-empty')).toHaveText(['3Empty in this preset', '4Empty in this preset', '5Empty in this preset']);
});

test('a line\'s names are dragged within it to change the team\'s order, kept at once', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await freshWorkspace(page);
  await importAccount(page);
  await openSpeedTuning(page);
  const dungeons = page.getByRole('region', { name: 'Dungeons', exact: true });
  const line = presetLine(dungeons, "Giant's Keep 1");
  const names = line.locator('.speed-summary-name');
  await expect(names).toHaveText(['Megan (2A)', 'Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);
  const others = presetLine(dungeons, "Giant's Keep 2");
  const [lineBefore, othersBefore] = [await box(line), await box(others)];

  /* Bernard taken by its name and dropped to the left of Megan. */
  const bernard = await box(line.locator('.speed-summary-member').nth(1));
  const megan = await box(line.locator('.speed-summary-member').nth(0));
  await page.mouse.move(bernard.x + bernard.width / 2, bernard.y + bernard.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(bernard.x + bernard.width / 2 - (bernard.x - megan.x + 4) * step / 8, megan.y + megan.height / 2);
  }
  await page.mouse.move(megan.x + 3, megan.y + megan.height / 2);
  /* The preview is the line drawn in the drop's order, before anything is kept. */
  await expect(line.locator('.speed-summary-member[data-dragging] .speed-summary-name')).toHaveText('Bernard (2A)');
  await expect(line.locator('.speed-summary-member[data-dragging]')).toHaveCSS('order', '0');
  await page.screenshot({ path: testInfo.outputPath('speed-line-drag-preview.png') });
  await page.mouse.up();

  await expect(names).toHaveText(['Bernard (2A)', 'Megan (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);
  /* A drop is not a click: the team's overlay stays shut, and nothing beyond the line moved. */
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await box(line)).y).toBe(lineBefore.y);
  expect(await box(others)).toEqual(othersBefore);
  /* Kept as the team's order, as Save in the overlay would keep it, and the overlay opens on it. */
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}').speedTuning?.presets?.['deck-24-101']?.order))
    .toEqual(['1', '2', '4', '6', '3']);
  await page.reload();
  await openSpeedTuning(page);
  await expect(names).toHaveText(['Bernard (2A)', 'Megan (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);
  await line.click();
  await expect(page.getByRole('dialog', { name: "Giant's Keep 1" }).locator('.speed-monster .monster-name'))
    .toHaveText(['Bernard (2A)', 'Megan (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);
  await page.keyboard.press('Escape');

  /* A line Speed Tuning cannot judge has no team order to drag. */
  await expect(presetLine(page.getByRole('region', { name: 'Other presets', exact: true }), 'Deck 99 · 1')
    .locator('.speed-summary-member[draggable="true"]')).toHaveCount(0);
});

test('tunes a dungeon preset, explains every miss, and keeps the card still', async ({ page }, testInfo) => {
  /* Long on purpose — a whole preset reordered, edited, saved and reloaded — and
     run beside every other spec against one dev server. Twenty seconds on a
     quiet machine ran past the default thirty under load, so the budget is set
     for the load rather than the quiet. */
  test.setTimeout(90_000);
  await freshWorkspace(page);
  await importAccount(page);
  await openSpeedTuning(page);

  const dungeons = page.getByRole('region', { name: 'Dungeons', exact: true });
  const headBefore = await box(dungeons.getByRole('heading', { name: 'Dungeons' }));
  const line = presetLine(dungeons, "Giant's Keep 1");
  /* The line lists the preset in the game's own order until the user asks for another. */
  await expect(line.locator('.speed-summary-name')).toHaveText(['Megan (2A)', 'Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);
  await expect(line.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'bad');
  const lineBox = await box(line);

  /* Opened, nothing is edited yet: Escape closes it and the line has focus again. */
  await line.click();
  const card = page.getByRole('dialog', { name: "Giant's Keep 1" });
  await expect(card.getByRole('heading', { name: "Giant's Keep 1" })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await expect(card.getByLabel('Select dungeon')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(line).toBeFocused();
  await line.click();

  /* The dungeon's facts and every stage's row are there before anything moves. */
  await expect(card.locator('.speed-dungeon-facts')).toContainText(/Fastest enemy\d+ dungeon speedAcc needed\d+%/);
  const enemyTurns = card.getByRole('region', { name: 'Enemy cut in' });
  await expect(enemyTurns.locator('tbody tr')).toHaveCount(4);
  await expect(card.locator('.speed-slot')).toHaveCount(5);
  await expect(card.getByRole('button', { name: 'Ticks' })).toBeEnabled();
  /* The monsters are the preset's: nothing to add, nothing to remove. */
  await expect(card.getByLabel(/^Add a monster/)).toHaveCount(0);
  await expect(card.getByRole('button', { name: /^Remove/ })).toHaveCount(0);
  const names = card.locator('.speed-monster .monster-name');
  await expect(names).toHaveText(['Megan (2A)', 'Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);
  const startBox = await box(card.locator('.speed-team-editor'));
  await page.screenshot({ path: testInfo.outputPath('speed-overlay-opened.png') });

  /* Dragging Megan down slides the others up to where the drop leaves them,
     numbered as drawn, before anything is committed; the drop commits it. */
  const slots = card.locator('.speed-slot');
  const slotBoxes = await Promise.all([0, 1, 2, 3, 4].map((at) => box(slots.nth(at).locator('.speed-monster'))));
  /* Taken by its number: the name is a link, and a link is not a handle. */
  const handle = await box(slots.nth(0).locator('.speed-order'));
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + (slotBoxes[4].y - slotBoxes[0].y) * step / 12);
  }
  await expect(card.locator('.speed-order')).toHaveText(['5', '1', '2', '3', '4']);
  await expect(names).toHaveText(['Megan (2A)', 'Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);
  /* Drawn aside, not laid out again: the slide moves the rows, never the editor. */
  await expect.poll(async () => Math.abs((await box(slots.nth(1).locator('.speed-monster'))).y - slotBoxes[0].y)).toBeLessThanOrEqual(1);
  await expect.poll(async () => Math.abs((await box(slots.nth(0).locator('.speed-monster'))).y - slotBoxes[4].y)).toBeLessThanOrEqual(1);
  expectSameHeight((await box(card.locator('.speed-team-editor'))).height, startBox.height);
  await card.screenshot({ path: testInfo.outputPath('speed-team-drag-preview.png') });
  /* One more step, so the drop lands on a target the drag is still over. */
  await page.mouse.move(handle.x + handle.width / 2 + 1, handle.y + handle.height / 2 + slotBoxes[4].y - slotBoxes[0].y);
  await page.mouse.up();
  await expect(names).toHaveText(['Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile', 'Megan (2A)']);
  await expect(card.locator('.speed-order')).toHaveText(['1', '2', '3', '4', '5']);
  await expect(card.locator('.speed-combat')).toHaveText(['170', '119', '115', '114', '112']);
  await expect(card.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  /* No line sums the team up: each slot says its own verdict. All are in place;
     the three stage 2's enemy gets in before say so last, in yellow, and the
     one a display speed of its own would make perfect quotes its range. */
  await expect(card.locator('.speed-verdict[data-state="bad"]')).toHaveCount(0);
  await expect(card.locator('.speed-verdict').first()).toHaveText('In place · moves 1st');
  await expect(card.locator('.speed-verdict').first()).toHaveAttribute('data-state', 'good');
  await expect(card.locator('.speed-verdict[data-state="warn"]')).toHaveText([
    /* Stage 2's three enemies move before the third member and are counted. */
    /^In place · moves 6th · needs exactly \d+ display speed · enemy cuts in \(stage 2\)$/,
    'In place · moves 7th · enemy cuts in (stage 2)',
    'In place · moves 8th · enemy cuts in (stage 2)',
  ]);
  await expect(card.locator('.speed-team-status')).toHaveCount(0);
  /* Each stage names the turn its first enemy follows: whose, and which of
     theirs — a first turn too, since another stage's is a second. */
  await expect(enemyTurns.locator('tbody tr').nth(1)).toHaveText('2Lushen #1 (1st turn)');
  await expect(enemyTurns.locator('tbody tr').first().locator('.speed-enemy-after')).toHaveText('Lushen #1 (2nd turn)');
  /* Each stage ends on whether its first enemy moves before every monster has moved. */
  const cutMarks = enemyTurns.locator('.speed-cut-mark');
  await expect(cutMarks.nth(0)).toHaveAttribute('data-state', 'clear');
  await expect(cutMarks.nth(1)).toHaveAttribute('data-state', 'cut');
  await expect(enemyTurns.getByRole('img', { name: 'Can cut in before Veromos, Verdehile, Megan (2A)' })).toBeVisible();
  await expect(enemyTurns.getByRole('img', { name: 'Cannot cut in' })).toHaveCount(3);
  await expect(card.getByRole('img', { name: /^Bernard \(2A\) — Tailwind: \+34\.5 % attack bar to allies/ })).toBeVisible();
  expectSameHeight((await box(card.locator('.speed-team-editor'))).height, startBox.height);
  await card.screenshot({ path: testInfo.outputPath('speed-team-perfect.png') });

  /* A draft with edits survives a stray Escape; Save puts the order on the page. */
  await page.keyboard.press('Escape');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(card).toHaveCount(0);
  await expect(line).toBeFocused();
  await expect(line.locator('.speed-summary-name')).toHaveText(['Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile', 'Megan (2A)']);
  /* In order, but stage 2's enemies get a turn before the last monster's first,
     read off the same ticks the Ticks view draws. */
  await expect(line.locator('.speed-summary-state')).toHaveText('Turn order holds · Enemy can cut in (stage 2)');
  await expect(line.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'good');
  expectSameHeight((await box(line)).height, lineBox.height);
  expectSameHeight((await box(dungeons.getByRole('heading', { name: 'Dungeons' }))).y, headBefore.y);
  /* Stored for this preset alone: the order wanted, and no what-if yet. */
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('jaswa-preferences') ?? '{}').speedTuning))
    .toEqual({ presets: { 'deck-24-101': { order: ['1', '4', '6', '3', '2'], whatIfs: {}, noSpeedTuning: false } } });
  await page.screenshot({ path: testInfo.outputPath('speed-page-one-team.png') });

  await line.click();
  const saved = card;
  /* Megan asked to move second. Each monster looks only up the order: Megan
     follows Bernard, so she is in place, slow as she is, and the three below
     her that move first are the ones out of place, each with its own interval. */
  for (let step = 0; step < 3; step += 1) await saved.getByRole('button', { name: 'Move Megan (2A) earlier' }).click();
  const megan = saved.locator('.speed-slot').nth(1);
  /* In place, but the enemy gets in before her: yellow, her perfect range
     quoted, and the warning last. */
  await expect(megan.locator('.speed-verdict')).toHaveText(/^In place · moves 8th · needs \d+–\d+ display speed · enemy cuts in \(stage 2\)$/);
  await expect(megan.locator('.speed-verdict')).toHaveAttribute('data-state', 'warn');
  /* Red stays red with the warning after its fault. */
  await expect(saved.locator('.speed-slot').nth(3).locator('.speed-verdict')).toHaveText(/^Too fast · moves 6th · enemy cuts in \(stage 2\)$/);
  await expect(saved.locator('.speed-verdict[data-state="bad"]')).toHaveCount(3);
  expectSameHeight((await box(saved.locator('.speed-team-editor'))).height, startBox.height);
  await saved.screenshot({ path: testInfo.outputPath('speed-team-out-of-order.png') });

  /* A what-if starts empty, fixes the whole team from inside the interval, and
     empty goes back to the import. */
  const whatIf = saved.getByLabel("What-if display speed for Megan (2A) in Giant's Keep 1");
  await expect(whatIf).toHaveValue('');
  await expect(whatIf).not.toHaveAttribute('placeholder');
  await whatIf.fill('120');
  await expect(saved.locator('.speed-verdict[data-state="bad"]')).toHaveCount(0);
  await expect(megan.locator('.speed-combat')).toHaveText('135');
  await whatIf.fill('');
  await expect(saved.locator('.speed-verdict[data-state="bad"]')).toHaveCount(3);
  await whatIf.fill('120');

  /* The preset names no leader, so none is chosen; with live sync off one can be. */
  const verdehileLeads = saved.getByRole('checkbox', { name: "Verdehile leads Giant's Keep 1" });
  await expect(verdehileLeads).toBeEnabled();
  await expect(verdehileLeads).not.toBeChecked();
  const verdehileLead = saved.locator('.speed-slot').filter({ has: page.getByRole('checkbox', { name: "Verdehile leads Giant's Keep 1" }) })
    .locator('.speed-leader-skill');
  await expect(verdehileLead).toHaveText('SPD 28 % · Dungeon');
  await expect(verdehileLead).toHaveAttribute('data-state', 'idle');

  /* Every slot states the display speeds that give it a perfect place, a
     slot none can give a dash. */
  await expect(saved.getByRole('columnheader', { name: 'Interval' })).toBeVisible();
  await expect(saved.locator('.speed-slot-range')).toHaveText(Array(5).fill(/^(\d+ – \d+|\d+\+|—)$/));
  await expect(saved.locator('.speed-slot-range').first()).toHaveText(/^(\d+\+|—)$/);
  expectSameHeight((await box(saved.locator('.speed-team-editor'))).height, startBox.height);

  /* The turn order opens over the editor, draws every tick until each member
     has had a second turn, keeps its size between views, and Escape closes only it. */
  const opener = saved.getByRole('button', { name: 'Ticks' });
  await opener.click();
  const dialog = page.locator('.speed-turn-dialog');
  await expect(dialog).toBeVisible();
  /* Opened on the worst stage — stage 2, whose enemy gets in — where the verdicts number the turns. */
  await expect(dialog.getByRole('button', { name: 'Stage 2' })).toHaveAttribute('aria-pressed', 'true');
  const shown = dialog.locator('.speed-lanes[data-active]');
  await expect(shown.locator('.speed-lane-turn').first()).toHaveText('1');
  /* The enemies are the game's monsters, by name, a name met twice numbered. */
  await expect(shown.locator('.speed-lane-row[data-enemy] .speed-lane-name')).toHaveText(['Golem (Water) #1', 'Kuhn', 'Golem (Water) #2']);
  for (const name of ['Bernard (2A)', 'Megan (2A)', 'Lushen #1', 'Veromos', 'Verdehile']) {
    const lane = shown.getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) }) });
    expect(await lane.getByRole('cell', { name: /: turn \d+ at/ }).count()).toBeGreaterThanOrEqual(2);
  }
  const panelBox = await box(dialog);
  await page.screenshot({ path: testInfo.outputPath('speed-turn-order-stage.png') });
  await dialog.getByRole('button', { name: 'Your team alone' }).click();
  await expect(shown.getByRole('rowheader', { name: /^Enemy/ })).toHaveCount(0);
  await expect(shown.getByRole('rowheader')).toHaveCount(5);
  expect(await box(dialog)).toEqual(panelBox);
  await page.screenshot({ path: testInfo.outputPath('speed-turn-order.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(saved).toBeVisible();
  await expect(opener).toBeFocused();

  /* The line judges the runes engraved, never the experiment: Megan's what-if
     fixes the editor's reading and is saved with the preset, but the page does
     not read it. */
  await saved.getByRole('button', { name: 'Save changes' }).click();
  await expect(line).toBeFocused();
  /* The names follow the order asked for, uncoloured; only the mark and the sentence change. */
  await expect(line.locator('.speed-summary-name')).toHaveText(['Bernard (2A)', 'Megan (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);
  /* With the runes engraved, the three below Megan still move before her, and stage 2 still cuts in. */
  await expect(line.locator('.speed-summary-state')).toHaveText('3 of 5 out of place · Enemy can cut in (stage 2)');
  /* Opened again, the what-if is still there, and the overlay reads it. */
  await line.click();
  await expect(saved.getByLabel("What-if display speed for Megan (2A) in Giant's Keep 1")).toHaveValue('120');
  await expect(saved.locator('.speed-verdict[data-state="bad"]')).toHaveCount(0);
  await saved.getByRole('button', { name: 'Close' }).click();
  await expect(line.locator('.speed-summary-state')).toHaveText('3 of 5 out of place · Enemy can cut in (stage 2)');
  await expect(line.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'bad');
  await expect(line.getByRole('img', { name: 'leader' })).toHaveCount(0);
  expectSameHeight((await box(line)).height, lineBox.height);

  /* Names too long for one line wrap name by name, a name too long for the box
     ends in an ellipsis, and the mark stays inside the box at the right. */
  await line.evaluate((element) => {
    element.querySelectorAll('.speed-summary-name').forEach((name, at) => {
      name.textContent = at === 0 ? 'An extraordinarily long nickname that cannot possibly fit on any line at all, however wide the column grows' : `Long nickname number ${at}`;
    });
  });
  const longBox = await box(line);
  const markBox = await box(line.locator('.speed-summary-mark'));
  expect(await line.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(markBox.x + markBox.width).toBeLessThanOrEqual(longBox.x + longBox.width);
  expect(await line.locator('.speed-summary-name').first().evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await line.screenshot({ path: testInfo.outputPath('speed-line-long-names.png') });

  /* Everything stated survives a reload: the order on the line, the what-if in the overlay. */
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await expect(line.locator('.speed-summary-name')).toHaveText(['Bernard (2A)', 'Megan (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);
  await page.screenshot({ path: testInfo.outputPath('speed-page-out-of-tune.png') });
  await line.click();
  await expect(saved.getByLabel("What-if display speed for Megan (2A) in Giant's Keep 1")).toHaveValue('120');
  await expect(saved.locator('.speed-monster .monster-name')).toHaveText(['Bernard (2A)', 'Megan (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);
  await saved.getByRole('button', { name: 'Close' }).click();
  /* Another preset of the same dungeon is untouched by this one's tuning. */
  await expect(presetLine(dungeons, "Giant's Keep 2").locator('.speed-summary-name')).toHaveText(['Lushen #1', 'Lushen #2']);
});

test('a preset that holds fewer monsters than its content keeps the card\'s size', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await importAccount(page);
  await openSpeedTuning(page);
  const dungeons = page.getByRole('region', { name: 'Dungeons', exact: true });
  await presetLine(dungeons, "Giant's Keep 1").click();
  const full = page.getByRole('dialog', { name: "Giant's Keep 1" });
  const fullBox = await box(full.locator('.speed-team-editor'));
  await full.getByRole('button', { name: 'Close' }).click();
  await presetLine(dungeons, "Giant's Keep 2").click();
  const partial = page.getByRole('dialog', { name: "Giant's Keep 2" });
  await expect(partial.locator('.speed-slot-empty')).toHaveCount(3);
  await expect(partial.locator('.speed-slot-empty .speed-add-cell')).toHaveText(Array(3).fill('Empty in this preset'));
  expectSameHeight((await box(partial.locator('.speed-team-editor'))).height, fullBox.height);
  await partial.screenshot({ path: testInfo.outputPath('speed-team-partial.png') });
});

test('the preset\'s leader is read, marked and judged where it reaches', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await importAccount(page);
  await openSpeedTuning(page);
  const dungeons = page.getByRole('region', { name: 'Dungeons', exact: true });

  /* A dungeon lead in a dungeon counts. */
  const necropolis = presetLine(dungeons, 'Necropolis 1');
  await expect(necropolis.getByRole('img', { name: 'leader' })).toHaveCount(1);
  await necropolis.click();
  const card = page.getByRole('dialog', { name: 'Necropolis 1' });
  const verdehileLeads = card.getByRole('checkbox', { name: 'Verdehile leads Necropolis 1' });
  await expect(verdehileLeads).toBeChecked();
  await expect(verdehileLeads).toBeEnabled();
  await expect(card.getByRole('checkbox', { name: 'Veromos leads Necropolis 1' })).not.toBeChecked();
  const verdehileLead = card.locator('.speed-slot').filter({ has: page.getByRole('checkbox', { name: 'Verdehile leads Necropolis 1' }) })
    .locator('.speed-leader-skill');
  await expect(verdehileLead).toHaveText('SPD 28 % · Dungeon');
  await expect(verdehileLead).toHaveAttribute('data-state', 'chosen');
  await card.screenshot({ path: testInfo.outputPath('speed-leader-reaches.png') });
  await card.getByRole('button', { name: 'Close' }).click();

  /* An arena lead does not reach a dungeon, and says so in red. */
  await presetLine(dungeons, "Dragon's Lair 1").click();
  const lair = page.getByRole('dialog', { name: "Dragon's Lair 1" });
  const meganLead = lair.locator('.speed-slot').filter({ has: page.getByRole('checkbox', { name: "Megan (2A) leads Dragon's Lair 1" }) })
    .locator('.speed-leader-skill');
  await expect(meganLead).toHaveText('ATK 21 % · Arena');
  await expect(meganLead).toHaveAttribute('data-state', 'bad');
  /* An unchosen lead is as quiet as any other. */
  const bernardLead = lair.locator('.speed-slot').filter({ has: page.getByRole('checkbox', { name: "Bernard (2A) leads Dragon's Lair 1" }) })
    .locator('.speed-leader-skill');
  await expect(bernardLead).toHaveText('ATK 30 % · Wind');
  await expect(bernardLead).toHaveAttribute('data-state', 'idle');
});

test('with live sync off the leader is chosen here, saved into the preset, and kept', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await importAccount(page);
  await openSpeedTuning(page);
  const dungeons = page.getByRole('region', { name: 'Dungeons', exact: true });
  await presetLine(dungeons, 'Necropolis 1').click();
  const card = page.getByRole('dialog', { name: 'Necropolis 1' });
  const verdehile = card.getByRole('checkbox', { name: 'Verdehile leads Necropolis 1' });
  const veromos = card.getByRole('checkbox', { name: 'Veromos leads Necropolis 1' });
  const before = await card.locator('.speed-team-editor').boundingBox();
  await veromos.check();
  await expect(veromos).toBeChecked();
  await expect(verdehile).not.toBeChecked();
  expect(await card.locator('.speed-team-editor').boundingBox()).toEqual(before);
  await card.screenshot({ path: testInfo.outputPath('speed-leader-chosen.png') });
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(card).toHaveCount(0);

  /* Written into the import, so a reload reads the new leader. */
  await page.reload();
  await openSpeedTuning(page);
  await presetLine(dungeons, 'Necropolis 1').click();
  await expect(veromos).toBeChecked();
  await expect(verdehile).not.toBeChecked();
  /* Taking the lead away leaves the preset with none. */
  await veromos.uncheck();
  await card.getByRole('button', { name: 'Save changes' }).click();
  await presetLine(dungeons, 'Necropolis 1').click();
  await expect(card.getByRole('checkbox', { checked: true })).toHaveCount(0);
});

test('under live sync the leader is only reported: the game owns it', async ({ page }) => {
  await page.route('http://127.0.0.1:37654/**', (route) => route.fulfill({ status: 503, body: '' }));
  await freshWorkspace(page);
  await page.evaluate(() => {
    const preferences = JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}');
    localStorage.setItem('jaswa-preferences', JSON.stringify({ ...preferences, importRoute: 'direct', directImportMode: 'live',
      updatedAt: new Date(Date.now() + 1000).toISOString() }));
  });
  await page.reload();
  await importAccount(page);
  await openSpeedTuning(page);
  await presetLine(page.getByRole('region', { name: 'Dungeons', exact: true }), 'Necropolis 1').click();
  const card = page.getByRole('dialog', { name: 'Necropolis 1' });
  await expect(card.getByRole('checkbox', { name: 'Verdehile leads Necropolis 1' })).toBeChecked();
  await expect(card.getByRole('checkbox', { name: 'Verdehile leads Necropolis 1' })).toBeDisabled();
  await expect(card.getByRole('checkbox', { name: 'Veromos leads Necropolis 1' })).toBeDisabled();
});

test('arena presets face a worst-case enemy', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await importAccount(page);
  await openSpeedTuning(page);

  /* Above the columns the page states only what belongs to the account: the totem. */
  const basis = page.getByRole('region', { name: 'Sky Tribe Totem' });
  await expect(basis.locator('.speed-basis-level')).toHaveText('Level 20 of 20');
  await expect(basis.locator('.speed-basis-bonus')).toHaveText('+15 % of base speed');
  await expect(basis).not.toContainText('Speed buff');

  const arena = page.getByRole('region', { name: 'Arena', exact: true });
  await presetLine(arena, 'Arena Attack 1').click();
  const card = page.getByRole('dialog', { name: 'Arena Attack 1' });
  await expect(card.getByRole('heading', { name: 'Arena Attack 1' })).toBeVisible();
  await expect(card.locator('.speed-dungeon-facts')).toHaveCount(0);
  await expect(card.locator('.speed-slot')).toHaveCount(4);
  /* A first turn with no later one beside it is not spelled out. */
  await expect(card.getByRole('region', { name: 'Enemy cut in' }).locator('tbody tr')).toHaveText(['Worst caseLushen #2']);
  await expect(card.getByRole('region', { name: 'Enemy cut in' }).getByRole('img', { name: 'Can cut in before Megan (2A)' })).toBeVisible();
  /* Two copies at one arena speed tie on the bar; both name the field-position
     decision without suggesting a speed change. Megan still reports the enemy
     turn and has no display speed that keeps it out: a dash. */
  await expect(card.locator('.speed-verdict:not([data-state="good"])')).toHaveCount(3);
  await expect(card.locator('.speed-slot').nth(1).locator('.speed-verdict')).toHaveText('Tied with Lushen #2. Position decides.');
  await expect(card.locator('.speed-slot').nth(2).locator('.speed-verdict')).toHaveText('Tied with Lushen #1. Position decides.');
  const megan = card.locator('.speed-slot').nth(3);
  /* Fifth on the field: the worst-case enemy's turn comes before Megan's and is counted. */
  await expect(megan.locator('.speed-verdict')).toHaveText('In place · moves 5th · worst-case enemy cuts in');
  await expect(megan.locator('.speed-verdict')).toHaveAttribute('data-state', 'warn');
  await expect(megan.locator('.speed-slot-range')).toHaveText('—');
  const tiedBox = await box(card.locator('.speed-team-editor'));
  await card.screenshot({ path: testInfo.outputPath('speed-arena-tied.png') });
  const tiedWhatIf = card.getByLabel('What-if display speed for Lushen #2 in Arena Attack 1');
  await tiedWhatIf.fill('1');
  await expect(card.locator('.speed-slot').nth(1).locator('.speed-verdict')).not.toContainText('Tied with');
  expectSameHeight((await box(card.locator('.speed-team-editor'))).height, tiedBox.height);
  await card.screenshot({ path: testInfo.outputPath('speed-arena-tie-broken.png') });
  /* Unsaved, a what-if leaves with the overlay. */
  await card.getByRole('button', { name: 'Close' }).click();
  await expect(card).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('jaswa-preferences') ?? '{}').speedTuning?.presets ?? {}))
    .toEqual({});

  const first = presetLine(arena, 'Arena Attack 1');
  await expect(first.locator('.speed-summary-state')).toHaveText('Tied · position decides · Enemy can cut in');
  await expect(first.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'bad');
  /* A lone monster always opens before an enemy level with it: the tie is the attacker's. */
  for (const name of ['Arena Attack 2', 'Arena Defense']) {
    await expect(presetLine(arena, name).locator('.speed-summary-state')).toHaveText('Turn order holds');
    await expect(presetLine(arena, name).locator('.speed-summary-mark')).toHaveAttribute('data-state', 'good');
  }
  await page.screenshot({ path: testInfo.outputPath('speed-arena.png'), fullPage: true });
});

test('a boost to one ally names who gets it: the lowest bar, as auto battle sends it', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await freshWorkspace(page);
  /* Konamiya, whose Resurge fills one ally's bar, moves first: the others'
     bars stand near full, and Veromos, the slowest, is the lowest. */
  const konamiya = { ...base.unit_list[3], unit_id: 7, unit_master_id: 10911, attribute: 1, spd: 109, runes: [], skills: [[1901, 9], [1906, 3], [1911, 6]] };
  await importAccount(page, {
    ...base,
    unit_list: [...base.unit_list, konamiya],
    deck_list: [deck(24, 101, [7, 4, 5, 6, 0])],
  });
  await openSpeedTuning(page);
  await presetLine(page.getByRole('region', { name: 'Dungeons', exact: true }), "Giant's Keep 1").click();
  const draft = page.getByRole('dialog', { name: "Giant's Keep 1" });
  const caster = draft.locator('.speed-slot').first();
  const slotBox = await box(caster);
  await draft.screenshot({ path: testInfo.outputPath('speed-one-ally-before.png') });
  await expect(caster.locator('.speed-boost-tag')).toHaveText('+100 % ATB → Veromos');
  /* No longer "not counted": a full bar is a number. */
  await expect(caster.getByRole('img', { name: /Konamiya — Resurge: \+100 % attack bar to the ally with the lowest attack bar/ })).toHaveCount(1);
  /* Every place a verdict states is a numbered turn in the view Ticks opens
     on — the worst stage, where enemy turns are counted too. */
  const verdicts = draft.locator('.speed-verdict');
  const placesMatchTicks = async (shot: string) => {
    await draft.getByRole('button', { name: 'Ticks' }).click();
    const lanes = page.locator('.speed-lanes[data-active="true"]');
    await expect(lanes).toHaveCount(1);
    const names = await draft.locator('.speed-monster .monster-name').allTextContents();
    for (const [at, name] of names.entries()) {
      const places = [...(await verdicts.nth(at).textContent() ?? '').matchAll(/(\d+)(?:st|nd|rd|th)/g)].map((match) => match[1]);
      /* A tie names no place: field position decides it. */
      if (places.length === 0) continue;
      const lane = lanes.getByRole('row').filter({ has: page.getByRole('rowheader', { name }) });
      for (const place of places) await expect(lane.getByRole('cell', { name: new RegExp(`: turn ${place} at `) })).toHaveCount(1);
    }
    await page.screenshot({ path: testInfo.outputPath(shot) });
    await page.keyboard.press('Escape');
    await expect(lanes).toHaveCount(0);
  };
  /* Stage 2's enemy moves before the whole team, and is counted: Konamiya, the
     team's first mover, is not first on the field. */
  await expect(verdicts.first()).not.toContainText('moves 1st');
  await placesMatchTicks('speed-one-ally-ticks-enemy.png');

  /* Behind both Lushens, Konamiya fills the one that moved last: its bar has
     had the fewest ticks since it emptied. */
  await draft.getByLabel("What-if display speed for Konamiya in Giant's Keep 1").fill('100');
  await expect(caster.locator('.speed-boost-tag')).toHaveText('+100 % ATB → Lushen #2');
  expectSameHeight((await box(caster)).height, slotBox.height);
  await draft.screenshot({ path: testInfo.outputPath('speed-one-ally-after.png') });

  /* Fast enough to keep every enemy out, and filled straight after its own
     turn, Lushen #2 moves again before Veromos has moved at all. */
  await draft.getByLabel("What-if display speed for Lushen #1 in Giant's Keep 1").fill('260');
  await draft.getByLabel("What-if display speed for Lushen #2 in Giant's Keep 1").fill('250');
  await draft.getByLabel("What-if display speed for Konamiya in Giant's Keep 1").fill('240');
  await draft.getByLabel("What-if display speed for Veromos in Giant's Keep 1").fill('200');
  await expect(verdicts.nth(2)).toContainText('moves 2nd and 4th');
  await expect(verdicts.nth(3)).toContainText('moves 5th');
  await draft.screenshot({ path: testInfo.outputPath('speed-one-ally-twice.png') });
  await placesMatchTicks('speed-one-ally-ticks-twice.png');
});

test('the Ticks view draws every boost as the jump it makes, named for whoever gave it', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await freshWorkspace(page);
  /* Bernard's Tailwind fills every other bar by 34.5 % and buffs the team. */
  await importAccount(page, { ...base, deck_list: [deck(24, 101, [1, 4, 5, 6, 0])] });
  await openSpeedTuning(page);
  await presetLine(page.getByRole('region', { name: 'Dungeons', exact: true }), "Giant's Keep 1").click();
  const draft = page.getByRole('dialog', { name: "Giant's Keep 1" });
  await draft.getByRole('button', { name: 'Ticks' }).click();
  const lanes = page.locator('.speed-lanes[data-active="true"]');
  await expect(lanes).toHaveCount(1);
  const lane = (name: string) => lanes.getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(`^${name}`) }) });
  await page.screenshot({ path: testInfo.outputPath('speed-ticks-boosts.png') });

  await expect(lane('Veromos').locator('.speed-lane-boost title').first()).toHaveText(/^\+34\.5 % attack bar from Bernard/);
  await expect(lane('Bernard').locator('.speed-lane-boost title', { hasText: 'from Bernard' })).toHaveCount(0);
  /* The buff is not drawn, but a cell under it says so to a screen reader. */
  await expect(lane('Veromos').getByRole('cell', { name: /under speed buff/ }).first()).toBeAttached();
  await expect(lanes.locator('.speed-lane-row[data-enemy] .speed-lane-boost')).toHaveCount(0);
});

test('each slot states the display speeds that hold it, and a what-if is selected rather than dragged', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await freshWorkspace(page);
  await importAccount(page);
  await openSpeedTuning(page);
  const line = presetLine(page.getByRole('region', { name: 'Dungeons', exact: true }), "Giant's Keep 1");
  await line.click();
  const draft = page.getByRole('dialog', { name: "Giant's Keep 1" });
  /* Megan, first in the game's order, asked to move last. */
  for (let step = 0; step < 4; step += 1) await draft.getByRole('button', { name: 'Move Megan (2A) later' }).click();
  await expect(draft.getByRole('button', { name: 'Move Megan (2A) later' })).toBeDisabled();
  await expect(draft.locator('.speed-monster .monster-name')).toHaveText(['Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile', 'Megan (2A)']);
  /* What a booster's turn hands the next one hangs on the line below it, and takes no room. */
  const bernard = draft.locator('.speed-slot').first();
  const slotBox = await box(bernard);
  /* Only the attack bar it hands the whole team: a speed buff is not a push from one turn to the next. */
  await expect(bernard.locator('.speed-boost-tag')).toHaveText('+34.5 % ATB');
  expectSameHeight((await box(bernard)).height, slotBox.height);

  /* In order, every member is in place. The first two have perfect places;
     the third has exactly one display speed that keeps stage 2's enemy out,
     and behind it none does, so those slots are dashes. */
  await expect(draft.locator('.speed-verdict[data-state="bad"]')).toHaveCount(0);
  const ranges = draft.locator('.speed-slot-range');
  await expect(ranges).toHaveText([/^\d+\+$/, /^\d+ – \d+$/, /^(\d+) – \1$/, '—', '—']);

  /* Out of order, the order fault is red on the monster that has it — the one
     below that moves first, never the slower one above it. */
  await draft.getByRole('button', { name: 'Move Megan (2A) earlier' }).click();
  const meganVerdict = draft.locator('.speed-slot').filter({ hasText: 'Megan (2A)' }).locator('.speed-verdict');
  const verdehileVerdict = draft.locator('.speed-slot').filter({ hasText: 'Verdehile' }).locator('.speed-verdict');
  await expect(meganVerdict).not.toHaveAttribute('data-state', 'bad');
  await expect(verdehileVerdict).toHaveAttribute('data-state', 'bad');
  await expect(verdehileVerdict).toHaveText(/^Too fast/);
  await draft.getByRole('button', { name: 'Move Megan (2A) later' }).click();

  /* Pressing in a what-if and moving selects its digits; the slot stays put. */
  const whatIf = draft.getByLabel("What-if display speed for Lushen #1 in Giant's Keep 1");
  await whatIf.fill('123');
  const field = await box(whatIf);
  await page.mouse.move(field.x + field.width - 4, field.y + field.height / 2);
  await page.mouse.down();
  await page.mouse.move(field.x + 4, field.y + field.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await expect(draft.locator('.speed-slot[data-dragging]')).toHaveCount(0);
  expect(await whatIf.evaluate((input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!)).toBeGreaterThan(0);
  await whatIf.fill('');

  /* On the page the preset in order wears the tick, the stage it is cut in at named. */
  await draft.getByRole('button', { name: 'Save changes' }).click();
  await expect(line.locator('.speed-summary-state')).toHaveText('Turn order holds · Enemy can cut in (stage 2)');
  await expect(line.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'good');
  await line.screenshot({ path: testInfo.outputPath('speed-line-in-order.png') });
});
