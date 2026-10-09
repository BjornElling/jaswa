/**
 * The game's turn-order rules, and the only place JASWA states them.
 *
 * Everything Speed Tuning shows — an arena speed, a dungeon speed, who moves
 * when, an interval of display speeds — is computed here or from what this
 * module returns. `docs/SPEED-TICK-CANONICAL.md` is the written form of the same
 * rules, with their sources and the points the sources leave open; a rule
 * changed here is changed there in the same commit.
 *
 * Three speeds, never confused (§1 of that document):
 * - **display speed** — base speed plus the rune bonus, the figure the game's
 *   monster screen and every other JASWA page show. Swift's 25 % is inside it,
 *   rounded up to a whole number.
 * - **arena speed** and **dungeon speed** — the combat speed in that content:
 *   base speed times totem, leader and Swift percentages, plus flat rune speed,
 *   rounded up once over the whole sum. Swift is exact here, not rounded.
 *
 * Attack bars are reported in hundredths of a percent — a turn is 10,000 — and
 * every amount a skill names is in the same unit. The clock itself counts a
 * hundred times finer, because a speed buff multiplies a whole combat speed by
 * 1.3 and leaves a tenth over (§2): a tick is `7 × speed × (100 + buff)` there,
 * and no comparison ever meets a floating-point remainder.
 */

/** The share of combat speed a tick adds to the attack bar, in hundredths of a percent per speed point. */
export const attackBarPerSpeedPerTick = 7;
/** A full attack bar: 100 %, in hundredths of a percent. */
export const fullAttackBar = 10_000;
/**
 * The speed buff's bonus, in percent of the rounded combat speed. A speed-up
 * effect would make it ⌊30 · (1 + effect)⌋; nothing JASWA reads carries one.
 */
export const speedBuffPercent = 30;
/* The clock's own unit: a hundredth of the reported one, so the buff's percent
   fits inside a whole number. */
const clockScale = 100;
/** Swift's four-piece bonus, as a percentage of base speed. */
export const swiftPercent = 25;
/** The last Sky Tribe Totem level. */
export const totemMaximumLevel = 20;

/**
 * Sky Tribe Totem's bonus by level, in percent of base speed — the in-game
 * upgrade table (`SPEED-TICK-CANONICAL.md` §2). Index 0 is "not built".
 */
export const totemPercentByLevel: readonly number[] = [
  0, 1, 2, 2.5, 3, 4, 5, 5.5, 6, 7, 8, 8.5, 9, 10, 11, 11.5, 12, 13, 14, 14.5, 15,
];

export type SpeedArea = 'arena' | 'dungeon';

/** Where a leader skill counts. An element is a second, separate limit. */
export type LeaderArea = 'General' | 'Arena' | 'Dungeon' | 'Guild';
export type SpeedLeaderSkill = { percent: number; area: LeaderArea; element: string | null };

/**
 * The leader's speed percentage for one member, or 0 where it does not reach.
 *
 * A General lead counts everywhere; an Arena or Dungeon lead only in its own
 * content; a Guild lead in neither of the areas this page tunes. A lead that
 * names an element counts only on monsters of that element.
 */
export function leaderSpeedPercent(leader: SpeedLeaderSkill | null, area: SpeedArea, memberElement: string | null): number {
  if (leader === null || !leaderAreaReaches(leader.area, area)) return 0;
  return leader.element === null || leader.element === memberElement ? leader.percent : 0;
}

/** Whether a lead of any attribute counts in this content at all. A lead
    limited to an element does, on the members of its element. */
export function leaderAreaReaches(leaderArea: LeaderArea, area: SpeedArea): boolean {
  switch (leaderArea) {
    case 'General': return true;
    case 'Arena': return area === 'arena';
    case 'Dungeon': return area === 'dungeon';
    case 'Guild': return false;
  }
}

/** What Swift adds to display speed: 25 % of base, rounded up as the monster screen rounds it. */
export function displayedSwiftBonus(baseSpeed: number): number {
  return Math.ceil(baseSpeed * swiftPercent / 100);
}

/** Display speed from its parts: base, the displayed Swift bonus, and flat rune speed. */
export function displaySpeed(baseSpeed: number, swift: boolean, runeSpeed: number): number {
  return baseSpeed + (swift ? displayedSwiftBonus(baseSpeed) : 0) + runeSpeed;
}

/**
 * The flat rune speed behind a display speed. A what-if display speed is
 * turned back into rune speed here, so an experiment changes the runes and
 * nothing else — base speed, Swift and every percentage stay the monster's own.
 */
export function runeSpeedForDisplay(baseSpeed: number, swift: boolean, shownDisplaySpeed: number): number {
  return shownDisplaySpeed - baseSpeed - (swift ? displayedSwiftBonus(baseSpeed) : 0);
}

/** One monster's speed as the battle reads it, before rounding. */
export type SpeedSheet = {
  baseSpeed: number;
  runeSpeed: number;
  swift: boolean;
  /** Totem plus leader, in percent of base speed. May be fractional (2.5 %). */
  percentOfBase: number;
};

/*
 * The unrounded combat speed, times 1,000: B·(1,000 + 10·(totem + leader) +
 * 250·Swift) + 1,000·b. Totem steps are half percents, so ten times a percent
 * is always whole and the product is an exact integer.
 */
function combatSpeedThousandths(sheet: SpeedSheet): number {
  const percentTenths = Math.round(sheet.percentOfBase * 10);
  return sheet.baseSpeed * (1_000 + percentTenths + (sheet.swift ? swiftPercent * 10 : 0)) + 1_000 * sheet.runeSpeed;
}

/**
 * Combat speed — arena speed or dungeon speed, depending on the percentages
 * the sheet was given: ⌈B·(1 + t + l + s) + b⌉, one rounding over the whole.
 */
export function combatSpeed(sheet: SpeedSheet): number {
  return Math.ceil(combatSpeedThousandths(sheet) / 1_000);
}

/** How many ticks a unit starting from an empty bar needs for its first turn. */
export function ticksToFirstTurn(speed: number): number {
  return Math.ceil(fullAttackBar / (attackBarPerSpeedPerTick * speed));
}

/**
 * What a monster does to the bars when it takes a turn. Swarfarm's skill data
 * is translated into these by `speed-skills.ts`; the tick loop below reads only
 * these, so the rules of a turn live in one place.
 */
export type TurnEffect =
  /**
   * Every other ally's attack bar, in hundredths of a percent. `skipsSimilar`
   * is Verdehile's clause: the boost passes over allies that carry the same
   * kind of passive themselves.
   */
  | { kind: 'allies-attack-bar'; amount: number; skipsSimilar: boolean }
  /** One other ally's attack bar, chosen by `target`. */
  | { kind: 'ally-attack-bar'; amount: number; target: AllyTarget }
  /** The acting monster's own bar, after its turn has emptied it. */
  | { kind: 'self-attack-bar'; amount: number }
  /** A speed buff for a number of the recipient's own turns. */
  | { kind: 'allies-speed-buff'; turns: number }
  | { kind: 'ally-speed-buff'; turns: number; target: AllyTarget }
  | { kind: 'self-speed-buff'; turns: number };

/**
 * Which ally a one-ally effect lands on (`SPEED-TICK-CANONICAL.md` §4): the
 * lowest attack bar, which is where the game's auto battle sends it, unless
 * the skill's own words name the highest.
 */
export type AllyTarget = 'lowest-attack-bar' | 'highest-attack-bar';

export type TickUnit = {
  key: string;
  side: 'ally' | 'enemy';
  /** Combat speed, rounded (§2). A speed buff multiplies it inside the clock. */
  speed: number;
  /** Applied on every turn the unit takes. */
  effects: readonly TurnEffect[];
  /** Carries a team attack-bar passive, so a `skipsSimilar` boost passes it over. */
  similarBoostPassive?: boolean;
  /** Leo's Eye of the Storm: every other unit on the field moves no faster than this one. */
  capsOthersSpeed?: boolean;
  /** Out of the cap's reach, as a boss is. */
  exemptFromCap?: boolean;
};

export type TurnEvent = {
  tick: number;
  key: string;
  side: 'ally' | 'enemy';
  /** Which turn of this unit it is, from 1. */
  turn: number;
  /** The unit's bar when the turn began, in hundredths of a percent; a buffed fill may leave a fraction. */
  attackBar: number;
  /**
   * The units that had exactly the same bar and waited. The game settles that
   * by field position, which this page cannot see.
   */
  tiedWith: string[];
  /** Every one-ally attack-bar boost this turn gave, in hundredths of a percent. */
  allyBoosts: Array<{ key: string; amount: number }>;
};

export type TickSnapshot = {
  tick: number;
  /** Every unit's bar after the tick's fill and before anyone moves, by key. */
  bars: Record<string, number>;
  /** The unit whose turn this tick produced, if any. */
  mover: string | null;
};

export type BattleTrace = { events: TurnEvent[]; snapshots: TickSnapshot[] };

/**
 * Runs the attack-bar clock (`SPEED-TICK-CANONICAL.md` §3):
 *
 * 1. Every bar starts empty.
 * 2. A tick adds 7 % × current combat speed to every bar — under a speed buff
 *    the rounded speed × 1.3, and under Leo's cap no more than Leo's own.
 * 3. If any bar is at 100 % or more, exactly one unit moves — the fullest. Its
 *    bar empties (overflow is lost) and its turn's effects apply. Then the next
 *    tick runs, even if another bar is already past 100 %.
 *
 * An exact tie on the bar between the user's team and the enemy goes to the
 * team: it attacks, and the attacker moves first on a tie (`SPEED-TICK-CANONICAL.md`
 * §3.2). Between allies the game settles a tie by field position, which this
 * page cannot see, so it goes to the one listed first and the event says who
 * it was `tiedWith`, so the page can say the order hangs on where they stand.
 *
 * `order` lists every unit key, allies in the user's intended order, and sets
 * that last resort. The loop stops when `done` says so or at `tickLimit`.
 * `snapshots: false` leaves the per-tick bars out: a search that only reads
 * the order of turns runs the clock hundreds of times, and copying every bar
 * on every tick was most of its cost. The turns are the same either way.
 */
export function simulateBattle(units: readonly TickUnit[], options: {
  done: (events: readonly TurnEvent[]) => boolean;
  tickLimit?: number;
  snapshots?: boolean;
}): BattleTrace {
  const recording = options.snapshots ?? true;
  const tickLimit = options.tickLimit ?? 2_000;
  const bars = new Map(units.map((unit) => [unit.key, 0]));
  const buffTurns = new Map(units.map((unit) => [unit.key, 0]));
  const turns = new Map(units.map((unit) => [unit.key, 0]));
  const rank = new Map(units.map((unit, index) => [unit.key, (unit.side === 'ally' ? 0 : 1_000) + index]));
  const events: TurnEvent[] = [];
  const snapshots: TickSnapshot[] = [];

  const leos = units.filter((unit) => unit.capsOthersSpeed);
  /* Combat speed in hundredths, buff included: a whole number however the
     buff falls. Under Leo's cap every other unit is held to the slowest Leo. */
  const ownSpeed = (unit: TickUnit) => unit.speed * (100 + ((buffTurns.get(unit.key) ?? 0) > 0 ? speedBuffPercent : 0));
  const currentSpeed = (unit: TickUnit) => unit.capsOthersSpeed || unit.exemptFromCap || leos.length === 0
    ? ownSpeed(unit)
    : Math.min(ownSpeed(unit), ...leos.map(ownSpeed));
  const fullBar = fullAttackBar * clockScale;

  for (let tick = 1; tick <= tickLimit && !options.done(events); tick += 1) {
    const fills = units.map((unit) => attackBarPerSpeedPerTick * currentSpeed(unit));
    units.forEach((unit, at) => bars.set(unit.key, (bars.get(unit.key) ?? 0) + fills[at]));
    const ready = units.filter((unit) => (bars.get(unit.key) ?? 0) >= fullBar);
    const snapshot: TickSnapshot | null = recording ? {
      tick,
      bars: Object.fromEntries([...bars].map(([key, bar]) => [key, bar / clockScale])),
      mover: null,
    } : null;
    if (snapshot) snapshots.push(snapshot);
    if (ready.length === 0) continue;

    const fullest = Math.max(...ready.map((unit) => bars.get(unit.key) ?? 0));
    const contenders = ready.filter((unit) => bars.get(unit.key) === fullest)
      .sort((left, right) => (rank.get(left.key) ?? 0) - (rank.get(right.key) ?? 0));
    const mover = contenders[0];
    const turn = (turns.get(mover.key) ?? 0) + 1;
    turns.set(mover.key, turn);
    const allyBoosts: TurnEvent['allyBoosts'] = [];
    events.push({ tick, key: mover.key, side: mover.side, turn, attackBar: fullest / clockScale, tiedWith: contenders.slice(1).map((unit) => unit.key), allyBoosts });
    if (snapshot) snapshot.mover = mover.key;

    /* The bar empties as the turn is taken, so an effect that fills "all
       allies" does not reach the one casting it; a self effect is written for
       the caster and lands after the reset. */
    bars.set(mover.key, 0);
    const hadBuff = (buffTurns.get(mover.key) ?? 0) > 0;
    let refreshedOwnBuff = false;
    const allies = units.filter((unit) => unit.side === mover.side && unit.key !== mover.key);
    /* A one-ally target is chosen from the bars as the turn begins, so a skill
       that fills a bar and grants a buff gives both to the same ally rather
       than letting its own boost send the buff elsewhere. Level bars go to the
       one listed first. */
    const byBar = [...allies].sort((left, right) => (bars.get(left.key) ?? 0) - (bars.get(right.key) ?? 0)
      || (rank.get(left.key) ?? 0) - (rank.get(right.key) ?? 0));
    const lowestBar = byBar[0];
    const highestBar = [...allies].sort((left, right) => (bars.get(right.key) ?? 0) - (bars.get(left.key) ?? 0)
      || (rank.get(left.key) ?? 0) - (rank.get(right.key) ?? 0))[0];
    const targetOf = (target: AllyTarget) => target === 'highest-attack-bar' ? highestBar : lowestBar;
    const grantBuff = (key: string, count: number) => {
      buffTurns.set(key, Math.max(buffTurns.get(key) ?? 0, count));
      if (key === mover.key) refreshedOwnBuff = true;
    };
    const boost = (key: string, amount: number) => bars.set(key, (bars.get(key) ?? 0) + amount * clockScale);
    for (const effect of mover.effects) {
      switch (effect.kind) {
        case 'allies-attack-bar':
          for (const ally of allies) if (!(effect.skipsSimilar && ally.similarBoostPassive)) boost(ally.key, effect.amount);
          break;
        case 'ally-attack-bar': {
          const ally = targetOf(effect.target);
          if (ally) {
            boost(ally.key, effect.amount);
            allyBoosts.push({ key: ally.key, amount: effect.amount });
          }
          break;
        }
        case 'self-attack-bar':
          boost(mover.key, effect.amount);
          break;
        case 'allies-speed-buff':
          grantBuff(mover.key, effect.turns);
          for (const ally of allies) grantBuff(ally.key, effect.turns);
          break;
        case 'ally-speed-buff': {
          const ally = targetOf(effect.target);
          if (ally) grantBuff(ally.key, effect.turns);
          break;
        }
        case 'self-speed-buff':
          grantBuff(mover.key, effect.turns);
          break;
      }
    }
    /* A buff counts down at the end of its holder's own turn — but not the
       turn that granted it, which is the one it was cast in. */
    if (hadBuff && !refreshedOwnBuff) buffTurns.set(mover.key, (buffTurns.get(mover.key) ?? 0) - 1);
  }
  return { events, snapshots };
}

/** Stop once every listed unit has taken its first turn. */
export function everyoneMoved(keys: readonly string[]): (events: readonly TurnEvent[]) => boolean {
  return (events) => keys.every((key) => events.some((event) => event.key === key));
}
