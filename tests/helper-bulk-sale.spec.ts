import { expect, test } from './test-fixtures';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

type Rune = { rune_id: number; [key: string]: unknown };
type Account = { wizard_id: number; unit_list: Array<{ wizard_id: number; runes: Rune[] }>; runes: Rune[] };
type Profile = { instanceId: string; sessionId: number; revision: number; data: Account };

test('the Rust sale response reaches Rune Clean-up and the next reward still arrives', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const account = JSON.parse(readFileSync(new URL('./fixtures/craft-account.json', import.meta.url), 'utf8')) as Account;
  account.wizard_id = 7;
  for (const unit of account.unit_list) unit.wizard_id = 7;
  const sold = account.runes.slice(0, 2);
  const reward = { ...account.runes[2], rune_id: 105 };
  const events = [
    { request: { command: 'HubUserLogin' }, response: account },
    {
      request: { command: 'SellRune', rune_id_list: sold.map((rune) => rune.rune_id), sell_path: 0 },
      response: {
        ret_code: 0, runes: sold, unit_info_list: [],
        rune_repurchase_list: [...sold, { ...sold[0], rune_id: 9999 }].map((rune, index) => ({
          rid: index + 1000, wizard_id: 7, delete_type: 1, price: 100, essence_count: 0,
          date_add: '2026-10-30 10:29:39', rune,
        })),
      },
    },
    { request: { command: 'BattleDungeonResult_V2' }, response: { ret_code: 0, changed_item_list: [{ type: 8, info: reward }] } },
  ];
  const profiles: Profile[] = [];
  for (let length = 1; length <= events.length; length += 1) {
    const input = testInfo.outputPath(`capture-${length}.log`);
    const output = testInfo.outputPath(`profile-${length}.json`);
    writeFileSync(input, [JSON.stringify({ event: 'capture-started', at: new Date().toISOString() }),
      ...events.slice(0, length).map((event) => JSON.stringify(event))].join('\n'));
    execFileSync('cargo', ['run', '--quiet', '--manifest-path', 'helper/src-tauri/Cargo.toml',
      '--example', 'replay_profile', '--', input, '--write-profile', output], { windowsHide: true, timeout: 60_000 });
    profiles.push(JSON.parse(readFileSync(output, 'utf8')) as Profile);
  }
  expect(profiles.map((profile) => profile.data.runes.length)).toEqual([3, 1, 2]);
  const state: { profile: Profile | null } = { profile: null };
  const identity = () => ({ instanceId: 'bulk-sale-helper', sessionId: 1, revision: state.profile?.revision ?? 0 });
  const headers = { 'Access-Control-Allow-Origin': '*' };
  await page.route('http://127.0.0.1:37654/health**', (route) => route.fulfill({ headers, json: {
    ...identity(), running: true, version: '99.0.0', profileReady: state.profile !== null,
    missedChanges: [], lastError: null, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, gameRunning: true,
  } }));
  await page.route('http://127.0.0.1:37654/profile', (route) => route.fulfill({ headers, json: {
    ...state.profile, ...identity(), updatedAt: new Date().toISOString(),
  } }));

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[name="import-route"][value="direct"]').check();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const section = page.locator('.workspace-page-content');
  const table = page.getByRole('table', { name: 'Rune verdicts' });
  const rows = table.locator('tbody tr');
  await expect(table).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('bulk-sale-empty.png'), fullPage: true });

  state.profile = profiles[0];
  await expect(page.getByRole('complementary', { name: 'Imported game data' })).toContainText('4 runes');
  await section.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(rows).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const boxes = await rows.evaluateAll((elements) => elements.map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));
  await page.screenshot({ path: testInfo.outputPath('bulk-sale-before.png'), fullPage: true });

  state.profile = profiles[1];
  await expect(rows.filter({ hasText: 'Sold' })).toHaveCount(2);
  await expect(section.getByRole('status', { name: '2 of 2 runes shown' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Live import stopped' })).toHaveCount(0);
  expect(await rows.evaluateAll((elements) => elements.map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }))).toEqual(boxes);
  await page.screenshot({ path: testInfo.outputPath('bulk-sale-after.png'), fullPage: true });

  state.profile = profiles[2];
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({ hasText: 'Sold' })).toHaveCount(2);
  await expect(section.getByRole('status', { name: '3 of 3 runes shown' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Live import stopped' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('bulk-sale-next-reward.png'), fullPage: true });
});
