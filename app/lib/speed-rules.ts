/**
 * Reads one standing rule against the current import. A rule is a reminder
 * about a monster on its own — "at least 160", "after Lushen" — and is judged
 * apart from every team on the page: no leader, no booster, no field
 * position, only the monster's runes and the account's totem.
 *
 * Every figure comes from `speed-tick.ts` and every turn order from its clock.
 * This module decides which figures a rule compares and how to say so.
 */
import type { GameRecord } from './game-data';
import { monsterSpeedParts } from './monster-stats';
import { combatSpeed, everyoneMoved, runeSpeedForDisplay, simulateBattle } from './speed-tick';
import type { TickUnit } from './speed-tick';
import { nearestPassingDisplaySpeeds } from './speed-tuning-analysis';
import type { DisplaySpeedInterval } from './speed-tuning-analysis';
import type { SpeedRule, SpeedRuleKind, SpeedRuleMust } from './speed-tuning-preferences';

export type SpeedRuleForm = 'displaySpeed' | 'dungeonSpeed' | 'arenaSpeed';

/* In the order the overlay ticks them: the figure the user reads off the
   monster screen first, the two combat speeds after it. */
export const speedRuleForms: readonly { id: SpeedRuleForm; name: string }[] = [
  { id: 'displaySpeed', name: 'Display speed' },
  { id: 'dungeonSpeed', name: 'Dungeon speed' },
  { id: 'arenaSpeed', name: 'Arena speed' },
];

/** What the second half of a rule names: another monster, one figure, or two. */
export type SpeedRuleTarget = 'monster' | 'figure' | 'range';

/** The choices under "Must", each read as the verb of the rule's sentence. */
export const speedRuleKinds: readonly { kind: SpeedRuleKind; label: string; target: SpeedRuleTarget }[] = [
  { kind: 'move-before', label: 'Move before', target: 'monster' },
  { kind: 'move-after', label: 'Move after', target: 'monster' },
  { kind: 'reach-at-least', label: 'Reach at least', target: 'figure' },
  { kind: 'stay-at-most', label: 'Stay at most', target: 'figure' },
  { kind: 'stay-between', label: 'Stay between', target: 'range' },
];

export function speedRuleKind(kind: SpeedRuleKind) {
  return speedRuleKinds.find((entry) => entry.kind === kind) ?? speedRuleKinds[0];
}

export type SpeedRuleFormReading = {
  form: SpeedRuleForm;
  checked: boolean;
  /** The rule's monster in this speed form. */
  own: number;
  /** The other monster in this speed form, for a turn-order rule. */
  other: number | null;
  /**
   * `tie` is a turn-order rule meeting an exact tie: in display speed the two
   * are level, in combat the bars fill alike and field position decides —
   * which a rule, judged outside any team, cannot know. Neither is a pass.
   */
  state: 'holds' | 'broken' | 'tie';
  /** The rule's monster's display speeds at which this form would hold, the other monster held where it is. */
  interval: DisplaySpeedInterval | null;
};

export type SpeedRuleReading =
  /** A monster the rule names that the import no longer holds. */
  | { kind: 'missing'; unitIds: string[] }
  /** All three speed forms, ticked or not, so the overlay can show what ticking one would say. */
  | { kind: 'read'; forms: SpeedRuleFormReading[] };

export type SpeedRuleVerdict = 'good' | 'bad' | 'none';

type Sheet = { baseSpeed: number; swift: boolean; displaySpeed: number };

/* Arena speed and dungeon speed part only by a leader skill, and a rule has
   no team and so no leader: for a lone monster the two are the same figure.
   Both stay, because where a reminder belongs is the user's to say. */
function figure(form: SpeedRuleForm, sheet: Sheet, shown: number, totemPercent: number): number {
  if (form === 'displaySpeed') return shown;
  return combatSpeed({
    baseSpeed: sheet.baseSpeed,
    swift: sheet.swift,
    percentOfBase: totemPercent,
    runeSpeed: runeSpeedForDisplay(sheet.baseSpeed, sheet.swift, shown),
  });
}

/* Two monsters alone on the clock: which first turn comes first, and whether
   only an exact tie on the bar decided it. Display speed has no clock; there
   the higher figure is the faster monster. */
function order(form: SpeedRuleForm, own: number, other: number): 'before' | 'tie' | 'after' {
  if (form === 'displaySpeed') return own > other ? 'before' : own === other ? 'tie' : 'after';
  const units: TickUnit[] = [
    { key: 'own', side: 'ally', speed: own, buffedSpeed: own, effects: [] },
    { key: 'other', side: 'ally', speed: other, buffedSpeed: other, effects: [] },
  ];
  const first = simulateBattle(units, { done: everyoneMoved(['own']) }).events[0];
  if (!first) return 'after';
  if (first.tiedWith.length > 0) return 'tie';
  return first.key === 'own' ? 'before' : 'after';
}

function judge(must: SpeedRuleMust, form: SpeedRuleForm, own: number, other: number | null): SpeedRuleFormReading['state'] {
  switch (must.kind) {
    case 'move-before':
    case 'move-after': {
      const relation = order(form, own, other ?? 0);
      if (relation === 'tie') return 'tie';
      return relation === (must.kind === 'move-before' ? 'before' : 'after') ? 'holds' : 'broken';
    }
    case 'reach-at-least': return own >= must.speed ? 'holds' : 'broken';
    case 'stay-at-most': return own <= must.speed ? 'holds' : 'broken';
    case 'stay-between': return own >= must.minimum && own <= must.maximum ? 'holds' : 'broken';
  }
}

export function readSpeedRule(rule: SpeedRule, monsters: ReadonlyMap<string, GameRecord>, totemPercent: number): SpeedRuleReading {
  const otherUnitId = rule.must.kind === 'move-before' || rule.must.kind === 'move-after' ? rule.must.unitId : null;
  const missing = [rule.unitId, otherUnitId].filter((unitId): unitId is string => unitId !== null && !monsters.has(unitId));
  if (missing.length > 0) return { kind: 'missing', unitIds: missing };
  const ownSheet = monsterSpeedParts(monsters.get(rule.unitId) as GameRecord);
  const otherSheet = otherUnitId === null ? null : monsterSpeedParts(monsters.get(otherUnitId) as GameRecord);
  return {
    kind: 'read',
    forms: speedRuleForms.map(({ id: form }) => {
      const other = otherSheet === null ? null : figure(form, otherSheet, otherSheet.displaySpeed, totemPercent);
      const at = (shown: number) => judge(rule.must, form, figure(form, ownSheet, shown, totemPercent), other);
      const state = at(ownSheet.displaySpeed);
      return {
        form,
        checked: rule[form],
        own: figure(form, ownSheet, ownSheet.displaySpeed, totemPercent),
        other,
        state,
        interval: state === 'holds' ? null
          : nearestPassingDisplaySpeeds(ownSheet.baseSpeed, ownSheet.swift, ownSheet.displaySpeed, (shown) => at(shown) === 'holds'),
      };
    }),
  };
}

/** Whether the rule holds in every speed form it is checked in. Ticked in none, it says nothing. */
export function speedRuleVerdict(rule: SpeedRule, reading: SpeedRuleReading): SpeedRuleVerdict {
  if (!speedRuleForms.some(({ id }) => rule[id])) return 'none';
  if (reading.kind === 'missing') return 'bad';
  return reading.forms.every((entry) => !entry.checked || entry.state === 'holds') ? 'good' : 'bad';
}

/** Where a rule is checked, as one phrase: "Display speed and arena speed". */
export function speedRuleScopeText(rule: SpeedRule): string {
  const names = speedRuleForms.filter(({ id }) => rule[id]).map(({ name }, at) => at === 0 ? name : name.toLowerCase());
  if (names.length === 0) return 'Checked nowhere yet';
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The rule as one sentence: "Megan must move before Lushen", "Megan must reach at least 160". */
export function speedRuleSentence(rule: SpeedRule, nameOf: (unitId: string) => string, figureText: (value: number) => string): string {
  const { must } = rule;
  const subject = `${nameOf(rule.unitId)} must ${speedRuleKind(must.kind).label.toLowerCase()}`;
  switch (must.kind) {
    case 'move-before':
    case 'move-after': return `${subject} ${nameOf(must.unitId)}`;
    case 'reach-at-least':
    case 'stay-at-most': return `${subject} ${figureText(must.speed)}`;
    case 'stay-between': return `${subject} ${figureText(must.minimum)} and ${figureText(must.maximum)}`;
  }
}
