import { isPresetContentId } from './preset-contents';
import type { Preset } from './presets';
import type { PresetContentId } from './preset-contents';

export type MonsterProfileScope = 'scenario' | 'unassigned' | `content:${PresetContentId}`;

/** A profile describes a monster's job in an area, independently of its teams. */
export function monsterProfileScope(kind: Preset['kind'] | undefined, contentId: PresetContentId | undefined): MonsterProfileScope {
  if (!kind || kind === 'scenario') return 'scenario';
  return contentId ? `content:${contentId}` : 'unassigned';
}

/** Unnamed teams share an explicit unassigned area; no game meaning is guessed. */
export function isMonsterProfileScope(scope: string): scope is MonsterProfileScope {
  return scope === 'scenario' || scope === 'unassigned'
    || (scope.startsWith('content:') && isPresetContentId(scope.slice(8)));
}

/** One choice per area, retaining the opened team's gear when its area is chosen. */
export function monsterProfileAreas(presets: readonly Preset[], unitId: string, openedId: string): Preset[] {
  const opened = presets.find((preset) => preset.id === openedId && preset.members.includes(unitId));
  const areas = new Map<string, Preset>();
  for (const preset of presets) {
    if (preset.kind !== 'scenario' && !preset.members.includes(unitId)) continue;
    const scope = preset.profileScope;
    if (!areas.has(scope)) areas.set(scope, preset);
  }
  if (opened) areas.set(opened.profileScope, opened);
  return [...areas.values()];
}

export function monsterProfileAreaName(preset: Pick<Preset, 'kind' | 'content'>): string {
  return preset.kind === 'scenario' ? 'Scenario' : preset.content?.name ?? 'Not yet named';
}
