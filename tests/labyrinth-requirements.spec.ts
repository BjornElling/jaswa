import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const account = JSON.parse(readFileSync(new URL('./fixtures/automatic-team-bonuses.json', import.meta.url), 'utf8'));
const cases = [
  ['normal', 'Labyrinth Normal (Hell)', '65%', '252'],
  ['rescue', 'Labyrinth Rescue (Hell)', '27%', '248'],
  ['explode', 'Labyrinth Explode (Hell)', '27%', '252'],
  ['cooldown', 'Labyrinth Cooldown Time Up (Hell)', '27%', '252'],
  ['speed-limit', 'Labyrinth Speed Limit (Hell)', '27%', '225'],
  ['time-limit', 'Labyrinth Time Limit (20 waves)', '71%', '268'],
  ['boss', 'Labyrinth Boss (Hell)', '40%', '205/204/199'],
] as const;

test('each Labyrinth content reads its own requirements and three documented speed ranks without moving its neighbours', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rune Optimization', exact: true })).toBeVisible();
  await expect(page.getByText('Import your game data first.', { exact: false })).toBeVisible();
  await expect(page.locator('.rune-optimization-area')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('labyrinth-empty.png') });
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'labyrinth.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.getByText('labyrinth.json').first()).toBeVisible();
  await page.evaluate((contents) => {
    const preferences = JSON.parse(localStorage.getItem('jaswa-preferences') ?? '{}');
    preferences.updatedAt = new Date().toISOString();
    preferences.presets = contents.map((content) => ({
      id: `own-${content}`, name: content, content, members: ['11', '12'], leaderUnitId: null, gear: null,
    }));
    localStorage.setItem('jaswa-preferences', JSON.stringify(preferences));
  }, cases.map(([suffix]) => `labyrinth-${suffix}`));
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization', exact: true }).click();
  const area = page.locator('.rune-optimization-area');
  const preset = page.getByLabel('Preset', { exact: true });
  const boxes = () => page.locator('.rune-optimization-area, .rune-optimization-settings, .stat-ranges').evaluateAll((elements) =>
    elements.map((element) => { const b = element.getBoundingClientRect(); return [b.x, b.y, b.width, b.height]; }));
  await preset.selectOption('scenario');
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await expect(area.locator('.overlay-accuracy-value')).toHaveText(['Variable', 'Variable']);
  await expect(area.locator('.overlay-accuracy-value span[tabindex]')).toHaveCount(0);
  const before = await boxes();
  await page.screenshot({ path: testInfo.outputPath('labyrinth-before-selection.png') });
  for (const [suffix, heading, accuracy, speeds] of cases) {
    await preset.selectOption(`own-labyrinth-${suffix}`);
    await expect(area.locator('.filter-label')).toHaveText(heading);
    await expect(area.locator('.overlay-accuracy-label')).toHaveText(['Accuracy goal', 'Enemy combat speeds']);
    await expect(area.locator('.overlay-accuracy-value')).toHaveText([accuracy, speeds]);
    const ranks = area.locator('.overlay-accuracy-value span[tabindex]');
    await expect(ranks).toHaveCount(suffix === 'boss' ? 3 : 1);
    await expect(ranks.nth(0)).toHaveAttribute('title', /^Fastest: \d+ combat speed/);
    if (suffix === 'boss') {
      await expect(ranks.nth(0)).toHaveAttribute('title', /Guilles\/Leos, wave 2: Medium Crystal/);
      await expect(ranks.nth(1)).toHaveAttribute('title', /Kotos, wave 2: Medium Crystal/);
      await expect(ranks.nth(2)).toHaveAttribute('title', /Eintau\/Burentau\/Urtau/);
    }
    expect(await boxes()).toEqual(before);
    expect(await area.locator('.overlay-accuracy-goal > *').evaluateAll((elements) =>
      elements.every((element) => element.scrollWidth <= element.clientWidth))).toBe(true);
    await ranks.first().focus();
    await expect(ranks.first()).toBeFocused();
    expect(await ranks.evaluateAll((nodes) => nodes.every((node) => (node.getAttribute('title') ?? '').length < 100))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`labyrinth-${suffix}.png`) });
  }
  await page.getByRole('button', { name: 'Open profile', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.overlay-accuracy-value')).toHaveText(['40%', '205/204/199']);
  await expect(dialog.locator('.overlay-accuracy-value span[tabindex]').nth(1)).toHaveAttribute('title', /Second-fastest: 204 combat speed — Kotos, wave 2: Medium Crystal/);
  await page.screenshot({ path: testInfo.outputPath('labyrinth-profile.png') });
});
