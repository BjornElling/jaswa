import type { GameRecord } from '../account/game-record';
import { canEngraveRelics } from '../monsters/monster-engrave-eligibility';
import {
  relicMainPercent, relicMainProperties, relicMaximumDurability, relicMaximumLevel, relicProperty,
  relicThreshold, relicUniquePercent,
} from './relic-properties';
import type { RelicMainProperty, RelicPropertyDefinition } from './relic-properties';

/**
 * One relic's unique property as the export states it: which family, how much
 * it grants, and how much of the source stat one unit of that grant costs.
 *
 * The export writes the triple `[type, threshold, percent]`, and the game reads
 * it as "*grant* +`percent` % per `threshold` *source stat* at the start of
 * battle". The threshold moves with the power-up level and the percent is fixed
 * by the family, so together they are the unique property's strength at the
 * relic's current level.
 */
export type RelicUniqueProperty = {
  definition: RelicPropertyDefinition;
  /** How much of the source stat buys one step of the grant. */
  threshold: number;
  /** Percentage points granted per threshold. */
  percent: number;
};

export type Relic = {
  id: string;
  mainProperty: RelicMainProperty;
  /** Percentage points the main property grants at the current level. */
  mainPercent: number;
  unique: RelicUniqueProperty;
  /** Power-up level, `0`–`15`. */
  level: number;
  /**
   * Power-up attempts this relic can still fail, `0`–`3`. At zero it can never
   * be levelled again, whatever its level — which is the single fact that
   * separates a relic that is merely low from one that is finished.
   */
  durability: number;
  locked: boolean;
  /**
   * The account's acquisition sequence, read from `rid` for the same reason
   * `Artifact.obtainedOrder` is (`artifacts.ts`): the export issues the ids in
   * ascending order of acquisition and no relic record carries anything better.
   */
  obtainedOrder: number;
};

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function wholeInRange(value: unknown, lowest: number, highest: number): number | null {
  const parsed = numberOrNull(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed < lowest || parsed > highest) return null;
  return parsed;
}

/**
 * One relic from the export, or `null` when the record does not satisfy the
 * current contract.
 *
 * Every rejection here is a loud one by design (`AGENTS.md` §0.1): a relic is
 * engraved on up to `relicEngravingLimit` monsters, so a half-read one would
 * carry a wrong judgement across the whole roster rather than spoiling a single
 * slot.
 *
 * The unique property is the field worth naming. The export states its family
 * twice — once as the record's `type` and once as the first member of
 * `sec_effect` — and every relic this account has ever held agrees with itself.
 * A record where the two disagree is not a relic JASWA knows how to read, so it
 * fails rather than picking a side.
 *
 * The numbers are held to the vocabulary too: the main percent must be `3 +
 * level`, the threshold `relicThreshold(level, per)` and the percent the
 * family's fixed one. The advice judges a relic from its level and family while
 * the engraving plan reads the imported numbers, so a relic the vocabulary
 * does not describe would be judged two ways on one page. Every relic this
 * account holds satisfies all three — intermediate levels included, which is
 * also the evidence that a threshold tier lasts three levels — so the first
 * one that does not is news about the game, and it surfaces as a failed import
 * rather than as a quiet disagreement.
 */
export function readRelic(record: unknown): Relic | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const source = record as GameRecord;

  const id = numberOrNull(source.rid);
  if (id === null || !Number.isSafeInteger(id)) return null;

  const primary = source.pri_effect;
  if (!Array.isArray(primary)) return null;
  const mainProperty = relicMainProperties[numberOrNull(primary[0]) ?? -1];
  const mainPercent = wholeInRange(primary[1], 0, 100);
  if (!mainProperty || mainPercent === null) return null;

  const secondary = source.sec_effect;
  if (!Array.isArray(secondary)) return null;
  const definition = relicProperty(numberOrNull(secondary[0]));
  const threshold = numberOrNull(secondary[1]);
  const percent = numberOrNull(secondary[2]);
  if (!definition || threshold === null || threshold <= 0 || percent === null || percent <= 0) return null;
  /* The record states the family twice; disagreement means JASWA has misread
     one of the two fields and must not guess which. */
  if (numberOrNull(source.type) !== definition.id) return null;

  const level = wholeInRange(source.upgrade_curr, 0, relicMaximumLevel);
  const durability = wholeInRange(source.durability, 0, relicMaximumDurability);
  if (level === null || durability === null) return null;
  if (mainPercent !== relicMainPercent(level)
    || threshold !== relicThreshold(level, definition.per)
    || percent !== relicUniquePercent(definition)) return null;

  return {
    id: String(id),
    mainProperty,
    mainPercent,
    unique: { definition, threshold, percent },
    level,
    durability,
    locked: Boolean(numberOrNull(source.locked)),
    obtainedOrder: id,
  };
}

/**
 * Every relic on the account. `completeEngravedCollections` has already merged
 * the engraved copies into `data.relics` and de-duplicated them on `rid`, so
 * this reads that one list.
 */
export function readRelics(data: GameRecord | undefined): Relic[] {
  const records = data?.relics;
  if (!Array.isArray(records)) return [];
  const relics: Relic[] = [];
  for (const record of records) {
    const relic = readRelic(record);
    if (relic) relics.push(relic);
  }
  return relics;
}

/**
 * Why this roster's relic engravings cannot be read, or `undefined` when they
 * can. A monster carries one relic at most and takes one only from Lv. 40
 * (v9.1.8), and every relic reader trusts both: the plan compares a monster's
 * one current relic, the engraving count skips a monster below Lv. 40, and the
 * stat sheet adds every relic it is handed. A roster breaking either rule would
 * be counted one way and summed another, so it fails the import instead
 * (`AGENTS.md` §0.1). An unknown level counts as below Lv. 40, because it
 * cannot show that the engraving is legal.
 */
export function relicEngravingProblem(units: readonly GameRecord[]): string | undefined {
  for (const unit of units) {
    if (!Array.isArray(unit.relics) || unit.relics.length === 0) continue;
    if (unit.relics.length > 1) return 'This file engraves more than one relic on one monster.';
    if (!canEngraveRelics(unit)) return 'This file engraves a relic on a monster below Lv. 40.';
  }
  return undefined;
}

/**
 * How many monsters each relic is engraved on, keyed by relic id.
 *
 * A relic is not gear the way a rune is. The game engraves one relic on
 * many monsters at once, so the export references the same `rid` from every
 * monster and the relic record itself names no owner — there is no
 * `occupied_id` to read. The count therefore comes from walking the roster,
 * and a relic engraved on nobody is simply absent from the map.
 *
 * Every eligible monster counts, Material ones included: this is the game's
 * own capacity, and a JASWA policy about which monsters it proposes a relic for
 * must never change how many engravings the game says are taken.
 */
export function relicEngravingCounts(monsters: readonly GameRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const monster of monsters) {
    if (!canEngraveRelics(monster)) continue;
    if (!Array.isArray(monster.relics)) continue;
    /* One monster cannot have the same relic engraved twice, but the export is a file
       the user can hand over, so a repeated id counts once rather than
       inflating the reach of a relic. */
    const seen = new Set<string>();
    for (const entry of monster.relics) {
      const id = numberOrNull((entry as GameRecord | null)?.rid);
      if (id === null || seen.has(String(id))) continue;
      seen.add(String(id));
      counts.set(String(id), (counts.get(String(id)) ?? 0) + 1);
    }
  }
  return counts;
}
