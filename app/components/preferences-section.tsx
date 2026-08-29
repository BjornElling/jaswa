'use client';

import { useState } from 'react';
import { WorkspacePage } from './workspace-page';
import { PageHeader } from './page-chrome';
import { MonsterPortrait } from './monster-portrait';
import { monsterPresentation } from '../lib/monster-catalog';
import type { GameRecord } from '../lib/game-data';
import { numberedMonsterNames } from '../lib/monster-names';
import type { MonsterPreference, Preferences } from '../lib/types';

export function PreferencesSection({ monsters, preferences, onUpdate, onExport, onImport }: {
  monsters: GameRecord[];
  preferences: Preferences;
  onUpdate: (unitId: string, update: Partial<MonsterPreference>) => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const [search, setSearch] = useState('');

  if (!monsters.length) return <WorkspacePage
    header={<PageHeader
      title="Call them what you call them"
      tagline="Give each monster the name you actually use and the goals you actually have. Kept separate from the import, so replacing your data keeps them." />}
  >
    <section className="empty-state">
      <h2>Nothing to name until a game file is imported.</h2>
      <p className="next-step">Go to Home and drop in the JSON file exported from Summoners War.</p>
    </section>
  </WorkspacePage>;

  const defaultNames = numberedMonsterNames(monsters);
  const term = search.trim().toLowerCase();
  const visible = monsters.filter((monster, index) => {
    if (!term) return true;
    const unitId = String(monster.unit_id ?? `unknown-${index}`);
    const preference = preferences.monsterPreferences[unitId];
    return (preference?.label || defaultNames[unitId]).toLowerCase().includes(term);
  });

  return <WorkspacePage
    header={<PageHeader
      title="Call them what you call them"
      tagline="Give each monster the name you actually use and the goals you actually have. Kept separate from the import, so replacing your data keeps them." />}
  >
    <div className="filter-strip">
      <div className="filter-group">
        <div className="search-field">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter monsters" aria-label="Filter monsters by name" />
          <button className="filter-button" onClick={() => setSearch('')}
            hidden={!search} disabled={!search} aria-label="Clear filter">✕</button>
        </div>
      </div>
      <div className="filter-group">
        <span className="filter-label">Preferences file</span>
        <button className="filter-button" onClick={onExport}>Download .sw</button>
        <button className="filter-button" onClick={onImport}>Load .sw</button>
      </div>
    </div>

    <div className="table-wrap">
      <table className="grid-table">
        <thead>
          <tr>
            <th className="align-left">#</th>
            <th className="align-left">Monster</th>
            <th className="align-left">Personal name</th>
            <th className="align-left">Rune requirements</th>
            <th className="align-left">Stat goals</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((monster, index) => {
            const unitId = String(monster.unit_id ?? `unknown-${index}`);
            const current = preferences.monsterPreferences[unitId] ?? { unitId, label: '', runeSets: '', statGoals: '' };
            const display = monsterPresentation(monster.unit_master_id);
            return <tr key={unitId}>
              <td className="align-left row-index">{String(index + 1).padStart(2, '0')}</td>
              <td className="align-left">
                <div className="monster-cell">
                  <MonsterPortrait imageFilename={display.imageFilename} initial={display.shortName} name={defaultNames[unitId]} />
                  <span className="monster-name">{defaultNames[unitId]}</span>
                </div>
              </td>
              <td className="align-left"><PreferenceInput key={`label:${current.label}`} value={current.label} placeholder="e.g. DB12 Verdehile"
                onCommit={(value) => void onUpdate(unitId, { label: value })} /></td>
              <td className="align-left"><PreferenceInput key={`sets:${current.runeSets}`} value={current.runeSets} placeholder="To be defined"
                onCommit={(value) => void onUpdate(unitId, { runeSets: value })} /></td>
              <td className="align-left"><PreferenceInput key={`goals:${current.statGoals}`} value={current.statGoals} placeholder="To be defined"
                onCommit={(value) => void onUpdate(unitId, { statGoals: value })} /></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>

    <div className="grid-footer">
      <span><b>{visible.length}</b> of {monsters.length} shown</span>
      <span className="spacer" />
      <span>saved on this computer</span>
    </div>
  </WorkspacePage>;
}

function PreferenceInput({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  return <input
    className="cell-input"
    value={draft}
    placeholder={placeholder}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={() => { if (draft !== value) onCommit(draft); }}
    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
  />;
}
