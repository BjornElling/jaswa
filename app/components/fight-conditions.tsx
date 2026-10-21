import { accuracyCeilings } from '../lib/accuracy-ceiling';
import type { FigureMark } from '../lib/figure-marks';
import { leadMaximum, readLeadField } from '../lib/monster-preferences';
import { monsterProfileAreaName } from '../lib/monster-profile-scope';
import type { Leads, LeadStat } from '../lib/monster-stats';
import type { Preset } from '../lib/presets';
import { describeLeaderSkill, leaderAreaPhrase, leaderSkillStat } from '../lib/speed-skills';
import type { LeaderSkill } from '../lib/speed-skills';
import { statLabels } from '../lib/stat-labels';
import type { TeamLead, TeamLeadReading } from '../lib/team-leads';
import { monsterPresentation } from '../lib/monster-catalog';
import { FigureMarks } from './figure-marks';
import { MonsterPortrait } from './monster-portrait';

/**
 * What a fight adds to a copy, drawn once for the two places that state it: the
 * monster profile, whose answers are the defaults, and Rune Optimization, which
 * may change them for one calculation. The leads a preset fights under, the
 * leads Scenario states by hand, and the Accuracy the area can use.
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
export function LeadFields({ values, onChange }: {
  values: Leads;
  onChange: (stat: LeadStat, value: number | undefined) => void;
}) {
  return <div className="overlay-leads-fields" role="group" aria-label="Leads and bonuses">
    {leadRows.map((row) => <label className="overlay-lead" key={row.stat}>
      <span>{row.label}</span>
      <input type="number" min={0} max={leadMaximum} step={1} inputMode="numeric"
        aria-label={`${row.label}, in percent`} placeholder="—" value={values[row.stat] ?? ''}
        onChange={(event) => onChange(row.stat, readLeadField(event.target.value))} />
      <span>%</span>
    </label>)}
  </div>;
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
export function TeamLeads({ reading, names }: { reading: TeamLeadReading; names: Record<string, string> }) {
  return <ul className="overlay-leads-fields overlay-team-leads" aria-label="Leads and bonuses">
    {reading.leads.length === 0 && <li className="overlay-team-lead overlay-team-lead-note"><span>No leader in this preset</span></li>}
    {reading.leads.map((lead, at) => {
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
  </ul>;
}

/**
 * The most Accuracy the area can use, one line a ceiling. Scenario spans every
 * content, so its ceiling varies with the fight; an area no source covers says
 * so rather than borrow another's figure. A long area name ends in an ellipsis
 * rather than pushing the figure off its fixed column; an area of two ceilings
 * takes two lines.
 */
export function AccuracyGoals({ preset }: { preset: Pick<Preset, 'kind' | 'content'> | undefined }) {
  const areaName = monsterProfileAreaName(preset ?? { kind: 'scenario', content: null });
  const stated = accuracyCeilings(preset?.content?.id);
  const goals = stated.length === 0
    ? [{ label: areaName, value: !preset || preset.kind === 'scenario' ? 'Variable' : 'Unknown' }]
    : stated.map((ceiling) => ({ label: ceiling.part === undefined ? areaName : `${areaName} (${ceiling.part})`, value: `${ceiling.percent}%` }));
  return <div className="overlay-accuracy">
    {goals.map((goal) => <div className="overlay-accuracy-goal" key={goal.label}>
      <p className="overlay-accuracy-label" title={goal.label}>{goal.label}</p>
      <p className="overlay-accuracy-value">{goal.value}</p>
    </div>)}
  </div>;
}
