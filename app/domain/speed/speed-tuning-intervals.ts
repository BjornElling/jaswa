import { whatIfCombatSpeedMaximum } from '../profiles/speed-tuning-preferences';
import type { SpeedOpponent } from './speed-contents';
import { simulateBattle } from './speed-tick';
import type { TickRule, TickUnit, TurnEvent } from './speed-tick';

/** A range of combat speeds, open above when its maximum is null. */
export type CombatSpeedInterval = { minimum: number; maximum: number | null };

export type SpeedIntervalSearch = {
  allies: readonly TickUnit[];
  minimums: readonly number[];
  tick: TickRule;
  opponent: SpeedOpponent;
  dungeonEnemy?: TickUnit;
};

export function firstTurns(events: readonly TurnEvent[]): Map<string, TurnEvent> {
  const first = new Map<string, TurnEvent>();
  for (const event of events) if (!first.has(event.key)) first.set(event.key, event);
  return first;
}

/* A unit that never moved inside the tick limit moves after every unit that
   did. Only pick order can leave the relation tied. */
export function relation(first: Map<string, TurnEvent>, events: readonly TurnEvent[], earlier: string, later: string): 'before' | 'tie' | 'after' {
  const a = first.get(earlier);
  const b = first.get(later);
  if (!a) return 'after';
  if (!b) return 'before';
  const aIndex = events.indexOf(a);
  const bIndex = events.indexOf(b);
  if (aIndex > bIndex) return 'after';
  return a.tiedWith.includes(later) ? 'tie' : 'before';
}

/* Leo's cap spares a boss, and a dungeon stage does not say which of its
   enemies is one, so on a stage every enemy is read as uncapped: the
   pessimistic reading. Another player's team has no bosses. */
export function enemyUnit(speed: number, at: number, opponent: SpeedOpponent): TickUnit {
  return {
    key: `enemy-${at + 1}`, side: 'enemy', speed, firstTurn: [], laterTurns: [], exemptFromCap: opponent === 'stages',
  };
}

/** The worst-case opponent follows the first mover, limited by Leo's cap. */
export function worstCaseEnemySpeed(units: readonly TickUnit[], opener: string | undefined): number {
  const leoSpeeds = units.filter((unit) => unit.capsOthersSpeed).map((unit) => unit.speed);
  return Math.min(units.find((unit) => unit.key === opener)?.speed ?? 1, ...leoSpeeds);
}

/* Whether the enemy gets a turn before `key`'s first. The clock
   stops at the first of the two, as nothing after it changes the answer. */
function enemyGetsInBefore(allies: readonly TickUnit[], enemy: TickUnit, tick: TickRule, key: string): boolean {
  const { events } = simulateBattle([...allies, enemy], {
    done: (moved) => {
      const last = moved.at(-1);
      return last?.key === key || last?.side === 'enemy';
    },
    snapshots: false,
    tick,
  });
  return events.at(-1)?.side === 'enemy';
}

/*
 * The combat speeds at which the member at `index` has its first turn
 * strictly after the member placed just above it and strictly before the
 * member placed just below it, with no enemy turn before it, every other
 * member at the combat speed it is read at — its what-if where one is typed.
 * A tie with either neighbour counts against it: no order may hang on pick
 * order the page cannot see.
 *
 * A boost aimed at the lowest bar can leave more than one stretch that fits.
 * Try speeds in order of distance from the current speed, lower first on a
 * tie, then find both edges of the first stretch reached.
 */
function tuningRange({ allies, minimums, tick, opponent, dungeonEnemy }: SpeedIntervalSearch, index: number): CombatSpeedInterval | null {
  const lowest = minimums[index];
  const member = allies[index];
  const self = member.key;
  const above = allies[index - 1]?.key;
  const below = allies[index + 1]?.key;
  const units = [...allies];
  const fits = (value: number) => {
    units[index] = { ...member, speed: value };
    if (dungeonEnemy && enemyGetsInBefore(units, dungeonEnemy, tick, self)) return false;
    // Only the two neighbours can change the answer. If self ties with the
    // lower neighbour, keep going so the trace also records that neighbour's turn.
    const trace = simulateBattle(units, {
      done: (events) => {
        const turn = events.at(-1);
        return turn !== undefined && (turn.key === below
          || (turn.key === self && turn.turn === 1 && (below === undefined || !turn.tiedWith.includes(below))));
      },
      snapshots: false,
      tick,
    });
    const first = firstTurns(trace.events);
    if (above !== undefined && relation(first, trace.events, above, self) !== 'before') return false;
    if (below !== undefined && relation(first, trace.events, self, below) !== 'before') return false;
    if (opponent !== 'worst-case') return true;
    const enemy = enemyUnit(worstCaseEnemySpeed(units, trace.events[0]?.key), 0, opponent);
    return !enemyGetsInBefore(units, enemy, tick, self);
  };

  const highest = whatIfCombatSpeedMaximum;
  if (lowest > highest) return null;
  const current = Math.min(highest, Math.max(lowest, member.speed));
  let lower = current;
  let upper = current + 1;
  let nearest: number | undefined;
  while (lower >= lowest || upper <= highest) {
    const value = lower >= lowest && (upper > highest || current - lower <= upper - current) ? lower-- : upper++;
    if (fits(value)) {
      nearest = value;
      break;
    }
  }
  if (nearest === undefined) return null;
  let minimum = nearest;
  while (minimum > lowest && fits(minimum - 1)) minimum -= 1;
  for (let value = nearest + 1; value <= highest; value += 1) {
    if (!fits(value)) return { minimum, maximum: value - 1 };
  }
  return { minimum, maximum: null };
}

export function readSpeedIntervals(search: SpeedIntervalSearch): (CombatSpeedInterval | null)[] {
  return search.allies.map((_, index) => tuningRange(search, index));
}
