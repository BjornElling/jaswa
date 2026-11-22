import { expect, test } from './test-fixtures';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const accountPath = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

type RawRune = { rune_id: number; upgrade_curr: number; occupied_type: number; occupied_id: number; pri_eff: number[]; sec_eff: number[][] };
type RawAccount = { unit_list: Array<{ unit_id: number; runes: RawRune[] }>; runes: RawRune[] };

/**
 * The account the player leaves after working down the table: one rune sold, one
 * powered up to a new sub property, one gemmed and ground, one taken off its
 * monster, and a new one from a dungeon run.
 */
function workedAccount(): RawAccount {
  const account = JSON.parse(readFileSync(accountPath, 'utf8')) as RawAccount;
  const engraved = account.unit_list[0].runes.pop() as RawRune;
  const inventory = account.runes.filter((rune) => rune.rune_id !== 104);
  const powered = inventory.find((rune) => rune.rune_id === 102) as RawRune;
  powered.upgrade_curr = 12;
  powered.pri_eff = [4, 63];
  powered.sec_eff.push([11, 4, 0, 0]);
  const crafted = inventory.find((rune) => rune.rune_id === 101) as RawRune;
  crafted.sec_eff[0] = [2, 8, 0, 4];
  crafted.sec_eff[2] = [12, 6, 1, 0];
  account.runes = [
    ...inventory,
    { ...engraved, occupied_type: 2, occupied_id: 0 },
    {
      rune_id: 105, set_id: 13, slot_no: 2, class: 6, rank: 5, extra: 5, upgrade_curr: 0, occupied_type: 2, occupied_id: 0,
      pri_eff: [4, 11], prefix_eff: [0, 0], sec_eff: [[2, 5, 0, 0], [9, 4, 0, 0], [10, 4, 0, 0], [12, 5, 0, 0]],
    } as RawRune,
  ];
  return account;
}

/**
 * A sync after Calculate re-reads only the runes the game changed, and the list
 * the player is working down stays where it was: a sold rune leaves the table,
 * a changed rune is answered in place, and a new rune lands above the rest.
 */
test('a sync updates Rune Clean-up rune by rune without moving the rows', async ({ page }, testInfo) => {
  /* Three calculations of every role on the processor: the whole one, the
     re-reading, and Calculate. */
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const fileInput = page.locator('input[type="file"][accept="application/json,.json"]');
  await fileInput.setInputFiles(accountPath);
  await expect(page.getByText('craft-account.json')).toBeVisible();

  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  const cleanup = page.locator('.workspace-page-content');
  const status = page.locator('.calculation-status');
  const rows = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr');
  await cleanup.getByRole('button', { name: 'Calculate' }).click();
  await expect(status).toContainText('4 runes judged against', { timeout: 60_000 });
  await expect(rows).toHaveCount(4);

  /* Arrange by level, so every rune the sync touches has somewhere else to go. */
  await page.getByRole('columnheader', { name: 'Lv.' }).getByRole('button').click();
  const levels = rows.locator('td:nth-child(3)');
  const before = await levels.allTextContents();
  const statusBefore = await status.textContent();
  await page.screenshot({ path: testInfo.outputPath('rune-cleanup-before-sync.png'), fullPage: true });

  const worked = testInfo.outputPath('worked-account.json');
  writeFileSync(worked, JSON.stringify(workedAccount()));
  /* A sync while the reader is on another page has the same incremental answer,
     and returning preserves the arrangement made before leaving. */
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await fileInput.setInputFiles(worked);
  await page.getByRole('button', { name: 'Replace data' }).click();
  await expect(page.locator('p').filter({ hasText: /^worked-account\.json · imported/ })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();

  /* The new rune has been judged and stands first; the three held rows still in
     the account follow in the order they had, the powered-up one at its new level.
     The sold rune has left the table, and no row is dimmed. */
  await expect(rows).toHaveCount(4, { timeout: 60_000 });
  await expect(levels.first()).toHaveText('+0');
  const after = await levels.allTextContents();
  const soldLevel = `+${soldRuneLevel()}`;
  const held = [...before];
  held.splice(held.indexOf(soldLevel), 1);
  expect(after.slice(1)).toEqual(held.map((level) => (level === '+9' ? '+12' : level)));

  await expect(page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr[data-stale]')).toHaveCount(0);
  await expect(rows.filter({ hasText: 'Sold' })).toHaveCount(0);
  await expect(rows.filter({ hasText: 'Inventory' })).toHaveCount(4);
  await expect(cleanup.getByRole('status', { name: '4 of 4 runes shown' })).toBeVisible();
  /* Answered rune by rune: the whole calculation's own status line stands. */
  await expect(status).toHaveText(statusBefore ?? '');
  await page.screenshot({ path: testInfo.outputPath('rune-cleanup-after-sync.png'), fullPage: true });

  /* Arranging the table again sorts every row. */
  await page.getByRole('columnheader', { name: 'Lv.' }).getByRole('button').click();
  await expect(rows).toHaveCount(4);
  expect(await levels.allTextContents()).not.toEqual(after);

  /* A new calculation answers the account as it is. */
  await cleanup.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(rows).toHaveCount(4, { timeout: 60_000 });
});

function soldRuneLevel(): number {
  const account = JSON.parse(readFileSync(accountPath, 'utf8')) as RawAccount;
  return (account.runes.find((rune) => rune.rune_id === 104) as RawRune).upgrade_curr;
}
