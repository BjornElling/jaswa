/**
 * Random small accounts for the Rune Optimization checks.
 *
 * `verify-rune-optimization.mjs` searches them against brute force on the processor,
 * and `verify-rune-optimization-card.mjs` searches them with the tail on a real card
 * against the processor's own search. One generator for both, so the card is held to
 * exactly the questions the processor was proved on.
 *
 * `runesPerSlot` widens an account past what brute force can afford, for a card
 * check that compares two searches rather than a search and an enumeration.
 */
import { intangibleSetId } from '../app/lib/monster-stats.ts';
import { monsterStatTargetKeys } from '../app/lib/monster-preferences.ts';
import { defaultRuneOptimizationSettings } from '../app/lib/rune-optimization-settings.ts';
import { runeBuild } from '../app/lib/rune-set-pairs.ts';
import { runeSetId } from '../app/lib/rune-sets.ts';
import { slotAllowsSubStat, slotMainProperties } from '../app/lib/runes.ts';

export function scenarioGenerator(firstSeed = 20260930, runesPerSlot = [3, 5]) {
  let seed = firstSeed;
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const between = (low, high) => low + Math.floor(random() * (high - low + 1));

  const statRange = { 1: [135, 375], 2: [5, 40], 3: [10, 80], 4: [5, 40], 5: [10, 80], 6: [5, 40], 8: [4, 30], 9: [4, 30], 10: [4, 35], 11: [4, 40], 12: [4, 40] };
  const mainValue = { 1: 2448, 2: 63, 3: 160, 4: 63, 5: 160, 6: 63, 8: 42, 9: 58, 10: 80, 11: 64, 12: 64 };
  const setPool = [13, 15, 1, 3, 4, 8, 5];

  function randomRune(id, slot, occupiedId, allowIntangible, favoured) {
    /* Mostly the sets the scenario's builds ask for, or almost every table would be
       empty and prove nothing about the ranking. */
    const setId = allowIntangible && random() < 0.12 ? intangibleSetId
      : favoured.length > 0 && random() < 0.8 ? pick(favoured) : pick(setPool);
    const mainStatId = pick(slotMainProperties[slot]);
    const prefixStatId = random() < 0.4 ? pick([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12].filter((stat) => stat !== mainStatId && slotAllowsSubStat(slot, stat))) : null;
    const used = new Set([mainStatId, prefixStatId]);
    const subProperties = [];
    while (subProperties.length < 4) {
      const statId = pick([1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);
      if (used.has(statId) || !slotAllowsSubStat(slot, statId)) continue;
      used.add(statId);
      const [low, high] = statRange[statId];
      subProperties.push({ statId, value: between(low, Math.max(low, Math.round(high / 3))), gemmed: false, grind: 0 });
    }
    const level = pick([12, 15, 15, 9]);
    return {
      id: String(id), setId, setName: '', slot, stars: 6, ancient: false, defaultGrade: 'Legend', level,
      mainStatId, mainValue: level === 15 ? mainValue[mainStatId] : Math.round(mainValue[mainStatId] * 0.6),
      prefixStatId, prefixValue: prefixStatId === null ? 0 : between(...statRange[prefixStatId].map((value, at) => (at ? Math.round(value / 4) : value))),
      subProperties, occupiedId, obtainedOrder: id,
    };
  }

  const builds = [[], ['Violent/Will'], ['Violent/Broken'], ['Swift/Energy', 'Violent/Blade'], ['Energy/Will/Blade'], ['Fatal/Broken', 'Rage/Energy']];
  const figures = monsterStatTargetKeys;

  function scenario(index) {
    const allowIntangible = random() < 0.4;
    const wantedBuilds = builds[index % builds.length];
    const favoured = [...new Set(wantedBuilds.flatMap((id) => runeBuild(id).sets.map((name) => runeSetId(name))))];
    const runes = [];
    let id = 1;
    for (let slot = 1; slot <= 6; slot += 1) {
      const count = between(runesPerSlot[0], runesPerSlot[1]);
      for (let at = 0; at < count; at += 1) {
        const where = random();
        runes.push(randomRune(id, slot, where < 0.3 ? '1' : where < 0.55 ? '2' : null, allowIntangible, favoured));
        id += 1;
      }
    }
    const holds = {};
    if (random() < 0.3) {
      const worn = runes.find((rune) => rune.occupiedId === '1');
      if (worn) holds[worn.id] = { locked: true };
    }
    const other = runes.find((rune) => rune.occupiedId === '2');
    if (other && random() < 0.5) holds[other.id] = { locked: true };

    const craftItems = [
      { id: '901', kind: 'gem', lineage: 'immemorial', setId: null, setName: null, statId: 8, statName: 'SPD', grade: 'Hero', amount: 1, range: undefined },
      { id: '902', kind: 'grindstone', lineage: 'immemorial', setId: null, setName: null, statId: 4, statName: 'ATK %', grade: 'Legend', amount: 2, range: undefined },
      { id: '903', kind: 'grindstone', lineage: 'standard', setId: 13, setName: 'Violent', statId: 8, statName: 'SPD', grade: 'Legend', amount: 1, range: undefined },
    ];
    const rankBy = pick(figures);
    const targets = {};
    if (random() < 0.5) targets.spd = between(100, 150);
    if (random() < 0.3) targets.hp = between(8000, 16000);
    /* A CRI Rate floor now and then, so a monster that always crits is seen to ignore it. */
    if (random() < 0.2) targets.criRate = between(30, 70);
    const gems = pick(['none', 'owned', 'theoretical']);
    const grinds = pick(['none', 'owned', 'theoretical']);
    const allowImmemorial = random() < 0.7;
    const alwaysCrits = random() < 0.3;
    return {
      unitId: '1',
      monster: {
        unit_id: 1, con: 700, atk: 700, def: 600, spd: 101, critical_rate: 15, critical_damage: 50, resist: 15, accuracy: 0,
        artifacts: [{ pri_effect: [101, 100] }, { pri_effect: [100, 1500] }],
      },
      runes, holds, craftItems,
      requirements: {
        builds: wantedBuilds,
        slotMains: { slot2: random() < 0.3 ? ['Spd'] : [], slot4: [], slot6: [] },
        allowIntangible, allowImmemorial, alwaysCrits, targets, rankBy,
      },
      settings: {
        ...defaultRuneOptimizationSettings, gems, grinds, gemGrade: 'Legend', grindGrade: 'Hero',
        runesOnOtherMonsters: random() < 0.7, unfinishedAtMaximum: random() < 0.5,
        depth: 'complete', resultCount: 5,
      },
    };
  }

  return { scenario, random };
}
