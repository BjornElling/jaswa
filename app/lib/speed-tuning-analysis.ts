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
import type { GameRecord } from './game-data';
import { monsterSpeedParts } from './monster-stats';
import { elementName } from './rune-sets';
import { speedContent } from './speed-contents';
import type { SpeedContent } from './speed-contents';
import { speedLeaderSkill, speedSkillProfile } from './speed-skills';
import type { SpeedSkillProfile } from './speed-skills';
import {
  buffedCombatSpeed, combatSpeed, displaySpeed, everyoneMoved, leaderSpeedPercent,
  runeSpeedForDisplay, simulateBattle,
} from './speed-tick';
import type { BattleTrace, SpeedLeaderSkill, SpeedSheet, TickUnit, TurnEvent } from './speed-tick';
import type { SpeedRule, SpeedTeam } from './speed-tuning-preferences';
import { whatIfDisplaySpeedMaximum } from './speed-tuning-preferences';

/** A range of display speeds; `maximum` is `null` where every faster value works too. */
export type DisplaySpeedInterval = { minimum: number; maximum: number | null };

export type MemberVerdict =
  /** Moves where it was asked to, with the margin where one is asked. */
  | { kind: 'in-place' }
  /** Out of order: moves before a monster meant to go first, after one meant to follow, or both. */
  | { kind: 'order'; tooSlow: boolean; tooFast: boolean; interval: DisplaySpeedInterval | null }
  /** In order, but closer to a neighbour than the margin allows. */
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
};

export type EnemyStageReading = {
  /** The fastest enemy's dungeon speed or, in arena, the worst-case enemy's arena speed. */
  enemySpeed: number;
  /** The tick of the first enemy turn. */
  firstEnemyTick: number;
  /** How many of the team's turns come before it. */
  allyTurnsBefore: number;
  trace: BattleTrace;
  /** Every enemy on the stage, in the trace as `enemy-1`, `enemy-2` …, with their speeds. */
  enemySpeeds: readonly number[];
};

export type RuleReading = { rule: SpeedRule; state: 'holds' | 'broken' | 'contradicts-order' };

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
  /** Arena: one reading against the worst-case enemy. Dungeon: one per stage. */
  enemies: EnemyStageReading[];
  rules: RuleReading[];
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

function tickUnit(candidate: Candidate, runeSpeed?: number, speedDelta = 0): TickUnit {
  const sheet = sheetOf(candidate, runeSpeed);
  return {
    key: candidate.unitId,
    side: 'ally',
    speed: combatSpeed(sheet) + speedDelta,
    buffedSpeed: buffedCombatSpeed(sheet) + speedDelta,
    effects: candidate.profile.effects,
    similarBoostPassive: candidate.profile.similarBoostPassive,
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

type Check = { order: 'ok' | 'too-slow' | 'too-fast' | 'both'; tie: string | null; marginShort: boolean };

/*
 * One member judged inside one simulated team: out of order against anyone,
 * in order only by a tie, or short of the margin against a neighbour. The
 * margin test runs the clock again with the neighbour that should follow given
 * `margin` more combat speed: if it still follows, the gap holds.
 */
function checkMember(candidates: readonly Candidate[], index: number, runeSpeed: number, margin: number | null): Check {
  const units = candidates.map((candidate, at) => tickUnit(candidate, at === index ? runeSpeed : undefined));
  const trace = teamTrace(units);
  const first = firstTurns(trace.events);
  const self = candidates[index].unitId;
  let tooSlow = false;
  let tooFast = false;
  let tie: string | null = null;
  candidates.forEach((candidate, at) => {
    if (at === index) return;
    const wantedBefore = at < index;
    const state = wantedBefore ? relation(first, trace.events, candidate.unitId, self) : relation(first, trace.events, self, candidate.unitId);
    if (state === 'after') {
      if (wantedBefore) tooFast = true;
      else tooSlow = true;
    } else if (state === 'tie' && tie === null) tie = candidate.unitId;
  });
  let marginShort = false;
  if (margin !== null && !tooSlow && !tooFast) {
    for (const [earlier, later] of [[index - 1, index], [index, index + 1]]) {
      if (earlier < 0 || later >= candidates.length) continue;
      const pushed = candidates.map((candidate, at) => tickUnit(
        candidate, at === index ? runeSpeed : undefined, at === later ? margin : 0,
      ));
      const pushedTrace = teamTrace(pushed);
      if (relation(firstTurns(pushedTrace.events), pushedTrace.events, candidates[earlier].unitId, candidates[later].unitId) !== 'before') {
        marginShort = true;
      }
    }
  }
  const order = tooSlow && tooFast ? 'both' : tooSlow ? 'too-slow' : tooFast ? 'too-fast' : 'ok';
  return { order, tie, marginShort };
}

function passes(check: Check): boolean {
  return check.order === 'ok' && check.tie === null && !check.marginShort;
}

/*
 * The display speeds at which this member alone would be in place, the others
 * held where they are. Every whole display speed from bare runes to the
 * page's ceiling is tried, and the run of passing values nearest the current
 * one is reported — usually the only run there is.
 */
function passingInterval(candidates: readonly Candidate[], index: number, margin: number | null, current: number): DisplaySpeedInterval | null {
  const { baseSpeed, swift } = candidates[index].base;
  const lowest = displaySpeed(baseSpeed, swift, 0);
  const runs: DisplaySpeedInterval[] = [];
  let start: number | null = null;
  for (let shown = lowest; shown <= whatIfDisplaySpeedMaximum; shown += 1) {
    const ok = passes(checkMember(candidates, index, runeSpeedForDisplay(baseSpeed, swift, shown), margin));
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

function stageReading(allies: readonly TickUnit[], enemySpeeds: readonly number[]): EnemyStageReading {
  const enemies: TickUnit[] = enemySpeeds.map((speed, at) => ({
    key: `enemy-${at + 1}`, side: 'enemy', speed, buffedSpeed: speed, effects: [],
  }));
  const allyKeys = allies.map((unit) => unit.key);
  const trace = simulateBattle([...allies, ...enemies], {
    done: (events) => everyoneMoved(allyKeys)(events) && events.some((event) => event.side === 'enemy'),
  });
  const firstEnemy = trace.events.find((event) => event.side === 'enemy');
  const index = firstEnemy ? trace.events.indexOf(firstEnemy) : trace.events.length;
  return {
    enemySpeed: Math.max(...enemySpeeds),
    firstEnemyTick: firstEnemy?.tick ?? Number.POSITIVE_INFINITY,
    allyTurnsBefore: trace.events.slice(0, index).filter((event) => event.side === 'ally').length,
    trace,
    enemySpeeds,
  };
}

export function readSpeedTeam({ team, monsters, totemPercent, rules }: {
  team: SpeedTeam;
  monsters: ReadonlyMap<string, GameRecord>;
  totemPercent: number;
  rules: readonly SpeedRule[];
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
    const shown = member.whatIfDisplaySpeed ?? parts.displaySpeed;
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
  const margin = team.marginEnabled ? team.margin : null;
  const units = candidates.map((candidate) => tickUnit(candidate));
  const trace = teamTrace(units);
  const first = firstTurns(trace.events);
  const actualOrder = [...first.keys()];

  const members: MemberReading[] = candidates.map((candidate, index) => {
    const member = present[index];
    const monster = monsters.get(member.unitId) as GameRecord;
    const parts = monsterSpeedParts(monster);
    const shown = member.whatIfDisplaySpeed ?? parts.displaySpeed;
    const check = checkMember(candidates, index, candidate.runeSpeed, margin);
    const needsInterval = !passes(check);
    const interval = needsInterval ? passingInterval(candidates, index, margin, shown) : null;
    const verdict: MemberVerdict = check.order !== 'ok'
      ? { kind: 'order', tooSlow: check.order !== 'too-fast', tooFast: check.order !== 'too-slow', interval }
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
      whatIf: member.whatIfDisplaySpeed !== undefined,
      leaderPercent: candidate.base.percentOfBase - totemPercent,
      combatSpeed: units[index].speed,
      profile: candidate.profile,
      actualPosition: actualOrder.indexOf(member.unitId) + 1,
      firstTurnTick: first.get(member.unitId)?.tick ?? Number.POSITIVE_INFINITY,
      verdict,
    };
  });

  /* The worst arena enemy is the fastest one that still cannot take the first
     turn: one arena speed below the team's first mover. Anything faster could
     win the opening outright; anything slower cuts in no earlier. */
  const enemies: EnemyStageReading[] = units.length === 0 ? []
    : content.area === 'arena'
      ? [stageReading(units, [Math.max(1, (units.find((unit) => unit.key === actualOrder[0])?.speed ?? 1) - 1)])]
      : content.stages.map((stage) => stageReading(units, stage.speeds));

  const inTeam = new Set(present.map((member) => member.unitId));
  const ruleReadings: RuleReading[] = rules
    .filter((rule) => (content.area === 'arena' ? rule.arena : rule.dungeons)
      && inTeam.has(rule.fasterUnitId) && inTeam.has(rule.slowerUnitId))
    .map((rule) => {
      const wanted = present.findIndex((member) => member.unitId === rule.fasterUnitId)
        < present.findIndex((member) => member.unitId === rule.slowerUnitId);
      if (!wanted) return { rule, state: 'contradicts-order' as const };
      return { rule, state: relation(first, trace.events, rule.fasterUnitId, rule.slowerUnitId) === 'before' ? 'holds' as const : 'broken' as const };
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
    rules: ruleReadings,
  };
}

/**
 * Where a monster lands when it joins a team: in front of the first member it
 * would outpace, by the team's own clock. That is the order its speed gives it,
 * and from there the user moves it where they want it.
 */
export function naturalInsertIndex(reading: TeamReading, candidate: { unitId: string; monster: GameRecord }, totemPercent: number): number {
  const parts = monsterSpeedParts(candidate.monster);
  const element = elementName(candidate.monster.attribute) ?? null;
  const leader = reading.leader?.skill ?? null;
  const sheet: SpeedSheet = {
    baseSpeed: parts.baseSpeed,
    swift: parts.swift,
    percentOfBase: totemPercent + leaderSpeedPercent(leader, reading.content.area, element),
    runeSpeed: runeSpeedForDisplay(parts.baseSpeed, parts.swift, parts.displaySpeed),
  };
  const speed = combatSpeed(sheet);
  const at = reading.members.findIndex((member) => member.combatSpeed < speed);
  return at === -1 ? reading.members.length : at;
}

/** How many members do not move where they were put — the one count every verdict on a team quotes. */
export function outOfPlaceCount(reading: TeamReading): number {
  return reading.members.filter((member) => member.verdict.kind !== 'in-place').length;
}

/** Whether a team is read with any typed experiment, so a verdict can say which reading it is. */
export function hasWhatIf(team: SpeedTeam): boolean {
  return team.members.some((member) => member.whatIfDisplaySpeed !== undefined);
}

/**
 * The team as its monsters stand today, every what-if left out. A what-if is
 * an experiment; whether the runes actually worn hold the tune is a different
 * question, and a team whose experiment works is not tuned until the runes are.
 */
export function withoutWhatIfs(team: SpeedTeam): SpeedTeam {
  return hasWhatIf(team) ? { ...team, members: team.members.map((member) => ({ unitId: member.unitId })) } : team;
}

/** "arena speed" or "dungeon speed" — the page always says which combat speed a figure is. */
export function combatSpeedName(reading: TeamReading): string {
  return reading.content.area === 'arena' ? 'arena speed' : 'dungeon speed';
}

export const ruleStateText = {
  holds: 'holds',
  broken: 'broken',
  'contradicts-order': 'your order says otherwise',
} as const;

/** A monster joins where its own speed puts it; from there the user moves it. */
export function withMonsterAdded(team: SpeedTeam, reading: TeamReading, unitId: string, monster: GameRecord, totemShare: number): SpeedTeam {
  if (team.members.some((member) => member.unitId === unitId) || team.members.length >= speedContent(team.content).teamSize) return team;
  const before = reading.members[naturalInsertIndex(reading, { unitId, monster }, totemShare)]?.unitId;
  const at = before === undefined ? team.members.length : team.members.findIndex((member) => member.unitId === before);
  const members = [...team.members];
  members.splice(at === -1 ? members.length : at, 0, { unitId });
  return { ...team, members };
}
