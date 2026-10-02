/**
 * Reads one saved team against the current import: each member's arena or
 * dungeon speed, the order the team really moves in, what is wrong with it and
 * which display speeds would put it right, and when an enemy first moves.
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
import { fastestEnemySpeed, speedContent } from './speed-contents';
import type { SpeedContent } from './speed-contents';
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
  | { kind: 'order'; interval: DisplaySpeedInterval | null }
  /** In order only by an exact tie on the attack bar, which field position settles. */
  | { kind: 'tie'; with: string; interval: DisplaySpeedInterval | null };

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
  /** Where it really moves among the team, from 1. */
  actualPosition: number;
  firstTurnTick: number;
  verdict: MemberVerdict;
  /**
   * In a dungeon, its dungeon speed is below the floor's fastest enemy's, so
   * that enemy outpaces it. An equal speed is not counted: a tie goes to the
   * team (`SPEED-TICK-CANONICAL.md` §3.2). A warning beside the verdict, never a verdict of its own.
   */
  slowerThanFastestEnemy: boolean;
  /**
   * The display speeds that keep it in its slot between the neighbours the
   * table puts above and below it, enemy included (`slotRange`), or `null`
   * where none does.
   */
  slotRange: DisplaySpeedInterval | null;
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
};

export type TeamReading = {
  team: SpeedTeam;
  content: SpeedContent;
  members: MemberReading[];
  /** Saved members the import no longer holds. */
  missingUnitIds: string[];
  leader: { unitId: string; skill: SpeedLeaderSkill | null } | null;
  /** The team alone, until each member has moved once. */
  trace: BattleTrace;
  /** Every member in place, with no tie. */
  perfect: boolean;
  /** Arena: one reading against the worst-case enemy. Dungeon: one per stage. */
  enemies: EnemyStageReading[];
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

function teamTrace(units: readonly TickUnit[]): BattleTrace {
  return simulateBattle(units, { done: everyoneMoved(units.map((unit) => unit.key)) });
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

type Check = { tooFast: boolean; tie: string | null };

/*
 * One member judged inside one simulated team, looking only up the order: it
 * is wrong if it moves before a monster placed above it, or in place only by a
 * tie with one. A monster below that moves first is that monster's fault, not
 * this one's, so a slow member never turns red for a fast one under it — the
 * one out of place is the one that says so.
 */
function checkMember(candidates: readonly Candidate[], index: number, runeSpeed: number): Check {
  const self = candidates[index].unitId;
  const trace = teamTrace(candidates.map((candidate, at) => tickUnit(candidate, at === index ? runeSpeed : undefined)));
  const first = firstTurns(trace.events);
  const relations = candidates.slice(0, index).map((candidate) => ({
    unitId: candidate.unitId, state: relation(first, trace.events, candidate.unitId, self),
  }));
  const tooFast = relations.some((entry) => entry.state === 'after');
  const tie = relations.find((entry) => entry.state === 'tie')?.unitId ?? null;
  return { tooFast, tie };
}

function passes(check: Check): boolean {
  return !check.tooFast && check.tie === null;
}

/*
 * The display speeds at which this member alone would be in place, the others
 * held where they are, judged as the team is: in order, with no tie. Every
 * whole display speed from bare runes to the page's ceiling is tried, and the
 * run of passing values nearest the current one is reported — usually the only
 * run there is.
 */
function passingInterval(candidates: readonly Candidate[], index: number, current: number): DisplaySpeedInterval | null {
  const { baseSpeed, swift } = candidates[index].base;
  return nearestPassingDisplaySpeeds(baseSpeed, swift, current,
    (shown) => passes(checkMember(candidates, index, runeSpeedForDisplay(baseSpeed, swift, shown))));
}

/*
 * The display speeds that hold this member's slot between its neighbours in
 * the table, each held where it is: at least level with the monster below and
 * at most level with the one above, in the team's arena or dungeon speed. A
 * level speed counts, as the user tunes to it. The floor is raised further by
 * the enemy: in a dungeon the floor's fastest enemy, matched under any Leo cap
 * the member runs at; in arena the speed at which the worst-case enemy no
 * longer has a turn before this member's first, run through the clock with
 * boosts and all. Each figure is the combat speed `speed-tick.ts` gives a
 * display speed, tried one display speed at a time, so no rounding is
 * restated here. `null` where no display speed meets both ends.
 */
function slotRange(candidates: readonly Candidate[], units: readonly TickUnit[], index: number,
  content: SpeedContent, fastestEnemy: number | null): DisplaySpeedInterval | null {
  const candidate = candidates[index];
  const { baseSpeed, swift } = candidate.base;
  const lowest = displaySpeed(baseSpeed, swift, 0);
  const speedAt = (shown: number) => combatSpeed(sheetOf(candidate, runeSpeedForDisplay(baseSpeed, swift, shown)));
  const above = index > 0 ? units[index - 1].speed : null;
  const below = index < units.length - 1 ? units[index + 1].speed : null;
  const leoCap = units.filter((unit, at) => at !== index && unit.capsOthersSpeed).map((unit) => unit.speed);
  const runningAt = (shown: number) => candidate.profile.capsOthersSpeed ? speedAt(shown) : Math.min(speedAt(shown), ...leoCap);
  const clearOfEnemy = (shown: number) => {
    if (content.area === 'dungeon') return fastestEnemy === null || runningAt(shown) >= fastestEnemy;
    const allies = units.map((unit, at) => at === index ? tickUnit(candidate, runeSpeedForDisplay(baseSpeed, swift, shown)) : unit);
    return !worstArenaStage(allies).cutsBefore.includes(candidate.unitId);
  };
  let minimum: number | null = null;
  for (let shown = lowest; shown <= whatIfDisplaySpeedMaximum && minimum === null; shown += 1) {
    if ((below === null || speedAt(shown) >= below) && clearOfEnemy(shown)) minimum = shown;
  }
  if (minimum === null) return null;
  if (above === null) return { minimum, maximum: null };
  let maximum: number | null = null;
  for (let shown = minimum; shown <= whatIfDisplaySpeedMaximum && speedAt(shown) <= above; shown += 1) maximum = shown;
  return maximum === null ? null : { minimum, maximum };
}

/**
 * The run of display speeds nearest `current` at which `passes` holds, from
 * bare runes up to the page's ceiling. A team's member and a standing rule are
 * both asked "which display speeds would put this right" through this one
 * search, so the two cannot come to disagree about what an interval is.
 */
export function nearestPassingDisplaySpeeds(baseSpeed: number, swift: boolean, current: number,
  passes: (shown: number) => boolean): DisplaySpeedInterval | null {
  const lowest = displaySpeed(baseSpeed, swift, 0);
  const runs: DisplaySpeedInterval[] = [];
  let start: number | null = null;
  for (let shown = lowest; shown <= whatIfDisplaySpeedMaximum; shown += 1) {
    const ok = passes(shown);
    if (ok && start === null) start = shown;
    if (!ok && start !== null) {
      runs.push({ minimum: start, maximum: shown - 1 });
      start = null;
    }
  }
  if (start !== null) runs.push({ minimum: start, maximum: null });
  if (runs.length === 0) return null;
  const distance = (run: DisplaySpeedInterval) => current < run.minimum
    ? run.minimum - current
    : run.maximum !== null && current > run.maximum ? current - run.maximum : 0;
  return [...runs].sort((left, right) => distance(left) - distance(right))[0];
}

/* Leo's cap spares a boss, and a dungeon stage does not say which of its
   enemies is one, so in a dungeon every enemy is read as uncapped: the
   pessimistic reading. Arena has no bosses. */
function stageReading(allies: readonly TickUnit[], enemySpeeds: readonly number[], area: SpeedContent['area']): EnemyStageReading {
  const enemies: TickUnit[] = enemySpeeds.map((speed, at) => ({
    key: `enemy-${at + 1}`, side: 'enemy', speed, effects: [], exemptFromCap: area === 'dungeon',
  }));
  const allyKeys = allies.map((unit) => unit.key);
  const trace = simulateBattle([...allies, ...enemies], {
    done: (events) => everyoneMoved(allyKeys)(events) && events.some((event) => event.side === 'enemy'),
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
  };
}

/* The worst arena enemy is the fastest one that still cannot take the first
   turn: level with the team's first mover, since a tie goes to the attacker
   (`SPEED-TICK-CANONICAL.md` §3.2). Anything faster could win the opening
   outright; anything slower cuts in no earlier. Under Leo's
   cap the first mover goes at no more than Leo's own arena speed. */
function worstArenaStage(units: readonly TickUnit[]): EnemyStageReading {
  const opener = teamTrace(units).events[0]?.key;
  const leoSpeeds = units.filter((unit) => unit.capsOthersSpeed).map((unit) => unit.speed);
  const openingSpeed = Math.min(units.find((unit) => unit.key === opener)?.speed ?? 1, ...leoSpeeds);
  return stageReading(units, [openingSpeed], 'arena');
}

export function readSpeedTeam({ team, monsters, totemPercent, whatIfs }: {
  team: SpeedTeam;
  monsters: ReadonlyMap<string, GameRecord>;
  totemPercent: number;
  /**
   * What-if display speeds, by unit id. Only the team's overlay passes them;
   * the team stores them, but every other reader judges the runes worn and
   * leaves this out, so a what-if never reaches a figure outside the overlay.
   */
  whatIfs?: ReadonlyMap<string, number>;
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
  const checks = candidates.map((candidate, index) => checkMember(candidates, index, candidate.runeSpeed));
  const units = candidates.map((candidate) => tickUnit(candidate));
  const trace = teamTrace(units);
  const first = firstTurns(trace.events);
  const actualOrder = [...first.keys()];
  const leoSpeeds = units.filter((unit) => unit.capsOthersSpeed).map((unit) => unit.speed);
  /* The figure the overlay quotes as the floor's fastest enemy, and the speed
     each member really runs at against it: under Leo's cap, no more than his. */
  const fastestEnemy = team.content === 'arena' ? null : fastestEnemySpeed(team.content);
  const runningSpeed = (unit: TickUnit) => unit.capsOthersSpeed ? unit.speed : Math.min(unit.speed, ...leoSpeeds);

  const members: MemberReading[] = candidates.map((candidate, index) => {
    const member = present[index];
    const monster = monsters.get(member.unitId) as GameRecord;
    const parts = monsterSpeedParts(monster);
    const shown = whatIfs?.get(member.unitId) ?? parts.displaySpeed;
    const check = checks[index];
    const needsInterval = !passes(check);
    const interval = needsInterval ? passingInterval(candidates, index, shown) : null;
    const verdict: MemberVerdict = check.tooFast
      ? { kind: 'order', interval }
      : check.tie !== null ? { kind: 'tie', with: check.tie, interval } : { kind: 'in-place' };
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
      actualPosition: actualOrder.indexOf(member.unitId) + 1,
      firstTurnTick: first.get(member.unitId)?.tick ?? Number.POSITIVE_INFINITY,
      verdict,
      slowerThanFastestEnemy: fastestEnemy !== null && runningSpeed(units[index]) < fastestEnemy,
      slotRange: slotRange(candidates, units, index, content, fastestEnemy),
    };
  });

  const enemies: EnemyStageReading[] = units.length === 0 ? []
    : content.area === 'arena'
      ? [worstArenaStage(units)]
      : content.stages.map((stage) => stageReading(units, stage.speeds, content.area));

  return {
    team,
    content,
    members,
    missingUnitIds,
    leader: team.leaderUnitId === null ? null : { unitId: team.leaderUnitId, skill: leaderSkill },
    trace,
    perfect: members.length > 0 && members.every((member) => member.verdict.kind === 'in-place'),
    enemies,
  };
}

/** How many members do not move where they were put — the one count every verdict on a team quotes. */
export function outOfPlaceCount(reading: TeamReading): number {
  return reading.members.filter((member) => member.verdict.kind !== 'in-place').length;
}

/** "arena speed" or "dungeon speed" — the page always says which combat speed a figure is. */
export function combatSpeedName(reading: TeamReading): string {
  return reading.content.area === 'arena' ? 'arena speed' : 'dungeon speed';
}

/** What an interval asks for, in the words a team's member and a standing rule both use, or `null` where no display speed of that monster alone fixes it: then the line says nothing more. */
export function displaySpeedIntervalText(interval: DisplaySpeedInterval | null, general: GeneralSettings): string | null {
  if (interval === null) return null;
  const minimum = formatNumber(interval.minimum, general);
  if (interval.maximum === null) return `needs ${minimum}+ display speed`;
  if (interval.maximum === interval.minimum) return `needs exactly ${minimum} display speed`;
  return `needs ${minimum}–${formatNumber(interval.maximum, general)} display speed`;
}

/**
 * A monster joins in the slot it was added from — the first empty one — and
 * nowhere else. Sorting it in by speed moved it away from where the user just
 * put it, and the order is the user's statement, not the program's guess.
 */
export function withMonsterAdded(team: SpeedTeam, unitId: string): SpeedTeam {
  if (team.members.some((member) => member.unitId === unitId) || team.members.length >= speedContent(team.content).teamSize) return team;
  return { ...team, members: [...team.members, { unitId }] };
}
