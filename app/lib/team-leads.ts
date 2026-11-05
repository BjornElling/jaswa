/**
 * The leads a preset's team fights under, read off the leaders the game saved
 * rather than stated by hand (`RUNE-OPTIMIZATION.md` §2.2.3).
 *
 * A preset's leader is the game's — `leader_unit_id`, or the first monster of an
 * Arena defense (`deck-presets.ts`) — or the crown's on a preset built here, so
 * the only lead the user still types is Scenario's, which is no team and has no
 * leader. Every reader of a preset's fight takes its leads from here: the
 * profile's *Leads and bonuses*, the composites on Monster Stats, Rune
 * Optimization, and the speed leads Speed Tuning counts.
 */
import { areaElementAdvantage } from './element-advantage';
import type { AreaElementAdvantage } from './element-advantage';
import type { GameRecord } from './game-data';
import type { Leads, LedStat, TeammateSets } from './monster-stats';
import {
  grantsBoomerangWarriorAccuracy, grantsShainaPassive, personalPassiveStatBonus, shainaAccuracyBonus,
} from './passive-stat-bonuses';
import type { AutomaticStatLine, PassiveStatBonus, PassiveStatRule } from './passive-stat-bonuses';
import { isRecord } from './preference-reading';
import { teammateSetsInPreset } from './presets';
import type { AccountItems, Preset } from './presets';
import { elementName } from './rune-sets';
import { speedContent } from './speed-contents';
import { leaderSkill } from './speed-skills';
import type { LeaderAttribute, LeaderSkill } from './speed-skills';
import { leadReaches } from './speed-tick';
import type { LeadReach, SpeedArea } from './speed-tick';

/** One leader whose skill a preset's team fights under, and the deck it leads. */
export type BattleLeader = { unitId: string; presetId: string; presetName: string };

/**
 * Every leader a preset's team fights under: its own, and where its content
 * fights several decks in one battle (`battleDecks`, Rift Raid 1–3), the
 * leaders of the battle's other decks after it, in deck order. A preset built
 * in JASWA has no deck number, so it is a battle of its own.
 */
export function battleLeaders(preset: Preset, presets: readonly Preset[]): BattleLeader[] {
  const own = (entry: Preset): BattleLeader[] => entry.leaderUnitId === null ? []
    : [{ unitId: entry.leaderUnitId, presetId: entry.id, presetName: entry.name }];
  const decks = preset.content?.battleDecks;
  if (preset.kind !== 'game' || !decks || preset.number === null || !decks.includes(preset.number)) return own(preset);
  const others = presets
    .filter((entry) => entry !== preset && entry.kind === 'game' && entry.content?.id === preset.content?.id
      && entry.number !== null && decks.includes(entry.number))
    .sort((left, right) => (left.number ?? 0) - (right.number ?? 0));
  return [...own(preset), ...others.flatMap(own)];
}

/** The area a preset's leads are judged in: its content's, or a preset not yet named. */
export function leadArea(preset: Pick<Preset, 'content'>): SpeedArea {
  return preset.content === null ? 'unnamed' : speedContent(preset.content.speed).area;
}

/**
 * One leader as a member reads it. `skill` is `null` where the leader has none,
 * and `missing` where the import no longer holds the leader at all, so its lead
 * cannot be read. `reach` says whether a lead counts for this member, and why
 * not where it does not; only a read lead has one.
 */
export type TeamLead = BattleLeader & {
  masterId: string | null;
  skill: LeaderSkill | null;
  missing: boolean;
  reach: LeadReach | null;
  automatic?: AutomaticStatLine;
};

/** What the leads add, stat by stat. */
export type TeamLeadReading = {
  leads: readonly TeamLead[];
  bonuses: Leads;
  rules: readonly PassiveStatRule[];
  automaticLines: readonly AutomaticStatLine[];
  scenario: boolean;
};

const statOf: Readonly<Record<LeaderAttribute, LedStat>> = {
  'Attack Power': 'atk', Defense: 'def', HP: 'hp', 'Critical Rate': 'criRate', 'Critical DMG': 'criDmg',
  Accuracy: 'acc', Resistance: 'res', 'Attack Speed': 'spd',
};

/**
 * The leaders and automatic additions one member fights under. Scenario has no
 * leaders, but still reads the copy's own automatic passives. `roster` is every
 * copy the import holds by unit id: a leader may stand in another deck.
 */
export function teamLeadsFor(preset: Preset, presets: readonly Preset[], unitId: string,
  roster: ReadonlyMap<string, GameRecord>): TeamLeadReading {
  const member = roster.get(unitId);
  const read = (preset.kind === 'scenario' ? [] : battleLeaders(preset, presets)).map((leader) => {
    const record = roster.get(leader.unitId);
    const masterId = record === undefined ? null : String(record.unit_master_id ?? '');
    return { ...leader, masterId, skill: record === undefined ? null : leaderSkill(record.unit_master_id), missing: record === undefined };
  });
  const skills = read.flatMap((lead) => lead.skill === null ? [] : [lead.skill]);
  const reaches = leadReaches(skills, leadArea(preset), elementName(member?.attribute) ?? null);
  let next = 0;
  const rows: TeamLead[] = read.map((lead) => ({ ...lead, reach: lead.skill === null ? null : reaches[next++] }));
  const bonuses: Leads = {};
  for (const lead of rows) {
    /* A general lead and an element's lead of one stat both count, and add up. */
    if (lead.reach === 'counts' && lead.skill !== null) {
      const stat = statOf[lead.skill.attribute];
      bonuses[stat] = (bonuses[stat] ?? 0) + lead.skill.percent;
    }
  }
  const personal = personalPassiveStatBonus(unitId, member?.unit_master_id);
  const passiveSources: PassiveStatBonus[] = personal === undefined ? [] : [personal];
  if (preset.kind !== 'scenario' && grantsBoomerangWarriorAccuracy(member?.unit_master_id)) {
    const shainaId = preset.members.find((sourceUnitId) => {
      const source = roster.get(sourceUnitId);
      return source !== undefined && grantsShainaPassive(source.unit_master_id);
    });
    if (shainaId !== undefined) {
      const source = roster.get(shainaId);
      if (source !== undefined) passiveSources.push(shainaAccuracyBonus(shainaId, source.unit_master_id));
    }
  }
  const automaticLines: AutomaticStatLine[] = [];
  const rules: PassiveStatRule[] = [];
  for (const source of passiveSources) {
    for (const addition of source.effects) {
      const base = addition.stat === 'hp' ? Number(member?.con) * 15 : Number(member?.[addition.stat]);
      const contribution = addition.kind !== 'flat' ? addition.amount
        : Number.isFinite(base) && base > 0 ? addition.amount * 100 / base : 0;
      const line: AutomaticStatLine = {
        sourceUnitId: source.sourceUnitId,
        sourceMasterId: source.sourceMasterId,
        stat: addition.stat,
        value: addition.kind === 'basePercent' ? `+${addition.amount}%` : `+${addition.amount}`,
        contribution,
        description: source.scope === 'team'
          ? 'Adds +25 ACC points to every Boomerang Warrior in this preset.'
          : grantsShainaPassive(source.sourceMasterId) ? 'Adds +25 ACC points to Shaina herself.'
          : addition.kind === 'basePercent' ? `Adds +${addition.amount}% of base ${addition.stat.toUpperCase()} at battle start.`
            : addition.kind === 'flat' ? `Adds +${addition.amount} fixed ${addition.stat.toUpperCase()} to combat speed.`
              : `Adds +${addition.amount} ${addition.stat.toUpperCase()} points.`,
      };
      automaticLines.push(line);
      bonuses[addition.stat] = (bonuses[addition.stat] ?? 0) + contribution;
      rows.push({ unitId: source.sourceUnitId, presetId: preset.id, presetName: preset.name,
        masterId: source.sourceMasterId, skill: null, missing: false, reach: 'counts', automatic: line });
    }
    rules.push(...source.rules);
    for (const rule of source.rules) {
      const statRows = rule.kind === 'defenseFromAttack'
        ? [{ stat: 'def' as const, value: `+${rule.percent}% ATK` }]
        : [{ stat: 'atk' as const, value: 'max(ATK, DEF)' }, { stat: 'def' as const, value: 'max(ATK, DEF)' }];
      for (const { stat, value } of statRows) {
        const line: AutomaticStatLine = { sourceUnitId: source.sourceUnitId, sourceMasterId: source.sourceMasterId,
          stat, value, contribution: 0, description: rule.summary };
        automaticLines.push(line);
        rows.push({ unitId: source.sourceUnitId, presetId: preset.id, presetName: preset.name,
          masterId: source.sourceMasterId, skill: null, missing: false, reach: 'counts', automatic: line });
      }
    }
  }
  return { leads: rows, bonuses, rules, automaticLines, scenario: preset.kind === 'scenario' };
}

/**
 * What a preset's team adds to one member's fight: its teammates' completed
 * team sets, its lead reading, and element advantage where its area settles it.
 * Scenario adds the profile's stated leads to that reading; preset readings
 * already contain the game's leaders.
 */
export type TeamBonuses = {
  teammateSets: TeammateSets;
  leads: TeamLeadReading;
  /**
   * Set where every enemy of the preset's area is one element this member beats
   * (`element-advantage.ts`): advantage is then a fact of the area, not a choice
   * of the profile's, so every reader counts it and no switch can turn it off.
   */
  elementAdvantage: AreaElementAdvantage | null;
};

export const noTeamBonuses: TeamBonuses = { teammateSets: {}, leads: {
  leads: [], bonuses: {}, rules: [], automaticLines: [], scenario: true,
}, elementAdvantage: null };

export function teamBonusesFor(preset: Preset, presets: readonly Preset[], unitId: string, items: AccountItems,
  roster: ReadonlyMap<string, GameRecord>): TeamBonuses {
  return {
    teammateSets: teammateSetsInPreset(preset, unitId, items),
    leads: teamLeadsFor(preset, presets, unitId, roster),
    elementAdvantage: areaElementAdvantage(preset.content, roster.get(unitId)?.attribute),
  };
}

/** Every copy the import holds, by unit id, for reading a leader wherever it stands. */
export function rosterOf(game: GameRecord | undefined): Map<string, GameRecord> {
  const units = Array.isArray(game?.unit_list) ? game.unit_list : [];
  return new Map(units.flatMap((unit) => isRecord(unit) && unit.unit_id !== undefined && unit.unit_id !== null
    ? [[String(unit.unit_id), unit] as const] : []));
}
