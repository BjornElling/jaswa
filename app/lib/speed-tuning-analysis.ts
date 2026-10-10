/**
 * Reads one saved team against the current import: each member's arena or
 * dungeon speed, the order the team really moves in, what is wrong with it,
 * when an enemy first moves, and the display speeds that put each member
 * between its neighbours in the order (`tuningRange`).
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
  runeSpeedForDisplay, simulateBattle, speedBuffPotency,
} from './speed-tick';
import type { BattleTrace, SpeedLeaderSkill, SpeedSheet, TickUnit, TurnEvent } from './speed-tick';
import type { SpeedTeam } from './speed-tuning-preferences';
import { whatIfDisplaySpeedMaximum } from './speed-tuning-preferences';
import type { GeneralSettings } from './types';

/** A range of display speeds; `maximum` is `null` where every faster value works too. */
export type DisplaySpeedInterval = { minimum: number; maximum: number | null };

/**
 * Where a member's first turn falls among the team's first turns, against the
 * place the user gave it. The user's order is the authority: any other place is
 * a fault, whichever monster caused it. A teammate's second turn is not counted,
 * so a booster moving twice moves nobody out of place.
 */
export type MemberVerdict =
  /** Its first turn is the one its place asks for. */
  | { kind: 'in-place' }
  /** Too fast: its first turn comes earlier than its place. */
  | { kind: 'early' }
  /** Too slow: its first turn comes later than its place. */
  | { kind: 'late' }
  /** In its place only by an exact tie on the attack bar, which field position settles. */
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
   * first — in arena `[1]` for the worst case. A fault beside the verdict,
   * read off the same traces as the Enemy cut in table: an enemy that gets in
   * puts the member out of the place the user gave it as surely as a teammate
   * does.
   */
  cutInAt: readonly number[];
  /**
   * The display speeds that put its first turn between the members placed
   * just above and just below it (`tuningRange`), or `null` where none will
   * or none was asked for.
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
  /** Every member in place, with no tie and no enemy getting in before it. */
  perfect: boolean;
  /** Arena: one reading against the worst-case enemy. Dungeon: one per stage. */
  enemies: EnemyStageReading[];
  /** The index in `enemies` of the stage whose first enemy turn comes earliest, which members' places are read from; `null` without enemies. */
  worstStage: number | null;
};

type Candidate = {
  unitId: string;
  profile: SpeedSkillProfile;
  speedBuffPercent: number;
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
    speedBuffPercent: candidate.speedBuffPercent,
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

function unitsAt(candidates: readonly Candidate[], shown: readonly number[]): TickUnit[] {
  return candidates.map((candidate, at) => tickUnit(candidate,
    runeSpeedForDisplay(candidate.base.baseSpeed, candidate.base.swift, shown[at])));
}

/*
 * The display speeds at which the member at `index` has its first turn
 * strictly after the member placed just above it and strictly before the
 * member placed just below it, every other member at the display speed it is
 * read at — its what-if where one is typed. A tie with either neighbour counts
 * against it: no order may hang on field position the page cannot see.
 *
 * The range answers one question, where this monster fits between the two
 * beside it as they stand now, and not where it would need to be for the whole
 * team to come right: a neighbour out of its own place says so on its own line.
 * Enemies play no part in it; an enemy that gets in is a fault of its own.
 *
 * Every display speed from bare runes up is run on the clock, because a boost
 * aimed at the lowest bar can make a faster monster move later and leave the
 * values that fit in more than one stretch. The stretch holding the value the
 * member is read at is the answer, or failing that the stretch nearest it.
 * A stretch that reaches the highest display speed a what-if takes is open.
 */
function tuningRange(candidates: readonly Candidate[], shown: readonly number[], index: number): DisplaySpeedInterval | null {
  const self = candidates[index].unitId;
  const above = candidates[index - 1]?.unitId;
  const below = candidates[index + 1]?.unitId;
  const config = [...shown];
  const fits = (value: number) => {
    config[index] = value;
    const trace = teamTrace(unitsAt(candidates, config), false);
    const first = firstTurns(trace.events);
    return (above === undefined || relation(first, trace.events, above, self) === 'before')
      && (below === undefined || relation(first, trace.events, self, below) === 'before');
  };

  const lowest = displaySpeed(candidates[index].base.baseSpeed, candidates[index].base.swift, 0);
  const stretches: DisplaySpeedInterval[] = [];
  let start: number | null = null;
  for (let value = lowest; value <= whatIfDisplaySpeedMaximum + 1; value += 1) {
    const holds = value <= whatIfDisplaySpeedMaximum && fits(value);
    if (holds && start === null) start = value;
    if (!holds && start !== null) {
      stretches.push({ minimum: start, maximum: value - 1 === whatIfDisplaySpeedMaximum ? null : value - 1 });
      start = null;
    }
  }
  const current = shown[index];
  const distance = (stretch: DisplaySpeedInterval) => current < stretch.minimum ? stretch.minimum - current
    : stretch.maximum !== null && current > stretch.maximum ? current - stretch.maximum : 0;
  return stretches.reduce<DisplaySpeedInterval | null>((nearest, stretch) =>
    nearest === null || distance(stretch) < distance(nearest) ? stretch : nearest, null);
}

/* Leo's cap spares a boss, and a dungeon stage does not say which of its
   enemies is one, so in a dungeon every enemy is read as uncapped: the
   pessimistic reading. Arena has no bosses. */
function stageReading(allies: readonly TickUnit[], enemySpeeds: readonly number[], enemyNames: readonly string[],
  area: SpeedContent['area']): EnemyStageReading {
  const enemies: TickUnit[] = enemySpeeds.map((speed, at) => ({
    key: `enemy-${at + 1}`, side: 'enemy', speed, effects: [], exemptFromCap: area === 'dungeon',
  }));
  const allyKeys = allies.map((unit) => unit.key);
  const settled = (events: readonly TurnEvent[]) => everyoneMoved(allyKeys)(events) && events.some((event) => event.side === 'enemy');
  const trace = simulateBattle([...allies, ...enemies], { done: drawnUntil(allyKeys, settled) });
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
   Named once per stage, as every reading of a team names each stage again. */
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
function worstArenaStage(units: readonly TickUnit[], trace: BattleTrace): EnemyStageReading {
  const opener = trace.events[0]?.key;
  const leoSpeeds = units.filter((unit) => unit.capsOthersSpeed).map((unit) => unit.speed);
  const openingSpeed = Math.min(units.find((unit) => unit.key === opener)?.speed ?? 1, ...leoSpeeds);
  return stageReading(units, [openingSpeed], ['Enemy'], 'arena');
}

/* How many turns come before a stage's first enemy turn: the fewer, the worse. */
function firstEnemyAt(stage: EnemyStageReading): number {
  const at = stage.trace.events.findIndex((event) => event.side === 'enemy');
  return at === -1 ? Number.POSITIVE_INFINITY : at;
}

/** What the team faces: the worst-case enemy in arena, each stage in a dungeon. */
function enemyStages(units: readonly TickUnit[], content: SpeedContent, trace: BattleTrace): EnemyStageReading[] {
  if (units.length === 0 || !content.facesEnemies) return [];
  return content.area === 'arena'
    ? [worstArenaStage(units, trace)]
    : content.stages.map((stage) => stageReading(units, stage.speeds, enemyNamesOf(stage), content.area));
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
   * range, and the search runs the clock once per display speed, so the page,
   * which reads every team at once and shows none, leaves it out: there every
   * `range` is `null` and every `inRange` false.
   */
  ranges?: boolean;
}): TeamReading {
  const content = speedContent(team.content);
  /* What the team is measured against: nothing at all where the user says it
     is not speed tuned, so its places, ranges and verdicts are its own order's. */
  const faced: SpeedContent = team.noSpeedTuning ? { ...content, facesEnemies: false } : content;
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
      speedBuffPercent: speedBuffPotency(parts.speedUpEffect),
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
  const enemies = enemyStages(units, faced, trace);
  /* A member's place is its absolute one, enemy turns counted, on the stage
     whose first enemy turn comes earliest — the one the Ticks view opens on.
     Without enemies it is the team's own order. */
  const worstStage = enemies.reduce<number | null>((worst, stage, at) =>
    worst === null || firstEnemyAt(stage) < firstEnemyAt(enemies[worst]) ? at : worst, null);
  const orderEvents = worstStage === null ? trace.events : enemies[worstStage].trace.events;
  const lastFirstTurn = Math.max(-1, ...units.map((unit) => orderEvents.findIndex((event) => event.key === unit.key)));
  const opening = orderEvents.slice(0, lastFirstTurn + 1);
  const shownSpeeds = present.map((member) => whatIfs?.get(member.unitId) ?? monsterSpeedParts(monsters.get(member.unitId) as GameRecord).displaySpeed);

  /* The user's order is the authority: a member whose first turn is not the
     one its place asks for is out of place, whichever monster put it there,
     so a first monster moving fourth says so as surely as the three that
     passed it. Only first turns are ranked, as a teammate boosted into a
     second turn moves nobody out of place. A member that never moves within
     the clock's limit ranks after every one that does. */
  const firstAt = (unitId: string) => {
    const event = first.get(unitId);
    return event === undefined ? Number.POSITIVE_INFINITY : trace.events.indexOf(event);
  };
  const moveOrder = candidates.map((candidate) => candidate.unitId)
    .sort((left, right) => firstAt(left) - firstAt(right));
  const verdicts: MemberVerdict[] = candidates.map((candidate, index) => {
    const rank = moveOrder.indexOf(candidate.unitId);
    if (rank < index) return { kind: 'early' };
    if (rank > index) return { kind: 'late' };
    const tie = moveOrder.slice(0, rank)
      .find((unitId) => relation(first, trace.events, unitId, candidate.unitId) === 'tie') ?? null;
    return tie !== null ? { kind: 'tie', with: tie } : { kind: 'in-place' };
  });

  const members: MemberReading[] = candidates.map((candidate, index) => {
    const member = present[index];
    const monster = monsters.get(member.unitId) as GameRecord;
    const parts = monsterSpeedParts(monster);
    const shown = shownSpeeds[index];
    const verdict = verdicts[index];
    const range = ranges ? tuningRange(candidates, shownSpeeds, index) : null;
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
    perfect: members.length > 0 && members.every((member) => member.verdict.kind === 'in-place' && member.cutInAt.length === 0),
    enemies,
    worstStage,
  };
}

/** A field-position tie is unresolved, but only a first turn out of its place is out of place. An enemy that gets in is counted on its own. */
export function outOfPlaceCount(reading: TeamReading): number {
  return reading.members.filter((member) => member.verdict.kind === 'early' || member.verdict.kind === 'late').length;
}

/* Each area's combat speed by name. A content not yet named has no area to
   name it by, so its figure is the combat speed with General leads alone. */
const combatSpeedNames: Readonly<Record<SpeedContent['area'], string>> = {
  arena: 'arena speed', dungeon: 'dungeon speed', guild: 'guild speed', unnamed: 'combat speed',
};

/** "arena speed", "dungeon speed" and so on — the page always says which combat speed a figure is. */
export function combatSpeedName(reading: TeamReading): string {
  return combatSpeedNames[reading.content.area];
}

/** What an interval asks for, in the words a team's member and a standing rule both use, or `null` where no display speed of that monster alone puts it right: then the line says nothing more. */
export function displaySpeedIntervalText(interval: DisplaySpeedInterval | null, general: GeneralSettings): string | null {
  if (interval === null) return null;
  const minimum = formatNumber(interval.minimum, general);
  if (interval.maximum === null) return `needs ${minimum}+ display speed`;
  if (interval.maximum === interval.minimum) return `needs exactly ${minimum} display speed`;
  return `needs ${minimum}–${formatNumber(interval.maximum, general)} display speed`;
}
