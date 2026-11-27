/**
 * What a skill actually does to attack bars and speed, where Swarfarm's numbers
 * or the game's own wording would have Speed Tuning count something else
 * (`SPEED-TICK-CANONICAL.md` §5.3).
 *
 * Every entry is a decision taken by reading the skill, not a guess, and each
 * says why. Do not "simplify" an entry back to Swarfarm's reading in a
 * refactor: Swarfarm's `quantity` and target flags are wrong for exactly these
 * skills, and the description, read alone, misleads in the ways noted. The
 * user's instruction (November 27, 2026) is that the program counts the attack
 * bar increases that actually take place.
 *
 * The rules the decisions follow (the user's, November 27, 2026: count a boost
 * only where it actually happens on the monster's own turn):
 * - Counted: what the skill does every time it is used, and what a critical
 *   hit of the monster's own adds — a critical hit is assumed, as Verdehile's
 *   Boiling Blood is. A boost per critical hit of a multi-hit skill counts once
 *   per hit.
 * - Not counted: anything set off by somebody else's action — being attacked
 *   or hit, an ally falling, an enemy's buff, a death, a revive. Garo's Narrow
 *   Escape is the type: it needs the enemy to land a fatal blow.
 * - Counted, on exactly those turns: a boost set off by another unit simply
 *   taking a turn, which the clock knows (`barOnTurnOf`). An enemy's turn never
 *   sets off a boost worded for the allies' turns, nor the other way round.
 * - Not counted: a boost behind any other condition — a kill, a percentage
 *   chance, the target's or the team's state (beneficial or harmful effects,
 *   full HP, sleep, a stun landing), a harmful effect of the skill's own that
 *   the enemy may resist, or a size set by the enemies' number, HP lost or bar.
 *   The page cannot know whether it happens, so it says so beside the monster.
 * - Lowering an enemy's attack bar is never counted, and neither is a gain
 *   taken from it (the user's decision of November 27, 2026).
 *
 * `npm run verify:speed-tick` fails when the snapshot holds a skill whose
 * wording or numbers need a decision and none is recorded here, so a refresh
 * cannot slip a new misreading past review.
 */
import type { AllyTarget } from './speed-tick';

/** Who a read effect reaches: the caster, every other ally, or one other ally. */
export type ReadRecipient = 'self' | 'allies' | 'ally';

export type ReadEffect =
  /** An attack-bar boost of `bar` percent, before "Attack Bar Recovery" skill-ups. */
  | { bar: number; to: ReadRecipient; target?: AllyTarget }
  /** A speed buff for `buff` of the recipient's turns. */
  | { buff: number; to: ReadRecipient; excludesCaster?: true }
  /** `bar` percent on the caster's own bar on every turn of the units named — never on its own. */
  | { barOnTurnOf: OtherTurns; bar: number };

/** Whose turns set off a boost on another unit's turn: everybody else's, or the enemies' only. */
export type OtherTurns = 'others' | 'enemies';

/**
 * `swarfarm`: reviewed, and Swarfarm's reading is what happens.
 * Otherwise the effects that happen, and `uncounted` where part of the skill
 * (or all of it, with no effects) moves bars in a way the page cannot count.
 */
export type SkillReading = 'swarfarm' | { effects: readonly ReadEffect[]; uncounted?: true };

const none: SkillReading = { effects: [], uncounted: true };

const decisions: Array<[ids: number[], reading: SkillReading]> = [
  /* ── Reviewed: Swarfarm's reading is what happens ──────────────────────── */

  /* On a critical hit of the monster's own, once per skill as worded — the
     spears, the smashes, Squall, Multiple Throw ("if this attack lands"),
     Destruction Wedge, Black Wing Flash ("when landing a Critical Hit", not
     "each"), Soaring Wings, Hidden Sense of Justice and Lethal Intent, and
     Quick Steps on the monster's own critical hit. */
  [[1201, 1202, 1203, 1204, 1205, 2751, 2752, 2753, 2754, 2755, 4206, 4208, 4209, 5406, 5409,
    9313, 22406, 22410, 22906, 22910, 12412, 12413, 12415, 21615, 22215, 23914, 24414], 'swarfarm'],
  /* Unconditional on use; the flagged wording is about something else in the
     skill (damage, a cooldown, a revive "at the moment of death"). */
  [[1556, 1614, 7111, 7908, 8006, 8008, 8009, 8026, 8028, 8029, 8311, 9513, 9514, 10225, 10908,
    10909, 12812, 12921, 12931, 13613, 14907, 14908, 14910, 15708, 15709, 17006, 17009, 17413,
    17913, 21606, 21608, 21610, 22206, 22208, 22210, 22612, 23112, 23714, 23716, 24216, 24214,
    10253010], 'swarfarm'],
  /* On the monster's own turn by its own words: Eternal Flame ("when you attack
     on your turn"), Druid's Agility ("after attacking"), Six Eyes ("whenever
     your turn ends"), Spear of Penetration ("after attacking the enemy on your
     turn"). */
  [[12312, 12939, 20011, 20611, 23412], 'swarfarm'],
  /* Already read as not countable: a size set by damage, HP, a stolen or
     decreased bar, dice, or the field's harmful effects. */
  [[6911, 8607, 8609, 11511, 12113, 13414, 14215, 14715, 14730, 15213, 20412, 23911, 24411], 'swarfarm'],

  /* ── Swarfarm's number or target is wrong ─────────────────────────────── */

  /* Mobilize: "Fills the Attack Bar of all allies by 30% and recovers their HP
     by 35%" — Swarfarm took the HP figure. */
  [[2064], { effects: [{ bar: 30, to: 'allies' }] }],
  /* Destruct Evil: "increases the Attack Bar of all allies by 20%"; Swarfarm 10. */
  [[9211], { effects: [{ bar: 20, to: 'allies' }] }],
  /* Grant Life: "Recovers the ally target's HP and Attack Bar by 40%"; Swarfarm 30. */
  [[10407, 10410], { effects: [{ bar: 40, to: 'ally' }] }],
  /* Owl's Hoot: the speed buff lasts "for 3 turns"; Swarfarm 2. */
  [[11815], { effects: [{ buff: 3, to: 'allies' }] }],
  /* Absorbing Life: "Recovers the Attack Bar of all allies by 20%"; Swarfarm
     gave this one copy a single ally where its twins give all. */
  [[13408], { effects: [{ bar: 20, to: 'allies' }] }],
  /* Wise Owl Soul: "increases your and the target's Attack Bar by 50% each";
     Swarfarm left out the caster. */
  [[15414, 15434], { effects: [{ bar: 50, to: 'ally' }, { bar: 50, to: 'self' }] }],
  /* Horn of Charge: "Increases the ally target's Attack Bar by 12%"; Swarfarm
     marked this one copy as the caster's own. */
  [[18802], { effects: [{ bar: 12, to: 'ally' }] }],
  /* Dynamite Heel, Spinning Roundhouse Kick: the buff lasts "for 2 turns"
     (Swarfarm 3); the bar taken from the enemy depends on its bar. */
  [[22511, 23011], { effects: [{ buff: 2, to: 'self' }], uncounted: true }],
  /* Wild Chase: "increases your Attack Speed for 1 turn … with each attack"
     is a one-turn speed buff of its own. Swarfarm read the 20 % of the
     stacking clause as turns and gave an ally a 30-turn buff that is not in the
     skill. The stacking +20 % per enemy turn is a speed rise, not the buff, and
     resets each turn: not counted. */
  [[13614], { effects: [{ buff: 1, to: 'self' }], uncounted: true }],
  /* Cursed Music: "increases the Attack Speed of all allies, excluding
     yourself" — the caster gets no buff. */
  [[13815], { effects: [{ buff: 2, to: 'allies', excludesCaster: true }] }],

  /* ── Multi-hit: a boost per critical hit, every hit assumed to crit ─────── */

  /* Passing Time: 3 hits, "recovers 10% … each time the attack lands as a
     Critical Hit". */
  [[7101, 7102, 7103, 7104, 7105], { effects: [{ bar: 30, to: 'self' }] }],
  /* 4 hits, "25% for each attack that lands as a Critical Hit". */
  [[4815], { effects: [{ bar: 100, to: 'self' }] }],
  /* 5 hits, "10% for every Critical Hit". */
  [[5514], { effects: [{ bar: 50, to: 'self' }] }],
  /* 3 hits, "35% whenever this attack lands as a Critical Hit". */
  [[25006, 25008, 25010, 25506, 25508, 25510], { effects: [{ bar: 105, to: 'self' }] }],

  /* ── Part of the skill counts ──────────────────────────────────────────── */

  /* "increases the Attack Bar of all allies by 10%, and additionally by 10% if
     you successfully steal beneficial effects" — the second half needs the
     enemies to have some. */
  [[9415], { effects: [{ bar: 10, to: 'allies' }], uncounted: true }],

  /* Bomb install: the fixed 50 % counts; "15% for each bomb you install"
     depends on how many enemies stand. */
  [[8906, 8908, 8909], { effects: [{ bar: 50, to: 'self' }], uncounted: true }],
  /* Duty of the Monarch: 10 % to allies at the end of every turn; the extra
     "5% based on the number of beneficial effects" depends on the target. */
  [[11414], { effects: [{ bar: 10, to: 'allies' }], uncounted: true }],
  /* 50 % after the attack; "up to 50% in proportion to the enemy's HP lost"
     depends on the damage. */
  [[15912], { effects: [{ bar: 50, to: 'self' }], uncounted: true }],
  /* Revives fallen allies, with a 30 % boost "according to the no. of revived
     allies" — there are none to revive when a turn order is set. The speed
     buff counts. */
  [[5415], { effects: [{ buff: 2, to: 'allies' }], uncounted: true }],
  /* A speed buff and Immunity; the 50 % bar comes only "when attacked by an
     enemy while [the skill] is on cooldown". */
  [[21313, 21913], { effects: [{ buff: 2, to: 'self' }], uncounted: true }],

  /* ── Not a boost to this side at all ───────────────────────────────────── */

  /* "each attack decreases the Attack Bar by 15%" — of the enemies. Swarfarm
     filed the reduction as a boost to allies. */
  [[14612], none],
  /* "decreases the Attack Speed for 2 turns" — of the enemies; Swarfarm filed
     it as a speed buff to allies. */
  [[18408], none],
  /* Spurt, Strange Reversible Reaction, Turning Slash, Punch Parry, Backsteps,
     Jet Engine, Wild Steps, Master of Magic Power: a rise in attack speed by
     points or percent, stacked by the battle — not the speed buff Swarfarm
     read, with its figure as turns. */
  [[1565, 11613, 19414, 22514, 23014, 15211, 13612, 10014], none],
  /* The Wind Thunderer: a +100 % speed state, not the 30 % buff; Swarfarm read
     it as a 100-turn buff. */
  [[18138, 18218], none],
  /* Returned Dice: every bar on the field, the caster's team included, drops
     to 0 — a buff alone would hide the larger effect. */
  [[12114], none],

  /* ── Behind a condition the monster's own turn does not guarantee ───────── */

  /* A kill: "if the enemy gets defeated", "whenever you kill an enemy",
     "when the enemy target is defeated or stunned". */
  [[3156, 10314, 17214, 17714, 5712], none],
  /* The target's state: no beneficial effects (Seize), two or more removed,
     asleep after a 50 % Sleep, stunned by a 30 % chance, its bar "not
     decreased" by a 50 % chance (Sword of Justice). */
  [[2059, 10906, 10907, 10910, 5301, 5302, 5303, 5304, 5305, 21406, 21410, 22006, 22010,
    23501, 23502, 23503, 23504, 23505], none],
  /* The team's or the caster's own state: allies with full HP, without
     harmful effects to remove, no harmful effects on the caster to transfer,
     full HP after the attack. */
  [[2211, 3462, 9117, 23506, 23509, 24701, 24702, 24703, 24704, 24705, 5508, 5509, 5512, 5515], none],
  /* Stormfist: "15% each if the attack lands as a Critical Hit", over 3 hits
     that rise "up to 6 times according to your Attack Power" — the three are
     certain, the rest depend on the build. */
  [[18306, 18307, 18309], { effects: [{ bar: 45, to: 'self' }], uncounted: true }],
  /* Body Slam: "30% for each harmful effect granted on the enemy target" — the
     enemy may resist both. */
  [[2556], none],
  /* Cascading Attacks, Wave Attack: the gain is "50% of the Attack Bar you
     decreased", which is taken from the enemy and depends on its bar. */
  [[22414, 22914], none],
  /* "The Attack Bar is increased by 50%, and the damage you receive will be
     reduced by half when you get attacked while this skill is on cooldown" —
     both halves wait for an enemy's attack; the game's sentence makes the
     first look instant. */
  [[6107, 6109, 6157, 6159], none],

  /* ── Set off by somebody else, or by the battle ────────────────────────── */

  /* Another unit's turn, which the clock knows exactly, so it counts there and
     only there (the user's instruction, November 27, 2026): Outlaw and Thrill
     of War, "whenever an enemy or an ally gains a turn" — every other unit's
     turn, the monster's own not, as "an ally" is never the monster itself in
     the game's wording. Swarfarm counted it on the monster's own turn, and
     Outlaw's on an ally's bar. */
  [[17514, 18014], { effects: [{ barOnTurnOf: 'others', bar: 10 }] }],
  /* Tip of the Spear: "each time the enemy's turn ends" — enemy turns only. */
  [[11415], { effects: [{ barOnTurnOf: 'enemies', bar: 25 }] }],

  /* Being attacked, hit, critically hit, hit by a glancing or a non-critical
     hit. */
  [[1415, 4811, 6115, 6165, 6180, 6314, 6665, 7511, 11611, 11661, 11683, 11713, 12013, 12941,
    13213, 15913, 18914, 19314, 25113, 25613, 12313, 20212, 20812, 23711, 24211, 23814, 24314,
    25014, 25514, 6014, 7815, 15112, 21307, 21308, 21309, 21907, 21908, 21909], none],
  /* Fatal damage, a death, a revive. */
  [[4812, 10012, 11213, 13415, 13416, 15314, 15512, 18131, 18211, 21015, 25013, 25513, 11215], none],
  /* Something the enemy does: gains a buff, recovers HP, uses an attack-bar
     or cooldown skill, takes an extra turn, lowers an ally's bar, damages on
     its own turn, a harmful effect landing or being resisted. */
  [[10712, 12014, 13214, 14913, 15215, 15312, 17313, 17813, 18413, 18433, 18615, 22711, 23211,
    13911, 14411, 14115, 14615, 24907, 24908, 24910, 25407, 25408, 25410, 20114, 20714, 13814], none],
  /* An ally's or the caster's state: harmful or beneficial effects granted,
     removed or resisted, inability, HP falling, cooldowns rising. */
  [[7112, 10015, 11663, 11685, 11915, 12936, 12940, 13711, 15811, 17015, 18715, 18730, 19114,
    19514, 20014, 20614, 20313, 20913, 21014, 21611, 22211, 21614, 22214, 22613, 23113, 24715], none],
  /* A boost whose size is the number of enemies stunned, affected, slower or
     carrying an effect, or the beneficial effects stolen from them. */
  [[6265, 6280, 7906, 7909, 9007, 9008, 9010, 9014, 9016, 9106, 9109, 9112, 9118, 9707, 9709,
    12407, 12714, 19013, 19413, 19111, 19511, 19213, 19613, 24711, 25007, 25009, 25507, 25509,
    23511], none],
  /* A boost in proportion to damage, HP lost or the enemy's bar. */
  [[13611, 17306, 17309], none],
  /* Depends on a state another skill sets up: a pose, a song, the other
     skills' cooldowns, the HP order of the field, or a duel's winner. */
  [[13215, 25001, 25002, 25003, 25004, 25005, 25501, 25502, 25503, 25504, 25505, 23513, 20415,
    25115, 25615], none],
  /* Caffeine, Mind and Body Rest: one of three buffs at random. */
  [[16313, 16813], none],
];

export const skillReadings: ReadonlyMap<number, SkillReading> = new Map(decisions.flatMap(
  ([ids, reading]) => ids.map((id): [number, SkillReading] => [id, reading])));

/**
 * Wording that calls for a decision: a trigger outside the caster's own turn,
 * a size the battle decides, or a rise in speed that is not the speed buff.
 * A skill whose description matches, or whose counted figure does not appear
 * in its description, must have an entry in `skillReadings` — reviewed as
 * `swarfarm` where Swarfarm is right.
 */
export const wordingNeedingDecision = /\battacked\b|\b(?:get|gets|is|are) hit\b|hit by|fatal|death|\bdies\b|defeated|\bkill|reviv|for each|\bper\b|each time|every time|whenever|in proportion|up to \d|attack bar you decreased|amount decreased|turn ends|when an? (?:enemy|ally)|by \d+(?![\d ]*%)|while [^.]*on cooldown|\bif\b|\bwhen\b|with an? \d+% chance[^.]*attack bar/i;
