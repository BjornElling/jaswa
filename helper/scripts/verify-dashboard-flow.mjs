#!/usr/bin/env node

/**
 * Drives the real dashboard in a browser and proves the traffic toggle keeps
 * the window intact — the failure that shipped: accepting the traffic warning
 * left an empty helper window, because `set_traffic_logging` answered with the
 * status object and the message line rendered it as a React child.
 *
 * The Tauri IPC is stubbed rather than mocked away, because the boundary is the
 * thing under test: what a command returns and what `call()` does with it. Both
 * halves are exercised — a command that answers with an object and one that
 * answers with nothing — so the check proves the dashboard now survives either,
 * not merely that today's backend happens to return the right thing.
 *
 * Requires the dev server (`npm run frontend:dev`), which serves the same React
 * code the release build embeds. Playwright comes from the repository root.
 *
 * Usage: node scripts/verify-dashboard-flow.mjs
 */
import { chromium } from 'playwright';

const url = 'http://localhost:1420/';

/** A connected, capturing helper: the state the traffic toggle is used from. */
const dashboard = {
  status: {
    hasProfile: true,
    profileReady: true,
    restartRequired: false,
    lastError: null,
    source: 'live',
    updatedAt: '2026-09-02T10:16:55Z',
  },
  traffic: {
    enabled: false,
    entries: 0,
    recorded: false,
    bytes: 0,
    full: false,
    file: 'C:\\Users\\example\\traffic.log',
    lastError: null,
  },
};

/**
 * Opens the dashboard with a stubbed IPC. `reply` decides what
 * `set_traffic_logging` answers: the status object, or nothing.
 */
async function openDashboard(browser, reply) {
  const page = await browser.newPage({ viewport: { width: 520, height: 552 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(
    ([answer, initial]) => {
      let enabled = false;
      window.__TAURI_INTERNALS__ = {
        transformCallback: (callback) => callback,
        invoke: (command) => {
          if (command === 'set_traffic_logging') {
            enabled = true;
            return Promise.resolve(
              answer === 'object'
                ? { ...initial, traffic: { ...initial.traffic, enabled: true } }
                : null,
            );
          }
          if (command === 'helper_status') {
            return Promise.resolve({ ...initial, traffic: { ...initial.traffic, enabled } });
          }
          return Promise.resolve(null);
        },
      };
      /* The warning is the user's decision, not this check's subject. */
      window.confirm = () => true;
    },
    [reply, dashboard],
  );
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("Log all traffic")', { timeout: 15_000 });
  return { page, errors };
}

/** Accepts the warning, then reports what the window still holds. */
async function toggleTraffic(browser, reply) {
  const { page, errors } = await openDashboard(browser, reply);
  await page.click('button:has-text("Log all traffic")');
  await page.waitForTimeout(1_200);
  const result = {
    buttons: await page.locator('main button').count(),
    headings: await page.locator('h1').count(),
    pressed: await page.locator('button[aria-pressed="true"]').count(),
    trafficLine: await page
      .locator('.log-status p')
      .nth(1)
      .textContent()
      .catch(() => null),
    errors,
  };
  await page.close();
  return result;
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    console.error('Playwright could not launch a browser, so the dashboard was not driven.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  let objectReply;
  let emptyReply;
  try {
    objectReply = await toggleTraffic(browser, 'object');
    emptyReply = await toggleTraffic(browser, 'nothing');
  } catch (error) {
    await browser.close();
    console.error('The dashboard did not load. Start the dev server with `npm run frontend:dev`.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }
  await browser.close();

  const failures = [];

  /* The regression itself: a command answering with an object must no longer
     cost the window, whatever else it costs. */
  if (objectReply.buttons === 0 || objectReply.headings === 0) {
    failures.push(
      'A command that answers with an object empties the dashboard. call() must ignore a non-string result.',
    );
  }
  if (objectReply.errors.length) {
    failures.push(`An object result raised: ${objectReply.errors[0].split('\n')[0]}`);
  }

  /* The path the helper actually takes, which must simply work. */
  if (emptyReply.buttons !== 5 || emptyReply.headings !== 1) {
    failures.push(
      `Enabling the traffic log left ${emptyReply.buttons} button(s) and ${emptyReply.headings} heading(s); expected 5 and 1.`,
    );
  }
  if (emptyReply.pressed !== 1) {
    failures.push('The traffic button did not report itself pressed, so its state is colour only.');
  }
  if (!/^Recording /.test(emptyReply.trafficLine ?? '')) {
    failures.push(`The traffic log line read "${emptyReply.trafficLine}"; expected it to report recording.`);
  }
  if (emptyReply.errors.length) {
    failures.push(`Enabling the traffic log raised: ${emptyReply.errors[0].split('\n')[0]}`);
  }

  if (failures.length) {
    console.error('The dashboard flow failed:');
    for (const failure of failures) console.error(`  ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('Accepting the traffic warning keeps the dashboard: 5 buttons, the heading, and');
  console.log(`a pressed toggle reading "${emptyReply.trafficLine}".`);
  console.log('A command answering with an object no longer empties the window either.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
