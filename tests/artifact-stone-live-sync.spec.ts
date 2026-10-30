import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

for (const recalculate of ['manual', 'on-change'] as const) {
  test(`a spent last artifact stone invalidates an unchanged roll (${recalculate})`, async ({ page }, testInfo) => {
    const account = JSON.parse(readFileSync(new URL('./fixtures/synthetic-account.json', import.meta.url), 'utf8'));
    account.unit_list = [{ unit_id: 1, unit_master_id: 10131, attribute: 1, class: 6, unit_level: 40 }];
    account.unit_list.push({ ...account.unit_list[0], unit_id: 2 }, { ...account.unit_list[0], unit_id: 3 });
    account.artifacts = [{ ...account.artifacts[0], occupied_id: 1,
      sec_effects: [[219, 1, 0, 1, 0], [220, 4, 1, 0, 0], [223, 16, 1, 0, 0], [300, 6, 1, 0, 0]] }];
    account.artifacts.push({ ...account.artifacts[0], rid: 1002, occupied_id: 0, pri_effect: [102, 100],
      sec_effects: [[219, 12, 0, 1, 0], [220, 4, 1, 0, 0], [223, 16, 1, 0, 0], [300, 6, 1, 0, 0]] },
    { ...account.artifacts[0], rid: 1003, occupied_id: 0, attribute: 98, pri_effect: [100, 1800] });
    let revision = 0;
    await page.route('http://127.0.0.1:37654/**', async (route) => {
      const identity = { instanceId: 'artifact-stone-live', sessionId: 1, revision };
      const headers = { 'Access-Control-Allow-Origin': '*' };
      await route.fulfill({ headers, json: new URL(route.request().url()).pathname === '/health'
        ? { ...identity, running: true, version: '99.0.0', profileReady: revision > 0, missedChanges: [], lastError: null,
          restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false }
        : { ...identity, source: 'live', updatedAt: new Date().toISOString(), data: { ...account,
          artifact_crafts: [{ rid: 9, master_id: 101010005219, quantity: revision === 1 ? 1 : 0 }] } } });
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
    await page.evaluate(async (mode) => {
      const storagePath = '/app/lib/browser-storage.ts', importsPath = '/app/lib/file-imports.ts';
      const { savePreferences } = await import(storagePath);
      const { blankPreferences } = await import(importsPath);
      const preferences = blankPreferences();
      await savePreferences({ ...preferences, importRoute: 'direct', directImportMode: 'live', hardwareAcceleration: false,
        artifacts: { ...preferences.artifacts, onlyLevel40Monsters: true, recalculate: mode },
        monsterPreferences: { scenario: Object.fromEntries(['ATK', 'DEF', 'HP'].map((main, index) =>
          [String(index + 1), { unitId: String(index + 1), mainStat: { preferred: [main], acceptable: [] },
            artifacts: { sub: { attribute: { preferred: [219], acceptable: [] } } } }])) },
        updatedAt: new Date(Date.now() + 1000).toISOString() });
    }, recalculate);
    await page.reload();
    await page.getByRole('button', { name: 'Artifact Optimization', exact: true }).click();
    await page.getByText('This is the way', { exact: true }).click();
    const calculate = page.getByRole('button', { name: 'Calculate recommendations', exact: true });
    await expect(page.getByText('Import your game data first, then ask every artifact where it can shine.')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('empty.png'), fullPage: true });
    revision = 1;
    await expect(page.getByRole('complementary', { name: 'Imported game data' })).toContainText('3 artifacts');
    await calculate.click();
    await page.getByRole('group', { name: 'Already matching', exact: true }).getByRole('button', { name: 'Hide' }).click();
    await page.getByRole('group', { name: 'Location after', exact: true }).getByRole('button', { name: 'Engraved' }).click();
    const table = page.locator('.artifact-recommendation-table');
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(table).toContainText('Improve roll in');
    await expect(table).toContainText('Legend Water stone');
    await page.screenshot({ path: testInfo.outputPath('before-spending.png'), fullPage: true });
    const before = await calculate.boundingBox();
    const conversion = page.getByRole('group', { name: 'Conversion', exact: true });
    const filterBox = await conversion.boundingBox();
    const matchingBox = await page.getByRole('group', { name: 'Already matching', exact: true }).boundingBox();
    expect(matchingBox!.x).toBeGreaterThan(filterBox!.x);
    expect(matchingBox!.y).toBe(filterBox!.y);
    await conversion.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(rows).toHaveCount(1);
    await expect(table).toContainText('Improve roll in');
    expect(await conversion.boundingBox()).toEqual(filterBox);
    expect(await calculate.boundingBox()).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath('conversion-yes.png'), fullPage: true });
    await conversion.getByRole('button', { name: 'No', exact: true }).click();
    await expect(rows).toHaveCount(3);
    await conversion.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(rows).toHaveCount(2);
    await expect(table).toContainText('No conversion');
    await expect(table.locator('.artifact-conversion-intangible')).toHaveText('Intangible');
    expect(await conversion.boundingBox()).toEqual(filterBox);
    expect(await calculate.boundingBox()).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath('conversion-no.png'), fullPage: true });
    await conversion.getByRole('button', { name: 'No', exact: true }).click();
    await expect(rows).toHaveCount(3);
    revision = 2;
    await expect.poll(async () => page.evaluate(async () => {
      const path = '/app/lib/browser-storage.ts';
      const { loadImportedGame } = await import(path);
      return (await loadImportedGame()).data.artifact_crafts[0].quantity;
    })).toBe(0);
    if (recalculate === 'manual') {
      await expect(page.getByText('Settings or imported data changed. Calculate again to refresh these recommendations.')).toBeVisible();
      await expect(table).toHaveCount(0);
      await calculate.click();
    }
    await expect(table).toContainText('No conversion');
    await expect(table).not.toContainText('Improve roll in');
    expect(await calculate.boundingBox()).toEqual(before);
    await page.screenshot({ path: testInfo.outputPath('after-spending.png'), fullPage: true });
  });
}
