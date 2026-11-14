/**
 * Direct import must say *why* it refused a snapshot, in the words the file
 * route uses.
 *
 * This is the failure the check exists for: one unreadable artifact made
 * `readHelperProfile` answer `null`, the polling loop returned without a word,
 * and the dashboard went on reading "Connected" while the account silently
 * aged. A user could only discover the reason by exporting a JSON file and
 * loading it through the other route — which is not a diagnosis path, it is an
 * accident.
 *
 * The rejection therefore has to carry its reason, and has to stay
 * distinguishable from a helper that simply has nothing to serve: the second is
 * ordinary — the game is closed — and reporting it would accuse the user's
 * account of being broken every time they quit.
 */
import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });

try {
  const { classifyHelperProfile, checkHelperConnection, readHelperProfile } = await server.ssrLoadModule('/app/platform/helper-client.ts');
  const { helperStatusMessage } = await server.ssrLoadModule('/app/workspace/helper-status.ts');

  /** A minimal account the reader accepts, so a test can spoil one field at a time. */
  const account = (artifacts) => ({
    wizard_id: 1,
    unit_list: [{ con: 600, atk: 600, def: 600, spd: 100, critical_rate: 15, critical_damage: 50, resist: 15, accuracy: 0, unit_id: 10, wizard_id: 1, unit_master_id: 14314, artifacts }],
    /* `extra` is the rarity. The reader requires it, because a rune
       whose rarity the vocabulary does not cover is rejected rather than
       given a fallback (`AGENTS.md` §0.1). */
    runes: [{ rune_id: 20, set_id: 1, slot_no: 1, class: 6, rank: 5, extra: 5, upgrade_curr: 0, occupied_type: 2, occupied_id: 0, pri_eff: [3, 22], prefix_eff: [0, 0], sec_eff: [] }],
    artifacts: [],
    relics: [],
    rune_craft_item_list: [],
  });

  const readable = {
    rid: 30, type: 1, attribute: 4, unit_style: 0, natural_rank: 5, rank: 5, level: 15,
    pri_effect: [100, 1500, 15, 0, 0],
    sec_effects: [[215, 7, 0, 0, 0], [222, 13, 2, 0, 0], [221, 37, 0, 0, 5], [218, 0.9, 2, 0, 0]],
    occupied_id: 10, locked: 0, source: 50001, extra: [], date_add: '2026-08-28 17:22:22',
  };
  /* An unknown engrave attribute cannot match any monster, so it must be rejected. */
  const unreadable = { ...readable, attribute: 999 };

  const envelope = (data) => ({
    updatedAt: '2026-09-05T09:00:08Z', instanceId: 'helper-1', revision: 4, sessionId: 1,
    source: 'live', data,
  });

  const good = classifyHelperProfile(envelope(account([readable])));
  assert.equal(good.state, 'ready', 'a readable account is served through');
  assert.equal(good.profile.revision, 4, 'the served snapshot keeps its revision');

  const bad = classifyHelperProfile(envelope(account([unreadable])));
  assert.equal(bad.state, 'unreadable',
    'an account JASWA cannot read is a reportable rejection, not an absent snapshot');
  assert.match(bad.reason, /engraved artifact JASWA cannot read/,
    'the rejection carries the same sentence the file route shows');
  assert.deepEqual(bad.identity, { instanceId: 'helper-1', sessionId: 1, revision: 4 },
    'the rejection names the snapshot, so the poll reports it once rather than every two seconds');

  /* A malformed envelope is the helper misbehaving rather than the account being
     unreadable, and there is nothing the user can act on — it stays silent. */
  assert.equal(classifyHelperProfile({ instanceId: '', revision: -1 }).state, 'unavailable',
    'an invalid envelope is unavailable');
  assert.equal(classifyHelperProfile(null).state, 'unavailable',
    'an absent snapshot is unavailable');

  assert.match(classifyHelperProfile(null).reason, /Report Issue/);
  assert.match(classifyHelperProfile({ ...envelope(account([readable])), updatedAt: 'invalid' }).reason, /invalid snapshot/);

  assert.equal(bad.data.unit_list[0].artifacts[0].attribute, 999, 'a report retains the exact rejected record');
  const oldWindow = globalThis.window;
  const oldFetch = globalThis.fetch;
  globalThis.window = { setTimeout, clearTimeout };
  try {
    const health = { running: true, profileReady: false, restartRequired: false, gameStartedBeforeHelper: false, gameLoginPending: false, gameRunning: true, instanceId: 'one', sessionId: 1, revision: 1, missedChanges: [], lastError: 'Capture failed. Save an error report.' };
    globalThis.fetch = async () => new Response(JSON.stringify(health));
    assert.match((await checkHelperConnection()).detail, /Capture failed/);
    assert.equal((await checkHelperConnection()).captureError, health.lastError);
    globalThis.fetch = async () => new Response(JSON.stringify({
      ...health, lastError: null, restartRequired: true, gameStartedBeforeHelper: true,
    }));
    const startedTooSoon = await checkHelperConnection();
    assert.equal(startedTooSoon.captureError, null);
    assert.equal(startedTooSoon.restartRequired, true);
    assert.equal(startedTooSoon.gameStartedBeforeHelper, true);
    assert.match(startedTooSoon.detail, /already running when the helper started/,
      'JASWA distinguishes a game that predates the helper from ordinary waiting');
    globalThis.fetch = async () => new Response(JSON.stringify({
      ...health, lastError: null, gameLoginPending: true,
    }));
    const pendingLogin = await checkHelperConnection();
    assert.equal(pendingLogin.captureError, null);
    assert.equal(pendingLogin.restartRequired, false);
    assert.match(pendingLogin.detail, /seen a Summoners War connection but no account login yet/,
      'a delayed connection never claims that the helper started too late');
    /* Whether the game runs is the helper's answer, read as it gives it. */
    const quiet = { ...health, lastError: null };
    globalThis.fetch = async () => new Response(JSON.stringify(quiet));
    assert.match((await checkHelperConnection()).detail, /Summoners War is running/);
    assert.equal((await checkHelperConnection()).gameRunning, true);
    globalThis.fetch = async () => new Response(JSON.stringify({ ...quiet, gameRunning: false }));
    assert.match((await checkHelperConnection()).detail, /waiting in ambush/);
    assert.equal((await checkHelperConnection()).gameRunning, false);
    /* An older helper that lacks a field of today's status is cured by the
       update, so that is what it says — never "restart it and the game". */
    const { gameRunning: _absent, ...older } = quiet;
    globalThis.fetch = async () => new Response(JSON.stringify({ ...older, version: '1.0.0' }));
    const outdated = await checkHelperConnection();
    assert.equal(outdated.state, 'unavailable');
    assert.equal(outdated.updateAvailable, true);
    assert.match(helperStatusMessage(outdated), /older than JASWA. Update it/);
    globalThis.fetch = async () => new Response(JSON.stringify(older));
    assert.match(helperStatusMessage(await checkHelperConnection()), /could not load game data/,
      'a status nobody can place is still a report to save');
    globalThis.fetch = async () => new Response('{invalid');
    /* A body that is not JSON came from a helper that answered: it is an answer
       JASWA cannot read, never a helper that is not running. */
    assert.equal((await checkHelperConnection()).state, 'unavailable');
    assert.match((await checkHelperConnection()).detail, /not in any known language/);
    assert.match((await readHelperProfile()).reason, /could not read the helper snapshot/);
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    /* A helper that cannot be reached still has to say so in a sentence the user
       can act on, and carry the raw reason an error report is made of. */
    assert.equal((await checkHelperConnection()).captureError, null);
    assert.match((await checkHelperConnection()).detail, /Helper is not running/);
    assert.match((await checkHelperConnection()).detail, /\(.+\)/);
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    assert.match((await readHelperProfile()).reason, /HTTP 503/);
  } finally { globalThis.window = oldWindow; globalThis.fetch = oldFetch; }

  console.log('Direct import reports an unreadable account with the reason the file route gives.');
} finally {
  await server.close();
}
