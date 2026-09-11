import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The Relics page's second menu: which of the account's relics each monster
 * should be wearing (`docs/RELIC-CANONICAL.md` §11).
 *
 * The fixture's five monsters are chosen to reach every answer the table can
 * give. Three carry a real captured relic panel and pull in different
 * directions — Elucia favours HP main and Nimble Primal outright, Beth favours
 * ATK main, Bulldozer favours DEF main on an account that owns no good DEF
 * relic. Kaimann has no captured panel at all, so the population prior is
 * exercised. Cassie sits below the level cap, so the default filter has
 * something to hide.
 *
 * The maths and the capacity limit are the verifier's job
 * (`npm run verify:relic-monster-plan`): 150 monsters do not fit in a fixture.
 * What is checked here is the interface's own contract — the two menus, the
 * verdicts, and the promise that a filter is a view and not a scope.
 */
const relicAccount = fileURLToPath(new URL('./fixtures/relic-account.json', import.meta.url));

async function importAccount(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(relicAccount);
  await expect(page.getByText(basename(relicAccount))).toBeVisible();
  await page.getByRole('button', { name: 'Relics', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Relic library', exact: true })).toBeVisible();
}

const destinations = (page: Page) =>
  page.getByRole('table', { name: 'Relic destinations', exact: true }).locator('tbody tr');

/** The row for one monster, found by the name only that monster carries. */
const monsterRow = (page: Page, name: string) => destinations(page).filter({ hasText: name });

/* The columns by name rather than by number, so a column added to the left of
   them does not silently move every assertion one cell over. */
const current = (row: Locator) => row.locator('td').nth(5);
const recommended = (row: Locator) => row.locator('td').nth(6);
const mainStat = (row: Locator) => row.locator('td').nth(7);
const uniqueStat = (row: Locator) => row.locator('td').nth(8);
const advice = (row: Locator) => row.locator('td').nth(9);

/**
 * Opening this menu is the one expensive click in the app, and the timeout says
 * so rather than leaving the suite to fail intermittently.
 *
 * The table reads the 6.6 MB engraving-statistics dataset, which is fetched and
 * parsed on the first open and then cached for the session. Measured on an idle
 * machine: the library menu appears in 413 ms, this one in 1.9 s, and filtering
 * it afterwards takes 38 ms. Under the suite's parallel workers that first
 * parse comfortably passes Playwright's 5 s default, which is why the wait is
 * stated. If it ever needs raising again, the cost itself is the thing to fix —
 * the relic panels are a small fraction of a file that is mostly rune data.
 */
async function openUseForMons(page: Page) {
  await page.locator('summary').filter({ hasText: 'Use for mons' }).click();
  await expect(page.getByRole('table', { name: 'Relic destinations', exact: true }))
    .toBeVisible({ timeout: 30000 });
}

test('the page keeps its two questions in two menus', async ({ page }) => {
  await importAccount(page);
  /* The library opens by default because it is the page's original question;
     the roster is one click away rather than a second table stacked under it. */
  await expect(page.locator('summary').filter({ hasText: 'Power up/Keep/Sell' })).toBeVisible();
  await expect(page.locator('summary').filter({ hasText: 'Use for mons' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Relic destinations', exact: true })).toBeHidden();

  await openUseForMons(page);
  /* Opening the second does not close the first: they answer different
     questions about the same relics and are read against each other. */
  await expect(page.getByRole('table', { name: 'Relic library', exact: true })).toBeVisible();
});

test('the tagline states the engraving limit the plan actually obeys', async ({ page }) => {
  await importAccount(page);
  /* 150 is what the game's own panel says, and §3.1 is why it outranks the
     announcement's hundred. One constant feeds the tagline and the plan. */
  await expect(page.locator('.page-tagline')).toContainText('One relic rides 150 monsters');
});

test('every monster gets exactly one relic named', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  /* Four of five: Cassie is below the level cap, which the default filter hides
     exactly as the roster table does. */
  await expect(destinations(page)).toHaveCount(4);
  await expect(page.getByLabel('4 of 5 monsters shown')).toBeVisible();
  /* One recommendation, never a shortlist — the promise §11.1 makes. A row
     either names one relic or says `Same`, and never more than one of either. */
  for (const row of await destinations(page).all()) {
    await expect(recommended(row).locator('.relic-property, .relic-monster-same')).toHaveCount(1);
  }
});

test('a monster already wearing its best relic reads Keep and Same', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  /* Elucia's players favour HP main and Nimble Primal outright, and she already
     wears the account's best copy of exactly that — so both usage tiers are at
     the top, the fit is the full 100 %, and there is nothing to do. The
     recommendation says so in a word rather than repeating the two lines
     beside it. */
  const elucia = monsterRow(page, 'Elucia');
  await expect(current(elucia)).toContainText('Nimble Primal');
  await expect(recommended(elucia)).toHaveText('Same');
  /* Both halves are the most-engraved option on this monster, so both columns
     read the full 100 % — the leading option always does, which is what makes
     the two readings comparable down the page. */
  await expect(mainStat(elucia)).toHaveText('100 %');
  await expect(uniqueStat(elucia)).toHaveText('100 %');
  /* The verdict is the whole cell: the usage tiers are already the Fit beside
     it, so the Advice column does not write the same fact a second time. */
  await expect(advice(elucia)).toHaveText('Keep');
});

test('a bare monster is told to engrave, and the relic names its level in words', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  /* Beth's players put ATK main on her 69 % of the time, so the account's +15
     ATK Sharp Conquest wins; she wears nothing, so it is a clean gain. */
  const beth = monsterRow(page, 'Beth');
  await expect(current(beth)).toHaveText('—');
  await expect(recommended(beth)).toContainText('Sharp Conquest');
  /* `HP +15` beside a main property reads as fifteen points of that stat, which
     is the quantity `AGENTS.md` §5 says a main property never states. */
  await expect(recommended(beth)).toContainText('ATK (lvl. 15)');
  await expect(advice(beth)).toHaveText('Engrave');
});

test('a monster wearing the wrong relic is told to replace it', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  /* Bulldozer's players favour DEF main, and the account owns no good DEF
     relic. A relic is still named — §11.1 — and it is the strongest thing that
     half fits rather than the DEF relic it happens to be wearing. */
  const bulldozer = monsterRow(page, 'Bulldozer');
  await expect(current(bulldozer)).toContainText('Sharp Timeless');
  await expect(recommended(bulldozer)).toContainText('Nimble Primal');
  await expect(advice(bulldozer)).toHaveText('Replace');
});

test('nothing is withheld from a monster because another monster wants it', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  /* §11.5: the limit is a gate on the import's own counts, not a queue. The
     account's +12 Nimble Primal is the best answer for three of these monsters
     and all three are told to use it — a reserving pass would have handed it to
     one and sent the others to second best. Nothing here is near 150, so no row
     may claim a capacity reason. */
  const naming = destinations(page).filter({ hasText: 'Nimble Primal' });
  await expect(naming).toHaveCount(3);
  await expect(destinations(page).filter({ hasText: 'limit' })).toHaveCount(0);
});

test('a monster with no captured panel is judged against the population', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  /* §11.3.1: the fallback is the population's own average credit and not the
     synergy band, because the band's ceiling let an unmeasured monster reach a
     fit of 100 % and outscore a measured one that genuinely favoured the relic.
     It is still named a relic — §11.1 — and it still says which it got. */
  const kaimann = monsterRow(page, 'Kaimann');
  await expect(advice(kaimann)).toContainText('No statistics; using averages.');
  /* The two percentage columns measure against this monster's own panel, so
     with no panel there is nothing to divide by. An em dash, never a `0 %`,
     which would read as the population having rejected the property. */
  await expect(mainStat(kaimann)).toHaveText('—');
  await expect(uniqueStat(kaimann)).toHaveText('—');
  await expect(mainStat(kaimann)).toHaveAttribute('title', 'No statistics captured for this monster.');
});

test('a small captured panel is read rather than refused', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  /* §11.3.2: Camules carries 88 engravings and a gate at 100 used to throw the
     whole panel away, though two of its three main tiers sit well clear of a
     boundary and the game shows the player those percentages with no caveat.
     Every reading now carries its own sample size instead. */
  const bulldozer = monsterRow(page, 'Bulldozer');
  await expect(advice(bulldozer)).not.toContainText('statistics');
  await expect(mainStat(bulldozer)).toHaveAttribute('title', /from [\d,]+ engravings/);
});

test('the current relic cell shows every relic a monster wears', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  /* Parity before tidiness (`AGENTS.md` §0.1): the export gives Kaimann two
     relics, and both reach the page rather than the second being dropped. */
  const kaimann = monsterRow(page, 'Kaimann');
  await expect(current(kaimann)).toContainText('Nimble Primal');
  await expect(current(kaimann)).toContainText('Sharp Conquest');
});

test('a display filter narrows the view and never the plan', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  /* §11.6 is the invariant this table rests on. The plan is made across the
     whole roster, so hiding rows must leave every surviving row's
     recommendation, fit, score and advice untouched — a plan computed over the
     visible rows would be a plan for an account the user does not have. */
  const readRows = () => destinations(page).evaluateAll((entries) => entries.map((entry) => {
    const cells = [...entry.querySelectorAll('td')].map((cell) => cell.textContent ?? '');
    return { name: cells[1], recommended: cells[6], fit: cells[7], score: cells[8], advice: cells[9] };
  }));
  const before = await readRows();
  expect(before).toHaveLength(4);

  await page.getByRole('group', { name: 'Filter by element' }).getByRole('button', { name: 'WAT' }).click();
  const filtered = await readRows();
  expect(filtered.length).toBeLessThan(before.length);
  for (const row of filtered) expect(before).toContainEqual(row);

  /* And the same after a filter that removes the monster holding the relic the
     others are competing for, which is the case a filtered plan would change. */
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
  /* It removes rows after the verdict is decided, so the total it is measured
     against is untouched and every surviving row still says what it said. */
  await expect(page.getByLabel('2 of 5 monsters shown')).toBeVisible();
  await expect(advice(monsterRow(page, 'Beth'))).toHaveText('Engrave');

  await page.getByRole('button', { name: 'Reset monsters filters' }).click();
  await expect(destinations(page)).toHaveCount(4);
});

test('Hide if → Already engraved leaves the monsters still free to take one', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  /* Three of the four visible monsters already carry a relic, Kaimann two of
     them. Beth is the only one at the level cap wearing nothing. */
  await page.getByRole('group', { name: 'Choose which monsters to leave out' })
    .getByRole('button', { name: 'Already engraved' }).click();
  await expect(destinations(page)).toHaveCount(1);
  await expect(current(monsterRow(page, 'Beth'))).toHaveText('—');
  await expect(page.getByLabel('1 of 5 monsters shown')).toBeVisible();

  /* It hides on what the monster wears, not on the verdict: Bulldozer is asked
     to change relic and still goes, because acting on it means undoing an
     engraving first. */
  await expect(monsterRow(page, 'Bulldozer')).toHaveCount(0);

  await page.getByRole('button', { name: 'Reset monsters filters' }).click();
  await expect(destinations(page)).toHaveCount(4);
});

test('the level filter reaches a monster the default view hides', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  await page.getByRole('group', { name: 'Choose which monsters to include' })
    .getByRole('button', { name: 'Lvl. < 40' }).click();
  await expect(destinations(page)).toHaveCount(5);
  /* Cassie wears nothing and is not the incumbent on anything, so she is told
     to engrave rather than to keep. */
  await expect(advice(monsterRow(page, 'Cassie'))).toContainText('Engrave');
});

test('the destination headings say what their column holds', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  const heading = page.getByRole('table', { name: 'Relic destination columns' });
  await expect(heading.getByRole('button', { name: 'The relic this monster wears today' })).toBeVisible();
  await expect(heading.getByRole('button', { name: 'The relic to engrave on this monster' })).toBeVisible();
  /* The two percentage columns name what they are a share *of*, because the
     number alone does not say what 100 % would mean. */
  await expect(heading.getByRole('button', {
    name: "The recommended main property, as a share of this monster's most-engraved main",
  })).toBeVisible();
  await expect(heading.getByRole('button', {
    name: "The recommended unique property, as a share of this monster's most-engraved unique property",
  })).toBeVisible();
  await expect(heading.locator('th')).toHaveCount(10);
});

test('a verdict with nothing to add sits centred rather than above a blank line', async ({ page }) => {
  await importAccount(page);
  await openUseForMons(page);
  /* The reason line is rendered only when there is one, so the common row — a
     verdict the Fit column already explains — is not pushed up by an empty
     second line it will never fill. */
  const plain = advice(monsterRow(page, 'Elucia'));
  await expect(plain.locator('.relic-advice-reason')).toHaveCount(0);
  await expect(advice(monsterRow(page, 'Kaimann')).locator('.relic-advice-reason')).toHaveCount(1);

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

  /* It opens on Advice, so the rows that want something done lead rather than
     the import's own order: Engrave, then Replace, then the rows already
     carrying their answer. */
  const verdicts = await destinations(page).evaluateAll((entries) => entries.map((entry) =>
    entry.querySelector('.relic-verdict')?.textContent ?? ''));
  const rank = ['Engrave', 'Replace', 'Keep', 'No capacity'];
  expect(verdicts.map((verdict) => rank.indexOf(verdict)))
    .toEqual([...verdicts.map((verdict) => rank.indexOf(verdict))].sort((left, right) => left - right));

  await heading.getByRole('button', { name: 'Monster', exact: true }).click();
  const alphabetical = await names();
  expect([...alphabetical].sort((left, right) => left.localeCompare(right))).toEqual(alphabetical);
});
