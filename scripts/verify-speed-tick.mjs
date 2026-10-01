/**
 * Holds Speed Tuning to the rules `docs/SPEED-TICK-CANONICAL.md` states.
 *
 * Four things are checked, each against the real modules rather than a copy of
 * their arithmetic:
 *
 * 1. The combat-speed formula: one rounding up over the whole sum, Swift exact
 *    in battle and rounded in display speed, and a speed buff on the unrounded
 *    total — the worked figures from the canonical document.
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
  buffedCombatSpeed, combatSpeed, displaySpeed, displayedSwiftBonus, everyoneMoved, leaderAreaReaches, leaderSpeedPercent,
  runeSpeedForDisplay, simulateBattle, ticksToFirstTurn, totemPercentByLevel,
} from '../app/lib/speed-tick.ts';
import { describeTurnEffect, leaderSkill, shortLeaderSkill, speedLeaderSkill, speedSkillProfile } from '../app/lib/speed-skills.ts';
import { dungeonIds, speedContent, speedContents } from '../app/lib/speed-contents.ts';
import { readSpeedTeam } from '../app/lib/speed-tuning-analysis.ts';
import { isSpeedTuningPreferences } from '../app/lib/speed-tuning-preferences.ts';
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
check(buffedCombatSpeed(sheet(100, 0, false, 0)) === 130, 'a speed buff is +30 %');
check(buffedCombatSpeed(sheet(101, 0, false, 15)) === 151, 'the buff multiplies the unrounded total: ⌈116.15 × 1.3⌉ = ⌈150.995⌉');
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
const unit = (key, speed, effects = [], side = 'ally') => ({ key, side, speed, buffedSpeed: Math.ceil(speed * 1.3), effects });
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
  const chasun = speedSkillProfile({ skills: [[9113, 2]] });
  check(chasun.effects.length === 0 && chasun.uncounted.includes('Fallen Blossoms'), 'a balanced bar is not counted, and says so');
}
for (const id of dungeonIds) {
  const content = speedContent(id);
  check(content.teamSize === 5 && content.stages.length >= 3 && content.stages.every((stage) => stage.speeds.length > 0 && stage.fastest === Math.max(...stage.speeds)),
    `${content.name} has a five-monster team and enemy stages`);
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
const team = (members, extra = {}) => ({ id: 'team-1', content: 'giants', members, leaderUnitId: null, marginEnabled: false, margin: 1, ...extra });
check(isSpeedTuningPreferences({ teams: [], rules: [] }), 'an empty workspace is valid');
check(!isSpeedTuningPreferences({ teams: [team([{ unitId: '1' }, { unitId: '1' }])], rules: [] }), 'a monster twice in a team is refused');
check(!isSpeedTuningPreferences({ teams: [team([{ unitId: '1', whatIfDisplaySpeed: 0 }])], rules: [] }), 'a zero what-if is refused, not read as "none"');
check(!isSpeedTuningPreferences({ teams: [team(['1', '2', '3', '4', '5', '6'].map((unitId) => ({ unitId })))], rules: [] }), 'a team larger than its content is refused');
check(!isSpeedTuningPreferences({ teams: [team([{ unitId: '1' }], { leaderUnitId: '2' })], rules: [] }), 'a leader outside the team is refused');
check(!isSpeedTuningPreferences({ teams: [team([], { margin: 4 })], rules: [] }), 'a margin past the maximum is refused');

/* 4. Every printed interval is the truth. */
let seed = 0x5eed;
const random = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
  return seed / 2 ** 31;
};
const skillSets = [[[2563, 3]], [[7361, 2]], [[6512, 1]], [[10015, 1]], []];
let intervalsChecked = 0;
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
  const saved = { id: `sample-${sample}`, content: area, members, leaderUnitId: sample % 3 === 0 ? '1' : null, marginEnabled: sample % 4 === 1, margin: 1 + (sample % 3) };
  const reading = readSpeedTeam({ team: saved, monsters, totemPercent: 15, rules: [] });
  for (const member of reading.members) {
    const interval = member.verdict.kind === 'in-place' ? null : member.verdict.interval;
    if (!interval) continue;
    const at = (shown) => readSpeedTeam({
      team: { ...saved, members: saved.members.map((entry) => entry.unitId === member.unitId ? { ...entry, whatIfDisplaySpeed: shown } : entry) },
      monsters, totemPercent: 15, rules: [],
    }).members.find((entry) => entry.unitId === member.unitId).verdict.kind;
    check(at(interval.minimum) === 'in-place', `sample ${sample}: ${interval.minimum} is inside the printed interval`);
    if (interval.maximum !== null) check(at(interval.maximum) === 'in-place', `sample ${sample}: ${interval.maximum} is inside the printed interval`);
    const lowest = displaySpeed(member.baseSpeed, member.swift, 0);
    if (interval.minimum - 1 >= lowest) check(at(interval.minimum - 1) !== 'in-place', `sample ${sample}: ${interval.minimum - 1} is outside the printed interval`);
    if (interval.maximum !== null && interval.maximum < 999) check(at(interval.maximum + 1) !== 'in-place', `sample ${sample}: ${interval.maximum + 1} is outside the printed interval`);
    intervalsChecked += 1;
  }
}
check(intervalsChecked > 20, `the sweep exercised intervals (${intervalsChecked})`);

console.log(`Speed tick rules hold: ${checks} checks, ${intervalsChecked} printed intervals confirmed at both edges.`);
