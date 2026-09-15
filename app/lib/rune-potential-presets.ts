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
 *
 * The presets below are the ones JASWA starts with, and nothing more: they
 * are copied into the user's own preferences on first use, and from then on
 * are edited and deleted exactly like presets the user typed in themselves.
 */
import { calculateRunePotentialMetrics, displayRunePotentialMetric } from './rune-potential-metrics';
import { presetRuneSetNameList } from './rune-sets';

/**
 * The main stats a rune can carry in slots 2, 4 and 6, named as the source
 * spreadsheet names them so the two can be compared line for line.
 */
export type RuneMainStat = 'HP%' | 'Atk%' | 'Def%' | 'Spd' | 'CtR%' | 'CtD%' | 'Res%' | 'Acc%';

/** Every main stat a choice may name, in the order the editor offers them. */
export const runeMainStats: readonly RuneMainStat[] = ['HP%', 'Atk%', 'Def%', 'Spd', 'CtR%', 'CtD%', 'Res%', 'Acc%'];

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
 * composites are never stated — `withRefreshedMetrics` derives them from the
 * stats above by the contract in `docs/RUNE-PRESET-METRICS.md` on every save,
 * so a preset cannot carry a DMG or E.HP that its own stats do not produce.
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

/** The families, in the order the editor offers them. */
export const presetTypes: readonly PresetType[] = ['Attack type', 'Support type', 'Defence type', 'HP type', 'No type'];

/*
 * How many runes a role wants kept, relative to what an even share would give
 * it. The scale is multiplicative and centred on `1`, so a role is stated as
 * wanting its ordinary share, a fraction of it, or a multiple — never an
 * absolute count, which would go stale the moment the box or the roster grew.
 *
 * Stored as the 1-based index of the step rather than the ratio itself: it is
 * what the slider moves through, it keeps the steps a closed set no file can
 * widen, and it is the same shape the potential sliders above already store.
 */
export const presetRuneShareSteps: readonly string[] = ['1/10', '1/5', '1/3', '1/2', 'x1', 'x2', 'x3', 'x5', 'x10'];

/** An even share — the step a preset starts on, and the one older presets take. */
export const defaultRuneShareStep = presetRuneShareSteps.indexOf('x1') + 1;

/** The label for one stored step, for the card and the editor alike. */
export function runeShareLabel(step: number): string {
  return presetRuneShareSteps[step - 1] ?? presetRuneShareSteps[defaultRuneShareStep - 1];
}

function isRuneShareStep(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= 1 && value <= presetRuneShareSteps.length;
}

export type RunePotentialPreset = {
  id: string;
  name: string;
  type: PresetType;
  runeShare: number;
  sets: PresetChoice<string>;
  slots: PresetSlots;
  artifacts: PresetArtifacts;
  targets: PresetTargets;
};

/**
 * As a preset is written in this file: the composites are not its author's to
 * state, and a preset that does not care how many runes it keeps may leave the
 * share out and take the even one.
 */
type PresetSource = Omit<RunePotentialPreset, 'targets' | 'runeShare'>
  & { targets: PresetStatTargets; runeShare?: number };

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
    runeShare: preset.runeShare ?? defaultRuneShareStep,
    targets: {
      ...preset.targets,
      dmg: displayRunePotentialMetric(metrics.dmg),
      ehp: displayRunePotentialMetric(metrics.ehp),
      ehpD: displayRunePotentialMetric(metrics.ehpD),
    },
  };
}

/**
 * The stats a preset states, as distinct from the three composites derived
 * from them. The editor offers exactly these, in this order.
 */
export const presetStatTargetKeys: ReadonlyArray<keyof PresetStatTargets> = ['hp', 'atk', 'def', 'spd', 'criRate', 'criDmg', 'res', 'acc'];

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
 * The presets JASWA ships with. These are ordinary starting values, not
 * fixtures: they are copied into the user's preferences the first time the
 * workspace is opened, and are then editable and deletable like any other.
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
    runeShare: 6, // x2: the roster has a broad pool of slower critical damage dealers.
    sets: {
      preferred: ['Fight', 'Rage', 'Shield', 'Violent', 'Will'],
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
    runeShare: 6, // x2: speed damage dealers form another large working pool.
    sets: {
      preferred: ['Blade', 'Fight', 'Nemesis', 'Rage', 'Vampire', 'Violent', 'Will'],
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
    runeShare: 4, // 1/2: defence damage dealers are a smaller specialist group.
    sets: {
      preferred: ['Determination', 'Guard', 'Rage', 'Vampire', 'Will'],
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
    runeShare: 3, // 1/3: bombers are a narrow specialist role.
    sets: {
      preferred: ['Fatal', 'Violent', 'Will'],
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
    runeShare: 6, // x2: support is one of the largest roster families.
    sets: {
      preferred: ['Accuracy', 'Despair', 'Focus', 'Fight', 'Seal', 'Swift', 'Violent', 'Will'],
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
    runeShare: 5, // x1: a substantial, but more focused, HP-oriented role.
    sets: {
      preferred: ['Endure', 'Enhance', 'Fight', 'Seal', 'Shield', 'Tolerance', 'Violent', 'Will'],
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
    id: 'leo',
    name: 'Leo',
    type: 'Support type',
    runeShare: 1, // 1/10: one named monster with a uniquely constrained build.
    sets: {
      preferred: ['Vampire', 'Nemesis'],
      acceptable: ['Violent', 'Blade', 'Revenge'],
    },
    slots: {
      slot2: { preferred: ['Atk%'], acceptable: ['HP%'] },
      slot4: { preferred: ['CtD%'], acceptable: [] },
      slot6: { preferred: ['Atk%'], acceptable: ['HP%'] },
    },
    artifacts: { atk: true, def: false, hp: true },
    targets: { hp: 28195, atk: 2500, def: 941, spd: 100, res: 0, acc: 25, criRate: 100, criDmg: 200 },
  },
  {
    id: 'bruiser',
    name: 'Bruiser',
    type: 'No type',
    runeShare: 6, // x2: a cross-family hybrid role that can use a broad rune pool.
    sets: {
      preferred: ['Blade', 'Fight', 'Seal', 'Shield', 'Vampire', 'Violent', 'Will'],
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

/**
 * The presets a first-time user starts with. A fresh array each call: the
 * caller owns what it gets back and may edit or delete any of it.
 */
export function defaultRunePotentialPresets(): RunePotentialPreset[] {
  return presetSources.map(withDerivedMetrics);
}

/* ------------------------------------------------------------- new presets */

/** An empty choice, for a preset or a slot that has not been given one yet. */
function emptyChoice<T>(): PresetChoice<T> { return { preferred: [], acceptable: [] }; }

/**
 * A new preset, empty apart from the name. Everything else starts unset so the
 * editor states only what the user has actually decided; the composites are
 * derived, so a preset with no stats reads as zero rather than as a guess.
 */
export function createRunePotentialPreset(name = 'New preset'): RunePotentialPreset {
  return withDerivedMetrics({
    id: newPresetId(),
    name,
    type: 'No type',
    runeShare: defaultRuneShareStep,
    sets: emptyChoice<string>(),
    slots: { slot2: emptyChoice<RuneMainStat>(), slot4: emptyChoice<RuneMainStat>(), slot6: emptyChoice<RuneMainStat>() },
    artifacts: { atk: false, def: false, hp: false },
    targets: {},
  });
}

/**
 * Identifiers only have to be unique within one user's list, and are never
 * shown. Time plus a random tail is enough, and needs no counter to carry
 * across a reload.
 */
export function newPresetId(): string {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Recomputes DMG, E.HP and E.HP D from a preset's own stat targets. Called on
 * every edit, so a saved preset can never carry a composite its stats do not
 * produce — the same guarantee the shipped presets get.
 */
export function withRefreshedMetrics(preset: RunePotentialPreset): RunePotentialPreset {
  return withDerivedMetrics({ ...preset, targets: statTargetsOnly(preset.targets) });
}

/** The stated stats of a target row, with the three derived composites dropped. */
function statTargetsOnly(targets: PresetTargets): PresetStatTargets {
  const stats: PresetStatTargets = {};
  for (const key of presetStatTargetKeys) {
    if (targets[key] !== undefined) stats[key] = targets[key];
  }
  return stats;
}

/**
 * The largest target a preset may state. Well past anything the game produces,
 * and low enough that the figures derived from it stay inside the width the
 * card reserves for them — a nine-digit HP produced a sixteen-digit E.HP that
 * painted over the columns beside it.
 */
export const presetTargetMaximum = 100_000;

/** The longest name a preset may carry, in the editor and in a saved file alike. */
export const presetNameMaximum = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isChoice<T extends string>(value: unknown, allowed: readonly T[]): value is PresetChoice<T> {
  if (!isRecord(value) || !Array.isArray(value.preferred) || !Array.isArray(value.acceptable)) return false;
  const members = [...value.preferred, ...value.acceptable];
  return members.every((entry): entry is T => typeof entry === 'string' && allowed.includes(entry as T))
    && new Set(members).size === members.length;
}

function isTargets(value: unknown): value is PresetTargets {
  if (!isRecord(value)) return false;
  const allowed = new Set([...presetStatTargetKeys, 'dmg', 'ehp', 'ehpD']);
  if (!Object.keys(value).every((key) => allowed.has(key))) return false;
  if (!presetStatTargetKeys.every((key) => value[key] === undefined || (typeof value[key] === 'number' && Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= presetTargetMaximum))) return false;
  return typeof value.dmg === 'number' && Number.isFinite(value.dmg)
    && typeof value.ehp === 'number' && Number.isFinite(value.ehp)
    && typeof value.ehpD === 'number' && Number.isFinite(value.ehpD);
}

function isCurrentRunePotentialPreset(value: unknown): value is RunePotentialPreset {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length === 0
    || typeof value.name !== 'string' || value.name.trim() !== value.name || value.name.length === 0 || value.name.length > presetNameMaximum
    || !presetTypes.includes(value.type as PresetType)
    || (value.runeShare !== undefined && !isRuneShareStep(value.runeShare))
    || !isChoice(value.sets, presetRuneSetNameList)
    || !isRecord(value.slots) || !isChoice(value.slots.slot2, runeMainStats) || !isChoice(value.slots.slot4, runeMainStats) || !isChoice(value.slots.slot6, runeMainStats)
    || !isRecord(value.artifacts) || typeof value.artifacts.atk !== 'boolean' || typeof value.artifacts.def !== 'boolean' || typeof value.artifacts.hp !== 'boolean'
    || !isTargets(value.targets)) return false;
  const refreshed = withRefreshedMetrics(value as RunePotentialPreset);
  return value.targets.dmg === refreshed.targets.dmg
    && value.targets.ehp === refreshed.targets.ehp
    && value.targets.ehpD === refreshed.targets.ehpD;
}

/** Validate the complete current preset contract without repairing older data. */
export function isCurrentRunePotentialPresets(value: unknown): value is RunePotentialPreset[] {
  return Array.isArray(value)
    && value.every(isCurrentRunePotentialPreset)
    && new Set(value.map((preset) => preset.id)).size === value.length;
}
