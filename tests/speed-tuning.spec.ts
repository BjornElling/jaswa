import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/speed-account.json', import.meta.url));

async function freshWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('jaswa-local');
      request.onsuccess = request.onerror = request.onblocked = () => resolve(undefined);
    });
  });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
}

async function openSpeedTuning(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'Speed Tuning' }).click();
  await expect(page.getByRole('heading', { name: 'Speed Tuning', exact: true })).toBeVisible();
}

/* Collapsed table borders land rows on half pixels, so heights agree within one. */
function expectSameHeight(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
}

async function box(locator: Locator) {
  const measured = await locator.boundingBox();
  if (!measured) throw new Error('The element has no box.');
  return measured;
}

test('an empty workspace says what Speed Tuning needs', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await openSpeedTuning(page);
  await expect(page.getByText('Import your game data first.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add team' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('speed-no-import.png') });
});

test('tunes a dungeon team, explains every miss, and keeps the card still', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('speed-account.json')).toBeVisible();
  await openSpeedTuning(page);

  /* Nothing is shipped: the page opens empty, with the account's own totem. */
  await expect(page.getByText('Level 20 of 20 · +15 % of base speed')).toBeVisible();
  await expect(page.getByText('No dungeon teams yet.', { exact: false })).toBeVisible();
  await expect(page.getByText('No arena teams yet.', { exact: false })).toBeVisible();
  await expect(page.getByText('No rules yet.', { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('speed-empty.png') });

  /* A dungeon team is drafted in an overlay; nothing reaches the page until it is added. */
  const dungeons = page.getByRole('region', { name: 'Dungeons' });
  const addButton = dungeons.getByRole('button', { name: 'Add team' });
  const headBefore = await box(dungeons.getByRole('heading', { name: 'Dungeons' }));
  await addButton.click();
  const card = page.getByRole('dialog', { name: "Giant's Keep team #1" });
  await expect(card.getByText('New dungeon team')).toBeVisible();
  await expect(card.locator('.speed-slot')).toHaveCount(5);
  await expect(card.getByRole('button', { name: 'Add this team' })).toBeDisabled();
  const emptyBox = await box(card.locator('.speed-team-editor'));
  await page.screenshot({ path: testInfo.outputPath('speed-overlay-empty.png') });

  /* Choosing another dungeon renames the draft; choosing back restores it. */
  await card.getByLabel('Dungeon', { exact: true }).selectOption({ label: 'Necropolis' });
  await expect(page.getByRole('heading', { name: 'Necropolis team #1' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Necropolis team #1' }).getByLabel('Dungeon', { exact: true }).selectOption({ label: "Giant's Keep" });
  await expect(card).toBeVisible();

  /* Monsters join in the order their dungeon speed gives them, whatever order they are picked in. */
  const add = card.getByLabel("Add a monster to Giant's Keep team #1");
  for (const name of ['Megan (2A)', 'Lushen #1', 'Bernard (2A)', 'Veromos', 'Verdehile']) {
    await add.selectOption({ label: name });
  }
  await expect(card.locator('.speed-monster .monster-name')).toHaveText(['Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile', 'Megan (2A)']);
  await expect(card.locator('.speed-combat')).toHaveText(['170', '119', '115', '114', '112']);
  await expect(card.getByText('Perfect tune: everyone moves where you put them.')).toBeVisible();
  await expect(card.getByText('Stage 2 · fastest enemy 169 dungeon speed · first moves after your 2nd turn')).toBeVisible();
  await expect(card.getByRole('img', { name: /^Bernard \(2A\) — Tailwind: \+34\.5 % attack bar to allies/ })).toBeVisible();
  const fullBox = await box(card.locator('.speed-team-editor'));
  expectSameHeight(fullBox.height, emptyBox.height);
  await card.screenshot({ path: testInfo.outputPath('speed-team-perfect.png') });

  /* A draft with edits survives a stray Escape; Add puts it on the page as one line. */
  await page.keyboard.press('Escape');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Add this team' }).click();
  await expect(card).toHaveCount(0);
  await expect(addButton).toBeFocused();
  const line = dungeons.getByRole('button', { name: /^Giant's Keep team #1:/ });
  await expect(line.locator('.speed-summary-name')).toHaveText(['Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile', 'Megan (2A)']);
  await expect(line.locator('.speed-summary-state')).toHaveText('Turn order holds with the runes worn');
  await expect(line.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'good');
  const lineBox = await box(line);
  expectSameHeight((await box(dungeons.getByRole('heading', { name: 'Dungeons' }))).y, headBefore.y);
  await page.screenshot({ path: testInfo.outputPath('speed-page-one-team.png') });
  await line.click();
  await expect(card.getByText('Dungeon team', { exact: true })).toBeVisible();

  /* Megan asked to move second: she is too slow, and gets her own interval. */
  for (let step = 0; step < 3; step += 1) await card.getByRole('button', { name: 'Move Megan (2A) earlier' }).click();
  const megan = card.locator('.speed-slot').nth(1);
  await expect(megan.locator('.speed-verdict')).toHaveText('Too slow · moves 5th · needs 104–154 display speed');
  await expect(card.locator('.speed-slot').nth(2).locator('.speed-verdict')).toHaveText(/^Too fast · moves 2nd/);
  await expect(card.getByText('4 of 5 out of place.')).toBeVisible();
  expectSameHeight((await box(card.locator('.speed-team-editor'))).height, emptyBox.height);
  await card.screenshot({ path: testInfo.outputPath('speed-team-out-of-order.png') });

  /* A what-if inside the interval fixes the whole team; empty goes back to the import. */
  const whatIf = card.getByLabel("What-if display speed for Megan (2A) in Giant's Keep team #1");
  await whatIf.fill('120');
  /* The experiment's verdict names itself and quotes the runes worn beside it. */
  await expect(card.getByText('Perfect tune with your what-ifs · 4 of 5 with the runes worn.')).toBeVisible();
  await expect(megan.locator('.speed-combat')).toHaveText('135');
  await whatIf.fill('');
  await expect(card.getByText('4 of 5 out of place.')).toBeVisible();
  await whatIf.fill('120');

  /* A leader counts only where it reaches; a dungeon lead does here. */
  await card.getByLabel('Leader').selectOption({ label: 'Verdehile — +28 % attack speed in dungeons' });
  await expect(card.getByText('+28 % attack speed in dungeons.')).toBeVisible();
  await expect(card.locator('.speed-combat').first()).toHaveText('201');

  /* The margin names its own failure, apart from order. */
  await card.getByRole('checkbox', { name: 'Add speed margin' }).check();
  await card.getByLabel("Speed margin for Giant's Keep team #1, in dungeon speed").selectOption('3');
  await expect(card.locator('.speed-verdict').filter({ hasText: 'inside the 3-speed margin' }).first()).toBeVisible();
  expectSameHeight((await box(card.locator('.speed-team-editor'))).height, emptyBox.height);

  /* The turn order opens over the editor, draws every tick, and Escape closes only it. */
  const opener = card.getByRole('button', { name: 'Turn order' });
  await opener.click();
  const dialog = page.locator('.speed-turn-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Stage 1' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('.speed-timeline-turn').first()).toHaveText('1');
  await expect(dialog.locator('.speed-turn-list li[data-enemy]')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Your team alone' }).click();
  await expect(dialog.locator('.speed-turn-list li')).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath('speed-turn-order.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(opener).toBeFocused();

  /* The line judges the runes worn, not the experiment: Megan's what-if fixes the
     draft, but she is still out of place on the page, and the leader is marked. */
  await card.getByRole('button', { name: 'Save changes' }).click();
  await expect(line).toBeFocused();
  /* The names follow the order asked for, uncoloured; only the mark and the sentence change. */
  await expect(line.locator('.speed-summary-name')).toHaveText(['Bernard (2A)', 'Megan (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);
  /* Its count is the count the editor quotes for the runes worn, with the what-ifs' beside it. */
  await expect(line.locator('.speed-summary-state')).toHaveText(/^\d of 5 out of place with the runes worn · \d with your what-ifs$/);
  const editorWorn = /· (\d) of 5 with the runes worn/;
  await line.click();
  const quoted = (await card.locator('.speed-team-status').textContent())?.match(editorWorn)?.[1];
  await card.getByRole('button', { name: 'Close' }).click();
  await expect(line.locator('.speed-summary-state')).toHaveText(new RegExp(`^${quoted} of 5 out of place with the runes worn`));
  await expect(line.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'bad');
  await expect(line.getByRole('img', { name: 'leader' })).toHaveCount(1);
  expectSameHeight((await box(line)).height, lineBox.height);

  /* Names too long for one line wrap name by name, a name too long for the box
     ends in an ellipsis, and the mark stays inside the box at the right. */
  await line.evaluate((element) => {
    element.querySelectorAll('.speed-summary-name').forEach((name, at) => {
      name.textContent = at === 0 ? 'An extraordinarily long nickname that cannot possibly fit on any line at all, however wide the column grows' : `Long nickname number ${at}`;
    });
  });
  const longBox = await box(line);
  const markBox = await box(line.locator('.speed-summary-mark'));
  expect(await line.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(markBox.x + markBox.width).toBeLessThanOrEqual(longBox.x + longBox.width);
  expect(await line.locator('.speed-summary-name').first().evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await line.screenshot({ path: testInfo.outputPath('speed-line-long-names.png') });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('speed-page-out-of-tune.png') });

  /* Everything stated survives a reload. */
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('button', { name: /^Giant's Keep team #1:/ }).click();
  const reloaded = page.getByRole('dialog', { name: "Giant's Keep team #1" });
  await expect(reloaded.getByLabel("What-if display speed for Megan (2A) in Giant's Keep team #1")).toHaveValue('120');
  await expect(reloaded.getByLabel('Leader')).toHaveValue('3');
  await expect(reloaded.getByRole('checkbox', { name: 'Add speed margin' })).toBeChecked();

  await reloaded.getByRole('button', { name: 'Close' }).click();

  /* Teams gather under their dungeon, in the game's order of dungeons, numbered within each. */
  async function addDungeonTeam(dungeon: string, monsters: string[]) {
    await addButton.click();
    const draft = page.getByRole('dialog');
    await draft.getByLabel('Dungeon', { exact: true }).selectOption({ label: dungeon });
    for (const name of monsters) await draft.getByLabel(/^Add a monster to /).selectOption({ label: name });
    await draft.getByRole('button', { name: 'Add this team' }).click();
    await expect(draft).toHaveCount(0);
  }
  await addDungeonTeam('Necropolis', ['Veromos', 'Bernard (2A)']);
  await addDungeonTeam("Giant's Keep", ['Lushen #2']);
  await expect(dungeons.locator('.speed-group-title')).toHaveText(["Giant's Keep", 'Necropolis']);
  await expect(dungeons.getByRole('button', { name: /^Giant's Keep team #2:/ })).toBeVisible();
  await expect(dungeons.getByRole('button', { name: /^Necropolis team #1:/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('speed-page-three-teams.png') });

  /* Removing a team takes its line, and its dungeon's heading with the last one. */
  await dungeons.getByRole('button', { name: /^Necropolis team #1:/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove team' }).click();
  await expect(dungeons.locator('.speed-group-title')).toHaveText(["Giant's Keep"]);
  await expect(addButton).toBeFocused();
});

test('arena teams are numbered, face a worst-case enemy, and rules reach them', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('speed-account.json')).toBeVisible();
  await openSpeedTuning(page);

  /* The page states only the account's totem and how a combat speed is made. */
  const basis = page.getByRole('region', { name: 'What every speed on this page counts' });
  await expect(basis).toContainText('Level 20 of 20 · +15 % of base speed');
  await expect(basis).not.toContainText('Speed buff');

  /* An arena team is drafted in the same overlay, with no dungeon to choose. */
  const arena = page.getByRole('region', { name: 'Arena offence' });
  const addTeam = arena.getByRole('button', { name: 'Add team' });
  await addTeam.click();
  const card = page.getByRole('dialog', { name: 'Arena team #1' });
  await expect(card.getByText('New arena team')).toBeVisible();
  await expect(card.getByLabel('Dungeon', { exact: true })).toHaveCount(0);
  await expect(card.locator('.speed-slot')).toHaveCount(4);
  const add = card.getByLabel('Add a monster to Arena team #1');
  for (const name of ['Bernard (2A)', 'Lushen #1', 'Lushen #2', 'Megan (2A)']) await add.selectOption({ label: name });
  await expect(add).toHaveCount(0);
  await expect(card.getByText('Worst-case enemy at 169 arena speed · first moves after your 3rd turn')).toBeVisible();
  /* Two copies at one arena speed tie on the bar; only field position can settle
     that, so both say so rather than one being called in place. */
  await expect(card.getByText('2 of 4 out of place.')).toBeVisible();
  await expect(card.locator('.speed-slot').nth(1).locator('.speed-verdict')).toHaveText(/^Tied with Lushen #2 · position decides · needs/);
  await expect(card.getByText('No rule reaches this team.')).toBeVisible();
  await card.getByRole('button', { name: 'Add this team' }).click();
  await expect(card).toHaveCount(0);

  await addTeam.click();
  await page.getByRole('dialog', { name: 'Arena team #2' }).getByLabel('Add a monster to Arena team #2').selectOption({ label: 'Veromos' });
  await page.getByRole('dialog').getByRole('button', { name: 'Add this team' }).click();
  const first = arena.getByRole('button', { name: /^Arena team #1:/ });
  await expect(first.locator('.speed-summary-state')).toHaveText('2 of 4 out of place with the runes worn');
  await expect(arena.getByRole('button', { name: /^Arena team #2:/ }).locator('.speed-summary-mark')).toHaveAttribute('data-state', 'good');

  /* A rule is drafted in its own overlay and cannot be added half-chosen. */
  const rulesColumn = page.getByRole('region', { name: 'Rules' });
  await rulesColumn.getByRole('button', { name: 'Add rule' }).click();
  const ruleDialog = page.getByRole('dialog', { name: 'Who moves first' });
  await expect(ruleDialog.getByRole('button', { name: 'Add this rule' })).toBeDisabled();
  await ruleDialog.getByLabel('Moves first').selectOption({ label: 'Megan (2A)' });
  await ruleDialog.getByLabel('Moves after').selectOption({ label: 'Lushen #1' });
  await expect(page.getByRole('heading', { name: 'Megan (2A) before Lushen #1' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('speed-rule-overlay.png') });
  await page.getByRole('dialog').getByRole('button', { name: 'Add this rule' }).click();

  /* The rule's line names the team that breaks it, and that team's editor says so too. */
  const rule = rulesColumn.getByRole('button', { name: /^Rule Megan \(2A\) before Lushen #1:/ });
  await expect(rule.locator('.speed-summary-state')).toHaveText('Arena and dungeons · Arena team #1: your order says otherwise');
  await expect(rule.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'bad');
  await page.screenshot({ path: testInfo.outputPath('speed-arena-and-rules.png'), fullPage: true });
  await first.click();
  await expect(page.getByRole('dialog').getByText('Rules: Megan (2A) before Lushen #1 your order says otherwise')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  /* Narrowed to dungeons, the rule reaches no team; removed, the column is empty again. */
  await rule.click();
  await page.getByRole('dialog').getByRole('checkbox', { name: 'Arena' }).uncheck();
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await expect(rule.locator('.speed-summary-state')).toHaveText('Dungeons · no team holds both yet');
  await expect(rule).toBeFocused();
  await rule.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove rule' }).click();
  await expect(page.getByText('No rules yet.', { exact: false })).toBeVisible();

  /* Removing the first arena team renumbers the one after it. */
  await first.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove team' }).click();
  await expect(arena.getByRole('button', { name: /^Arena team #1:/ })).toContainText('Veromos');
  await expect(arena.getByRole('button', { name: /^Arena team #2:/ })).toHaveCount(0);
  await expect(addTeam).toBeFocused();
});
