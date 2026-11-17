import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { isolatePersonalization } from './verification-browser.mjs';

const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-unsafe-webgpu'] });
try {
  const page = await browser.newPage();
  await isolatePersonalization(page.context());
  await page.goto('http://localhost:3000/');
  const result = await page.evaluate(async () => {
    const { GpuContext } = await import('/app/platform/gpu/gpu-context.ts');
    const { runeChanceAgreement } = await import('/app/platform/gpu/backends/webgpu-rune-chance-backend.ts');
    const context = new GpuContext();
    return await context.ready() ? runeChanceAgreement(context) : null;
  });
  assert.notEqual(result, null, 'No WebGPU card was available for verification.');
  assert.equal(result, true, 'The card did not agree on the rune chance fixture.');
  console.log('PASS: the rune chance card agrees on unambiguous counts.');
} finally {
  await browser.close();
}
