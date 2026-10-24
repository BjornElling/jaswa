import type { AreaFacts } from '../lib/area-facts';
import type { FigureMark } from '../lib/figure-marks';
import { leadMaximum, readLeadField } from '../lib/monster-preferences';
import type { Leads, LeadStat } from '../lib/monster-stats';
import { describeLeaderSkill, leaderAreaPhrase, leaderSkillStat } from '../lib/speed-skills';
import type { LeaderSkill } from '../lib/speed-skills';
import { statLabels } from '../lib/stat-labels';
import type { TeamLead, TeamLeadReading } from '../lib/team-leads';
import { monsterPresentation } from '../lib/monster-catalog';
import { formatNumber } from '../lib/formatting';
import type { GeneralSettings } from '../lib/types';
import { FigureMarks } from './figure-marks';
import { MonsterPortrait } from './monster-portrait';

/**
 * What a fight adds to a copy, drawn once for the two places that state it: the
 * monster profile, whose answers are the defaults, and Rune Optimization, which
 * may change them for one calculation. The leads a preset fights under, the
 * leads Scenario states by hand, and what the area sets against the team.
 */

/* The four leads Scenario states, in the order the user asked for them: the
   crit lead first, as it was alone before the others joined it. */
const leadRows: ReadonlyArray<{ stat: LeadStat; label: string }> = [
  { stat: 'criRate', label: statLabels.criRate },
  { stat: 'atk', label: statLabels.atk },
  { stat: 'def', label: statLabels.def },
  { stat: 'hp', label: statLabels.hp },
];

/** Scenario's leads, typed: one field a stat, empty for none and `0` for a stated zero. */
export function LeadFields({ values, onChange, reading, names }: {
  values: Leads;
  onChange: (stat: LeadStat, value: number | undefined) => void;
  reading: TeamLeadReading;
  names: Record<string, string>;
}) {
  return <div className="overlay-leads-fields" role="group" aria-label="Leads and bonuses">
    <div className="overlay-lead-grid">
      {leadRows.map((row) => <label className="overlay-lead" key={row.stat}>
        <span>{row.label}</span>
        <input type="number" min={0} max={leadMaximum} step={1} inputMode="numeric"
          aria-label={`${row.label}, in percent`} placeholder="—" value={values[row.stat] ?? ''}
          onChange={(event) => onChange(row.stat, readLeadField(event.target.value))} />
        <span>%</span>
      </label>)}
    </div>
    {reading.leads.some((lead) => lead.automatic !== undefined) && <AutomaticBonusRows
      leads={reading.leads.filter((lead) => lead.automatic !== undefined)} names={names}
      listLabel="Automatic passive stat bonuses" className="overlay-lead-bonus-list" />}
  </div>;
}

function AutomaticBonusRow({ lead, names }: { lead: TeamLead; names: Record<string, string> }) {
  const bonus = lead.automatic;
  if (bonus === undefined) return null;
  const display = monsterPresentation(bonus.sourceMasterId);
  const name = names[bonus.sourceUnitId] ?? display.name;
  return <li className="overlay-team-lead" title={`${name}: ${bonus.description}`}
    aria-label={`${name}, ${statLabels[bonus.stat]} ${bonus.value}. ${bonus.description}`}>
    <MonsterPortrait imageFilename={display.imageFilename} initial={display.shortName} name={name} decorative />
    <span className="overlay-team-lead-stat">{statLabels[bonus.stat]}</span>
    <span className="overlay-team-lead-value">{bonus.value}</span>
    <span aria-hidden="true" />
  </li>;
}

/** Passive additions use the same portrait, stat and value columns as leader rows. */
function AutomaticBonusRows({ leads, names, listLabel, className = '' }: {
  leads: readonly TeamLead[];
  names: Record<string, string>;
  listLabel: string;
  className?: string;
}) {
  return <ul className={`overlay-team-leads ${className}`} aria-label={listLabel}>
    {leads.length === 0 && <li className="overlay-team-lead overlay-team-lead-note">
      <span>No automatic passive stat bonuses</span>
    </li>}
    {leads.map((lead) => <AutomaticBonusRow key={`${lead.automatic?.sourceUnitId}-${lead.automatic?.stat}`} lead={lead} names={names} />)}
  </ul>;
}

/* Why a lead the team fights under does nothing for this copy, for the red mark
   after it. The lead stays listed: it is the team's, and the copy is in it. */
function unreachedReading(lead: TeamLead, counting: TeamLead | undefined, names: Record<string, string>): string {
  const skill = lead.skill as LeaderSkill;
  switch (lead.reach) {
    case 'area': return `Only counts ${leaderAreaPhrase(skill)}.`;
    case 'element': return `Only counts on ${skill.element} monsters.`;
    case 'outranked': return `${leaderSkillStat(skill)} leads for the same monsters do not stack: ${counting?.skill
      ? `${names[counting.unitId] ?? 'another leader'}'s +${counting.skill.percent}% counts instead` : 'another counts instead'}.`;
    default: return '';
  }
}

/**
 * The leads a preset's team fights under, as its leaders have them: one line
 * per leader, one under another — Rift Raid fights under three. A lead that
 * does nothing for this copy stays on its line, muted and struck through, and
 * its red mark says where it would count. Read only: the leader is chosen with
 * the crown on Presets, or in the game.
 */
export function TeamLeads({ reading, names }: {
  reading: TeamLeadReading;
  names: Record<string, string>;
}) {
  const actualLeads = reading.leads.filter((lead) => lead.automatic === undefined);
  return <div className="overlay-team-bonuses overlay-leads-fields" role="group" aria-label="Leads and bonuses">
    <ul className="overlay-team-leads" aria-label="Leads and bonuses">
      {actualLeads.length === 0 && !reading.scenario
        && <li className="overlay-team-lead overlay-team-lead-note"><span>No leader in this preset</span></li>}
      {reading.leads.map((lead, at) => {
        if (lead.automatic !== undefined) {
          return <AutomaticBonusRow key={`${lead.automatic.sourceUnitId}-${lead.automatic.stat}`} lead={lead} names={names} />;
        }
        const name = names[lead.unitId] ?? 'A leader';
        const where = `${name}, leader of ${lead.presetName}`;
        /* The leader's face, small enough to sit inside the line: which lead is
           whose is read at a glance, and the line keeps its height. */
        const display = lead.masterId === null ? undefined : monsterPresentation(lead.masterId);
        const face = <MonsterPortrait imageFilename={display?.imageFilename} initial={display?.shortName ?? ''} name={name} decorative />;
        if (lead.skill === null) {
          return <li key={`${lead.presetId}-${at}`} className="overlay-team-lead overlay-team-lead-note" title={where}>
            {face}<span>{lead.missing ? 'Leader not in this import' : `${name}: no leader skill`}</span>
          </li>;
        }
        const counts = lead.reach === 'counts';
        const counting = reading.leads.find((other) => other.reach === 'counts' && other.skill?.attribute === lead.skill?.attribute
          && other.skill?.element === lead.skill?.element);
        const marks: FigureMark[] = counts ? [] : [{ key: 'unreached', tone: 'red', glyph: 'info', reading: unreachedReading(lead, counting, names) }];
        return <li key={`${lead.presetId}-${at}`} className="overlay-team-lead" data-state={counts ? 'counts' : 'unreached'}
          title={`${where}: ${describeLeaderSkill(lead.skill)}`}>
          {face}
          <span className="overlay-team-lead-stat">{leaderSkillStat(lead.skill)}</span>
          <span className="overlay-team-lead-value">{lead.skill.percent}%</span>
          <FigureMarks marks={marks} reserve={1} />
        </li>;
      })}
    </ul>
  </div>;
}

/**
 * The area's lines under its own heading, which the caller sets in its own
 * voice. A long label ends in an ellipsis rather than pushing the figure off
 * its fixed column.
 */
export function AreaLines({ facts, general, reserveThresholdRows = false }: {
  facts: AreaFacts;
  general: GeneralSettings;
  reserveThresholdRows?: boolean;
}) {
  if (reserveThresholdRows && facts.thresholds.length > 3) {
    throw new Error('The area block reserves three monster-threshold rows.');
  }
  const number = (value: number) => formatNumber(value, general);
  const thresholdRows = reserveThresholdRows ? Array.from({ length: 3 }, (_, index) => facts.thresholds[index]) : facts.thresholds;
  return <div className={`overlay-accuracy${reserveThresholdRows ? ' overlay-accuracy-thresholds' : ''}`}>
    {facts.lines.map((line) => <div className="overlay-accuracy-goal" key={line.label}>
      <p className="overlay-accuracy-label" title={line.label}>{line.label}</p>
      <p className="overlay-accuracy-value">{line.value}</p>
    </div>)}
    {thresholdRows.map((threshold, index) => {
      const display = threshold ? monsterPresentation(threshold.masterId) : undefined;
      const value = threshold
        ? threshold.points.map((point) => `${point.relation === 'greater-than' ? '>' : ''}${number(point.value)}`).join('/')
        : '';
      const stat = threshold ? statLabels[threshold.stat] : '';
      const description = threshold ? `${threshold.reference ? `${threshold.reference}: ` : ''}${threshold.points.map((point) => `${point.relation === 'greater-than'
        ? `Combat ${stat} must be greater than ${number(point.value)}`
        : `At least ${number(point.value)} combat ${stat}`}: ${point.effect}`).join(' ')}` : '';
      return <div className={`overlay-combat-threshold${threshold ? '' : ' overlay-combat-threshold-placeholder'}`}
        key={`threshold-slot-${index}`} title={threshold ? `${display?.name}: ${description}` : undefined}
        aria-label={threshold && display ? `${display.name}, ${stat} ${value}. ${description}` : undefined}
        role={threshold ? 'group' : undefined} aria-hidden={threshold ? undefined : true}>
        <MonsterPortrait imageFilename={display?.imageFilename} initial={display?.shortName ?? ''} name={display?.name ?? ''} decorative />
        <span className="overlay-combat-threshold-stat">{stat}</span>
        <span className="overlay-combat-threshold-value">{value}</span>
      </div>;
    })}
  </div>;
}
