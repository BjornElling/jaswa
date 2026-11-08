import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const account = JSON.parse(readFileSync(new URL('./fixtures/craft-account.json', import.meta.url), 'utf8'));

test('Location names the Scenario monster and counts each other preset and protects any non-Scenario engraving', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const navigation = page.getByRole('navigation');
  await navigation.getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Calculate', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('empty.png') });
  const emptyProtection = page.getByRole('checkbox', { name: 'Engraved in non-Scenario preset', exact: true });
  const emptyBox = await page.locator('.rune-filter-strip').boundingBox();
  await emptyProtection.uncheck();
  expect(await page.locator('.rune-filter-strip').boundingBox()).toEqual(emptyBox);
  await page.screenshot({ path: testInfo.outputPath('empty-unchecked.png') });
  await emptyProtection.check();

  const data = structuredClone(account);
  data.unit_list[1].runes = [{ ...structuredClone(data.unit_list[0].runes[0]), rune_id: 106, occupied_id: 2 }];
  const equip = (unit_id: number, rune_id_list: number[]) => ({ unit_id, rune_id_list, artifact_id_list: [] });
  data.deck_list = [
    { deck_type: 1, deck_seq: 1, unit_id_list: [1], equip: [equip(1, [103, 101])] },
    { deck_type: 1, deck_seq: 2, unit_id_list: [1], equip: [equip(1, [103, 101])] },
    { deck_type: 1, deck_seq: 3, unit_id_list: [2], equip: [equip(2, [102])] },
  ];
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'rune-locations.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.getByRole('complementary', { name: 'Imported game data' })).toContainText('5 runes');
  await navigation.getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const table = page.getByRole('table', { name: 'Rune verdicts' });
  const rows = table.locator('tbody tr');
  await expect(rows).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath('populated.png') });
  const cells = rows.locator('td:nth-child(7)');
  await expect(cells).toHaveText(['Kaimann', 'Inventory', 'Elucia (2A) (+ 2)', 'Engraved × 1', 'Engraved × 2']);
  await expect(cells.filter({ hasText: 'Inventory' }).locator('.engraved-place')).toHaveClass(/muted/);
  expect(await cells.filter({ hasText: 'Inventory' }).locator('.engraved-place').evaluate((element) => getComputedStyle(element).color))
    .toEqual(await cells.filter({ hasText: '(+ 2)' }).locator('.engraved-place-count').evaluate((element) => getComputedStyle(element).color));
  const shared = cells.filter({ hasText: '(+ 2)' }).locator('[title]');
  await expect(shared).toHaveAttribute('title', /Scenario/);
  await expect(shared).toHaveAttribute('title', /Arena Attack 1/);
  await expect(shared).toHaveAttribute('title', /Arena Attack 2/);

  const location = page.getByRole('group', { name: 'Filter by location' });
  const boxes = () => Promise.all([
    page.locator('.rune-filter-strip').boundingBox(), page.getByRole('table', { name: 'Rune verdict columns' }).boundingBox(),
  ]);
  const before = await boxes();
  await location.getByRole('button', { name: 'Engraved', exact: true }).click();
  await expect(rows).toHaveCount(4);
  await expect(cells).toHaveText(['Kaimann', 'Elucia (2A) (+ 2)', 'Engraved × 1', 'Engraved × 2']);
  expect(await boxes()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('engraved-filter.png') });
  await location.getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(rows).toHaveCount(5);
  expect(await boxes()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('both-filters.png') });
  await location.getByRole('button', { name: 'Engraved', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(cells).toHaveText(['Inventory']);
  expect(await boxes()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('inventory-filter.png') });

  await location.getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(rows).toHaveCount(5);
  const protection = page.getByRole('checkbox', { name: 'Engraved in non-Scenario preset', exact: true });
  await expect(protection).toBeChecked();
  await expect(rows.locator('.rune-verdict')).toHaveText(['Sell', 'Sell', 'Keep', 'Power up', 'Keep']);
  const rowBoxes = () => rows.evaluateAll((entries) => entries.map((entry) => {
    const { x, y, width, height } = entry.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const beforeRows = await rowBoxes();
  await page.screenshot({ path: testInfo.outputPath('protection-on.png') });
  await protection.uncheck();
  await expect(rows.locator('.rune-verdict')).toHaveText(['Sell', 'Sell', 'Sell', 'Sell', 'Sell']);
  expect(await rowBoxes()).toEqual(beforeRows);
  expect(await boxes()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('protection-off.png') });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await expect(protection).not.toBeChecked();
  // The label remains an active checkbox target in both states.
  await page.locator('label[for="rune-engraving-protection"]').click();
  await expect(protection).toBeChecked();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(rows.locator('.rune-verdict')).toHaveText(['Sell', 'Sell', 'Keep', 'Power up', 'Keep']);
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await expect(protection).toBeChecked();

  await navigation.getByRole('button', { name: 'Monster Stats', exact: true }).click();
  await page.locator('.monster-link').filter({ hasText: 'Elucia' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add a nickname' }).click();
  const nickname = 'A very long monster nickname that fills the entire name field'.slice(0, 60);
  await dialog.getByRole('textbox', { name: 'Nickname' }).fill(nickname);
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  await navigation.getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(rows).toHaveCount(5);
  const named = cells.filter({ hasText: '(+ 2)' });
  await expect(named).toContainText(nickname);
  await expect(named.locator('.engraved-place-count')).toHaveText('(+ 2)');
  expect(await named.locator('.engraved-place-name').evaluate((element) => ({
    truncated: element.scrollWidth > element.clientWidth,
    overflow: getComputedStyle(element).textOverflow,
  }))).toEqual({ truncated: true, overflow: 'ellipsis' });
  for (const width of [1600, 900]) {
    await page.setViewportSize({ width, height: 1000 });
    const cell = await named.boundingBox();
    const count = await named.locator('.engraved-place-count').boundingBox();
    expect(cell).not.toBeNull();
    expect(count).not.toBeNull();
    expect(count!.x + count!.width).toBeLessThanOrEqual(cell!.x + cell!.width);
    await page.screenshot({ path: testInfo.outputPath(`long-name-${width}.png`) });
  }

  const sharedRow = cells.filter({ hasText: '(+ 2)' }).locator('xpath=..');
  await sharedRow.locator('.rune-link').click();
  const runeOverlay = page.getByRole('dialog');
  const overlayLocation = runeOverlay.locator('.rune-overlay-location .engraved-place');
  await expect(overlayLocation).toHaveText(`Elucia (2A) (${nickname}) (+ 2)`);
  await expect(overlayLocation).toHaveAttribute('title', /Scenario/);
  await expect(overlayLocation).toHaveAttribute('title', /Arena Attack 1/);
  await page.screenshot({ path: testInfo.outputPath('overlay-scenario-and-presets.png') });
});
