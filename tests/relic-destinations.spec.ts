import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const relicAccount = fileURLToPath(new URL('./fixtures/relic-account.json', import.meta.url));

async function importAccount(page: Page, variant?: (account: Record<string, unknown>) => void) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const account = JSON.parse(readFileSync(relicAccount, 'utf8'));
  variant?.(account);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: basename(relicAccount), mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.getByText(basename(relicAccount))).toBeVisible();
  await page.getByRole('button', { name: 'Relic Optimization', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Relic library', exact: true })).toBeVisible();
}

const destinations = (page: Page) =>
  page.getByRole('table', { name: 'Relic destinations', exact: true }).locator('tbody tr');

const monsterRow = (page: Page, name: string) => destinations(page).filter({ hasText: name });

const current = (row: Locator) => row.locator('td').nth(5);
const recommended = (row: Locator) => row.locator('td').nth(6);
const mainStat = (row: Locator) => row.locator('td').nth(7);
const uniqueStat = (row: Locator) => row.locator('td').nth(8);
const advice = (row: Locator) => row.locator('td').nth(9);

async function openUseForMons(page: Page) {
  await page.locator('summary').filter({ hasText: 'Use for mons' }).click();
  await expect(page.getByRole('table', { name: 'Relic destinations', exact: true }))
    .toBeVisible({ timeout: 30000 });
}

test('the page keeps its two questions in two menus', async ({ page }) => {
  await importAccount(page);
  await expect(page.locator('summary').filter({ hasText: 'Power up/Keep/Sell' })).toBeVisible();
  await expect(page.locator('summary').filter({ hasText: 'Use for mons' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Relic destinations', exact: true })).toBeHidden();

  await openUseForMons(page);
  await expect(page.getByRole('table', { name: 'Relic library', exact: true })).toBeVisible();
});

test('the tagline states the engraving limit the plan actually obeys', async ({ page }) => {
  await importAccount(page);
  await expect(page.locator('.page-tagline')).toContainText('One relic rides 150 monsters');
});

test('every monster gets exactly one relic named', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  await expect(destinations(page)).toHaveCount(4);
  await expect(page.getByLabel('4 of 4 monsters shown')).toBeVisible();
  for (const row of await destinations(page).all()) {
    await expect(recommended(row).locator('.relic-property, .relic-monster-same')).toHaveCount(1);
  }
});

test('a monster already wearing its best relic reads Keep and Same', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const elucia = monsterRow(page, 'Elucia');
  await expect(current(elucia)).toContainText('Nimble Primal');
  await expect(recommended(elucia)).toHaveText('Same');
  await expect(mainStat(elucia)).toHaveText('9.38');
  await expect(uniqueStat(elucia)).toHaveText('2.50');
  await expect(advice(elucia)).toHaveText('Keep');
});

test('a bare monster is told to engrave, and the relic names its level in words', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const beth = monsterRow(page, 'Beth');
  await expect(current(beth)).toHaveText('—');
  await expect(recommended(beth)).toContainText('Sharp Conquest');
  await expect(recommended(beth)).toContainText('ATK (lvl. 15)');
  await expect(advice(beth)).toHaveText('Engrave');
});

test('a monster wearing the wrong relic is told to replace it', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const bulldozer = monsterRow(page, 'Bulldozer');
  await expect(current(bulldozer)).toContainText('Sharp Timeless');
  await expect(recommended(bulldozer)).toContainText('Nimble Primal');
  await expect(advice(bulldozer)).toHaveText('Replace');
});

test('nothing is withheld from a monster because another monster wants it', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const naming = destinations(page).filter({ hasText: 'Nimble Primal' });
  await expect(naming).toHaveCount(3);
  await expect(destinations(page).filter({ hasText: 'limit' })).toHaveCount(0);
});

test('the same rune build scores identically on different monster species', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const kaimann = monsterRow(page, 'Kaimann');
  const elucia = monsterRow(page, 'Elucia');
  await expect(mainStat(kaimann)).toHaveText(await mainStat(elucia).innerText());
  await expect(uniqueStat(kaimann)).toHaveText(await uniqueStat(elucia).innerText());
  await expect(advice(kaimann)).toHaveText('Keep');
  await expect(mainStat(kaimann)).toHaveAttribute('title', /weighted score points/);
});

test('changing the rune build changes the relic recommendation', async ({ page }) => {
  await importAccount(page, (account) => {
    const monsters = account.unit_list as Record<string, unknown>[];
    /* Beth's six runes, renumbered so the two copies hold distinct runes. */
    monsters[0].runes = (monsters[2].runes as Record<string, unknown>[])
      .map((rune) => ({ ...rune, rune_id: Number(rune.rune_id) + 500000, occupied_id: 1 }));
  });
  await openUseForMons(page);
  const elucia = monsterRow(page, 'Elucia');
  await expect(recommended(elucia)).toContainText('Sharp Conquest');
  await expect(advice(elucia)).toHaveText('Replace');
  await expect(mainStat(elucia)).toHaveText('18.00');
});

test('missing stats are explained, and a bare copy is read from its species statistics', async ({ page }) => {
  await importAccount(page, (account) => {
    const monsters = account.unit_list as Record<string, unknown>[];
    delete monsters[0].con;
    monsters[1].runes = [];
    monsters[3].runes = [];
  });
  await openUseForMons(page);
  await expect(destinations(page)).toHaveCount(4);
  const missing = monsterRow(page, 'Elucia');
  await expect(advice(missing)).toContainText('Import this monster’s base stats.');
  /* Bare of runes and without a floor, a captured species is read from its rune
     statistics and still gets a recommendation. A copy nothing can speak for is
     held in `verify:relic-monster-plan`: every species here is captured. */
  for (const name of ['Kaimann', 'Bulldozer']) {
    await expect(recommended(monsterRow(page, name))).not.toHaveText('—');
  }
  await expect(recommended(missing)).toHaveText('—');
  await expect(mainStat(missing)).toHaveText('—');
  await expect(uniqueStat(missing)).toHaveText('—');
  await expect(advice(missing)).toContainText('No recommendation');
  await expect(advice(missing)).not.toContainText('No capacity');
});

test('saved relic choices constrain engraving and survive a reload', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const elucia = monsterRow(page, 'Elucia');
  await elucia.getByRole('button', { name: /Elucia/ }).click();
  const dialog = page.getByRole('dialog');
  /* ATK is the only main the copy will take, and the uniques are left at Any. */
  await dialog.getByRole('button', { name: /^Main stat, preferred:/ }).click();
  await page.getByRole('menu', { name: 'Main stat, preferred' }).getByRole('menuitem', { name: 'ATK', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(recommended(elucia)).toContainText('Sharp Conquest');
  await expect(mainStat(elucia)).toHaveText('0.00');
  await page.reload();
  await expect(recommended(monsterRow(page, 'Elucia'))).toContainText('Sharp Conquest');
  await monsterRow(page, 'Elucia').getByRole('button', { name: /Elucia/ }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Main stat, preferred:/ }))
    .toHaveAttribute('aria-label', 'Main stat, preferred: ATK');
  await expect(page.getByRole('dialog').getByRole('button', { name: /^Relic uniques, preferred:/ }))
    .toHaveAttribute('aria-label', 'Relic uniques, preferred: Any');
});
test('the current relic cell shows every relic a monster wears', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const kaimann = monsterRow(page, 'Kaimann');
  await expect(current(kaimann)).toContainText('Nimble Primal');
  await expect(current(kaimann)).toContainText('Sharp Conquest');
});

test('a display filter narrows the view and never the plan', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const readRows = () => destinations(page).evaluateAll((entries) => entries.map((entry) => {
    const cells = [...entry.querySelectorAll('td')].map((cell) => cell.textContent ?? '');
    return { name: cells[1], recommended: cells[6], main: cells[7], unique: cells[8], advice: cells[9] };
  }));
  const before = await readRows();
  expect(before).toHaveLength(4);

  await page.getByRole('group', { name: 'Filter by element' }).getByRole('button', { name: 'WAT' }).click();
  const filtered = await readRows();
  expect(filtered.length).toBeLessThan(before.length);
  for (const row of filtered) expect(before).toContainEqual(row);

  await page.getByRole('button', { name: 'Reset monsters filters' }).click();
  await page.getByRole('group', { name: 'Choose which monsters to include' })
    .getByRole('button', { name: 'Monsters outside Monster Storage' }).click();
  for (const row of await readRows()) expect(before).toContainEqual(row);

  await page.getByRole('button', { name: 'Reset monsters filters' }).click();
  expect(await readRows()).toEqual(before);
});

test('Hide if → Already optimal leaves only the rows asking for something', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const optimal = destinations(page).filter({ hasText: 'Same' });
  await expect(optimal).toHaveCount(2);

  await page.getByRole('group', { name: 'Choose which monsters to leave out' })
    .getByRole('button', { name: 'Already optimal' }).click();
  await expect(destinations(page)).toHaveCount(2);
  await expect(destinations(page).filter({ hasText: 'Same' })).toHaveCount(0);
  await expect(page.getByLabel('2 of 4 monsters shown')).toBeVisible();
  await expect(advice(monsterRow(page, 'Beth'))).toHaveText('Engrave');

  await page.getByRole('button', { name: 'Reset monsters filters' }).click();
  await expect(destinations(page)).toHaveCount(4);
});

test('Hide if → Already engraved leaves the monsters still free to take one', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  await page.getByRole('group', { name: 'Choose which monsters to leave out' })
    .getByRole('button', { name: 'Already engraved' }).click();
  await expect(destinations(page)).toHaveCount(1);
  await expect(current(monsterRow(page, 'Beth'))).toHaveText('—');
  await expect(page.getByLabel('1 of 4 monsters shown')).toBeVisible();

  await expect(monsterRow(page, 'Bulldozer')).toHaveCount(0);

  await page.getByRole('button', { name: 'Reset monsters filters' }).click();
  await expect(destinations(page)).toHaveCount(4);
});

test('a monster below level 40 never enters the relic plan', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  await expect(destinations(page)).toHaveCount(4);
  await expect(monsterRow(page, 'Cassie')).toHaveCount(0);
});

test('the destination headings say what their column holds', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const heading = page.getByRole('table', { name: 'Relic destination columns' });
  await expect(heading.getByRole('button', { name: 'The relic this monster wears today' })).toBeVisible();
  await expect(heading.getByRole('button', { name: 'The relic to engrave on this monster' })).toBeVisible();
  await expect(heading.getByRole('button', {
    name: "The recommended main bonus in weighted score points",
  })).toBeVisible();
  await expect(heading.getByRole('button', {
    name: "The recommended unique bonus in weighted score points",
  })).toBeVisible();
  await expect(heading.locator('th')).toHaveCount(10);
});

test('a verdict with nothing to add sits centred rather than above a blank line', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const plain = advice(monsterRow(page, 'Elucia'));
  await expect(plain.locator('.relic-advice-reason')).toHaveCount(0);
  await expect(advice(monsterRow(page, 'Kaimann')).locator('.relic-advice-reason')).toHaveCount(0);

  const offsets = await plain.evaluate((cell) => {
    const verdict = cell.querySelector('.relic-verdict') as HTMLElement;
    const cellBox = cell.getBoundingClientRect();
    const markBox = verdict.getBoundingClientRect();
    return {
      above: markBox.top - cellBox.top,
      below: cellBox.bottom - markBox.bottom,
    };
  });
  expect(Math.abs(offsets.above - offsets.below)).toBeLessThan(2);
});

test('a destination filter click never moves the columns under the user', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const heading = page.getByRole('table', { name: 'Relic destination columns' });
  const widths = () => heading.locator('th')
    .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
  const before = await widths();

  await page.getByRole('group', { name: 'Filter by monster type' }).getByRole('button', { name: 'ATK' }).click();
  await expect(destinations(page)).toHaveCount(1);
  expect(await widths()).toEqual(before);
});

test('the table sorts on its monster columns as well as its judgements', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const heading = page.getByRole('table', { name: 'Relic destination columns' });
  const names = () => destinations(page).evaluateAll((entries) =>
    entries.map((entry) => entry.querySelectorAll('td')[1].textContent ?? ''));

  const verdicts = await destinations(page).evaluateAll((entries) => entries.map((entry) =>
    entry.querySelector('.relic-verdict')?.textContent ?? ''));
  const rank = ['Engrave', 'Replace', 'Keep', 'No capacity'];
  expect(verdicts.map((verdict) => rank.indexOf(verdict)))
    .toEqual([...verdicts.map((verdict) => rank.indexOf(verdict))].sort((left, right) => left - right));

  await heading.getByRole('button', { name: 'Monster', exact: true }).click();
  const alphabetical = await names();
  expect([...alphabetical].sort((left, right) => left.localeCompare(right))).toEqual(alphabetical);
});
