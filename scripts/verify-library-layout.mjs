import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.JASWA_URL ?? 'http://localhost:3000/';
const importPath = process.env.JASWA_IMPORT ?? `${process.env.TEMP}/claude/shots/game.json`;

function nearlyEqual(left, right, allowance = 1) {
  return Math.abs(left - right) <= allowance;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2000, height: 900 }, deviceScaleFactor: 1 });

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  for (const pageName of ['Monsters', 'Artifacts']) {
    await page.getByRole('button', { name: pageName, exact: true }).click();
    await assert.doesNotReject(() => page.getByText('Nothing to show until a game file is imported.').waitFor());
  }

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.setInputFiles('input[type=file][accept*="json"]', importPath);
  await page.waitForTimeout(1200);
  const replaceImport = page.getByRole('button', { name: /replace/i });
  if (await replaceImport.isVisible().catch(() => false)) await replaceImport.click();

  for (const [pageName, toggleName] of [['Monsters', 'Storage'], ['Artifacts', 'Equipped']]) {
    await page.getByRole('button', { name: pageName, exact: true }).click();
    await page.locator('.data-table-page').waitFor();

    const [filter, header, table] = await Promise.all([
      page.locator('.filter-strip').boundingBox(),
      page.locator('.data-table-header-wrap table').boundingBox(),
      page.locator('.data-table-scroll table').boundingBox(),
    ]);
    assert(filter && header && table, `${pageName} did not render its shared table surfaces.`);
    assert(nearlyEqual(filter.width, header.width) && nearlyEqual(header.width, table.width),
      `${pageName} filters, heading and rows do not share one width.`);

    const before = await page.locator('.data-table-header-wrap').boundingBox();
    await page.getByRole('button', { name: toggleName, exact: true }).click();
    const after = await page.locator('.data-table-header-wrap').boundingBox();
    assert(before && after && nearlyEqual(before.x, after.x) && nearlyEqual(before.y, after.y)
      && nearlyEqual(before.width, after.width) && nearlyEqual(before.height, after.height),
    `${pageName} changed the table header's layout when ${toggleName} was selected.`);
  }

  await page.getByRole('button', { name: 'Artifact Optimization', exact: true }).click();
  await page.getByText('Settings', { exact: true }).click();
  await assert.doesNotReject(() => page.locator('#conversion-stone-grade').waitFor());
  await assert.doesNotReject(() => page.locator('#conversion-stone-max-value').waitFor());

  console.log('Verified empty and imported library states, shared table measure, fixed filter interaction, and artifact settings.');
} finally {
  await browser.close();
}
