import { expect, test } from './test-fixtures';
import type { Page } from './test-fixtures';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { holdWorkerRequests } from './hold-worker-requests';

const account = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

async function openCleanup(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('craft-account.json')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const links = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody .rune-link');
  await expect(links.first()).toBeVisible();
  return links;
}

test('the rune overlay states the rune and nothing else, and returns focus', async ({ page }, testInfo) => {
  await openCleanup(page);
  /* Chosen by what it is, not by where it sorts: the table opens in Obtained
     order, which a change to the fixture would reshuffle. */
  const firstRune = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr')
    .filter({ hasText: 'Violent', has: page.getByRole('img', { name: 'Legend quality' }) })
    .filter({ hasText: /SPD\s*\+5/ })
    .locator('.rune-link');
  await firstRune.click();

  const overlay = page.getByRole('dialog', { name: 'Violent' });
  await expect(overlay).toBeVisible();
  /* The stats need no headings; the reader knows which is which. */
  for (const heading of ['Main property', 'Innate property', 'Sub properties']) {
    await expect(overlay.getByText(heading, { exact: true })).toHaveCount(0);
  }
  await expect(overlay.getByText('No innate', { exact: true })).toBeVisible();
  await expect(overlay.getByText('Legend', { exact: true })).toBeVisible();
  /* Four lines always, the unrevealed ones blank, so the box keeps its height. */
  await expect(overlay.locator('.rune-overlay-subs tbody tr')).toHaveCount(4);
  await expect(overlay.getByRole('table', { name: 'Sub properties' }).locator('tbody').getByRole('row')).toHaveCount(2);
  /* Below +12 a stone may already go on and a Gem may not, so Improvements names the
     stones the verdict counted and no Gem. */
  await expect(overlay.getByRole('columnheader', { name: 'Improvements' })).toHaveAttribute('title', /Gem is decided at \+12/);
  const improvements = overlay.getByRole('table', { name: 'Sub properties' }).locator('tbody tr td:nth-child(4)');
  await expect(improvements.filter({ hasText: /^\+\d+%?$/ })).toHaveCount(2);
  await expect(improvements.getByRole('img', { name: /from an Enchanted Gem$/ })).toHaveCount(0);
  await expect(overlay.getByText('Not revealed yet')).toHaveCount(0);
  /* The stats box states the rune as it is; only Evaluation speaks of +15. */
  await expect(overlay.locator('.rune-overlay-stats').getByText(/at \+15/)).toHaveCount(0);
  await expect(overlay.getByText('Rune', { exact: true })).toHaveCount(0);
  await expect(overlay.getByText(/piece set/)).toHaveCount(0);
  /* The projection it used to carry belongs to the pages that judge a rune. */
  await expect(overlay.getByText('Substat potential at +15')).toHaveCount(0);
  await expect(overlay.getByText('What can still improve')).toHaveCount(0);
  await expect(overlay.getByText('Inventory', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rune-overlay-open.png') });

  /* One close control, the overlay's own. */
  await expect(overlay.getByRole('button', { name: 'Close', exact: true })).toHaveCount(1);
  await overlay.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(overlay).toBeHidden();
  await expect(firstRune).toBeFocused();
});

test('Improvements names the Gem and the stones the verdict counted', async ({ page }) => {
  const links = await openCleanup(page);
  await links.filter({ hasText: 'Fatal' }).click();
  const overlay = page.getByRole('dialog', { name: 'Fatal' });
  const table = overlay.getByRole('table', { name: 'Sub properties' });
  await expect(table.getByRole('columnheader', { name: 'Improvements' })).toHaveAttribute('title', /Potential assumes, for /);
  const maxOf = (line: RegExp) => table.locator('tbody tr').filter({ hasText: line }).locator('td').nth(3);
  /* The Gem goes where it gains most, which here is the Resistance line, into CRI Rate; the
     grindable lines carry the canonical average Legend stone. Resistance takes none. */
  /* The Gem is named with the roll Potential assumes for it, unsigned: it is what the
     line becomes, not something added to it. */
  await expect(maxOf(/^Resistance/)).toHaveText(/^CRI Rate\s*8%$/);
  await expect(maxOf(/^Resistance/).getByRole('img', { name: 'CRI Rate from an Enchanted Gem' })).toBeVisible();
  await expect(maxOf(/^HP/)).toHaveText('+8%');
  await expect(maxOf(/^ATK/)).toHaveText('+8%');
  await expect(maxOf(/^SPD/)).toHaveText('+5');
});

test('Evaluation explains Best role with every role\'s reading, at one height', async ({ page }) => {
  await openCleanup(page);
  const row = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr')
    .filter({ hasText: 'Violent', has: page.getByRole('img', { name: 'Legend quality' }) })
    .filter({ hasText: /SPD\s*\+5/ });
  await row.locator('.rune-link').click();
  const overlay = page.getByRole('dialog', { name: 'Violent' });
  const evaluation = overlay.getByRole('region', { name: 'Evaluation' });
  const readings = evaluation.getByRole('table', { name: 'Every role\'s reading' });
  /* Every role has a row before the answer lands, so the box does not grow under it. */
  await expect(readings.locator('tbody tr')).toHaveCount(10);
  const early = await evaluation.boundingBox();
  const best = readings.locator('tbody tr[aria-current="true"]');
  await expect(best).toHaveCount(1);
  expect(await evaluation.boundingBox()).toEqual(early);
  /* Ranked the way Best role is chosen, so the choice leads the list. */
  await expect(readings.locator('tbody tr').first()).toHaveAttribute('aria-current', 'true');

  /* The starred row is the role the verdict table names, with the same Potential. */
  const roleName = (await best.getByRole('rowheader').textContent())!;
  await expect(best.getByRole('img', { name: 'Best role' })).toBeVisible();
  await expect(evaluation.getByText(roleName, { exact: true }).first()).toBeVisible();
  await expect(row).toContainText(roleName);
  const bestMax = (await best.locator('td').nth(2).textContent())!;
  /* A role that prefers or accepts the rune says so; one that cannot read it, nothing. */
  await expect(readings.getByRole('img', { name: /^(Preferred|Accepted)$/ }).first()).toBeVisible();
  await expect(readings.locator('tbody tr').last().locator('td').first()).toBeEmpty();
  await expect(row).toContainText(`${Math.round(Number.parseFloat(bestMax))} %`);
  const facts = evaluation.locator('.rune-overlay-evaluation-facts dd');
  await expect(facts.nth(1)).toHaveText(/^(Preferred|Accepted|Broken)$/);
  /* The build's slot 2/4/6 mains are not repeated here: the line cost the overlay its fit. */
  await expect(facts).toHaveCount(6);
  await expect(evaluation.getByText('Selected Rune quality floor', { exact: true })).toBeVisible();
  await expect(facts.nth(2)).toHaveText('Top 5 %');
  await expect(evaluation.getByText('Required quality for this rune', { exact: true })).toBeVisible();
  await expect(facts.nth(3)).toHaveText(/^Top [\d.]+ %$/);
});

test('the strictest quality floor explains the reading’s percentile bar', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('floor-empty.png') });
  const game = JSON.parse(readFileSync(account, 'utf8'));
  for (const monster of game.unit_list) Object.assign(monster, {
    con: 700, atk: 700, def: 700, spd: 105,
    critical_rate: 15, critical_damage: 50, resist: 15, accuracy: 0,
  });
  /* This unfinished rune has a specific same-main reference in every reading. */
  game.runes.push({ rune_id: 999, set_id: 18, slot_no: 1, class: 6, rank: 5, extra: 5,
    upgrade_curr: 0, occupied_type: 2, occupied_id: 0, pri_eff: [3, 22], prefix_eff: [0, 0],
    sec_eff: [[8, 4, 0, 0], [11, 7, 0, 0], [12, 7, 0, 0], [4, 5, 0, 0]],
  });
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'floor-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(game)),
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Settings', exact: true }).click();
  await page.locator('main details').filter({ hasText: 'Settings' }).locator('summary').click();
  await page.getByLabel('Rune quality floor', { exact: true }).fill('5');
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  const row = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr').filter({ hasText: 'Destroy' });
  await row.locator('.rune-link').click();
  const dialog = page.getByRole('dialog', { name: 'Destroy', exact: true });
  const evaluation = dialog.getByRole('region', { name: 'Evaluation' });
  const facts = evaluation.locator('.rune-overlay-evaluation-facts dd');
  await expect(facts.nth(0)).not.toHaveText('—');
  await expect(facts.nth(2)).toHaveText('Top 1 %');
  await expect(facts.nth(3)).toHaveText(/^Top [\d.]+ %$/);
  const share = (text: string | null) => Number(text?.match(/^Top ([\d.]+) %$/)?.[1]);
  expect(share(await facts.nth(3).textContent())).toBeLessThanOrEqual(1);
  await expect(evaluation.getByText('Quality of this rune', { exact: true })).toBeVisible();
  await expect(facts.nth(4)).toHaveText(/^Top [\d.]+ %$/);
  const box = await evaluation.boundingBox();
  await page.screenshot({ path: testInfo.outputPath('floor-ready.png') });
  await dialog.getByRole('checkbox', { name: 'Unsellable' }).check();
  expect(await evaluation.boundingBox()).toEqual(box);
  await page.screenshot({ path: testInfo.outputPath('floor-held.png') });
});

test('anywhere in a verdict row opens its rune, and selecting text there does not', async ({ page }) => {
  await openCleanup(page);
  const row = page.getByRole('table', { name: 'Rune verdicts' }).locator('tbody tr')
    .filter({ hasText: 'Violent', has: page.getByRole('img', { name: 'Legend quality' }) })
    .filter({ hasText: /SPD\s*\+5/ });
  const overlay = page.getByRole('dialog', { name: 'Violent' });
  const main = row.locator('td').nth(3);

  /* Dragging across a figure to copy it is a selection, not a request. */
  const box = (await main.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(overlay).toBeHidden();

  await main.click();
  await expect(overlay).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
  /* Focus returns to the one control the row has, not to wherever it was clicked. */
  await expect(row.locator('.rune-link')).toBeFocused();
});

test('Instructions hold a rune under its own word and file it under Keep; Unsellable outlives a re-import and a lock does not', async ({ page }, testInfo) => {
  /* This flow calculates twice, once after a fresh import, so it needs room for
     two independent slot calibrations when the full suite drives eight browsers. */
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openCleanup(page);
  const table = page.getByRole('table', { name: 'Rune verdicts' });
  const violentRow = table.locator('tbody tr')
    .filter({ hasText: 'Violent', has: page.getByRole('img', { name: 'Legend quality' }) })
    .filter({ hasText: /SPD\s*\+5/ });
  const fatalRow = table.locator('tbody tr').filter({ hasText: 'Fatal' });
  const advice = (row: typeof violentRow) => row.locator('.rune-verdict');
  const engineVerdict = (await advice(violentRow).textContent())!;

  /* An inventory rune can be made unsellable but has no monster to be locked to. */
  await violentRow.locator('.rune-link').click();
  const violent = page.getByRole('dialog', { name: 'Violent' });
  const hold = violent.getByRole('region', { name: 'Instructions' });
  await expect(hold.getByRole('checkbox', { name: 'Lock', exact: true })).toBeDisabled();
  const evaluation = violent.getByRole('region', { name: 'Evaluation' });
  await expect(evaluation.locator('tbody tr[aria-current="true"]')).toHaveCount(1);
  const before = { hold: await hold.boundingBox(), evaluation: await evaluation.boundingBox() };
  await page.screenshot({ path: testInfo.outputPath('your-call-empty.png') });
  await hold.getByRole('checkbox', { name: 'Unsellable' }).check();
  /* Ticking a box moves nothing around it. */
  expect({ hold: await hold.boundingBox(), evaluation: await evaluation.boundingBox() }).toEqual(before);
  await page.keyboard.press('Escape');
  await expect(advice(violentRow)).toHaveText('Unsellable');

  /* An engraved rune can take both, and Locked is the word that wins. */
  await fatalRow.locator('.rune-link').click();
  const fatal = page.getByRole('dialog', { name: 'Fatal' }).getByRole('region', { name: 'Instructions' });
  await fatal.getByRole('checkbox', { name: 'Unsellable' }).check();
  await fatal.getByRole('checkbox', { name: 'Lock', exact: true }).check();
  await page.screenshot({ path: testInfo.outputPath('your-call-full.png') });
  /* Four sub properties, both choices and every role: the tallest the overlay gets,
     and still no scrollbar of its own. */
  const overflow = await page.getByRole('dialog', { name: 'Fatal' }).evaluate((dialog) => {
    const scrolling = [dialog, ...dialog.querySelectorAll('*')].filter((element) => element.scrollHeight > element.clientHeight + 1
      && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY));
    return scrolling.map((element) => element.className);
  });
  expect(overflow).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(advice(fatalRow)).toHaveText('Locked');

  /* Keep shows the runes the user kept as well as those the engine did. */
  await page.getByRole('group', { name: 'Filter by advice' }).getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(violentRow).toBeVisible();
  await expect(fatalRow).toBeVisible();
  await page.getByRole('group', { name: 'Filter by advice' }).getByRole('button', { name: 'Keep', exact: true }).click();

  /* A lock reloads with the import it was made on… */
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(advice(fatalRow)).toHaveText('Locked', { timeout: 60_000 });

  /* …and a new import of the account is the game's word: Unsellable stays, the lock goes. */
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await page.getByRole('button', { name: 'Replace data', exact: true }).click();
  /* The dialog closes once the new import is saved. */
  await expect(page.getByRole('button', { name: 'Replace data', exact: true })).toBeHidden();
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(advice(violentRow)).toHaveText('Unsellable', { timeout: 60_000 });
  await expect(advice(fatalRow)).toHaveText('Unsellable');
  await fatalRow.locator('.rune-link').click();
  await expect(page.getByRole('dialog', { name: 'Fatal' }).getByRole('checkbox', { name: 'Lock', exact: true })).not.toBeChecked();
  await page.keyboard.press('Escape');

  /* Taking the choice off hands the row back to the engine. */
  await violentRow.locator('.rune-link').click();
  await page.getByRole('dialog', { name: 'Violent' }).getByRole('checkbox', { name: 'Unsellable' }).uncheck();
  await page.keyboard.press('Escape');
  await expect(advice(violentRow)).toHaveText(engineVerdict);
});

test('an engraved rune shows its Scenario location without a monster link', async ({ page }) => {
  const links = await openCleanup(page);
  await links.filter({ hasText: 'Fatal' }).click();
  const overlay = page.getByRole('dialog', { name: 'Fatal' });
  const location = overlay.locator('.rune-overlay-location .engraved-place');
  await expect(location).toHaveText('Elucia (2A)');
  await expect(location).toHaveAttribute('title', /Scenario/);
  await expect(location.getByRole('button')).toHaveCount(0);
});

test('while an overlay is up the page behind it neither scrolls nor keeps it open', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 700 });
  const links = await openCleanup(page);
  const opener = links.first();
  await opener.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  /* Measure after the pointer target is in view: a taller filter box can put
     it on the viewport edge, where the browser scrolls before a click. */
  await opener.hover();
  const scrolled = await page.evaluate(() => window.scrollY);
  const resting = await opener.boundingBox();

  const overlay = page.getByRole('dialog');
  await opener.click();
  await expect(overlay).toBeVisible();
  /* Locking the page must not move it: the stable gutter keeps the scrollbar's room. */
  expect(await opener.boundingBox()).toEqual(resting);
  await page.mouse.move(300, 650);
  await page.mouse.wheel(0, 600);
  await page.keyboard.press('End');
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);

  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();

  await opener.click();
  await page.mouse.click(300, 60);
  await expect(overlay).toBeHidden();

  /* The mouse's back button closes the overlay rather than leaving the page. */
  await opener.click();
  const url = page.url();
  const box = (await overlay.boundingBox())!;
  const client = await page.context().newCDPSession(page);
  const at = { x: box.x + 40, y: box.y + box.height / 2 };
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'back', buttons: 8, clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'back', buttons: 0, clickCount: 1 });
  await expect(overlay).toBeHidden();
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
});

test('the main line says the overlay is still calculating, and saying it moves nothing', async ({ page }, testInfo) => {
  const work = await holdWorkerRequests(page);
  const links = await openCleanup(page);
  /* Hold the request until the pending state is measured; a warm worker can
     otherwise finish between the click and the first browser assertion. */
  await work.hold();
  await links.first().click();
  const overlay = page.getByRole('dialog');
  const busy = overlay.locator('.rune-overlay-busy');
  const main = overlay.locator('.rune-overlay-main');
  const stats = overlay.locator('.rune-overlay-stats');
  /* The table's answers carry no per-role readings, so the overlay always asks once more. */
  await expect(busy).toHaveAttribute('data-busy', 'true');
  await expect(busy).toHaveText('Calculating…');
  await expect(busy.locator('svg.busy-spinner')).toHaveCount(1);
  const before = { main: await main.boundingBox(), stats: await stats.boundingBox() };
  /* Gold, at the body size rather than the main line's. */
  const look = await busy.evaluate((element) => {
    const style = getComputedStyle(element);
    return { color: style.color, size: style.fontSize, mainSize: getComputedStyle(element.previousElementSibling!).fontSize };
  });
  expect(look.color).toBe('rgb(217, 173, 82)');
  expect(look.size).not.toBe(look.mainSize);
  await page.screenshot({ path: testInfo.outputPath('rune-overlay-pending.png') });

  await work.release();
  await expect(busy).not.toHaveAttribute('data-busy', /.*/);
  await expect(busy).toHaveCSS('opacity', '0');
  await expect(busy).toHaveAttribute('aria-hidden', 'true');
  expect({ main: await main.boundingBox(), stats: await stats.boundingBox() }).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('rune-overlay-settled.png') });
});
