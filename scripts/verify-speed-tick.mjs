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
import { enemyNamesOf, readSpeedTeam } from '../app/lib/speed-tuning-analysis.ts';
import {
  isSpeedTuningPreferences, presetSpeedTeam, readSpeedTuningPreferences, speedTuningOf,
} from '../app/lib/speed-tuning-preferences.ts';
import { readSkyTribeTotem, skyTribeTotemProblem } from '../app/lib/sky-tribe-totem.ts';
import { calculateMonsterTotals, monsterSpeedParts } from '../app/lib/monster-stats.ts';
import { hasMonsterCatalogEntry } from '../app/lib/monster-catalog.ts';

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
check(leaderSpeedPercent({ percent: 30, area: 'General', element: 'Wind' }, 'arena', 'Fire') === 0, 'an element lead skips other elements');
check(leaderSpeedPercent({ percent: 30, area: 'General', element: 'Wind' }, 'dungeon', 'Wind') === 30, 'an element lead reaches its element everywhere');
check(leaderSpeedPercent({ percent: 30, area: 'Arena', element: 'Wind' }, 'dungeon', 'Wind') === 0, 'an element lead keeps its area');
/* Swarfarm writes an element lead two ways; the snapshot must keep the element
   whichever it was. Agrius leads fire monsters only. */
const agrius = leaderSkill(34112);
check(agrius?.attribute === 'Critical Rate' && agrius.element === 'Fire', 'Agrius leads fire monsters only');
check(shortLeaderSkill(agrius) === 'CRI Rate 30 % · Fire', `Agrius's lead names its element (${shortLeaderSkill(agrius)})`);
/* Where a lead counts is one rule for every attribute: the speed figure above
   and the editor's red mark must agree. */
for (const leaderArea of ['General', 'Arena', 'Dungeon', 'Guild']) {
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
  /* §4: a one-ally boost goes to the lowest other bar under auto battle — never
     to the caster, whose bar has just emptied — unless the skill names the
     highest. The Giant's Keep team that showed it, at its dungeon speeds:
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
  /* "Fills up an ally target's Attack Bar" is a full bar, to the lowest. */
  const konamiya = speedSkillProfile({ skills: [[1901, 9], [1906, 3], [1911, 6]] });
  check(konamiya.uncounted.length === 0 && konamiya.effects.length === 1 && konamiya.effects[0].kind === 'ally-attack-bar'
    && konamiya.effects[0].amount === 10_000 && konamiya.effects[0].target === 'lowest-attack-bar', 'Resurge fills the lowest ally\'s bar');
  const swordOfJustice = speedSkillProfile({ skills: [[23501, 1]] });
  check(swordOfJustice.effects.some((effect) => effect.kind === 'ally-attack-bar' && effect.target === 'highest-attack-bar'),
    'a skill naming the highest attack bar keeps its own target');
  const breeze = speedSkillProfile({ skills: [[11801, 1]] });
  check(breeze.effects.some((effect) => effect.kind === 'ally-attack-bar' && effect.target === 'lowest-attack-bar'),
    'a skill naming the lowest attack bar goes there');
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

/* The saved contract: per preset, the turn order asked for and the what-ifs
   tried. The monsters and the leader are the preset's, so none is stored. */
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
check(isSpeedTuningPreferences({ presets: {} }), 'an empty workspace is valid');
check(same(readSpeedTuningPreferences({ presets: {} }), { presets: {} }), 'an empty workspace reads back empty');
check(same(readSpeedTuningPreferences(undefined), { presets: {} }), 'nothing stored reads as nothing tuned');
check(isSpeedTuningPreferences({ presets: { 'deck-24-101': { order: ['1', '2'], whatIfs: { 1: 120 } } } }), 'an order and a what-if are kept with their preset');
check(!isSpeedTuningPreferences({ presets: { 'deck-24-101': { order: ['1', '1'], whatIfs: {} } } }), 'a monster twice in an order is not written');
check(!isSpeedTuningPreferences({ presets: { 'deck-24-101': { order: ['1'], whatIfs: { 1: 0 } } } }), 'a what-if of zero is not written');
check(!isSpeedTuningPreferences({ presets: { 'deck-24-101': { order: ['1'], whatIfs: {}, margin: 1 } } }), 'a field the contract does not name is not written');
check(!isSpeedTuningPreferences({ presets: {}, teams: [] }), 'a section the contract does not name is not written');
check(!isSpeedTuningPreferences({ teams: [], rules: [] }), 'the teams-and-rules shape is no longer the contract');
{
  const stored = readSpeedTuningPreferences({ presets: { 'deck-24-101': { order: ['1', '2'], whatIfs: { 1: 'fast', 2: 140, 3: 1000 } } } });
  check(same(stored.presets['deck-24-101'], { order: ['1', '2'], whatIfs: { 2: 140 } }),
    'a malformed what-if is dropped on its own; its neighbour and the order it sat beside are kept');
}
{
  const stored = readSpeedTuningPreferences({ presets: { 'deck-1-1': { order: ['2', '1', '2', 5, '', '3', '1'], whatIfs: {} } } });
  check(same(stored.presets['deck-1-1'].order, ['2', '1', '3']), 'a repeated or unreadable order entry is dropped alone, the rest keep their places');
}
{
  const stored = readSpeedTuningPreferences({ presets: {
    'deck-1-1': { order: ['1'], whatIfs: {} },
    'deck-1-2': 'not a preset',
    '': { order: ['1'], whatIfs: {} },
    'deck-1-3': { order: ['4'], whatIfs: { 4: 150 }, marginEnabled: true },
  } });
  check(same(Object.keys(stored.presets), ['deck-1-1', 'deck-1-3']), 'an unreadable preset entry costs only itself');
  check(same(stored.presets['deck-1-3'], { order: ['4'], whatIfs: { 4: 150 } }), 'a field the page no longer offers is left out on reading, and the preset kept');
}
check(same(readSpeedTuningPreferences({ teams: [{ id: 'team-1', content: 'giants', members: [{ unitId: '1' }], leaderUnitId: null }], rules: [] }), { presets: {} }),
  'the teams-and-rules shape reads as nothing tuned');
{
  /* A preset's own members and leader, in the order asked for: one the preset
     gained since is placed last, one it lost is left out with its what-if. */
  const preset = { id: 'deck-24-101', members: ['1', '2', '3'], leaderUnitId: '2' };
  const team = presetSpeedTeam(preset, 'giants', { order: ['3', '9', '1'], whatIfs: { 1: 130, 9: 150 } });
  check(team !== null && same(team.members, [{ unitId: '3' }, { unitId: '1', whatIfDisplaySpeed: 130 }, { unitId: '2' }])
    && team.leaderUnitId === '2' && team.id === 'deck-24-101' && team.content === 'giants',
    'the stored order leads, a new member follows it, a departed one is gone');
  check(same(presetSpeedTeam(preset, 'giants', undefined)?.members, [{ unitId: '1' }, { unitId: '2' }, { unitId: '3' }]),
    'a preset never tuned reads in the game\'s own order');
  check(same(speedTuningOf(team), { order: ['3', '1', '2'], whatIfs: { 1: 130 } }), 'a team written back stores only the order and the what-ifs');
  check(presetSpeedTeam({ ...preset, members: ['1', '2', '3', '4', '5'] }, 'arena', undefined) === null,
    'a preset holding more monsters than its content fields is no team to tune');
  check(presetSpeedTeam({ ...preset, members: ['1', '2', '3', '4', '5'] }, 'giants', undefined)?.members.length === 5, 'a full dungeon team is one');
}
{
  /* Stored, a what-if still never reaches a reading that is not handed it: the page judges the runes engraved. */
  const unitId = '1';
  const monster = { unit_id: 1, unit_master_id: 14712, attribute: 2, spd: 100, skills: [], runes: [{ set_id: 1, slot_no: 2, pri_eff: [8, 40], sec_eff: [] }] };
  const monsters = new Map([[unitId, monster]]);
  const preset = { id: 'deck-24-101', members: [unitId], leaderUnitId: null };
  const plain = readSpeedTeam({ team: presetSpeedTeam(preset, 'giants', undefined), monsters, totemPercent: 15 });
  const stored = readSpeedTeam({ team: presetSpeedTeam(preset, 'giants', { order: [unitId], whatIfs: { [unitId]: 999 } }), monsters, totemPercent: 15 });
  check(stored.members[0].displaySpeed === monsterSpeedParts(monster).displaySpeed && !stored.members[0].whatIf
    && stored.members[0].combatSpeed === plain.members[0].combatSpeed, 'a stored what-if is read by nothing but the overlay');
}

/* 4. Every display speed the page offers can be tuned to. */
let seed = 0x5eed;
const random = () => {
  seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
  return seed / 2 ** 31;
};
const skillSets = [[[2563, 3]], [[7361, 2]], [[6512, 1]], [[10015, 1]], []];
let rangesChecked = 0;
let emptyRanges = 0;
let walksCompleted = 0;
/* Read off a reading's own drawn traces, apart from the module's search:
   whether every member from `from` down moves strictly before every member
   below it, trails every member above it, and has no enemy turn before it. */
const holdsFrom = (reading, members, from) => {
  const events = reading.trace.events;
  const first = new Map();
  events.forEach((event, at) => { if (!first.has(event.key)) first.set(event.key, { at, event }); });
  const strict = (upper, lower) => {
    const a = first.get(upper);
    const b = first.get(lower);
    return Boolean(a) && (!b || (a.at < b.at && !a.event.tiedWith.includes(lower)));
  };
  for (let upper = 0; upper < members.length; upper += 1) {
    for (let lower = Math.max(upper + 1, from); lower < members.length; lower += 1) {
      if (!strict(members[upper].unitId, members[lower].unitId)) return false;
    }
  }
  const below = new Set(members.slice(from).map((member) => member.unitId));
  return reading.enemies.every((stage) => stage.cutsBefore.every((unitId) => !below.has(unitId)));
};
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
  const read = (whatIfs, ranges = true) => readSpeedTeam({ team: saved, monsters, totemPercent: 15, whatIfs, ranges });
  const reading = read(undefined);
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
  reading.members.forEach((member, index) => {
    const passesSomeoneAbove = reading.members.slice(0, index).some((above) => firstAt(member.unitId) < firstAt(above.unitId));
    check((member.verdict.kind === 'order') === passesSomeoneAbove, `sample ${sample}: member ${index + 1} is too fast exactly when it moves before one above it`);
    const cutAt = reading.enemies.flatMap((stage, at) => stage.cutsBefore.includes(member.unitId) ? [at + 1] : []);
    check(member.cutInAt.join() === cutAt.join(), `sample ${sample}: member ${index + 1} is warned of exactly the stages that cut in before it`);
    const range = member.range;
    if (range) check(member.inRange === (member.displaySpeed >= range.minimum && (range.maximum === null || member.displaySpeed <= range.maximum)),
      `sample ${sample}: member ${index + 1} knows whether it is in its range`);
  });
  /* Tuned from the top down, as the page invites: each member outside its
     range is given the first value of it, in order. Whenever every member on
     the way has a range when its turn comes, the team ends perfect with no
     enemy cutting in. */
  /* A member settled in the team as read — in its place with every member
     above it in theirs — is never tuned slower on the way down: the ranges
     being checked were read with it there. It is given the first value of its
     range at or above its own, and one whose range lies wholly under it stops
     the walk. */
  const firstUnsettled = reading.members.findIndex((member) => member.verdict.kind !== 'in-place');
  const settled = reading.members.map((_, at) => firstUnsettled === -1 || at < firstUnsettled);
  const walk = (typed, from) => {
    let walked = read(new Map(typed));
    for (let at = from; at < members.length; at += 1) {
      const member = walked.members[at];
      if (member.range === null) return { walked, through: false };
      if (!member.inRange) {
        const own = reading.members[at].displaySpeed;
        const value = settled[at] ? Math.max(member.range.minimum, own) : member.range.minimum;
        if (member.range.maximum !== null && value > member.range.maximum) return { walked, through: false };
        typed.set(member.unitId, value);
        walked = read(new Map(typed));
      }
    }
    return { walked, through: true };
  };
  {
    const { walked, through } = walk(new Map(), 0);
    if (through) {
      check(holdsFrom(walked, members, 0), `sample ${sample}: tuned top-down through its ranges, the team ends perfect`);
      walksCompleted += 1;
    }
  }
  /* Each range's edges, for a third of the sweep: the search runs the clock
     thousands of times, and every edge costs a walk. At its floor a member
     trails the ones above and leaves the ones below a way through; one
     display speed under it, it does not; one over its ceiling, it no longer
     trails the member above it — or, for the arena's first mover, whom the
     worst-case enemy follows, leaves no way through. */
  if (sample % 3 !== 0) continue;
  const tunesAt = (index, value) => {
    const typed = new Map([[members[index].unitId, value]]);
    const { walked, through } = walk(typed, index + 1);
    return through && holdsFrom(walked, members, index);
  };
  for (const [index, member] of reading.members.entries()) {
    const lowest = displaySpeed(member.baseSpeed, member.swift, 0);
    const range = member.range;
    if (range === null) {
      for (let value = lowest; value <= 999; value += 113) check(!tunesAt(index, value), `sample ${sample}: member ${index + 1} has no range, and ${value} cannot be tuned to`);
      emptyRanges += 1;
      continue;
    }
    check(tunesAt(index, range.minimum), `sample ${sample}: member ${index + 1} can be tuned to ${range.minimum}, its range's floor`);
    if (range.maximum !== null) check(tunesAt(index, range.maximum), `sample ${sample}: member ${index + 1} can be tuned to ${range.maximum}, its range's ceiling`);
    if (range.minimum - 1 >= lowest) check(!tunesAt(index, range.minimum - 1), `sample ${sample}: member ${index + 1} cannot be tuned to ${range.minimum - 1}, under its range`);
    if (range.maximum !== null && range.maximum < 999) check(!tunesAt(index, range.maximum + 1), `sample ${sample}: member ${index + 1} cannot be tuned to ${range.maximum + 1}, over its range`);
    rangesChecked += 1;
  }
  /* The page asks for no ranges and gets none. */
  check(read(undefined, false).members.every((member) => member.range === null && !member.inRange), `sample ${sample}: a reading without ranges carries none`);
}
check(rangesChecked > 20, `the sweep exercised ranges (${rangesChecked})`);
check(walksCompleted > 20, `the sweep tuned teams top-down to the end (${walksCompleted})`);

console.log(`Speed tick rules hold: ${checks} checks, ${rangesChecked} ranges confirmed at both edges, ${walksCompleted} teams tuned top-down to perfect.`);
