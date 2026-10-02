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
 * 4. The page's promise: an interval it prints is the truth. At both ends the
 *    monster is in place, one display speed outside it is not — for every
 *    member of every out-of-order team in a sweep of generated teams.
 */
import assert from 'node:assert/strict';
import {
  combatSpeed, displaySpeed, displayedSwiftBonus, everyoneMoved, leaderAreaReaches, leaderSpeedPercent,
  runeSpeedForDisplay, simulateBattle, ticksToFirstTurn, totemPercentByLevel,
} from '../app/lib/speed-tick.ts';
import { describeTurnEffect, leaderSkill, shortLeaderSkill, speedLeaderSkill, speedSkillProfile } from '../app/lib/speed-skills.ts';
import { dungeonIds, fastestEnemySpeed, speedContent, speedContents, usefulAccuracy } from '../app/lib/speed-contents.ts';
import { readSpeedTeam } from '../app/lib/speed-tuning-analysis.ts';
import { isSpeedTuningPreferences, readSpeedTuningPreferences } from '../app/lib/speed-tuning-preferences.ts';
import { readSkyTribeTotem, skyTribeTotemProblem } from '../app/lib/sky-tribe-totem.ts';
import { calculateMonsterTotals, monsterSpeedParts } from '../app/lib/monster-stats.ts';

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
check(leaderSpeedPercent({ percent: 33, area: 'Guild', element: null }, 'arena', 'Fire') === 0, 'a guild lead counts in neither');
check(leaderSpeedPercent({ percent: 30, area: 'Element', element: 'Wind' }, 'arena', 'Fire') === 0, 'an element lead skips other elements');
check(leaderSpeedPercent({ percent: 30, area: 'Element', element: 'Wind' }, 'dungeon', 'Wind') === 30, 'an element lead reaches its element everywhere');
/* Where a lead counts is one rule for every attribute: the speed figure above
   and the editor's red mark must agree. */
for (const leaderArea of ['General', 'Arena', 'Dungeon', 'Guild', 'Element']) {
  for (const area of ['arena', 'dungeon']) {
    const counts = leaderSpeedPercent({ percent: 10, area: leaderArea, element: 'Fire' }, area, 'Fire') > 0;
    check(leaderAreaReaches(leaderArea, area) === counts, `${leaderArea} lead in ${area}: reach and speed agree`);
  }
}

/* 2. The clock. */
for (const [speed, ticks] of [[1429, 1], [715, 2], [477, 3], [358, 4], [286, 5], [285, 6], [239, 6], [143, 10]]) {
  check(ticksToFirstTurn(speed) === ticks, `${speed} combat speed needs ${ticks} ticks`);
}
const unit = (key, speed, effects = [], side = 'ally', extra = {}) => ({ key, side, speed, effects, ...extra });
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
  /* Leo's Eye of the Storm (SWCalc: "non-Leo monsters are capped to the lowest
     Leo combat speed"), sparing a boss. */
  const leo = unit('leo', 150, [], 'ally', { capsOthersSpeed: true });
  const capped = simulateBattle([leo, unit('fast', 300)], { done: everyoneMoved(['leo', 'fast']) });
  check(capped.events[0].tiedWith.length === 1 && capped.events[0].tick === 10, 'under the cap a 300 moves with a 150 Leo, on a tie');
  const twoLeos = simulateBattle([leo, unit('leo-2', 140, [], 'ally', { capsOthersSpeed: true }), unit('fast', 300)], { done: everyoneMoved(['leo', 'leo-2', 'fast']) });
  check(twoLeos.events[0].key === 'leo' && twoLeos.events.find((event) => event.key === 'fast').tick === 12, 'the slowest Leo sets the cap, and a Leo is not capped by another');
  const boss = simulateBattle([leo, unit('boss', 300, [], 'enemy', { exemptFromCap: true })], { done: everyoneMoved(['leo', 'boss']) });
  check(boss.events[0].key === 'boss' && boss.events[0].tick === 5, 'a boss is out of the cap\'s reach');
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
}
for (const id of dungeonIds) {
  const content = speedContent(id);
  check(content.teamSize === 5 && content.stages.length >= 3 && content.stages.every((stage) => stage.speeds.length > 0 && stage.fastest === Math.max(...stage.speeds)),
    `${content.name} has a five-monster team and enemy stages`);
  check(content.stages.every((stage) => stage.resists.length === stage.speeds.length && stage.resists.every(Number.isFinite)),
    `${content.name} has a resistance for every enemy`);
  const highest = Math.max(...content.stages.flatMap((stage) => stage.resists));
  check(fastestEnemySpeed(id) === Math.max(...content.stages.map((stage) => stage.fastest)) && usefulAccuracy(id) === Math.max(0, highest - 15),
    `${content.name}'s fastest enemy and useful accuracy follow its stages`);
}
check(speedContents.find((content) => content.id === 'arena')?.teamSize === 4, 'arena offence is four monsters');

/* The totem, and its import boundary. */
check(readSkyTribeTotem({ deco_list: [{ master_id: 6, level: 20 }] }).state === 'built', 'the totem is decoration 6');
check(readSkyTribeTotem({ deco_list: [{ master_id: 4, level: 20 }] }).state === 'not-built', 'no decoration 6 means no totem');
check(readSkyTribeTotem({}).state === 'unknown', 'no decoration list means unknown');
check(skyTribeTotemProblem({ deco_list: [{ master_id: 6, level: 21 }] }) !== undefined, 'a level past 20 is refused');
check(skyTribeTotemProblem({ deco_list: [{ master_id: 6, level: 20 }, { master_id: 6, level: 1 }] }) !== undefined, 'two totems are refused');
check(skyTribeTotemProblem({ deco_list: [{ master_id: 6, level: 12 }] }) === undefined, 'a readable totem passes');

/* Display speed has one source. */
{
  const monster = { spd: 111, runes: [1, 2, 3, 4].map((slot) => ({ set_id: 3, slot_no: slot, pri_eff: [8, 10], sec_eff: [] })) };
  const parts = monsterSpeedParts(monster);
  check(parts.swift && parts.displaySpeed === calculateMonsterTotals(monster).spd && parts.displaySpeed === displaySpeed(111, true, 40),
    'display speed is the stat sheet\'s own figure');
}

/* The saved contract. */
const team = (members, extra = {}) => ({ id: 'team-1', content: 'giants', members, leaderUnitId: null, ...extra });
check(isSpeedTuningPreferences({ teams: [], rules: [] }), 'an empty workspace is valid');
check(!isSpeedTuningPreferences({ teams: [team([{ unitId: '1' }, { unitId: '1' }])], rules: [] }), 'a monster twice in a team is refused');
check(isSpeedTuningPreferences({ teams: [team([{ unitId: '1', whatIfDisplaySpeed: 120 }])], rules: [] }), 'a what-if is kept with its member');
check(!isSpeedTuningPreferences({ teams: [team([{ unitId: '1', whatIfDisplaySpeed: 0 }])], rules: [] }), 'a what-if of zero is refused');
{
  const stored = readSpeedTuningPreferences({ teams: [team([{ unitId: '1', whatIfDisplaySpeed: 'fast' }, { unitId: '2', whatIfDisplaySpeed: 140 }], { leaderUnitId: '2' })], rules: [] });
  check(stored.teams.length === 1 && Object.keys(stored.teams[0].members[0]).join() === 'unitId'
    && stored.teams[0].members[1].whatIfDisplaySpeed === 140 && stored.teams[0].leaderUnitId === '2',
    'a malformed what-if is dropped on its own; its neighbour and the team it sat in are kept');
}
{
  /* Stored, a what-if still never reaches a reading that is not handed it: the page judges the runes worn. */
  const unitId = '1';
  const monster = { unit_id: 1, unit_master_id: 14712, attribute: 2, spd: 100, skills: [], runes: [{ set_id: 1, slot_no: 2, pri_eff: [8, 40], sec_eff: [] }] };
  const monsters = new Map([[unitId, monster]]);
  const plain = readSpeedTeam({ team: team([{ unitId }]), monsters, totemPercent: 15 });
  const stored = readSpeedTeam({ team: team([{ unitId, whatIfDisplaySpeed: 999 }]), monsters, totemPercent: 15 });
  check(stored.members[0].displaySpeed === monsterSpeedParts(monster).displaySpeed && !stored.members[0].whatIf
    && stored.members[0].combatSpeed === plain.members[0].combatSpeed, 'a stored what-if is read by nothing but the overlay');
}
check(!isSpeedTuningPreferences({ teams: [team(['1', '2', '3', '4', '5', '6'].map((unitId) => ({ unitId })))], rules: [] }), 'a team larger than its content is refused');
check(!isSpeedTuningPreferences({ teams: [team([{ unitId: '1' }], { leaderUnitId: '2' })], rules: [] }), 'a leader outside the team is refused');
check(!isSpeedTuningPreferences({ teams: [team([], { margin: 1 })], rules: [] }), 'a team field the contract does not name is not written');
check(readSpeedTuningPreferences({ teams: [team([{ unitId: '1' }], { marginEnabled: true, margin: 2 })], rules: [] }).teams.length === 1,
  'a team field the page no longer offers is left out on reading, and the team kept');

/* 4. Every printed interval is the truth. */
let seed = 0x5eed;
const random = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
  return seed / 2 ** 31;
};
const skillSets = [[[2563, 3]], [[7361, 2]], [[6512, 1]], [[10015, 1]], []];
let intervalsChecked = 0;
let rangesChecked = 0;
let blockedRanges = 0;
for (let sample = 0; sample < 60; sample += 1) {
  const area = sample % 2 === 0 ? 'giants' : 'arena';
  const size = speedContent(area).teamSize;
  const monsters = new Map();
  const members = [];
  for (let at = 0; at < size; at += 1) {
    const unitId = String(at + 1);
    monsters.set(unitId, {
      unit_id: at + 1, unit_master_id: 14712, attribute: 2, spd: 95 + Math.floor(random() * 25),
      skills: skillSets[Math.floor(random() * skillSets.length)],
      runes: [{ set_id: 1, slot_no: 2, pri_eff: [8, Math.floor(random() * 90)], sec_eff: [] }],
    });
    members.push({ unitId });
  }
  const saved = { id: `sample-${sample}`, content: area, members, leaderUnitId: sample % 3 === 0 ? '1' : null };
  const reading = readSpeedTeam({ team: saved, monsters, totemPercent: 15, rules: [] });
  /* A cut-in is read off the drawn trace: an enemy turn before some ally's first. */
  for (const enemy of reading.enemies) {
    const firstEnemy = enemy.trace.events.findIndex((event) => event.side === 'enemy');
    const allyFirsts = members.map(({ unitId }) => enemy.trace.events.findIndex((event) => event.key === unitId));
    const expected = firstEnemy === -1 ? [] : members.filter((_, at) => allyFirsts[at] === -1 || allyFirsts[at] > firstEnemy).map(({ unitId }) => unitId);
    check(enemy.cutsBefore.join() === expected.join(), `sample ${sample}: the cut-in verdict agrees with the ticks drawn`);
  }
  /* Each member looks up the order only: it is too fast exactly when its first
     turn comes before that of a monster placed above it, and never for one below. */
  const firstAt = (unitId) => {
    const at = reading.trace.events.findIndex((event) => event.key === unitId);
    return at === -1 ? Number.POSITIVE_INFINITY : at;
  };
  /* The fastest-enemy warning: in a dungeon, a member whose speed is strictly
     below the floor's fastest enemy's — an equal one is read as the team's tie. */
  const fastest = area === 'arena' ? null : fastestEnemySpeed(area);
  reading.members.forEach((member, index) => {
    check(member.slowerThanFastestEnemy === (fastest !== null && member.combatSpeed < fastest),
      `sample ${sample}: member ${index + 1} is warned of the fastest enemy exactly when it is slower`);
  });
  reading.members.forEach((member, index) => {
    const passesSomeoneAbove = reading.members.slice(0, index).some((above) => firstAt(member.unitId) < firstAt(above.unitId));
    check((member.verdict.kind === 'order') === passesSomeoneAbove, `sample ${sample}: member ${index + 1} is too fast exactly when it moves before one above it`);
  });
  /* Each slot's range, read off a reading of the team with the member moved
     there: at its floor level with the one below and, where the range says
     so, clear of the enemy; at its ceiling level with the one above; one
     display speed past either edge no longer so. A range that says the enemy
     gets in is the slot between the neighbours alone, and no display speed in
     it keeps the enemy out. */
  for (const [index, member] of reading.members.entries()) {
    if (area === 'arena') check(member.worstEnemyCutsIn === reading.enemies[0].cutsBefore.includes(member.unitId),
      `sample ${sample}: member ${index + 1} is warned of the worst-case enemy exactly when it cuts in`);
    else check(!member.worstEnemyCutsIn, `sample ${sample}: a dungeon member is never warned of the arena enemy`);
    const range = member.slotRange;
    if (!range) continue;
    const moved = (shown) => readSpeedTeam({ team: saved, monsters, totemPercent: 15, whatIfs: new Map([[member.unitId, shown]]) });
    const besideBelow = (there) => {
      const below = there.members[index + 1];
      return !below || there.members[index].combatSpeed >= below.combatSpeed;
    };
    const enemyClear = (there) => {
      /* The floor and the Enemy cut in table read the same clock: at the
         floor, no stage's enemy has a turn before this member's first. */
      const clear = area === 'arena' ? !there.enemies[0].cutsBefore.includes(member.unitId) : !there.members[index].slowerThanFastestEnemy;
      if (area !== 'arena' && clear) check(there.enemies.every((stage) => !stage.cutsBefore.includes(member.unitId)),
        `sample ${sample}: member ${index + 1} level with the fastest enemy is not cut in before`);
      return clear;
    };
    const floorHolds = (shown) => {
      const there = moved(shown);
      return besideBelow(there) && (!range.clearOfEnemy || enemyClear(there));
    };
    const ceilingHolds = (shown) => {
      const there = moved(shown);
      return index === 0 || there.members[index].combatSpeed <= there.members[index - 1].combatSpeed;
    };
    check(floorHolds(range.minimum) && ceilingHolds(range.minimum), `sample ${sample}: member ${index + 1} holds its slot at the floor ${range.minimum}`);
    const lowest = displaySpeed(member.baseSpeed, member.swift, 0);
    if (range.minimum - 1 >= lowest) check(!floorHolds(range.minimum - 1), `sample ${sample}: member ${index + 1} loses its slot under the floor ${range.minimum}`);
    check((range.maximum === null) === (index === 0), `sample ${sample}: only the first mover has no ceiling`);
    if (range.maximum !== null) {
      check(ceilingHolds(range.maximum) && floorHolds(range.maximum), `sample ${sample}: member ${index + 1} holds its slot at the ceiling ${range.maximum}`);
      if (range.maximum < 999) check(!ceilingHolds(range.maximum + 1), `sample ${sample}: member ${index + 1} loses its slot over the ceiling ${range.maximum}`);
    }
    if (!range.clearOfEnemy) {
      for (let shown = range.minimum; shown <= (range.maximum ?? 999); shown += 1) {
        check(!enemyClear(moved(shown)), `sample ${sample}: member ${index + 1} at ${shown} is cut in, as its range says`);
      }
      blockedRanges += 1;
    }
    rangesChecked += 1;
  }
  for (const member of reading.members) {
    const interval = member.verdict.kind === 'in-place' ? null : member.verdict.interval;
    if (!interval) continue;
    const at = (shown) => readSpeedTeam({
      team: saved, monsters, totemPercent: 15, whatIfs: new Map([[member.unitId, shown]]),
    }).members.find((entry) => entry.unitId === member.unitId).verdict.kind;
    check(at(interval.minimum) === 'in-place', `sample ${sample}: ${interval.minimum} is inside the printed interval`);
    if (interval.maximum !== null) check(at(interval.maximum) === 'in-place', `sample ${sample}: ${interval.maximum} is inside the printed interval`);
    const lowest = displaySpeed(member.baseSpeed, member.swift, 0);
    /* The fix never reaches under the slot's floor, which the Interval column states. */
    check(member.slotRange !== null && interval.minimum >= member.slotRange.minimum, `sample ${sample}: the fix stays on or above the slot's floor`);
    const underFloor = (shown) => shown < member.slotRange.minimum;
    if (interval.minimum - 1 >= lowest) check(underFloor(interval.minimum - 1) || at(interval.minimum - 1) !== 'in-place', `sample ${sample}: ${interval.minimum - 1} is outside the printed interval`);
    if (interval.maximum !== null && interval.maximum < 999) check(at(interval.maximum + 1) !== 'in-place', `sample ${sample}: ${interval.maximum + 1} is outside the printed interval`);
    intervalsChecked += 1;
  }
}
check(rangesChecked > 20, `the sweep exercised slot ranges (${rangesChecked})`);
check(blockedRanges > 0, `the sweep met a slot the enemy gets into (${blockedRanges})`);
check(intervalsChecked > 20, `the sweep exercised intervals (${intervalsChecked})`);

console.log(`Speed tick rules hold: ${checks} checks, ${intervalsChecked} printed intervals confirmed at both edges.`);
