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
import { createServer } from 'vite';

const server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true } });

try {
  const { classifyHelperProfile } = await server.ssrLoadModule('/app/lib/helper-client.ts');

  /** A minimal account the reader accepts, so a test can spoil one field at a time. */
  const account = (artifacts) => ({
    wizard_id: 1,
    unit_list: [{ unit_id: 10, wizard_id: 1, unit_master_id: 14314, artifacts }],
    runes: [{ rune_id: 20, set_id: 1 }],
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
  /* Effect 221 rolls 25-40 and this line claims 400 with no power-ups: past any
     reachable ceiling, so the reader refuses it as it refuses real corruption. */
  const unreadable = {
    ...readable,
    sec_effects: [[215, 7, 0, 0, 0], [222, 13, 2, 0, 0], [221, 400, 0, 0, 5], [218, 0.9, 2, 0, 0]],
  };

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
  assert.match(bad.reason, /equipped artifact JASWA cannot read/,
    'the rejection carries the same sentence the file route shows');
  assert.deepEqual(bad.identity, { instanceId: 'helper-1', sessionId: 1, revision: 4 },
    'the rejection names the snapshot, so the poll reports it once rather than every two seconds');

  /* A malformed envelope is the helper misbehaving rather than the account being
     unreadable, and there is nothing the user can act on — it stays silent. */
  assert.equal(classifyHelperProfile({ instanceId: '', revision: -1 }).state, 'unavailable',
    'an envelope that is not a snapshot stays silent');
  assert.equal(classifyHelperProfile(null).state, 'unavailable',
    'an absent snapshot stays silent');

  console.log('Direct import reports an unreadable account with the reason the file route gives.');
} finally {
  await server.close();
}
