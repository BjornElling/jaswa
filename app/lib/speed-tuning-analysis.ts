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
  /** Moves where it was asked to, with the margin where one is asked. */
  | { kind: 'in-place' }
  /** Too fast: moves before a monster placed above it. A member only ever answers for the order above it. */
  | { kind: 'order'; interval: DisplaySpeedInterval | null }
  /** Follows every monster above it, but closer than the margin allows. Judged on every member with no fault of its own. */
  | { kind: 'margin'; interval: DisplaySpeedInterval | null }
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
   * that enemy outpaces it. An equal speed is not counted: a tie is read as the
   * team's. A warning beside the verdict, never a verdict of its own.
   */
  slowerThanFastestEnemy: boolean;
};

export type EnemyStageReading = {
  /** The fastest enemy's dungeon speed or, in arena, the worst-case enemy's arena speed. */
  enemySpeed: number;
  /** The tick of the first enemy turn. */
  firstEnemyTick: number;
  /** The team's turn the first enemy turn comes straight after — whose, and that
      monster's how-many-th — or `null` when an enemy moves before the team. */
  follows: { unitId: string; turn: number } | null;
  /** An enemy turn comes before the team's last first turn: the opening can be cut into. */
  cutsIn: boolean;
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
  /** Every member in place, with no tie and no margin short. */
  perfect: boolean;
  /** Short only of the margin: every member in its place, a neighbour too close. */
  marginOnly: boolean;
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

/* `speedDelta` is added to the rounded combat speed: the margin's push, which
   is stated in arena or dungeon speed and so lands after the rounding. */
function tickUnit(candidate: Candidate, runeSpeed?: number, speedDelta = 0): TickUnit {
  const sheet = sheetOf(candidate, runeSpeed);
  return {
    key: candidate.unitId,
    side: 'ally',
    speed: combatSpeed(sheet) + speedDelta,
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

type Check = { tooFast: boolean; tie: string | null; marginShort: boolean };

/*
 * One member judged inside one simulated team, looking only up the order: it
 * is wrong if it moves before a monster placed above it, in place only by a tie
 * with one, or short of the margin against them. A monster below that moves
 * first is that monster's fault, not this one's, so a slow member never turns
 * red for a fast one under it — the one out of place is the one that says so.
 * The margin test runs the clock again with this member given `margin` more
 * combat speed — arena or dungeon speed, the figure the battle runs on, buff
 * and Leo's cap applied to it as to any other — and if it still follows every
 * monster above it, the gap holds.
 */
function checkMember(candidates: readonly Candidate[], index: number, runeSpeed: number, margin: number | null): Check {
  const self = candidates[index].unitId;
  const above = candidates.slice(0, index);
  const judge = (speedDelta: number) => {
    const trace = teamTrace(candidates.map((candidate, at) => at === index
      ? tickUnit(candidate, runeSpeed, speedDelta)
      : tickUnit(candidate)));
    const first = firstTurns(trace.events);
    return above.map((candidate) => ({ unitId: candidate.unitId, state: relation(first, trace.events, candidate.unitId, self) }));
  };
  const relations = judge(0);
  const tooFast = relations.some((entry) => entry.state === 'after');
  const tie = relations.find((entry) => entry.state === 'tie')?.unitId ?? null;
  const marginShort = margin !== null && !tooFast && tie === null
    && judge(margin).some((entry) => entry.state !== 'before');
  return { tooFast, tie, marginShort };
}

function passes(check: Check): boolean {
  return !check.tooFast && check.tie === null && !check.marginShort;
}

/*
 * The display speeds at which this member alone would be in place, the others
 * held where they are, judged as the team is: in order, with no tie and, where
 * one is asked, the margin. Every whole display speed from bare runes to the
 * page's ceiling is tried, and the run of passing values nearest the current
 * one is reported — usually the only run there is.
 */
function passingInterval(candidates: readonly Candidate[], index: number, margin: number | null, current: number): DisplaySpeedInterval | null {
  const { baseSpeed, swift } = candidates[index].base;
  return nearestPassingDisplaySpeeds(baseSpeed, swift, current,
    (shown) => passes(checkMember(candidates, index, runeSpeedForDisplay(baseSpeed, swift, shown), margin)));
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
   pessimistic reading, as a tie is. Arena has no bosses. */
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
    cutsIn: firstEnemy !== undefined && allyKeys.some((key) => !movedBefore.has(key)),
    trace,
    enemySpeeds,
  };
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
  /* Faults come in an order. A monster out of its place, or in it only by a
     tie, is the fault and is read first; the margin is asked of every monster
     that has neither, whatever its teammates do, so a monster in its place but
     too close to a neighbour says so even while another is out of order. */
  const margin = team.marginEnabled ? team.margin : null;
  const checks = candidates.map((candidate, index) => checkMember(candidates, index, candidate.runeSpeed, margin));
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
    const interval = needsInterval ? passingInterval(candidates, index, margin, shown) : null;
    const verdict: MemberVerdict = check.tooFast
      ? { kind: 'order', interval }
      : check.tie !== null ? { kind: 'tie', with: check.tie, interval }
        : check.marginShort ? { kind: 'margin', interval } : { kind: 'in-place' };
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
    };
  });

  /* The worst arena enemy is the fastest one that still cannot take the first
     turn: one arena speed below the team's first mover. Anything faster could
     win the opening outright; anything slower cuts in no earlier. Under Leo's
     cap the first mover goes at no more than Leo's own arena speed. */
  const openingSpeed = Math.min(units.find((unit) => unit.key === actualOrder[0])?.speed ?? 1, ...leoSpeeds);
  const enemies: EnemyStageReading[] = units.length === 0 ? []
    : content.area === 'arena'
      ? [stageReading(units, [Math.max(1, openingSpeed - 1)], content.area)]
      : content.stages.map((stage) => stageReading(units, stage.speeds, content.area));

  return {
    team,
    content,
    members,
    missingUnitIds,
    leader: team.leaderUnitId === null ? null : { unitId: team.leaderUnitId, skill: leaderSkill },
    trace,
    perfect: members.length > 0 && members.every((member) => member.verdict.kind === 'in-place'),
    marginOnly: members.some((member) => member.verdict.kind === 'margin')
      && members.every((member) => member.verdict.kind === 'margin' || member.verdict.kind === 'in-place'),
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
