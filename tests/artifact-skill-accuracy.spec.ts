import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Skill Accuracy from an engraved artifact is named under *Leads and bonuses*
 * and never counted (`artifact-skill-accuracy.ts`), and a team's overlay leads
 * to its preset on Presets. The speed fixture's leaders are described in
 * `team-leads.spec.ts`; copy 1 carries a type artifact with `[Skill 2]` and
 * `[Skill 3] Accuracy`, copy 3 none.
 */
const fixture = fileURLToPath(new URL('./fixtures/speed-account.json', import.meta.url));
const deck = (type: number, seq: number, members: number[], leader: number) =>
  ({ deck_type: type, deck_seq: seq, unit_id_list: members, leader_unit_id: leader, equip: null });

async function open(page: Page, withArtifact = true, replacing = false) {
  const source = JSON.parse(readFileSync(fixture, 'utf8'));
  source.deck_list = [deck(3, 1, [1, 3, 0, 0, 0, 0], 1), deck(3, 2, [2, 6, 0, 0, 0, 0], 2), deck(3, 3, [6, 4, 0, 0, 0, 0], 6)];
  /* Six stars, as the game asks before a monster takes artifacts. */
  const unit = source.unit_list.find((entry: { unit_id: number }) => entry.unit_id === 1);
  unit.class = 6;
  if (withArtifact) {
    unit.artifacts = [{ rid: 7001, type: 2, attribute: 0, unit_style: 1, natural_rank: 5, level: 15, locked: 0,
      pri_effect: [101, 160], occupied_id: 1,
      sec_effects: [[409, 5, 0, 0, 0], [408, 6, 1, 0, 0], [219, 4, 1, 0, 0], [223, 16, 1, 0, 0]] }];
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'artifact-accuracy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  if (replacing) await page.getByRole('button', { name: 'Replace data', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Optimization', exact: true }).click();
}

const accuracyLines = (scope: ReturnType<Page['locator']>) => scope.locator('.overlay-team-lead[data-source="artifact"]');

test('a skill Accuracy line is named under the leads, in their columns, and counted nowhere', async ({ page }, testInfo) => {
  await open(page);
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-3-1');
  await page.getByLabel('Monster', { exact: true }).selectOption('1');
  const fight = page.getByRole('region', { name: 'Requirements for this calculation' }).locator('.rune-optimization-fight');
  const leads = fight.getByRole('list', { name: 'Leads and bonuses' });
  /* Under the three leads, by skill, with the artifact's mark where a face stands. */
  await expect(leads.getByRole('listitem')).toHaveText(['ATK30%', 'ATK21%', 'HP33%', 'ACC (S2)+6%', 'ACC (S3)+5%']);
  await expect(accuracyLines(fight).locator('.artifact-glyph')).toHaveCount(2);
  await expect(accuracyLines(fight).first()).toHaveAttribute('title', /Shown only/);
  /* One column line for faces, stats and figures alike. */
  const columns = await leads.getByRole('listitem').evaluateAll((lines) => lines.map((line) =>
    [...line.children].slice(0, 3).map((cell) => Math.round(cell.getBoundingClientRect().x))));
  expect(new Set(columns.map((line) => line.join(','))).size).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('optimization-accuracy.png') });

  /* The monster overlay's preset reads the same lines, and the ACC range names no artifact. */
  await page.getByRole('button', { name: 'Open profile', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('list', { name: 'Leads and bonuses' }).getByRole('listitem'))
    .toHaveText(['ATK30%', 'ATK21%', 'HP33%', 'ACC (S2)+6%', 'ACC (S3)+5%']);
  await expect(dialog.locator('.stat-range[data-figure="acc"]').getByTitle(/Skill/)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('overlay-accuracy.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  /* Scenario's typed leads keep their fields, with the artifact's lines beneath. */
  await page.getByLabel('Preset', { exact: true }).selectOption('scenario');
  await page.getByLabel('Monster', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Open profile', exact: true }).click();
  await expect(dialog.getByRole('group', { name: 'Leads and bonuses' }).getByRole('spinbutton')).toHaveCount(4);
  await expect(dialog.getByRole('list', { name: 'Artifact skill accuracy' }).getByRole('listitem'))
    .toHaveText(['ACC (S2)+6%', 'ACC (S3)+5%']);
  await page.screenshot({ path: testInfo.outputPath('scenario-accuracy.png') });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  /* A copy without such an artifact adds no line. */
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-3-1');
  await page.getByLabel('Monster', { exact: true }).selectOption('3');
  await expect(fight.getByRole('list', { name: 'Leads and bonuses' }).getByRole('listitem')).toHaveCount(3);
  await expect(accuracyLines(fight)).toHaveCount(0);
});

test('the ACC figure is the same with and without a skill Accuracy artifact', async ({ page }) => {
  const accText = async () => {
    await page.getByLabel('Preset', { exact: true }).selectOption('deck-3-1');
    await page.getByLabel('Monster', { exact: true }).selectOption('1');
    return page.getByRole('region', { name: 'Requirements for this calculation' })
      .locator('.stat-range[data-figure="acc"]').innerText();
  };
  await open(page, false);
  const without = await accText();
  await open(page, true, true);
  expect(await accText()).toBe(without);
});

test("a team's Edit preset leaves the overlay for Presets, with its preset chosen", async ({ page }, testInfo) => {
  await open(page);
  /* Another preset is the one chosen across the program, so Presets showing
     Rift Raid 3 afterwards is the button's doing. */
  await page.getByLabel('Preset', { exact: true }).selectOption('deck-3-1');
  await page.getByRole('navigation').getByRole('button', { name: 'Speed Tuning', exact: true }).click();
  await page.getByRole('button', { name: /^Rift Raid 3: / }).click();
  const card = page.getByRole('dialog', { name: 'Rift Raid 3' });
  const edit = card.getByRole('button', { name: 'Edit preset', exact: true });
  await expect(edit).toBeEnabled();
  /* At the far edge of the facts' row, in the quiet compact box. */
  const [editBox, bodyBox] = await Promise.all([edit.boundingBox(), card.locator('.overlay-body').boundingBox()]);
  expect(editBox && bodyBox && Math.abs(editBox.x + editBox.width - (bodyBox.x + bodyBox.width))).toBeLessThan(40);
  await page.screenshot({ path: testInfo.outputPath('speed-overlay-edit-preset.png') });

  await edit.click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Presets', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Preset', exact: true })).toHaveText(/^Rift Raid 3: /);
  await page.screenshot({ path: testInfo.outputPath('presets-after-edit.png') });
});
