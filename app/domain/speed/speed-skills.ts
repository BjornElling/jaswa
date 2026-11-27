/**
 * What an owned monster brings to a turn order, read from the Swarfarm snapshot:
 * its speed leader skill, and what its skills do to attack bars and speed.
 *
 * The page's instruction is that an attack-bar effect is assumed to land
 * (`SPEED-TICK-CANONICAL.md` §5): a chance, a critical hit or a kill is taken as
 * given. A cooldown is not: a skill behind one is counted on the monster's first
 * turn only, as the turns the page draws rarely reach its second use. A monster
 * uses one active skill per turn — its strongest speed skill on its first turn,
 * its strongest without a cooldown after that — and its passives on top.
 */
import speedSkillData from '../../data/swarfarm-speed-skills.json';
import type { GameRecord } from '../account/game-record';
import { statLabels } from '../shared/stat-labels';
import type { AllyTarget, LeaderArea, SpeedLeaderSkill, TurnEffect } from './speed-tick';

type SnapshotEffect = {
  effect: 'attack-bar' | 'speed-buff';
  quantity: number;
  aoe: boolean;
  self: boolean;
  single: boolean;
  onCrit: boolean;
  chance: number | null;
};

type SnapshotSkill = {
  com2usId: number;
  name: string;
  slot: number;
  passive: boolean;
  cooldown: boolean;
  /** How many allies attack together with this skill; 0 for none. */
  pulls: number;
  description: string;
  recoveryUpgrades: number[];
  effects: SnapshotEffect[];
};

type SnapshotLeader = [com2usId: number, attribute: string, percent: number, area: LeaderArea, element: string | null];

/* Swarfarm's name for each attribute a leader raises, and the stat's name as
   every other page writes it in prose (`stat-labels.ts`). */
const leaderAttributes = {
  'Attack Speed': { short: statLabels.spd, words: 'attack speed' },
  'Attack Power': { short: statLabels.atk, words: 'attack power' },
  Defense: { short: statLabels.def, words: 'defense' },
  HP: { short: statLabels.hp, words: 'HP' },
  'Critical Rate': { short: statLabels.criRate, words: 'critical rate' },
  'Critical DMG': { short: statLabels.criDmg, words: 'critical damage' },
  Resistance: { short: statLabels.res, words: 'resistance' },
  Accuracy: { short: statLabels.acc, words: 'accuracy' },
} as const;
export type LeaderAttribute = keyof typeof leaderAttributes;

/** What a monster leads with: any attribute, wherever it counts. */
export type LeaderSkill = { attribute: LeaderAttribute; percent: number; area: LeaderArea; element: string | null };

function isLeaderAttribute(value: string): value is LeaderAttribute {
  return Object.hasOwn(leaderAttributes, value);
}

const leaderAreas: readonly string[] = ['General', 'Arena', 'Dungeon', 'Guild'] satisfies LeaderArea[];

/* An attribute or area the table does not name fails here, at load, rather
   than leaving a monster whose lead the editor cannot word or place. */
const leaderByMasterId = new Map((speedSkillData.leaders as SnapshotLeader[]).map(([id, attribute, percent, area, element]) => {
  if (!isLeaderAttribute(attribute)) throw new Error(`The speed snapshot gives monster ${id} a leader skill on an unknown attribute, ${attribute}.`);
  if (!leaderAreas.includes(area)) throw new Error(`The speed snapshot gives monster ${id} a leader skill in an unknown area, ${area}.`);
  return [String(id), { attribute, percent, area, element } satisfies LeaderSkill];
}));

const skillByCom2usId = new Map((speedSkillData.skills as SnapshotSkill[])
  .map((skill) => [skill.com2usId, skill]));

/** This monster's leader skill, of whatever attribute, or `null` when it has none. */
export function leaderSkill(masterId: unknown): LeaderSkill | null {
  return leaderByMasterId.get(String(masterId ?? '')) ?? null;
}

/** This monster's speed leader skill, or `null` when it leads with something else. */
export function speedLeaderSkill(masterId: unknown): SpeedLeaderSkill | null {
  const lead = leaderSkill(masterId);
  return lead?.attribute === 'Attack Speed' ? { percent: lead.percent, area: lead.area, element: lead.element } : null;
}

/** The lead as a table cell names it: `SPD 24 %`, `ATK 33 % · Dungeon`, `HP 50 % · Water`. */
export function shortLeaderSkill(lead: LeaderSkill): string {
  const where = [lead.area === 'General' ? null : lead.area, lead.element].filter((part) => part !== null);
  return `${leaderAttributes[lead.attribute].short} ${lead.percent} %${where.map((part) => ` · ${part}`).join('')}`;
}

const leaderAreaWords: Record<LeaderArea, string> = {
  General: 'everywhere',
  Arena: 'in arena',
  Dungeon: 'in dungeons',
  Guild: 'in guild content',
};

/** The stat a lead raises, as a table names it: `CRI Rate`, `SPD`. */
export function leaderSkillStat(lead: LeaderSkill): string {
  return leaderAttributes[lead.attribute].short;
}

/** Where a lead counts, in the words of a sentence: `in arena`, `everywhere`. */
export function leaderAreaPhrase(lead: LeaderSkill): string {
  return leaderAreaWords[lead.area];
}

export function describeLeaderSkill(lead: LeaderSkill): string {
  const words = leaderAttributes[lead.attribute].words;
  const who = lead.element === null ? '' : ` on ${lead.element} monsters`;
  const where = lead.element !== null && lead.area === 'General' ? '' : ` ${leaderAreaWords[lead.area]}`;
  return `+${lead.percent} % ${words}${who}${where}`;
}

type Recipient = 'allies' | 'ally' | 'self';

/*
 * Who an effect lands on. Swarfarm marks most effects `aoe`, `self` or
 * `single`; the handful marked none of them name their target only in words,
 * so the description decides — "all allies" and "an ally" where it says so,
 * and the monster itself otherwise, which is what "your Attack Bar" means.
 */
function recipients(effect: SnapshotEffect, description: string): Recipient[] {
  const marked: Recipient[] = [
    ...(effect.aoe ? ['allies' as const] : []),
    ...(effect.single ? ['ally' as const] : []),
    ...(effect.self ? ['self' as const] : []),
  ];
  if (marked.length) return marked;
  if (/all allies/i.test(description)) return ['allies'];
  if (/\b(an|the) ally\b/i.test(description)) return ['ally'];
  return ['self'];
}

/* A skill-up that reads "Attack Bar Recovery +5%" strengthens the boost by
   that share of itself: 30 % at +5 % and +10 % becomes 34.5 %. Upgrades
   beyond the copy's own skill level are not counted. */
function recoveryMultiplierPercent(skill: SnapshotSkill, level: number): number {
  return 100 + skill.recoveryUpgrades.slice(0, Math.max(0, level - 1)).reduce((sum, amount) => sum + amount, 0);
}

/*
 * Swarfarm leaves `quantity` at 0 or empty where it has no number for an
 * effect, and the skill's own words then decide (`SPEED-TICK-CANONICAL.md`
 * §5.2): "increases … Attack Bar … by 20%" is 20 %, "fills up" or "to the MAX"
 * is a full bar, and a turn count is read from "for 2 turns". Anything else —
 * a boost in proportion to damage, a bar swapped or balanced — depends on the
 * battle, and is reported as not counted rather than given a number nobody
 * stated. A zero beside a numbered effect of the same kind is the unnumbered
 * part of that skill and is not counted either.
 */
const statedAttackBar = /(?:increases?|recovers?)\s+(?:the\s+)?(?:your\s+)?attack bar(?:\s+of\s+(?:all allies|an ally|the ally|the target ally))?\s+by\s+(\d+)\s?%/i;
/* "an ally target's", "the target ally's" and "the ally's" are one target in
   three word orders; missing the first left Konamiya's Resurge uncounted. */
const filledAttackBar = /fills? up (?:the |an |your |their )?(?:(?:ally|target)(?:'s)? )*attack bar|attack bar to the max/i;
/* A one-ally effect goes to the lowest attack bar, as auto battle sends it,
   unless the skill names the highest ("the ally with the highest Attack Bar"). */
const highestAttackBarTarget = /\bhighest attack bar\b/i;
const statedTurns = /for (\d+) turns?/i;

type Reading = { amount: number } | null;

function attackBarQuantity(effect: SnapshotEffect, skill: SnapshotSkill): Reading {
  if (effect.quantity) return { amount: effect.quantity };
  const siblingNumbered = skill.effects.some((other) => other !== effect && other.effect === 'attack-bar' && other.quantity);
  if (siblingNumbered) return null;
  if (filledAttackBar.test(skill.description)) return { amount: 100 };
  const stated = statedAttackBar.exec(skill.description);
  return stated ? { amount: Number(stated[1]) } : null;
}

function speedBuffTurns(effect: SnapshotEffect, skill: SnapshotSkill): Reading {
  if (effect.quantity) return { amount: effect.quantity };
  const stated = statedTurns.exec(skill.description);
  return stated ? { amount: Number(stated[1]) } : null;
}

function turnEffects(skill: SnapshotSkill, level: number): { effects: TurnEffect[]; uncounted: boolean } {
  const boostScale = recoveryMultiplierPercent(skill, level);
  const target: AllyTarget = highestAttackBarTarget.test(skill.description) ? 'highest-attack-bar' : 'lowest-attack-bar';
  let uncounted = false;
  const effects = skill.effects.flatMap((effect): TurnEffect[] => {
    const reading = effect.effect === 'attack-bar' ? attackBarQuantity(effect, skill) : speedBuffTurns(effect, skill);
    if (reading === null) {
      uncounted = true;
      return [];
    }
    return recipients(effect, skill.description).map((recipient): TurnEffect => {
      if (effect.effect === 'attack-bar') {
        /* Percent × (100 + upgrades) is the boost in hundredths of a percent. */
        const amount = reading.amount * boostScale;
        if (recipient === 'allies') return { kind: 'allies-attack-bar', amount, skipsSimilar: skill.passive && effect.onCrit };
        return recipient === 'ally' ? { kind: 'ally-attack-bar', amount, target } : { kind: 'self-attack-bar', amount };
      }
      const turns = reading.amount;
      if (recipient === 'allies') return { kind: 'allies-speed-buff', turns };
      return recipient === 'ally' ? { kind: 'ally-speed-buff', turns, target } : { kind: 'self-speed-buff', turns };
    });
  });
  return { effects: skill.pulls > 0 ? [...effects, { kind: 'pull-allies', count: skill.pulls }] : effects, uncounted };
}

/**
 * Which of its turns a counted skill acts on: every one, the first only (a
 * cooldown), or every one after the first (the skill used while the opening
 * one cools down).
 */
export type SkillTurns = 'every' | 'first' | 'later';

/** One skill as the page describes it beside the monster that has it. */
export type SpeedSkill = { name: string; passive: boolean; turns: SkillTurns; effects: TurnEffect[] };

export type SpeedSkillProfile = {
  /** The skills whose effects are applied, in the order they are applied. */
  used: SpeedSkill[];
  /** Everything any of the monster's turns applies — what it can do to a turn order. */
  effects: TurnEffect[];
  /** What its first turn applies, and what each later one does. */
  firstTurn: TurnEffect[];
  laterTurns: TurnEffect[];
  /** What it brings when another ally pulls it into a joint attack. */
  jointAttack: SpeedSkill[];
  /** A team attack-bar passive of its own, which Verdehile-style boosts pass over. */
  similarBoostPassive: boolean;
  /** Skills with a speed effect whose size depends on the battle, and so is not counted. */
  uncounted: string[];
  /** Leo's Eye of the Storm: no one else on the field moves faster than this monster. */
  capsOthersSpeed: boolean;
};

/* Leo's passive, com2us skill 7813 — "the attack speed of all enemies and
   allies is limited to your attack speed", sparing Boss Monsters and anyone
   with the same skill (Swarfarm skill 1096). It names no number, so the
   snapshot's speed effects do not carry it; it is read from the copy's own
   skill list. Dragon Knight carries it before awakening as Leo does after. */
const speedCapSkillId = 7813;

function hasSpeedCap(monster: GameRecord): boolean {
  return Array.isArray(monster.skills) && monster.skills.some((entry) => Array.isArray(entry) && entry[0] === speedCapSkillId);
}

function ownSkills(monster: GameRecord): Array<{ skill: SnapshotSkill; level: number }> {
  if (!Array.isArray(monster.skills)) return [];
  return monster.skills.flatMap((entry) => {
    if (!Array.isArray(entry)) return [];
    const [id, level] = entry;
    const skill = typeof id === 'number' ? skillByCom2usId.get(id) : undefined;
    return skill && typeof level === 'number' && Number.isSafeInteger(level) && level >= 1 ? [{ skill, level }] : [];
  });
}

/* How much a skill does for the team's turn order, to choose the active skill:
   a joint attack that brings a teammate's boost first, as the profile keeps
   one only where a teammate has a boost to bring; then bars filled for allies,
   a speed buff, and the monster's own bar. */
function activeWeight(effects: readonly TurnEffect[]): number {
  return effects.reduce((sum, effect) => {
    switch (effect.kind) {
      case 'pull-allies': return sum + 1_000_000;
      case 'allies-attack-bar': return sum + effect.amount * 4;
      case 'ally-attack-bar': return sum + effect.amount;
      case 'allies-speed-buff': return sum + 3_000;
      case 'ally-speed-buff': return sum + 1_000;
      case 'self-speed-buff': return sum + 500;
      case 'self-attack-bar': return sum + effect.amount / 10;
    }
  }, 0);
}

/*
 * A passive that fires on an attack of the monster's own, wherever it is made —
 * "Your Critical Hits …", "with each attack", "after attacking" — also fires
 * when another ally pulls it in. One bound to its own turn ("when you attack on
 * your turn", "whenever your turn ends") does not.
 */
const attackTrigger = /your critical hits?|your attacks? lands? as a critical hit|with each attack|after attacking|when(?:ever)? you attack|attacks the enemy with a critical hit/i;
const ownTurnTrigger = /your turn|gains? a turn|each turn/i;
const speedWords = /attack bar|attack speed/i;

/* The trigger must govern the speed effect: they share a sentence. "Your
   attacks inflict …" beside "your Attack Bar increases whenever you are
   attacked" is two rules, and only the second moves a bar. */
function firesOnOwnAttack(description: string): boolean {
  return description.split(/(?<=\.)\s+/).some((sentence) =>
    attackTrigger.test(sentence) && speedWords.test(sentence) && !ownTurnTrigger.test(sentence));
}

type ReadSkill = { skill: SnapshotSkill; effects: TurnEffect[]; uncounted: boolean };

/* What a monster brings when pulled into a joint attack: it attacks with its
   first skill, and its attack passives fire. A passive behind a cooldown is
   left to the monster's own first turn. */
function jointAttackSkills(read: readonly ReadSkill[]): SpeedSkill[] {
  return read.flatMap(({ skill, effects }): SpeedSkill[] => {
    const joins = skill.passive
      ? !skill.cooldown && firesOnOwnAttack(skill.description)
      : skill.slot === 1;
    const brought = effects.filter((effect) => effect.kind !== 'pull-allies');
    return joins && brought.length > 0 ? [{ name: skill.name, passive: skill.passive, turns: 'every', effects: brought }] : [];
  });
}

function readSkills(monster: GameRecord): ReadSkill[] {
  return ownSkills(monster).map(({ skill, level }) => ({ skill, ...turnEffects(skill, level) }));
}

/**
 * The skills a monster's turns are read with. `teammates` are the others on its
 * team: a skill that pulls allies into a joint attack is used only where one of
 * them has something to bring, and otherwise counts for nothing here.
 */
export function speedSkillProfile(monster: GameRecord, teammates: readonly GameRecord[] = []): SpeedSkillProfile {
  const read = readSkills(monster);
  const worthPulling = teammates.some((teammate) => teammate !== monster && jointAttackSkills(readSkills(teammate)).length > 0);
  const owned = read.map(({ skill, effects }) => ({
    skill,
    effects: worthPulling ? effects : effects.filter((effect) => effect.kind !== 'pull-allies'),
  })).filter((entry) => entry.effects.length > 0);
  const byWeight = owned.filter(({ skill }) => !skill.passive)
    .sort((left, right) => activeWeight(right.effects) - activeWeight(left.effects));
  const opening = byWeight[0];
  const repeated = byWeight.find(({ skill }) => !skill.cooldown);
  const passives = owned.filter(({ skill }) => skill.passive);
  const counted = (entry: { skill: SnapshotSkill; effects: TurnEffect[] }, turns: SkillTurns): SpeedSkill =>
    ({ name: entry.skill.name, passive: entry.skill.passive, turns, effects: entry.effects });
  const used = [
    ...(opening === undefined ? [] : [counted(opening, opening === repeated ? 'every' : 'first')]),
    ...(repeated === undefined || repeated === opening ? [] : [counted(repeated, 'later')]),
    ...passives.map((entry) => counted(entry, entry.skill.cooldown ? 'first' : 'every')),
  ];
  return {
    used,
    effects: used.flatMap((skill) => skill.effects),
    firstTurn: used.filter((skill) => skill.turns !== 'later').flatMap((skill) => skill.effects),
    laterTurns: used.filter((skill) => skill.turns !== 'first').flatMap((skill) => skill.effects),
    jointAttack: jointAttackSkills(read),
    similarBoostPassive: passives.some(({ effects }) => effects.some((effect) => effect.kind === 'allies-attack-bar')),
    uncounted: read.filter((entry) => entry.uncounted).map((entry) => entry.skill.name),
    capsOthersSpeed: hasSpeedCap(monster),
  };
}

/** An attack-bar amount, in hundredths of a percent, as a percent with at most one decimal: `34.5`. */
export function attackBarPercent(amount: number): string {
  const value = amount / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

const targetWords: Record<AllyTarget, string> = {
  'lowest-attack-bar': 'lowest attack bar',
  'highest-attack-bar': 'highest attack bar',
};

export function describeTurnEffect(effect: TurnEffect): string {
  switch (effect.kind) {
    case 'allies-attack-bar': return `+${attackBarPercent(effect.amount)} % attack bar to allies`;
    case 'ally-attack-bar': return `+${attackBarPercent(effect.amount)} % attack bar to the ally with the ${targetWords[effect.target]}`;
    case 'self-attack-bar': return `+${attackBarPercent(effect.amount)} % own attack bar`;
    case 'allies-speed-buff': return `speed buff to allies for ${effect.turns} turns`;
    case 'ally-speed-buff': return `speed buff to the ally with the ${targetWords[effect.target]} for ${effect.turns} turns`;
    case 'self-speed-buff': return `own speed buff for ${effect.turns} turns`;
    case 'pull-allies': return effect.count === 1 ? 'an ally attacks together' : `up to ${effect.count} allies attack together`;
  }
}

const skillTurnWords: Record<SkillTurns, string> = {
  every: 'every turn',
  first: 'first turn only',
  later: 'later turns',
};

/** A counted skill as the page names it: `Team Up: an ally attacks together (first turn only)`. */
export function describeSpeedSkill(skill: SpeedSkill): string {
  return `${skill.name}: ${skill.effects.map(describeTurnEffect).join(', ')} (${skillTurnWords[skill.turns]})`;
}

/** A one-ally boost as the tag between two slots names it: `+100 % ATB → Teshar`. */
export function shortAllyBoost(amount: number, recipient: string): string {
  return `+${attackBarPercent(amount)} % ATB → ${recipient}`;
}

/**
 * The same effect in a few characters, for the tag a team table hangs between
 * two slots. A speed buff's potency is the recipient's own (`speedBuffPotency`),
 * so a figure is printed only where the caller names the one recipient's —
 * `recipientPotency` — and an "all allies" buff, worth something different on
 * each, reads `SPD buff`.
 */
export function shortTurnEffect(effect: TurnEffect, recipientPotency?: number): string {
  const spd = statLabels.spd;
  switch (effect.kind) {
    case 'allies-attack-bar': return `+${attackBarPercent(effect.amount)} % ATB`;
    case 'ally-attack-bar': return `+${attackBarPercent(effect.amount)} % ATB · 1 ally`;
    case 'self-attack-bar': return `+${attackBarPercent(effect.amount)} % own ATB`;
    case 'allies-speed-buff': return `${spd} buff · ${effect.turns} turns`;
    case 'ally-speed-buff': return `${recipientPotency === undefined ? `${spd} buff` : `+${recipientPotency} % ${spd}`} · 1 ally`;
    case 'self-speed-buff': return recipientPotency === undefined ? `own ${spd} buff` : `+${recipientPotency} % own ${spd}`;
    case 'pull-allies': return `team-up · ${effect.count}`;
  }
}

/** A boost that moves somebody else's turn — what earns a monster its mark in a team. */
export function boostsAllies(profile: SpeedSkillProfile): boolean {
  return profile.effects.some((effect) => effect.kind !== 'self-attack-bar' && effect.kind !== 'self-speed-buff');
}
