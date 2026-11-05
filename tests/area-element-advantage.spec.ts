import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Every monster in a Cairos dungeon is one element (`pve-stages.ts`
 * `pveAreaElement`), so a copy whose element beats it always has element
 * advantage in that dungeon's presets: the switch is ticked and held, on Rune
 * Optimization and in the profile alike, and every other copy keeps its own.
 * The speed fixture's copy 1 is Wind, copy 2 Water; Giant's Keep is Water.
 */
const fixture = fileURLToPath(new URL('./fixtures/speed-account.json', import.meta.url));

async function open(page: Page) {
  const source = JSON.parse(readFileSync(fixture, 'utf8'));
  source.deck_list = [{ deck_type: 24, deck_seq: 101, unit_id_list: [1, 2, 3, 6, 0], leader_unit_id: 1, equip: null }];
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'giants.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization', exact: true }).click();
}

test("a monster beating Giant's Keep's element always has advantage there, held", async ({ page }, testInfo) => {
  await open(page);
  const panel = page.locator('.rune-optimization-monster-panel');
  await panel.screenshot({ path: testInfo.outputPath('panel-empty.png') });
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-24-101');
  await page.getByLabel('Monster', { exact: true }).selectOption('1');
  await panel.screenshot({ path: testInfo.outputPath('panel-chosen.png') });

  /* Statistics above Speed tuning, the pair ahead of Builds listed. */
  const [statistics, speed, count] = await Promise.all([
    panel.getByRole('button', { name: /^Statistics/ }).boundingBox(),
    panel.getByRole('button', { name: /^Speed tuning/ }).boundingBox(),
    panel.locator('.rune-optimization-count').boundingBox(),
  ]);
  expect(statistics && speed && count).toBeTruthy();
  expect(statistics!.y + statistics!.height).toBeLessThanOrEqual(speed!.y);
  expect(Math.abs(statistics!.x - speed!.x)).toBeLessThan(1);
  expect(Math.abs(statistics!.width - speed!.width)).toBeLessThan(1);
  expect(speed!.x + speed!.width).toBeLessThan(count!.x);

  const fight = page.getByRole('region', { name: 'Requirements for this calculation' }).locator('.rune-optimization-fight');
  const advantage = fight.getByRole('checkbox', { name: 'Always element advantage' });
  await expect(advantage).toBeChecked();
  await expect(advantage).toBeDisabled();
  await expect(fight.getByTitle("Every monster in Giant's Keep is Water")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('optimization-held.png') });

  await page.getByRole('button', { name: 'Open profile', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const held = dialog.getByRole('checkbox', { name: 'Always element advantage' });
  await expect(held).toBeChecked();
  await expect(held).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('overlay-held.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  /* Water has no advantage over Water: the switch is the profile's again. */
  await page.getByLabel('Monster', { exact: true }).selectOption('2');
  await expect(advantage).not.toBeChecked();
  await expect(advantage).toBeEnabled();
  await advantage.check();
  await expect(advantage).toBeChecked();

  /* Scenario is no area, so the Wind copy decides for itself there. */
  await page.getByLabel('Preset', { exact: true }).selectOption('scenario');
  await page.getByLabel('Monster', { exact: true }).selectOption('1');
  await expect(advantage).not.toBeChecked();
  await expect(advantage).toBeEnabled();
});
