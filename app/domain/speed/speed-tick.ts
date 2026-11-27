/**
 * The game's turn-order rules, and the only place JASWA states them.
 *
 * Everything Speed Tuning shows — a combat speed, who moves when, an interval
 * of combat speeds — is computed here or from what this
 * module returns. `docs/SPEED-TICK-CANONICAL.md` is the written form of the same
 * rules, with their sources and the points the sources leave open; a rule
 * changed here is changed there in the same commit.
 *
 * Two speeds, never confused (§1 of that document):
 * - **display speed** — base speed plus the rune bonus, the figure the game's
 *   monster screen and every other JASWA page show. Swift's 25 % is inside it,
 *   rounded up to a whole number.
 * - **combat speed** — the speed in a fight, whatever the content: base speed
 *   times totem, leader and Swift percentages, plus flat rune speed, rounded up
 *   once over the whole sum. Swift is exact here, not rounded. Which leads
 *   count depends on where the team fights; the name does not.
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
  return battleSpeedPercent(leader === null ? [] : [leader], area, memberElement);
}

/** The speed percentage the speed leads of a battle give one member: those that count (`leadReaches`), summed. */
export function battleSpeedPercent(leaders: readonly SpeedLeaderSkill[], area: SpeedArea, memberElement: string | null): number {
  const reaches = leadReaches(leaders.map((leader) => ({ ...leader, attribute: 'Attack Speed' })), area, memberElement);
  return leaders.reduce((sum, leader, at) => sum + (reaches[at] === 'counts' ? leader.percent : 0), 0);
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

/**
 * Why a lead does or does not reach one member: it counts, its area does not
 * reach this content, it names another element, or a larger lead of the same
 * attribute for the same monsters counts instead.
 */
export type LeadReach = 'counts' | 'area' | 'element' | 'outranked';

/**
 * Which of the leads a battle runs reach one member — one lead in most
 * contents, one per deck where several decks fight together. Leads of
 * different attributes add up. Two of one attribute for the same monsters —
 * both for every monster, or both for one element — do not: the largest
 * counts, the first of equals. Two of one attribute for different monsters —
 * one for every monster, one for an element — add up on a monster of that
 * element (the developer, October 21, 2026, after Fandom; XelNecra's guide in
 * §2.2: "if two players decide to bring a speed leader, only one of the leader
 * abilities will come into effect"). Answers in the order the leads are given.
 */
export function leadReaches(leads: ReadonlyArray<{ attribute: string; percent: number; area: LeaderArea; element: string | null }>,
  area: SpeedArea, memberElement: string | null): LeadReach[] {
  const reaches: LeadReach[] = leads.map((lead) => !leaderAreaReaches(lead.area, area) ? 'area'
    : lead.element !== null && lead.element !== memberElement ? 'element' : 'counts');
  leads.forEach((lead, at) => {
    if (reaches[at] !== 'counts') return;
    const stronger = leads.findIndex((other, index) => index !== at && reaches[index] === 'counts'
      && other.attribute === lead.attribute && other.element === lead.element
      && (other.percent > lead.percent || (other.percent === lead.percent && index < at)));
    if (stronger >= 0) reaches[at] = 'outranked';
  });
  return reaches;
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
 * The flat rune speed behind a display speed: what puts a display speed beside
 * a combat speed, base speed, Swift and every percentage staying the monster's own.
 */
export function runeSpeedForDisplay(baseSpeed: number, swift: boolean, shownDisplaySpeed: number): number {
  return shownDisplaySpeed - baseSpeed - (swift ? displayedSwiftBonus(baseSpeed) : 0);
}

/** One monster's speed as the battle reads it, before rounding. */
export type SpeedSheet = {
  baseSpeed: number;
  runeSpeed: number;
  /** A fixed, automatic passive speed addition, before the clock rounds once. */
  passiveFlatSpeed?: number;
  swift: boolean;
  /** Totem, leader and automatic passive percentages, in percent of base speed. May be fractional (2.5 %). */
  percentOfBase: number;
};

/*
 * The unrounded combat speed, times 1,000: B·(1,000 + 10·(totem + leader +
 * passive percent) + 250·Swift) + 1,000·(rune speed + flat passive speed).
 * Totem steps are half percents, so ten times a percent is always whole and
 * the product is an exact integer.
 */
function combatSpeedThousandths(sheet: SpeedSheet): number {
  const percentTenths = Math.round(sheet.percentOfBase * 10);
  return sheet.baseSpeed * (1_000 + percentTenths + (sheet.swift ? swiftPercent * 10 : 0))
    + 1_000 * (sheet.runeSpeed + (sheet.passiveFlatSpeed ?? 0));
}

/**
 * Combat speed, with whatever percentages the sheet was given for its content:
 * ⌈B·(1 + t + l + s + p) + b + q⌉, one rounding over the whole: `p` is an
 * automatic passive percentage and `q` its flat speed addition.
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
  | ({ kind: 'allies-attack-bar'; amount: number; skipsSimilar: boolean; includesCaster?: boolean } & Timing)
  /** One other ally's attack bar, chosen by `target`. */
  | ({ kind: 'ally-attack-bar'; amount: number; target: AllyTarget } & Timing)
  /** The acting monster's own bar, after its turn has emptied it. */
  | ({ kind: 'self-attack-bar'; amount: number } & Timing)
  /** Every ally's speed buff, the caster's too unless the skill excludes it. */
  | ({ kind: 'allies-speed-buff'; turns: number; excludesCaster?: boolean } & Timing)
  /** A speed buff for a number of the recipient's own turns. */
  | ({ kind: 'ally-speed-buff'; turns: number; target: AllyTarget } & Timing)
  | ({ kind: 'self-speed-buff'; turns: number } & Timing)
  /**
   * Up to `count` other allies attack together with the acting monster, each
   * bringing its `jointAttack` effects. Only the acting monster pulls.
   */
  | { kind: 'pull-allies'; count: number }
  /**
   * The holder's own bar, on every turn of the units named and never on its
   * own: `others` is every other unit, `allies` the other units of its side,
   * `enemies` the other side's.
   */
  | { kind: 'attack-bar-on-turn-of'; of: 'others' | 'allies' | 'enemies'; amount: number };

/**
 * When an effect behind a condition lands.
 * - `untilEnemyActs`: behind full HP or the absence of harmful effects — the
 *   caster's or the allies' — which hold until the first enemy turn: no
 *   monster of the team is hurt or debuffed before an enemy has acted (the
 *   user's instruction, November 27, 2026).
 * - `fromSecondTurn`: behind the monster's other skills being on cooldown,
 *   which they are once its first turn has used them (§5.1). `speed-skills.ts`
 *   keeps such an effect out of the first turn.
 */
type Timing = { untilEnemyActs?: boolean; fromSecondTurn?: boolean };

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
  /**
   * Applied on the unit's first turn, and on every later one. A skill behind a
   * cooldown is in `firstTurn` only (`SPEED-TICK-CANONICAL.md` §5.1); an effect
   * that comes every turn is in both.
   */
  firstTurn: readonly TurnEffect[];
  laterTurns: readonly TurnEffect[];
  /** What the unit brings when another ally pulls it into a joint attack: its first skill and its attack passives. */
  jointAttack?: readonly TurnEffect[];
  /** Boosts to its own bar set off by other units' turns (`attack-bar-on-turn-of`). */
  onTurnsOf?: readonly TurnEffect[];
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
 * the order of turns can also skip ticks on which nobody can move. The turns
 * are the same either way.
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
  let enemyHasMoved = false;

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
    let elapsed = 1;
    if (!recording) {
      // Bars fill at the same rate until someone acts. A very low combat
      // speed under Leo can leave hundreds of empty ticks between turns.
      elapsed = units.reduce((earliest, unit, at) => {
        const fill = fills[at];
        const remaining = fullBar - (bars.get(unit.key) ?? 0);
        if (fill >= remaining) return 1;
        return fill > 0 ? Math.min(earliest, Math.ceil(remaining / fill)) : earliest;
      }, Number.POSITIVE_INFINITY);
      if (tick + elapsed - 1 > tickLimit) break;
      tick += elapsed - 1;
    }
    units.forEach((unit, at) => bars.set(unit.key, (bars.get(unit.key) ?? 0) + fills[at] * elapsed));
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
    const grantBuff = (key: string, count: number) => {
      buffTurns.set(key, Math.max(buffTurns.get(key) ?? 0, count));
      if (key === mover.key) refreshedOwnBuff = true;
    };
    const boost = (key: string, amount: number) => bars.set(key, (bars.get(key) ?? 0) + amount * clockScale);
    /* `caster` is the mover, or an ally it pulled into a joint attack, whose
       "all allies" and one-ally effects then reach the mover too. */
    const apply = (caster: TickUnit, effects: readonly TurnEffect[]) => {
      const allies = units.filter((unit) => unit.side === caster.side && unit.key !== caster.key);
      /* A one-ally target is chosen from the bars as the caster acts, so a
         skill that fills a bar and grants a buff gives both to the same ally
         rather than letting its own boost send the buff elsewhere. Level bars
         go to the one listed first. */
      const lowestBar = [...allies].sort((left, right) => (bars.get(left.key) ?? 0) - (bars.get(right.key) ?? 0)
        || (rank.get(left.key) ?? 0) - (rank.get(right.key) ?? 0))[0];
      const highestBar = [...allies].sort((left, right) => (bars.get(right.key) ?? 0) - (bars.get(left.key) ?? 0)
        || (rank.get(left.key) ?? 0) - (rank.get(right.key) ?? 0))[0];
      const targetOf = (target: AllyTarget) => target === 'highest-attack-bar' ? highestBar : lowestBar;
      for (const effect of effects) {
        if ('untilEnemyActs' in effect && effect.untilEnemyActs && enemyHasMoved) continue;
        switch (effect.kind) {
          case 'allies-attack-bar':
            for (const ally of allies) if (!(effect.skipsSimilar && ally.similarBoostPassive)) boost(ally.key, effect.amount);
            /* Verdehile's own passive reaches Verdehile, its "similar skill"
               clause passing over only the others that carry one. */
            if (effect.includesCaster) boost(caster.key, effect.amount);
            break;
          case 'ally-attack-bar': {
            const ally = targetOf(effect.target);
            if (ally) {
              boost(ally.key, effect.amount);
              if (caster === mover) allyBoosts.push({ key: ally.key, amount: effect.amount });
            }
            break;
          }
          case 'self-attack-bar':
            boost(caster.key, effect.amount);
            break;
          case 'allies-speed-buff':
            if (!effect.excludesCaster) grantBuff(caster.key, effect.turns);
            for (const ally of allies) grantBuff(ally.key, effect.turns);
            break;
          case 'ally-speed-buff': {
            const ally = targetOf(effect.target);
            if (ally) grantBuff(ally.key, effect.turns);
            break;
          }
          case 'self-speed-buff':
            grantBuff(caster.key, effect.turns);
            break;
          case 'pull-allies':
            /* Auto battle's choice of partner is not visible, so the allies
               that bring a boost are the ones assumed to come along, in the
               order they are listed (§4.1). A pulled ally pulls nobody. */
            if (caster === mover) {
              for (const ally of allies.filter((unit) => unit.jointAttack?.length).slice(0, effect.count)) {
                apply(ally, ally.jointAttack ?? []);
              }
            }
            break;
          case 'attack-bar-on-turn-of':
            /* Set off by other units' turns, below; never by the holder's own. */
            break;
        }
      }
    };
    apply(mover, turn === 1 ? mover.firstTurn : mover.laterTurns);
    if (mover.side === 'enemy') enemyHasMoved = true;
    /* Whoever counts this turn as one of "others" or "enemies" gains on it. */
    for (const unit of units) {
      if (unit.key === mover.key) continue;
      for (const effect of unit.onTurnsOf ?? []) {
        if (effect.kind !== 'attack-bar-on-turn-of') continue;
        const sameSide = unit.side === mover.side;
        if (effect.of === 'others' || (effect.of === 'allies') === sameSide) boost(unit.key, effect.amount);
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
