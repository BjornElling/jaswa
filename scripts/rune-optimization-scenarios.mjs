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
import { withheldRunes } from '../app/lib/rune-sources.ts';

/**
 * The runes the copy may not take, through the app's one rule: its team is the
 * copies the account's runes are engraved on, and every fourth account ranks
 * copy 2 above the copy searched for. A team lists every member, so the copy
 * searched for is on its list and the rest follow it. `settings` asks the same
 * team again under other switches.
 */
export function withheldIn(input, index, settings = input.settings) {
  const runeOwner = new Map(input.runes.filter((rune) => rune.occupiedId !== null).map((rune) => [rune.id, rune.occupiedId]));
  const above = index % 4 === 3 ? ['2'] : [];
  const rest = [...new Set(runeOwner.values())].filter((owner) => owner !== input.unitId && !above.includes(owner));
  return withheldRunes({ kind: 'game', runeOwner, poolRunes: new Map() }, input.unitId, [...above, input.unitId, ...rest], settings, {});
}

/** Scarce grades expose craft choices that an independent per-rune guide can miss. */
export function stockGuidanceScenarios(count = 40) {
  const generator = scenarioGenerator(20261005, [3, 5]);
  return Array.from({ length: count }, (_, index) => {
    const input = generator.scenario(index);
    input.locks = {}; input.withheld = {};
    input.runes = input.runes.map((rune) => ({ ...rune, setId: 13, occupiedId: null, ancient: false, level: 15 }));
    input.requirements = { ...input.requirements, builds: [], slotMains: { slot2: [], slot4: [], slot6: [] },
      allowBroken: true, allowIntangible: false, alwaysCrits: false,
      rankBy: index % 2 ? 'ehp' : 'dmg', targets: {}, ceilings: {} };
    input.settings = { ...input.settings, depth: 'quick', gems: 'owned', grinds: 'owned',
      runesOnOtherMonsters: true, resultCount: 10 };
    input.craftItems = ['gem', 'grindstone'].flatMap((kind) =>
      (kind === 'gem' ? [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12] : [1, 2, 3, 4, 5, 6, 8]).flatMap((statId) =>
        ['Hero', 'Legend'].map((grade) => ({ id: `${kind}-${statId}-${grade}`, kind,
          lineage: 'standard', setId: 13, setName: 'Violent', statId, statName: 'Synthetic', grade, amount: 1 }))));
    return input;
  });
}

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
      id: String(id), setId, setName: '', slot, stars: 6, ancient: false, rarity: 'Legend', level,
      mainStatId, mainValue: level === 15 ? mainValue[mainStatId] : Math.round(mainValue[mainStatId] * 0.6),
      prefixStatId, prefixValue: prefixStatId === null ? 0 : between(...statRange[prefixStatId].map((value, at) => (at ? Math.round(value / 4) : value))),
      subProperties, occupiedId, obtainedOrder: id,
    };
  }

  const builds = [[], ['Violent/Will'], ['Violent'], ['Swift/Energy', 'Violent/Blade'], ['Energy/Will/Blade'], ['Fatal', 'Rage/Energy'], ['Will'], ['Energy/Blade'], ['Blade/Blade'], ['Will/Will/Will']];
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
    const locks = {};
    if (random() < 0.3) {
      const engraved = runes.find((rune) => rune.occupiedId === '1');
      if (engraved) locks[engraved.id] = 'locked';
    }
    const other = runes.find((rune) => rune.occupiedId === '2');
    if (other && random() < 0.5) locks[other.id] = 'locked';
    /* An exclusion now and then, drawn from the index alone so every seed's accounts stay as they were. */
    const excluded = index % 5 === 4 ? runes.find((rune) => rune.slot === 3 && !(rune.id in locks)) : undefined;
    if (excluded) locks[excluded.id] = 'excluded';

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
    const alwaysElementAdvantage = index % 4 === 0;
    /* Leads drawn from the index alone, so the accounts every seed produces stay as
       they were: a crit lead now and then, and the three percentage leads, so a lead
       on ATK, DEF and HP each meets a range and a ranking. */
    const critLead = index % 5 === 0 ? [0, 19, 24, 33][index % 4] : undefined;
    const leads = {
      ...(critLead === undefined ? {} : { criRate: critLead }),
      ...(index % 6 === 1 ? { atk: 33 } : {}),
      ...(index % 6 === 2 ? { hp: 30, def: 20 } : {}),
    };
    const allowBroken = random() < 0.5;
    /* The other end of a range now and then: a ceiling turns "more is better" off on
       what it reads, which is exactly what the exact reduction must notice. */
    const ceilings = {};
    if (random() < 0.35) ceilings.spd = between(130, 190);
    if (random() < 0.2) ceilings.hp = between(12000, 20000);
    if (random() < 0.15) ceilings.criRate = between(40, 90);
    const input = {
      unitId: '1',
      monster: {
        unit_id: 1, con: 700, atk: 700, def: 600, spd: 101, critical_rate: 15, critical_damage: 50, resist: 15, accuracy: 0,
        artifacts: [{ pri_effect: [101, 100] }, { pri_effect: [100, 1500] }],
        relics: index % 2 === 0 ? [{ pri_effect: [102, 12] }] : [],
      },
      runes, locks, craftItems,
      requirements: {
        builds: wantedBuilds,
        slotMains: { slot2: random() < 0.3 ? ['Spd'] : [], slot4: [], slot6: [] },
        allowBroken, allowIntangible, alwaysCrits, alwaysElementAdvantage, leads, targets, ceilings, rankBy,
      },
      settings: {
        ...defaultRuneOptimizationSettings, gems, grinds, gemGrade: 'Legend', grindGrade: 'Hero', allowImmemorial,
        runesOnOtherMonsters: random() < 0.7, unfinishedAtMaximum: random() < 0.5,
        depth: 'complete', resultCount: 5,
      },
    };
    /* The team's priority comes from the index alone, without drawing on the
       generator, so the accounts the other seeds produce stay as they were. */
    input.withheld = withheldIn(input, index);
    return input;
  }

  return { scenario, random };
}

/** Two open slots leave a complete craft oracle affordable, even with tight ranges. */
export function craftedRangeScenarios() {
  const generator = scenarioGenerator(20261006, [2, 2]);
  return Array.from({ length: 18 }, (_, index) => {
    const input = generator.scenario(0);
    input.locks = {}; input.withheld = {};
    input.runes = input.runes.filter((rune, at, all) => rune.slot >= 5
      || all.findIndex((other) => other.slot === rune.slot) === at).map((rune, at) => ({
      ...rune, occupiedId: rune.slot < 5 ? input.unitId : null, level: 15,
      setId: at % 3 === 0 ? 15 : 13, ancient: index % 3 === 0 && rune.slot === 5,
    }));
    input.locks = Object.fromEntries(input.runes.filter((rune) => rune.slot < 5).map((rune) => [rune.id, 'locked']));
    input.requirements = { ...input.requirements, builds: [], slotMains: { slot2: [], slot4: [], slot6: [] },
      allowBroken: true, allowIntangible: false, alwaysCrits: index % 7 === 0,
      alwaysElementAdvantage: false, leads: {}, targets: {}, ceilings: {},
      rankBy: ['dmg', 'ehp', 'spd'][index % 3] };
    input.settings = { ...input.settings, depth: 'complete', gems: 'owned', grinds: 'owned', allowImmemorial: true,
      runesOnOtherMonsters: true, resultCount: 3 };
    input.craftItems = ['standard', 'ancient', 'immemorial'].flatMap((lineage) =>
      (lineage === 'immemorial' ? [null] : [13, 15]).flatMap((setId) =>
        ['Hero', 'Legend'].flatMap((grade) => ['gem', 'grindstone'].flatMap((kind) => (kind === 'gem' ? [8] : [4, 8]).map((statId) => ({
          id: `${lineage}-${setId}-${kind}-${grade}-${statId}`, kind, lineage, setId, setName: null,
          statId, statName: 'Synthetic', grade, amount: grade === 'Legend' ? 1 : 2,
        }))))));
    return input;
  });
}
