/**
 * Reads one saved team against the current import: each member's arena or
 * dungeon speed, the order the team really moves in, what is wrong with it,
 * when an enemy first moves, and the display speeds that give each member a
 * perfect place (`perfectRange`).
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
import { speedContent } from './speed-contents';
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
  /** Where it really moves among the team, from 1. */
  actualPosition: number;
  firstTurnTick: number;
  verdict: MemberVerdict;
  /**
   * The stages, from 1, whose first enemy turn comes before this member's
   * first — in arena `[1]` for the worst case. A warning beside the verdict,
   * never a verdict of its own, read off the same traces as the Enemy cut in
   * table.
   */
  cutInAt: readonly number[];
  /** The display speeds that give it a perfect place (`perfectRange`), or `null` where none does or none was asked for. */
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

function teamTrace(units: readonly TickUnit[], snapshots = true): BattleTrace {
  return simulateBattle(units, { done: everyoneMoved(units.map((unit) => unit.key)), snapshots });
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

/* Every fault a team has, as keys: a pair the table orders `upper>lower`
   that does not strictly move so — a tie counts, as no order should hang on
   field position the page cannot see — and `stage:unit` for each member an
   enemy has a turn before. Unit ids are digits, so neither separator can
   occur inside one. */
type TeamFaults = { pairs: Set<string>; cuts: Set<string> };

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

/*
 * The display speeds this member can be given, the others held where they
 * are, for a perfect place: every teammate it is ordered against moves
 * strictly before or after it as the table asks, no enemy on any stage has a
 * turn before its first, and nothing else on the team gets worse — no pair
 * and no member cut into that was not already. So a value from the range,
 * typed in, never leaves this monster wrong and never breaks another, and
 * with every other member already perfect the whole team is.
 *
 * It is the one answer to "which display speeds would put this right": the
 * Interval column states it and the verdict line quotes it, so the two cannot
 * disagree. Every candidate runs through the clock, the enemy's stages
 * included, so boosts, Leo and the attacker's tie (`SPEED-TICK-CANONICAL.md`
 * §3.2) are answered by the one implementation.
 */
function perfectRange(candidates: readonly Candidate[], index: number, content: SpeedContent,
  current: number, baseline: TeamFaults): DisplaySpeedInterval | null {
  const candidate = candidates[index];
  const self = candidate.unitId;
  const { baseSpeed, swift } = candidate.base;
  const perfect = (shown: number) => {
    const units = candidates.map((entry, at) => tickUnit(entry, at === index ? runeSpeedForDisplay(baseSpeed, swift, shown) : undefined));
    const trace = teamTrace(units, false);
    for (const pair of pairFaults(units, trace)) {
      if (pair.split('>').includes(self) || !baseline.pairs.has(pair)) return false;
    }
    for (const cut of cutFaults(enemyStages(units, content, trace, false))) {
      if (cut.slice(cut.indexOf(':') + 1) === self || !baseline.cuts.has(cut)) return false;
    }
    return true;
  };
  return nearestPassingDisplaySpeeds(baseSpeed, swift, current, perfect);
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
function stageReading(allies: readonly TickUnit[], enemySpeeds: readonly number[], area: SpeedContent['area'], snapshots = true): EnemyStageReading {
  const enemies: TickUnit[] = enemySpeeds.map((speed, at) => ({
    key: `enemy-${at + 1}`, side: 'enemy', speed, effects: [], exemptFromCap: area === 'dungeon',
  }));
  const allyKeys = allies.map((unit) => unit.key);
  const trace = simulateBattle([...allies, ...enemies], {
    done: (events) => everyoneMoved(allyKeys)(events) && events.some((event) => event.side === 'enemy'),
    snapshots,
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
function worstArenaStage(units: readonly TickUnit[], trace: BattleTrace, snapshots = true): EnemyStageReading {
  const opener = trace.events[0]?.key;
  const leoSpeeds = units.filter((unit) => unit.capsOthersSpeed).map((unit) => unit.speed);
  const openingSpeed = Math.min(units.find((unit) => unit.key === opener)?.speed ?? 1, ...leoSpeeds);
  return stageReading(units, [openingSpeed], 'arena', snapshots);
}

/** What the team faces: the worst-case enemy in arena, each stage in a dungeon. */
function enemyStages(units: readonly TickUnit[], content: SpeedContent, trace: BattleTrace, snapshots = true): EnemyStageReading[] {
  if (units.length === 0) return [];
  return content.area === 'arena'
    ? [worstArenaStage(units, trace, snapshots)]
    : content.stages.map((stage) => stageReading(units, stage.speeds, content.area, snapshots));
}

export function readSpeedTeam({ team, monsters, totemPercent, whatIfs, ranges = false }: {
  team: SpeedTeam;
  monsters: ReadonlyMap<string, GameRecord>;
  totemPercent: number;
  /**
   * What-if display speeds, by unit id. Only the team's overlay passes them;
   * the team stores them, but every other reader judges the runes worn and
   * leaves this out, so a what-if never reaches a figure outside the overlay.
   */
  whatIfs?: ReadonlyMap<string, number>;
  /**
   * Whether to search each member's perfect range. Only the overlay states a
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
  const actualOrder = [...first.keys()];
  const enemies = enemyStages(units, content, trace);
  const baseline: TeamFaults = { pairs: pairFaults(units, trace), cuts: cutFaults(enemies) };

  const members: MemberReading[] = candidates.map((candidate, index) => {
    const member = present[index];
    const monster = monsters.get(member.unitId) as GameRecord;
    const parts = monsterSpeedParts(monster);
    const shown = whatIfs?.get(member.unitId) ?? parts.displaySpeed;
    /* Its own verdict looks only up the order: a monster below that moves
       first is that monster's fault, so a slow member never turns red for a
       fast one under it — the one out of place is the one that says so. */
    const above = candidates.slice(0, index).map((entry) => ({ unitId: entry.unitId, state: relation(first, trace.events, entry.unitId, member.unitId) }));
    const tie = above.find((entry) => entry.state === 'tie')?.unitId ?? null;
    const verdict: MemberVerdict = above.some((entry) => entry.state === 'after') ? { kind: 'order' }
      : tie !== null ? { kind: 'tie', with: tie } : { kind: 'in-place' };
    const range = ranges ? perfectRange(candidates, index, content, shown, baseline) : null;
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

/** What an interval asks for, in the words a team's member and a standing rule both use, or `null` where no display speed of that monster alone puts it right: then the line says nothing more. */
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
