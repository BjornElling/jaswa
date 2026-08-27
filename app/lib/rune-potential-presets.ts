/**
 * The working presets a rune is judged against.
 *
 * Each preset states, for one role: which rune sets it wants, which main
 * stats it will accept in the three slots that carry a choice (2, 4 and 6),
 * whether an artifact's primary stat suits it, and the stat targets the
 * finished build aims at.
 *
 * Sets and main stats are split into *preferred* and *acceptable*. Preferred
 * is what the role is built around; acceptable is what still works when the
 * box does not oblige. The distinction is carried through to the interface,
 * where preferred reads in full ink and acceptable is dimmed.
 */
import { calculateRunePotentialMetrics, displayRunePotentialMetric } from './rune-potential-metrics';

/**
 * The main stats a rune can carry in slots 2, 4 and 6, named as the source
 * spreadsheet names them so the two can be compared line for line.
 */
export type RuneMainStat = 'HP%' | 'Atk%' | 'Def%' | 'Spd' | 'CtR%' | 'CtD%' | 'Res%' | 'Acc%';

/** Preferred first, acceptable second — the same split for sets and main stats. */
export type PresetChoice<T> = { preferred: readonly T[]; acceptable: readonly T[] };

/** Slots 1, 3 and 5 have a fixed main stat, so only these three are stated. */
export type PresetSlots = { slot2: PresetChoice<RuneMainStat>; slot4: PresetChoice<RuneMainStat>; slot6: PresetChoice<RuneMainStat> };

/** Whether an artifact's primary stat suits the role. */
export type PresetArtifacts = { atk: boolean; def: boolean; hp: boolean };

/**
 * The stat targets a role aims at, as stated. A stat left `undefined` is one
 * the role does not aim at and is shown as a dash; an explicit `0` is a stated
 * target of nothing, and is shown as `0`.
 */
export type PresetStatTargets = {
  hp?: number; atk?: number; def?: number; spd?: number;
  res?: number; acc?: number; criRate?: number; criDmg?: number;
};

/**
 * The full target row: the stated stats plus the three composite figures. The
 * composites are never stated — `runePotentialPresets` derives them from the
 * stats above by the contract in `docs/RUNE-PRESET-METRICS.md`, so a preset
 * cannot carry a DMG or E.HP that its own stats do not produce.
 */
export type PresetTargets = PresetStatTargets & {
  dmg?: number; ehp?: number; ehpD?: number;
};

/**
 * The broad family a role belongs to, shown under the preset's own name. It
 * says which stat the build is organised around, where the name says what the
 * monster is for. `No type` is for a role that commits to none of them — the
 * `All` of the source spreadsheet, which wants every family at once and so
 * privileges none.
 */
export type PresetType = 'Attack type' | 'Support type' | 'Defence type' | 'HP type' | 'No type';

export type RunePotentialPreset = {
  id: string;
  name: string;
  type: PresetType;
  sets: PresetChoice<string>;
  slots: PresetSlots;
  artifacts: PresetArtifacts;
  targets: PresetTargets;
};

/** As a preset is written in this file: the composites are not its author's to state. */
type PresetSource = Omit<RunePotentialPreset, 'targets'> & { targets: PresetStatTargets };

/**
 * Fills in `dmg`, `ehp` and `ehpD` from the preset's own stat targets, using
 * the same calculation and the same truncating display rule the rest of the app
 * uses for these figures. A role that states no ATK, CRI Rate or CRI Dmg still
 * gets a DMG of 0 rather than a dash: nothing is missing, the answer is zero.
 */
function withDerivedMetrics(preset: PresetSource): RunePotentialPreset {
  const { hp = 0, atk = 0, def = 0, criRate = 0, criDmg = 0 } = preset.targets;
  const metrics = calculateRunePotentialMetrics({
    atk, hp, def, criticalRate: criRate, criticalDamage: criDmg,
  });
  return {
    ...preset,
    targets: {
      ...preset.targets,
      dmg: displayRunePotentialMetric(metrics.dmg),
      ehp: displayRunePotentialMetric(metrics.ehp),
      ehpD: displayRunePotentialMetric(metrics.ehpD),
    },
  };
}

/* The order the targets are read in, with the short labels the interface
   uses. Kept beside the data so a new target cannot be added without also
   being given a place to appear. */
export const presetTargetColumns: ReadonlyArray<{ key: keyof PresetTargets; label: string; unit?: string }> = [
  { key: 'hp', label: 'HP' },
  { key: 'atk', label: 'Atk' },
  { key: 'def', label: 'Def' },
  { key: 'spd', label: 'Spd' },
  { key: 'criRate', label: 'CtR', unit: '%' },
  { key: 'criDmg', label: 'CtD', unit: '%' },
  { key: 'res', label: 'Res', unit: '%' },
  { key: 'acc', label: 'Acc', unit: '%' },
  { key: 'dmg', label: 'DMG' },
  { key: 'ehp', label: 'E.HP' },
  { key: 'ehpD', label: 'E.HP D' },
];

/*
 * Working presets deliberately live in source code. They are read-only until
 * the future preset editor is introduced.
 *
 * Sets, slots, artifacts and the stat targets are transcribed from the source
 * spreadsheet. DMG, E.HP and E.HP D are deliberately absent: `withDerivedMetrics`
 * computes them from each preset's own stats, so no transcription error is
 * possible and editing a stat cannot leave a stale composite behind. Where the
 * spreadsheet's own composites differed they were one unit higher, from
 * rounding up where SWOP's display truncates.
 */
const presetSources: readonly PresetSource[] = [
  {
    id: 'slow-dd',
    name: 'Slow DD',
    type: 'Attack type',
    sets: {
      preferred: ['Fight', 'Intangible', 'Rage', 'Shield', 'Violent', 'Will'],
      acceptable: ['Blade', 'Fatal', 'Swift', 'Vampire'],
    },
    slots: {
      slot2: { preferred: ['Atk%'], acceptable: [] },
      slot4: { preferred: ['CtD%'], acceptable: [] },
      slot6: { preferred: ['Atk%'], acceptable: [] },
    },
    artifacts: { atk: true, def: false, hp: true },
    targets: { hp: 25069, atk: 2700, def: 814, spd: 150, res: 0, acc: 25, criRate: 95, criDmg: 200 },
  },
  {
    id: 'fast-dd',
    name: 'Fast DD',
    type: 'Attack type',
    sets: {
      preferred: ['Blade', 'Fight', 'Intangible', 'Nemesis', 'Rage', 'Vampire', 'Violent', 'Will'],
      acceptable: ['Despair', 'Fatal', 'Focus', 'Seal', 'Shield', 'Swift'],
    },
    slots: {
      slot2: { preferred: ['Atk%', 'Spd'], acceptable: [] },
      slot4: { preferred: ['CtD%'], acceptable: [] },
      slot6: { preferred: ['Atk%'], acceptable: [] },
    },
    artifacts: { atk: true, def: false, hp: false },
    targets: { hp: 15042, atk: 2500, def: 814, spd: 215, res: 0, acc: 25, criRate: 90, criDmg: 175 },
  },
  {
    id: 'def-dd',
    name: 'Def DD',
    type: 'Attack type',
    sets: {
      preferred: ['Determination', 'Guard', 'Intangible', 'Rage', 'Vampire', 'Will'],
      acceptable: ['Blade', 'Fight', 'Violent'],
    },
    slots: {
      slot2: { preferred: ['Def%'], acceptable: [] },
      slot4: { preferred: ['CtD%'], acceptable: ['Def%'] },
      slot6: { preferred: ['Def%'], acceptable: [] },
    },
    artifacts: { atk: false, def: true, hp: false },
    targets: { hp: 14649, atk: 1000, def: 2600, spd: 175, res: 0, acc: 25, criRate: 70, criDmg: 200 },
  },
  {
    id: 'bomber',
    name: 'Bomber',
    type: 'Attack type',
    sets: {
      preferred: ['Fatal', 'Intangible', 'Violent', 'Will'],
      acceptable: ['Destroy', 'Energy', 'Fight', 'Focus', 'Vampire'],
    },
    slots: {
      slot2: { preferred: ['Atk%', 'Spd'], acceptable: ['HP%'] },
      slot4: { preferred: ['Atk%', 'HP%'], acceptable: ['CtR%'] },
      slot6: { preferred: ['Atk%', 'HP%'], acceptable: [] },
    },
    artifacts: { atk: true, def: false, hp: true },
    targets: { hp: 28195, atk: 2400, def: 941, spd: 215, res: 0, acc: 50, criRate: 50, criDmg: 0 },
  },
  {
    id: 'support',
    name: 'Support',
    type: 'Support type',
    sets: {
      preferred: ['Accuracy', 'Despair', 'Focus', 'Fight', 'Intangible', 'Seal', 'Swift', 'Violent', 'Will'],
      acceptable: ['Determination', 'Enhance', 'Energy', 'Tolerance', 'Guard'],
    },
    slots: {
      slot2: { preferred: ['Spd'], acceptable: [] },
      slot4: { preferred: ['HP%'], acceptable: ['Def%'] },
      slot6: { preferred: ['HP%'], acceptable: ['Acc%', 'Def%'] },
    },
    artifacts: { atk: false, def: false, hp: true },
    targets: { hp: 37500, atk: 0, def: 1200, spd: 275, res: 0, acc: 65, criRate: 0, criDmg: 0 },
  },
  {
    id: 'pvp-def',
    name: 'PvP def',
    type: 'HP type',
    sets: {
      preferred: ['Endure', 'Enhance', 'Fight', 'Intangible', 'Seal', 'Shield', 'Tolerance', 'Violent', 'Will'],
      acceptable: ['Despair', 'Destroy', 'Determination', 'Energy', 'Revenge', 'Nemesis', 'Vampire'],
    },
    slots: {
      slot2: { preferred: ['Spd', 'HP%'], acceptable: ['Def%'] },
      slot4: { preferred: ['HP%'], acceptable: ['Def%'] },
      slot6: { preferred: ['HP%'], acceptable: ['Def%'] },
    },
    artifacts: { atk: false, def: false, hp: true },
    targets: { hp: 43860, atk: 0, def: 1303, spd: 200, res: 80, acc: 25, criRate: 0, criDmg: 0 },
  },
  {
    id: 'bruiser',
    name: 'Bruiser',
    type: 'No type',
    sets: {
      preferred: ['Blade', 'Fight', 'Intangible', 'Seal', 'Shield', 'Vampire', 'Violent', 'Will'],
      acceptable: ['Despair', 'Destroy', 'Energy', 'Rage', 'Revenge'],
    },
    slots: {
      slot2: { preferred: ['Spd', 'Atk%', 'HP%'], acceptable: ['Def%'] },
      slot4: { preferred: ['CtD%'], acceptable: ['CtR%'] },
      slot6: { preferred: ['HP%', 'Atk%'], acceptable: ['Def%'] },
    },
    artifacts: { atk: true, def: false, hp: true },
    targets: { hp: 28195, atk: 1800, def: 941, spd: 215, res: 0, acc: 25, criRate: 75, criDmg: 150 },
  },
];

export const runePotentialPresets: readonly RunePotentialPreset[] = presetSources.map(withDerivedMetrics);
