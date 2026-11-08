import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

test('a compound artifact move preserves inventory and the next live update', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const account = JSON.parse(readFileSync(new URL('./fixtures/synthetic-account.json', import.meta.url), 'utf8'));
  account.wizard_id = 7;
  /* Every artifact in the inventory first, in id order, so this move starts from nothing engraved. */
  account.artifacts = [...account.unit_list.flatMap((unit: { artifacts?: unknown[] }) => unit.artifacts ?? []), ...account.artifacts]
    .sort((left: { rid: number }, right: { rid: number }) => left.rid - right.rid);
  for (const unit of account.unit_list) { unit.wizard_id = 7; unit.artifacts = []; }
  for (const artifact of account.artifacts) artifact.occupied_id = 0;
  const old = { ...account.artifacts.shift(), occupied_id: 1, slot: 1 };
  const next = { ...account.artifacts.shift(), occupied_id: 2, slot: 1 };
  account.unit_list[0].artifacts = [old];
  account.unit_list[1].artifacts = [next];
  const removed = { ...old, occupied_id: 0, slot: 0 };
  const moved = { ...next, occupied_id: 1, slot: 1 };
  const events = [
    { request: { command: 'HubUserLogin' }, response: account },
    { request: { command: 'UpdateUnitEquip', artifact_updates: [
      { artifact_id: old.rid, occupied_id: 0 }, { artifact_id: next.rid, occupied_id: 1 },
    ] }, response: { ret_code: 0, UpdateArtifactOccupation: { ret_code: 0,
      updated_artifacts: [removed, moved], updated_units: [
        { ...account.unit_list[0], artifacts: [moved] }, { ...account.unit_list[1], artifacts: [] },
      ],
    } } },
    { request: { command: 'BattleDungeonResult_V2' }, response: {
      changed_item_list: [{ type: 73, info: { ...removed, rid: 1005 } }],
    } },
  ];
  const profiles = events.map((_, index) => {
    const input = testInfo.outputPath(`capture-${index}.log`);
    const output = testInfo.outputPath(`profile-${index}.json`);
    writeFileSync(input, [JSON.stringify({ event: 'capture-started', at: new Date().toISOString() }),
      ...events.slice(0, index + 1).map((event) => JSON.stringify(event))].join('\n'));
    execFileSync('cargo', ['run', '--quiet', '--manifest-path', 'helper/src-tauri/Cargo.toml',
      '--example', 'replay_profile', '--', input, '--write-profile', output], { windowsHide: true, timeout: 90_000 });
    return JSON.parse(readFileSync(output, 'utf8'));
  });
  expect(profiles[1].data.artifacts).toContainEqual(removed);
  expect(profiles[1].data.unit_list[0].artifacts).toEqual([moved]);
  expect(profiles[1].data.unit_list[1].artifacts).toEqual([]);
  expect(profiles[2].data.artifacts.some((item: { rid: number }) => item.rid === 1005)).toBe(true);
  let current = -1;
  const headers = { 'Access-Control-Allow-Origin': '*' };
  const identity = () => ({ instanceId: 'artifact-move-helper', sessionId: 1, revision: current + 1 });
  await page.route('http://127.0.0.1:37654/health**', (route) => route.fulfill({ headers, json: {
    ...identity(), running: true, version: '99.0.0', profileReady: current >= 0,
    missedChanges: [], lastError: null, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, gameRunning: true,
  } }));
  await page.route('http://127.0.0.1:37654/profile', (route) => route.fulfill({ headers, json: {
    ...profiles[current], ...identity(), updatedAt: new Date().toISOString(),
  } }));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[name="import-route"][value="direct"]').check();
  await page.getByRole('navigation').getByRole('button', { name: 'Artifacts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Artifacts', exact: true })).toBeVisible();
  await expect(page.getByText('Nothing to show until a game file is imported.')).toBeVisible();
  const table = page.getByRole('table', { name: 'Artifact library', exact: true });
  await expect(table).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('artifacts-empty.png'), fullPage: true });
  current = 0;
  const badge = page.getByRole('complementary', { name: 'Imported game data' });
  await expect(badge).toContainText('4 artifacts');
  await expect(table.locator('tbody tr')).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const boxes = () => table.locator('tbody tr').evaluateAll((rows) => rows.map((row) => {
    const { x, y, width, height } = row.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const before = await boxes();
  const contents = await table.innerText();
  await page.screenshot({ path: testInfo.outputPath('artifacts-before.png'), fullPage: true });
  current = 1;
  await expect.poll(() => table.innerText()).not.toBe(contents);
  await expect(badge).toContainText('4 artifacts');
  await expect(table.locator('tbody tr')).toHaveCount(4);
  expect(await boxes()).toEqual(before);
  await expect(page.getByRole('status', { name: 'Live import stopped' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('artifacts-after.png'), fullPage: true });
  current = 2;
  await expect(badge).toContainText('5 artifacts');
  await expect(table.locator('tbody tr')).toHaveCount(5);
  await expect(page.getByRole('status', { name: 'Live import stopped' })).toHaveCount(0);
});
