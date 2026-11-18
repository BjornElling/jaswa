import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const file = process.argv[2];
if (!file) throw new Error('Pass a local game export or tests/fixtures/craft-account.json.');
const repetitions = Number(process.argv[3] ?? 5);
const raw = JSON.parse(readFileSync(file, 'utf8'));
const memory = process.argv.includes('--memory');
const cases = process.argv.includes('--statistics') ? [true] : process.argv.includes('--account') ? [false] : [false, true];
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu'] });
const cdp = memory ? await browser.newBrowserCDPSession() : null;

async function sampleMemory() {
  if (!cdp) return null;
  const { targetInfos } = await cdp.send('Target.getTargets');
  const targets = targetInfos.filter(({ type }) => type === 'worker' || type === 'page');
  const samples = await Promise.all(targets.map(async ({ targetId, url }) => {
    try {
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
      let listener;
      try {
        const usage = new Promise((resolve) => {
          listener = (event) => {
            const response = JSON.parse(event.message);
            if (event.sessionId === sessionId && response.id === 1) resolve(response.result);
          };
          cdp.on('Target.receivedMessageFromTarget', listener);
        });
        await cdp.send('Target.sendMessageToTarget', {
          sessionId, message: JSON.stringify({ id: 1, method: 'Runtime.getHeapUsage' }),
        });
        const result = await Promise.race([usage, delay(300)]);
        return { url, bytes: result ? result.usedSize + result.backingStorageSize : 0 };
      } finally {
        cdp.off('Target.receivedMessageFromTarget', listener);
        await cdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
      }
    } catch { return { url, bytes: 0 }; }
  }));
  return {
    combined: samples.reduce((total, sample) => total + sample.bytes, 0),
    advice: Math.max(0, ...samples.filter(({ url }) => url.includes('rune-advice-worker')).map(({ bytes }) => bytes)),
  };
}

try {
  console.log(JSON.stringify({ chromium: browser.version(), repetitions }));
  for (const card of [false, true]) for (const statisticsFirst of cases) for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route('http://127.0.0.1:37654/preferences', (route) => route.fulfill({ status: 404, json: {} }));
    await page.goto('http://localhost:3000/');
    await page.getByRole('navigation').waitFor();
    let stopMemory = false;
    const peak = { combined: 0, advice: 0 };
    const sampling = cdp && (async () => {
      while (!stopMemory) {
        const sample = await sampleMemory();
        if (sample) {
          peak.combined = Math.max(peak.combined, sample.combined);
          peak.advice = Math.max(peak.advice, sample.advice);
        }
        await delay(150);
      }
    })();
    const timings = await page.evaluate(async ({ raw, card, statisticsFirst }) => {
      const { createImportedGame, validateGameFile } = await import('/app/ingest/game-export.ts');
      const { referenceLines } = await import('/app/domain/reference/rune-reference-stats.ts');
      const { defaultRuneRoles } = await import('/app/domain/profiles/rune-roles.ts');
      const { defaultRunePotentialSettings } = await import('/app/domain/profiles/preference-defaults.ts');
      const { calculateRuneAdvice, cancelRuneAdvice, runeAdviceChannel } = await import('/app/workspace/jobs/rune-advice-client.ts');
      const { calculateRuneStatistics } = await import('/app/workspace/jobs/rune-statistics-client.ts');
      const game = createImportedGame('benchmark.json', raw, validateGameFile(raw));
      const runes = game.snapshot.runes;
      const roles = defaultRuneRoles();
      const base = new Map([...referenceLines(game.data)].map(([type, line]) => [type, line.stats]));
      const settings = { ...defaultRunePotentialSettings, powerUpPolicy: 3, runeQuality: 3, acceptedRunes: 3, brokenRunes: 3, intangibleRunes: 1,
        neverSellPreGrindSpeed: false, neverSellPotentialValue: false, neverSellEngravedPlacements: false, neverSellReappTargets: false };
      const request = { runes, roles, base, settings, preferWebGpu: card };
      const stats = {};
      const marks = [];
      const time = async (label, call) => {
        const start = performance.now();
        const outcome = await call((progress) => { if (progress === null) marks.push(performance.now() - start); });
        if (outcome.status !== 'done') throw new Error(label + ' ' + JSON.stringify(outcome));
        stats[label] = { ms: Math.round(performance.now() - start), backend: outcome.backend,
          preparationMs: Math.round(marks.pop() ?? 0) };
      };
      const statistics = async () => {
        await time('statisticsFirst', () => calculateRuneStatistics(request));
        await time('statisticsPolicyChange', () => calculateRuneStatistics({ ...request, settings: { ...settings, runeQuality: 4 } }));
      };
      if (statisticsFirst) {
        await statistics();
        return { runes: runes.length, cores: navigator.hardwareConcurrency, card, statisticsFirst, ...stats };
      }
      await time('accountFirst', (progress) => calculateRuneAdvice(request, undefined, progress));
      await time('accountWarm', (progress) => calculateRuneAdvice(request, undefined, progress));
      await time('accountPolicyChange', (progress) => calculateRuneAdvice({
        ...request, settings: { ...settings, acceptedRunes: 4 },
      }, undefined, progress));
      const overlay = runeAdviceChannel();
      const one = runes.find(({ level }) => level === 9) ?? runes[0];
      await time('overlayWarm', (progress) => overlay.calculate({ ...request, runes: [one], explain: true }, undefined, progress));
      await time('roleEdit', (progress) => calculateRuneAdvice({
        ...request, roles: roles.map((role, at) => at === 0
          ? { ...role, targets: { ...role.targets, hp: (role.targets.hp ?? 0) + 2000 } } : role),
      }, undefined, progress));
      let started;
      const working = new Promise((resolve) => { started = resolve; });
      const pending = calculateRuneAdvice(request, started);
      await working;
      const start = performance.now();
      cancelRuneAdvice();
      if ((await pending).status !== 'superseded') throw new Error('Cancelled advice returned an answer.');
      return { runes: runes.length, cores: navigator.hardwareConcurrency, card, statisticsFirst,
        ...stats, cancelMs: Math.round(performance.now() - start) };
    }, { raw, card, statisticsFirst }).finally(() => { stopMemory = true; });
    await sampling;
    console.log(JSON.stringify({ ...timings, ...(memory ? { peak } : {}) }));
    await page.close();
  }
} finally {
  await browser.close();
}
