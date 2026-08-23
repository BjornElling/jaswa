'use client';

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { clearImportedGame, loadImportedGame, loadPreferences, saveImportedGame, savePreferences } from './lib/local-store';
import { blankPreferences, createImportedGame, defaultRunePotentialSettings, fileToText, importPreferencesFile, normalizeImportedGame, validateGameFile } from './lib/imports';
import { monsterPresentation } from './lib/monster-catalog';
import { calculateMonsterTotals, totalStatValue } from './lib/monster-stats';
import { runePotentialPresets } from './lib/rune-potential-presets';
import type { ImportedGame, MonsterPreference, Preferences, RunePotentialSettings, RunePotentialSortOrder } from './lib/types';

type Page = 'home' | 'monsters' | 'optimizer' | 'speed' | 'potential' | 'artifacts' | 'gems' | 'relics' | 'preferences';
type ReportCategory = 'Monster' | 'Rune' | 'Gem' | 'Grindstone' | 'Artifact' | 'Relic' | 'Other';

const navigation: Array<{ id: Page; label: string; glyph: string }> = [
  { id: 'home', label: 'Home / Import', glyph: '⌂' },
  { id: 'monsters', label: 'Monster Overview', glyph: '♙' },
  { id: 'optimizer', label: 'Rune Optimizer', glyph: '◈' },
  { id: 'speed', label: 'Speed Tuning', glyph: '↝' },
  { id: 'potential', label: 'Rune Potential', glyph: '◌' },
  { id: 'artifacts', label: 'Artifacts', glyph: '◇' },
  { id: 'gems', label: 'Gems & Grinds', glyph: '✦' },
  { id: 'relics', label: 'Relics', glyph: '▣' },
  { id: 'preferences', label: 'Preferences', glyph: '⚙' },
];

const pageCopy: Record<Exclude<Page, 'home' | 'monsters' | 'preferences'>, { title: string; text: string }> = {
  optimizer: { title: 'Rune Optimizer', text: 'This workspace will find rune combinations that meet each monster’s saved requirements.' },
  speed: { title: 'Speed Tuning', text: 'This workspace will help your team take turns in the intended order.' },
  potential: { title: 'Rune Potential', text: 'This workspace will identify runes worth upgrading before resources are spent.' },
  artifacts: { title: 'Artifacts', text: 'This workspace will evaluate where artifacts add the most value.' },
  gems: { title: 'Gems & Grinds', text: 'This workspace will compare possible gem and grind improvements across your account.' },
  relics: { title: 'Relics', text: 'This workspace will evaluate relic choices and their impact on your saved goals.' },
};

function count(value: unknown): number { return Array.isArray(value) ? value.length : 0; }
function dateTime(value?: string): string { return value ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Never'; }
function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

export default function Home() {
  const [page, setPage] = useState<Page>('home');
  const [game, setGame] = useState<ImportedGame | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(blankPreferences());
  const [pendingGame, setPendingGame] = useState<ImportedGame | null>(null);
  const [message, setMessage] = useState('');
  const [report, setReport] = useState<{ category: ReportCategory; details: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const gameInput = useRef<HTMLInputElement>(null);
  const settingsInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([loadImportedGame(), loadPreferences()]).then(([savedGame, savedPreferences]) => {
      const normalizedGame = savedGame ? normalizeImportedGame(savedGame) : null;
      setGame(normalizedGame); if (normalizedGame) void saveImportedGame(normalizedGame); setPreferences(savedPreferences ? { ...savedPreferences, runePotential: { ...defaultRunePotentialSettings, ...savedPreferences.runePotential } } : blankPreferences());
    }).finally(() => setReady(true));
  }, []);

  const monsters = useMemo(() => Array.isArray(game?.data.unit_list) ? game.data.unit_list : [], [game]);

  async function selectGameFile(file?: File) {
    if (!file) return;
    try {
      const raw = JSON.parse(await fileToText(file)) as unknown;
      const report = validateGameFile(raw);
      if (!report.valid) { setMessage(report.message); return; }
      setPendingGame(createImportedGame(file.name, raw as Record<string, unknown>, report)); setMessage('');
    } catch { setMessage('Swaggr could not read this file. Please choose the original JSON file exported from Summoners War.'); }
  }
  async function replaceImport() {
    if (!pendingGame) return;
    await saveImportedGame(pendingGame); setGame(pendingGame); setPendingGame(null);
    setMessage('Your game data was replaced successfully. Your personal preferences were kept.');
  }
  async function removeImport() {
    await clearImportedGame(); setGame(null);
    setMessage('The imported game data was removed. Your preferences are still saved on this computer.');
  }
  async function updateMonsterPreference(unitId: string, update: Partial<MonsterPreference>) {
    const next: Preferences = { ...preferences, monsterPreferences: { ...preferences.monsterPreferences, [unitId]: { ...preferences.monsterPreferences[unitId], unitId, ...update } }, updatedAt: new Date().toISOString() };
    setPreferences(next); await savePreferences(next);
  }
  async function updateRunePotentialSettings(update: Partial<RunePotentialSettings>) {
    const next: Preferences = { ...preferences, runePotential: { ...(preferences.runePotential ?? defaultRunePotentialSettings), ...update }, updatedAt: new Date().toISOString() };
    setPreferences(next); await savePreferences(next);
  }
  function handleDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); void selectGameFile(event.dataTransfer.files[0]); }
  async function handleSettingsImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    try { const next = await importPreferencesFile(file); setPreferences(next); await savePreferences(next); setMessage('Your preferences were loaded successfully.'); }
    catch { setMessage('Swaggr could not read this settings file. Please choose a .sw file exported from Swaggr.'); }
    finally { event.target.value = ''; }
  }
  function openReport(category: ReportCategory = 'Other', details = '') { setReport({ category, details }); }
  function sendReport() {
    if (!report) return;
    const importDetails = game ? `\n\nActive import: ${game.fileName}\nImported: ${dateTime(game.importedAt)}` : '';
    const body = `Hello,\n\nI found missing or unrecognized data in Swaggr.\n\nCategory: ${report.category}\n\nDetails:\n${report.details || 'Please describe what Swaggr could not recognize.'}${importDetails}\n\nPlease do not attach your full game JSON file.`;
    window.location.href = `mailto:bj.elling@gmail.com?subject=${encodeURIComponent(`Swaggr missing data: ${report.category}`)}&body=${encodeURIComponent(body)}`;
    setReport(null);
  }
  if (!ready) return <main className="loading-screen">Preparing your local workspace…</main>;
  const active = navigation.find((item) => item.id === page);

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand" aria-label="Swaggr home"><span className="brand-mark">S</span><span><strong>SWAGGR</strong><small>Summoners War tools</small></span></div>
      <nav aria-label="Swaggr sections">{navigation.map((item) => <button key={item.id} className={page === item.id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(item.id)}><span aria-hidden="true">{item.glyph}</span>{item.label}</button>)}</nav>
      <button className="report-button" onClick={() => openReport()}>Report missing data</button>
      <div className="sidebar-status"><span className={game ? 'status-dot ready' : 'status-dot'} />{game ? 'Game data loaded' : 'No game data loaded'}</div>
    </aside>
    <section className="workspace">
      <header className="topbar"><div><p className="eyebrow">SWAGGR WORKSPACE</p><h1>{active?.label}</h1></div><div className="import-summary"><span className={game ? 'status-dot ready' : 'status-dot'} />{game ? `Imported ${dateTime(game.importedAt)}` : 'Awaiting import'}</div></header>
      <div className="content">
        {page === 'home' && <>
          <section className="hero-card"><div><p className="eyebrow">LOCAL-ONLY WORKSPACE</p><h2>Your Summoners War decisions, in one place.</h2><p>Import a JSON file, set goals for individual monsters, and use the dedicated workspaces as they become available. Your game data stays on this computer.</p></div><button className="primary-button" onClick={() => gameInput.current?.click()}>Import game data</button></section>
          <input ref={gameInput} type="file" accept="application/json,.json" hidden onChange={(event) => { void selectGameFile(event.target.files?.[0]); event.target.value = ''; }} />
          <div className={dragging ? 'drop-zone dragging' : 'drop-zone'} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} onClick={() => gameInput.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') gameInput.current?.click(); }}><span className="drop-symbol">↓</span><strong>Drop your Summoners War JSON file here</strong><span>or choose a file from your computer</span></div>
          {message && <p className="message" role="status">{message}</p>}
          <section className="section-grid"><div className="panel account-panel"><div className="panel-title"><span>Imported game data</span>{game && <button className="quiet-button danger" onClick={() => void removeImport()}>Remove data</button>}</div>{game ? <ImportSummary game={game} onReport={openReport} /> : <p className="empty-copy">No JSON file has been imported yet.</p>}</div><div className="panel"><div className="panel-title"><span>Your preferences</span></div><p className="empty-copy">Labels, monster goals and rune requirements are stored separately from the game import.</p><div className="button-row"><button className="secondary-button" onClick={() => download('swaggr-preferences.sw', JSON.stringify(preferences, null, 2))}>Download .sw file</button><button className="quiet-button" onClick={() => settingsInput.current?.click()}>Load .sw file</button></div></div></section>
        </>}
        {page === 'preferences' && <PreferencesPanel monsters={monsters as Array<Record<string, unknown>>} preferences={preferences} onUpdate={updateMonsterPreference} onExport={() => download('swaggr-preferences.sw', JSON.stringify(preferences, null, 2))} onImport={() => settingsInput.current?.click()} />}
        {page === 'monsters' && <MonsterOverview monsters={monsters as Array<Record<string, unknown>>} preferences={preferences} />}
        {page === 'potential' && <RunePotentialPanel settings={preferences.runePotential ?? defaultRunePotentialSettings} onUpdate={updateRunePotentialSettings} />}
        {page !== 'home' && page !== 'monsters' && page !== 'preferences' && page !== 'potential' && <section className="future-panel"><p className="eyebrow">FOUNDATION READY</p><h2>{pageCopy[page].title}</h2><p>{pageCopy[page].text}</p>{game ? <p className="callout">Your current import is ready for this workspace. Calculation rules will be added here next.</p> : <p className="callout">Import your game data first. Your preferences can be prepared at any time.</p>}</section>}
      </div>
    </section>
    <input ref={settingsInput} type="file" accept=".sw,application/json" hidden onChange={(event) => void handleSettingsImport(event)} />
    {pendingGame && <div className="modal-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="replace-title"><p className="eyebrow">REPLACE GAME DATA</p><h2 id="replace-title">Replace the current import?</h2><p>This removes all current game data and replaces it with <strong>{pendingGame.fileName}</strong>. Your saved names, goals and preferences will remain.</p>{pendingGame.report.unknownMonsterIds.length > 0 && <p className="compatibility-warning">{pendingGame.report.unknownMonsterIds.length} monster type{pendingGame.report.unknownMonsterIds.length === 1 ? '' : 's'} {pendingGame.report.unknownMonsterIds.length === 1 ? 'is' : 'are'} newer than Swaggr’s saved name list. {pendingGame.report.unknownMonsterIds.join(', ')} will still be imported, but shown by game ID until the list is updated. <button className="inline-report-button" onClick={() => openReport('Monster', `Swaggr could not find name information for monster type(s): ${pendingGame.report.unknownMonsterIds.join(', ')}.\n\nJSON file: ${pendingGame.fileName}`)}>Report this</button></p>}<div className="modal-actions"><button className="quiet-button" onClick={() => setPendingGame(null)}>Cancel</button><button className="primary-button" onClick={() => void replaceImport()}>Replace data</button></div></section></div>}
    {report && <div className="modal-backdrop" role="presentation"><section className="confirm-dialog report-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title"><p className="eyebrow">SEND A REPORT</p><h2 id="report-title">Report missing data</h2><p>Your normal mail program will open with this report filled in. Review it, then send it to the developer.</p><label>Data type<select value={report.category} onChange={(event) => setReport({ ...report, category: event.target.value as ReportCategory })}>{(['Monster', 'Rune', 'Gem', 'Grindstone', 'Artifact', 'Relic', 'Other'] as ReportCategory[]).map((category) => <option key={category}>{category}</option>)}</select></label><label>What is missing or unrecognized?<textarea value={report.details} onChange={(event) => setReport({ ...report, details: event.target.value })} placeholder="Include the name, game ID, or anything else shown by Swaggr." /></label><p className="report-note">Swaggr does not attach your game data to the e-mail.</p><div className="modal-actions"><button className="quiet-button" onClick={() => setReport(null)}>Cancel</button><button className="primary-button" onClick={sendReport}>Open e-mail</button></div></section></div>}
  </main>;
}

function RunePotentialPanel({ settings, onUpdate }: { settings: RunePotentialSettings; onUpdate: (update: Partial<RunePotentialSettings>) => Promise<void> }) {
  return <div className="potential-workspace">
    <section className="rune-potential-panel">
      <div className="rune-potential-heading"><div><h2>Set your RNG personality</h2><p>Tell Swaggr how optimistic to be before a rune gets to eat your mana stones.</p></div></div>
      <div className="potential-settings">
        <div className="potential-column">
          <PotentialSlider id="power-up-policy" label="Power Up Policy" value={settings.powerUpPolicy} description="How willing are you to roll runes with potential?" lowLabel="Gives every contender a shot." highLabel="Waits for a rune that is practically a slam dunk." onChange={(value) => void onUpdate({ powerUpPolicy: value })} />
          <PotentialSlider id="rune-quality" label="Rune Quality" value={settings.runeQuality} description="How high must a rune's best-case final quality be before it gets a roll?" lowLabel="Gives every rough diamond a chance." highLabel="Only rolls future hall-of-famers." onChange={(value) => void onUpdate({ runeQuality: value })} />
          <RuneVisibilityControls settings={settings} onUpdate={onUpdate} />
        </div>
        <div className="potential-column">
          <PotentialSlider id="enchanted-gems" label="Enchanted Gems" value={settings.enchantedGems} steps={4} description="How generously should gem upgrades count toward a rune's potential?" lowLabel="Leave them out." highLabel="Use maximum value." onChange={(value) => void onUpdate({ enchantedGems: value })} />
          <PotentialSlider id="grindstones" label="Grindstones" value={settings.grindstones} steps={4} description="How generously should grindstone upgrades count toward a rune's potential?" lowLabel="Leave them out." highLabel="Use maximum value." onChange={(value) => void onUpdate({ grindstones: value })} />
          <RuneSortOrderControl settings={settings} onUpdate={onUpdate} />
        </div>
      </div>
    </section>
    <PresetPanel />
  </div>;
}

function PresetPanel() {
  return <section className="rune-preset-panel" aria-labelledby="presets-title">
    <div className="preset-heading"><div><p className="eyebrow">LOCKED WORKING VALUES</p><h2 id="presets-title">Presets</h2><p>These source-controlled presets define desirable rune sets, substats and the role weighting of the three calculated values. A weight of 0 means the metric is intentionally ignored.</p></div><span className="settings-badge">SOURCE-CONTROLLED</span></div>
    <div className="preset-list">{runePotentialPresets.map((preset) => <article className="preset-card" key={preset.id}>
      <div className="preset-card-heading"><div><h3>{preset.name}</h3><p>{preset.description}</p></div></div>
      <div className="preset-detail"><span>Desired sets</span><div className="preset-tags">{preset.desirableSets.map((set) => <b key={set}>{set}</b>)}</div></div>
      <div className="preset-detail"><span>Desired stats</span><div className="preset-tags">{preset.desirableStats.map((stat) => <b key={stat}>{stat}</b>)}</div></div>
      <dl className="preset-metrics"><div><dt>DMG</dt><dd>{preset.metricWeights.dmg}</dd></div><div><dt>E.HP</dt><dd>{preset.metricWeights.ehp}</dd></div><div><dt>E.HP D</dt><dd>{preset.metricWeights.ehpD}</dd></div></dl>
    </article>)}</div>
  </section>;
}

function PotentialSlider({ id, label, value, steps = 5, description, lowLabel, highLabel, onChange }: { id: string; label: string; value: number; steps?: number; description: string; lowLabel: string; highLabel: string; onChange: (value: number) => void }) {
  const progress = `${((value - 1) / (steps - 1)) * 100}%`;
  return <article className="potential-setting">
    <div className="potential-setting-header"><div><h3>{label}</h3><p>{description}</p></div></div>
    <div className="range-wrap"><input id={id} className="potential-range" type="range" min="1" max={steps} step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} aria-describedby={`${id}-help`} style={{ '--range-progress': progress } as React.CSSProperties} /><div className="range-steps" aria-hidden="true">{Array.from({ length: steps }, (_, index) => index + 1).map((step) => <span key={step} className={step <= value ? 'active' : ''} />)}</div></div>
    <p id={`${id}-help`} className="range-endpoints"><span>{lowLabel}</span><span>{highLabel}</span></p>
  </article>;
}

function RuneVisibilityControls({ settings, onUpdate }: { settings: RunePotentialSettings; onUpdate: (update: Partial<RunePotentialSettings>) => Promise<void> }) {
  return <article className="potential-setting visibility-setting"><h3>Overview filters</h3><div className="checkbox-list"><label><input type="checkbox" checked={settings.includeLevel12Runes} onChange={(event) => void onUpdate({ includeLevel12Runes: event.target.checked })} />Include runes at lvl. 12+.</label><label><input type="checkbox" checked={settings.includeEquippedRunes} onChange={(event) => void onUpdate({ includeEquippedRunes: event.target.checked })} />Include runes equipped on monsters.</label></div></article>;
}

function RuneSortOrderControl({ settings, onUpdate }: { settings: RunePotentialSettings; onUpdate: (update: Partial<RunePotentialSettings>) => Promise<void> }) {
  const sortOrders: RunePotentialSortOrder[] = ['Grade', 'Sub Property', 'Sub Property Before Grinding', 'Power-up Lv.', 'Obtained', 'Sub Property Sum', 'Score'];
  return <article className="potential-setting sort-order-setting"><label htmlFor="rune-sort-order">Sort order</label><select id="rune-sort-order" value={settings.sortOrder} onChange={(event) => void onUpdate({ sortOrder: event.target.value as RunePotentialSortOrder })}>{sortOrders.map((order) => <option key={order}>{order}</option>)}</select></article>;
}

function ImportSummary({ game, onReport }: { game: ImportedGame; onReport: (category: ReportCategory, details: string) => void }) {
  const rows = [['Monsters', count(game.data.unit_list)], ['Runes (all)', count(game.data.runes)], ['Artifacts (all)', count(game.data.artifacts)], ['Relics (all)', count(game.data.relics)], ['Gems & grinds', count(game.data.rune_craft_item_list)]];
  const unknownMonsterIds = game.report.unknownMonsterIds ?? [];
  return <><div className="stat-list">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value.toLocaleString('en')}</strong></div>)}</div>{unknownMonsterIds.length > 0 && <p className="compatibility-warning">Name information is missing for monster type{unknownMonsterIds.length === 1 ? '' : 's'} {unknownMonsterIds.join(', ')}. <button className="inline-report-button" onClick={() => onReport('Monster', `Swaggr could not find name information for monster type(s): ${unknownMonsterIds.join(', ')}.`)}>Report this</button></p>}</>;
}

function numberedMonsterNames(monsters: Array<Record<string, unknown>>): Record<string, string> {
  const entries = monsters.map((monster, index) => ({ unitId: String(monster.unit_id ?? `unknown-${index}`), name: monsterPresentation(monster.unit_master_id).name }));
  const totals = entries.reduce<Record<string, number>>((result, entry) => ({ ...result, [entry.name]: (result[entry.name] ?? 0) + 1 }), {});
  const seen: Record<string, number> = {};
  return Object.fromEntries(entries.map((entry) => {
    const number = (seen[entry.name] = (seen[entry.name] ?? 0) + 1);
    return [entry.unitId, totals[entry.name] > 1 ? `${entry.name} #${number}` : entry.name];
  }));
}

function PreferencesPanel({ monsters, preferences, onUpdate, onExport, onImport }: { monsters: Array<Record<string, unknown>>; preferences: Preferences; onUpdate: (unitId: string, update: Partial<MonsterPreference>) => Promise<void>; onExport: () => void; onImport: () => void; }) {
  if (!monsters.length) return <section className="future-panel"><p className="eyebrow">PREFERENCES</p><h2>Start with a game import</h2><p>After importing your JSON file, you can give each individual monster a name and save its goals here.</p></section>;
  const defaultNames = numberedMonsterNames(monsters);
  return <section className="preferences-panel"><div className="preferences-heading"><div><p className="eyebrow">PERSONAL SETUP</p><h2>Monster preferences</h2><p>These choices stay saved when you replace your game data.</p></div><div className="button-row"><button className="secondary-button" onClick={onExport}>Download .sw file</button><button className="quiet-button" onClick={onImport}>Load .sw file</button></div></div><div className="preference-list">{monsters.map((monster, index) => { const unitId = String(monster.unit_id ?? `unknown-${index}`); const current = preferences.monsterPreferences[unitId] ?? { unitId, label: '', runeSets: '', statGoals: '' }; return <article className="monster-row" key={unitId}><div className="monster-ident"><span>{index + 1}</span><div><strong>{current.label || defaultNames[unitId]}</strong><small>{current.label ? defaultNames[unitId] : 'Give this monster a personal name when needed.'}</small></div></div><label>Personal name<input value={current.label} placeholder="e.g. DB12 Verdehile" onChange={(event) => void onUpdate(unitId, { label: event.target.value })} /></label><label>Rune requirements<input value={current.runeSets} placeholder="To be defined" onChange={(event) => void onUpdate(unitId, { runeSets: event.target.value })} /></label><label>Stat goals<input value={current.statGoals} placeholder="To be defined" onChange={(event) => void onUpdate(unitId, { statGoals: event.target.value })} /></label></article>; })}</div></section>;
}

function statValue(value: unknown): string { return typeof value === 'number' ? value.toLocaleString('en') : '—'; }

function MonsterOverview({ monsters, preferences }: { monsters: Array<Record<string, unknown>>; preferences: Preferences }) {
  if (!monsters.length) return <section className="future-panel"><p className="eyebrow">MONSTER OVERVIEW</p><h2>Start with a game import</h2><p>After importing your JSON file, every imported monster and its current stats will appear here.</p></section>;
  const defaultNames = numberedMonsterNames(monsters);
  return <section className="monster-overview">
    <div className="preferences-heading"><div><p className="eyebrow">CURRENT IMPORT</p><h2>Your monsters</h2><p>{monsters.length.toLocaleString('en')} monsters from the active JSON file. Personal names set in Preferences are shown here.</p></div></div>
    <div className="overview-table" role="region" aria-label="Imported monster statistics" tabIndex={0}>
      <div className="overview-head"><span>Monster</span><span>Level</span><span>HP</span><span>ATK</span><span>DEF</span><span>SPD</span><span>CR</span><span>CD</span><span>RES</span><span>ACC</span></div>
      {monsters.map((monster, index) => {
        const unitId = String(monster.unit_id ?? `unknown-${index}`);
        const display = monsterPresentation(monster.unit_master_id);
        const preference = preferences.monsterPreferences[unitId];
        const totals = calculateMonsterTotals(monster);
        return <div className="overview-row" key={unitId}>
          <div className="monster-cell">{display.imageFilename ? <span aria-hidden="true" className="monster-avatar monster-image" style={{ backgroundImage: `url(/monster-images/${display.imageFilename})` }} /> : <span className="monster-avatar">{display.shortName}</span>}<span><strong>{preference?.label || defaultNames[unitId]}</strong>{display.secondaryName && <small>Formerly {display.secondaryName}</small>}</span></div>
          <span>{statValue(monster.unit_level)}</span><span>{totalStatValue(totals, 'hp')}</span><span>{totalStatValue(totals, 'atk')}</span><span>{totalStatValue(totals, 'def')}</span><span>{totalStatValue(totals, 'spd')}</span><span>{totalStatValue(totals, 'criticalRate')}</span><span>{totalStatValue(totals, 'criticalDamage')}</span><span>{totalStatValue(totals, 'resistance')}</span><span>{totalStatValue(totals, 'accuracy')}</span>
        </div>;
      })}
    </div>
  </section>;
}
