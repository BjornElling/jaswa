import { expect, test } from './test-fixtures';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

for (const [item, index] of [['Gem', 0], ['Grindstone', 1]] as const)
  for (const populated of [false, true]) test(`a Tartarus ${item} pick reaches the live box (${populated ? 'populated' : 'empty'})`, async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const account = JSON.parse(readFileSync(new URL('./fixtures/craft-account.json', import.meta.url), 'utf8'));
  const original = account.rune_craft_item_list[index];
  const selected = { ...original, wizard_id: 7, amount: (populated ? original.amount : 0) + 1 };
  account.wizard_id = 7;
  for (const unit of account.unit_list) unit.wizard_id = 7;
  if (!populated) account.rune_craft_item_list = [];
  const oldTotal = populated ? 9 : 0;
  const events = [
    { request: { command: 'HubUserLogin' }, response: account },
    { request: { command: 'pickGuildMazeBattleClearReward' }, response: { ret_code: 0,
      pick_changestone_list: [{ before: { ...selected, amount: selected.amount - 1 }, after: populated ? selected : [selected] }],
    } },
    // Another readable reward must still follow the selection normally.
    { request: { command: 'BattleDungeonResult_V2' }, response: { ret_code: 0,
      changed_item_list: [{ type: 27, info: { ...selected, amount: selected.amount + 1 } }],
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
  let current = 0;
  const headers = { 'Access-Control-Allow-Origin': '*' };
  const identity = () => ({ instanceId: 'maze-pick-helper', sessionId: 1, revision: current + 1 });
  await page.route('http://127.0.0.1:37654/health**', (route) => route.fulfill({ headers, json: {
    ...identity(), running: true, version: '99.0.0', profileReady: true,
    missedChanges: [], lastError: null, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, gameRunning: true,
  } }));
  await page.route('http://127.0.0.1:37654/profile', (route) => route.fulfill({ headers, json: {
    ...profiles[current], ...identity(), updatedAt: new Date().toISOString(),
  } }));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[name="import-route"][value="direct"]').check();
  await page.getByRole('navigation').getByRole('button', { name: 'Gems & Grinds', exact: true }).click();
  const summary = page.locator('summary').filter({ hasText: 'Your box' });
  if (!(await summary.evaluate((node) => node.parentElement?.hasAttribute('open')))) await summary.click();
  const badge = page.getByRole('complementary', { name: 'Imported game data' });
  await expect(badge).toContainText(`${oldTotal} gems & grinds`);
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(populated ? 6 : 0);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const controls = () => Promise.all([summary, page.getByRole('heading', { name: 'Gems & Grinds', exact: true })]
    .map((control) => control.evaluate((node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    })));
  const before = await controls();
  await page.screenshot({ path: testInfo.outputPath('maze-before.png'), fullPage: true });
  current = 1;
  await expect(badge).toContainText(`${oldTotal + 1} gems & grinds`);
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(populated ? 6 : 1);
  const quantity = await page.locator('.craft-grid tbody tr td:nth-child(6)').allTextContents();
  expect(quantity.map(Number).reduce((sum, amount) => sum + amount, 0)).toBe(oldTotal + 1);
  await expect(page.getByRole('status', { name: 'Some game changes were missed' })).toHaveCount(0);
  const after = await controls();
  if (populated) expect(after).toEqual(before);
  else expect(after[1]).toEqual(before[1]);
  await page.screenshot({ path: testInfo.outputPath('maze-after.png'), fullPage: true });
  current = 2;
  await expect(badge).toContainText(`${oldTotal + 2} gems & grinds`);
  await expect(page.getByRole('status', { name: 'Live import stopped' })).toHaveCount(0);
  expect(await controls()).toEqual(after);
});
