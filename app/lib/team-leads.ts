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
import type { GameRecord } from './game-data';
import type { Leads, LedStat, TeammateSets } from './monster-stats';
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
export type TeamLead = BattleLeader & { masterId: string | null; skill: LeaderSkill | null; missing: boolean; reach: LeadReach | null };

/** What the leads add, stat by stat; SPD apart, as no figure here reads it. */
export type TeamLeadReading = { leads: readonly TeamLead[]; bonuses: Leads };

const statOf: Readonly<Record<LeaderAttribute, LedStat | null>> = {
  'Attack Power': 'atk', Defense: 'def', HP: 'hp', 'Critical Rate': 'criRate', 'Critical DMG': 'criDmg',
  Accuracy: 'acc', Resistance: 'res', 'Attack Speed': null,
};

/**
 * The leads one member of a preset fights under, or `null` for Scenario, whose
 * leads are the profile's own. `roster` is every copy the import holds by unit
 * id: a leader may stand in another deck of the battle.
 */
export function teamLeadsFor(preset: Preset, presets: readonly Preset[], unitId: string,
  roster: ReadonlyMap<string, GameRecord>): TeamLeadReading | null {
  if (preset.kind === 'scenario') return null;
  const member = roster.get(unitId);
  const read = battleLeaders(preset, presets).map((leader) => {
    const record = roster.get(leader.unitId);
    const masterId = record === undefined ? null : String(record.unit_master_id ?? '');
    return { ...leader, masterId, skill: record === undefined ? null : leaderSkill(record.unit_master_id), missing: record === undefined };
  });
  const skills = read.flatMap((lead) => lead.skill === null ? [] : [lead.skill]);
  const reaches = leadReaches(skills, leadArea(preset), elementName(member?.attribute) ?? null);
  let next = 0;
  const leads: TeamLead[] = read.map((lead) => ({ ...lead, reach: lead.skill === null ? null : reaches[next++] }));
  const bonuses: Leads = {};
  for (const lead of leads) {
    const stat = lead.skill === null ? null : statOf[lead.skill.attribute];
    if (lead.reach === 'counts' && stat !== null && lead.skill !== null) bonuses[stat] = lead.skill.percent;
  }
  return { leads, bonuses };
}

/**
 * What a preset's team adds to one member's fight: its teammates' completed
 * team sets, and the leads it fights under — `null` in Scenario, where the
 * profile states them.
 */
export type TeamBonuses = { teammateSets: TeammateSets; leads: TeamLeadReading | null };

export const noTeamBonuses: TeamBonuses = { teammateSets: {}, leads: null };

export function teamBonusesFor(preset: Preset, presets: readonly Preset[], unitId: string, items: AccountItems,
  roster: ReadonlyMap<string, GameRecord>): TeamBonuses {
  return { teammateSets: teammateSetsInPreset(preset, unitId, items), leads: teamLeadsFor(preset, presets, unitId, roster) };
}

/** Every copy the import holds, by unit id, for reading a leader wherever it stands. */
export function rosterOf(game: GameRecord | undefined): Map<string, GameRecord> {
  const units = Array.isArray(game?.unit_list) ? game.unit_list : [];
  return new Map(units.flatMap((unit) => isRecord(unit) && unit.unit_id !== undefined && unit.unit_id !== null
    ? [[String(unit.unit_id), unit] as const] : []));
}
