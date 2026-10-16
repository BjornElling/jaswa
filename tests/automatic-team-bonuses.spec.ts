import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/automatic-team-bonuses.json', import.meta.url));

async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization', exact: true }).click();
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
}

const figures = (page: Page) => page.locator('.stat-ranges .stat-range .overlay-stat-current').allTextContents();
const number = (text: string) => Number(text.replace(/[^0-9]/g, ''));

test('team bonuses follow the chosen preset automatically and the profile has only its original leads', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  const scenario = await figures(page);
  await page.getByRole('button', { name: 'Open profile', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('group', { name: 'Leads and bonuses' }).locator('input')).toHaveCount(4);
  await expect(dialog.getByRole('spinbutton', { name: 'ACC, in percent', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('group', { name: 'Sets on teammates' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('scenario-no-team.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByLabel('Preset', { exact: true }).selectOption('deck-1-2');
  expect(await figures(page)).toEqual(scenario);
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-1-1');
  const full = await figures(page);
  expect(full.slice(0, 8)).toEqual(scenario.slice(0, 8));
  expect(number(full[8])).toBeGreaterThan(number(scenario[8]));
  expect(number(full[9])).toBeGreaterThan(number(scenario[9]));
  expect(number(full[10])).toBeGreaterThan(number(scenario[10]));
  await page.getByRole('button', { name: 'Open profile', exact: true }).click();
  await expect(dialog.getByRole('img', { name: /2 teammate Fight sets: \+16% ATK/ }).first()).toBeVisible();
  await expect(dialog.getByRole('img', { name: /Teammate sets add 10 percentage points ACC/ })).toBeVisible();
  const boxes = () => dialog.locator('.overlay-block, .overlay-lead input, .stat-range').evaluateAll((elements) =>
    elements.map((element) => { const b = element.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }));
  const before = await boxes();
  await page.screenshot({ path: testInfo.outputPath('team-profile-empty-leads.png') });
  for (const name of ['CRI Rate', 'ATK', 'DEF', 'HP']) {
    await dialog.getByRole('spinbutton', { name: `${name}, in percent`, exact: true }).fill('100');
  }
  expect(await boxes()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('team-profile-full-leads.png') });
  for (const name of ['CRI Rate', 'ATK', 'DEF', 'HP']) {
    await dialog.getByRole('spinbutton', { name: `${name}, in percent`, exact: true }).fill('');
  }
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-1-3');
  expect(await figures(page)).toEqual(scenario);
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-24-101');
  const fallback = await figures(page);
  expect(number(fallback[8])).toBeGreaterThan(number(scenario[8]));
  expect(number(fallback[8])).toBeLessThan(number(full[8]));
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Stats', exact: true }).click();
  await page.getByLabel('Content', { exact: true }).selectOption('Arena');
  const table = page.getByRole('table', { name: 'Monster stats' });
  await expect(table.getByRole('cell', { name: full[8].trim(), exact: true }).first()).toBeVisible();
});

test('Now, the profile and a zero-move result agree with automatic team bonuses', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-1-1');
  const shown = await figures(page);
  await page.getByLabel('Just fill in empty slots').check();
  await page.getByLabel('Count unfinished runes at their +15 main stat').uncheck();
  await page.locator('.rune-optimization-gems').getByRole('radio', { name: 'None', exact: true }).check();
  await page.locator('.rune-optimization-grinds').getByRole('radio', { name: 'None', exact: true }).check();
  await page.getByLabel('Rank by', { exact: true }).selectOption('dmg');
  await page.getByRole('button', { name: 'Find builds', exact: true }).click();
  const table = page.getByRole('table', { name: 'Rune builds' });
  await expect(page.getByRole('button', { name: 'Show build 1', exact: true })).toBeVisible();
  const rows = table.locator('tbody tr');
  const cells = (at: number) => rows.nth(at).getByRole('cell').allTextContents();
  const now = await cells(0);
  const found = await cells(1);
  expect(now.slice(3)).toEqual(shown.map((value) => value.trim()));
  expect(found.slice(3)).toEqual(now.slice(3));
  expect(found[2]).toBe('0');
  await page.screenshot({ path: testInfo.outputPath('automatic-team-builds.png') });
  const changed = JSON.parse(readFileSync(account, 'utf8'));
  for (const rune of changed.unit_list[1].runes) if (rune.set_id === 19) rune.set_id = 15;
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'automatic-team-bonuses.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)),
  });
  await page.getByRole('button', { name: 'Replace data', exact: true }).click();
  await expect(async () => expect(number((await cells(0))[11])).toBeLessThan(number(now[11]))).toPass();
  const refreshed = await cells(0);
  expect((await cells(1)).slice(3)).toEqual(refreshed.slice(3));
  await page.screenshot({ path: testInfo.outputPath('automatic-team-after-change.png') });
});
