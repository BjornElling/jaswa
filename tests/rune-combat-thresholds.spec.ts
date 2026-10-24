import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const source = JSON.parse(readFileSync(new URL('./fixtures/rune-optimization-account.json', import.meta.url), 'utf8'));
const thirdMonster = {
  ...source.unit_list[1], unit_id: 13, unit_master_id: 10131, attribute: 1,
  runes: [], artifacts: [], relics: [],
};
const account = {
  ...source,
  unit_list: source.unit_list.map((monster: Record<string, unknown>) => {
    if (monster.unit_id === 11) return { ...monster, unit_master_id: 11031, attribute: 1 };
    if (monster.unit_id === 12) return { ...monster, unit_master_id: 34112, attribute: 2 };
    return monster;
  }).concat(thirdMonster),
  deck_list: [{ deck_type: 24, deck_seq: 301, unit_id_list: [11, 12, 13, 0, 0], leader_unit_id: 11, equip: null }],
};

test('Necropolis thresholds follow the selected monster and keep their area rows fixed', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
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
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'necropolis-thresholds.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.getByText('necropolis-thresholds.json').first()).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization', exact: true }).click();
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-24-301');

  const area = page.locator('.rune-optimization-area');
  const thresholdSlots = area.locator('.overlay-combat-threshold');
  const actualThresholds = area.locator('.overlay-combat-threshold:not(.overlay-combat-threshold-placeholder)');
  const rowBoxes = () => area.locator('.overlay-accuracy').evaluate((element) => Array.from(element.children, (child) => {
    const box = child.getBoundingClientRect();
    return [box.x, box.y, box.width, box.height];
  }));

  await expect(area).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('necropolis-thresholds-no-monster.png') });
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  await expect(area.locator('.filter-label')).toHaveText('Necropolis (Abyss Hard)');
  await expect(area.locator('.overlay-accuracy-label')).toHaveText(['Accuracy goal', 'Fastest enemy (combat speed)']);
  await expect(area.locator('.overlay-accuracy-value')).toHaveText(['35%', '169']);
  await expect(thresholdSlots).toHaveCount(3);
  const icaruRow = actualThresholds.first();
  await expect(actualThresholds).toHaveCount(1);
  await expect(icaruRow.locator('.overlay-combat-threshold-stat')).toHaveText('DEF');
  await expect(icaruRow.locator('.overlay-combat-threshold-value')).toHaveText('2,501/3,301');
  await expect(icaruRow).toHaveAttribute('title', /At least 3,301 combat DEF.*maximum team-up/);
  const filledRows = await rowBoxes();
  await page.screenshot({ path: testInfo.outputPath('necropolis-icaru-thresholds.png') });

  await page.getByLabel('Monster', { exact: true }).selectOption('12');
  await expect(actualThresholds).toHaveCount(1);
  await expect(actualThresholds.first().locator('.overlay-combat-threshold-stat')).toHaveText('SPD');
  await expect(actualThresholds.first().locator('.overlay-combat-threshold-value')).toHaveText('309');
  await expect(actualThresholds.first()).toHaveAttribute('title', /\+200 combat SPD.*final-wave boss/);
  expect(await rowBoxes()).toEqual(filledRows);
  await expect(actualThresholds.first()).not.toContainText('2,501/3,301');
  await page.screenshot({ path: testInfo.outputPath('necropolis-agrius-thresholds.png') });

  await page.getByLabel('Monster', { exact: true }).selectOption('13');
  await expect(actualThresholds).toHaveCount(0);
  expect(await rowBoxes()).toEqual(filledRows);
  await page.screenshot({ path: testInfo.outputPath('necropolis-no-threshold-monster.png') });
});
