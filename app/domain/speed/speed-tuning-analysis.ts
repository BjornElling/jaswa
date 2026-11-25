/**
 * Reads one saved team against the current import: each member's combat
 * speed, the order the team really moves in, what is wrong with it,
 * when an enemy first moves, and the combat speeds that put each member
 * between its neighbours in the order (`tuningRange`).
 *
 * Every rule comes from `speed-tick.ts`. This module decides what to simulate
 * and how to report it, and states no rule of the game of its own — an
 * interval is found by running the same clock at the candidate combat speeds,
 * and the display speed beside a combat speed is found by asking `combatSpeed`
 * at each candidate display speed, so rounding, Swift and boosts are all
 * answered by the one implementation.
 */
import { formatNumber } from '../shared/formatting';
import type { GameRecord } from '../account/game-record';
import { monsterSpeedParts } from '../combat/monster-stats';
import { elementName } from '../runes/rune-sets';
import { isReadableName, monsterPresentation } from '../monsters/monster-catalog';
import { speedContent } from './speed-contents';
import type { DungeonStage, SpeedContent } from './speed-contents';
import { speedLeaderSkill, speedSkillProfile } from './speed-skills';
import type { SpeedSkillProfile } from './speed-skills';
import {
  battleSpeedPercent, combatSpeed, displaySpeed, everyoneMoved,
  runeSpeedForDisplay, simulateBattle, speedBuffPotency,
} from './speed-tick';
import type { BattleTrace, SpeedLeaderSkill, SpeedSheet, TickRule, TickUnit, TurnEvent } from './speed-tick';
import { enemyUnit, firstTurns, readSpeedIntervals, relation, worstCaseEnemySpeed } from './speed-tuning-intervals';
import type { CombatSpeedInterval, SpeedIntervalSearch } from './speed-tuning-intervals';
import type { SpeedTeam } from '../profiles/speed-tuning-preferences';
import type { GeneralSettings } from '../model';

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
  /** In its place only by an exact tie on the attack bar at equal start-of-battle combat speed, which pick order settles. */
  | { kind: 'tie'; with: string };

export type MemberReading = {
  unitId: string;
  /** Where the user put it, from 1. */
  wantedPosition: number;
  masterId: string;
  element: string | null;
  baseSpeed: number;
  swift: boolean;
  /** Combat speed on the runes engraved, with the leads and totem of the team's content. */
  importedCombatSpeed: number;
  /** The combat speed the team is read at: the what-if where one is typed. */
  combatSpeed: number;
  whatIf: boolean;
  /** The combat speed on bare runes: the slowest the member can be, where its interval search starts. */
  lowestCombatSpeed: number;
  /**
   * The display speed that goes with `combatSpeed`: the import's, or for a
   * what-if the lowest display speed whose combat speed reaches it. `null`
   * where the what-if is under bare runes.
   */
  displaySpeed: number | null;
  leaderPercent: number;
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
   * first — `[1]` for the worst case against another player. A fault beside the verdict,
   * read off the same traces as the Enemy cut in table: an enemy that gets in
   * puts the member out of the place the user gave it as surely as a teammate
   * does.
   */
  cutInAt: readonly number[];
  /**
   * The combat speeds that put its first turn between the members placed
   * just above and just below it with no enemy turn before it
   * (`tuningRange`), or `null` where none will or none was asked for.
   */
  range: CombatSpeedInterval | null;
  /** Whether the combat speed it is read at is one of them. */
  inRange: boolean;
};

export type EnemyStageReading = {
  /** The fastest enemy's combat speed or, against another player, the worst-case enemy's. */
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
  /** Their names, in the same order — `Golem (Water) #1` — or `Enemy` for the hypothetical worst case. */
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
  /** Arena and Siege Battle: one reading against the worst-case enemy. Dungeon: one per stage. */
  enemies: EnemyStageReading[];
  /** The index in `enemies` of the stage whose first enemy turn comes earliest, which members' places are read from; `null` without enemies. */
  worstStage: number | null;
  /** The clock's inputs for the interval search, with no account records. */
  intervalSearch: SpeedIntervalSearch;
};

type Candidate = {
  unitId: string;
  masterId: string;
  element: string | null;
  importedDisplaySpeed: number;
  profile: SpeedSkillProfile;
  speedBuffPercent: number;
  leaderPercent: number;
  base: Omit<SpeedSheet, 'runeSpeed'>;
  /** Combat speed on the runes engraved. */
  imported: number;
  /** The combat speed it is read at: its what-if where one is typed, else `imported`. */
  speed: number;
};

/* A what-if is a combat speed and goes to the clock as it stands: the clock
   reads nothing of a unit's speed but its combat speed, so no rune speed has to
   be invented to reach it, and a value no rune build hits exactly is still a
   fair question. */
function tickUnit(candidate: Candidate): TickUnit {
  return {
    key: candidate.unitId,
    side: 'ally',
    speed: candidate.speed,
    speedBuffPercent: candidate.speedBuffPercent,
    effects: candidate.profile.effects,
    similarBoostPassive: candidate.profile.similarBoostPassive,
    capsOthersSpeed: candidate.profile.capsOthersSpeed,
  };
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
function teamTrace(units: readonly TickUnit[], tick: TickRule, drawn = true): BattleTrace {
  const keys = units.map((unit) => unit.key);
  const settled = everyoneMoved(keys);
  return simulateBattle(units, { done: drawn ? drawnUntil(keys, settled) : settled, snapshots: drawn, tick });
}

/* The combat speed a candidate has at one display speed, every other term its own. */
function combatAtDisplay(candidate: Candidate, shown: number): number {
  return combatSpeed({ ...candidate.base, runeSpeed: runeSpeedForDisplay(candidate.base.baseSpeed, candidate.base.swift, shown) });
}

function lowestCombat(candidate: Candidate): number {
  return combatSpeed({ ...candidate.base, runeSpeed: 0 });
}

/*
 * The display speed that goes with a combat speed: the lowest whose combat
 * speed reaches it, or `null` under bare runes. Asked of `combatSpeed` at each
 * display speed from bare runes up rather than turned around by a formula, so
 * the rounding stays `speed-tick.ts`'s alone. Each step adds a whole point of
 * flat rune speed, so the walk is never longer than the gap it closes.
 */
function displaySpeedFor(candidate: Candidate, target: number): number | null {
  if (lowestCombat(candidate) > target) return null;
  const lowest = displaySpeed(candidate.base.baseSpeed, candidate.base.swift, 0);
  for (let shown = lowest; shown <= lowest + target; shown += 1) {
    if (combatAtDisplay(candidate, shown) >= target) return shown;
  }
  return null;
}

/** One line-up of enemies the team meets: their combat speeds and names, in one order. */
type Opposition = { speeds: readonly number[]; names: readonly string[] };

/*
 * The enemies a team meets, as the team stands: the one place they are set up,
 * so the reading of a team and the search for its intervals cannot meet two
 * different enemies. Against another player's team — Arena and Siege Battle
 * alike — that is the worst case: the fastest enemy that still cannot take the
 * first turn, level with the team's first mover, since a tie goes to the
 * attacker (`SPEED-TICK-CANONICAL.md` §3.2). Anything faster could win the
 * opening outright; anything slower cuts in no earlier. Under Leo's cap the
 * first mover goes at no more than Leo's own combat speed. It follows the team,
 * so a search re-asks it at every combat speed it tries. On a floor it is
 * every stage's enemies.
 */
function oppositionOf(units: readonly TickUnit[], content: SpeedContent, trace: BattleTrace): Opposition[] {
  if (units.length === 0) return [];
  switch (content.opponent) {
    case 'none': return [];
    case 'worst-case': return [{ speeds: [worstCaseEnemySpeed(units, trace.events[0]?.key)], names: ['Enemy'] }];
    case 'stages': return content.stages.map((stage) => ({ speeds: stage.speeds, names: enemyNamesOf(stage) }));
  }
}

function enemyUnits(opposition: Opposition, opponent: SpeedContent['opponent']): TickUnit[] {
  return opposition.speeds.map((speed, at) => enemyUnit(speed, at, opponent));
}

/* The team's members whose first turn the first enemy turn comes before. Both
   the reading's cut-in and the interval's ask this of the same clock. */
function cutInto(events: readonly TurnEvent[], allyKeys: readonly string[]): string[] {
  const firstEnemy = events.findIndex((event) => event.side === 'enemy');
  if (firstEnemy === -1) return [];
  const movedBefore = new Set(events.slice(0, firstEnemy).map((event) => event.key));
  return allyKeys.filter((key) => !movedBefore.has(key));
}

/* One line-up drawn in full: the trace the Ticks view shows, and what it says. */
function stageReading(allies: readonly TickUnit[], opposition: Opposition, content: SpeedContent): EnemyStageReading {
  const allyKeys = allies.map((unit) => unit.key);
  const settled = (events: readonly TurnEvent[]) => everyoneMoved(allyKeys)(events) && events.some((event) => event.side === 'enemy');
  const trace = simulateBattle([...allies, ...enemyUnits(opposition, content.opponent)], { done: drawnUntil(allyKeys, settled), tick: content.tick });
  const firstEnemy = trace.events.find((event) => event.side === 'enemy');
  const before = firstEnemy ? trace.events.slice(0, trace.events.indexOf(firstEnemy)) : trace.events;
  const last = before.at(-1);
  return {
    enemySpeed: Math.max(...opposition.speeds),
    firstEnemyTick: firstEnemy?.tick ?? Number.POSITIVE_INFINITY,
    follows: last ? { unitId: last.key, turn: before.filter((event) => event.key === last.key).length } : null,
    cutsBefore: cutInto(trace.events, allyKeys),
    trace,
    enemySpeeds: opposition.speeds,
    enemyNames: opposition.names,
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

/* How many turns come before a stage's first enemy turn: the fewer, the worse. */
function firstEnemyAt(stage: EnemyStageReading): number {
  const at = stage.trace.events.findIndex((event) => event.side === 'enemy');
  return at === -1 ? Number.POSITIVE_INFINITY : at;
}

/** What the team faces: the one worst-case enemy against another player's team, each stage on a floor. */
function enemyStages(units: readonly TickUnit[], content: SpeedContent, trace: BattleTrace): EnemyStageReading[] {
  return oppositionOf(units, content, trace).map((opposition) => stageReading(units, opposition, content));
}

/* Each present member as the clock reads it, in the team's order: its leads,
   the totem, and its runes — or the combat speed of its what-if where one is typed. */
function candidatesOf(team: SpeedTeam, monsters: ReadonlyMap<string, GameRecord>, totemPercent: number,
  whatIfs: ReadonlyMap<string, number> | undefined): Candidate[] {
  const content = speedContent(team.content);
  const leaderMonster = team.leaderUnitId === null ? undefined : monsters.get(team.leaderUnitId);
  const leaderSkill = leaderMonster ? speedLeaderSkill(leaderMonster.unit_master_id) : null;
  /* The team's own lead, then those of the battle's other decks, which reach it
     too; one speed lead counts, as one of any attribute does (`leadReaches`). */
  const speedLeads = [leaderSkill, ...team.otherLeaders.map((leader) => speedLeaderSkill(leader.masterId))]
    .filter((lead): lead is SpeedLeaderSkill => lead !== null);
  return team.members.flatMap((member) => {
    const monster = monsters.get(member.unitId);
    if (!monster) return [];
    const parts = monsterSpeedParts(monster);
    const element = elementName(monster.attribute) ?? null;
    const leaderPercent = battleSpeedPercent(speedLeads, content.area, element);
    const base = {
      baseSpeed: parts.baseSpeed,
      swift: parts.swift,
      passiveFlatSpeed: parts.passiveFlatSpeed,
      percentOfBase: totemPercent + leaderPercent + parts.passiveSpeedPercent,
    };
    const imported = combatSpeed({ ...base, runeSpeed: runeSpeedForDisplay(parts.baseSpeed, parts.swift, parts.displaySpeed) });
    return [{
      unitId: member.unitId,
      masterId: String(monster.unit_master_id ?? ''),
      element,
      importedDisplaySpeed: parts.displaySpeed,
      profile: speedSkillProfile(monster),
      speedBuffPercent: speedBuffPotency(parts.speedUpEffect),
      leaderPercent,
      base,
      imported,
      speed: whatIfs?.get(member.unitId) ?? imported,
    }];
  });
}

/* The members by their first turn on the team's own clock. A member that never
   moves within the clock's limit ranks after every one that does. */
function movingOrder(candidates: readonly Candidate[], trace: BattleTrace): string[] {
  const first = firstTurns(trace.events);
  const firstAt = (unitId: string) => {
    const event = first.get(unitId);
    return event === undefined ? Number.POSITIVE_INFINITY : trace.events.indexOf(event);
  };
  return candidates.map((candidate) => candidate.unitId).sort((left, right) => firstAt(left) - firstAt(right));
}

/**
 * The order the team moves in now: its members by their first turns, on the
 * runes the preset engraves and never a what-if, with the preset's own slots as
 * the field position that settles a tie. A team nobody has put in order for is
 * shown in this one, so it follows the runes until the user states another. A
 * member the import does not hold comes last, in its slot's order.
 */
export function gameTurnOrder(team: SpeedTeam, slots: readonly string[], monsters: ReadonlyMap<string, GameRecord>, totemPercent: number): string[] {
  const inSlots = { ...team, members: slots.map((unitId) => ({ unitId, masterId: null })) };
  const candidates = candidatesOf(inSlots, monsters, totemPercent, undefined);
  const trace = teamTrace(candidates.map((candidate) => tickUnit(candidate)), speedContent(team.content).tick, false);
  return [...movingOrder(candidates, trace), ...slots.filter((unitId) => !monsters.has(unitId))];
}

export function readSpeedTeam({ team, monsters, totemPercent, whatIfs, ranges = false }: {
  team: SpeedTeam;
  monsters: ReadonlyMap<string, GameRecord>;
  totemPercent: number;
  /**
   * What-if combat speeds, by unit id. Only the team's overlay passes them;
   * the team stores them, but every other reader judges the runes engraved and
   * leaves this out, so a what-if never reaches a figure outside the overlay.
   */
  whatIfs?: ReadonlyMap<string, number>;
  /**
   * Whether to search each member's tuning range. Only the overlay states a
   * range, and the search runs the clock once per combat speed, so the page,
   * which reads every team at once and shows none, leaves it out: there every
   * `range` is `null` and every `inRange` false.
   */
  ranges?: boolean;
}): TeamReading {
  const content = speedContent(team.content);
  /* What the team is measured against: nothing at all where the user says it
     is not speed tuned, so its places, ranges and verdicts are its own order's. */
  const faced: SpeedContent = team.noSpeedTuning ? { ...content, opponent: 'none' } : content;
  const missingUnitIds = team.members.filter((member) => !monsters.has(member.unitId)).map((member) => member.unitId);
  const leaderMonster = team.leaderUnitId === null ? undefined : monsters.get(team.leaderUnitId);
  const leaderSkill = leaderMonster ? speedLeaderSkill(leaderMonster.unit_master_id) : null;
  const candidates = candidatesOf(team, monsters, totemPercent, whatIfs);
  const units = candidates.map((candidate) => tickUnit(candidate));
  const trace = teamTrace(units, content.tick);
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
  // Every dungeon enemy starts empty and uncapped. Until the first enemy
  // turn they cannot affect the allies, so the fastest enemy is enough to
  // decide whether any stage cuts in. The overlay still draws every stage.
  const fastest = faced.opponent === 'stages' ? Math.max(0, ...enemies.map((stage) => stage.enemySpeed)) : 0;
  const intervalSearch: SpeedIntervalSearch = {
    allies: units,
    minimums: candidates.map(lowestCombat),
    tick: content.tick,
    opponent: faced.opponent,
    dungeonEnemy: fastest > 0 ? enemyUnit(fastest, 0, faced.opponent) : undefined,
  };

  /* The user's order is the authority: a member whose first turn is not the
     one its place asks for is out of place, whichever monster put it there,
     so a first monster moving fourth says so as surely as the three that
     passed it. Only first turns are ranked, as a teammate boosted into a
     second turn moves nobody out of place. A member that never moves within
     the clock's limit ranks after every one that does. */
  const moveOrder = movingOrder(candidates, trace);
  const verdicts: MemberVerdict[] = candidates.map((candidate, index) => {
    const rank = moveOrder.indexOf(candidate.unitId);
    if (rank < index) return { kind: 'early' };
    if (rank > index) return { kind: 'late' };
    const tie = moveOrder.slice(0, rank)
      .find((unitId) => relation(first, trace.events, unitId, candidate.unitId) === 'tie') ?? null;
    return tie !== null ? { kind: 'tie', with: tie } : { kind: 'in-place' };
  });

  const members: MemberReading[] = candidates.map((candidate, index) => {
    const { unitId, masterId, element, speed } = candidate;
    const whatIf = whatIfs?.has(unitId) ?? false;
    const verdict = verdicts[index];
    return {
      unitId,
      wantedPosition: index + 1,
      masterId,
      element,
      baseSpeed: candidate.base.baseSpeed,
      swift: candidate.base.swift,
      importedCombatSpeed: candidate.imported,
      combatSpeed: speed,
      whatIf,
      lowestCombatSpeed: intervalSearch.minimums[index],
      displaySpeed: whatIf ? displaySpeedFor(candidate, speed) : candidate.importedDisplaySpeed,
      leaderPercent: candidate.leaderPercent,
      profile: candidate.profile,
      turnPositions: opening.flatMap((event, at) => event.key === unitId ? [at + 1] : []),
      firstTurnTick: first.get(unitId)?.tick ?? Number.POSITIVE_INFINITY,
      firstAllyBoosts: (first.get(unitId)?.allyBoosts ?? []).map(({ key, amount }) => ({ unitId: key, amount })),
      verdict,
      cutInAt: enemies.flatMap((stage, at) => stage.cutsBefore.includes(unitId) ? [at + 1] : []),
      range: null,
      inRange: false,
    };
  });

  const reading: TeamReading = {
    team,
    content,
    members,
    missingUnitIds,
    leader: team.leaderUnitId === null ? null : { unitId: team.leaderUnitId, skill: leaderSkill },
    trace,
    perfect: members.length > 0 && members.every((member) => member.verdict.kind === 'in-place' && member.cutInAt.length === 0),
    enemies,
    worstStage,
    intervalSearch,
  };
  return ranges ? withSpeedIntervals(reading, readSpeedIntervals(intervalSearch)) : reading;
}

export function withSpeedIntervals(reading: TeamReading, ranges: readonly (CombatSpeedInterval | null)[]): TeamReading {
  return {
    ...reading,
    members: reading.members.map((member, index) => {
      const range = ranges[index] ?? null;
      const speed = member.combatSpeed;
      return { ...member, range, inRange: range !== null && speed >= range.minimum && (range.maximum === null || speed <= range.maximum) };
    }),
  };
}

/** A field-position tie is unresolved, but only a first turn out of its place is out of place. An enemy that gets in is counted on its own. */
export function outOfPlaceCount(reading: TeamReading): number {
  return reading.members.filter((member) => member.verdict.kind === 'early' || member.verdict.kind === 'late').length;
}

/** What an interval asks for, in the words a member's verdict line uses, or `null` where no combat speed of that monster alone puts it right: then the line says nothing more. */
export function combatSpeedIntervalText(interval: CombatSpeedInterval | null, general: GeneralSettings): string | null {
  if (interval === null) return null;
  const minimum = formatNumber(interval.minimum, general);
  if (interval.maximum === null) return `needs ${minimum}+ combat speed`;
  if (interval.maximum === interval.minimum) return `needs exactly ${minimum} combat speed`;
  return `needs ${minimum}–${formatNumber(interval.maximum, general)} combat speed`;
}
