import type { RankFigure } from './rune-optimization-problem';
import type { CurrentBuild, PickIssue } from './rune-optimization-refresh';
import { roleTargetColumns } from '../../profiles/rune-roles';

const figureNames: Readonly<Record<string, string>> = Object.fromEntries(
  roleTargetColumns.map((column) => [column.key, `${column.label}${column.unit ?? ''}`]),
);

/** Why one rune cannot be used as the build uses it, as a sentence about that rune. */
export function pickIssueText(issue: PickIssue, engravedOnName: (unitId: string) => string | undefined): string {
  switch (issue.kind) {
    case 'gone': return 'Rune missing from account';
    case 'locked-away': return issue.engravedOn === null
      ? 'Locked in inventory'
      : `Locked to ${engravedOnName(issue.engravedOn) ?? 'another monster'}`;
    case 'slot-taken': return 'Slot locked to another rune';
    case 'excluded': return 'Rune excluded from this monster';
    case 'engraved-elsewhere': return `On ${engravedOnName(issue.engravedOn) ?? 'another monster'}; other monsters’ runes are protected`;
    case 'slot-filled': return 'Slot filled; only empty slots may change';
    case 'changes-limit': return `Exceeds ${issue.maximum} rune changes`;
    case 'items': return 'Not enough Gems or Grindstones';
    case 'intangible': return 'Intangible runes are not allowed';
    case 'slot-main': return 'Main stat not allowed in this slot';
    case 'craft': return `${issue.item === 'gem' ? 'Gem' : 'Grindstone'} no longer allowed`;
  }
}

const setWords: Readonly<Record<NonNullable<CurrentBuild['sets']>, string>> = {
  broken: 'Broken sets are not allowed.',
  build: 'Set combination not selected.',
};

export const shortText = (short: readonly RankFigure[]) => `Below target: ${short.map((key) => figureNames[key] ?? key).join(', ')}`;

/** What changed under a build since the search, for the table's mark. */
export function buildIssueReading(build: CurrentBuild, engravedOnName: (unitId: string) => string | undefined): string {
  const lines = [...build.runes].sort((left, right) => left.slot - right.slot)
    .flatMap((picked) => (picked.issue ? [`Slot ${picked.slot}: ${pickIssueText(picked.issue, engravedOnName)}.`] : []));
  if (build.sets !== null) lines.push(setWords[build.sets]);
  if (build.short.length > 0) lines.push(`${shortText(build.short)}.`);
  if (build.over.length > 0) lines.push(`Above maximum: ${build.over.map((key) => figureNames[key] ?? key).join(', ')}.`);
  return lines.join(' ');
}
