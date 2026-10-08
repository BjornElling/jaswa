/**
 * Reads one saved team against the current import: each member's arena or
 * dungeon speed, the order the team really moves in, what is wrong with it,
 * when an enemy first moves, and the display speeds each member can be tuned
 * to (`tuningRange`).
 *
 * Every rule comes from `speed-tick.ts`. This module decides what to simulate
 * and how to report it, and states no rule of the game of its own — an
 * interval is found by running the same clock at each candidate display speed,
 * so rounding, Swift and boosts are all answered by the one implementation.
 */
import { formatNumber } from './formatting';
import type { GameRecord } from './game-data';
import { monsterSpeedParts } from './monster-stats';
import { elementName } from './rune-sets';
import { isReadableName, monsterPresentation } from './monster-catalog';
import { speedContent } from './speed-contents';
import type { DungeonStage, SpeedContent } from './speed-contents';
import { speedLeaderSkill, speedSkillProfile } from './speed-skills';
import type { SpeedSkillProfile } from './speed-skills';
import {
  combatSpeed, displaySpeed, everyoneMoved, leaderSpeedPercent,
  runeSpeedForDisplay, simulateBattle,
} from './speed-tick';
import type { BattleTrace, SpeedLeaderSkill, SpeedSheet, TickUnit, TurnEvent } from './speed-tick';
import type { SpeedTeam } from './speed-tuning-preferences';
import { whatIfDisplaySpeedMaximum } from './speed-tuning-preferences';
import type { GeneralSettings } from './types';

/** A range of display speeds; `maximum` is `null` where every faster value works too. */
export type DisplaySpeedInterval = { minimum: number; maximum: number | null };

export type MemberVerdict =
  /** Moves where it was asked to. */
  | { kind: 'in-place' }
  /** Too fast: moves before a monster placed above it. A member only ever answers for the order above it. */
  | { kind: 'order' }
  /** In order only by an exact tie on the attack bar, which field position settles. */
  | { kind: 'tie'; with: string };

export type MemberReading = {
  unitId: string;
  /** Where the user put it, from 1. */
  wantedPosition: number;
  masterId: string;
  element: string | null;
  baseSpeed: number;
  swift: boolean;
  /** The display speed the import gives this copy. */
  importedDisplaySpeed: number;
  /** The display speed the team is read at: the what-if where one is typed. */
  displaySpeed: number;
  whatIf: boolean;
  leaderPercent: number;
  /** Arena speed or dungeon speed, by the team's content. */
  combatSpeed: number;
  profile: SpeedSkillProfile;
  /**
   * Where its turns fall among every turn on the field, from 1, enemies'
   * included, until every member has had its first — a boosted member may move
   * twice in that time. Read on the worst stage (`TeamReading.worstStage`),
   * the trace the Ticks view opens on, so the numbers cannot disagree. Empty
   * when it never moves.
   */
  turnPositions: readonly number[];
  firstTurnTick: number;
  /**
   * The one-ally boosts its first turn gave, and to whom. The recipient is
   * whoever the bars make it on that turn, so it is read off the team's trace
   * rather than the profile, and the opening is the turn a tune is judged by.
   */
  firstAllyBoosts: ReadonlyArray<{ unitId: string; amount: number }>;
  verdict: MemberVerdict;
  /**
   * The stages, from 1, whose first enemy turn comes before this member's
   * first — in arena `[1]` for the worst case. A warning beside the verdict,
   * never a verdict of its own, read off the same traces as the Enemy cut in
   * table.
   */
  cutInAt: readonly number[];
  /**
   * The display speeds it can be tuned to (`tuningRange`), or `null` where
   * none will do or none was asked for.
   */
  range: DisplaySpeedInterval | null;
  /** Whether the display speed it is read at is one of them. */
  inRange: boolean;
};

export type EnemyStageReading = {
  /** The fastest enemy's dungeon speed or, in arena, the worst-case enemy's arena speed. */
  enemySpeed: number;
  /** The tick of the first enemy turn. */
  firstEnemyTick: number;
  /** The team's turn the first enemy turn comes straight after — whose, and that
      monster's how-many-th — or `null` when an enemy moves before the team. */
  follows: { unitId: string; turn: number } | null;
  /** The members whose first turn the first enemy turn comes before: the opening is cut into when there is one. */
  cutsBefore: readonly string[];
  /** The very trace the tick-by-tick view draws, so a verdict and the ticks cannot disagree. */
  trace: BattleTrace;
  /** Every enemy on the stage, in the trace as `enemy-1`, `enemy-2` …, with their speeds. */
  enemySpeeds: readonly number[];
  /** Their names, in the same order — `Golem (Water) #1` — or `Enemy` for arena's hypothetical one. */
  enemyNames: readonly string[];
};

export type TeamReading = {
  team: SpeedTeam;
  content: SpeedContent;
  members: MemberReading[];
  /** Saved members the import no longer holds. */
  missingUnitIds: string[];
  leader: { unitId: string; skill: SpeedLeaderSkill | null } | null;
  /** The team alone, until each member has moved twice or 20 turns are taken, and never before each has moved once. */
  trace: BattleTrace;
  /** Every member in place, with no tie. */
  perfect: boolean;
  /** Arena: one reading against the worst-case enemy. Dungeon: one per stage. */
  enemies: EnemyStageReading[];
  /** The index in `enemies` of the stage whose first enemy turn comes earliest, which members' places are read from; `null` without enemies. */
  worstStage: number | null;
};

type Candidate = {
  unitId: string;
  profile: SpeedSkillProfile;
  base: Omit<SpeedSheet, 'runeSpeed'>;
  runeSpeed: number;
};

function sheetOf(candidate: Candidate, runeSpeed = candidate.runeSpeed): SpeedSheet {
  return { ...candidate.base, runeSpeed };
}

function tickUnit(candidate: Candidate, runeSpeed?: number): TickUnit {
  const sheet = sheetOf(candidate, runeSpeed);
  return {
    key: candidate.unitId,
    side: 'ally',
    speed: combatSpeed(sheet),
    effects: candidate.profile.effects,
    similarBoostPassive: candidate.profile.similarBoostPassive,
    capsOthersSpeed: candidate.profile.capsOthersSpeed,
  };
}

function firstTurns(events: readonly TurnEvent[]): Map<string, TurnEvent> {
  const first = new Map<string, TurnEvent>();
  for (const event of events) if (!first.has(event.key)) first.set(event.key, event);
  return first;
}

/* A drawn trace runs on past the verdict's stop until every member has had a
   second turn, so the view shows the team's rhythm and not only its opening —
   but no further than `drawnTurns` turns, which a slow member under a fast
   booster could otherwise stretch across a hundred ticks. It never stops before
   `settled` would: the clock is deterministic, so every first turn a verdict
   reads is the same in the short trace and the drawn one. */
const drawnTurns = 20;

function drawnUntil(allyKeys: readonly string[], settled: (events: readonly TurnEvent[]) => boolean) {
  return (events: readonly TurnEvent[]) => settled(events)
    && (events.length >= drawnTurns || allyKeys.every((key) => events.filter((event) => event.key === key).length >= 2));
}

/* `drawn` is the reading a view draws: it records every tick's bars and runs
   on. A search only reads first turns and leaves both out, as it runs the
   clock hundreds of times. */
function teamTrace(units: readonly TickUnit[], drawn = true): BattleTrace {
  const keys = units.map((unit) => unit.key);
  const settled = everyoneMoved(keys);
  return simulateBattle(units, { done: drawn ? drawnUntil(keys, settled) : settled, snapshots: drawn });
}

/* Whether `earlier` really moves before `later`, and whether only a tie on the
   bar decided it. A unit that never moved inside the tick limit moves after
   every unit that did. */
function relation(first: Map<string, TurnEvent>, events: readonly TurnEvent[], earlier: string, later: string): 'before' | 'tie' | 'after' {
  const a = first.get(earlier);
  const b = first.get(later);
  if (!a) return 'after';
  if (!b) return 'before';
  const aIndex = events.indexOf(a);
  const bIndex = events.indexOf(b);
  if (aIndex > bIndex) return 'after';
  return a.tiedWith.includes(later) ? 'tie' : 'before';
}

/* Every pair the table orders `upper>lower` that does not strictly move so —
   a tie counts, as no order should hang on field position the page cannot
   see — and `stage:unit` for each member an enemy has a turn before. Unit ids
   are digits, so neither separator can occur inside one. */
function pairFaults(units: readonly TickUnit[], trace: BattleTrace): Set<string> {
  const first = firstTurns(trace.events);
  const pairs = new Set<string>();
  units.forEach((upper, at) => {
    for (const lower of units.slice(at + 1)) {
      if (relation(first, trace.events, upper.key, lower.key) !== 'before') pairs.add(`${upper.key}>${lower.key}`);
    }
  });
  return pairs;
}

function cutFaults(stages: readonly EnemyStageReading[]): Set<string> {
  return new Set(stages.flatMap((stage, at) => stage.cutsBefore.map((key) => `${at + 1}:${key}`)));
}

function unitsAt(candidates: readonly Candidate[], shown: readonly number[]): TickUnit[] {
  return candidates.map((candidate, at) => tickUnit(candidate,
    runeSpeedForDisplay(candidate.base.baseSpeed, candidate.base.swift, shown[at])));
}

/*
 * Whether the member at `index` moves strictly after every member above it.
 * The members below are read at bare runes: they are still to be tuned, and a
 * fast one moving early, its boost pushing the bars above, would otherwise
 * decide a ceiling it has no part in.
 */
function behindAbove(candidates: readonly Candidate[], shown: readonly number[], index: number, lowest: readonly number[]): boolean {
  const trace = teamTrace(unitsAt(candidates, shown.map((value, at) => at > index ? lowest[at] : value)), false);
  const first = firstTurns(trace.events);
  const self = candidates[index].unitId;
  return candidates.slice(0, index).every((candidate) => relation(first, trace.events, candidate.unitId, self) === 'before');
}

/*
 * Whether every member from `index` down, with each at the display speed
 * `shown` gives it, trails every member placed above it — those above `index`
 * included — and has no enemy turn before it.
 */
function holdsBelow(candidates: readonly Candidate[], content: SpeedContent, shown: readonly number[], index: number): boolean {
  const units = unitsAt(candidates, shown);
  const trace = teamTrace(units, false);
  for (const pair of pairFaults(units, trace)) {
    if (units.findIndex((unit) => unit.key === pair.slice(pair.indexOf('>') + 1)) >= index) return false;
  }
  const lower = new Set(units.slice(index).map((unit) => unit.key));
  for (const fault of cutFaults(enemyStages(units, content, trace, false))) {
    if (lower.has(fault.slice(fault.indexOf(':') + 1))) return false;
  }
  return true;
}

/*
 * The lowest value in `low`…`high` at which `holds` is true, by halving, or
 * `null` where it is not true even at `high`. Halving reads `holds` as false
 * below some value and true from it on; where a boost's timing breaks that,
 * the answer is still one at which `holds` is true, and always the same one,
 * as no earlier question steers it.
 */
function lowestHolding(low: number, high: number, holds: (value: number) => boolean): number | null {
  if (high < low || !holds(high)) return null;
  if (holds(low)) return low;
  let failing = low;
  let passing = high;
  while (passing - failing > 1) {
    const middle = Math.floor((failing + passing) / 2);
    if (holds(middle)) passing = middle; else failing = middle;
  }
  return passing;
}

/* The highest value in `low`…`high` at which `holds` is true, by halving, read as true up to some value and false above it. */
function highestHolding(low: number, high: number, holds: (value: number) => boolean): number | null {
  if (high < low || !holds(low)) return null;
  if (holds(high)) return high;
  let passing = low;
  let failing = high;
  while (failing - passing > 1) {
    const middle = Math.floor((failing + passing) / 2);
    if (holds(middle)) passing = middle; else failing = middle;
  }
  return passing;
}

/*
 * The fastest display speed at which the member at `index` still trails
 * every member above it, those above where `shown` puts them, or `null` where
 * even bare runes do not.
 */
function trailingCeiling(candidates: readonly Candidate[], shown: readonly number[], index: number,
  lowest: readonly number[]): number | null {
  const config = [...shown];
  return highestHolding(lowest[index], whatIfDisplaySpeedMaximum, (value) => {
    config[index] = value;
    return behindAbove(candidates, config, index, lowest);
  });
}

/*
 * Whether the members below `index` can all be placed, with `index` and every
 * member above it where `shown` puts them. They are placed from the top down,
 * each as fast as it can be and still trail the members above it: a faster
 * member is cut into no sooner, hands its boost on no later, and leaves the
 * one under it a higher ceiling of its own, so that placing gives the members
 * below the most room there is. If even it lets an enemy in or breaks the
 * order, no placing does.
 *
 * A member that is settled — in its place, with every member above it in
 * theirs — may be made faster but never pushed slower: a placing that needs
 * one of them under the display speed it has now fails. Without that, the room below was anybody's
 * to take — a first mover at bare runes, every monster under it pressed down
 * behind it and the arena's worst-case enemy, which follows the first mover,
 * slowed to match, read as a perfect team. A member below the first one out of
 * its place may go anywhere behind the ones above it. Placing them from the bottom up
 * instead, with the members between still at their old speeds, read room that
 * was not there: a fast member in the middle, its boost early, made the floors
 * under it look lower than they are once it is tuned down to its place.
 */
function leavesRoomBelow(candidates: readonly Candidate[], content: SpeedContent, shown: readonly number[],
  index: number, lowest: readonly number[], settled: readonly boolean[]): boolean {
  const config = [...shown];
  for (let k = index + 1; k < candidates.length; k += 1) {
    const value = trailingCeiling(candidates, config, k, lowest);
    if (value === null || (settled[k] && value < shown[k])) return false;
    config[k] = value;
  }
  return holdsBelow(candidates, content, config, index);
}

/*
 * The display speeds a member can be tuned to, the team tuned from the top
 * down: with every member above it where it is, the member moves strictly
 * after each of them, and the members below it can still all be placed under
 * it, none that is in its place now pushed slower, with no enemy on any stage
 * getting a turn before any member (`leavesRoomBelow`). The lower end is therefore not only this member's own
 * need but the room the ones below it need: three intervals each fine on its
 * own could otherwise leave the fourth monster nowhere to go.
 *
 * So a value from the range, typed in, never leaves the members below without
 * a way through, and typing each member's value in turn from the top ends in
 * a perfect team. The last member has nobody below it, so its range is simply
 * every value that is perfect for it.
 *
 * The ceiling is the fastest display speed that still trails the members
 * above, and the floor is found under it by halving: faster is never worse
 * for the room below. The first mover in arena is the exception, as the
 * worst-case enemy follows it (§6); its range is walked out from the current
 * value one display speed at a time. Every candidate runs the team's clock and
 * every stage's, so boosts, buffs, Leo and the attacker's tie
 * (`SPEED-TICK-CANONICAL.md` §3.2) are the clock's answer.
 */
function tuningRange(candidates: readonly Candidate[], content: SpeedContent, current: readonly number[],
  index: number, settled: readonly boolean[]): DisplaySpeedInterval | null {
  const lowest = candidates.map((candidate) => displaySpeed(candidate.base.baseSpeed, candidate.base.swift, 0));
  const config = [...current];
  const room = (value: number) => { config[index] = value; return leavesRoomBelow(candidates, content, config, index, lowest, settled); };
  const top = whatIfDisplaySpeedMaximum;

  if (index === 0 && content.area === 'arena') {
    let start: number | null = null;
    for (let step = 0; step <= top && start === null; step += 1) {
      const up = current[index] + step;
      const down = current[index] - step;
      if (up > top && down < lowest[index]) break;
      if (up <= top && room(up)) start = up;
      else if (step > 0 && down >= lowest[index] && room(down)) start = down;
    }
    if (start === null) return null;
    /* Out from the run's first value in doubling steps, then halved: the run
       is read as one unbroken stretch, as it is on either side of it. */
    const reach = (direction: 1 | -1) => {
      const limit = direction === 1 ? top : lowest[index];
      let held = start as number;
      let step = 1;
      while (held !== limit) {
        const next = direction === 1 ? Math.min(held + step, limit) : Math.max(held - step, limit);
        if (!room(next)) {
          return direction === 1
            ? highestHolding(held, next - 1, room) ?? held
            : lowestHolding(next + 1, held, room) ?? held;
        }
        held = next;
        step *= 2;
      }
      return held;
    };
    const minimum = reach(-1);
    const maximum = reach(1);
    return { minimum, maximum: maximum === top ? null : maximum };
  }

  const ceiling = index === 0 ? top : trailingCeiling(candidates, current, index, lowest);
  if (ceiling === null) return null;
  const minimum = lowestHolding(lowest[index], ceiling, room);
  if (minimum === null) return null;
  return { minimum, maximum: index === 0 ? null : ceiling };
}

/* Leo's cap spares a boss, and a dungeon stage does not say which of its
   enemies is one, so in a dungeon every enemy is read as uncapped: the
   pessimistic reading. Arena has no bosses. */
function stageReading(allies: readonly TickUnit[], enemySpeeds: readonly number[], enemyNames: readonly string[],
  area: SpeedContent['area'], drawn = true): EnemyStageReading {
  const enemies: TickUnit[] = enemySpeeds.map((speed, at) => ({
    key: `enemy-${at + 1}`, side: 'enemy', speed, effects: [], exemptFromCap: area === 'dungeon',
  }));
  const allyKeys = allies.map((unit) => unit.key);
  const settled = (events: readonly TurnEvent[]) => everyoneMoved(allyKeys)(events) && events.some((event) => event.side === 'enemy');
  const trace = simulateBattle([...allies, ...enemies], {
    done: drawn ? drawnUntil(allyKeys, settled) : settled,
    snapshots: drawn,
  });
  const firstEnemy = trace.events.find((event) => event.side === 'enemy');
  const before = firstEnemy ? trace.events.slice(0, trace.events.indexOf(firstEnemy)) : trace.events;
  const last = before.at(-1);
  const movedBefore = new Set(before.map((event) => event.key));
  return {
    enemySpeed: Math.max(...enemySpeeds),
    firstEnemyTick: firstEnemy?.tick ?? Number.POSITIVE_INFINITY,
    follows: last ? { unitId: last.key, turn: before.filter((event) => event.key === last.key).length } : null,
    cutsBefore: firstEnemy === undefined ? [] : allyKeys.filter((key) => !movedBefore.has(key)),
    trace,
    enemySpeeds,
    enemyNames,
  };
}

/*
 * Accepted, not documented: the dungeon structures Swarfarm carries only
 * under a Korean placeholder, named by inference. Neither Swarfarm nor any
 * source found gives their in-game names, so the user accepted these on
 * October 8, 2026 (`SPEED-TICK-CANONICAL.md` §6). Each shares its icon family
 * and its id pattern with the English-named structure it is given the name of
 * elsewhere — a guard "(중)", medium, with Medium Crystal's 21xx16, a "타워"
 * with Tower's. A name seen in the game replaces its entry here.
 */
export const acceptedEnemyNames: Readonly<Record<number, string>> = {
  211016: 'Medium Crystal', // 가드_보라(중)_심연층, Necropolis Abyss
  211506: 'Medium Crystal', // 가드_정령(중)_심연층, Spiritual Realm Abyss
  102266: 'Tower', // 타워(정령) - 1_심연층, Spiritual Realm Abyss
  102366: 'Tower', // 타워(정령) - 2_심연층, Spiritual Realm Abyss
};

/* A stage's enemies by the game's names, a name met twice numbered as owned
   copies are. A placeholder with no accepted name reads `Enemy 2` by its place
   on the stage, and `verify:speed-tick` fails on it, so a new one is seen.
   Named once per stage: the range search reads each stage thousands of times. */
const stageEnemyNames = new WeakMap<DungeonStage, readonly string[]>();
export function enemyNamesOf(stage: DungeonStage): readonly string[] {
  const known = stageEnemyNames.get(stage);
  if (known) return known;
  const plain = stage.monsters.map((masterId, at) => {
    const { name } = monsterPresentation(masterId);
    return isReadableName(name) ? name : acceptedEnemyNames[masterId] ?? `Enemy ${at + 1}`;
  });
  const seen = new Map<string, number>();
  const named = plain.map((name) => {
    if (plain.filter((other) => other === name).length === 1) return name;
    const number = (seen.get(name) ?? 0) + 1;
    seen.set(name, number);
    return `${name} #${number}`;
  });
  stageEnemyNames.set(stage, named);
  return named;
}

/* The worst arena enemy is the fastest one that still cannot take the first
   turn: level with the team's first mover, since a tie goes to the attacker
   (`SPEED-TICK-CANONICAL.md` §3.2). Anything faster could win the opening
   outright; anything slower cuts in no earlier. Under Leo's
   cap the first mover goes at no more than Leo's own arena speed. */
function worstArenaStage(units: readonly TickUnit[], trace: BattleTrace, drawn = true): EnemyStageReading {
  const opener = trace.events[0]?.key;
  const leoSpeeds = units.filter((unit) => unit.capsOthersSpeed).map((unit) => unit.speed);
  const openingSpeed = Math.min(units.find((unit) => unit.key === opener)?.speed ?? 1, ...leoSpeeds);
  return stageReading(units, [openingSpeed], ['Enemy'], 'arena', drawn);
}

/* How many turns come before a stage's first enemy turn: the fewer, the worse. */
function firstEnemyAt(stage: EnemyStageReading): number {
  const at = stage.trace.events.findIndex((event) => event.side === 'enemy');
  return at === -1 ? Number.POSITIVE_INFINITY : at;
}

/** What the team faces: the worst-case enemy in arena, each stage in a dungeon. */
function enemyStages(units: readonly TickUnit[], content: SpeedContent, trace: BattleTrace, drawn = true): EnemyStageReading[] {
  if (units.length === 0) return [];
  return content.area === 'arena'
    ? [worstArenaStage(units, trace, drawn)]
    : content.stages.map((stage) => stageReading(units, stage.speeds, enemyNamesOf(stage), content.area, drawn));
}

export function readSpeedTeam({ team, monsters, totemPercent, whatIfs, ranges = false }: {
  team: SpeedTeam;
  monsters: ReadonlyMap<string, GameRecord>;
  totemPercent: number;
  /**
   * What-if display speeds, by unit id. Only the team's overlay passes them;
   * the team stores them, but every other reader judges the runes engraved and
   * leaves this out, so a what-if never reaches a figure outside the overlay.
   */
  whatIfs?: ReadonlyMap<string, number>;
  /**
   * Whether to search each member's tuning range. Only the overlay states a
   * range, and the search runs the clock a few thousand times, so the page,
   * which reads every team at once and shows none, leaves it out: there every
   * `range` is `null` and every `inRange` false.
   */
  ranges?: boolean;
}): TeamReading {
  const content = speedContent(team.content);
  const present = team.members.filter((member) => monsters.has(member.unitId));
  const missingUnitIds = team.members.filter((member) => !monsters.has(member.unitId)).map((member) => member.unitId);
  const leaderMonster = team.leaderUnitId === null ? undefined : monsters.get(team.leaderUnitId);
  const leaderSkill = leaderMonster ? speedLeaderSkill(leaderMonster.unit_master_id) : null;

  const candidates: Candidate[] = present.map((member) => {
    const monster = monsters.get(member.unitId) as GameRecord;
    const parts = monsterSpeedParts(monster);
    const element = elementName(monster.attribute) ?? null;
    const shown = whatIfs?.get(member.unitId) ?? parts.displaySpeed;
    return {
      unitId: member.unitId,
      profile: speedSkillProfile(monster),
      base: {
        baseSpeed: parts.baseSpeed,
        swift: parts.swift,
        percentOfBase: totemPercent + leaderSpeedPercent(leaderSkill, content.area, element),
      },
      runeSpeed: runeSpeedForDisplay(parts.baseSpeed, parts.swift, shown),
    };
  });
  const units = candidates.map((candidate) => tickUnit(candidate));
  const trace = teamTrace(units);
  const first = firstTurns(trace.events);
  const enemies = enemyStages(units, content, trace);
  /* A member's place is its absolute one, enemy turns counted, on the stage
     whose first enemy turn comes earliest — the one the Ticks view opens on.
     Without enemies it is the team's own order. */
  const worstStage = enemies.reduce<number | null>((worst, stage, at) =>
    worst === null || firstEnemyAt(stage) < firstEnemyAt(enemies[worst]) ? at : worst, null);
  const orderEvents = worstStage === null ? trace.events : enemies[worstStage].trace.events;
  const lastFirstTurn = Math.max(-1, ...units.map((unit) => orderEvents.findIndex((event) => event.key === unit.key)));
  const opening = orderEvents.slice(0, lastFirstTurn + 1);
  const shownSpeeds = present.map((member) => whatIfs?.get(member.unitId) ?? monsterSpeedParts(monsters.get(member.unitId) as GameRecord).displaySpeed);

  /* A member's own verdict looks only up the order: a monster below that
     moves first is that monster's fault, so a slow member never turns red for
     a fast one under it — the one out of place is the one that says so. */
  const verdicts: MemberVerdict[] = candidates.map((candidate, index) => {
    const above = candidates.slice(0, index).map((entry) => ({ unitId: entry.unitId, state: relation(first, trace.events, entry.unitId, candidate.unitId) }));
    const tie = above.find((entry) => entry.state === 'tie')?.unitId ?? null;
    return above.some((entry) => entry.state === 'after') ? { kind: 'order' }
      : tie !== null ? { kind: 'tie', with: tie } : { kind: 'in-place' };
  });
  /* Settled: in its place with every member above it in theirs. A member that
     trails the ones above it only because one of them is out of place is not
     settled — that one will move, and it with it. */
  const firstUnsettled = verdicts.findIndex((verdict) => verdict.kind !== 'in-place');
  const settled = verdicts.map((_, index) => firstUnsettled === -1 || index < firstUnsettled);

  const members: MemberReading[] = candidates.map((candidate, index) => {
    const member = present[index];
    const monster = monsters.get(member.unitId) as GameRecord;
    const parts = monsterSpeedParts(monster);
    const shown = shownSpeeds[index];
    const verdict = verdicts[index];
    const range = ranges ? tuningRange(candidates, content, shownSpeeds, index, settled) : null;
    return {
      unitId: member.unitId,
      wantedPosition: index + 1,
      masterId: String(monster.unit_master_id ?? ''),
      element: elementName(monster.attribute) ?? null,
      baseSpeed: parts.baseSpeed,
      swift: parts.swift,
      importedDisplaySpeed: parts.displaySpeed,
      displaySpeed: shown,
      whatIf: whatIfs?.has(member.unitId) ?? false,
      leaderPercent: candidate.base.percentOfBase - totemPercent,
      combatSpeed: units[index].speed,
      profile: candidate.profile,
      turnPositions: opening.flatMap((event, at) => event.key === member.unitId ? [at + 1] : []),
      firstTurnTick: first.get(member.unitId)?.tick ?? Number.POSITIVE_INFINITY,
      firstAllyBoosts: (first.get(member.unitId)?.allyBoosts ?? []).map(({ key, amount }) => ({ unitId: key, amount })),
      verdict,
      cutInAt: enemies.flatMap((stage, at) => stage.cutsBefore.includes(member.unitId) ? [at + 1] : []),
      range,
      inRange: range !== null && shown >= range.minimum && (range.maximum === null || shown <= range.maximum),
    };
  });

  return {
    team,
    content,
    members,
    missingUnitIds,
    leader: team.leaderUnitId === null ? null : { unitId: team.leaderUnitId, skill: leaderSkill },
    trace,
    perfect: members.length > 0 && members.every((member) => member.verdict.kind === 'in-place'),
    enemies,
    worstStage,
  };
}

/** A field-position tie is unresolved, but only a strict order fault is out of place. */
export function outOfPlaceCount(reading: TeamReading): number {
  return reading.members.filter((member) => member.verdict.kind === 'order').length;
}

/** "arena speed" or "dungeon speed" — the page always says which combat speed a figure is. */
export function combatSpeedName(reading: TeamReading): string {
  return reading.content.area === 'arena' ? 'arena speed' : 'dungeon speed';
}

/** What an interval asks for, in the words a team's member and a standing rule both use, or `null` where no display speed of that monster alone puts it right: then the line says nothing more. */
export function displaySpeedIntervalText(interval: DisplaySpeedInterval | null, general: GeneralSettings): string | null {
  if (interval === null) return null;
  const minimum = formatNumber(interval.minimum, general);
  if (interval.maximum === null) return `needs ${minimum}+ display speed`;
  if (interval.maximum === interval.minimum) return `needs exactly ${minimum} display speed`;
  return `needs ${minimum}–${formatNumber(interval.maximum, general)} display speed`;
}
