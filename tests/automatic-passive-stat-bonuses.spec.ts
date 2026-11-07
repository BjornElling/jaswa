import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const account = fileURLToPath(new URL('./fixtures/automatic-team-bonuses.json', import.meta.url));

async function open(page: Page, withArtifact = false) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  const source = JSON.parse(readFileSync(account, 'utf8'));
  if (withArtifact) {
    /* Six stars, and a type artifact with `[Skill 3] Accuracy`, so Scenario
       holds both lists Leads and bonuses can add under its fields. */
    source.unit_list[0].class = 6;
    source.unit_list[0].artifacts = [{ rid: 7001, type: 2, attribute: 0, unit_style: 1, natural_rank: 5, level: 15, locked: 0,
      pri_effect: [101, 160], occupied_id: 11,
      sec_effects: [[409, 5, 0, 0, 0], [408, 6, 1, 0, 0], [219, 4, 1, 0, 0], [223, 16, 1, 0, 0]] }];
  }
  source.unit_list[0].unit_master_id = 21912; // Shaina
  source.unit_list[1].unit_master_id = 22012; // Boomerang Warrior
  source.unit_list[2].unit_master_id = 14712; // Verdehile
  source.unit_list[2].attribute = 2;
  const secondBoomerang = structuredClone(source.unit_list[1]);
  secondBoomerang.unit_id = 14;
  secondBoomerang.unit_master_id = 22013;
  secondBoomerang.runes = [];
  source.unit_list.push(secondBoomerang);
  source.deck_list[0].unit_id_list = [11, 12, 13, 14, 0];
  source.deck_list[0].leader_unit_id = 13;
  source.deck_list[0].equip.push({ unit_id: 14, rune_id_list: [], artifact_id_list: [] });
  source.deck_list[2].unit_id_list = [11, 12, 13, 0];
  source.deck_list[2].leader_unit_id = 13;
  source.deck_list[2].equip.push({ unit_id: 13, rune_id_list: [], artifact_id_list: [] });
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'automatic-passive-bonuses.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization', exact: true }).click();
}

async function select(page: Page, preset: string, unit: string) {
  await page.getByLabel('Preset', { exact: true }).selectOption(preset);
  await page.getByLabel('Monster', { exact: true }).selectOption(unit);
  await page.getByRole('button', { name: 'Open profile', exact: true }).click();
  return page.getByRole('dialog');
}

/* Every list in the block reads down one column under the typed leads: the
   artifact's lines once sat beside Shaina's in the next lead's narrow cell, and
   their figures spilled into the area block. */
test("Scenario stacks Shaina's bonus and an artifact's Accuracy under the leads, inside the block", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, true);
  await page.getByLabel('Preset', { exact: true }).selectOption('scenario');
  await page.getByLabel('Monster', { exact: true }).selectOption('11');
  const fight = page.getByRole('region', { name: 'Requirements for this calculation' }).locator('.rune-optimization-fight');
  const block = fight.getByRole('group', { name: 'Leads and bonuses' });
  const passive = block.getByRole('list', { name: 'Automatic passive stat bonuses' }).locator('.overlay-team-lead');
  const artifact = block.getByRole('list', { name: 'Artifact skill accuracy' }).locator('.overlay-team-lead');
  await expect(passive).toHaveCount(1);
  await expect(artifact).not.toHaveCount(0);
  const boxes = await block.locator('.overlay-team-lead').evaluateAll((rows) => rows.map((row) => {
    const box = row.getBoundingClientRect();
    const value = row.querySelector('.overlay-team-lead-value')!.getBoundingClientRect();
    return { x: box.x, top: box.y, bottom: box.bottom, statX: row.querySelector('.overlay-team-lead-stat')!.getBoundingClientRect().x, valueRight: value.right };
  }));
  const area = await fight.locator('.rune-optimization-area').evaluate((element) => element.getBoundingClientRect().x);
  for (let at = 1; at < boxes.length; at += 1) {
    /* Directly under the line before, whichever list it belongs to. */
    expect(boxes[at].top).toBe(boxes[at - 1].bottom);
    expect(boxes[at].statX).toBe(boxes[0].statX);
    expect(boxes[at].valueRight).toBe(boxes[0].valueRight);
  }
  for (const box of boxes) expect(box.valueRight).toBeLessThan(area);
  await page.screenshot({ path: testInfo.outputPath('scenario-passive-and-artifact.png') });
});

const accuracy = (dialog: Locator) => dialog.locator('.stat-range[data-figure="acc"] .overlay-stat-current');

test('Shaina adds ACC to herself and each Boomerang Warrior in her preset only', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);

  let dialog = await select(page, 'scenario', '13');
  const passiveList = dialog.getByRole('list', { name: 'Automatic passive stat bonuses' });
  await expect(passiveList).toHaveCount(0);
  await expect(accuracy(dialog).locator('[title]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('passive-bonus-empty.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  dialog = await select(page, 'scenario', '11');
  const shainaSolo = dialog.getByRole('list', { name: 'Automatic passive stat bonuses' });
  await expect(shainaSolo.locator('.overlay-team-lead-stat')).toHaveText(['ACC']);
  await expect(shainaSolo.locator('.overlay-team-lead-value')).toHaveText(['+25']);
  await expect(accuracy(dialog).locator('[title]')).toHaveAttribute('title', /Shaina passive: Adds \+25 ACC points/);
  await page.screenshot({ path: testInfo.outputPath('shaina-scenario-self.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  dialog = await select(page, 'deck-1-2', '11');
  const shainaPresetRows = dialog.getByRole('list', { name: 'Leads and bonuses' }).locator('.overlay-team-lead');
  await expect(shainaPresetRows.locator('.overlay-team-lead-stat').filter({ hasText: 'ACC' })).toHaveCount(1);
  await expect(accuracy(dialog).locator('[title]')).toHaveAttribute('title', /Shaina passive: Adds \+25 ACC points/);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  dialog = await select(page, 'deck-1-3', '12');
  const oneWarriorList = dialog.getByRole('list', { name: 'Leads and bonuses' });
  const oneWarriorRows = oneWarriorList.locator('.overlay-team-lead');
  await expect(oneWarriorRows.locator('.overlay-team-lead-stat')).toHaveText(['SPD', 'ACC']);
  await expect(oneWarriorRows.locator('.overlay-team-lead-value')).toHaveText(['28%', '+25']);
  const columns = await oneWarriorRows.evaluateAll((rows) => rows.map((row) => {
    const stat = row.querySelector('.overlay-team-lead-stat')!.getBoundingClientRect();
    const value = row.querySelector('.overlay-team-lead-value')!.getBoundingClientRect();
    return { y: row.getBoundingClientRect().y, statX: stat.x, valueX: value.x };
  }));
  expect(columns[1].y - columns[0].y).toBe(24);
  expect(columns[1].statX).toBe(columns[0].statX);
  expect(columns[1].valueX).toBe(columns[0].valueX);
  await expect(accuracy(dialog).locator('[title]')).toHaveAttribute('title', /Shaina passive: Adds \+25 ACC points/);
  const oneWarrior = await accuracy(dialog).locator('[title] > [aria-hidden="true"]').textContent();
  expect(oneWarrior).toBe('(+25)');
  await page.screenshot({ path: testInfo.outputPath('shaina-one-boomerang.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  dialog = await select(page, 'deck-1-1', '12');
  const twoWarriorRows = dialog.getByRole('list', { name: 'Leads and bonuses' }).locator('.overlay-team-lead');
  await expect(twoWarriorRows.locator('.overlay-team-lead-stat')).toHaveText(['SPD', 'ACC']);
  await expect(twoWarriorRows.locator('.overlay-team-lead-value')).toHaveText(['28%', '+25']);
  expect(await accuracy(dialog).locator('[title] > [aria-hidden="true"]').textContent()).toBe('(+35)');
  await expect(accuracy(dialog).locator('[title]')).toHaveAttribute('title', /Shaina passive: Adds \+25 ACC points/);
  await page.screenshot({ path: testInfo.outputPath('shaina-two-boomerangs-first.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  dialog = await select(page, 'deck-1-1', '14');
  const secondWarriorRows = dialog.getByRole('list', { name: 'Leads and bonuses' }).locator('.overlay-team-lead');
  await expect(secondWarriorRows.locator('.overlay-team-lead-stat')).toHaveText(['SPD', 'ACC']);
  await expect(secondWarriorRows.locator('.overlay-team-lead-value')).toHaveText(['28%', '+25']);
  expect(await accuracy(dialog).locator('[title] > [aria-hidden="true"]').textContent()).toBe('(+35)');
  await page.screenshot({ path: testInfo.outputPath('shaina-two-boomerangs-second.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  dialog = await select(page, 'deck-1-1', '13');
  await expect(dialog.getByRole('list', { name: 'Leads and bonuses' }).getByTitle(/Shaina's passive/)).toHaveCount(0);
  await expect(accuracy(dialog).locator('[title]')).not.toHaveAttribute('title', /Shaina passive/);
});
