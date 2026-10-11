/**
 * Which preset a page is read in, chosen as the game's own screen chooses it:
 * a tab, a content of its menu, one of that content's presets
 * (`docs/DECK-PRESETS.md` §3.1). Every page that lets the user pick a preset
 * reads the choice through here and draws it with `PresetChooser`, so the
 * choice falls back, opens and narrows the same way wherever it is made.
 */
import { defaultPresetId } from './presets';
import type { Preset, PresetMenuArea, PresetMenuTab } from './presets';

/** What a page stores: labels for the tab and the content, `''` for no preset. */
export type PresetChoice = { tab: string; area: string; presetId: string };

/** A choice read against the menu it is made in. `preset` is `null` only in a content holding none. */
export type ResolvedPresetChoice = { tab: PresetMenuTab; area: PresetMenuArea; preset: Preset | null };

export const defaultPresetChoice: PresetChoice = { tab: 'Default', area: 'Default', presetId: defaultPresetId };

export function isPresetChoice(value: unknown): value is PresetChoice {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.tab === 'string' && typeof candidate.area === 'string' && typeof candidate.presetId === 'string';
}

/**
 * The menu narrowed to the contents that hold a preset, for a page that reads
 * presets and cannot make one. Default always stays: it is the account's own
 * placement and never empty while there is an import.
 */
export function heldPresetMenu(menu: readonly PresetMenuTab[]): PresetMenuTab[] {
  return menu.map((tab, at) => (at === 0 ? tab : { ...tab, areas: tab.areas.filter((area) => area.presets.length > 0) }))
    .filter((tab) => tab.areas.length > 0);
}

/**
 * The stored choice against the menu as it now stands. A preset that is still
 * there names its own tab and content, wherever it has moved; otherwise each
 * part that no longer resolves falls back on its own — the content to the
 * tab's first, the preset to the content's first — and the parts that do
 * resolve are kept (AGENTS.md §0).
 */
export function resolvePresetChoice(menu: readonly PresetMenuTab[], choice: PresetChoice): ResolvedPresetChoice {
  for (const tab of menu) {
    for (const area of tab.areas) {
      const preset = area.presets.find((entry) => entry.id === choice.presetId);
      if (preset) return { tab, area, preset };
    }
  }
  const tab = menu.find((entry) => entry.label === choice.tab) ?? menu[0];
  const area = tab.areas.find((entry) => entry.label === choice.area) ?? tab.areas[0];
  return { tab, area, preset: area.presets[0] ?? null };
}

/** A tab opens on the first content of its menu, as the game's does, and a content on its first preset. */
export function choiceOfTab(tab: PresetMenuTab): PresetChoice {
  return choiceOfArea(tab, tab.areas[0]);
}

export function choiceOfArea(tab: PresetMenuTab, area: PresetMenuArea): PresetChoice {
  return { tab: tab.label, area: area.label, presetId: area.presets[0]?.id ?? '' };
}
