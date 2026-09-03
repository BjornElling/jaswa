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

  for (const width of [2000, 1400, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [pageName, toggleName] of [['Monsters', 'Storage'], ['Artifacts', 'Equipped']]) {
      await page.getByRole('button', { name: pageName, exact: true }).click();
      await page.locator('.data-table-page').waitFor();
      await page.evaluate(() => window.scrollTo(0, 0));

      const [filter, header, table] = await Promise.all([
        page.locator('.data-table-filter-panel').boundingBox(),
        page.locator('.data-table-header-wrap table').boundingBox(),
        page.locator('.data-table-scroll table').boundingBox(),
      ]);
      assert(filter && header && table, `${pageName} did not render its shared table surfaces.`);
      assert(nearlyEqual(filter.width, header.width) && nearlyEqual(header.width, table.width),
        `${pageName} filters, heading and rows do not share one width at ${width}px.`);
      const [summary, firstLabel, strip] = await Promise.all([
        page.locator('.filter-summary').boundingBox(),
        page.locator('.filter-label').first().boundingBox(),
        page.locator('.filter-strip').boundingBox(),
      ]);
      assert(summary && firstLabel && strip && nearlyEqual(summary.y, firstLabel.y)
        && nearlyEqual(summary.x + summary.width, strip.x + strip.width),
      `${pageName} result summary is not aligned with the filter headings at ${width}px.`);
      if (pageName === 'Artifacts' && width === 2000) {
        const mainStatShowsValue = await page.locator('.artifact-grid tbody td:nth-child(6)')
          .evaluateAll((cells) => cells.some((cell) => cell.textContent?.includes('+')));
        assert(!mainStatShowsValue, 'Artifact main-stat cells must show the stat name without its numeric value.');
        const headers = await page.locator('.artifact-grid thead th').evaluateAll((cells) =>
          cells.map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim()));
        /* The table opens on Location: an artifact's position in the export is
           not shown, so there is no row number ahead of it. */
        assert(headers[0] === 'Location' && headers[1] === 'Value onmon',
          'Artifact location and value must open the table.');
        assert(!headers.includes('#'), 'The artifact table must not show a row number.');
        const positions = await page.locator(
          '.artifact-filter-search, .artifact-filter-quality, .artifact-filter-main-stat, .artifact-filter-location, .artifact-filter-type, .artifact-filter-element, .artifact-filter-archetype',
        ).evaluateAll((elements) => Object.fromEntries(elements.map((element) => [
          [...element.classList].find((name) => name.startsWith('artifact-filter-')),
          element.getBoundingClientRect().toJSON(),
        ])));
        const search = positions['artifact-filter-search'];
        const quality = positions['artifact-filter-quality'];
        const main = positions['artifact-filter-main-stat'];
        const location = positions['artifact-filter-location'];
        const type = positions['artifact-filter-type'];
        const element = positions['artifact-filter-element'];
        const archetype = positions['artifact-filter-archetype'];
        const [qualityLabel, typeLabel] = await Promise.all([
          page.locator('.artifact-filter-quality .filter-label').boundingBox(),
          page.locator('.artifact-filter-type .filter-label').boundingBox(),
        ]);
        assert(nearlyEqual(search.y, quality.y) && nearlyEqual(quality.y, main.y) && nearlyEqual(main.y, location.y)
          && search.x < quality.x && quality.x < main.x && main.x < location.x
          && type.y > quality.y && nearlyEqual(type.x, quality.x) && nearlyEqual(element.x, main.x)
          && nearlyEqual(archetype.x, location.x) && qualityLabel && typeLabel && nearlyEqual(qualityLabel.x, typeLabel.x),
        'Artifact filters do not follow the requested two-row arrangement.');
      }

      const overflow = await page.locator('.data-table-filter-panel, .data-table-scroll, .grid-table')
        .evaluateAll((elements) => elements.map((element) => ({
          label: element.className,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })));
      for (const surface of overflow) {
        assert(surface.scrollWidth <= surface.clientWidth,
          `${pageName} has horizontal overflow at ${width}px: ${surface.label}.`);
      }
      const documentWidth = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      assert(documentWidth.scrollWidth <= documentWidth.clientWidth,
        `${pageName} makes the page horizontally scroll at ${width}px.`);

      const before = await page.locator('.data-table-header-wrap').boundingBox();
      await page.getByRole('button', { name: toggleName, exact: true }).click();
      const after = await page.locator('.data-table-header-wrap').boundingBox();
      assert(before && after && nearlyEqual(before.x, after.x) && nearlyEqual(before.y, after.y)
        && nearlyEqual(before.width, after.width) && nearlyEqual(before.height, after.height),
      `${pageName} changed the table header's layout when ${toggleName} was selected.`);
    }
  }

  await page.getByRole('button', { name: 'Artifact Optimization', exact: true }).click();
  await page.getByText('Settings', { exact: true }).click();
  await assert.doesNotReject(() => page.locator('#conversion-stone-value').waitFor());

  /* The recommendation table has to hold its content inside the page at every
     width. It was previously pinned to a px width computed against
     var(--workspace-max), which is only the container's width at the very top
     of the range — at 1600px a 1542px table sat in a 1301px wrap and scrolled
     sideways. The columns are shares of 100% now, and this holds them there. */
  await page.getByText('Recommendations', { exact: true }).click();
  await page.getByRole('button', { name: /Calculate recommendations/ }).click();
  await page.locator('.artifact-recommendation-table').waitFor({ timeout: 180000 });
  for (const width of [2000, 1600, 1480, 1400, 1200, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    const wrap = await page.locator('.artifact-recommendation-table-wrap').evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    assert(wrap.scrollWidth <= wrap.clientWidth,
      `The recommendation table scrolls horizontally at ${width}px: ${wrap.scrollWidth} in ${wrap.clientWidth}.`);
  }
  const recommendationHeaders = await page.locator('.artifact-recommendation-table thead th')
    .evaluateAll((cells) => cells.map((cell) => cell.textContent.replace(/\s+/g, ' ').trim()));
  assert(!recommendationHeaders.includes('#'),
    'The recommendation table must not show an artifact number.');

  console.log('Verified empty and imported library states, shared table measure, fixed filter interaction, artifact settings, and the recommendation table fitting its container.');
} finally {
  await browser.close();
}
