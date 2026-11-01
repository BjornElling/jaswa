import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Six craft stacks against four runes. Every row in the fixture exercises one
 * placement rule of `docs/RUNE-CRAFT-ITEMS.md`, so the counts asserted here are
 * the rules themselves rather than a snapshot of an account.
 */
const craftAccount = fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url));

test('craft controls reserve their boxes and calculate three grind rankings', async ({ page }, testInfo) => {
  await openWorkspace(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importCraftAccount(page);
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();
  const panel = page.locator('.craft-best-use');
  const filters = panel.locator('.craft-best-use-filters');
  const bounds = await filters.boundingBox();
  const boxes = () => panel.locator('.filter-group').evaluateAll((elements) => elements.map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height };
  }));
  const before = await boxes();
  await page.screenshot({ path: testInfo.outputPath('craft-controls-before.png'), fullPage: true });
  await panel.getByRole('button', { name: 'Enchanted gem', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('craft-controls-gem.png'), fullPage: true });
  expect(await boxes()).toEqual(before);
  await expect(panel.getByRole('group', { name: 'Grind the gemmed property afterwards' })).toBeVisible();
  await panel.getByRole('button', { name: 'Grindstone', exact: true }).click();
  await expect(panel.getByText('Then grind it', { exact: true })).toBeHidden();
  await chooseItem(page, 'Violent', 'Grind', 'SPD');
  expect(await filters.boundingBox()).toEqual(bounds);
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(panel.getByRole('heading', { name: /^Highest stat/ })).toBeVisible();
  await expect(panel.locator('.craft-ranking')).toHaveCount(3);
  await expect(panel.locator('.craft-recommendation').first()).toContainText('SPD');
  await expect(panel.locator('.craft-calculation-status')).toContainText('Processor');
  await page.screenshot({ path: testInfo.outputPath('craft-grind-results.png'), fullPage: true });
  await panel.getByRole('combobox', { name: 'Filter candidate runes by set' }).selectOption('Fatal');
  await expect(panel.locator('.craft-ranking')).toHaveCount(3);
  await expect(panel.locator('.craft-recommendation')).toHaveCount(0);
});

for (const [mode, label, total] of [
  ['recommendations', 'Recommendations', '+9'],
  ['selected', 'Best use for this', '+9'],
  ['missing', "What's missing", '+10'],
] as const) test(`${label} shows the unground value and target total for a recommended Grindstone`, async ({ page }, testInfo) => {
  await openWorkspace(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const account = JSON.parse(await readFile(craftAccount, 'utf8'));
  account.runes.find((rune: { rune_id: number }) => rune.rune_id === 102).sec_eff[1][3] = 2;
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'ground-craft-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('button', { name: 'Gems & Grinds' }).click();
  await page.locator('summary').filter({ hasText: label }).click();
  const panel = page.locator(`[data-mode="${mode}"]`);
  if (mode === 'selected') await chooseItem(page, 'Violent', 'Grind', 'SPD');
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  const card = panel.locator('.craft-recommendation').first();
  const after = card.locator('.craft-recommendation-lines td:nth-child(2) .rune-sub').first();
  await expect(after.locator('.rune-sub-value')).toHaveText('+5');
  await expect(after.locator('.rune-sub-grind-step')).toContainText('→');
  await expect(after.locator('.rune-sub-ground-figure')).toHaveText(total);
  await expect(after.locator('.rune-sub-gem')).toHaveCount(0);
  await expect(card.locator('.craft-recommendation-lines td:first-child [data-ground="true"] .rune-sub-value')).toHaveText('+7');
  const boxes = () => panel.locator('.filter-group').evaluateAll((elements) => elements.map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect(); return { x, y, width, height };
  }));
  const before = await boxes();
  await page.screenshot({ path: testInfo.outputPath('grind-base-and-target.png'), fullPage: true });
  await panel.getByRole('combobox', { name: 'How well the roll is assumed to land' }).selectOption('maximum');
  expect(await boxes()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('grind-roll-choice.png'), fullPage: true });
});

test('gems project a follow-up grind and keep only two result columns', async ({ page }, testInfo) => {
  await openWorkspace(page);
  await importCraftAccount(page);
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();
  const panel = page.locator('.craft-best-use');
  await chooseItem(page, 'Violent', 'Gem', 'SPD', 'Legend');
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(panel.locator('.craft-ranking')).toHaveCount(2);
  const card = panel.locator('.craft-recommendation').first();
  await expect(card.locator('.craft-recommendation-title')).toContainText('Legend Violent');
  await expect(card.locator('.rune-emblem')).toBeVisible();
  await expect(card.locator('.craft-rune-location dt')).toHaveText('Location');
  await expect(card.getByText('Best role before', { exact: true })).toHaveCount(0);
  await expect(card.getByText('Set and main stat', { exact: true })).toHaveCount(0);
  await expect(card.getByText('Gain', { exact: true })).toHaveCount(0);
  const sizes = await card.evaluate((element) => {
    const main = element.querySelector('.craft-rune-main'), sub = element.querySelector('.rune-sub');
    return [main ? parseFloat(getComputedStyle(main).fontSize) : 0, sub ? parseFloat(getComputedStyle(sub).fontSize) : 0];
  });
  expect(sizes[0]).toBe(sizes[1]);
  const before = await card.textContent();
  await page.screenshot({ path: testInfo.outputPath('craft-gem-before-grind.png'), fullPage: true });
  await panel.getByRole('group', { name: 'Grind the gemmed property afterwards' }).getByRole('button', { name: 'Yes' }).click();
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(card).not.toHaveText(before!);
  await expect(card.locator('.rune-sub-grind-step')).toContainText('→');
  await expect(card.locator('.rune-sub-ground-figure')).toHaveText('+14');
  await expect(panel.getByText('Selected item', { exact: true })).toHaveCount(0);
  await expect(panel.getByText('Provisional score.', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('craft-gem-after-grind.png'), fullPage: true });
  const scope = panel.getByRole('group', { name: 'Choose rune locations' });
  await scope.getByRole('button', { name: 'Engraved' }).click();
  await scope.getByRole('button', { name: 'Inventory' }).click();
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(panel.locator('.craft-ranking')).toHaveCount(2);
  await expect(panel.locator('.craft-recommendation').first()).toBeVisible();
});

test('Recommendations filters the complete held box without another calculation', async ({ page }, testInfo) => {
  let craftWorkers = 0;
  page.on('worker', (worker) => { if (worker.url().includes('craft-recommendation-worker')) craftWorkers += 1; });
  await openWorkspace(page);
  await importCraftAccount(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.locator('summary').filter({ hasText: 'Recommendations' }).click();
  const panel = page.locator('[data-mode="recommendations"]');
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(panel.locator('.craft-ranking')).toHaveCount(3);
  await expect(panel.locator('.craft-recommendation').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('craft-recommendations-grind.png'), fullPage: true });
  await panel.getByRole('button', { name: 'Enchanted gem', exact: true }).click();
  await expect(panel.locator('.craft-ranking')).toHaveCount(2);
  await expect(panel.locator('.craft-recommendation').first()).toBeVisible();
  expect(craftWorkers).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('craft-recommendations-gem.png'), fullPage: true });
  await panel.getByRole('button', { name: 'Clear results', exact: true }).click();
  await expect(panel.locator('.craft-ranking')).toHaveCount(0);
});

test('both craft views share a complete calculation and filter beyond its initial shortlist', async ({ page }) => {
  let craftWorkers = 0;
  page.on('worker', (worker) => { if (worker.url().includes('craft-recommendation-worker')) craftWorkers += 1; });
  await openWorkspace(page);
  await importCraftAccount(page);
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();
  const best = page.locator('[data-mode="selected"]');
  await best.getByRole('slider', { name: 'Number of runes listed in each ranking' }).fill('1');
  await best.getByRole('combobox', { name: 'Filter candidate runes by set' }).selectOption('Violent');
  await best.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(best.locator('.craft-recommendation').first()).toBeVisible();
  expect(craftWorkers).toBe(1);
  await best.getByRole('combobox', { name: 'Filter candidate runes by set' }).selectOption('');
  await chooseItem(page, 'Fatal', 'Gem', 'SPD', 'Legend');
  await expect(best.locator('.craft-ranking').first().locator('.craft-recommendation')).toHaveCount(1);
  await expect(best.locator('.craft-recommendation').first()).toContainText('Fatal');
  const location = best.getByRole('group', { name: 'Choose rune locations' });
  await location.getByRole('button', { name: 'Engraved', exact: true }).click();
  await expect(best.locator('.craft-recommendation')).toHaveCount(0);
  await location.getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(best.locator('.craft-recommendation').first()).toContainText('Fatal');
  await page.locator('summary').filter({ hasText: 'Recommendations' }).click();
  const recommendations = page.locator('[data-mode="recommendations"]');
  await expect(recommendations.locator('.craft-recommendation').first()).toBeVisible();
  await recommendations.getByRole('button', { name: 'Enchanted gem', exact: true }).click();
  await recommendations.getByRole('slider', { name: 'Number of runes listed in each ranking' }).fill('10');
  await expect(recommendations.locator('.craft-ranking').first().locator('.craft-recommendation')).toHaveCount(3);
  await recommendations.getByRole('combobox', { name: 'Filter candidate runes by set' }).selectOption('Fatal');
  await expect(recommendations.locator('.craft-ranking').first().locator('.craft-recommendation')).toHaveCount(1);
  expect(craftWorkers).toBe(1);
  await expect(best.locator('.craft-best-use-filters').getByText('Assumed roll', { exact: true })).toHaveCount(0);
  await expect(best.locator('.craft-best-use-filters').getByText('Then grind it', { exact: true })).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Gems & Grinds', exact: true }).click();
  await expect(recommendations.locator('.craft-recommendation').first()).toContainText('Fatal');
  expect(craftWorkers).toBe(1);
});

test('a changed filter contract preserves every valid independent choice', async ({ page }) => {
  await openWorkspace(page);
  await importCraftAccount(page);
  await page.evaluate(() => sessionStorage.setItem('jaswa.filters.craft-best-use', JSON.stringify({
    kinds: ['gem'], lineages: ['ancient'], grades: ['Legend'], selectedItemId: '9005', statId: '8',
    roleId: 'removed-role-filter', roll: 'maximum', grindAfter: true, grindGrade: 'Hero',
    showEngraved: false, showInventory: true, count: 'unreadable',
  })));
  await page.reload();
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();
  const panel = page.locator('.craft-best-use');
  await expect(panel.getByRole('button', { name: 'Enchanted gem', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('group', { name: 'Family', exact: true }).getByRole('button', { name: 'Ancient' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('combobox', { name: 'How well the roll is assumed to land' })).toHaveValue('maximum');
  await expect(panel.getByRole('combobox', { name: 'Narrow the list to one stat' })).toHaveValue('8');
  await expect(panel.getByRole('combobox', { name: 'Grade of the grindstone to assume' })).toHaveValue('Hero');
  await expect(panel.getByRole('combobox', { name: 'Filter candidate runes by set' })).toHaveValue('');
  await expect(panel.getByRole('slider', { name: 'Number of runes listed in each ranking' })).toHaveValue('5');
  await expect(panel.getByRole('group', { name: 'Choose rune locations' }).getByRole('button', { name: 'Engraved' })).toHaveAttribute('aria-pressed', 'false');
});

test('Grind state and permission to change a Gem stat filter instantly in both views', async ({ page }, testInfo) => {
  let craftWorkers = 0;
  page.on('worker', (worker) => { if (worker.url().includes('craft-recommendation-worker')) craftWorkers += 1; });
  await openWorkspace(page);
  const account = JSON.parse(await readFile(craftAccount, 'utf8'));
  const unfinished = account.runes.find((rune: { rune_id: number }) => rune.rune_id === 102);
  const finished = account.runes.find((rune: { rune_id: number }) => rune.rune_id === 101);
  account.runes.push(
    { ...unfinished, rune_id: 202, sec_eff: [[2, 8, 0, 0], [8, 5, 0, 2]] },
    { ...finished, rune_id: 203, sec_eff: [[2, 8, 0, 0], [8, 5, 1, 0], [9, 6, 0, 0], [10, 5, 0, 0]] },
    { ...finished, rune_id: 204, sec_eff: [[2, 8, 1, 0], [6, 8, 0, 0], [9, 6, 0, 0], [10, 5, 0, 0]] },
  );
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'marked-craft-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Gems & Grinds' }).click();
  for (const [title, mode] of [['Best use for this', 'selected'], ['Recommendations', 'recommendations']]) {
    await page.locator('summary').filter({ hasText: title }).click();
    const panel = page.locator(`[data-mode="${mode}"]`);
    const highest = panel.locator('.craft-ranking').first().locator('.craft-recommendation');
    const alreadyGround = panel.getByRole('group', { name: 'Stat already grinded', exact: true });
    await expect(alreadyGround.getByRole('button', { name: 'Yes', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(alreadyGround.getByRole('button', { name: 'No', exact: true })).toHaveAttribute('aria-pressed', 'false');
    if (mode === 'selected') await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
    await expect(highest).toHaveCount(3);
    await alreadyGround.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(highest).toHaveCount(1);
    await expect(highest.locator('tbody td:first-child .rune-sub[data-ground="true"]')).toHaveCount(1);
    await alreadyGround.getByRole('button', { name: 'No', exact: true }).click();
    await expect(highest).toHaveCount(3);
    await alreadyGround.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(highest).toHaveCount(2);
    await alreadyGround.getByRole('button', { name: 'No', exact: true }).click();
    await panel.getByRole('button', { name: 'Enchanted gem', exact: true }).click();
    const canChange = panel.getByRole('group', { name: "Can change gem'ed stat?", exact: true });
    const controlBoxes = () => panel.locator('.craft-question, .craft-best-use-filters, .craft-best-use-filters .filter-group').evaluateAll((nodes) => nodes.map((node) => {
      const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height };
    }));
    const bounds = await controlBoxes();
    const unrestricted = await highest.count();
    await expect(highest.locator('tbody td:first-child .rune-sub-gem')).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath(`${mode}-gem-change-allowed.png`), fullPage: true });
    await canChange.getByRole('button', { name: 'No', exact: true }).click();
    await expect(highest).toHaveCount(unrestricted - 1);
    await expect(highest.locator('tbody td:first-child .rune-sub-gem')).toHaveCount(1);
    await expect(highest.locator('tbody td:first-child .rune-sub').filter({ has: page.locator('.rune-sub-gem') })).toContainText('SPD');
    expect(await controlBoxes()).toEqual(bounds);
    await page.screenshot({ path: testInfo.outputPath(`${mode}-gem-same-stat-only.png`), fullPage: true });
    await canChange.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(highest).toHaveCount(unrestricted);
    await canChange.getByRole('button', { name: 'No', exact: true }).click();
    await expect(highest).toHaveCount(unrestricted);
    expect(await controlBoxes()).toEqual(bounds);
    expect(craftWorkers).toBe(1);
  }
});

test('Only keep-runes asks Rune Clean-up and narrows Best use without moving a control', async ({ page }, testInfo) => {
  let craftWorkers = 0;
  page.on('worker', (worker) => { if (worker.url().includes('craft-recommendation-worker')) craftWorkers += 1; });
  await openWorkspace(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importCraftAccount(page);
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();
  const panel = page.locator('[data-mode="selected"]');
  const keepOnly = panel.getByRole('group', { name: 'Only keep-runes', exact: true });
  await expect(keepOnly.getByRole('button')).toHaveText(['Yes']);
  await expect(keepOnly.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'false');
  const boxes = () => panel.locator('.filter-group').evaluateAll((elements) => elements.map((element) => {
    const origin = element.closest('.craft-best-use')!.getBoundingClientRect();
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x: x - origin.x, y: y - origin.y, width, height };
  }));
  const before = await boxes();
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  const cards = panel.locator('.craft-recommendation');
  await expect(cards.first()).toBeVisible();
  const all = await cards.count();
  await page.screenshot({ path: testInfo.outputPath('craft-keep-only-off.png'), fullPage: true });
  /* Every wording the status line passes through, so a silent wait cannot pass. */
  await panel.locator('.craft-calculation-status').evaluate((status) => {
    const seen: string[] = [];
    (window as unknown as { statusSeen: string[] }).statusSeen = seen;
    new MutationObserver(() => seen.push(status.textContent ?? '')).observe(status, { subtree: true, childList: true, characterData: true });
  });
  await keepOnly.getByRole('button', { name: 'Yes' }).click();
  await expect(keepOnly.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.locator('.craft-best-use-results')).toBeVisible();
  await expect(panel.locator('.craft-calculation-status')).toContainText('Processor');
  const seen = await page.evaluate(() => (window as unknown as { statusSeen: string[] }).statusSeen);
  expect(seen.some((text) => /^Calibrating Rune Clean-up… \d+ % · only needed once$/.test(text)), seen.join(' | ')).toBe(true);
  expect(seen.some((text) => /^Asking Rune Clean-up which runes it keeps… \d+ %$/.test(text)), seen.join(' | ')).toBe(true);
  expect(await cards.count()).toBeLessThanOrEqual(all);
  expect(await boxes()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath('craft-keep-only-on.png'), fullPage: true });
  await panel.getByRole('button', { name: 'Reset best use filters' }).click();
  await expect(keepOnly.getByRole('button', { name: 'Yes' })).toHaveAttribute('aria-pressed', 'false');
  await expect(cards).toHaveCount(all);
  expect(craftWorkers).toBe(1);
  /* Best use's own: the other views keep the cell empty. */
  await page.locator('summary').filter({ hasText: 'Recommendations' }).click();
  await expect(page.locator('[data-mode="recommendations"]').getByRole('group', { name: 'Only keep-runes' })).toHaveCount(0);
});

test('Only keep-runes keeps a calculated Keep and drops Power up, Re-app and a safeguarded Keep', async ({ page }) => {
  let adviceWorkers = 0;
  page.on('worker', (worker) => { if (worker.url().includes('rune-advice-worker')) adviceWorkers += 1; });
  await openWorkspace(page);
  await importCraftAccount(page);
  await page.evaluate(async () => {
    const storagePath = '/app/lib/browser-storage.ts', importsPath = '/app/lib/file-imports.ts';
    const { savePreferences } = await import(storagePath);
    const { blankPreferences } = await import(importsPath);
    await savePreferences(blankPreferences());
  });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  /* Clean-up's answers, seeded as its table would leave them: the filter reads
     these rather than ask the worker, so each verdict is the one stated here. */
  await page.evaluate(async () => {
    const storagePath = '/app/lib/browser-storage.ts', importsPath = '/app/lib/file-imports.ts';
    /* The memory is module state, so it is reached through the very URL the app
       loaded — after an edit the dev server serves it with a timestamp query. */
    const importer = await (await fetch('/app/components/use-rune-keepers.ts')).text();
    const memoryPath = /["'](\/app\/lib\/compute\/rune-advice-memory\.ts[^"']*)["']/.exec(importer)?.[1]
      ?? '/app/lib/compute/rune-advice-memory.ts';
    const runesPath = '/app/lib/runes.ts';
    const { loadImportedGame } = await import(storagePath);
    const { blankPreferences } = await import(importsPath);
    const { rememberRuneAdvice } = await import(memoryPath);
    const { readRunes } = await import(runesPath);
    const game = await loadImportedGame();
    const preferences = blankPreferences();
    const runes = readRunes(game.data);
    const advice = (verdict: string, unprotected?: string) => ({ verdict, reason: '', maxValue: 0, standing: 0, floorShare: 0,
      floorMaxValue: 0, chance: 0, role: null, rank: 'broken', craftedLines: null, buildMains: null, readings: null, bestLineTypes: false,
      ...(unprotected ? { unprotectedAdvice: { verdict: unprotected, reason: '' } } : {}) });
    const verdicts: Record<string, ReturnType<typeof advice>> = {
      101: advice('keep'), 102: advice('power-up'), 103: advice('reapp', 'sell'), 104: advice('keep', 'sell'),
    };
    rememberRuneAdvice({ data: { unit_list: game.data.unit_list }, settings: preferences.runePotential, roles: preferences.runeRoles },
      runes, new Map(runes.map((rune: { id: string }) => [rune.id, verdicts[rune.id]])));
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Gems & Grinds' }).click();
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();
  const panel = page.locator('[data-mode="selected"]');
  /* Gems reach the three runes from +12 — the Keep, the Re-app and the safeguarded Keep. */
  await panel.getByRole('button', { name: 'Enchanted gem', exact: true }).click();
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  const cards = panel.locator('.craft-recommendation');
  await expect(cards.first()).toBeVisible();
  const labels = async () => new Set(await cards.evaluateAll((elements) => elements.map((element) =>
    `${element.querySelector('.rune-link')?.getAttribute('aria-label')} ${element.querySelector('.craft-rune-facts')?.textContent}`)));
  expect((await labels()).size).toBe(3);
  await panel.getByRole('group', { name: 'Only keep-runes', exact: true }).getByRole('button', { name: 'Yes' }).click();
  await expect(panel.locator('.craft-best-use-results')).toBeVisible();
  const kept = [...await labels()];
  expect(kept).toHaveLength(1);
  expect(kept[0]).toMatch(/^Violent rune, slot 2 .*\+12$/);
  /* Every rune was already judged, so nothing was asked again. */
  expect(adviceWorkers).toBe(0);
});

test('one Ignore list follows every Gems & Grinds view, survives reload and resets from any view', async ({ page }, testInfo) => {
  let craftWorkers = 0;
  page.on('worker', (worker) => { if (worker.url().includes('craft-recommendation-worker')) craftWorkers += 1; });
  await openWorkspace(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importCraftAccount(page);
  const views = [
    { title: 'Recommendations', mode: 'recommendations' },
    { title: 'Best use for this', mode: 'selected' },
    { title: "What's missing", mode: 'missing' },
  ];
  const panels = views.map(({ mode }) => page.locator(`[data-mode="${mode}"]`));
  const suggestions = (panel: typeof panels[number]) => panel.locator('.craft-recommendation').evaluateAll((elements) => elements.map((element) => {
    const level = element.querySelector('.craft-rune-facts div:last-child dd')?.textContent;
    const what = element.querySelector('.craft-recommendation-title')?.textContent?.split(' \u00b7 ')[1];
    return `${element.querySelector('.rune-link')?.getAttribute('aria-label')} ${level} \u00b7 ${what}`;
  }));
  const reset = (panel: typeof panels[number]) => panel.getByRole('button', { name: 'Reset ignored' });
  const prepare = async () => {
    for (const { title } of views) {
      const summary = page.locator('summary').filter({ hasText: title });
      if (!(await summary.evaluate((node) => node.parentElement?.hasAttribute('open')))) await summary.click();
    }
    for (const panel of panels) {
      await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
      await expect(panel.locator('.craft-recommendation').first()).toBeVisible();
    }
  };
  await prepare();
  for (const panel of panels) await expect(reset(panel)).toBeDisabled();
  const sets = await Promise.all(panels.map(suggestions));
  const common = sets[0].find((key) => sets.every((entries) => entries.includes(key)));
  expect(common).toBeTruthy();
  const key = common!;
  for (const [index, panel] of panels.entries()) {
    const controls = () => panel.locator('.filter-group, .craft-view-actions').evaluateAll((elements) => elements.map((element) => {
      const origin = element.closest('.craft-best-use')!.getBoundingClientRect();
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x: x - origin.x, y: y - origin.y, width, height };
    }));
    const bounds = await controls();
    let workersBefore = craftWorkers;
    const card = panel.locator('.craft-recommendation').nth((await suggestions(panel)).indexOf(key));
    await page.screenshot({ path: testInfo.outputPath(`${views[index].mode}-ignore-before.png`), fullPage: true });
    await card.getByRole('button', { name: /^Ignore / }).click();
    for (const other of panels) {
      await expect.poll(() => suggestions(other)).not.toContain(key);
      await expect(reset(other)).toBeEnabled();
    }
    expect(await controls()).toEqual(bounds);
    expect(craftWorkers).toBe(workersBefore);
    await page.screenshot({ path: testInfo.outputPath(`${views[index].mode}-ignore-after.png`), fullPage: true });
    if (index === 0) {
      await page.reload();
      for (const other of panels) await expect(reset(other)).toBeEnabled();
      // An ignored-only result can be empty, so readiness is the summary, not a card.
      for (const other of panels) {
        await other.getByRole('button', { name: 'Calculate', exact: true }).click();
        await expect(other.getByText(/build comparisons/)).toBeVisible();
        await expect.poll(() => suggestions(other)).not.toContain(key);
      }
      workersBefore = craftWorkers;
    }
    await reset(panels[(index + 1) % panels.length]).click();
    for (const other of panels) {
      await expect(reset(other)).toBeDisabled();
      await expect.poll(() => suggestions(other)).toContain(key);
    }
    expect(craftWorkers).toBe(workersBefore);
  }
});

test('ignoring the best Gem keeps the same rune eligible for another Gem stat and for Grinds', async ({ page }, testInfo) => {
  let craftWorkers = 0;
  page.on('worker', (worker) => { if (worker.url().includes('craft-recommendation-worker')) craftWorkers += 1; });
  await openWorkspace(page);
  const account = JSON.parse(await readFile(craftAccount, 'utf8'));
  // Both Gems improve this rune's score: SPD by 7.64 points, CRI Rate by 2.75.
  account.runes.find((rune: { rune_id: number }) => rune.rune_id === 101).sec_eff =
    [[2, 8, 0, 0], [8, 5, 0, 0], [9, 6, 0, 0], [10, 5, 0, 0]];
  account.rune_craft_item_list.push({ craft_item_id: 9007, craft_type: 1, craft_type_id: 130905, amount: 1 });
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'alternative-craft-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Gems & Grinds' }).click();
  await page.locator('summary').filter({ hasText: 'Recommendations' }).click();
  const panel = page.locator('[data-mode="recommendations"]');
  await panel.getByRole('button', { name: 'Enchanted gem', exact: true }).click();
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  const sameRune = panel.locator('.craft-ranking').first().locator('.craft-recommendation')
    .filter({ has: page.getByRole('button', { name: 'Violent rune, slot 2', exact: true }) })
    .filter({ has: page.locator('.craft-rune-facts').getByText('+12', { exact: true }) });
  await expect(sameRune.locator('.craft-recommendation-title')).toContainText('SPD Gem');
  const workersBefore = craftWorkers;
  await page.screenshot({ path: testInfo.outputPath('best-gem-before-ignore.png'), fullPage: true });
  await sameRune.getByRole('button', { name: /^Ignore SPD Gem/ }).click();
  await expect(sameRune.locator('.craft-recommendation-title')).toContainText('CRI Rate Gem');
  await page.screenshot({ path: testInfo.outputPath('alternative-gem-after-ignore.png'), fullPage: true });
  await panel.getByRole('button', { name: 'Grindstone', exact: true }).click();
  await expect(sameRune.locator('.craft-recommendation-title')).toContainText('SPD Grind');
  expect(craftWorkers).toBe(workersBefore);
});

test('a changed box keeps the answer: a gone stack drops out, a new one is judged alone', async ({ page }, testInfo) => {
  let craftWorkers = 0;
  page.on('worker', (worker) => { if (worker.url().includes('craft-recommendation-worker')) craftWorkers += 1; });
  await openWorkspace(page);
  const account = JSON.parse(await readFile(craftAccount, 'utf8'));
  /* Every import after the first replaces one, and the page asks before it does. */
  let replacing = false;
  const reimport = async (name: string, items: Record<string, unknown>[]) => {
    await page.getByRole('navigation').getByRole('button', { name: 'Home', exact: true }).click();
    await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
      name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...account, rune_craft_item_list: items })),
    });
    if (replacing) await page.getByRole('dialog').getByRole('button', { name: 'Replace data' }).click();
    replacing = true;
    await expect(page.getByText(`${name} · imported`)).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: 'Gems & Grinds' }).click();
  };
  await reimport('box-first.json', account.rune_craft_item_list);
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();
  const panel = page.locator('[data-mode="selected"]');
  const titles = panel.locator('.craft-recommendation-title');
  await panel.getByRole('button', { name: 'Enchanted gem', exact: true }).click();
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(titles.filter({ hasText: 'Fatal' }).first()).toBeVisible();
  expect(craftWorkers).toBe(1);

  /* The Fatal Gem is spent: its cards leave, everything else stays, and nothing is asked again. */
  const withoutFatal = account.rune_craft_item_list.filter((item: { craft_item_id: number }) => item.craft_item_id !== 9003);
  await reimport('box-spent.json', withoutFatal);
  await expect(titles.first()).toBeVisible();
  await expect(titles.filter({ hasText: 'Fatal' })).toHaveCount(0);
  expect(craftWorkers).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('craft-box-spent.png'), fullPage: true });

  /* A Hero Violent SPD Gem arrives: only it is judged, and the list it joins never empties. */
  await reimport('box-gained.json', [...withoutFatal, { craft_item_id: 9010, craft_type: 1, craft_type_id: 130804, amount: 1, sell_value: 25000 }]);
  await expect(titles.first()).toBeVisible();
  await expect.poll(() => craftWorkers).toBe(2);
  await expect(panel.locator('.craft-calculation-status')).toContainText('Processor');
  await expect(titles.filter({ hasText: 'Fatal' })).toHaveCount(0);
  await panel.getByRole('group', { name: 'Grade', exact: true }).getByRole('button', { name: 'HER' }).click();
  await expect(titles.filter({ hasText: 'Hero Violent' }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('craft-box-gained.png'), fullPage: true });
});

test('result locations name Scenario and count every other engraving', async ({ page }) => {
  await openWorkspace(page);
  const account = JSON.parse(await readFile(craftAccount, 'utf8'));
  const rune = account.runes.find((entry: { rune_id: number }) => entry.rune_id === 101);
  rune.prefix_eff = [11, 6];
  Object.assign(rune, { occupied_type: 1, occupied_id: 1 });
  account.unit_list[0].runes.push(rune);
  account.deck_list = Array.from({ length: 4 }, (_, index) => ({
    deck_type: 1, deck_seq: index + 1, unit_id_list: [1, 2], equip: [
      { unit_id: 1, rune_id_list: [], artifact_id_list: [] },
      { unit_id: 2, rune_id_list: [101], artifact_id_list: [] },
    ],
  }));
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'craft-placement-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Gems & Grinds' }).click();
  await page.locator('summary').filter({ hasText: 'Best use for this' }).click();
  await chooseItem(page, 'Violent', 'Gem', 'SPD', 'Legend');
  const panel = page.locator('.craft-best-use');
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  const location = panel.locator('.craft-recommendation').first().locator('.craft-rune-location');
  await expect(panel.locator('.craft-recommendation').first().locator('.craft-rune-innate')).toHaveText('Resistance+6%');
  await expect(location).toContainText('Location');
  await expect(location).toContainText('Elucia (2A) (+ 4)');
  await expect(location.locator('.engraved-place')).toHaveAttribute('title', /Scenario/);
});

test('a full rune box, long role name and all filter choices fit, and cleared roles are explained', async ({ page }, testInfo) => {
  await openWorkspace(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const account = JSON.parse(await readFile(craftAccount, 'utf8'));
  const source = account.runes.find((rune: Record<string, unknown>) => rune.rune_id === 102);
  account.runes.push(...Array.from({ length: 40 }, (_, index) => ({ ...source, rune_id: 10000 + index,
    upgrade_curr: 15, sec_eff: [[2, 30, 0, 0], [8, 12 + index % 18, 0, 0], [9, 18, 0, 0], [10, 20, 0, 0]] })));
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'full-craft-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.evaluate(async () => {
    const storagePath = '/app/lib/browser-storage.ts', importsPath = '/app/lib/file-imports.ts';
    const { savePreferences } = await import(storagePath);
    const { blankPreferences } = await import(importsPath);
    const preferences = blankPreferences();
    preferences.runeRoles.forEach((role: { name: string }) => { role.name = 'A long role name at the allowed limit for this craft test.....'.slice(0, 60); });
    await savePreferences(preferences);
  });
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Gems & Grinds' }).click();
  await page.locator('summary').filter({ hasText: 'Recommendations' }).click();
  const panel = page.locator('[data-mode="recommendations"]');
  for (const label of ['Family', 'Grade']) {
    await expect(panel.getByRole('group', { name: label, exact: true }).getByRole('button').first()).toBeVisible();
    for (const button of await panel.getByRole('group', { name: label, exact: true }).getByRole('button').all()) await button.click();
  }
  await panel.getByRole('slider', { name: 'Number of runes listed in each ranking' }).fill('10');
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(panel.locator('.craft-ranking').first().locator('.craft-recommendation')).toHaveCount(10);
  await expect(panel.locator('.craft-ranking').nth(2).locator('.craft-recommendation')).toHaveCount(10);
  expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await panel.locator('.craft-recommendation').evaluateAll((elements) => elements.every((element) => element.scrollWidth <= element.clientWidth))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('craft-full-box-long-roles.png'), fullPage: true });
  await panel.locator('.rune-link').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gems & Grinds', exact: true })).toBeAttached();
  await page.keyboard.press('Escape');
  await expect(panel.locator('.rune-link').first()).toBeFocused();
  await page.evaluate(async () => {
    const storagePath = '/app/lib/browser-storage.ts', importsPath = '/app/lib/file-imports.ts';
    const { savePreferences } = await import(storagePath);
    const { blankPreferences } = await import(importsPath);
    await savePreferences({ ...blankPreferences(), runeRoles: [] });
  });
  await page.reload();
  await expect(panel.getByRole('button', { name: 'Calculate', exact: true })).toBeDisabled();
  await expect(panel.locator('.craft-calculation-status')).toContainText('Add a role in Rune Clean-up');
  await page.screenshot({ path: testInfo.outputPath('craft-no-roles.png'), fullPage: true });
});

async function openWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.getByRole('button', { name: 'Gems & Grinds' }).click();
  await expect(page.getByRole('heading', { name: 'Gems & Grinds' })).toBeVisible();
}

async function importCraftAccount(page: Page) {
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(craftAccount);
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('button', { name: 'Gems & Grinds' }).click();
  await expect(page.locator('.craft-grid tbody tr').first()).toBeVisible();
}

async function chooseItem(page: Page, group: string, ...parts: string[]) {
  if (parts.includes('Gem')) await page.getByRole('group', { name: 'Item', exact: true }).getByRole('button', { name: 'Enchanted gem', exact: true }).click();
  const chooser = page.getByRole('combobox', { name: 'Choose a gem or grindstone to place' });
  const value = await chooser.evaluate((select: HTMLSelectElement, [label, want]: [string, string[]]) => {
    const optgroup = [...select.querySelectorAll('optgroup')].find((entry) => entry.label === label);
    const option = [...(optgroup?.children ?? [])]
      .find((entry) => want.every((part) => entry.textContent?.includes(part)));
    return (option as HTMLOptionElement | undefined)?.value ?? '';
  }, [group, parts] as [string, string[]]);
  expect(value, `no ${group} option matching ${parts.join(', ')}`).not.toBe('');
  await chooser.selectOption(value);
}

test("What's missing lists only absent items that beat the box, without moving a control", async ({ page }, testInfo) => {
  let craftWorkers = 0;
  page.on('worker', (worker) => { if (worker.url().includes('craft-recommendation-worker')) craftWorkers += 1; });
  await openWorkspace(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importCraftAccount(page);
  await expect(page.locator('summary')).toHaveText(['›Recommendations', '›Your box', '›Best use for this', "›What's missing"]);
  await page.locator('summary').filter({ hasText: "What's missing" }).click();
  const panel = page.locator('[data-mode="missing"]');
  await expect(panel.getByRole('group', { name: 'Family', exact: true }).getByRole('button')).toHaveText(['Standard', 'Ancient']);
  await expect(panel.getByRole('group', { name: 'Grade', exact: true }).getByRole('button')).toHaveText(['HER', 'LEG']);
  await page.screenshot({ path: testInfo.outputPath('craft-missing-empty.png'), fullPage: true });
  /* Measured from the panel, so a scroll the click causes is not mistaken for movement. */
  const boxes = () => panel.locator('.filter-group').evaluateAll((elements) => elements.map((element) => {
    const origin = element.closest('.craft-best-use')!.getBoundingClientRect();
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x: x - origin.x, y: y - origin.y, width, height };
  }));
  const before = await boxes();
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(panel.getByRole('heading', { name: /^Highest stat/ }).first()).toBeVisible();
  expect(await boxes()).toEqual(before);
  const wanted = panel.getByRole('region', { name: 'Most wanted' });
  await expect(wanted.locator('tbody tr').first()).toBeVisible();
  /* The box holds a Hero Violent SPD stone, so only the Legend one may be wanted. */
  for (const title of await panel.locator('.craft-recommendation-title').allTextContents()) {
    expect(title).not.toBe('Hero Violent · SPD Grind');
  }
  for (const card of await panel.locator('.craft-recommendation').all()) {
    await expect(card.locator('.craft-evaluation dt')).toHaveText(['Best role', 'Score', 'Your box']);
  }
  await page.screenshot({ path: testInfo.outputPath('craft-missing-results.png'), fullPage: true });
  await panel.getByRole('group', { name: 'Grade', exact: true }).getByRole('button', { name: 'HER' }).click();
  await panel.getByRole('button', { name: 'Enchanted gem', exact: true }).click();
  await expect(panel.locator('.craft-ranking')).toHaveCount(2);
  expect(await boxes()).toEqual(before);
  /* Reset returns the filters and leaves the question — the item kind — alone. */
  await panel.getByRole('button', { name: "Reset what's missing filters" }).click();
  await expect(panel.getByRole('group', { name: 'Grade', exact: true }).getByRole('button', { name: 'HER' })).toHaveAttribute('aria-pressed', 'false');
  await expect(panel.getByRole('button', { name: 'Enchanted gem', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(craftWorkers).toBe(1);
  /* The box's own answer is a separate question and is not overwritten. */
  await page.locator('summary').filter({ hasText: 'Recommendations' }).click();
  await expect(page.locator('[data-mode="recommendations"] .craft-ranking')).toHaveCount(0);
});

test("What's missing still asks when the box is empty", async ({ page }) => {
  await openWorkspace(page);
  const account = JSON.parse(await readFile(craftAccount, 'utf8'));
  account.rune_craft_item_list = [];
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'empty-box-account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Gems & Grinds' }).click();
  await page.locator('summary').filter({ hasText: "What's missing" }).click();
  const panel = page.locator('[data-mode="missing"]');
  await panel.getByRole('button', { name: 'Calculate', exact: true }).click();
  await expect(panel.locator('.craft-recommendation').first()).toBeVisible();
  await expect(panel.locator('.craft-recommendation-title').first()).toContainText('Legend');
});

test('the box says what to do when nothing has been imported', async ({ page }, testInfo) => {
  await openWorkspace(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.getByRole('heading', { name: 'Nothing to show until a game file is imported.' })).toBeVisible();
  await expect(page.getByText('Go to Home to connect the helper or import a game file.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('gems-empty.png'), fullPage: true });
});

test('the account badge and the table quantities agree on how many items there are', async ({ page }) => {
  await openWorkspace(page);
  await importCraftAccount(page);
  /* §0.1 part 2: the count on the badge is the count the user can reach. Both
     figures are the sum of the stacks, not the number of stacks. */
  await expect(page.locator('.import-badge')).toContainText('9 gems & grinds');
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(6);
  const quantities = await page.locator('.craft-grid tbody tr td:nth-child(6)').allTextContents();
  expect(quantities).toEqual(['1', '1', '1', '1', '3', '2']);
  expect(quantities.map(Number).reduce((total, quantity) => total + quantity, 0)).toBe(9);
  const headers = page.locator('.craft-grid thead th');
  await expect(headers).toHaveCount(7);
  await expect(page.getByRole('columnheader', { name: 'Quantity' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /^Can improve/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /^(Held|Fits|Availability)/ })).toHaveCount(0);
  const columnWidths = await page.locator('.craft-grid').first().locator('col')
    .evaluateAll((columns) => columns.map((column) => column.getBoundingClientRect().width));
  expect(columnWidths).toHaveLength(7);
  const widthsWithoutRolls = columnWidths.filter((_, index) => index !== 4);
  const widthSpread = widthsWithoutRolls.length
    ? Math.max(...widthsWithoutRolls) - Math.min(...widthsWithoutRolls)
    : Infinity;
  expect(widthSpread).toBeLessThanOrEqual(1);
  const narrowestOtherColumn = widthsWithoutRolls.length ? Math.min(...widthsWithoutRolls) : -Infinity;
  expect(columnWidths[4]).toBeLessThan(narrowestOtherColumn);
});

test('the box opens by item, set, Ancient, stat and quality, while a chosen sort leads', async ({ page }) => {
  await openWorkspace(page);
  const account = JSON.parse(await readFile(craftAccount, 'utf8')) as {
    rune_craft_item_list: Record<string, unknown>[];
  };
  account.rune_craft_item_list.push(
    { craft_item_id: 9007, craft_type: 1, craft_type_id: 130804, amount: 1, sell_value: 25000 },
    { craft_item_id: 9008, craft_type: 1, craft_type_id: 130404, amount: 1, sell_value: 25000 },
  );
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({
    name: 'craft-sort-account.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(account)),
  });
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('button', { name: 'Gems & Grinds' }).click();

  const rows = page.locator('.craft-grid tbody tr');
  await expect(rows.locator('td:nth-child(1)'))
    .toHaveText(['Gem', 'Gem', 'Gem', 'Gem', 'Gem', 'Gem', 'Gem', 'Grind']);
  await expect(rows.locator('td:nth-child(2)'))
    .toContainText(['Fatal', 'Immemorial', 'Rage', 'Violent', 'Violent', 'Violent', 'Violent', 'Violent']);
  await expect(rows.locator('td:nth-child(4)'))
    .toHaveText(['Legend', 'Legend', 'Legend', 'Legend', 'Hero', 'Legend', 'Hero', 'Hero']);
  await expect(rows.locator('td:nth-child(3)'))
    .toHaveText(['SPD', 'Resistance', 'SPD', 'SPD', 'ATK %', 'SPD', 'SPD', 'SPD']);
  await expect(rows.nth(3).locator('td').nth(1).getByTitle('Ancient')).toHaveText('A');
  await expect(rows.nth(4).locator('td').nth(1).getByTitle('Ancient')).toHaveCount(0);

  /* Quantity takes the lead when chosen; ties return to Gem/Grind, Set, Ancient,
     Stat and descending quality instead of falling back to import order. */
  await page.getByRole('columnheader', { name: 'Quantity' }).getByRole('button').click();
  await expect(rows.locator('td:nth-child(6)')).toHaveText(['3', '2', '1', '1', '1', '1', '1', '1']);
  await expect(rows.locator('td:nth-child(1)'))
    .toHaveText(['Gem', 'Grind', 'Gem', 'Gem', 'Gem', 'Gem', 'Gem', 'Gem']);
  await expect(rows.nth(2).locator('td').nth(1)).toContainText('Fatal');
});

test('a same-stat gem remains usable when its best roll can raise the rune', async ({ page }) => {
  await openWorkspace(page);
  const accuracyAccount = fileURLToPath(new URL('./fixtures/craft-accuracy-regem-account.json', import.meta.url));
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(accuracyAccount);
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('button', { name: 'Gems & Grinds' }).click();

  const row = page.locator('.craft-grid tbody tr').filter({ hasText: 'Accuracy' });
  await expect(row).toHaveCount(1);
  await expect(row.locator('td').nth(6)).toHaveText('1');
  await expect(row.locator('td').nth(6)).toHaveAttribute('title', /If a rune already has SPD, the Gem's best roll must exceed its current value/);
  /* One Accuracy rune has a weak SPD line the Legend Gem could raise; the
     other is already at the Gem's ceiling and does not inflate the count. */
  await expect(row.locator('td')).toHaveCount(7);
});

test('a grindstone says when none of the matching runes has its stat', async ({ page }) => {
  await openWorkspace(page);
  const ancientAccount = fileURLToPath(new URL('./fixtures/craft-ancient-destroy-no-hp-percent.json', import.meta.url));
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(ancientAccount);
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('button', { name: 'Gems & Grinds' }).click();

  const row = page.locator('.craft-grid tbody tr').filter({ hasText: 'Destroy' });
  await expect(row).toHaveCount(1);
  await expect(row.locator('td').nth(6)).toHaveText('0');
  await expect(row.locator('td').nth(6)).toHaveAttribute('title', 'No Ancient Destroy rune has HP %');
});

test('the count covers each rune the item can improve, including engraved runes', async ({ page }, testInfo) => {
  await openWorkspace(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importCraftAccount(page);

  const rows = page.locator('.craft-grid tbody tr');
  /* A gem for a set the account owns no rune of shows zero and explains why in
     the count's title. */
  const rage = rows.filter({ hasText: 'Rage' });
  await expect(rage.locator('td').nth(6)).toHaveText('0');
  await expect(rage.locator('td').nth(6)).toHaveAttribute('title', 'You own no Rage rune');
  await expect(rows.filter({ hasText: 'Fatal' }).locator('td').nth(6)).toHaveText('1');
  await expect(rows.filter({ hasText: 'Immemorial' }).locator('td').nth(6)).toHaveText('2');
  /* Ancient items carry their own verified ranges, not a borrowed ordinary
     table. The row is found by the mark rather than by the word: the Set column
     names the set and the mark says Ancient, and there is no Family column. */
  const ancient = rows.filter({ has: page.getByTitle('Ancient') });
  await expect(ancient).toHaveCount(1);
  const ancientSet = ancient.locator('td').nth(1);
  await expect(ancientSet).toContainText('Violent');
  await expect(ancientSet).not.toContainText('Ancient');
  await expect(ancientSet.getByTitle('Ancient')).toHaveText('A');
  await expect(ancient.locator('td').nth(4)).not.toHaveText('—');

  const tables = page.locator('.craft-grid');
  const tableBounds = await tables.evaluateAll((elements) => elements.map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));
  const improveHeader = page.getByRole('columnheader', { name: /^Can improve/ });
  await page.screenshot({ path: testInfo.outputPath('gems-can-improve-before-sort.png'), fullPage: true });
  await improveHeader.getByRole('button').click();
  await page.screenshot({ path: testInfo.outputPath('gems-can-improve-after-sort.png'), fullPage: true });
  expect(await tables.evaluateAll((elements) => elements.map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }))).toEqual(tableBounds);
  await expect(rows.first().locator('td').nth(6)).toHaveText('2');
});

test('filters narrow the box without moving it', async ({ page }, testInfo) => {
  await openWorkspace(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await importCraftAccount(page);

  const strip = page.locator('.craft-filter-strip');
  const before = await strip.boundingBox();
  const setGroupBounds = await page.locator('.craft-filter-set').boundingBox();
  const statGroupBounds = await page.locator('.craft-filter-stat').boundingBox();
  expect(setGroupBounds).not.toBeNull();
  expect(statGroupBounds).not.toBeNull();
  expect(setGroupBounds!.y).toBe(statGroupBounds!.y);
  expect(setGroupBounds!.x).toBeLessThan(statGroupBounds!.x);
  const setFilter = page.getByRole('combobox', { name: 'Filter by the rune set the item belongs to' });
  const statFilter = page.getByRole('combobox', { name: 'Filter by the stat the item gives' });
  const setBounds = await setFilter.boundingBox();
  const statBounds = await statFilter.boundingBox();
  expect(setBounds).not.toBeNull();
  expect(statBounds).not.toBeNull();
  expect(setBounds!.width).toBeCloseTo(statBounds!.width, 0);
  expect(setBounds!.width).toBe(260);
  await expect(strip.getByRole('textbox')).toHaveCount(0);
  const groups = strip.locator('.filter-group');
  await expect(groups.locator('.filter-label')).toHaveText(['Item', 'Set', 'Stat', 'Family', 'Grade', 'Fit', 'Quantity']);
  const groupBoxes = await groups.evaluateAll((elements) => elements.map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));
  expect(groupBoxes[0].y).toBe(groupBoxes[1].y);
  expect(groupBoxes[1].y).toBe(groupBoxes[2].y);
  expect(groupBoxes[3].y).toBeGreaterThan(groupBoxes[0].y);
  expect(groupBoxes[3].x).toBe(groupBoxes[0].x);
  expect(groupBoxes[4].x).toBe(groupBoxes[1].x);
  await setFilter.selectOption({ label: 'Fatal' });
  await expect(setFilter).toHaveValue('Fatal');
  expect(await strip.boundingBox()).toEqual(before);
  await statFilter.selectOption({ label: 'SPD' });
  await expect(statFilter).toHaveValue('8');
  expect(await strip.boundingBox()).toEqual(before);
  await page.getByRole('button', { name: 'Reset items filters' }).click();
  expect(await strip.boundingBox()).toEqual(before);
  const filterFrame = page.locator('.data-table-filter-panel');
  expect(await filterFrame.evaluate((element) => getComputedStyle(element).borderWidth)).toBe('0px');
  expect(await filterFrame.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  expect(Number.parseFloat(await page.locator('.craft-filter-kind').evaluate((element) => getComputedStyle(element).borderLeftWidth))).toBeGreaterThan(0);
  const dropdownGaps = await Promise.all(['craft-stat', 'craft-set'].map((id) => page.locator(`#${id}`).evaluate((element) => {
    const group = element.parentElement?.parentElement;
    if (!group) return -1;
    return group.getBoundingClientRect().right - element.getBoundingClientRect().right;
  })));
  expect(dropdownGaps[0]).toBeGreaterThanOrEqual(15);
  expect(dropdownGaps[1]).toBeGreaterThanOrEqual(15);
  await page.screenshot({ path: testInfo.outputPath('gems-filters-before.png'), fullPage: true });
  /* With neither fit choice selected the group does not narrow the box. */
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(6);
  const fit = page.getByRole('group', { name: 'Choose which items to include' });
  await fit.getByRole('button', { name: 'Usable' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath('gems-filters-usable.png'), fullPage: true });
  await fit.getByRole('button', { name: 'Dead stock' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(6);
  await fit.getByRole('button', { name: 'Usable' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(1);
  await fit.getByRole('button', { name: 'Dead stock' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(6);

  await page.getByRole('group', { name: 'Filter by item' }).getByRole('button', { name: 'Grind' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(1);
  /* Rule 2: the control the user clicked changed, and nothing around it moved. */
  expect(await strip.boundingBox()).toEqual(before);

  await page.getByRole('button', { name: 'Reset items filters' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(6);

  /* The stock threshold is optional. It stays in the layout while disabled,
     and when enabled it compares each stack's held count. */
  const minimum = page.getByRole('slider', { name: 'Minimum quantity of this item' });
  await expect(minimum).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Have ≥' }).check();
  await expect(minimum).toBeEnabled();
  await minimum.fill('2');
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(2);
  await expect(page.locator('.craft-grid tbody tr td:nth-child(6)')).toHaveText(['3', '2']);
  await minimum.fill('3');
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(1);
  await expect(page.locator('.craft-grid tbody tr td:nth-child(6)')).toHaveText('3');
  await page.screenshot({ path: testInfo.outputPath('gems-filters-quantity.png'), fullPage: true });
  expect(await strip.boundingBox()).toEqual(before);

  await page.getByRole('button', { name: 'Reset items filters' }).click();
  await expect(page.locator('.craft-grid tbody tr')).toHaveCount(6);
  await expect(minimum).toBeDisabled();
  await expect(minimum).toHaveValue('1');
  expect(await strip.boundingBox()).toEqual(before);
});
