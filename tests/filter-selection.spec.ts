import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const cases = [
  { name: 'Stats', fixture: 'storage-location-account.json', nav: 'Monster Stats', group: 'Choose which monsters to include', table: 'Monster stats', first: 'Monsters outside Monster Storage', second: 'Storage' },
  { name: 'Artifacts', fixture: 'awakening-search-account.json', nav: 'Artifacts', group: 'Choose artifact locations', table: 'Artifact library', first: 'Engraved', second: 'Inventory' },
  { name: 'Relics', fixture: 'relic-account.json', nav: 'Relic Optimization', group: 'Filter by engraved', table: 'Relic library', first: 'Yes', second: 'No' },
];
for (const entry of cases) test(`${entry.name}: no Location choice and both choices show the same rows`, async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const fixture = JSON.parse(await readFile(fileURLToPath(new URL(`./fixtures/${entry.fixture}`, import.meta.url)), 'utf8'));
  fixture.unit_list.forEach((monster: Record<string, unknown>) => { monster.unit_level = 40; });
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: entry.fixture, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: entry.nav, exact: true }).click();
  const group = page.getByRole('group', { name: entry.group, exact: true });
  const rows = page.getByRole('table', { name: entry.table, exact: true }).locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  const all = await rows.allTextContents();
  expect(all.length).toBeGreaterThan(1);
  const bounds = await group.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('all-before.png'), fullPage: true });
  await group.getByRole('button', { name: entry.first, exact: true }).click();
  await group.getByRole('button', { name: entry.second, exact: true }).click();
  await expect(rows).toHaveText(all);
  expect(await group.boundingBox()).toEqual(bounds);
  await page.screenshot({ path: testInfo.outputPath('none-is-all.png'), fullPage: true });
  await group.getByRole('button', { name: entry.first, exact: true }).click();
  await expect(rows).not.toHaveCount(all.length);
  await group.getByRole('button', { name: entry.second, exact: true }).click();
  await expect(rows).toHaveText(all);
});

test('Numbers: clearing all four Location checkboxes includes every location', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(fileURLToPath(new URL('./fixtures/storage-location-account.json', import.meta.url)));
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Numbers', exact: true }).click();
  const locations = page.getByRole('group', { name: 'Choose which locations to include' });
  const rows = page.getByRole('table', { name: 'Monster numbers', exact: true }).locator('tbody tr');
  await expect(rows).toHaveCount(4);
  const all = await rows.allTextContents();
  for (const checkbox of await locations.getByRole('checkbox').all()) await checkbox.uncheck();
  await expect(rows).toHaveText(all);
  await locations.getByRole('checkbox', { name: 'Storage', exact: true }).check();
  await expect(rows).toHaveCount(1);
  await page.reload();
  await expect(rows).toHaveCount(1);
  await locations.getByRole('checkbox', { name: 'Storage', exact: true }).uncheck();
  await expect(rows).toHaveText(all);
});
