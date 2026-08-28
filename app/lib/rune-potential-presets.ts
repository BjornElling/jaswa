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
    id: 'bruiser',
    name: 'Bruiser',
    type: 'No type',
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

/* ------------------------------------------------------------ normalisation */

/*
 * Presets are saved in the user's own preferences file, which they can edit
 * and re-import by hand. Everything read back is therefore checked: an
 * unusable preset is dropped rather than allowed to reach the interface, and
 * a preset with a bad part keeps the parts that were fine.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Keeps the members the app knows, in the order the allowed list states them, without duplicates. */
function normalizeChoiceMembers<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const chosen = new Set(value.filter((entry): entry is T => allowed.includes(entry as T)));
  return allowed.filter((entry) => chosen.has(entry));
}

/** A choice, with anything claimed as both preferred and acceptable counted only as preferred. */
function normalizeChoice<T extends string>(value: unknown, allowed: readonly T[]): PresetChoice<T> {
  const source = isRecord(value) ? value : {};
  const preferred = normalizeChoiceMembers(source.preferred, allowed);
  const acceptable = normalizeChoiceMembers(source.acceptable, allowed).filter((entry) => !preferred.includes(entry));
  return { preferred, acceptable };
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

/** A stat target: absent or unusable means the role does not aim at it, and an explicit 0 is kept. */
function normalizeTarget(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(presetTargetMaximum, Math.max(0, Math.round(value)));
}

function normalizeStatTargets(value: unknown): PresetStatTargets {
  const source = isRecord(value) ? value : {};
  const targets: PresetStatTargets = {};
  for (const key of presetStatTargetKeys) {
    const target = normalizeTarget(source[key]);
    if (target !== undefined) targets[key] = target;
  }
  return targets;
}

/**
 * One saved preset, or `null` if it cannot be read as one. A preset without a
 * name is the one thing not recoverable — every other part has a sensible
 * empty value, but an unnamed preset could not be told apart in the list.
 */
function normalizePreset(value: unknown): RunePotentialPreset | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, presetNameMaximum) : '';
  if (!name) return null;
  const slots = isRecord(value.slots) ? value.slots : {};
  const artifacts = isRecord(value.artifacts) ? value.artifacts : {};
  return withRefreshedMetrics({
    id: typeof value.id === 'string' && value.id ? value.id : newPresetId(),
    name,
    type: presetTypes.includes(value.type as PresetType) ? value.type as PresetType : 'No type',
    sets: normalizeChoice(value.sets, presetRuneSetNameList),
    slots: {
      slot2: normalizeChoice(slots.slot2, runeMainStats),
      slot4: normalizeChoice(slots.slot4, runeMainStats),
      slot6: normalizeChoice(slots.slot6, runeMainStats),
    },
    artifacts: { atk: artifacts.atk === true, def: artifacts.def === true, hp: artifacts.hp === true },
    targets: normalizeStatTargets(value.targets),
  });
}

/**
 * The saved preset list. Absent means a user who has never seen the workspace,
 * who gets the shipped presets; an empty list means a user who deleted them
 * all, which is respected. Duplicate identifiers are re-issued so React keys
 * and every later edit still address one preset each.
 */
export function normalizeRunePotentialPresets(value: unknown): RunePotentialPreset[] {
  if (value === undefined || value === null) return defaultRunePotentialPresets();
  if (!Array.isArray(value)) return defaultRunePotentialPresets();
  const seen = new Set<string>();
  return value.flatMap((entry) => {
    const preset = normalizePreset(entry);
    if (!preset) return [];
    /* A reissued identifier is itself checked, and kept being reissued until it
       is genuinely unused. Two presets sharing one identifier would be edited
       and deleted together, since both operations address a preset by it. */
    let id = preset.id;
    while (seen.has(id)) id = newPresetId();
    seen.add(id);
    return [{ ...preset, id }];
  });
}
