import { expect, test } from './test-fixtures';
import { readFileSync } from 'node:fs';
import { holdWorkerRequests } from './hold-worker-requests';

type ArtifactRequest = { artifacts: string[]; monsters: number };

/**
 * A change in the game lands in the held answer (`ACCOUNT-TABLES.md` §7): the
 * table stays whole while the touched pairs are scored again, and only those
 * are. Spending the last stone of a class touches that class's artifacts.
 */
test('a spent last artifact stone re-scores its class in place', async ({ page }, testInfo) => {
  const workers = await holdWorkerRequests(page);
  await page.addInitScript(() => {
    const HeldWorker = window.Worker;
    const requests: ArtifactRequest[] = [];
    Object.assign(window, { artifactRequests: requests });
    window.Worker = class extends HeldWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (!String(url).includes('artifact-score')) return;
        const post = this.postMessage.bind(this);
        this.postMessage = (message) => {
          if (message?.type === 'calculate') {
            requests.push({ artifacts: message.request.artifacts.map((artifact: { id: string }) => artifact.id), monsters: message.request.monsters.length });
          }
          post(message);
        };
      }
    };
  });
  const asked = () => page.evaluate(() => (window as unknown as { artifactRequests: ArtifactRequest[] }).artifactRequests);
  const account = JSON.parse(readFileSync(new URL('./fixtures/synthetic-account.json', import.meta.url), 'utf8'));
  account.unit_list = [{ con: 600, atk: 600, def: 600, spd: 100, critical_rate: 15, critical_damage: 50, resist: 15, accuracy: 0, unit_id: 1, unit_master_id: 10131, attribute: 1, class: 6, unit_level: 40 }];
  account.unit_list.push({ ...account.unit_list[0], unit_id: 2 }, { ...account.unit_list[0], unit_id: 3 });
  /* Engraved on the first copy, so it stands in that copy's list, as an export has it. */
  const engraved = { ...account.artifacts[0], occupied_id: 1,
    sec_effects: [[219, 1, 0, 1, 0], [220, 4, 1, 0, 0], [223, 16, 1, 0, 0], [300, 6, 1, 0, 0]] };
  account.unit_list[0].artifacts = [engraved];
  account.artifacts = [{ ...engraved, rid: 1002, occupied_id: 0, pri_effect: [102, 100],
    sec_effects: [[219, 12, 0, 1, 0], [220, 4, 1, 0, 0], [223, 16, 1, 0, 0], [300, 6, 1, 0, 0]] },
  { ...engraved, rid: 1003, occupied_id: 0, attribute: 98, pri_effect: [100, 1800] }];
  let revision = 0;
  await page.route((url) => url.origin === 'http://127.0.0.1:37654' && (url.pathname === '/health' || url.pathname === '/profile'), async (route) => {
    const identity = { instanceId: 'artifact-stone-live', sessionId: 1, revision };
    const headers = { 'Access-Control-Allow-Origin': '*' };
    await route.fulfill({ headers, json: new URL(route.request().url()).pathname === '/health'
      ? { ...identity, running: true, version: '99.0.0', profileReady: revision > 0, missedChanges: [], lastError: null,
        restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, gameRunning: true }
      : { ...identity, source: 'live', updatedAt: new Date().toISOString(), data: { ...account,
        artifact_crafts: [{ rid: 9, master_id: 101010005219, quantity: revision === 1 ? 1 : 0 }] } } });
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(async () => {
    const storagePath = '/app/platform/browser-storage.ts', importsPath = '/app/domain/profiles/preference-defaults.ts';
    const { savePreferences } = await import(storagePath);
    const { blankPreferences } = await import(importsPath);
    const preferences = blankPreferences();
    await savePreferences({ ...preferences, importRoute: 'direct', directImportMode: 'live', hardwareAcceleration: false,
      artifacts: { ...preferences.artifacts, onlyLevel40Monsters: true },
      monsterPreferences: { scenario: Object.fromEntries(['ATK', 'DEF', 'HP'].map((main, index) =>
        [String(index + 1), { unitId: String(index + 1), mainStat: { preferred: [main], acceptable: [] },
          artifacts: { sub: { attribute: { preferred: [219], acceptable: [] } } } }])) },
      updatedAt: new Date(Date.now() + 1000).toISOString() });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Artifact Optimization', exact: true }).click();
  await page.getByText('Recommendations', { exact: true }).click();
  const recommendations = page.locator('.artifact-recommendations');
  const calculate = recommendations.getByRole('button', { name: 'Calculate', exact: true });
  await expect(page.getByText('Import your game data first, then ask every artifact where it can shine.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('empty.png'), fullPage: true });
  revision = 1;
  await expect(page.getByRole('complementary', { name: 'Imported game data' })).toContainText('3 artifacts');
  await calculate.click();
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
  /* Already matching asks Yes or No like Conversion, the switch between
     them says how the two combine, and no choice moves another. */
  const matching = page.getByRole('group', { name: 'Already matching', exact: true });
  const join = page.getByRole('group', { name: 'Join Conversion and Already matching', exact: true });
  const joiner = (await join.boundingBox())!;
  await expect(join.getByRole('button', { name: 'And', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(joiner.x).toBeGreaterThan(filterBox!.x + filterBox!.width - 1);
  expect(joiner.x + joiner.width).toBeLessThan(matchingBox!.x + 1);
  const keepRows = await rows.filter({ has: page.getByRole('cell', { name: 'Keep', exact: true }) }).count();
  await matching.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(rows).toHaveCount(keepRows);
  expect(await conversion.boundingBox()).toEqual(filterBox);
  expect(await matching.boundingBox()).toEqual(matchingBox);
  await matching.getByRole('button', { name: 'Yes', exact: true }).click();
  await matching.getByRole('button', { name: 'No', exact: true }).click();
  await expect(rows).toHaveCount(3 - keepRows);
  await matching.getByRole('button', { name: 'No', exact: true }).click();
  await expect(rows).toHaveCount(3);
  /* Or joins only what narrows: Conversion / Yes alone still shows its one
     row, and adding Already matching / Yes adds the Keep rows to it. */
  await join.getByRole('button', { name: 'Or', exact: true }).click();
  expect(await join.boundingBox()).toEqual(joiner);
  await conversion.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(rows).toHaveCount(1);
  await matching.getByRole('button', { name: 'Yes', exact: true }).click();
  const converted = rows.filter({ hasText: 'Improve roll in' });
  const convertedKeep = await converted.filter({ has: page.getByRole('cell', { name: 'Keep', exact: true }) }).count();
  await expect(rows).toHaveCount(1 + keepRows - convertedKeep);
  expect(await conversion.boundingBox()).toEqual(filterBox);
  expect(await matching.boundingBox()).toEqual(matchingBox);
  await conversion.getByRole('button', { name: 'Yes', exact: true }).click();
  await matching.getByRole('button', { name: 'Yes', exact: true }).click();
  await join.getByRole('button', { name: 'And', exact: true }).click();
  await expect(rows).toHaveCount(3);

  /* The stone is the game's: the table stays, whole, while the Water
     artifacts are scored again, and the Intangible one — which no stone can
     touch — is not asked about at all. */
  const tableContents = await table.textContent();
  const tableBounds = await table.boundingBox();
  const askedBefore = (await asked()).length;
  await workers.hold();
  revision = 2;
  await expect.poll(async () => page.evaluate(async () => {
    const path = '/app/platform/browser-storage.ts';
    const { loadImportedGame } = await import(path);
    return (await loadImportedGame()).data.artifact_crafts[0].quantity;
  })).toBe(0);
  const catchingUp = recommendations.getByText('Catching up with the game…');
  await expect(catchingUp).toBeVisible();
  await expect(recommendations.getByText('Something changed since the last calculation.')).toBeHidden();
  expect(await table.textContent()).toBe(tableContents);
  expect(await table.boundingBox()).toEqual(tableBounds);
  await page.screenshot({ path: testInfo.outputPath('during-update.png'), fullPage: true });
  await workers.release();
  await expect(table).toContainText('No conversion');
  await expect(table).not.toContainText('Improve roll in');
  await expect(catchingUp).toBeHidden();
  await expect(rows).toHaveCount(3);
  const update = (await asked()).slice(askedBefore);
  expect(update.map((request) => request.artifacts.sort())).toEqual([[String(engraved.rid), '1002'].sort()]);
  expect(await calculate.boundingBox()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('after-spending.png'), fullPage: true });

  /* The other two readers keep their own answer through a change in the game,
     with the same selected subject throughout. */
  for (const [title, panelClass, chooser, value, changed, resultsClass] of [
    ['Best monster for this artifact', '.best-monster-for-artifact', 'Choose an artifact for monster recommendations', '1002', account.artifacts[0], '.best-monster-results'],
    ['Best artifact for this monster', '.best-artifact-for-monster', 'Choose a monster for artifact recommendations', '1', engraved, '.best-artifact-results'],
  ] as const) {
    await page.locator('summary').filter({ hasText: title }).click();
    const panel = page.locator(panelClass);
    const results = panel.locator(resultsClass);
    await expect(results).toHaveCount(0);
    await panel.getByRole('combobox', { name: chooser }).selectOption(value);
    await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(results).toBeVisible();
    const contents = await results.textContent();
    const box = () => results.evaluate((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x: x + window.scrollX, y: y + window.scrollY, width, height };
    });
    const bounds = await box();
    await page.screenshot({ path: testInfo.outputPath(`${value}-before-update.png`), fullPage: true });
    await workers.hold();
    changed.sec_effects[0][1] += 1;
    revision += 1;
    await expect(panel.getByText('Catching up with the game…')).toBeVisible();
    expect(await results.textContent()).toBe(contents);
    expect(await box()).toEqual(bounds);
    await page.screenshot({ path: testInfo.outputPath(`${value}-during-update.png`), fullPage: true });
    await workers.release();
    await expect(panel.getByText('Catching up with the game…')).toBeHidden();
    await expect(results).toBeVisible();
    await expect(panel.getByText('Something changed since the last calculation.')).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath(`${value}-after-update.png`), fullPage: true });
    await page.locator('summary').filter({ hasText: title }).click();
  }
});
