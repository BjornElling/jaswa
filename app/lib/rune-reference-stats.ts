/**
 * What a monster brings before its runes.
 *
 * A role states whole-monster targets — Support wants 275 SPD — and a rune can
 * only be asked for the part its own runes have to find. That difference is the
 * monster's own base stats, and this is where they come from.
 *
 * They are read off **the user's own roster**, not off a table shipped with the
 * app: a role names a family of monster (Attack, Support, Defence, HP), the game
 * gives every monster that same classification, and the average Lv. 40 monster of
 * that family on this account is the honest answer to "what does a monster of this
 * sort bring". An account of maxed nat-5s and an account of newly-sixed farmables
 * are asking their runes for different things, and a shipped constant would tell
 * them both the same story.
 */
import type { GameRecord } from './game-data';
import type { RoleType } from './rune-roles';
import type { TargetStat } from './rune-properties';
import monsterCatalogue from '../data/swarfarm-monsters.json';

/** The level a monster has to have reached to speak for its family. */
export const referenceMonsterLevel = 40;

export type ReferenceStats = Record<TargetStat, number>;

/**
 * Where a base line came from, so the interface can say so rather than presenting
 * every figure as equally well-founded.
 *
 * `family` is the wanted answer. `roster` means the account has no Lv. 40 monster
 * of that family and the whole roster stood in. There is deliberately no third
 * value for "made one up": with no Lv. 40 monsters at all there is no base line,
 * `referenceStats` returns `null`, and the page says so.
 */
export type ReferenceBasis = 'family' | 'roster';

export type ReferenceLine = { stats: ReferenceStats; basis: ReferenceBasis; monsters: number };

/* SWARFARM's own word for the family, against the word a role uses. `Material`
   and `none` cover farmable fodder and unclassified entries, and neither names a
   family a role can ask for, so both are left out of every family average and
   counted only in the roster-wide one. */
const archetypeForRoleType: Readonly<Record<RoleType, string | null>> = {
  'Attack type': 'Attack',
  'Support type': 'Support',
  'Defence type': 'Defense',
  'HP type': 'HP',
  'No type': null,
};

const archetypes: ReadonlyMap<number, string> = new Map(
  (monsterCatalogue as { monsters?: Array<{ com2us_id: number; archetype: string }> }).monsters
    ?.map((monster) => [monster.com2us_id, monster.archetype]) ?? [],
);

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * One monster's own stat sheet, before runes and artifacts.
 *
 * `con` is the export's constitution, and HP is fifteen times it — the same
 * conversion `monster-stats.ts` makes, and the reason HP is not read straight out
 * of a field.
 */
function baseStats(monster: GameRecord): ReferenceStats {
  return {
    hp: numberValue(monster.con) * 15,
    atk: numberValue(monster.atk),
    def: numberValue(monster.def),
    spd: numberValue(monster.spd),
    criRate: numberValue(monster.critical_rate),
    criDmg: numberValue(monster.critical_damage),
    res: numberValue(monster.resist),
    acc: numberValue(monster.accuracy),
  };
}

const statKeys: readonly TargetStat[] = ['hp', 'atk', 'def', 'spd', 'criRate', 'criDmg', 'res', 'acc'];

function average(monsters: readonly GameRecord[]): ReferenceStats {
  const total: ReferenceStats = { hp: 0, atk: 0, def: 0, spd: 0, criRate: 0, criDmg: 0, res: 0, acc: 0 };
  for (const monster of monsters) {
    const stats = baseStats(monster);
    for (const key of statKeys) total[key] += stats[key];
  }
  const result: ReferenceStats = { ...total };
  for (const key of statKeys) result[key] = total[key] / monsters.length;
  return result;
}

/** Every Lv. 40 monster on the account, which is the pool every average is taken from. */
export function referenceMonsters(data: GameRecord | undefined): GameRecord[] {
  const units = data?.unit_list;
  if (!Array.isArray(units)) return [];
  return units.filter((unit): unit is GameRecord =>
    Boolean(unit) && typeof unit === 'object' && !Array.isArray(unit)
    && numberValue((unit as GameRecord).unit_level) >= referenceMonsterLevel);
}

/**
 * The base line every role of each type is judged against, or `null` where the
 * account cannot supply one.
 *
 * `null` is a real answer and the page prints it as one. An account with no Lv. 40
 * monster has not told JASWA what its runes are for, and a shipped constant in its
 * place would be a statement about somebody else's roster presented as a statement
 * about this one.
 */
export function referenceLines(data: GameRecord | undefined): Map<RoleType, ReferenceLine> | null {
  const monsters = referenceMonsters(data);
  if (monsters.length === 0) return null;

  const rosterWide = average(monsters);
  const lines = new Map<RoleType, ReferenceLine>();
  for (const [roleType, archetype] of Object.entries(archetypeForRoleType) as Array<[RoleType, string | null]>) {
    if (archetype === null) {
      lines.set(roleType, { stats: rosterWide, basis: 'roster', monsters: monsters.length });
      continue;
    }
    const family = monsters.filter((monster) => archetypes.get(numberValue(monster.unit_master_id)) === archetype);
    lines.set(roleType, family.length > 0
      ? { stats: average(family), basis: 'family', monsters: family.length }
      : { stats: rosterWide, basis: 'roster', monsters: monsters.length });
  }
  return lines;
}

/** Why the page cannot judge runes, in the words it says to the user. */
export const noReferenceLineMessage =
  `Level a monster to ${referenceMonsterLevel} first. Runes are judged against what your own roster actually brings, `
  + 'and an account with nothing at that level has not said what its runes are for.';
