import { expect, openSettingsBar, test } from './test-fixtures';
import { fileURLToPath } from 'node:url';

const syntheticAccount = fileURLToPath(new URL('./fixtures/synthetic-account.json', import.meta.url));
const readOnlyNotice = 'JASWA is open in another tab. This tab shows your workspace and takes over when that tab closes.';

test('one tab writes, readers receive the commit, and the next tab takes over', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    indexedDB.deleteDatabase('jaswa-local');
  });
  await page.reload();
  await expect(page.getByText('Preparing your local workspace…')).toBeHidden();

  const reader = await page.context().newPage();
  try {
    await reader.goto('/');
    await expect(reader.getByText(readOnlyNotice)).toBeVisible();
    await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(syntheticAccount);
    await expect(page.getByText('synthetic-account.json')).toBeVisible();
    await expect(reader.getByText('synthetic-account.json')).toBeVisible();

    await page.close();
    await expect(reader.getByText(readOnlyNotice)).toBeHidden({ timeout: 10_000 });
    await reader.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
    await openSettingsBar(reader, 'General');
    const acceleration = reader.getByRole('checkbox', { name: 'Use the graphics card for heavy calculations' });
    await expect(acceleration).toBeChecked();
    await acceleration.uncheck();
    await expect(acceleration).not.toBeChecked();
  } finally {
    await reader.close();
  }
});
