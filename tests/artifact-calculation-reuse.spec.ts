import { expect, test } from './test-fixtures';
import { readFileSync } from 'node:fs';

type ArtifactRequest = { artifacts: string[]; monsters: number };

/**
 * Only Calculate answers the user; the game is answered at once
 * (`ACCOUNT-TABLES.md` §7). A changed standard empties the result and nothing
 * is calculated until Calculate; setting it back shows the held answer again.
 * A re-import keeps the table and scores again only the artifact that changed.
 */
test('a changed standard empties the plan; a re-import re-scores only the changed artifact', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const requests: ArtifactRequest[] = [];
    Object.assign(window, { artifactRequests: requests });
    window.Worker = class extends NativeWorker {
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
  const count = async () => (await asked()).length;

  const raw = JSON.parse(readFileSync(new URL('./fixtures/synthetic-account.json', import.meta.url), 'utf8'));
  raw.unit_list = [{ con: 600, atk: 600, def: 600, spd: 100, critical_rate: 15, critical_damage: 50, resist: 15, accuracy: 0, unit_id: 1, unit_master_id: 10131, attribute: 1, class: 6, unit_level: 40 }];
  raw.unit_list.push({ ...raw.unit_list[0], unit_id: 2 }, { ...raw.unit_list[0], unit_id: 3 });
  const engraved = { ...raw.artifacts[0], occupied_id: 1,
    sec_effects: [[219, 1, 0, 1, 0], [220, 4, 1, 0, 0], [223, 16, 1, 0, 0], [300, 6, 1, 0, 0]] };
  raw.unit_list[0].artifacts = [engraved];
  raw.artifacts = [{ ...engraved, rid: 1002, occupied_id: 0, pri_effect: [102, 100],
    sec_effects: [[219, 6, 0, 0, 0], [220, 4, 1, 0, 0], [223, 16, 1, 0, 0], [300, 6, 1, 0, 0]] },
  { ...engraved, rid: 1003, occupied_id: 0, attribute: 98, pri_effect: [100, 1800] }];

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(async () => {
    const storagePath = '/app/platform/browser-storage.ts', importsPath = '/app/domain/profiles/preference-defaults.ts';
    const { savePreferences } = await import(storagePath);
    const { blankPreferences } = await import(importsPath);
    const preferences = blankPreferences();
    await savePreferences({ ...preferences, hardwareAcceleration: false,
      artifacts: { ...preferences.artifacts, onlyLevel40Monsters: true },
      monsterPreferences: { scenario: Object.fromEntries(['ATK', 'DEF', 'HP'].map((main, index) =>
        [String(index + 1), { unitId: String(index + 1), mainStat: { preferred: [main], acceptable: [] },
          artifacts: { sub: { attribute: { preferred: [219], acceptable: [] } } } }])) },
      updatedAt: new Date(Date.now() + 1000).toISOString() });
  });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const input = page.locator('input[type="file"][accept="application/json,.json"]');
  await input.setInputFiles({ name: 'artifacts.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(raw)) });
  await expect(page.getByText('artifacts.json')).toBeVisible();

  const visit = (name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await visit('Artifact Optimization');
  await page.locator('summary').filter({ hasText: 'Recommendations' }).click();
  const recommendations = page.locator('.artifact-recommendations');
  const calculate = recommendations.getByRole('button', { name: 'Calculate', exact: true });
  const outdated = recommendations.getByText('Something changed since the last calculation.');
  const table = recommendations.locator('.artifact-recommendation-table');
  const rows = table.locator('tbody tr');
  /* In page coordinates: opening Settings scrolls the page, and a scroll is
     not movement. */
  const placed = (locator: typeof calculate) => locator.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x: x + window.scrollX, y: y + window.scrollY, width, height };
  });
  await expect(outdated).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('empty.png'), fullPage: true });

  await calculate.click();
  await recommendations.getByRole('group', { name: 'Location after', exact: true }).getByRole('button', { name: 'Engraved' }).click();
  await expect(rows).toHaveCount(3);
  const held = await rows.allTextContents();
  const calculated = await count();
  expect(calculated).toBeGreaterThan(0);
  const calculateBox = await placed(calculate);
  const tableTop = (await placed(table)).y;
  await page.screenshot({ path: testInfo.outputPath('calculated.png'), fullPage: true });

  /* A standard is the user's, and it is set on Settings: back on the page the
     plan has left, its notice takes the reserved line, and nothing was
     calculated behind the reader's back. */
  await visit('Settings');
  await page.locator('main summary').filter({ hasText: 'Artifacts' }).click();
  const intangible = page.getByRole('checkbox', { name: 'Include Intangible artifacts' });
  await intangible.uncheck();
  await visit('Artifact Optimization');
  await expect(outdated).toBeVisible();
  await expect(table).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(await count()).toBe(calculated);
  expect(await placed(calculate)).toEqual(calculateBox);
  await page.screenshot({ path: testInfo.outputPath('standard-changed.png'), fullPage: true });

  /* Setting it back shows the held plan again, uncounted. */
  await visit('Settings');
  await intangible.check();
  await visit('Artifact Optimization');
  await expect(outdated).toBeHidden();
  await expect(rows).toHaveCount(3);
  expect(await rows.allTextContents()).toEqual(held);
  expect((await placed(table)).y).toBe(tableTop);
  expect(await count()).toBe(calculated);

  /* The chosen monster is a standard too, in the panel that has one. */
  await page.locator('summary').filter({ hasText: 'Best artifact for this monster' }).click();
  const bestArtifact = page.locator('.best-artifact-for-monster');
  const monsterChoice = bestArtifact.getByRole('combobox', { name: 'Choose a monster for artifact recommendations' });
  const ranking = bestArtifact.locator('.best-artifact-results');
  await monsterChoice.selectOption('1');
  await bestArtifact.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(ranking).toBeVisible();
  const ranked = await ranking.textContent();
  const rankedCount = await count();
  await monsterChoice.selectOption('2');
  await expect(bestArtifact.getByText('Something changed since the last calculation.')).toBeVisible();
  await expect(ranking).toHaveCount(0);
  await monsterChoice.selectOption('1');
  await expect(ranking).toHaveText(ranked!);
  await expect(bestArtifact.getByText('Something changed since the last calculation.')).toBeHidden();
  expect(await count()).toBe(rankedCount);
  await page.locator('summary').filter({ hasText: 'Best artifact for this monster' }).click();

  /* The game is the game's: one artifact changes in a re-import, the plan is
     still there on the way back, and that artifact alone is scored again —
     against every monster row the plan holds. */
  const rowsPerRequest = (await asked()).find((request) => request.artifacts.includes('1002'))!.monsters;
  raw.artifacts[0].sec_effects[0][1] = 12;
  await visit('Home');
  await input.setInputFiles({ name: 'rerolled.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(raw)) });
  await page.getByRole('button', { name: 'Replace data' }).click();
  const before = await count();
  await visit('Artifact Optimization');
  await expect(table).toBeVisible();
  await expect(outdated).toBeHidden();
  await expect(rows).toHaveCount(3);
  /* Both held answers catch up: the plan against its rows, the ranking
     against the one copy it ranks for. */
  await expect.poll(count).toBe(before + 2);
  const updates = (await asked()).slice(before);
  expect(updates).toContainEqual({ artifacts: ['1002'], monsters: rowsPerRequest });
  expect(updates).toContainEqual({ artifacts: ['1002'], monsters: 1 });
  await expect(recommendations.getByText('Catching up with the game…')).toBeHidden();
  await expect.poll(() => rows.allTextContents()).not.toEqual(held);
  expect(await placed(calculate)).toEqual(calculateBox);
  await page.screenshot({ path: testInfo.outputPath('after-reimport.png'), fullPage: true });
});
