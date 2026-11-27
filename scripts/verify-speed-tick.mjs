/**
 * Holds Speed Tuning to the rules `docs/SPEED-TICK-CANONICAL.md` states.
 *
 * Four things are checked, each against the real modules rather than a copy of
 * their arithmetic:
 *
 * 1. The combat-speed formula: one rounding up over the whole sum, Swift exact
 *    in battle and rounded in display speed, and a speed buff on the rounded
 *    figure, not rounded again — the worked figures from the canonical document
 *    and SWCalc's.
 * 2. The clock: the tick table, highest bar first, one turn per tick, overflow
 *    lost, ties reported, and a boost moving a slower ally ahead of a faster
 *    enemy exactly as Ellia's inequality says it should.
 * 3. The data: every speed leader, the Swarfarm skill reading (numbered,
 *    described and unreadable effects), and every tuned dungeon present.
 * 4. The page's promise: a member is out of place exactly when its first turn
 *    ranks elsewhere among the team's first turns than the user put it, and
 *    an interval it prints is the truth — inside it the member moves strictly
 *    between its neighbours in the order, one combat speed outside it does
 *    not — across a sweep of generated teams.
 */
import assert from 'node:assert/strict';
import {
  battleSpeedPercent, combatSpeed, displaySpeed, displayedSwiftBonus, everyoneMoved, leaderAreaReaches, leaderSpeedPercent,
  runeSpeedForDisplay, simulateBattle, speedBuffPotency, ticksToFirstTurn, totemPercentByLevel,
} from '../app/domain/speed/speed-tick.ts';
import { describeTurnEffect, leaderSkill, shortLeaderSkill, speedLeaderSkill, speedSkillProfile } from '../app/domain/speed/speed-skills.ts';
import { skillReadings, wordingNeedingDecision } from '../app/domain/speed/speed-skill-readings.ts';
import speedSkillData from '../app/data/swarfarm-speed-skills.json' with { type: 'json' };
import { dungeonIds, fastestEnemySpeed, speedContent, speedContents } from '../app/domain/speed/speed-contents.ts';
import { accuracyCeilings, usefulAccuracy } from '../app/domain/combat/accuracy-ceiling.ts';
import { enemyNamesOf, gameTurnOrder, readSpeedTeam } from '../app/domain/speed/speed-tuning-analysis.ts';
import { readSpeedIntervals } from '../app/domain/speed/speed-tuning-intervals.ts';
import { presetContent, presetContents } from '../app/domain/placements/preset-contents.ts';
import {
  canKeepSpeedTuning, isSpeedTuningPreferences, presetSpeedTeam, readSpeedTuningPreferences, teamSpeedTuning, withTeamSpeedTuning,
} from '../app/domain/profiles/speed-tuning-preferences.ts';
import { accountBuildingsProblem, readBuildingBonuses, readSkyTribeTotem } from '../app/domain/account/account-buildings.ts';
import { calculateMonsterTotals, monsterSpeedParts } from '../app/domain/combat/monster-stats.ts';
import { hasMonsterCatalogEntry } from '../app/domain/monsters/monster-catalog.ts';

const baseFacts = { con: 600, atk: 600, def: 600, critical_rate: 15, critical_damage: 50, resist: 15, accuracy: 0 };

let checks = 0;
function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

/* 1. Combat speed. */
const sheet = (baseSpeed, runeSpeed, swift, percentOfBase) => ({ baseSpeed, runeSpeed, swift, percentOfBase });
check(combatSpeed(sheet(111, 100, true, 15)) === 256, 'Bernard-like: ⌈111 × 1.40 + 100⌉ = ⌈255.4⌉ = 256');
check(combatSpeed(sheet(100, 0, false, 0)) === 100, 'no bonus leaves base speed');
check(combatSpeed(sheet(101, 0, false, 15)) === 117, 'one rounding up: ⌈116.15⌉');
check(combatSpeed(sheet(99, 10, false, 2.5)) === 112, 'a half-percent totem step stays exact: ⌈99 × 1.025 + 10⌉ = ⌈111.475⌉');
check(combatSpeed(sheet(104, 145, false, 15)) === 265, "SWCalc's Agrius: ⌈104 × 1.15 + 145⌉ = ⌈264.6⌉ = 265");
check(displayedSwiftBonus(111) === 28, 'display rounds Swift up: 27.75 → 28');
check(displaySpeed(111, true, 100) === 239, 'display speed is base + displayed Swift + runes');
check(runeSpeedForDisplay(111, true, 239) === 100, 'a display speed maps back to its rune speed');
/* Battle reads Swift as the exact quarter, inside the same single rounding as
   the totem: display's rounded 28 is never added on its own. */
check(combatSpeed(sheet(111, 100, true, 0)) === 239, 'Swift exact in battle: ⌈238.75⌉');
check(combatSpeed(sheet(113, 100, true, 15)) === 259, 'Swift and totem share one rounding: ⌈258.2⌉');
check(totemPercentByLevel.length === 21 && totemPercentByLevel[20] === 15 && totemPercentByLevel[3] === 2.5, 'totem table: 21 entries, 15 % at level 20');
check(leaderSpeedPercent({ percent: 24, area: 'Arena', element: null }, 'dungeon', 'Fire') === 0, 'an arena lead does not count in dungeons');
check(leaderSpeedPercent({ percent: 24, area: 'Arena', element: null }, 'arena', 'Fire') === 24, 'an arena lead counts in arena');
check(leaderSpeedPercent({ percent: 28, area: 'Dungeon', element: null }, 'dungeon', 'Fire') === 28, 'a dungeon lead counts in dungeons');
check(leaderSpeedPercent({ percent: 33, area: 'Guild', element: null }, 'arena', 'Fire') === 0, 'a guild lead does not count in arena');
check(leaderSpeedPercent({ percent: 33, area: 'Guild', element: null }, 'guild', 'Fire') === 33, 'a guild lead counts in guild content');
check(leaderSpeedPercent({ percent: 28, area: 'Dungeon', element: null }, 'guild', 'Fire') === 0, 'a dungeon lead does not count in guild content');
check(leaderSpeedPercent({ percent: 28, area: 'Dungeon', element: null }, 'unnamed', 'Fire') === 0
  && leaderSpeedPercent({ percent: 30, area: 'General', element: null }, 'unnamed', 'Fire') === 30,
  'where the content is not yet named, only a lead that counts everywhere counts');
check(leaderSpeedPercent({ percent: 30, area: 'General', element: 'Wind' }, 'arena', 'Fire') === 0, 'an element lead skips other elements');
check(leaderSpeedPercent({ percent: 30, area: 'General', element: 'Wind' }, 'dungeon', 'Wind') === 30, 'an element lead reaches its element everywhere');
check(leaderSpeedPercent({ percent: 30, area: 'Arena', element: 'Wind' }, 'dungeon', 'Wind') === 0, 'an element lead keeps its area');
/* A raid counts General leads and element leads, and no Dungeon lead (STAT-4). */
check(leaderSpeedPercent({ percent: 28, area: 'Dungeon', element: null }, 'raid', 'Fire') === 0, 'a dungeon lead does not count in a raid');
check(leaderSpeedPercent({ percent: 30, area: 'General', element: null }, 'raid', 'Fire') === 30
  && leaderSpeedPercent({ percent: 30, area: 'General', element: 'Fire' }, 'raid', 'Fire') === 30, 'General and element leads count in a raid');
/* Swarfarm writes an element lead two ways; the snapshot must keep the element
   whichever it was. Agrius leads fire monsters only. */
const agrius = leaderSkill(34112);
check(agrius?.attribute === 'Critical Rate' && agrius.element === 'Fire', 'Agrius leads fire monsters only');
check(shortLeaderSkill(agrius) === 'CRI Rate 30 % · Fire', `Agrius's lead names its element (${shortLeaderSkill(agrius)})`);
/* Where a lead counts is one rule for every attribute: the speed figure above
   and the editor's red mark must agree. */
for (const leaderArea of ['General', 'Arena', 'Dungeon', 'Guild']) {
  for (const area of ['arena', 'dungeon', 'guild', 'raid', 'unnamed']) {
    const counts = leaderSpeedPercent({ percent: 10, area: leaderArea, element: 'Fire' }, area, 'Fire') > 0;
    check(leaderAreaReaches(leaderArea, area) === counts, `${leaderArea} lead in ${area}: reach and speed agree`);
  }
}
/* Rift Raid 1–3 fight under all three leaders. Speed leads for the same
   monsters do not stack, the largest counting; for different monsters they add up. */
check(battleSpeedPercent([{ percent: 19, area: 'General', element: null }, { percent: 24, area: 'General', element: null }], 'raid', 'Fire') === 24,
  'two speed leads give the larger, not the sum');
check(battleSpeedPercent([{ percent: 33, area: 'General', element: 'Wind' }, { percent: 24, area: 'General', element: null }], 'raid', 'Fire') === 24,
  'a lead that does not reach a member leaves the next one to count');
check(battleSpeedPercent([], 'raid', 'Fire') === 0, 'no leader, no lead');
check(battleSpeedPercent([{ percent: 24, area: 'General', element: null }, { percent: 15, area: 'General', element: 'Fire' }], 'raid', 'Fire') === 39
  && battleSpeedPercent([{ percent: 24, area: 'General', element: null }, { percent: 15, area: 'General', element: 'Fire' }], 'raid', 'Wind') === 24,
  'a general and an element speed lead add up on that element, and only there');
check(battleSpeedPercent([{ percent: 15, area: 'General', element: 'Fire' }, { percent: 19, area: 'General', element: 'Fire' }], 'raid', 'Fire') === 19,
  'two speed leads for the same element do not add up');

/* 2. The clock. */
for (const [speed, ticks] of [[1429, 1], [715, 2], [477, 3], [358, 4], [286, 5], [285, 6], [239, 6], [143, 10]]) {
  check(ticksToFirstTurn(speed) === ticks, `${speed} combat speed needs ${ticks} ticks`);
}
/* A raid ticks at 4.5 %: ⌈10,000 / (4.5 · n)⌉ moves within n ticks. */
for (const [speed, ticks] of [[2223, 1], [2222, 2], [1112, 2], [741, 3], [300, 8]]) {
  check(ticksToFirstTurn(speed, 'raid') === ticks, `${speed} combat speed needs ${ticks} raid ticks`);
}
const unit = (key, speed, effects = [], side = 'ally', extra = {}) => ({ key, side, speed, firstTurn: effects, laterTurns: effects, ...extra });
{
  const trace = simulateBattle([unit('slow', 280), unit('fast', 300)], { done: everyoneMoved(['slow', 'fast']) });
  check(trace.events[0].key === 'fast' && trace.events[1].key === 'slow', 'the fuller bar moves first');
  check(trace.events[0].tick === 5 && trace.events[1].tick === 6, 'one turn per tick: the second mover waits for the next tick');
}
{
  const trace = simulateBattle([unit('a', 300), unit('b', 300)], { done: everyoneMoved(['a', 'b']) });
  check(trace.events[0].tiedWith.includes('b'), 'an exact tie is reported');
}
{
  /* A raid's bar fills at 4.5 % a speed point: 300 moves on tick 8, not 5. */
  const raid = simulateBattle([unit('a', 300)], { done: everyoneMoved(['a']), tick: 'raid' });
  check(raid.events[0].tick === 8 && raid.snapshots[0].bars.a === 1_350, `a raid tick is 4.5 % of combat speed (${raid.snapshots[0].bars.a})`);
}
{
  /* §3.2: a tie between the team and the enemy goes to the team, the attacker,
     whichever is listed first. */
  for (const order of [['ally', 'enemy'], ['enemy', 'ally']]) {
    const trace = simulateBattle(order.map((side) => unit(side, 169, [], side)), { done: everyoneMoved(['ally', 'enemy']) });
    check(trace.events[0].key === 'ally', `a tie with the enemy goes to the team (${order.join(' before ')})`);
  }
}
{
  /* Ellia §Speed Tuning: after the booster's turn at n ticks, an ally needs
     (n+1)·τ·S₂ + B ≥ (n+1)·τ·Sₑ to go next. With S₁ = 300 (n = 5), B = 30 %
     and Sₑ = 299, S₂ ≥ 299 − 30 / (6 × 0.07) = 227.6. */
  const boost = [{ kind: 'allies-attack-bar', amount: 3000, skipsSimilar: false }];
  const run = (second) => simulateBattle(
    [unit('booster', 300, boost), unit('second', second), unit('enemy', 299, [], 'enemy')],
    { done: everyoneMoved(['booster', 'second', 'enemy']) },
  ).events.map((event) => event.key);
  check(run(228).join() === 'booster,second,enemy', '228 combat speed holds the second turn after a 30 % boost');
  check(run(227).join() === 'booster,enemy,second', '227 combat speed lets the enemy cut in');
}
{
  /* §4: a one-ally boost goes to the lowest other bar under auto battle — never
     to the caster, whose bar has just emptied — unless the skill names the
     highest. The Giant's Keep team that showed it, at its combat speeds:
     Konamiya fills Teshar, who has just moved, and Teshar's second turn comes
     before Prilea's, as observed in the game on October 8, 2026. */
  const fill = (target) => [{ kind: 'ally-attack-bar', amount: 10_000, target }];
  const giants = (target) => simulateBattle(
    [unit('Prilea', 182), unit('Teshar', 181), unit('Konamiya', 176, fill(target)), unit('Homunculus', 173), unit('Lyn', 172)],
    { done: (events) => events.length >= 7 },
  );
  const lowest = giants('lowest-attack-bar');
  check(lowest.events.map((event) => event.key).join() === 'Prilea,Teshar,Konamiya,Homunculus,Lyn,Teshar,Prilea',
    `a filled bar goes to the lowest: Teshar moves again before Prilea (${lowest.events.map((event) => event.key).join()})`);
  check(lowest.events[2].allyBoosts.length === 1 && lowest.events[2].allyBoosts[0].key === 'Teshar' && lowest.events[2].allyBoosts[0].amount === 10_000,
    'the turn names the ally its boost went to');
  check(giants('highest-attack-bar').events[2].allyBoosts[0].key === 'Homunculus', 'a skill naming the highest bar boosts the highest');
  /* One target per turn: a fill and a buff in one skill reach the same ally. */
  const both = simulateBattle([unit('caster', 300, [...fill('lowest-attack-bar'), { kind: 'ally-speed-buff', turns: 2, target: 'lowest-attack-bar' }]),
    unit('fast', 290), unit('slow', 100)], { done: (events) => events.length >= 2 });
  check(both.events[0].allyBoosts[0].key === 'slow' && both.events[1].key === 'slow' && both.snapshots[both.events[1].tick - 1].bars.slow > 10_000,
    'a skill that fills a bar and grants a buff gives both to the same ally');
}
{
  const trace = simulateBattle([unit('buffer', 200, [{ kind: 'allies-speed-buff', turns: 2 }]), unit('ally', 100)], {
    done: (events) => events.filter((event) => event.key === 'ally').length >= 1,
  });
  const allyTurn = trace.events.find((event) => event.key === 'ally');
  /* Buffed from tick 8: 7 × 100 × 8 = 5,600, then 7 × 130 per tick → 100 % at tick 13. */
  check(allyTurn.tick === 13, `a speed buff speeds the ally's fill (turn at tick ${allyTurn.tick})`);
}
{
  /* The buff multiplies the rounded combat speed and is not rounded again
     (SWCalc §Speed): 101 buffed fills 7 × 131.3 = 919.1 hundredths a tick, not
     7 × ⌈131.3⌉ = 924. */
  const trace = simulateBattle([unit('buffer', 200, [{ kind: 'allies-speed-buff', turns: 2 }]), unit('ally', 101)], {
    done: (events) => events.some((event) => event.key === 'ally'),
  });
  const fill = Math.round((trace.snapshots[9].bars.ally - trace.snapshots[8].bars.ally) * 100);
  check(fill === 91_910, `a buffed tick is 7 × 101 × 1.3 exactly (${fill / 100})`);
}
{
  /* SPD UP Effect on the recipient's artifacts raises the buff to
     ⌊30 · (1 + effect)⌋ % (SWCalc: Agrius at +24 % is 37 %, +22 % is 36 %). */
  check(speedBuffPotency(0) === 30 && speedBuffPotency(24) === 37 && speedBuffPotency(22) === 36 && speedBuffPotency(16) === 34,
    'the speed buff is ⌊30 · (1 + SPD UP Effect)⌋ %');
  /* The Dragon's Lair team that showed it, at its combat speeds: Agrius's own
     buff after every turn takes his second turn before Julie's only once his
     artifacts lift it to 35 %, as the game played it on October 9, 2026. */
  const lair = (effect) => simulateBattle([
    unit('Agrius', 292, [{ kind: 'self-speed-buff', turns: 1 }], 'ally', { speedBuffPercent: speedBuffPotency(effect) }),
    unit('SilverTail', 183), unit('Julie', 175), unit('Liam', 169),
  ], { done: (events) => events.length >= 5 }).events.map((event) => event.key).join();
  check(lair(0) === 'Agrius,SilverTail,Julie,Agrius,Liam', `a plain 30 % buff leaves Agrius behind Julie (${lair(0)})`);
  check(lair(24) === 'Agrius,SilverTail,Agrius,Julie,Liam', `a 37 % buff puts Agrius before Julie (${lair(24)})`);
  /* The drawn trace says which fills ran buffed and where a turn left every bar. */
  const drawn = simulateBattle([unit('Agrius', 292, [{ kind: 'self-speed-buff', turns: 1 }, { kind: 'allies-attack-bar', amount: 2_000, skipsSimilar: false }]),
    unit('ally', 100)], { done: (events) => events.length >= 1 });
  const turnTick = drawn.snapshots[drawn.events[0].tick - 1];
  check(!turnTick.buffed.includes('Agrius') && turnTick.after.Agrius === 0 && turnTick.after.ally === turnTick.bars.ally + 2_000,
    'a turn records the bars it leaves: the mover emptied, the boost landed');
}
{
  /* §5.1: a skill behind a cooldown acts on the first turn only. */
  const boost = [{ kind: 'allies-attack-bar', amount: 3_000, skipsSimilar: false }];
  const trace = simulateBattle([unit('booster', 300, boost, 'ally', { laterTurns: [] }), unit('ally', 100)],
    { done: (events) => events.filter((event) => event.key === 'booster').length >= 2 });
  const [first, second] = trace.events.filter((event) => event.key === 'booster')
    .map((event) => trace.snapshots[event.tick - 1]);
  check(first.after.ally === first.bars.ally + 3_000 && second.after.ally === second.bars.ally,
    'a cooldown boost lands on the first turn and not on the second');
}
{
  /* §4.1: a joint attack brings the pulled ally's boost into the puller's turn.
     The pulled ally's "all allies" reaches the puller, whose bar has emptied,
     and the ally listed first with something to bring is the one pulled. */
  const pull = [{ kind: 'pull-allies', count: 1 }];
  const boiling = [{ kind: 'allies-attack-bar', amount: 2_000, skipsSimilar: true }];
  const trace = simulateBattle([
    unit('puller', 300, pull, 'ally', { laterTurns: [] }),
    unit('plain', 120),
    unit('booster', 100, [], 'ally', { jointAttack: boiling, similarBoostPassive: true }),
    unit('other', 110),
  ], { done: (events) => events.length >= 1 });
  const turn = trace.snapshots[trace.events[0].tick - 1];
  check(turn.after.puller === 2_000 && turn.after.plain === turn.bars.plain + 2_000 && turn.after.other === turn.bars.other + 2_000
    && turn.after.booster === turn.bars.booster, 'a pulled booster boosts every other ally, the puller included, and passes over itself');
  const withoutPartner = simulateBattle([unit('puller', 300, pull), unit('plain', 120)], { done: (events) => events.length >= 1 });
  const alone = withoutPartner.snapshots[withoutPartner.events[0].tick - 1];
  check(alone.after.puller === 0 && alone.after.plain === alone.bars.plain, 'a pull with nobody to bring a boost changes no bar');
}
{
  /* The SPD UP Effect is read off the copy's own engraved artifacts. */
  const line = (id, value) => [id, value, 0, 0, 0];
  const parts = monsterSpeedParts({ ...baseFacts, spd: 104, runes: [], artifacts: [
    { pri_effect: [101, 100], sec_effects: [line(206, 12), line(210, 3), line(206, 6), line(219, 2)] },
    { pri_effect: [100, 1500], sec_effects: [line(206, 6), line(214, 3), line(215, 5), line(218, 0.2)] },
  ] });
  check(parts.speedUpEffect === 24, `SPD UP Effect sums over every engraved artifact (${parts.speedUpEffect})`);
}
{
  /* Leo's Eye of the Storm (SWCalc: "non-Leo monsters are capped to the lowest
     Leo combat speed"), sparing a boss. */
  const leo = unit('leo', 150, [], 'ally', { capsOthersSpeed: true });
  const capped = simulateBattle([leo, unit('fast', 300)], { done: everyoneMoved(['leo', 'fast']) });
  /* Under the cap a 300 fills as a 150 Leo does, and the tie goes to the
     uncapped start speed (SWCalc; Ellia: "Under Leo, ties are broken by original
     SPD instead of placement"), whoever is listed first. */
  check(capped.events[0].key === 'fast' && capped.events[0].tiedWith.length === 0 && capped.events[0].tick === 10
    && capped.events[1].key === 'leo' && capped.events[1].tick === 11,
    'under the cap a 300 ties a 150 Leo on the bar and wins the tie on its start speed');
  const fasterEnemy = simulateBattle([leo, unit('enemy', 300, [], 'enemy')], { done: everyoneMoved(['leo', 'enemy']) });
  check(fasterEnemy.events[0].key === 'enemy', 'a faster enemy wins a tie on the bar before the attacker rule is asked');
  const levelEnemy = simulateBattle([unit('enemy', 150, [], 'enemy'), unit('ally', 150)], { done: everyoneMoved(['ally', 'enemy']) });
  check(levelEnemy.events[0].key === 'ally' && levelEnemy.events[0].tiedWith.includes('enemy'), 'at equal start speed the attacker wins, and the tie is reported');
  const twoLeos = simulateBattle([leo, unit('leo-2', 140, [], 'ally', { capsOthersSpeed: true }), unit('fast', 300)], { done: everyoneMoved(['leo', 'leo-2', 'fast']) });
  /* Held to the 140 Leo, the 300 ties it on tick 11 and wins on its start speed. */
  check(twoLeos.events[0].key === 'leo' && twoLeos.events.find((event) => event.key === 'fast').tick === 11
    && twoLeos.events.find((event) => event.key === 'leo-2').tick === 12, 'the slowest Leo sets the cap, and a Leo is not capped by another');
  const boss = simulateBattle([leo, unit('boss', 300, [], 'enemy', { exemptFromCap: true })], { done: everyoneMoved(['leo', 'boss']) });
  check(boss.events[0].key === 'boss' && boss.events[0].tick === 5, 'a boss is out of the cap\'s reach');
}
{
  const units = [
    unit('leo', 1, [], 'ally', { capsOthersSpeed: true }),
    unit('booster', 200, [
      { kind: 'ally-attack-bar', amount: 10_000, target: 'lowest-attack-bar' },
      { kind: 'ally-speed-buff', turns: 2, target: 'lowest-attack-bar' },
    ]),
    unit('ally', 150),
  ];
  for (const [tick, opening] of [['standard', 1429], ['raid', 2223]]) {
    for (const tickLimit of [opening - 1, opening, opening + 10]) {
      const options = { done: () => false, tick, tickLimit };
      const drawn = simulateBattle(units, options);
      const search = simulateBattle(units, { ...options, snapshots: false });
      assert.deepEqual(search.events, drawn.events, `${tick} at tick limit ${tickLimit}: skipping empty ticks preserves every turn`);
      checks += 1;
    }
  }
}

{
  const selfBoost = [{ kind: 'self-attack-bar', amount: 5_000 }];
  const searchAt = (speed) => readSpeedIntervals({
    allies: [
      unit('booster', 328, [{ kind: 'ally-attack-bar', amount: 10_000, target: 'lowest-attack-bar' }]),
      unit('above', 346, selfBoost),
      unit('subject', speed, selfBoost),
      unit('below', 323),
      unit('other', 309, selfBoost),
    ],
    minimums: [100, 100, 100, 100, 100],
    opponent: 'none',
    tick: 'standard',
  })[2];
  assert.deepEqual(searchAt(250), { minimum: 119, maximum: 176 }, 'the slower interval wins at equal distance');
  assert.deepEqual(searchAt(251), { minimum: 324, maximum: 345 }, 'one point faster makes the upper interval nearer');
  checks += 2;
}

/* 3. The data. */
check(speedLeaderSkill(14712)?.percent === 28 && speedLeaderSkill(14712)?.area === 'Dungeon', 'Verdehile leads +28 % in dungeons');
check(speedLeaderSkill(11533) === null, 'Bernard has no speed lead');
check(shortLeaderSkill(leaderSkill(14712)) === 'SPD 28 % · Dungeon', 'a lead is abbreviated as the editor shows it');
{
  const bernard = speedSkillProfile({ skills: [[2553, 3], [2558, 2], [2563, 3]] });
  check(bernard.effects.some((effect) => effect.kind === 'allies-attack-bar' && effect.amount === 3450), 'Tailwind at level 3 boosts 34.5 %');
  check(bernard.effects.some((effect) => effect.kind === 'allies-speed-buff' && effect.turns === 2), 'Tailwind grants a 2-turn speed buff');
  const tailwindAtOne = speedSkillProfile({ skills: [[2563, 1]] });
  check(tailwindAtOne.effects.some((effect) => effect.kind === 'allies-attack-bar' && effect.amount === 3000), 'skill-ups above the copy\'s level are not counted');
  const megan = speedSkillProfile({ skills: [[7361, 2]] });
  check(describeTurnEffect(megan.effects[0]) === '+22 % attack bar to allies', 'an unnumbered boost is read from its description, with its skill-up');
  const verdehile = speedSkillProfile({ skills: [[6512, 1]] });
  check(verdehile.similarBoostPassive && verdehile.effects[0].kind === 'allies-attack-bar' && verdehile.effects[0].skipsSimilar, 'Boiling Blood passes over similar passives');
  check(speedSkillProfile({ skills: [[7813, 1]] }).capsOthersSpeed && !speedSkillProfile({ skills: [[2563, 3]] }).capsOthersSpeed,
    'Eye of the Storm marks Leo, and only Leo');
  const chasun = speedSkillProfile({ skills: [[9113, 2]] });
  check(chasun.effects.length === 0 && chasun.uncounted.includes('Fallen Blossoms'), 'a balanced bar is not counted, and says so');
  /* "Fills up an ally target's Attack Bar" is a full bar, to the lowest. */
  const konamiya = speedSkillProfile({ skills: [[1901, 9], [1906, 3], [1911, 6]] });
  check(konamiya.uncounted.length === 0 && konamiya.effects.length === 1 && konamiya.effects[0].kind === 'ally-attack-bar'
    && konamiya.effects[0].amount === 10_000 && konamiya.effects[0].target === 'lowest-attack-bar', 'Resurge fills the lowest ally\'s bar');
  const tacticalBomb = speedSkillProfile({ skills: [[17211, 1]] });
  check(tacticalBomb.effects.some((effect) => effect.kind === 'ally-attack-bar' && effect.target === 'highest-attack-bar'),
    'a skill naming the highest attack bar keeps its own target');
  const breeze = speedSkillProfile({ skills: [[11801, 1]] });
  check(breeze.effects.some((effect) => effect.kind === 'ally-attack-bar' && effect.target === 'lowest-attack-bar'),
    'a skill naming the lowest attack bar goes there');
  /* §5.1: Bernard's Tailwind has a cooldown and counts on his first turn only;
     Verdehile's Boiling Blood has none and counts on every one. */
  check(bernard.firstTurn.some((effect) => effect.kind === 'allies-attack-bar')
    && !bernard.laterTurns.some((effect) => effect.kind === 'allies-attack-bar'), 'Tailwind counts on the first turn only');
  check(verdehile.firstTurn.length === 1 && verdehile.laterTurns.length === 1, 'Boiling Blood counts on every turn');
  /* §4.1: Icaru (Water, 2A) pulls up to three allies with Team Up — only where
     a teammate has a boost to bring, and only on his first turn. Verdehile
     brings Boiling Blood, as it fires on any critical hit of hers. */
  const icaru = { skills: [[2051, 1], [2056, 1], [2061, 1]] };
  const verdehileCopy = { skills: [[6502, 1], [6507, 1], [6512, 1]] };
  const raoq = { skills: [[2052, 1], [2057, 1], [2062, 1]] };
  const pulling = speedSkillProfile(icaru, [icaru, verdehileCopy]);
  check(pulling.firstTurn.some((effect) => effect.kind === 'pull-allies' && effect.count === 3)
    && !pulling.laterTurns.some((effect) => effect.kind === 'pull-allies'), 'Team Up pulls on the first turn only');
  check(speedSkillProfile(icaru, [icaru, raoq]).effects.length === 0, 'a pull with no teammate to bring a boost is not counted');
  check(speedSkillProfile(verdehileCopy).jointAttack.some((skill) => skill.effects.some((effect) => effect.kind === 'allies-attack-bar' && effect.amount === 2_000)),
    'Verdehile brings Boiling Blood into a joint attack');
  check(speedSkillProfile({ skills: [[11801, 1]] }).jointAttack.length === 1, 'a first skill with a boost is brought into a joint attack');
  check(speedSkillProfile({ skills: [[12312, 1]] }).jointAttack.length === 0, 'a passive bound to its own turn is not');
}
{
  /* §5.3: a boost counts only where it happens on the monster's own turn. */
  const effectsOf = (id) => speedSkillProfile({ skills: [[id, 1]] }).effects;
  check(effectsOf(4812).length === 0, 'Narrow Escape needs a fatal blow from the enemy and is not counted');
  check(effectsOf(10015).length === 0, 'Conversion of Magic depends on harmful effects on the team and is not counted');
  check(effectsOf(2059).length === 0 && effectsOf(3156).length === 0, 'a boost behind the target\'s state or a kill is not counted');
  check(effectsOf(2064)[0]?.amount === 3_000, 'Mobilize fills 30 %, not the 35 % of its heal');
  check(effectsOf(7101)[0]?.amount === 3_000, 'Passing Time counts 10 % on each of its three critical hits');
  check(effectsOf(14612).length === 0, 'an enemy\'s lowered bar is not a boost to allies');
  /* A boost on other units' turns lands on exactly those turns. */
  const outlaw = speedSkillProfile({ skills: [[18014, 1]] });
  check(outlaw.firstTurn.length === 0 && outlaw.laterTurns.length === 0 && outlaw.onTurnsOf[0]?.amount === 1_000,
    'Outlaw gains on other units\' turns, never on its own');
  const onTurns = (of) => simulateBattle([
    unit('watcher', 100, [], 'ally', { onTurnsOf: [{ kind: 'attack-bar-on-turn-of', of, amount: 1_000 }] }),
    unit('friend', 300), unit('enemy', 290, [], 'enemy'),
  ], { done: (events) => events.length >= 2 });
  const gain = (trace, at) => trace.snapshots[trace.events[at].tick - 1].after.watcher - trace.snapshots[trace.events[at].tick - 1].bars.watcher;
  const others = onTurns('others');
  const enemies = onTurns('enemies');
  check(others.events[0].key === 'friend' && gain(others, 0) === 1_000 && gain(others, 1) === 1_000,
    'a boost on everybody else\'s turns lands on an ally\'s turn and an enemy\'s');
  check(gain(enemies, 0) === 0 && gain(enemies, 1) === 1_000, 'a boost on enemy turns does not land on an ally\'s turn');
  /* Every skill whose wording or figure needs a decision has one, so a
     refresh cannot bring a new misreading in unreviewed. */
  const undecided = speedSkillData.skills.filter((skill) => skill.effects.length > 0 && !skillReadings.has(skill.com2usId)).filter((skill) => {
    const read = speedSkillProfile({ skills: [[skill.com2usId, 1]] }).used.flatMap((used) => used.effects);
    const figureMissing = read.some((effect) => ('amount' in effect && effect.amount !== 10_000
      && !new RegExp(`(?:^|[^0-9.])${effect.amount / 100} ?%`).test(skill.description))
      || ('turns' in effect && !new RegExp(`(?:^|[^0-9])${effect.turns} turns?`).test(skill.description)));
    return figureMissing || wordingNeedingDecision.test(skill.description);
  });
  check(undecided.length === 0, `every skill that needs a reading decision has one in speed-skill-readings.ts; missing: ${undecided.map((skill) => `${skill.com2usId} ${skill.name}`).join(', ')}`);
  const known = new Set(speedSkillData.skills.map((skill) => skill.com2usId));
  const stale = [...skillReadings.keys()].filter((id) => !known.has(id));
  check(stale.length === 0, `every reading decision names a skill in the snapshot; unknown: ${stale.join(', ')}`);
}
for (const id of dungeonIds) {
  const content = speedContent(id);
  check(content.teamSize === 5 && content.stages.length >= 3 && content.stages.every((stage) => stage.speeds.length > 0 && stage.fastest === Math.max(...stage.speeds)),
    `${content.name} has a five-monster team and enemy stages`);
  check(content.stages.every((stage) => stage.resists.length === stage.speeds.length && stage.resists.every(Number.isFinite)),
    `${content.name} has a resistance for every enemy`);
  check(content.stages.every((stage) => stage.monsters.length === stage.speeds.length && stage.monsters.every(hasMonsterCatalogEntry)),
    `${content.name} names every enemy by a monster the catalogue knows`);
  check(content.stages.every((stage) => enemyNamesOf(stage).every((name) => !/^Enemy \d/.test(name))),
    `${content.name} has a readable or accepted name for every enemy`);
  const highest = Math.max(...content.stages.flatMap((stage) => stage.resists));
  check(fastestEnemySpeed(id) === Math.max(...content.stages.map((stage) => stage.fastest)) && usefulAccuracy(id) === Math.max(0, highest - 15),
    `${content.name}'s fastest enemy and useful accuracy follow its stages`);
}
check(speedContents.find((content) => content.id === 'arena')?.teamSize === 4, 'arena offence is four monsters');
check(speedContent('siege').teamSize === 3 && speedContent('siege').area === 'guild' && speedContent('siege').tick === 'standard',
  'a Siege Battle attack is three monsters, ticking at 7 % under guild leads');
check(speedContents.filter((content) => content.opponent === 'worst-case').map((content) => content.id).join() === 'arena,siege',
  'only the attacks on another player\'s team face the worst-case enemy');
check(speedContents.every((content) => (content.opponent === 'stages') === (content.stages.length > 0)),
  'a content faces stages exactly when it has them');
/* The profile's Accuracy goal: a Cairos area reads its Speed Tuning floor, so
   the two can never name two figures for one dungeon; the rest are sourced. */
for (const [contentId, dungeonId] of [['giants', 'giants'], ['dragons', 'dragons'], ['steel', 'steel'], ['punisher', 'punisher']]) {
  check(accuracyCeilings(contentId)[0]?.percent === usefulAccuracy(dungeonId), `${contentId}'s Accuracy goal is its Speed Tuning floor's`);
}
check(accuracyCeilings('giants')[0]?.part === 'Abyss Hard' && accuracyCeilings('steel')[0]?.part === 'B10', 'a Cairos goal names its floor as the game does');
check(accuracyCeilings('rift-raid')[0]?.percent === 15, 'R5 asks 15 % Accuracy: its boss resists 30 %');
check(accuracyCeilings('fire-beast')[0]?.percent === 0 && accuracyCeilings('dreaming-fairies')[0]?.percent === 35
  && accuracyCeilings('roaring-beasts')[0]?.percent === 34 && accuracyCeilings('arena-attack')[0]?.percent === 85, 'the sourced Accuracy goal');
check(accuracyCeilings('temple-of-chaos')[0]?.part === 'Level 100' && accuracyCeilings('temple-of-chaos')[0]?.percent === 35
  && accuracyCeilings('raging-fires').length === 0 && accuracyCeilings(undefined).length === 0,
  'a sourced area names its goal and areas no source covers name no goal');

/* The totem, and its import boundary. */
check(readSkyTribeTotem({ deco_list: [{ master_id: 6, level: 20 }] }).state === 'built', 'the totem is decoration 6');
check(readSkyTribeTotem({ deco_list: [{ master_id: 4, level: 20 }] }).state === 'not-built', 'no decoration 6 means no totem');
check(readSkyTribeTotem({}).state === 'unknown', 'no decoration list means unknown');
check(accountBuildingsProblem({ deco_list: [{ master_id: 6, level: 21 }] }) !== undefined, 'a level past 20 is refused');
check(accountBuildingsProblem({ deco_list: [{ master_id: 6, level: 20 }, { master_id: 6, level: 1 }] }) !== undefined, 'two totems are refused');
check(accountBuildingsProblem({ deco_list: [{ master_id: 6, level: 12 }] }) === undefined, 'a readable totem passes');
check(accountBuildingsProblem({ deco_list: [{ master_id: 9, level: 0 }] }) !== undefined
  && accountBuildingsProblem({ deco_list: [{ master_id: 31, level: 20 }, { master_id: 31, level: 20 }] }) !== undefined,
  'a stat building at no level, or listed twice, is refused');
check(accountBuildingsProblem({ deco_list: [{ master_id: 5, level: 99 }] }) === undefined, 'a decoration that moves no stat is not read');
{
  /* The Glory buildings at level 20 give what level 10 gave (Com2uS v6.2.7). */
  const all = readBuildingBonuses({ deco_list: [4, 8, 9, 31, 15, 16, 17, 18, 19].map((master_id) => ({ master_id, level: 20 })) });
  check(all.hp === 20 && all.atk === 20 && all.def === 20 && all.criDmg === 25 && all.elementAtk.Fire === 21 && all.elementAtk.Dark === 21,
    'level 20: 20 % HP, ATK and DEF, 25 CRI Dmg, 21 % ATK on a Sanctuary\'s element');
  const some = readBuildingBonuses({ deco_list: [{ master_id: 31, level: 14 }, { master_id: 15, level: 19 }] });
  check(some.criDmg === 18 && some.elementAtk.Fire === 19 && some.atk === 0, 'the upgrade tables between levels');
  check(readBuildingBonuses({}) === undefined, 'no decoration list means the buildings are unknown');
}

/* Display speed has one source, and Swift is read as the sheet reads it. */
{
  /* Three Swift and an Intangible complete Swift on the sheet, so Speed Tuning
     reads Swift too, not ⌈B/4⌉ as flat rune speed (STAT-2). */
  const runes = [...[1, 2, 3].map((slot) => ({ set_id: 3, slot_no: slot, pri_eff: [8, 10], sec_eff: [] })),
    { set_id: 25, slot_no: 4, pri_eff: [8, 10], sec_eff: [] }];
  const monster = { ...baseFacts, spd: 111, runes };
  const parts = monsterSpeedParts(monster);
  check(parts.swift && parts.displaySpeed === calculateMonsterTotals(monster).spd && parts.displaySpeed === displaySpeed(111, true, 40),
    'three Swift and an Intangible make Swift, as the stat sheet counts it');
  check(combatSpeed(sheet(parts.baseSpeed, runeSpeedForDisplay(parts.baseSpeed, parts.swift, parts.displaySpeed), parts.swift, 0)) === 179,
    'its combat speed carries the exact quarter: ⌈111 × 1.25 + 40⌉ = 179');
}
{
  const monster = { ...baseFacts, spd: 111, runes: [1, 2, 3, 4].map((slot) => ({ set_id: 3, slot_no: slot, pri_eff: [8, 10], sec_eff: [] })) };
  const parts = monsterSpeedParts(monster);
  check(parts.swift && parts.displaySpeed === calculateMonsterTotals(monster).spd && parts.displaySpeed === displaySpeed(111, true, 40),
    'display speed is the stat sheet\'s own figure');
}

/* The saved contract: per team — a content and its monsters by species — the
   order stated, the what-ifs tried and whether the team is speed tuned at all.
   The leader is the preset's, so it is not stored. */
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const teamEntry = (content, masterIds, extra = {}) => ({ content, members: masterIds.map((masterId) => ({ masterId })), orderStated: true, noSpeedTuning: false, ...extra });
check(isSpeedTuningPreferences({ teams: [] }), 'an empty workspace is valid');
check(same(readSpeedTuningPreferences({ teams: [] }), { teams: [] }), 'an empty workspace reads back empty');
check(same(readSpeedTuningPreferences(undefined), { teams: [] }), 'nothing stored reads as nothing tuned');
check(isSpeedTuningPreferences({ teams: [teamEntry('arena-attack', ['11', '12'], { members: [{ masterId: '11', whatIfCombatSpeed: 120 }, { masterId: '12' }] })] }),
  'an order and a what-if are kept with their team');
check(isSpeedTuningPreferences({ teams: [teamEntry('unnamed', ['11'])] }), 'a team of a preset not yet named is kept under unnamed');
check(!isSpeedTuningPreferences({ teams: [teamEntry('arena', ['11'])] }), 'a speed content is not a preset content');
check(!isSpeedTuningPreferences({ teams: [{ content: 'giants', members: [{ masterId: '11' }], orderStated: true }] }), 'a team without its speed tuning switch is not written');
check(!isSpeedTuningPreferences({ teams: [teamEntry('giants', ['11'], { noSpeedTuning: 'yes' })] }), 'a switch that is not true or false is not written');
check(!isSpeedTuningPreferences({ teams: [teamEntry('giants', ['11'], { members: [{ masterId: '11', whatIfCombatSpeed: 0 }] })] }), 'a what-if of zero is not written');
check(!isSpeedTuningPreferences({ teams: [teamEntry('giants', ['11'], { margin: 1 })] }), 'a field the contract does not name is not written');
check(!isSpeedTuningPreferences({ teams: [teamEntry('giants', ['11'], { orderStated: false })] }), 'a team that states nothing is not written');
check(!isSpeedTuningPreferences({ teams: [teamEntry('giants', ['11', '12']), teamEntry('giants', ['12', '11'])] }), 'one team, whatever order its species are listed in, is written once');
check(isSpeedTuningPreferences({ teams: [teamEntry('giants', ['11', '12']), teamEntry('dragons', ['11', '12'])] }), 'the same monsters in another content are another team');
check(!isSpeedTuningPreferences({ teams: [], presets: {} }), 'a section the contract does not name is not written');
check(!isSpeedTuningPreferences({ presets: {} }), 'the per-preset shape is no longer the contract');
{
  const stored = readSpeedTuningPreferences({ teams: [teamEntry('giants', ['11', '12'], { members: [{ masterId: '11', whatIfCombatSpeed: 'fast' }, { masterId: '12', whatIfCombatSpeed: 140 }] })] });
  check(same(stored.teams[0].members, [{ masterId: '11' }, { masterId: '12', whatIfCombatSpeed: 140 }]),
    'a malformed what-if is dropped on its own; its neighbour and the order it sat beside are kept');
}
{
  const stored = readSpeedTuningPreferences({ teams: [
    teamEntry('giants', ['11']),
    'not a team',
    teamEntry('giants', ['11', 5]),
    teamEntry('nowhere', ['13']),
    teamEntry('dragons', ['14'], { noSpeedTuning: 'yes', orderStated: 'yes' }),
    teamEntry('dragons', ['15'], { orderStated: false, noSpeedTuning: true }),
    teamEntry('giants', ['11'], { noSpeedTuning: true }),
  ] });
  check(same(stored.teams.map((entry) => entry.members[0].masterId), ['11', '15']), 'an unreadable team, one stating nothing and a second entry for a team cost only themselves');
  check(stored.teams[0].noSpeedTuning === false && stored.teams[1].noSpeedTuning === true && stored.teams[1].orderStated === false,
    'each switch reads on its own, and an unreadable one starts from its default');
}
{
  /* The former per-preset section is carried into teams against the import. */
  const former = { 'deck-1-1': { order: ['2', '1'], whatIfs: { 1: 130 }, noSpeedTuning: false }, 'deck-1-2': { order: ['3'], whatIfs: {} },
    'deck-1-3': { order: ['4'], whatIfs: {}, noSpeedTuning: true }, gone: { order: ['9'], whatIfs: {} } };
  const presets = {
    'deck-1-1': { content: 'arena-attack', members: [{ unitId: '1', masterId: '11' }, { unitId: '2', masterId: '12' }] },
    'deck-1-2': { content: 'arena-attack', members: [{ unitId: '3', masterId: null }] },
    'deck-1-3': { content: 'unnamed', members: [{ unitId: '4', masterId: '14' }] },
  };
  const stored = readSpeedTuningPreferences({ presets: former }, (presetId) => presets[presetId]);
  check(same(stored.teams, [
    { content: 'arena-attack', members: [{ masterId: '12' }, { masterId: '11' }], orderStated: true, noSpeedTuning: false },
    { content: 'unnamed', members: [{ masterId: '14' }], orderStated: true, noSpeedTuning: true },
  ]), 'a former preset entry becomes its team, its display-speed what-ifs left behind; one whose preset or species is unknown is left behind');
  check(same(readSpeedTuningPreferences({ presets: former }), { teams: [] }), 'read without an import, the former section carries nothing');
}
{
  /* A preset's own members and leader, in the order stated for its team; a
     team never stated reads in the order given as the fallback. */
  const giants = presetContent('giants');
  const species = { 1: '11', 2: '12', 3: '13', 4: '11' };
  const masterOf = (unitId) => species[unitId] ?? null;
  const preset = { id: 'deck-24-101', members: ['1', '2', '3'], leaderUnitId: '2', content: giants };
  const stated = teamEntry('giants', ['13', '11', '12'], { members: [{ masterId: '13' }, { masterId: '11', whatIfCombatSpeed: 130 }, { masterId: '12' }] });
  const read = presetSpeedTeam(preset, masterOf, stated);
  check(same(read.members, [{ unitId: '3', masterId: '13' }, { unitId: '1', masterId: '11', whatIfCombatSpeed: 130 }, { unitId: '2', masterId: '12' }])
    && read.orderStated && read.leaderUnitId === '2' && read.id === 'deck-24-101' && read.content === 'giants' && read.tuningContent === 'giants' && read.size === 5,
    'the stated order leads, by species');
  const prefs = { teams: [stated] };
  const other = { ...preset, id: 'deck-24-102', members: ['2', '3', '1'] };
  check(same(presetSpeedTeam(other, masterOf, teamSpeedTuning(prefs, presetSpeedTeam(other, masterOf, undefined))).members.map((member) => member.unitId), ['3', '1', '2']),
    'another preset of the same content with the same monsters reads the same order');
  check(teamSpeedTuning(prefs, presetSpeedTeam({ ...preset, content: presetContent('dragons') }, masterOf, undefined)) === undefined,
    'the same monsters in another content read nothing stated');
  check(teamSpeedTuning(prefs, presetSpeedTeam({ ...preset, members: ['1', '2'] }, masterOf, undefined)) === undefined,
    'a team missing one of the monsters reads nothing stated');
  check(same(presetSpeedTeam(preset, masterOf, undefined, [], ['3', '2', '1']).members.map((member) => member.unitId), ['3', '2', '1'])
    && !presetSpeedTeam(preset, masterOf, undefined).orderStated,
    'a team never stated reads in the order it moves in');
  check(same(presetSpeedTeam(preset, masterOf, { ...stated, orderStated: false }, [], ['2', '3', '1']).members,
    [{ unitId: '2', masterId: '12' }, { unitId: '3', masterId: '13' }, { unitId: '1', masterId: '11', whatIfCombatSpeed: 130 }]),
    'a what-if stated without an order rides on the order the team moves in');
  /* Two copies of one species take their places in slot order. */
  const twice = presetSpeedTeam({ ...preset, members: ['1', '4'] }, masterOf, teamEntry('giants', ['11', '11'], { members: [{ masterId: '11', whatIfCombatSpeed: 140 }, { masterId: '11' }] }));
  check(same(twice.members, [{ unitId: '1', masterId: '11', whatIfCombatSpeed: 140 }, { unitId: '4', masterId: '11' }]), 'a species twice reads both of its places');
  /* Written back, a team is kept by what it is, where it stood among the others. */
  const moved = { ...read, members: [read.members[1], read.members[0], read.members[2]] };
  const before = { teams: [teamEntry('dragons', ['14']), stated, teamEntry('necropolis', ['15'])] };
  const written = withTeamSpeedTuning(before, moved);
  check(same(written.teams.map((entry) => entry.content), ['dragons', 'giants', 'necropolis'])
    && same(written.teams[1].members, [{ masterId: '11', whatIfCombatSpeed: 130 }, { masterId: '13' }, { masterId: '12' }]),
    'a team written back replaces its own entry in place');
  const reset = withTeamSpeedTuning(before, { ...read, orderStated: false, members: read.members.map(({ unitId, masterId }) => ({ unitId, masterId })) });
  check(same(reset.teams.map((entry) => entry.content), ['dragons', 'necropolis']), 'a team that states nothing any more leaves no entry');
  const unknown = presetSpeedTeam({ ...preset, members: ['1', '9'] }, masterOf, undefined);
  check(!canKeepSpeedTuning(unknown) && withTeamSpeedTuning(before, { ...unknown, orderStated: true }) === before,
    'a team with a member the import does not hold cannot be kept');
  check(read.noSpeedTuning === false && presetSpeedTeam(preset, masterOf, { ...stated, noSpeedTuning: true }).noSpeedTuning,
    'a team is speed tuned until the user says otherwise');
  const oversized = presetSpeedTeam({ ...preset, members: ['1', '2', '3', '4', '5'], content: presetContent('arena-attack') }, masterOf, undefined);
  check(oversized.members.length === 5 && oversized.size === 5, 'a preset holding more monsters than its content fields is shown whole');
  /* Every content is a team to tune, read against its area where it has no enemy data. */
  for (const content of presetContents) {
    const read = speedContent(presetSpeedTeam({ ...preset, content }, masterOf, undefined).content);
    check(read.teamSize === null || read.teamSize === content.teamSize, `${content.name}: its enemy data was read for its own team`);
    check(read.opponent !== 'none' || read.teamSize === null, `${content.name}: a content without enemies is read by area alone`);
  }
  check(speedContent(presetSpeedTeam({ ...preset, content: presetContent('temple-of-chaos') }, masterOf, undefined).content).area === 'dungeon',
    'Temple of Chaos counts dungeon leads');
  const siege = speedContent(presetSpeedTeam({ ...preset, content: presetContent('siege') }, masterOf, undefined).content);
  check(siege.area === 'guild' && siege.opponent === 'worst-case', 'a Siege Battle attack counts guild leads and faces the worst-case enemy');
  check(speedContent(presetSpeedTeam({ ...preset, content: presetContent('siege-defense') }, masterOf, undefined).content).opponent === 'none',
    'a Siege Battle defense is tuned for its own order alone');
  for (const id of ['rift-raid', 'dimension-raid-1', 'dimension-raid-2', 'dimension-raid-3']) {
    const raid = speedContent(presetSpeedTeam({ ...preset, content: presetContent(id) }, masterOf, undefined).content);
    check(raid.area === 'raid' && raid.tick === 'raid', `${presetContent(id).name} ticks and leads as a raid`);
  }
  check(speedContents.every((content) => content.tick === (content.area === 'raid' ? 'raid' : 'standard')), 'only a raid ticks at 4.5 %');
  const unnamed = presetSpeedTeam({ ...preset, content: null }, masterOf, undefined);
  check(unnamed.content === 'unnamed' && unnamed.tuningContent === 'unnamed' && unnamed.size === 3, 'a preset not yet named has the places it fills and counts General leads alone');
}
{
  /* Stored, a what-if still never reaches a reading that is not handed it: the page judges the runes engraved. */
  const unitId = '1';
  const monster = { ...baseFacts, unit_id: 1, unit_master_id: 14712, attribute: 2, spd: 100, skills: [], runes: [{ set_id: 1, slot_no: 2, pri_eff: [8, 40], sec_eff: [] }] };
  const monsters = new Map([[unitId, monster]]);
  const masterOf = (id) => String(monsters.get(id)?.unit_master_id ?? '') || null;
  const preset = { id: 'deck-24-101', members: [unitId], leaderUnitId: null, content: presetContent('giants') };
  const plain = readSpeedTeam({ team: presetSpeedTeam(preset, masterOf, undefined), monsters, totemPercent: 15 });
  const stored = readSpeedTeam({ team: presetSpeedTeam(preset, masterOf, teamEntry('giants', ['14712'], { members: [{ masterId: '14712', whatIfCombatSpeed: 999 }] })), monsters, totemPercent: 15 });
  check(stored.members[0].displaySpeed === monsterSpeedParts(monster).displaySpeed && !stored.members[0].whatIf
    && stored.members[0].combatSpeed === plain.members[0].combatSpeed, 'a stored what-if is read by nothing but the overlay');
  /* A what-if is a combat speed the clock takes as it stands, and the display
     speed beside it is the lowest that reaches it on the monster's own terms. */
  const imported = plain.members[0];
  const typed = (value) => readSpeedTeam({ team: presetSpeedTeam(preset, masterOf, undefined), monsters, totemPercent: 15, whatIfs: new Map([[unitId, value]]) }).members[0];
  check(imported.whatIf === false && imported.combatSpeed === imported.importedCombatSpeed && imported.displaySpeed === monsterSpeedParts(monster).displaySpeed,
    'without a what-if the member is read at its runes');
  const faster = typed(imported.combatSpeed + 20);
  check(faster.whatIf && faster.combatSpeed === imported.combatSpeed + 20 && faster.importedCombatSpeed === imported.combatSpeed,
    'a what-if is the combat speed the member is read at, and the runes\' figure stays beside it');
  check(faster.displaySpeed === imported.displaySpeed + 20, 'each point of flat rune speed is one point of combat speed, so the display speed follows the what-if');
  for (const value of [imported.lowestCombatSpeed, imported.combatSpeed + 7, 400, 999]) {
    const read = typed(value);
    const parts = monsterSpeedParts(monster);
    const at = (shown) => combatSpeed({ baseSpeed: parts.baseSpeed, swift: parts.swift, passiveFlatSpeed: parts.passiveFlatSpeed,
      percentOfBase: 15 + read.leaderPercent + parts.passiveSpeedPercent, runeSpeed: runeSpeedForDisplay(parts.baseSpeed, parts.swift, shown) });
    check(read.displaySpeed !== null && at(read.displaySpeed) >= value && at(read.displaySpeed - 1) < value,
      `the display speed beside a what-if of ${value} is the lowest that reaches it`);
  }
  check(typed(imported.lowestCombatSpeed - 1).displaySpeed === null, 'a what-if under bare runes has no display speed beside it');
  const withLead = readSpeedTeam({
    team: presetSpeedTeam({ ...preset, leaderUnitId: unitId }, masterOf, undefined),
    monsters, totemPercent: 15, whatIfs: new Map([[unitId, 400]]),
  }).members[0];
  check(withLead.leaderPercent === 28 && withLead.importedCombatSpeed > imported.importedCombatSpeed
    && withLead.combatSpeed === 400 && withLead.displaySpeed < typed(400).displaySpeed,
  'choosing a leader changes the engraved combat speed and the display speed needed to reach the same what-if');
  /* A team the user says is not speed tuned faces nothing: its places are its own order's. */
  const untuned = readSpeedTeam({ team: presetSpeedTeam(preset, masterOf, teamEntry('giants', ['14712'], { orderStated: false, noSpeedTuning: true })), monsters, totemPercent: 15, ranges: true });
  check(plain.enemies.length > 0 && untuned.enemies.length === 0 && untuned.members[0].cutInAt.length === 0
    && same(untuned.members[0].turnPositions, [1]) && untuned.members[0].combatSpeed === plain.members[0].combatSpeed,
    'a team not speed tuned is read against no enemy, at the same combat speeds');
  /* A Rift Raid deck runs at the speed lead of another deck of its battle:
     11801 leads +19 % SPD everywhere. */
  const raid = { ...preset, id: 'deck-3-1', content: presetContent('rift-raid') };
  const alone = readSpeedTeam({ team: presetSpeedTeam(raid, masterOf, undefined), monsters, totemPercent: 15 });
  const led = readSpeedTeam({ team: presetSpeedTeam(raid, masterOf, undefined, [{ unitId: '9', masterId: '11801', presetName: 'Rift Raid 2' }]), monsters, totemPercent: 15 });
  check(alone.members[0].leaderPercent === 0 && led.members[0].leaderPercent === 19 && led.members[0].combatSpeed > alone.members[0].combatSpeed,
    'a Rift Raid deck counts the speed lead of another deck of its battle');
}
{
  /* A team nobody put in order is shown in the order it moves in: by first
     turn on the runes engraved, never a what-if, with the slots settling a tie
     and a member the import does not hold last. */
  const copy = (unitId, masterId, spd) => ({ ...baseFacts, unit_id: Number(unitId), unit_master_id: masterId, attribute: 2, spd, skills: [], runes: [] });
  const monsters = new Map([['1', copy('1', 14712, 100)], ['2', copy('2', 14713, 120)], ['3', copy('3', 14714, 110)], ['4', copy('4', 14715, 110)]]);
  const masterOf = (id) => monsters.has(id) ? String(monsters.get(id).unit_master_id) : null;
  const preset = { id: 'deck-24-101', members: ['1', '9', '2', '3'], leaderUnitId: null, content: presetContent('arena-attack') };
  const slotted = presetSpeedTeam(preset, masterOf, undefined);
  check(same(gameTurnOrder(slotted, preset.members, monsters, 0), ['2', '3', '1', '9']), 'the fastest moves first, and a missing member comes last');
  const tied = { ...preset, members: ['4', '3'] };
  check(same(gameTurnOrder(presetSpeedTeam(tied, masterOf, undefined), tied.members, monsters, 0), ['4', '3']),
    'a tie is settled by the preset\'s slots');
  const withWhatIf = { ...slotted, members: slotted.members.map((member) => member.unitId === '1' ? { ...member, whatIfCombatSpeed: 300 } : member) };
  check(same(gameTurnOrder(withWhatIf, preset.members, monsters, 0), ['2', '3', '1', '9']), 'a what-if never moves the order the team moves in');
}
{
  /* Arena and Siege Battle attacks are read by one worst case: the same team,
     with no lead to tell the areas apart, meets the same enemy at the same tick
     and is cut into before the same monsters. Its enemy is level with the
     team's first mover. */
  const monsters = new Map([
    ['1', { ...baseFacts, unit_id: 1, unit_master_id: 14712, attribute: 2, spd: 100, skills: [], runes: [{ set_id: 1, slot_no: 2, pri_eff: [8, 42], sec_eff: [] }] }],
    ['2', { ...baseFacts, unit_id: 2, unit_master_id: 14712, attribute: 2, spd: 100, skills: [], runes: [{ set_id: 1, slot_no: 2, pri_eff: [8, 10], sec_eff: [] }] }],
    ['3', { ...baseFacts, unit_id: 3, unit_master_id: 14712, attribute: 2, spd: 100, skills: [], runes: [{ set_id: 1, slot_no: 2, pri_eff: [8, 30], sec_eff: [] }] }],
  ]);
  const team = (content) => ({ id: `worst-${content}`, content, members: [{ unitId: '1' }, { unitId: '2' }, { unitId: '3' }], leaderUnitId: null, otherLeaders: [] });
  const siege = readSpeedTeam({ team: team('siege'), monsters, totemPercent: 15 });
  const arena = readSpeedTeam({ team: team('arena'), monsters, totemPercent: 15 });
  check(siege.enemies.length === 1 && siege.worstStage === 0 && siege.enemies[0].enemyNames.join() === 'Enemy',
    'a Siege Battle attack meets one worst-case enemy');
  check(siege.enemies[0].enemySpeed === siege.members[0].combatSpeed, 'the siege worst case is level with the team\'s first mover');
  check(same(siege.enemies[0].cutsBefore, arena.enemies[0].cutsBefore) && siege.enemies[0].enemySpeed === arena.enemies[0].enemySpeed
    && siege.enemies[0].firstEnemyTick === arena.enemies[0].firstEnemyTick, 'Arena and Siege Battle share the worst-case reading');
  check(siege.enemies[0].cutsBefore.length > 0 && siege.members.some((member) => same(member.cutInAt, [1])) && !siege.perfect,
    'a slow member is cut into by the siege worst case, and the team fails');
  /* An interval keeps the enemy out. The first member's floor rises to where
     it is still the opener: under it the third member opens, and a worst case
     level with that one gets in before the first. The third member, behind the
     slow second, can never keep the enemy out. With no speed tuning the enemy
     plays no part, and the intervals are the order's alone. */
  const ranged = readSpeedTeam({ team: team('siege'), monsters, totemPercent: 15, ranges: true });
  const untuned = readSpeedTeam({ team: { ...team('siege'), noSpeedTuning: true }, monsters, totemPercent: 15, ranges: true });
  const tuned = ranged.members[0].range;
  const alone = untuned.members[0].range;
  check(tuned !== null && alone !== null && tuned.minimum > alone.minimum && tuned.maximum === null,
    'the enemy raises the floor of the first member\'s interval');
  if (tuned !== null) {
    const at = (value) => readSpeedTeam({ team: team('siege'), monsters, totemPercent: 15, whatIfs: new Map([['1', value]]) }).members[0].cutInAt;
    check(at(tuned.minimum).length === 0 && at(tuned.minimum - 1).length > 0,
      'at its interval\'s floor no enemy gets in before it, and one combat speed under it one does');
  }
  check(ranged.members[2].range === null && untuned.members[2].range !== null,
    'a member no combat speed keeps the enemy out of has no interval, though its order alone has one');
}

/* 4. Every verdict and every interval the page prints is the truth. */
let seed = 0x5eed;
const random = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
  return seed / 2 ** 31;
};
const skillSets = [[[2563, 3]], [[7361, 2]], [[6512, 1]], [[10015, 1]], []];
let rangesChecked = 0;
let emptyRanges = 0;
let outOfPlaceSeen = 0;
/* Read off a reading's own drawn team trace, apart from the module: the index
   of each member's first turn, and whether `earlier` strictly moves first. */
const firstTurnsOf = (reading) => {
  const first = new Map();
  reading.trace.events.forEach((event, at) => { if (!first.has(event.key)) first.set(event.key, { at, event }); });
  return first;
};
const strictlyBefore = (first, earlier, later) => {
  const a = first.get(earlier);
  const b = first.get(later);
  return Boolean(a) && (!b || (a.at < b.at && !a.event.tiedWith.includes(later)));
};
for (let sample = 0; sample < 60; sample += 1) {
  /* Every fourth sample a siege attack, so each kind of opponent meets the interval check below. */
  const area = ['giants', 'arena', 'giants', 'siege'][sample % 4];
  const size = speedContent(area).teamSize;
  const monsters = new Map();
  const members = [];
  for (let at = 0; at < size; at += 1) {
    const unitId = String(at + 1);
    monsters.set(unitId, {
      ...baseFacts, unit_id: at + 1, unit_master_id: 14712, attribute: 2, spd: 95 + Math.floor(random() * 25),
      skills: skillSets[Math.floor(random() * skillSets.length)],
      runes: [{ set_id: 1, slot_no: 2, pri_eff: [8, Math.floor(random() * 90)], sec_eff: [] }],
    });
    members.push({ unitId });
  }
  const saved = { id: `sample-${sample}`, content: area, members, leaderUnitId: sample % 3 === 0 ? '1' : null, otherLeaders: [] };
  const read = (whatIfs, ranges = true) => readSpeedTeam({ team: saved, monsters, totemPercent: 15, whatIfs, ranges });
  const reading = read(undefined);
  /* A cut-in is read off the drawn trace: an enemy turn before some ally's first. */
  for (const enemy of reading.enemies) {
    const firstEnemy = enemy.trace.events.findIndex((event) => event.side === 'enemy');
    const allyFirsts = members.map(({ unitId }) => enemy.trace.events.findIndex((event) => event.key === unitId));
    const expected = firstEnemy === -1 ? [] : members.filter((_, at) => allyFirsts[at] === -1 || allyFirsts[at] > firstEnemy).map(({ unitId }) => unitId);
    check(enemy.cutsBefore.join() === expected.join(), `sample ${sample}: the cut-in verdict agrees with the ticks drawn`);
  }
  /* The user's order is the authority: a member is too fast or too slow
     exactly when its first turn ranks earlier or later among the team's first
     turns than its place, a second turn of a teammate not counted. */
  const first = firstTurnsOf(reading);
  const firstAt = (unitId) => first.get(unitId)?.at ?? Number.POSITIVE_INFINITY;
  const ranked = members.map(({ unitId }) => unitId).sort((left, right) => firstAt(left) - firstAt(right));
  reading.members.forEach((member, index) => {
    const rank = ranked.indexOf(member.unitId);
    const expected = rank < index ? 'early' : rank > index ? 'late' : null;
    check((member.verdict.kind === 'early' || member.verdict.kind === 'late' ? member.verdict.kind : null) === expected,
      `sample ${sample}: member ${index + 1} is out of place exactly when its first turn ranks ${rank + 1}${rank === index ? '' : `, not ${index + 1}`}`);
    if (expected !== null) outOfPlaceSeen += 1;
    const cutAt = reading.enemies.flatMap((stage, at) => stage.cutsBefore.includes(member.unitId) ? [at + 1] : []);
    check(member.cutInAt.join() === cutAt.join(), `sample ${sample}: member ${index + 1} is told of exactly the stages that cut in before it`);
    const range = member.range;
    if (range) check(member.inRange === (member.combatSpeed >= range.minimum && (range.maximum === null || member.combatSpeed <= range.maximum)),
      `sample ${sample}: member ${index + 1} knows whether it is in its range`);
  });
  check(reading.perfect === reading.members.every((member) => member.verdict.kind === 'in-place' && member.cutInAt.length === 0),
    `sample ${sample}: a team is perfect only with every member in place and no enemy getting in`);
  /* Each interval's edges, for a third of the sweep: typed in, the member's
     first turn falls strictly between those of the members placed just above
     and just below it, the others where they are, and no enemy turn of the
     drawn traces comes before it; one combat speed past either edge, it does
     not. */
  if (sample % 3 !== 0) continue;
  const fitsAt = (index, value) => {
    const typed = read(new Map([[members[index].unitId, value]]), false);
    const at = firstTurnsOf(typed);
    const self = members[index].unitId;
    const cutIn = typed.enemies.some(({ trace }) => {
      const firstEnemy = trace.events.findIndex((event) => event.side === 'enemy');
      const own = trace.events.findIndex((event) => event.key === self);
      return firstEnemy !== -1 && (own === -1 || firstEnemy < own);
    });
    return (index === 0 || strictlyBefore(at, members[index - 1].unitId, self))
      && (index === members.length - 1 || strictlyBefore(at, self, members[index + 1].unitId))
      && !cutIn;
  };
  for (const [index, member] of reading.members.entries()) {
    const lowest = member.lowestCombatSpeed;
    const range = member.range;
    if (range === null) {
      for (let value = lowest; value <= 999; value += 37) check(!fitsAt(index, value), `sample ${sample}: member ${index + 1} has no range, and ${value} does not fit`);
      emptyRanges += 1;
      continue;
    }
    const top = range.maximum ?? 999;
    for (let value = range.minimum; value <= top; value += Math.max(1, Math.floor((top - range.minimum) / 7))) {
      check(fitsAt(index, value), `sample ${sample}: member ${index + 1} fits at ${value}, inside its range`);
    }
    check(fitsAt(index, top), `sample ${sample}: member ${index + 1} fits at ${top}, its range's ceiling`);
    if (range.minimum - 1 >= lowest) check(!fitsAt(index, range.minimum - 1), `sample ${sample}: member ${index + 1} does not fit at ${range.minimum - 1}, under its range`);
    if (range.maximum !== null) check(!fitsAt(index, range.maximum + 1), `sample ${sample}: member ${index + 1} does not fit at ${range.maximum + 1}, over its range`);
    if (index === 0 && area !== 'giants') check(range.maximum === null, `sample ${sample}: the first member has nobody above it, and the worst case follows it, so its range is open`);
    rangesChecked += 1;
  }
  /* The page asks for no ranges and gets none. */
  check(read(undefined, false).members.every((member) => member.range === null && !member.inRange), `sample ${sample}: a reading without ranges carries none`);
}
check(rangesChecked > 20, `the sweep exercised ranges (${rangesChecked})`);
check(outOfPlaceSeen > 20, `the sweep met members out of place (${outOfPlaceSeen})`);

console.log(`Speed tick rules hold: ${checks} checks, ${rangesChecked} intervals confirmed at both edges, ${emptyRanges} empty, ${outOfPlaceSeen} members out of place read.`);
