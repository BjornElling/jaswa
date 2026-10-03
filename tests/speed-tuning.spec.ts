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

/* The page's one Add opens a menu of the three things it holds. */
async function addFromMenu(page: Page, item: 'Dungeon team' | 'Arena team' | 'Rule') {
  await page.getByRole('button', { name: 'Add…' }).click();
  await page.getByRole('menu', { name: 'Add' }).getByRole('menuitem', { name: item }).click();
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
  await expect(page.getByRole('button', { name: 'Add…' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('speed-no-import.png') });
});

test('tunes a dungeon team, explains every miss, and keeps the card still', async ({ page }, testInfo) => {
  /* Long on purpose — a whole team built, edited, saved and reloaded — and run
     beside every other spec against one dev server. Twenty seconds on a quiet
     machine ran past the default thirty under load, always at the same late
     step, so the budget is set for the load rather than the quiet. */
  test.setTimeout(90_000);
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('speed-account.json')).toBeVisible();
  await openSpeedTuning(page);

  /* Nothing is shipped: the page opens empty, with the account's own totem. */
  await expect(page.getByRole('region', { name: 'Sky Tribe Totem' })).toContainText('Level 20 of 20+15 % of base speed');
  await expect(page.getByText('No dungeon teams yet.', { exact: true })).toBeVisible();
  await expect(page.getByText('No arena teams yet.', { exact: true })).toBeVisible();
  await expect(page.getByText('No rules yet.', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('speed-empty.png') });

  /* A dungeon team is drafted in an overlay; nothing reaches the page until it is added. */
  const dungeons = page.getByRole('region', { name: 'Dungeons' });
  const addButton = page.getByRole('button', { name: 'Add…' });
  const headBefore = await box(dungeons.getByRole('heading', { name: 'Dungeons' }));
  await addFromMenu(page, 'Dungeon team');
  /* A draft is named as new until it is saved; the dungeon is chosen under the title. */
  const draft = page.getByRole('dialog', { name: 'New dungeon team' });
  await expect(draft.getByRole('heading', { name: 'New dungeon team' })).toBeVisible();
  await expect(draft.locator('.speed-slot')).toHaveCount(5);
  /* No dungeon is chosen yet, and saving says that is what it waits for. */
  const dungeonChoice = draft.getByLabel('Select dungeon');
  await expect(dungeonChoice).toHaveValue('');
  const saveDraft = draft.getByRole('button', { name: 'Add this team' });
  await expect(saveDraft).toBeDisabled();
  await expect(saveDraft).toHaveAttribute('title', 'Choose a dungeon to save this team');
  /* Every stage has its row before any monster is added. */
  const enemyTurns = draft.getByRole('region', { name: 'Enemy cut in' });
  await expect(enemyTurns.locator('tbody tr')).toHaveCount(4);
  await expect(enemyTurns.locator('tbody tr').nth(1)).toHaveText('2—');
  await expect(draft.getByRole('button', { name: 'Ticks' })).toBeDisabled();
  await expect(enemyTurns.locator('.speed-cut-mark[data-state]')).toHaveCount(0);
  const emptyBox = await box(draft.locator('.speed-team-editor'));
  await page.screenshot({ path: testInfo.outputPath('speed-overlay-empty.png') });

  /* Choosing a dungeon moves nothing beside the dropdown, and the draft is for it. */
  const choiceBox = await box(dungeonChoice);
  const facts = draft.locator('.speed-dungeon-facts');
  const factsBox = await box(facts);
  await expect(facts).toBeHidden();
  await dungeonChoice.selectOption({ label: 'Necropolis' });
  /* The floor's facts fill their reserved place beside the choice. */
  await expect(facts).toBeVisible();
  await expect(facts).toContainText(/Fastest enemy\d+ dungeon speedAcc needed\d+%/);
  expect(await box(facts)).toEqual(factsBox);
  await expect(draft.getByLabel('Add a monster to Necropolis team #1')).toBeVisible();
  await expect(saveDraft).toHaveAttribute('title', 'Add a monster to save this team');
  expect(await box(dungeonChoice)).toEqual(choiceBox);
  await dungeonChoice.selectOption({ label: "Giant's Keep" });
  const card = draft;

  /* Monsters join in the slot they are added from, whatever their speed. */
  const add = card.getByLabel("Add a monster to Giant's Keep team #1");
  for (const name of ['Megan (2A)', 'Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile']) {
    await add.selectOption({ label: name });
  }
  const names = card.locator('.speed-monster .monster-name');
  await expect(names).toHaveText(['Megan (2A)', 'Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);

  /* Dragging Megan down slides the others up to where the drop leaves them,
     numbered as drawn, before anything is committed; the drop commits it. */
  const slots = card.locator('.speed-slot');
  const slotBoxes = await Promise.all([0, 1, 2, 3, 4].map((at) => box(slots.nth(at).locator('.speed-monster'))));
  /* Taken by its number: the name is a link, and a link is not a handle. */
  const handle = await box(slots.nth(0).locator('.speed-order'));
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + (slotBoxes[4].y - slotBoxes[0].y) * step / 12);
  }
  await expect(card.locator('.speed-order')).toHaveText(['5', '1', '2', '3', '4']);
  await expect(names).toHaveText(['Megan (2A)', 'Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);
  /* Drawn aside, not laid out again: the slide moves the rows, never the editor. */
  await expect.poll(async () => Math.abs((await box(slots.nth(1).locator('.speed-monster'))).y - slotBoxes[0].y)).toBeLessThanOrEqual(1);
  await expect.poll(async () => Math.abs((await box(slots.nth(0).locator('.speed-monster'))).y - slotBoxes[4].y)).toBeLessThanOrEqual(1);
  expectSameHeight((await box(card.locator('.speed-team-editor'))).height, emptyBox.height);
  await card.screenshot({ path: testInfo.outputPath('speed-team-drag-preview.png') });
  /* One more step, so the drop lands on a target the drag is still over. */
  await page.mouse.move(handle.x + handle.width / 2 + 1, handle.y + handle.height / 2 + slotBoxes[4].y - slotBoxes[0].y);
  await page.mouse.up();
  await expect(names).toHaveText(['Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile', 'Megan (2A)']);
  await expect(card.locator('.speed-order')).toHaveText(['1', '2', '3', '4', '5']);
  await expect(card.locator('.speed-combat')).toHaveText(['170', '119', '115', '114', '112']);
  /* No line sums the team up: each slot says its own verdict. All are in place;
     the three stage 2's enemy gets in before say so last, in yellow, and the
     one a display speed of its own would make perfect quotes its range. */
  await expect(card.locator('.speed-verdict[data-state="bad"]')).toHaveCount(0);
  await expect(card.locator('.speed-verdict').first()).toHaveText('In place · moves 1st');
  await expect(card.locator('.speed-verdict').first()).toHaveAttribute('data-state', 'good');
  await expect(card.locator('.speed-verdict[data-state="warn"]')).toHaveText([
    /^In place · moves 3rd · needs exactly \d+ display speed · enemy cuts in \(stage 2\)$/,
    'In place · moves 4th · enemy cuts in (stage 2)',
    'In place · moves 5th · enemy cuts in (stage 2)',
  ]);
  await expect(card.locator('.speed-team-status')).toHaveCount(0);
  /* Each stage names the turn its first enemy follows: whose, and which of
     theirs — a first turn too, since another stage's is a second. */
  await expect(enemyTurns.locator('tbody tr').nth(1)).toHaveText('2Lushen #1 (1st turn)');
  await expect(enemyTurns.locator('tbody tr').first().locator('.speed-enemy-after')).toHaveText('Lushen #1 (2nd turn)');
  /* Each stage ends on whether its first enemy moves before every monster has moved. */
  const cutMarks = enemyTurns.locator('.speed-cut-mark');
  await expect(cutMarks.nth(0)).toHaveAttribute('data-state', 'clear');
  await expect(cutMarks.nth(1)).toHaveAttribute('data-state', 'cut');
  await expect(enemyTurns.getByRole('img', { name: 'Can cut in before Veromos, Verdehile, Megan (2A)' })).toBeVisible();
  await expect(enemyTurns.getByRole('img', { name: 'Cannot cut in' })).toHaveCount(3);
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
  /* In order, but stage 2's enemies get a turn before the last monster's first,
     read off the same ticks the Ticks view draws. */
  await expect(line.locator('.speed-summary-state')).toHaveText('Turn order holds · Enemy can cut in (stage 2)');
  await expect(line.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'good');
  const lineBox = await box(line);
  expectSameHeight((await box(dungeons.getByRole('heading', { name: 'Dungeons' }))).y, headBefore.y);
  await page.screenshot({ path: testInfo.outputPath('speed-page-one-team.png') });
  await line.click();
  /* Saved, the team is named by what it is. */
  const saved = page.getByRole('dialog', { name: "Giant's Keep team #1" });
  await expect(saved.getByRole('heading', { name: "Giant's Keep team #1" })).toBeVisible();

  /* Megan asked to move second. Each monster looks only up the order: Megan
     follows Bernard, so she is in place, slow as she is, and the three below
     her that move first are the ones out of place, each with its own interval. */
  for (let step = 0; step < 3; step += 1) await saved.getByRole('button', { name: 'Move Megan (2A) earlier' }).click();
  const megan = saved.locator('.speed-slot').nth(1);
  /* In place, but the enemy gets in before her: yellow, her perfect range
     quoted, and the warning last. */
  await expect(megan.locator('.speed-verdict')).toHaveText(/^In place · moves 5th · needs \d+–\d+ display speed · enemy cuts in \(stage 2\)$/);
  await expect(megan.locator('.speed-verdict')).toHaveAttribute('data-state', 'warn');
  /* Red stays red with the warning after its fault. */
  await expect(saved.locator('.speed-slot').nth(3).locator('.speed-verdict')).toHaveText(/^Too fast · moves 3rd · enemy cuts in \(stage 2\)$/);
  await expect(saved.locator('.speed-verdict[data-state="bad"]')).toHaveCount(3);
  expectSameHeight((await box(saved.locator('.speed-team-editor'))).height, emptyBox.height);
  await saved.screenshot({ path: testInfo.outputPath('speed-team-out-of-order.png') });

  /* A what-if starts empty, fixes the whole team from inside the interval, and
     empty goes back to the import. */
  const whatIf = saved.getByLabel("What-if display speed for Megan (2A) in Giant's Keep team #1");
  await expect(whatIf).toHaveValue('');
  await expect(whatIf).not.toHaveAttribute('placeholder');
  await whatIf.fill('120');
  await expect(saved.locator('.speed-verdict[data-state="bad"]')).toHaveCount(0);
  await expect(megan.locator('.speed-combat')).toHaveText('135');
  await whatIf.fill('');
  await expect(saved.locator('.speed-verdict[data-state="bad"]')).toHaveCount(3);
  await whatIf.fill('120');

  /* A leader counts only where it reaches; a dungeon lead does here. */
  const verdehileLeads = saved.getByRole('checkbox', { name: "Verdehile leads Giant's Keep team #1" });
  const verdehileLead = saved.locator('.speed-slot').filter({ has: page.getByRole('checkbox', { name: "Verdehile leads Giant's Keep team #1" }) }).locator('.speed-leader-skill');
  await expect(verdehileLead).toHaveText('SPD 28 % · Dungeon');
  await expect(verdehileLead).toHaveAttribute('data-state', 'idle');
  const leaderBox = await box(verdehileLead);
  await verdehileLeads.check();
  await expect(verdehileLead).toHaveAttribute('data-state', 'chosen');
  expect(await box(verdehileLead)).toEqual(leaderBox);
  /* Every lead is named, speed or not; one that does not reach a dungeon is marked. */
  const meganLead = saved.locator('.speed-slot').filter({ has: page.getByRole('checkbox', { name: "Megan (2A) leads Giant's Keep team #1" }) })
    .locator('.speed-leader-skill');
  await expect(meganLead).toHaveText('ATK 21 % · Arena');
  /* Only a chosen lead is judged: unchosen it is as quiet as any other. */
  await expect(meganLead).toHaveAttribute('data-state', 'idle');
  const meganLeadBox = await box(meganLead);
  await saved.getByRole('checkbox', { name: "Megan (2A) leads Giant's Keep team #1" }).check();
  await expect(meganLead).toHaveAttribute('data-state', 'bad');
  expect(await box(meganLead)).toEqual(meganLeadBox);
  await verdehileLeads.check();
  await expect(meganLead).toHaveAttribute('data-state', 'idle');
  await expect(saved.locator('.speed-combat').first()).toHaveText('201');

  /* Every slot states the display speeds that give it a perfect place, a
     slot none can give a dash. */
  await expect(saved.getByRole('columnheader', { name: 'Interval' })).toBeVisible();
  await expect(saved.locator('.speed-slot-range')).toHaveText(Array(5).fill(/^(\d+ – \d+|\d+\+|—)$/));
  await expect(saved.locator('.speed-slot-range').first()).toHaveText(/^(\d+\+|—)$/);
  expectSameHeight((await box(saved.locator('.speed-team-editor'))).height, emptyBox.height);

  /* The turn order opens over the editor, draws every tick until each member
     has had a second turn, keeps its size between views, and Escape closes only it. */
  const opener = saved.getByRole('button', { name: 'Ticks' });
  await opener.click();
  const dialog = page.locator('.speed-turn-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Stage 1' })).toHaveAttribute('aria-pressed', 'true');
  const shown = dialog.locator('.speed-lanes[data-active]');
  await expect(shown.locator('.speed-lane-turn').first()).toHaveText('1');
  await expect(shown.getByRole('rowheader', { name: /^Enemy \d/ })).toHaveCount(4);
  for (const name of ['Bernard (2A)', 'Megan (2A)', 'Lushen #1', 'Veromos', 'Verdehile']) {
    const lane = shown.getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) }) });
    expect(await lane.getByRole('cell', { name: /: turn \d+ at/ }).count()).toBeGreaterThanOrEqual(2);
  }
  const panelBox = await box(dialog);
  await page.screenshot({ path: testInfo.outputPath('speed-turn-order-stage.png') });
  await dialog.getByRole('button', { name: 'Your team alone' }).click();
  await expect(shown.getByRole('rowheader', { name: /^Enemy/ })).toHaveCount(0);
  await expect(shown.getByRole('rowheader')).toHaveCount(5);
  expect(await box(dialog)).toEqual(panelBox);
  await page.screenshot({ path: testInfo.outputPath('speed-turn-order.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(saved).toBeVisible();
  await expect(opener).toBeFocused();

  /* The line judges the runes worn, never the experiment: Megan's what-if fixes
     the editor's reading and is saved with the team, but the page does not
     read it, and the leader is marked. */
  await saved.getByRole('button', { name: 'Save changes' }).click();
  await expect(line).toBeFocused();
  /* The names follow the order asked for, uncoloured; only the mark and the sentence change. */
  await expect(line.locator('.speed-summary-name')).toHaveText(['Bernard (2A)', 'Megan (2A)', 'Lushen #1', 'Veromos', 'Verdehile']);
  /* With the runes worn, the three below Megan still move before her. */
  await expect(line.locator('.speed-summary-state')).toHaveText('3 of 5 out of place');
  /* Opened again, the what-if is still there, and the overlay reads it. */
  await line.click();
  await expect(saved.getByLabel("What-if display speed for Megan (2A) in Giant's Keep team #1")).toHaveValue('120');
  await expect(saved.locator('.speed-verdict[data-state="bad"]')).toHaveCount(0);
  await saved.getByRole('button', { name: 'Close' }).click();
  await expect(line.locator('.speed-summary-state')).toHaveText('3 of 5 out of place');
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
  await expect(reloaded.getByRole('checkbox', { name: "Verdehile leads Giant's Keep team #1" })).toBeChecked();

  await reloaded.getByRole('button', { name: 'Close' }).click();

  /* Teams gather under their dungeon, in the game's order of dungeons, numbered within each. */
  async function addDungeonTeam(dungeon: string, monsters: string[]) {
    await addFromMenu(page, 'Dungeon team');
    const draft = page.getByRole('dialog');
    await draft.getByLabel('Select dungeon').selectOption({ label: dungeon });
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
  await page.getByRole('dialog', { name: 'Remove Necropolis team #1?' }).getByRole('button', { name: 'Remove team' }).click();
  await expect(dungeons.locator('.speed-group-title')).toHaveText(["Giant's Keep"]);
  await expect(addButton).toBeFocused();
});

test('arena teams are numbered and face a worst-case enemy', async ({ page }, testInfo) => {
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('speed-account.json')).toBeVisible();
  await openSpeedTuning(page);

  /* Above the columns the page states only what belongs to the account: the totem. */
  const basis = page.getByRole('region', { name: 'Sky Tribe Totem' });
  await expect(basis.locator('.speed-basis-level')).toHaveText('Level 20 of 20');
  await expect(basis.locator('.speed-basis-bonus')).toHaveText('+15 % of base speed');
  await expect(basis).not.toContainText('Speed buff');

  /* An arena team is drafted in the same overlay, with no dungeon to choose. */
  const arena = page.getByRole('region', { name: 'Arena offence' });
  const addTeam = page.getByRole('button', { name: 'Add…' });
  await addFromMenu(page, 'Arena team');
  const card = page.getByRole('dialog', { name: 'New arena team' });
  await expect(card.getByRole('heading', { name: 'New arena team' })).toBeVisible();
  await expect(card.getByLabel('Select dungeon')).toHaveCount(0);
  await expect(card.locator('.speed-slot')).toHaveCount(4);
  const add = card.getByLabel('Add a monster to Arena team #1');
  for (const name of ['Bernard (2A)', 'Lushen #1', 'Lushen #2', 'Megan (2A)']) await add.selectOption({ label: name });
  await expect(add).toHaveCount(0);
  /* A first turn with no later one beside it is not spelled out. */
  await expect(card.getByRole('region', { name: 'Enemy cut in' }).locator('tbody tr')).toHaveText(['Worst caseLushen #2']);
  await expect(card.getByRole('region', { name: 'Enemy cut in' }).getByRole('img', { name: 'Can cut in before Megan (2A)' })).toBeVisible();
  /* Two copies at one arena speed tie on the bar; only field position can settle
     that. The lower one, looking up at the other, says so; the upper one is in
     place, but a tie is not a perfect order, so it quotes the range that
     breaks it. Megan is warned that the worst-case enemy gets in before her,
     and no display speed of hers alone keeps it out: a dash. */
  await expect(card.locator('.speed-verdict:not([data-state="good"])')).toHaveCount(3);
  await expect(card.locator('.speed-slot').nth(1).locator('.speed-verdict')).toHaveText(/^In place · moves 2nd · needs \d+–\d+ display speed$/);
  await expect(card.locator('.speed-slot').nth(2).locator('.speed-verdict')).toHaveText('Tied with Lushen #1 · position decides');
  const megan = card.locator('.speed-slot').nth(3);
  await expect(megan.locator('.speed-verdict')).toHaveText('In place · moves 4th · worst-case enemy cuts in');
  await expect(megan.locator('.speed-verdict')).toHaveAttribute('data-state', 'warn');
  await expect(megan.locator('.speed-slot-range')).toHaveText('—');
  await card.getByRole('button', { name: 'Add this team' }).click();
  await expect(card).toHaveCount(0);

  await addFromMenu(page, 'Arena team');
  await page.getByRole('dialog', { name: 'New arena team' }).getByLabel('Add a monster to Arena team #2').selectOption({ label: 'Veromos' });
  await page.getByRole('dialog').getByRole('button', { name: 'Add this team' }).click();
  const first = arena.getByRole('button', { name: /^Arena team #1:/ });
  await expect(first.locator('.speed-summary-state')).toHaveText('1 of 4 out of place · Enemy can cut in');
  await expect(first.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'bad');
  /* A lone monster always opens before an enemy level with it: the tie is the attacker's. */
  await expect(arena.getByRole('button', { name: /^Arena team #2:/ }).locator('.speed-summary-state')).toHaveText('Turn order holds');
  await expect(arena.getByRole('button', { name: /^Arena team #2:/ }).locator('.speed-summary-mark')).toHaveAttribute('data-state', 'good');
  await page.screenshot({ path: testInfo.outputPath('speed-arena.png'), fullPage: true });

  /* Removing the first arena team renumbers the one after it. */
  await first.click();
  /* Removing is asked once, and the safe answer is the one under the hand. */
  const team = page.getByRole('dialog', { name: 'Arena team #1' });
  const remove = team.getByRole('button', { name: 'Remove team' });
  await remove.click();
  const confirm = page.getByRole('dialog', { name: 'Remove Arena team #1?' });
  await expect(confirm.getByRole('button', { name: 'Keep the team' })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('speed-team-remove-confirm.png') });
  await confirm.getByRole('button', { name: 'Keep the team' }).click();
  await expect(confirm).toHaveCount(0);
  await expect(remove).toBeFocused();
  await remove.click();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(team).toBeVisible();
  await remove.click();
  await confirm.getByRole('button', { name: 'Remove team' }).click();
  await expect(arena.getByRole('button', { name: /^Arena team #1:/ })).toContainText('Veromos');
  await expect(arena.getByRole('button', { name: /^Arena team #2:/ })).toHaveCount(0);
  await expect(addTeam).toBeFocused();
});

test('a rule is a reminder about one monster, judged in the speed forms it is checked in', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('speed-account.json')).toBeVisible();
  await openSpeedTuning(page);

  /* A new rule opens on two lines; nothing can be added until it says something. */
  const rulesColumn = page.getByRole('region', { name: 'Rules' });
  const addRule = page.getByRole('button', { name: 'Add…' });

  /* The menu hangs over the columns: opening it moves nothing, Escape closes it. */
  const columns = page.locator('.speed-columns');
  const columnsBefore = await box(columns);
  await addRule.click();
  await expect(page.getByRole('menu', { name: 'Add' }).getByRole('menuitem')).toHaveText(['Dungeon team', 'Arena team', 'Rule']);
  await expect(page.getByRole('menuitem', { name: 'Dungeon team' })).toBeFocused();
  expect(await box(columns)).toEqual(columnsBefore);
  await page.screenshot({ path: testInfo.outputPath('speed-add-menu.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(addRule).toBeFocused();
  await addFromMenu(page, 'Rule');
  const dialog = page.getByRole('dialog');
  await expect(page.getByRole('dialog', { name: 'New rule' })).toBeVisible();
  await expect(dialog.getByLabel('Chosen monster')).toBeVisible();
  await expect(dialog.getByLabel('Must')).toBeVisible();
  await expect(dialog.getByLabel('This monster')).toHaveCount(0);
  await expect(dialog.getByLabel('This speed')).toHaveCount(0);
  await expect(dialog.locator('.speed-rule-verdict')).toHaveText(['', '', '']);
  await expect(dialog.getByRole('button', { name: 'Add this rule' })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('speed-rule-empty.png') });

  /* What Must names decides the third line, in a row that was already there:
     the speed forms below never move. */
  const where = dialog.getByRole('group', { name: 'Applies to' });
  const still = await box(where);
  await dialog.getByLabel('Chosen monster').selectOption({ label: 'Megan (2A)' });
  await dialog.getByLabel('Must').selectOption({ label: 'Move before' });
  expect(await box(where)).toEqual(still);
  await dialog.getByLabel('This monster').selectOption({ label: 'Lushen #1' });
  await expect(page.getByRole('dialog', { name: 'New rule' })).toBeVisible();
  /* Not held, each form says which way it misses and what would fix it. */
  await expect(dialog.locator('.speed-rule-figures')).toHaveText(['97 against 103', '112 against 119', '112 against 119']);
  await expect(dialog.locator('.speed-rule-verdict')).toHaveText([
    'Too slow · needs 104+ display speed', 'Too slow · needs 105+ display speed', 'Too slow · needs 105+ display speed',
  ]);
  expect(await box(where)).toEqual(still);
  await page.screenshot({ path: testInfo.outputPath('speed-rule-broken.png') });
  await dialog.getByRole('button', { name: 'Add this rule' }).click();
  await expect(dialog).toHaveCount(0);

  /* On the page: the sentence, where it is checked, and the verdict at the edge. */
  const rule = rulesColumn.getByRole('button', { name: /^Rule Megan \(2A\) must move before Lushen #1:/ });
  await expect(rule.locator('.speed-summary-names')).toHaveText('Megan (2A)must move beforeLushen #1');
  await expect(rule.locator('.speed-summary-state')).toHaveText('Display speed, dungeon and arena');
  await expect(rule.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'bad');
  await expect(addRule).toBeFocused();

  /* A figure instead of a monster; unticking the one form that misses makes the rule hold. */
  await rule.click();
  const reopened = await box(where);
  await dialog.getByLabel('Must').selectOption({ label: 'Reach at least' });
  expect(await box(where)).toEqual(reopened);
  await dialog.getByLabel('This speed').fill('100');
  await expect(dialog.locator('.speed-rule-figures')).toHaveText(['97', '112', '112']);
  await expect(dialog.locator('.speed-rule-verdict')).toHaveText(['Too slow · needs 100+ display speed', 'Holds', 'Holds']);
  const verdictBox = await box(dialog.locator('.speed-rule-verdict').first());
  await dialog.getByRole('checkbox', { name: 'Display speed' }).uncheck();
  expect(await box(dialog.locator('.speed-rule-verdict').first())).toEqual(verdictBox);
  await expect(dialog.locator('.speed-rule-check').first().locator('.speed-summary-mark')).toHaveAttribute('data-state', 'none');
  await page.screenshot({ path: testInfo.outputPath('speed-rule-figure.png') });
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  const reached = rulesColumn.getByRole('button', { name: /^Rule Megan \(2A\) must reach at least 100:/ });
  await expect(reached.locator('.speed-summary-state')).toHaveText('Dungeon and arena');
  await expect(reached.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'good');
  await expect(reached).toBeFocused();

  /* A range must run upwards before it can be saved. */
  await reached.click();
  const again = await box(where);
  await dialog.getByLabel('Must').selectOption({ label: 'Stay between' });
  expect(await box(where)).toEqual(again);
  await dialog.getByLabel('Lowest').fill('120');
  await dialog.getByLabel('Highest').fill('110');
  await expect(dialog.getByText('The lower figure goes first')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await dialog.getByLabel('Lowest').fill('105');
  await page.screenshot({ path: testInfo.outputPath('speed-rule-range.png') });
  /* Bare runes already carry Megan past 110 in combat, which the verdict says rather than inventing a fix. */
  await expect(dialog.locator('.speed-rule-verdict')).toHaveText([
    'Too slow · needs 105–110 display speed',
    'Too fast', 'Too fast',
  ]);

  /* Ticked nowhere, saving asks first; going back keeps the draft, saving anyway keeps the rule. */
  await dialog.getByRole('checkbox', { name: 'Dungeon speed' }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Arena speed' }).uncheck();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  const confirm = page.getByRole('dialog', { name: 'Save a rule that checks nothing?' });
  await expect(confirm).toContainText('This rule has no effect until at least one of display speed, dungeon speed or arena speed is ticked.');
  await expect(confirm.getByRole('button', { name: 'Back to the rule' })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('speed-rule-confirm.png') });
  await confirm.getByRole('button', { name: 'Back to the rule' }).click();
  await expect(confirm).toHaveCount(0);
  const ranged = page.getByRole('dialog', { name: 'Megan (2A) must stay between 105 and 110' });
  await expect(ranged).toBeVisible();
  await ranged.getByRole('button', { name: 'Save changes' }).click();
  await confirm.getByRole('button', { name: 'Save anyway' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const nowhere = rulesColumn.getByRole('button', { name: /^Rule Megan \(2A\) must stay between 105 and 110:/ });
  await expect(nowhere.locator('.speed-summary-state')).toHaveText('Checked nowhere yet');
  await expect(nowhere.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'none');
  await page.screenshot({ path: testInfo.outputPath('speed-rules-page.png'), fullPage: true });

  /* A rule reaches no team: a team's editor says nothing of it. */
  await addFromMenu(page, 'Arena team');
  await page.getByRole('dialog').getByLabel('Add a monster to Arena team #1').selectOption({ label: 'Megan (2A)' });
  await expect(page.getByRole('dialog')).not.toContainText('rule');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  /* Removed, the column is empty again. */
  await nowhere.click();
  /* Removing is asked once, and the safe answer is the one under the hand. */
  const remove = ranged.getByRole('button', { name: 'Remove rule' });
  await remove.click();
  const removing = page.getByRole('dialog', { name: 'Remove this rule?' });
  await expect(removing).toContainText('“Megan (2A) must stay between 105 and 110”');
  await expect(removing.getByRole('button', { name: 'Keep the rule' })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('speed-rule-remove-confirm.png') });
  await removing.getByRole('button', { name: 'Keep the rule' }).click();
  await expect(removing).toHaveCount(0);
  await expect(remove).toBeFocused();
  await remove.click();
  await page.keyboard.press('Escape');
  await expect(removing).toHaveCount(0);
  await expect(ranged).toBeVisible();
  await remove.click();
  await removing.getByRole('button', { name: 'Remove rule' }).click();
  await expect(page.getByText('No rules yet.', { exact: true })).toBeVisible();
  await expect(addRule).toBeFocused();
});

test('each slot states the display speeds that hold it, and a what-if is selected rather than dragged', async ({ page }, testInfo) => {
  /* Long on purpose — a whole team built, edited, saved and reloaded — and run
     beside every other spec against one dev server. Twenty seconds on a quiet
     machine ran past the default thirty under load, always at the same late
     step, so the budget is set for the load rather than the quiet. */
  test.setTimeout(90_000);
  await freshWorkspace(page);
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('speed-account.json')).toBeVisible();
  await openSpeedTuning(page);
  await addFromMenu(page, 'Dungeon team');
  const draft = page.getByRole('dialog', { name: 'New dungeon team' });
  await draft.getByLabel('Select dungeon').selectOption({ label: "Giant's Keep" });
  for (const name of ['Bernard (2A)', 'Lushen #1', 'Veromos', 'Verdehile', 'Megan (2A)']) {
    await draft.getByLabel("Add a monster to Giant's Keep team #1").selectOption({ label: name });
  }
  /* What a booster's turn hands the next one hangs on the line below it, and takes no room. */
  const bernard = draft.locator('.speed-slot').first();
  const slotBox = await box(bernard);
  /* Only the attack bar it hands the whole team: a speed buff is not a push from one turn to the next. */
  await expect(bernard.locator('.speed-boost-tag')).toHaveText('+34.5 % ATB');
  expectSameHeight((await box(bernard)).height, slotBox.height);

  /* In order, every member is in place. The first two have perfect places;
     the third has exactly one display speed that keeps stage 2's enemy out,
     and behind it none does, so those slots are dashes. */
  await expect(draft.locator('.speed-verdict[data-state="bad"]')).toHaveCount(0);
  const ranges = draft.locator('.speed-slot-range');
  await expect(ranges).toHaveText([/^\d+\+$/, /^\d+ – \d+$/, /^(\d+) – \1$/, '—', '—']);

  /* Out of order, the order fault is red on the monster that has it — the one
     below that moves first, never the slower one above it. */
  await draft.getByRole('button', { name: 'Move Megan (2A) earlier' }).click();
  const meganVerdict = draft.locator('.speed-slot').filter({ hasText: 'Megan (2A)' }).locator('.speed-verdict');
  const verdehileVerdict = draft.locator('.speed-slot').filter({ hasText: 'Verdehile' }).locator('.speed-verdict');
  await expect(meganVerdict).not.toHaveAttribute('data-state', 'bad');
  await expect(verdehileVerdict).toHaveAttribute('data-state', 'bad');
  await expect(verdehileVerdict).toHaveText(/^Too fast/);
  await draft.getByRole('button', { name: 'Move Megan (2A) later' }).click();

  /* Pressing in a what-if and moving selects its digits; the slot stays put. */
  const whatIf = draft.getByLabel("What-if display speed for Lushen #1 in Giant's Keep team #1");
  await whatIf.fill('123');
  const field = await box(whatIf);
  await page.mouse.move(field.x + field.width - 4, field.y + field.height / 2);
  await page.mouse.down();
  await page.mouse.move(field.x + 4, field.y + field.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  await expect(draft.locator('.speed-slot[data-dragging]')).toHaveCount(0);
  expect(await whatIf.evaluate((input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!)).toBeGreaterThan(0);
  await whatIf.fill('');

  /* On the page the team in order wears the tick, the stage it is cut in at named. */
  await draft.getByRole('button', { name: 'Add this team' }).click();
  const line = page.getByRole('button', { name: /^Giant's Keep team #1:/ });
  await expect(line.locator('.speed-summary-state')).toHaveText('Turn order holds · Enemy can cut in (stage 2)');
  await expect(line.locator('.speed-summary-mark')).toHaveAttribute('data-state', 'good');
  await line.screenshot({ path: testInfo.outputPath('speed-line-in-order.png') });
});
