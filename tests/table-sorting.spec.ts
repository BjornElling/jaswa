import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Sorting is a property of the shared table frame, not of each table
 * (`ACCOUNT-TABLES.md` §1): every rendered column of every table offers
 * an ascending and a descending order, through one component.
 *
 * The arrow's side follows the column's alignment (`ACCOUNT-TABLES.md` §2) — outside the label,
 * away from the figures the column is read against — which is checked here on
 * the rendered DOM order rather than on the CSS.
 */
const account = fileURLToPath(new URL('./fixtures/awakening-search-account.json', import.meta.url));

async function importAccount(page: Page) {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(account);
  await expect(page.getByText('awakening-search-account.json')).toBeVisible();
}

/**
 * Every heading of one table, and whether it sorts. A heading that sorts is a
 * button; the sort mark is a sibling of the label, so its side is readable from
 * the button's own child order.
 */
async function headings(headerTable: Locator) {
  await expect(headerTable).toBeVisible();
  return headerTable.locator('thead th').evaluateAll((cells) => cells.map((cell) => {
    const button = cell.querySelector('button.sort-button');
    const children = button ? [...button.children] : [];
    const labelIndex = children.findIndex((child) => child.classList.contains('sort-button-label'));
    const markIndex = children.findIndex((child) => child.classList.contains('sort-mark'));
    return {
      text: (cell.textContent ?? '').trim(),
      sortable: Boolean(button),
      align: cell.classList.contains('align-right') ? 'right'
        : cell.classList.contains('align-center') ? 'center' : 'left',
      markSide: markIndex < 0 ? 'none' : markIndex < labelIndex ? 'before' : 'after',
    };
  }));
}

/** Each table's own header half, which `DataTablePage` renders separately. */
const headerTables = {
  roster: 'Stats columns',
  storage: 'Numbers columns',
  artifacts: 'Artifact library columns',
};

test('every column of every account table sorts, in both directions', async ({ page }) => {
  await importAccount(page);

  const tables: Array<{ open: () => Promise<void>; header: string; body: string }> = [
    {
      open: async () => {
        await page.getByRole('navigation').getByRole('button', { name: 'Monster Stats', exact: true }).click();

        await page.getByRole('button', { name: 'Lvl. < 40' }).click();
      },
      header: headerTables.roster,
      body: 'Monster stats',
    },
    {
      open: async () => {
        await page.getByRole('navigation').getByRole('button', { name: 'Monster Numbers', exact: true }).click();
      },
      header: headerTables.storage,
      body: 'Monster numbers',
    },
    {
      open: async () => {
        await page.getByRole('navigation').getByRole('button', { name: 'Artifacts', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Artifacts', exact: true })).toBeVisible();
      },
      header: headerTables.artifacts,
      body: 'Artifact library',
    },
  ];

  for (const table of tables) {
    await table.open();
    const headerTable = page.getByRole('table', { name: table.header });
    const cells = await headings(headerTable);
    expect(cells.length, `${table.header} renders headings`).toBeGreaterThan(0);

    /* Not one heading may be inert: that is the whole of `ACCOUNT-TABLES.md` §1. */
    const inert = cells.filter((cell) => !cell.sortable);
    expect(inert, `every heading of "${table.header}" sorts`).toEqual([]);

    /* Clicking a heading twice must offer both directions and land back where
       it started, so no column is a one-way trip. */
    const buttons = headerTable.locator('thead th button.sort-button');
    for (let index = 0; index < await buttons.count(); index += 1) {
      const button = buttons.nth(index);
      const cell = headerTable.locator('thead th').nth(index);
      await button.click();
      const first = await cell.getAttribute('aria-sort');
      expect(['ascending', 'descending']).toContain(first);
      await button.click();
      const second = await cell.getAttribute('aria-sort');
      expect(['ascending', 'descending']).toContain(second);
      expect(second, `column ${index} of "${table.header}" reverses`).not.toBe(first);
    }
  }
});

test('the sort arrow sits on the outside of the heading text', async ({ page }) => {
  await importAccount(page);
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Stats', exact: true }).click();

  await page.getByRole('navigation').getByRole('button', { name: 'Monster Numbers', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Artifacts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Artifacts', exact: true })).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Monster Stats', exact: true }).click();

  for (const label of [headerTables.roster, headerTables.storage]) {
    await page.getByRole('navigation').getByRole('button', { name: label === headerTables.roster ? 'Monster Stats' : 'Monster Numbers', exact: true }).click();
    const cells = await headings(page.getByRole('table', { name: label }));
    for (const cell of cells) {
      /* Left- and centre-aligned headings read label first, then the mark;
         a right-aligned heading puts the mark first so the text keeps the
         column's right edge, next to the digits it belongs to. */
      expect(cell.markSide, `${label} · "${cell.text}" (${cell.align})`)
        .toBe(cell.align === 'right' ? 'before' : 'after');
    }
    /* The rule is only meaningful if the table actually has both kinds. */
    expect(cells.some((cell) => cell.align === 'right'), `${label} has a right-aligned column`).toBe(true);
    expect(cells.some((cell) => cell.align === 'left'), `${label} has a left-aligned column`).toBe(true);
  }
});
