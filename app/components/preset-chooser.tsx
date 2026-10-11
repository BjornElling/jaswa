import { useMemo } from 'react';
import { Dropdown } from './dropdown';
import { PresetTeamPicker } from './preset-team-picker';
import type { TeamChoice } from './preset-team-picker';
import type { GameRecord } from '../lib/game-data';
import { monsterPresentation } from '../lib/monster-catalog';
import { monsterCopyNames } from '../lib/monster-names';
import { profilesIn } from '../lib/monster-preferences';
import type { MonsterPreferences } from '../lib/monster-preferences';
import { warmMonsterPortraits } from '../lib/monster-portrait-image';
import { choiceOfArea, choiceOfTab } from '../lib/preset-choice';
import type { PresetChoice, ResolvedPresetChoice } from '../lib/preset-choice';
import type { PresetMenuTab } from '../lib/presets';

/**
 * **Content, Area, Preset** — the one way a preset is chosen in JASWA. The
 * game's tab, then the content of its menu, then which of its presets: twenty
 * Arena Attack decks in one flat menu buried the one being looked for. Default
 * is a content of one and is chosen from Content outright.
 *
 * The three fields are drawn as a fragment, each with its own grid area
 * (`preset-choice-content`, `-area`, `-preset`), so a page can set a field of its
 * own beside them in the same grid, as Presets sets *Add mon* beside Preset.
 * Every field is always on the page and only disabled where there is nothing
 * to choose, so a choice moves nothing beside it (AGENTS.md §2).
 */
export function PresetChooser({ idPrefix, menu, choice, monsters, monsterPreferences, onChoose }: {
  /** Prefixes the three fields' ids, which their labels point at. */
  idPrefix: string;
  /** `presetMenu`, or `heldPresetMenu` on a page that only reads presets. */
  menu: readonly PresetMenuTab[];
  choice: ResolvedPresetChoice;
  monsters: readonly GameRecord[];
  monsterPreferences: MonsterPreferences;
  onChoose: (next: PresetChoice) => void;
}) {
  const { tab, area, preset } = choice;
  const onDefault = tab === menu[0];
  /* Each face is named as its own preset names it: a nickname is part of that
     preset's profile, and another preset's is not this one's. */
  const teams = useMemo<TeamChoice[]>(() => {
    if (onDefault) return [];
    const byUnit = new Map(monsters.map((monster) => [String(monster.unit_id), monster]));
    return area.presets.map((entry) => {
      const names = monsterCopyNames(monsters, profilesIn(monsterPreferences, entry.id));
      return { id: entry.id, name: entry.name, faces: entry.members.map((unitId) => {
        const monster = byUnit.get(unitId);
        const display = monster ? monsterPresentation(monster.unit_master_id) : undefined;
        return { key: unitId, name: monster ? names[unitId]?.name ?? unitId : 'Not in this import',
          imageFilename: display?.imageFilename, initial: display?.shortName ?? '?' };
      }) };
    });
  }, [onDefault, area, monsters, monsterPreferences]);

  function chooseTab(label: string) {
    const next = menu.find((entry) => entry.label === label);
    if (next && next !== tab) onChoose(choiceOfTab(next));
  }

  function chooseArea(label: string) {
    const next = tab.areas.find((entry) => entry.label === label);
    if (next && next !== area) onChoose(choiceOfArea(tab, next));
  }

  function warmTeams() {
    warmMonsterPortraits(teams.flatMap((team) => team.faces.map((face) => face.imageFilename)));
  }

  return <>
    <div className="filter-group preset-choice-field preset-choice-content">
      <label className="filter-label" htmlFor={`${idPrefix}-content`}>Content</label>
      <Dropdown id={`${idPrefix}-content`} className="preset-choice-select" value={tab.label}
        onChange={(event) => chooseTab(event.target.value)}>
        {menu.map((entry) => <option key={entry.label} value={entry.label}>{entry.label}</option>)}
      </Dropdown>
    </div>
    <div className="filter-group preset-choice-field preset-choice-area">
      <label className="filter-label" htmlFor={`${idPrefix}-area`}>Area</label>
      <Dropdown id={`${idPrefix}-area`} className="preset-choice-select" value={area.label}
        disabled={tab.areas.length < 2} onChange={(event) => chooseArea(event.target.value)}>
        {tab.areas.map((entry) => <option key={entry.label} value={entry.label}>{entry.label}</option>)}
      </Dropdown>
    </div>
    <div className="filter-group preset-choice-field preset-choice-preset">
      <label className="filter-label" htmlFor={`${idPrefix}-preset`}>Preset</label>
      <PresetTeamPicker id={`${idPrefix}-preset`} teams={teams} value={preset && preset.kind !== 'default' ? preset.id : ''}
        placeholder="Choose preset" disabled={teams.length === 0} onOpen={warmTeams}
        onChange={(presetId) => onChoose({ tab: tab.label, area: area.label, presetId })} />
    </div>
  </>;
}
