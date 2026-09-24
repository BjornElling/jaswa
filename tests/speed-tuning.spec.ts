import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/speed-account.json', import.meta.url));

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

async function openSpeedTuning(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Speed Tuning' }).click();
  await expect(page.getByRole('heading', { name: 'Speed Tuning', exact: true })).toBeVisible();
}

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
  await expect(page.getByRole('button', { name: 'Add arena team' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('speed-no-import.png') });
});

test('tunes a dungeon team, explains every miss, and keeps the card still', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('speed-account.json')).toBeVisible();
  await openSpeedTuning(page);

  /* Nothing is shipped: the page opens empty, with the account's own totem. */
  await expect(page.getByText('Level 20 of 20 · +15 % of base speed')).toBeVisible();
  await expect(page.getByText('No dungeon teams yet.', { exact: false })).toBeVisible();
  await expect(page.getByText('No arena teams yet.', { exact: false })).toBeVisible();
  await expect(page.getByText('No rules yet.', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('speed-empty.png') });

  await page.getByRole('button', { name: 'Add dungeon team' }).click();
  const card = page.locator('.speed-team').filter({ hasText: "Giant's Keep team #1" });
  await expect(card.locator('.speed-slot')).toHaveCount(5);
  const emptyBox = await box(card);

  /* Monsters join in the order their dungeon speed gives them, whatever order they are picked in. */
  const add = card.getByLabel("Add a monster to Giant's Keep team #1");
  for (const name of ['Megan (2A)', 'Lushen #1', 'Bernard (2A)', 'Veromos', 'Verdehile']) {
    await add.selectOption({ label: name });
  }
  await expect(card.locator('.speed-monster .monster-name')).toHaveText(['Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile', 'Megan (2A)']);
  await expect(card.locator('.speed-combat')).toHaveText(['170', '119', '115', '114', '112']);
  await expect(card.getByText('Perfect tune: everyone moves where you put them.')).toBeVisible();
  await expect(card.getByText('Stage 2 · fastest enemy 169 dungeon speed · first moves after your 2nd turn')).toBeVisible();
  await expect(card.getByRole('img', { name: /^Bernard \(2A\) — Tailwind: \+34\.5 % attack bar to allies/ })).toBeVisible();
  const fullBox = await box(card);
  expectSameHeight(fullBox.height, emptyBox.height);
  await card.screenshot({ path: testInfo.outputPath('speed-team-perfect.png') });

  /* Megan asked to move second: she is too slow, and gets her own interval. */
  for (let step = 0; step < 3; step += 1) await card.getByRole('button', { name: 'Move Megan (2A) earlier' }).click();
  const megan = card.locator('.speed-slot').nth(1);
  await expect(megan.locator('.speed-verdict')).toHaveText('Too slow · moves 5th · needs 104–154 display speed');
  await expect(card.locator('.speed-slot').nth(2).locator('.speed-verdict')).toHaveText(/^Too fast · moves 2nd/);
  await expect(card.getByText('4 of 5 out of place.')).toBeVisible();
  expectSameHeight((await box(card)).height, emptyBox.height);
  await card.screenshot({ path: testInfo.outputPath('speed-team-out-of-order.png') });

  /* A what-if inside the interval fixes the whole team; empty goes back to the import. */
  const whatIf = card.getByLabel("What-if display speed for Megan (2A) in Giant's Keep team #1");
  await whatIf.fill('120');
  await expect(card.getByText('Perfect tune: everyone moves where you put them.')).toBeVisible();
  await expect(megan.locator('.speed-combat')).toHaveText('135');
  await whatIf.fill('');
  await expect(card.getByText('4 of 5 out of place.')).toBeVisible();
  await whatIf.fill('120');

  /* A leader counts only where it reaches; a dungeon lead does here. */
  await card.getByLabel('Leader').selectOption({ label: 'Verdehile — +28 % attack speed in dungeons' });
  await expect(card.getByText('+28 % attack speed in dungeons.')).toBeVisible();
  await expect(card.locator('.speed-combat').first()).toHaveText('201');

  /* The margin names its own failure, apart from order. */
  await card.getByRole('checkbox', { name: 'Add speed margin' }).check();
  await card.getByLabel("Speed margin for Giant's Keep team #1, in dungeon speed").selectOption('3');
  await expect(card.locator('.speed-verdict').filter({ hasText: 'inside the 3-speed margin' }).first()).toBeVisible();
  expectSameHeight((await box(card)).height, emptyBox.height);

  /* The turn order opens as a dialog, draws every tick, and closes on Escape. */
  const opener = card.getByRole('button', { name: 'Turn order' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: "Giant's Keep team #1" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Stage 1' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('.speed-timeline-turn').first()).toHaveText('1');
  await expect(dialog.locator('.speed-turn-list li[data-enemy]')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Your team alone' }).click();
  await expect(dialog.locator('.speed-turn-list li')).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath('speed-turn-order.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  /* Everything stated survives a reload. */
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const reloaded = page.locator('.speed-team').filter({ hasText: "Giant's Keep team #1" });
  await expect(reloaded.getByLabel("What-if display speed for Megan (2A) in Giant's Keep team #1")).toHaveValue('120');
  await expect(reloaded.getByLabel('Leader')).toHaveValue('3');
  await expect(reloaded.getByRole('checkbox', { name: 'Add speed margin' })).toBeChecked();
});

test('arena teams are numbered, face a worst-case enemy, and rules reach them', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('speed-account.json')).toBeVisible();
  await openSpeedTuning(page);

  await page.getByRole('button', { name: 'Add arena team' }).click();
  await page.getByRole('button', { name: 'Add arena team' }).click();
  await expect(page.getByRole('heading', { name: 'Arena team #1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Arena team #2' })).toBeVisible();

  const card = page.locator('.speed-team').filter({ hasText: 'Arena team #1' });
  await expect(card.locator('.speed-slot')).toHaveCount(4);
  const before = await box(card);
  const add = card.getByLabel('Add a monster to Arena team #1');
  for (const name of ['Bernard (2A)', 'Lushen #1', 'Lushen #2', 'Megan (2A)']) await add.selectOption({ label: name });
  await expect(add).toHaveCount(0);
  await expect(card.getByText('Worst-case enemy at 169 arena speed · first moves after your 3rd turn')).toBeVisible();
  /* Two copies at one arena speed tie on the bar; only field position can settle
     that, so both say so rather than one being called in place. */
  await expect(card.getByText('2 of 4 out of place.')).toBeVisible();
  await expect(card.locator('.speed-slot').nth(1).locator('.speed-verdict')).toHaveText(/^Tied with Lushen #2 · position decides · needs/);
  await expect(card.getByText('No rule reaches this team.')).toBeVisible();

  /* A rule in the third column reaches every team holding both monsters. */
  await page.getByLabel('Moves first').selectOption({ label: 'Megan (2A)' });
  await page.getByLabel('Moves after').selectOption({ label: 'Lushen #1' });
  await page.getByRole('button', { name: 'Add rule' }).click();
  await expect(card.getByText('Rules: Megan (2A) before Lushen #1 your order says otherwise')).toBeVisible();
  await expect(page.locator('.speed-rule-state')).toHaveText('Arena team #1: your order says otherwise');
  expectSameHeight((await box(card)).height, before.height);
  await page.screenshot({ path: testInfo.outputPath('speed-arena-and-rules.png'), fullPage: true });

  await card.getByRole('button', { name: 'Remove Arena team #1' }).click();
  await expect(page.getByRole('heading', { name: 'Arena team #1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Arena team #2' })).toHaveCount(0);
});
