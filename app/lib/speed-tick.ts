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
 * thousand times finer, because a speed buff multiplies a whole combat speed by
 * a whole percent and a raid tick is a half percent (§2, §3): a tick is
 * `70 × speed × (100 + buff)` there, `45 ×` in a raid, and no comparison ever
 * meets a floating-point remainder.
 */

/**
 * How big a tick is where a team fights. It is a property of the content, not
 * of the game: a raid boss's fight ticks at 4.5 % of combat speed, everything
 * else Speed Tuning reads at 7 % (Ellia's Wiki, *Attack Bar*,
 * elliabot.neocities.org/game_mechanics/attack_bar/, which gives 7 %, raids
 * 4.5 % and RTA 1.5 %). SWCalc gives no value. RTA is no preset, so it has no
 * rule here.
 */
export type TickRule = 'standard' | 'raid';

/** What one tick adds to the attack bar, in percent per point of combat speed. */
export const tickPercentOf: Readonly<Record<TickRule, number>> = { standard: 7, raid: 4.5 };

/* The tick in tenths of a percent per speed point, so 4.5 % is a whole 45. */
const tickTenths = (rule: TickRule): number => Math.round(tickPercentOf[rule] * 10);
/** A full attack bar: 100 %, in hundredths of a percent. */
export const fullAttackBar = 10_000;
/** The speed buff's bonus, in percent of the rounded combat speed, before any SPD UP Effect. */
export const speedBuffPercent = 30;

/**
 * The speed buff's bonus on one recipient: ⌊30 · (1 + SPD UP Effect)⌋ %, the
 * effect being the sum of that monster's own artifact lines — the recipient's,
 * never the caster's (`SPEED-TICK-CANONICAL.md` §2). Truncated, so +24 % makes
 * 37 % and not 37.2 %. Counted in hundredths of a percent, so no fraction of
 * an artifact line meets a floating-point remainder.
 */
export function speedBuffPotency(speedUpEffectPercent: number): number {
  return Math.floor(speedBuffPercent * (10_000 + Math.round(speedUpEffectPercent * 100)) / 10_000);
}
/* The clock's own unit: a thousandth of the reported one, so the buff's percent
   and a raid tick's half percent both fit inside a whole number. */
const clockScale = 1_000;
/** Swift's four-piece bonus, as a percentage of base speed. */
export const swiftPercent = 25;
/** The last Sky Tribe Totem level. */
export const totemMaximumLevel = 20;

/**
 * Sky Tribe Totem's bonus by level, in percent of base speed — the in-game
 * upgrade table (`SPEED-TICK-CANONICAL.md` §2.1). Index 0 is "not built".
 */
export const totemPercentByLevel: readonly number[] = [
  0, 1, 2, 2.5, 3, 4, 5, 5.5, 6, 7, 8, 8.5, 9, 10, 11, 11.5, 12, 13, 14, 14.5, 15,
];

/**
 * Where a team fights, as far as a leader skill is concerned. `unnamed` is a
 * preset whose content the export does not say: only a lead that counts
 * everywhere is sure to count there. `raid` is Rift Raid and the Dimension Raid
 * phases, which count no Arena, Dungeon or Guild lead (the user's decision of
 * October 19, 2026, after XelNecra's Rift of Worlds guide on
 * summonerswarskyarena.info, January 4, 2016: "only leader-skills without area
 * restriction will work … One-Element-Leaders however will work").
 */
export type SpeedArea = 'arena' | 'dungeon' | 'guild' | 'raid' | 'unnamed';

/** Where a leader skill counts. An element is a second, separate limit. */
export type LeaderArea = 'General' | 'Arena' | 'Dungeon' | 'Guild';
export type SpeedLeaderSkill = { percent: number; area: LeaderArea; element: string | null };

/**
 * The leader's speed percentage for one member, or 0 where it does not reach.
 *
 * A General lead counts everywhere; an Arena, Dungeon or Guild lead only in its
 * own area, and none of them in a raid or where the content is not yet named. A lead that
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
    case 'Guild': return area === 'guild';
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
export function ticksToFirstTurn(speed: number, rule: TickRule = 'standard'): number {
  return Math.ceil(fullAttackBar * 10 / (tickTenths(rule) * speed));
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
  /**
   * Combat speed, rounded (§2): the start-of-battle figure, with runes, totem,
   * leader and Swift and with no buff or Leo cap. A buff and the cap act on it
   * inside the clock, and it is this unmoved figure that settles a tie.
   */
  speed: number;
  /** What a speed buff adds on this unit, in percent (`speedBuffPotency`); 30 where omitted. */
  speedBuffPercent?: number;
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
   * The units that had exactly the same bar and the same start-of-battle
   * combat speed, and waited. Only pick order settles that, which this page
   * cannot see; a tie a faster unit wins is no tie here.
   */
  tiedWith: string[];
  /** Every one-ally attack-bar boost this turn gave, in hundredths of a percent. */
  allyBoosts: Array<{ key: string; amount: number }>;
};

export type TickSnapshot = {
  tick: number;
  /** Every unit's bar after the tick's fill and before anyone moves, by key. */
  bars: Record<string, number>;
  /** The units whose fill this tick ran under a speed buff. */
  buffed: string[];
  /** The unit whose turn this tick produced, if any. */
  mover: string | null;
  /**
   * Every bar once that turn is over — the mover's emptied, then every boost
   * landed — or `null` on a tick without a turn. A boost is the difference
   * from `bars`, so a view can draw it as the jump it is.
   */
  after: Record<string, number> | null;
};

export type BattleTrace = { events: TurnEvent[]; snapshots: TickSnapshot[] };

/**
 * Runs the attack-bar clock (`SPEED-TICK-CANONICAL.md` §3):
 *
 * 1. Every bar starts empty.
 * 2. A tick adds the content's tick (`tickPercentOf`) × current combat speed to
 *    every bar — under a speed buff the rounded speed × (1 + potency), and under
 *    Leo's cap no more than Leo's own.
 * 3. If any bar is at 100 % or more, exactly one unit moves — the fullest. Its
 *    bar empties (overflow is lost) and its turn's effects apply. Then the next
 *    tick runs, even if another bar is already past 100 %.
 *
 * An exact tie on the bar goes to the higher combat speed at the start of
 * battle — SWCalc, *Attack Bar ties*: "monsters with the same highest attack
 * bar will move in order of their combat speed at the start of battle. If that
 * also ties, monsters picked first move first." That is `speed` as given, with
 * no buff and no Leo cap, so under Leo the faster ally still wins its tie (Ellia:
 * "Under Leo, ties are broken by original SPD instead of placement"). At equal
 * start speed the user's team goes before the enemy, as the attacker
 * (`SPEED-TICK-CANONICAL.md` §3.2), and between allies the one listed first —
 * the pick order the page cannot see, so the event says who it was `tiedWith`.
 *
 * `units` lists allies in the user's intended order, which is that last resort.
 * The loop stops when `done` says so or at `tickLimit`.
 * `snapshots: false` leaves the per-tick bars out: a search that only reads
 * the order of turns runs the clock hundreds of times, and copying every bar
 * on every tick was most of its cost. The turns are the same either way.
 */
export function simulateBattle(units: readonly TickUnit[], options: {
  done: (events: readonly TurnEvent[]) => boolean;
  tickLimit?: number;
  snapshots?: boolean;
  /** The content's tick; `standard` where omitted. */
  tick?: TickRule;
}): BattleTrace {
  const recording = options.snapshots ?? true;
  const tickRate = tickTenths(options.tick ?? 'standard');
  const tickLimit = options.tickLimit ?? 2_000;
  const bars = new Map(units.map((unit) => [unit.key, 0]));
  const buffTurns = new Map(units.map((unit) => [unit.key, 0]));
  const turns = new Map(units.map((unit) => [unit.key, 0]));
  const rank = new Map(units.map((unit, index) => [unit.key, (unit.side === 'ally' ? 0 : 1_000) + index]));
  const events: TurnEvent[] = [];
  const snapshots: TickSnapshot[] = [];

  const leos = units.filter((unit) => unit.capsOthersSpeed);
  /* Combat speed in hundredths, buff included: a whole number however the
     buff falls. Under Leo's cap every other unit is held to the slowest Leo.
     Times the tick in tenths of a percent, a fill is in the clock's thousandths. */
  const buffedNow = (unit: TickUnit) => (buffTurns.get(unit.key) ?? 0) > 0;
  const ownSpeed = (unit: TickUnit) => unit.speed * (100 + (buffedNow(unit) ? unit.speedBuffPercent ?? speedBuffPercent : 0));
  const currentSpeed = (unit: TickUnit) => unit.capsOthersSpeed || unit.exemptFromCap || leos.length === 0
    ? ownSpeed(unit)
    : Math.min(ownSpeed(unit), ...leos.map(ownSpeed));
  const fullBar = fullAttackBar * clockScale;
  const barsNow = () => Object.fromEntries([...bars].map(([key, bar]) => [key, bar / clockScale]));

  for (let tick = 1; tick <= tickLimit && !options.done(events); tick += 1) {
    const fills = units.map((unit) => tickRate * currentSpeed(unit));
    units.forEach((unit, at) => bars.set(unit.key, (bars.get(unit.key) ?? 0) + fills[at]));
    const ready = units.filter((unit) => (bars.get(unit.key) ?? 0) >= fullBar);
    const snapshot: TickSnapshot | null = recording ? {
      tick,
      bars: barsNow(),
      buffed: units.filter(buffedNow).map((unit) => unit.key),
      mover: null,
      after: null,
    } : null;
    if (snapshot) snapshots.push(snapshot);
    if (ready.length === 0) continue;

    const fullest = Math.max(...ready.map((unit) => bars.get(unit.key) ?? 0));
    const contenders = ready.filter((unit) => bars.get(unit.key) === fullest)
      .sort((left, right) => right.speed - left.speed || (rank.get(left.key) ?? 0) - (rank.get(right.key) ?? 0));
    const mover = contenders[0];
    const tiedWith = contenders.slice(1).filter((unit) => unit.speed === mover.speed).map((unit) => unit.key);
    const turn = (turns.get(mover.key) ?? 0) + 1;
    turns.set(mover.key, turn);
    const allyBoosts: TurnEvent['allyBoosts'] = [];
    events.push({ tick, key: mover.key, side: mover.side, turn, attackBar: fullest / clockScale, tiedWith, allyBoosts });
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
    if (snapshot) snapshot.after = barsNow();
  }
  return { events, snapshots };
}

/** Stop once every listed unit has taken its first turn. */
export function everyoneMoved(keys: readonly string[]): (events: readonly TurnEvent[]) => boolean {
  return (events) => keys.every((key) => events.some((event) => event.key === key));
}
