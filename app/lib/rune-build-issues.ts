import type { RankFigure } from './rune-optimization-problem';
import type { CurrentBuild, PickIssue } from './rune-optimization-refresh';
import { presetTargetColumns } from './rune-potential-presets';

const figureNames: Readonly<Record<string, string>> = Object.fromEntries(
  presetTargetColumns.map((column) => [column.key, `${column.label}${column.unit ?? ''}`]),
);

/** Why one rune cannot be used as the build uses it, as a sentence about that rune. */
export function pickIssueText(issue: PickIssue, wearerName: (unitId: string) => string | undefined): string {
  switch (issue.kind) {
    case 'gone': return 'The rune is no longer in the account';
    case 'locked-away': return issue.wearer === null
      ? 'The rune is locked in the inventory'
      : `The rune is locked to ${wearerName(issue.wearer) ?? 'another monster'}`;
    case 'slot-taken': return 'Another rune is locked into this slot';
    case 'worn-elsewhere': return `The rune is now on ${wearerName(issue.wearer) ?? 'another monster'}, and the settings keep other monsters’ runes`;
    case 'items': return 'Too few items are left for the Gem or Grindstone still to come';
  }
}

export const shortText = (short: readonly RankFigure[]) => `Now short of ${short.map((key) => figureNames[key] ?? key).join(', ')}`;

/** What changed under a build since the search, for the table's mark. */
export function buildIssueReading(build: CurrentBuild, wearerName: (unitId: string) => string | undefined): string {
  const lines = [...build.runes].sort((left, right) => left.slot - right.slot)
    .flatMap((picked) => (picked.issue ? [`Slot ${picked.slot}: ${pickIssueText(picked.issue, wearerName)}.`] : []));
  if (build.short.length > 0) lines.push(`${shortText(build.short)}.`);
  if (build.over.length > 0) lines.push(`Now above the range for ${build.over.map((key) => figureNames[key] ?? key).join(', ')}.`);
  return lines.join(' ');
}
