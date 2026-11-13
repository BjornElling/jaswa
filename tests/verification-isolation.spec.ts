import { expect, test } from '@playwright/test';
import { access, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createVerificationServer } from '../scripts/verification-server.mjs';

test('parallel module checks and generated HTML cannot reload a calculating browser', async ({ page }, testInfo) => {
  const reloads: string[] = [];
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
    const message = JSON.parse(String(payload));
    if (message.type === 'full-reload' || message.type === 'update') reloads.push(String(payload));
  }));
  await page.goto('/');
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(
    fileURLToPath(new URL('./fixtures/craft-account.json', import.meta.url)),
  );
  await expect(page.locator('.import-badge')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Rune Clean-up', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate', exact: true }).click();

  const servers = await Promise.all([createVerificationServer(), createVerificationServer()]);
  const cacheDirectories = servers.map((server) => server.config.cacheDir);
  try {
    expect(new Set(cacheDirectories).size).toBe(2);
    for (const server of servers) {
      expect(server.config.server.watch).toBeNull();
      expect(server.config.server.hmr).toBe(false);
      expect(server.config.server.ws).toBe(false);
      expect(server.environments.client.depsOptimizer).toBeUndefined();
    }
    await Promise.all([
      ...servers.map((server) => server.ssrLoadModule('/app/ingest/preferences.ts')),
      writeFile(testInfo.outputPath('parallel-check.html'), '<!doctype html><title>Generated test artifact</title>'),
    ]);
    await expect(page.getByRole('table', { name: 'Rune verdicts' }).locator('.rune-verdict')).toHaveCount(4);
    expect(reloads).toEqual([]);
  } finally {
    await Promise.all(servers.map((server) => server.close()));
  }
  for (const directory of cacheDirectories) await expect(access(directory)).rejects.toMatchObject({ code: 'ENOENT' });
});
