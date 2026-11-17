import {
  canonicalCraftCredit, craftPlan, craftedScore, gemOptions,
} from '../app/domain/runes/craft/rune-craft-end-state.ts';
import { buildReferenceDistribution } from '../app/domain/runes/percentile/reference-distribution.ts';
import { allStatIds } from '../app/domain/runes/rune-properties.ts';

const option = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const kind = option('case', 'speed');
const cutoff = Number(option('cutoff', kind === 'speed' ? 30 : 40));
const slot = Number(option('slot', 4));
const stars = Number(option('stars', 6));
const mainStatId = Number(option('main', 10));
const stateLimit = Number(option('states', 250000));
const cancelAfter = Number(option('cancel-after', 0));
const warmQueries = Number(option('warm-queries', 0));
const precision = option('precision', 'decision');
const prices = Float64Array.from(kind === 'speed'
  ? [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]
  : [0, 0.001, 0.2, 0.01, 0.7, 0.01, 0.2, 0, 1, 0.6, 0.5, 0.1, 0.2]);
const plan = craftPlan('standard', canonicalCraftCredit);
const reading = {
  id: `benchmark-${kind}`, mainStatId, permitted: true, alpha: 0.05,
  weightsByStatId: Object.fromEntries(allStatIds.map(statId => [statId, prices[statId]])),
  score(body) {
    return craftedScore(plan, gemOptions(plan, prices, body.slot, body.mainStatId, body.prefixStatId), prices,
      body.subProperties, body.prefixStatId === null ? 0 : body.prefixValue * prices[body.prefixStatId]);
  },
};
const started = performance.now();
const controller = new AbortController();
let requestedAt = null;
const timer = cancelAfter > 0 ? setTimeout(() => {
  requestedAt = performance.now();
  controller.abort();
}, cancelAfter) : null;
const distribution = await buildReferenceDistribution({ slot, stars, reading, stateLimit, signal: controller.signal });
let answer;
try {
  answer = await distribution.query(cutoff, 0.05, precision);
} catch (error) {
  if (error.name !== 'PercentileCancelledError') throw error;
  console.log(JSON.stringify({ kind, cancelled: true, requestedAfterMs: requestedAt - started,
    reportedAfterRequestMs: performance.now() - requestedAt, totalMs: performance.now() - started,
    reportedAfterScheduledRequestMs: performance.now() - started - cancelAfter,
    peakRssKiB: process.resourceUsage().maxRSS }));
  process.exit(0);
} finally {
  if (timer !== null) clearTimeout(timer);
}
const coldMs = performance.now() - started;
const warmStarted = performance.now();
const repeated = await distribution.query(cutoff, 0.05, precision);
const cachedMs = performance.now() - warmStarted;
const distinctStarted = performance.now();
for (let at = 1; at <= warmQueries; at += 1) await distribution.query(cutoff + 10 * at / warmQueries, 0.05);
console.log(JSON.stringify({ kind, slot, stars, mainStatId, cutoff, stateLimit, precision, coldMs,
  cachedMs, warmQueries, distinctWarmMs: performance.now() - distinctStarted, peakRssKiB: process.resourceUsage().maxRSS,
  status: answer.status, tail: [answer.tail.low, answer.tail.high], passes: answer.passes,
  cacheAgrees: JSON.stringify(answer) === JSON.stringify(repeated) }));
