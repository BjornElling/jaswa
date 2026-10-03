import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { MultiChoiceMenu } from './choice-menu';
import type { ChoiceMenuOption } from './choice-menu';
import { Dropdown } from './dropdown';
import { FigureMarks } from './figure-marks';
import { criticalRateMarks, shortfallMarks } from '../lib/figure-marks';
import { MonsterPortrait } from './monster-portrait';
import { RuneBuildField } from './rune-build-field';
import { RuneSlotMainField } from './rune-slot-main-field';
import { StatRangeField } from './stat-range-field';
import { Button } from './button';
import { Overlay, OverlayAction } from './overlay';
import { PencilIcon } from './pencil-icon';
import type { MonsterReference } from './monster-link';
import type { Artifact } from '../lib/artifacts';
import { readArtifacts } from '../lib/artifacts';
import type { ArtifactCategory, ArtifactMainProperty } from '../lib/artifact-properties';
import { artifactMainPropertyOrder, artifactPropertiesFor, artifactProperty } from '../lib/artifact-properties';
import { displaySubProperty } from '../lib/artifact-grid';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { monsterPresentation, monsterSpeciesPresentation } from '../lib/monster-catalog';
import { labelledMonsterName, numberedMonsterNames } from '../lib/monster-names';
import type { RuneSlotKey } from '../lib/monster-defaults';
import { runeSlotKeys } from '../lib/monster-defaults';
import type {
  ArtifactSubPreference, MonsterCopyPreferences, MonsterStatTargets,
} from '../lib/monster-preferences';
import {
  blankMonsterCopyPreferences, monsterLabelMaximum, readTargetField, substatMinimumMaximum,
} from '../lib/monster-preferences';
import { resolveMonsterPreferences } from '../lib/monster-preference-resolution';
import type { ResolvedMonsterPreferences } from '../lib/monster-preference-resolution';
import type { Shortfall } from '../lib/monster-shortfall';
import { monsterShortfalls } from '../lib/monster-shortfall';
import { calculateMonsterTotals, monsterTargetFigures } from '../lib/monster-stats';
import { monsterUsage } from '../lib/monster-usage-statistics';
import type { MonsterUsage } from '../lib/monster-usage-statistics';
import type { Relic } from '../lib/relics';
import { readRelics } from '../lib/relics';
import { canEquipArtifacts, canEquipRelics } from '../lib/monster-equipment-eligibility';
import { relicMainPropertyOrder, relicProperties, relicPropertyLabel } from '../lib/relic-properties';
import type { RelicMainProperty } from '../lib/relic-properties';
import { presetTargetColumns } from '../lib/rune-potential-presets';
import { runeSlotMainsBySlot } from '../lib/rune-slot-mains';
import { activeRuneSets, elementName } from '../lib/rune-sets';
import { runeBuildName } from '../lib/rune-set-pairs';
import type { GeneralSettings } from '../lib/types';

/**
 * Where the user says what one monster is for.
 *
 * **Everything on this panel is a statement the optimizers will act on.** The
 * user names the rune builds they will accept, the artifact and relic
 * properties worth equipping, and the figures the copy is being built toward;
 * the account's current gear and the community's statistics appear beside those
 * answers as *reference*, never as an answer already given.
 *
 * That reverses how this panel worked. It used to open with the community's
 * most common choices already lit, which made every default look like a
 * decision the user had made — and an Adopt button beside each row invited them
 * to make it one. Nothing is chosen here until the user chooses it: where they
 * say nothing, the optimizers fall back on the statistics themselves, and
 * saying nothing is a perfectly good answer.
 *
 * It opens over the table the user was reading rather than replacing the page,
 * because there is no router to bring them back to the row they came from.
 */

const categoryLabels: Record<ArtifactCategory, string> = { attribute: 'Attribute', type: 'Type' };
const slotNumbers: Record<RuneSlotKey, number> = { slot2: 2, slot4: 4, slot6: 6 };

/** The eleven figures a copy can be built toward, in the order they are offered. */
const targetRows: ReadonlyArray<{ key: keyof MonsterStatTargets; label: string }> =
  presetTargetColumns.map((column) => ({ key: column.key, label: `${column.label}${column.unit ?? ''}` }));

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return <section className="overlay-block">
    <header className="overlay-block-head">
      <h3 className="overlay-block-title">{title}</h3>
      {/* One line, always present, so a block cannot change height as its
          wording changes (`AGENTS.md` §2). */}
      <p className="overlay-provenance">{note ?? ''}</p>
    </header>
    {children}
  </section>;
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return <>
    <p className="overlay-row-label">{label}</p>
    <div className="overlay-row-value">{children}</div>
  </>;
}

/**
 * A community row, shown as reference: the three choices the population makes
 * most, each with its share, as the game's own statistics panel shows them.
 *
 * It is reference only. There is no longer any way to adopt it as an answer —
 * the Adopt buttons are gone, because a statistic the user has not looked at is
 * not a decision they made, and a panel that let one become a decision in a
 * click made every default look like a choice. Where the user says nothing, the
 * optimizers fall back on these figures anyway, so adopting them explicitly
 * changed nothing except who appeared to have decided.
 */
function Usage({ entries }: {
  entries: ReadonlyArray<{ label: string; share: number }> | undefined;
}) {
  const shown = (entries ?? []).slice(0, 3);
  return <div className="usage-line">
    {shown.length === 0
      ? <span className="overlay-empty">Not captured for this monster.</span>
      : shown.map((entry) => <span className="usage-entry" key={entry.label}>
        {entry.label}
        <span className="usage-share">{(entry.share * 100).toFixed(0)} %</span>
      </span>)}
  </div>;
}


/**
 * A nickname as it is kept: trimmed, and without the parentheses the heading
 * already draws around it — typing `(Arena nuker)` is typing what the heading
 * will show, not asking for two pairs of them.
 */
function normalizedNickname(raw: string): string | undefined {
  const nickname = raw.trim().replace(/^\(+/, '').replace(/\)+$/, '').trim().slice(0, monsterLabelMaximum).trim();
  return nickname === '' ? undefined : nickname;
}

/**
 * The pencil beside a copy's name, and the field it opens in place of the
 * nickname.
 *
 * A nickname qualifies the monster's name rather than replacing it, so it is
 * edited where it is read: after the name, at the name's own size. The field
 * lives only while it is being typed in — the heading is the thing acted upon,
 * so its reflow is the movement the user asked for (`AGENTS.md` §2). The pencil
 * itself is never unmounted and keeps one box in both states.
 */
function Nickname({ value, editing, onEditingChange, onCommit }: {
  value: string | undefined;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onCommit: (nickname: string | undefined) => void;
}) {
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  const open = useRef(false);

  useEffect(() => { if (editing) field.current?.select(); }, [editing]);

  function finish(commit: boolean, refocus: boolean) {
    /* Read from a ref, not from `editing`: moving focus to the pencil below
       blurs the field synchronously, and that blur would otherwise find the
       stale `editing` and save what Escape had just thrown away. */
    if (!open.current) return;
    open.current = false;
    if (commit) {
      const next = normalizedNickname(text);
      if (next !== value) onCommit(next);
    }
    onEditingChange(false);
    /* Back to the pencil, where the reader started, rather than to the top of
       the dialog — unless they left by clicking somewhere else, which is where
       they are looking now. */
    if (refocus) pencil.current?.focus();
  }

  return <>
    {editing && <input ref={field} className="overlay-nickname-input" value={text}
      aria-label="Nickname" placeholder="Nickname" maxLength={monsterLabelMaximum + 2}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => finish(true, false)}
      onKeyDown={(event) => {
        /* Enter would submit the whole panel, and Escape would close it; here
           each means only "done with this field". */
        if (event.key === 'Enter') { event.preventDefault(); finish(true, true); }
        if (event.key === 'Escape') { event.preventDefault(); finish(false, true); }
      }} />}
    <button ref={pencil} type="button" className="overlay-nickname-edit"
      aria-label={value === undefined ? 'Add a nickname' : 'Edit nickname'} title={value === undefined ? 'Add a nickname' : 'Edit nickname'}
      aria-expanded={editing}
      /* Keeps the caret in the field, so a click here while typing is read as
         "done" by the click itself rather than by a blur that races it. */
      onMouseDown={(event) => { if (editing) event.preventDefault(); }}
      onClick={() => {
        if (editing) { finish(true, true); return; }
        setText(value ?? '');
        open.current = true;
        onEditingChange(true);
      }}>
      <PencilIcon />
    </button>
  </>;
}

export function MonsterOverlay({ target, game, general, preferences, onSave, onClose, onOptimize }: {
  target: MonsterReference;
  game: GameRecord | undefined;
  general: GeneralSettings;
  preferences: MonsterCopyPreferences | undefined;
  onSave: (unitId: string, preferences: MonsterCopyPreferences) => void;
  onClose: () => void;
  onOptimize: (unitId: string) => void;
}) {
  const [draft, setDraft] = useState<MonsterCopyPreferences>(
    () => preferences ?? blankMonsterCopyPreferences(target.kind === 'copy' ? target.unitId : ''),
  );
  const [dirty, setDirty] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  const monster = useMemo(() => {
    if (target.kind !== 'copy' || !game) return undefined;
    const roster = Array.isArray(game.unit_list) ? game.unit_list : [];
    return roster.find((record) => String((record as GameRecord)?.unit_id) === target.unitId) as GameRecord | undefined;
  }, [game, target]);

  const masterId = target.kind === 'copy' ? target.masterId : target.speciesId;
  const display = target.kind === 'copy' ? monsterPresentation(masterId) : monsterSpeciesPresentation(masterId);
  /* The heading names the copy the way every table does — `Lushen (2A) #2` —
     so the overlay and the row that opened it agree on which Lushen this is. */
  const heroName = useMemo(() => {
    if (target.kind !== 'copy' || !game) return display.name;
    const roster = Array.isArray(game.unit_list) ? game.unit_list as GameRecord[] : [];
    return numberedMonsterNames(roster)[target.unitId] ?? display.name;
  }, [game, target, display.name]);
  const usage: MonsterUsage = useMemo(() => monsterUsage(masterId), [masterId]);
  const resolved: ResolvedMonsterPreferences = useMemo(
    () => resolveMonsterPreferences(target.kind === 'copy' ? target.unitId : '', masterId, draft),
    [target, masterId, draft],
  );

  const totals = useMemo(() => (monster ? calculateMonsterTotals(monster) : undefined), [monster]);
  /* The eleven figures this copy actually has, derived once. The three
     composites are derived rather than stored, and derived *here* rather than
     in the row that shows them, so the reference column and the shortfall check
     can never disagree about whether a target is met. */
  const current = useMemo(
    () => (totals ? monsterTargetFigures(totals, resolved) : undefined),
    [totals, resolved],
  );

  const worn = useMemo(() => {
    if (!monster || !game) return { artifacts: {} as Partial<Record<ArtifactCategory, Artifact>>, relics: [] as Relic[] };
    const unitId = String(monster.unit_id);
    const artifacts: Partial<Record<ArtifactCategory, Artifact>> = {};
    for (const artifact of readArtifacts(game)) {
      if (!canEquipArtifacts(monster)) continue;
      if (artifact.occupiedId === unitId) artifacts[artifact.category] = artifact;
    }
    const engraved = new Set((Array.isArray(monster.relics) ? monster.relics : [])
      .map((entry) => String((entry as GameRecord | null)?.rid)));
    return { artifacts, relics: canEquipRelics(monster)
      ? readRelics(game).filter((relic) => engraved.has(relic.id)) : [] };
  }, [game, monster]);

  /* What the copy wears, written the way a desired build is, so the two read
     against each other without translation. */
  const currentBuild = useMemo(
    () => (monster ? runeBuildName(activeRuneSets(monster).map((set) => set.name)) : ''),
    [monster],
  );

  const shortfalls: Shortfall[] = useMemo(
    () => (monster && totals ? monsterShortfalls(monster, resolved, totals, worn) : []),
    [monster, resolved, totals, worn],
  );
  const statShortfalls = useMemo(() => {
    const byStat = new Map<string, Shortfall[]>();
    for (const shortfall of shortfalls) {
      if (shortfall.kind !== 'stat') continue;
      const existing = byStat.get(shortfall.wanted) ?? [];
      byStat.set(shortfall.wanted, [...existing, shortfall]);
    }
    return byStat;
  }, [shortfalls]);

  /* The same reason the preset editor keeps its focus call alone: this effect
     re-runs whenever `dirty` flips or the page re-renders around it, and a
     re-run would pull the caret back to the first field mid-edit. */
  useEffect(() => { firstField.current?.focus(); }, []);

  function change(next: (current: MonsterCopyPreferences) => MonsterCopyPreferences) {
    setDraft((state) => next(state));
    setDirty(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (target.kind !== 'copy') return;
    onSave(target.unitId, { ...draft, unitId: target.unitId });
    setDirty(false);
    onClose();
  }

  const editable = target.kind === 'copy';
  /* The same labelled row the rune overlay opens with. A species has no level
     to show, so it has no Level box either; a copy always has all three, each
     reading `—` rather than disappearing when the import cannot say, so the row
     keeps its shape. A species' element is the last digit of its id, which is
     how the game numbers the five elemental copies. */
  const facts = [
    { label: 'Element', value: elementName(target.kind === 'copy' ? monster?.attribute : Number(masterId.at(-1))) },
    { label: 'Type', value: display.archetype && display.archetype !== 'none' ? display.archetype : undefined },
    ...(target.kind === 'copy' ? [{ label: 'Level', value: monster?.unit_level === undefined ? undefined : String(monster.unit_level) }] : []),
  ];

  /** One end of one range, written back as a whole number or cleared. */
  function setLimit(end: 'statTargets' | 'statCeilings', key: keyof MonsterStatTargets, raw: string) {
    const value = readTargetField(key, raw);
    change((state) => {
      const limits = { ...state[end] };
      if (value === undefined) delete limits[key];
      else limits[key] = value;
      return { ...state, [end]: Object.keys(limits).length > 0 ? limits : undefined };
    });
  }

  /* Every menu offers its bare vocabulary, in the vocabulary's own order. The
     population's shares are read only in the Most common rows under the fields:
     a percentage beside an option, or an order sorted by it, leans on the choice
     it is meant only to inform. */
  const artifactMainOptions: ChoiceMenuOption<ArtifactMainProperty>[] =
    artifactMainPropertyOrder.map((property) => ({ value: property, label: property }));

  /* Every property the category can carry, not only the ones the population
     picks: asking for a property nobody else wants is precisely what stating a
     preference is for. */
  const substatOptions = (category: ArtifactCategory): ChoiceMenuOption<number>[] =>
    artifactPropertiesFor(category).map((definition) => ({ value: definition.id, label: definition.name }));

  const relicMainOptions: ChoiceMenuOption<RelicMainProperty>[] =
    relicMainPropertyOrder.map((property) => ({ value: property, label: property }));

  const relicUniqueOptions: ChoiceMenuOption<number>[] = relicProperties.map((definition) => ({
    value: definition.id,
    label: relicPropertyLabel(definition),
  }));

  /* An overlay holding unsaved edits does not close on a stray Escape, a
     backdrop click or the back button: it holds far more state than a
     confirmation does, and losing it to a gesture aimed at something else is
     the expensive failure. The close button still closes — that is a decision. */
  return <Overlay labelledBy="monster-overlay-title" dismissible={!dirty} onClose={onClose} onSubmit={submit}
    actions={editable ? <>
      <OverlayAction kind="reset" label="Reset to defaults"
        onClick={() => { setDraft(blankMonsterCopyPreferences(target.unitId)); setDirty(true); }} />
      <OverlayAction kind="save" label="Save changes" type="submit" disabled={!dirty} />
    </> : undefined}>
      <header className="overlay-head monster-overlay-head">
        <MonsterPortrait imageFilename={display.imageFilename} initial={display.shortName} name={display.name} decorative />
        <div className="overlay-identity">
          <div className="overlay-hero-line">
            <h2 id="monster-overlay-title" className="overlay-hero-name"
              title={labelledMonsterName(heroName, draft.label)}>
              {heroName}
              {draft.label !== undefined && !editingNickname
                && <span className="overlay-hero-nickname"> ({draft.label})</span>}
            </h2>
            {editable && <Nickname value={draft.label} editing={editingNickname} onEditingChange={setEditingNickname}
              onCommit={(label) => change((state) => ({ ...state, label }))} />}
          </div>
          <dl className="overlay-facts">
            {facts.map((fact) => <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value ?? '—'}</dd>
            </div>)}
          </dl>
        </div>
        {editable && <Button size="prominent" className="monster-overlay-optimize"
          aria-label={`Optimize runes for ${heroName}`}
          onClick={() => {
            if (dirty) onSave(target.unitId, { ...draft, unitId: target.unitId });
            onOptimize(target.unitId);
          }}>Optimize</Button>}
      </header>

      <div className="overlay-body">
        {!editable && <p className="notice">
          You do not own a copy of this monster, so there is nothing to set preferences on.
          What the wider player base equips is below.
        </p>}

        <Section title="Runes">
          {/* Two halves: the build on the left with what is worn and what the
              population wears under it, the three slot mains on the right with
              their own population under each. A slot's statistics sit under the
              slot they describe, where they are read against its answer. */}
          <div className="overlay-runes">
            <div className="overlay-lines">
              {editable && <Line label="Desired builds">
                <RuneBuildField chosen={resolved.runes.sets.chosen}
                  onChange={(next) => change((state) => ({ ...state, runeSets: next }))} />
              </Line>}
              {(monster !== undefined || editable) && <Line label="Current">
                {/* The concession shares the line with what is worn: both qualify
                    the builds above rather than being a build of their own. */}
                <div className="overlay-build-row">
                  {/* Full ink rather than the reference grey: of everything worn,
                      the set build is the fact read first against the answer. */}
                  <span className="overlay-current-build">
                    {monster === undefined ? '—' : currentBuild === '' ? 'No runes equipped' : currentBuild}
                  </span>
                  {editable && <div className="overlay-toggles">
                    <label className="overlay-toggle">
                      <input type="checkbox" checked={resolved.runes.allowBroken}
                        onChange={(event) => change((state) => ({ ...state, allowBrokenSets: event.target.checked }))} />
                      <span>Allow broken sets</span>
                    </label>
                    <label className="overlay-toggle">
                      <input type="checkbox" checked={resolved.runes.allowIntangible}
                        onChange={(event) => change((state) => ({ ...state, allowIntangibleRunes: event.target.checked }))} />
                      <span>Allow Intangible runes</span>
                    </label>
                    <label className="overlay-toggle">
                      <input type="checkbox" checked={resolved.runes.allowImmemorial}
                        onChange={(event) => change((state) => ({ ...state, allowImmemorialItems: event.target.checked }))} />
                      <span>Allow Immemorial Gems and Grindstones</span>
                    </label>
                  </div>}
                </div>
              </Line>}
              <Line label="Most common">
                <Usage entries={usage.runes?.builds} />
              </Line>
            </div>
            <div className="overlay-slot-row">
              {runeSlotKeys.map((key) => <div className="overlay-slot" key={key}>
                <span className="overlay-slot-name">Slot {slotNumbers[key]}</span>
                {editable && <RuneSlotMainField slot={slotNumbers[key]}
                  options={runeSlotMainsBySlot[key]}
                  chosen={resolved.runes.slots[key].source === 'user' ? resolved.runes.slots[key].chosen : []}
                  onChange={(next) => change((state) => ({
                    ...state,
                    runeSlots: { ...state.runeSlots, [key]: next },
                  }))} />}
                <Usage entries={usage.runes?.slots[key]} />
              </div>)}
            </div>
          </div>
        </Section>

        {current !== undefined && <Section title="Stats">
          <div className="stat-ranges">
            {targetRows.map((row, index) => {
              const marks = statShortfalls.get(row.label) ?? [];
              /* The copy's own figure, dimmed under the range: what is wanted
                 leads, what is there qualifies it. Every mark the figure carries
                 follows it on its own line. */
              const now = <>
                {formatNumber(current[row.key], general)}
                <FigureMarks marks={[
                  ...shortfallMarks(marks, general),
                  ...(row.key === 'criRate' ? criticalRateMarks(resolved) : []),
                ]} />
              </>;
              /* A monster that always crits is never asked for CRI Rate, so the
                 fields say so by standing still rather than by vanishing. */
              const crits = row.key === 'criRate' && resolved.alwaysCrits;
              return editable
                ? <StatRangeField key={row.key} figure={row.key} label={row.label} firstField={index === 0 ? firstField : undefined}
                  atLeast={draft.statTargets?.[row.key]} atMost={draft.statCeilings?.[row.key]}
                  onAtLeast={(raw) => setLimit('statTargets', row.key, raw)}
                  onAtMost={(raw) => setLimit('statCeilings', row.key, raw)}
                  disabled={crits} title={crits ? 'Always crits, so no CRI Rate is needed' : undefined}
                  current={now} />
                : <div className="overlay-stat" key={row.key}>
                  <p className="overlay-stat-head">{row.label}</p>
                  <p className="overlay-stat-value">{formatNumber(current[row.key], general)}</p>
                  <p className="overlay-stat-current">{now}</p>
                </div>;
            })}
          </div>
          {editable && <div className="overlay-suggestion">
            <label className="overlay-suggestion-label" htmlFor="rune-suggestion-stat">
              When these are met show me Rune suggestions based on the highest…
            </label>
            <Dropdown id="rune-suggestion-stat" className="overlay-suggestion-select"
              placeholder="No preference"
              value={draft.runeSuggestionStat ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                change((state) => (value === ''
                  ? { ...state, runeSuggestionStat: undefined }
                  : { ...state, runeSuggestionStat: value as keyof MonsterStatTargets }));
              }}>
              {targetRows.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}
            </Dropdown>
          </div>}
          {editable && <div className="overlay-crit-options" role="group" aria-label="Crit bonuses">
            <label className="overlay-toggle">
              <input type="checkbox" checked={resolved.alwaysCrits}
                onChange={(event) => change((state) => ({ ...state, alwaysCrits: event.target.checked }))} />
              <span>Always crits</span>
            </label>
            <label className="overlay-toggle">
              <input type="checkbox" checked={resolved.alwaysElementAdvantage}
                onChange={(event) => change((state) => ({ ...state, alwaysElementAdvantage: event.target.checked }))} />
              <span>Always element advantage</span>
            </label>
            <label className="overlay-crit-lead">
              <span>Crit lead</span>
              <input type="number" min={0} max={100} step={1} inputMode="numeric"
                aria-label="Crit lead, in percent" placeholder="—" value={draft.critLead ?? ''}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  const parsed = Number(raw);
                  const value = raw === '' || !Number.isFinite(parsed)
                    ? undefined : Math.min(100, Math.max(0, Math.round(parsed)));
                  change((state) => ({ ...state, critLead: value }));
                }} />
              <span>%</span>
            </label>
          </div>}
        </Section>}

        <div className="overlay-equipment-panels">
          {(['attribute', 'type'] as const).map((category) => {
            const stated = draft.artifacts?.[category];
            const equipped = worn.artifacts[category];
            const panel = usage.artifacts?.[category];
            const chosenSubs = stated?.sub === undefined ? [] : Object.keys(stated.sub).map(Number);
            return <Section key={category} title={`${categoryLabels[category]} artifact`}>
              <div className="overlay-lines">
                {editable && <Line label="Main stats">
                  <MultiChoiceMenu<ArtifactMainProperty>
                    label={`${categoryLabels[category]} artifact main stats`}
                    options={artifactMainOptions}
                    chosen={stated?.main ?? []}
                    empty="Any main"
                    onChange={(next) => change((state) => ({
                      ...state,
                      artifacts: {
                        ...state.artifacts,
                        [category]: { ...state.artifacts?.[category], main: next },
                      },
                    }))} />
                </Line>}
                {editable && <Line label="Substats">
                  <MultiChoiceMenu<number>
                    label={`${categoryLabels[category]} artifact substats`}
                    options={substatOptions(category)}
                    chosen={chosenSubs}
                    empty="Any substat"
                    onChange={(next) => change((state) => {
                      const existing = state.artifacts?.[category]?.sub ?? {};
                      /* Each property keeps whatever floor it already carried;
                         a property added now starts with none, which means
                         wanted at any roll. */
                      const sub = Object.fromEntries(next.map((id) =>
                        [String(id), existing[String(id)] ?? ({} as ArtifactSubPreference)]));
                      return {
                        ...state,
                        artifacts: { ...state.artifacts, [category]: { ...state.artifacts?.[category], sub } },
                      };
                    })} />
                </Line>}
                {editable && chosenSubs.length > 0 && <Line label="At least">
                  <div className="overlay-substats">
                    {chosenSubs.map((id) => {
                      const name = artifactProperty(id)?.name ?? `Property ${id}`;
                      const own = stated?.sub?.[String(id)];
                      return <label className="overlay-substat" key={id}>
                        <span className="overlay-substat-name">{name}</span>
                        <input type="number" min={0} max={substatMinimumMaximum / 100} step={0.1} inputMode="decimal"
                          aria-label={`Minimum ${name} for the ${categoryLabels[category]} artifact, in percent`}
                          placeholder="any"
                          value={own?.minimumHundredths === undefined ? '' : own.minimumHundredths / 100}
                          onChange={(event) => {
                            const raw = event.target.value.trim();
                            const parsed = Number(raw);
                            /* An empty field is *absent* — the property is
                               wanted at any roll — where `0` is a stated floor
                               of nothing (`AGENTS.md` §3). */
                            const minimum = raw === '' || !Number.isFinite(parsed)
                              ? undefined
                              : Math.min(substatMinimumMaximum, Math.max(0, Math.round(parsed * 100)));
                            change((state) => {
                              const existing = state.artifacts?.[category]?.sub ?? {};
                              return {
                                ...state,
                                artifacts: {
                                  ...state.artifacts,
                                  [category]: {
                                    ...state.artifacts?.[category],
                                    sub: { ...existing, [String(id)]: minimum === undefined ? {} : { minimumHundredths: minimum } },
                                  },
                                },
                              };
                            });
                          }} />
                        <span className="overlay-substat-unit">%</span>
                        <FigureMarks marks={shortfallMarks(shortfalls.filter((shortfall) => shortfall.kind === 'artifact-sub'
                          && shortfall.where === categoryLabels[category] && shortfall.wanted === name), general)} reserve={1} />
                      </label>;
                    })}
                  </div>
                </Line>}
                {monster !== undefined && <Line label="Current">
                  <span className="overlay-current-value">
                    {equipped === undefined ? 'None equipped' : [
                      equipped.mainProperty,
                      ...equipped.subProperties.map((line) => displaySubProperty(line, (value) => formatNumber(value, general))),
                    ].join(' · ')}
                  </span>
                </Line>}
                <Line label="Most common">
                  <Usage entries={panel?.main.filter((entry) => entry.wanted)} />
                </Line>
                <Line label="Common substats">
                  <Usage entries={panel?.sub.filter((entry) => entry.wanted)} />
                </Line>
              </div>
            </Section>;
          })}
        <Section title="Relics">
          <div className="overlay-lines">
            {editable && <Line label="Main stats">
              <MultiChoiceMenu<RelicMainProperty>
                label="Relic main stats"
                options={relicMainOptions}
                chosen={draft.relics?.main ?? []}
                empty="Any main"
                onChange={(next) => change((state) => ({
                  ...state, relics: { ...state.relics, main: next },
                }))} />
            </Line>}
            {editable && <Line label="Uniques">
              <MultiChoiceMenu<number>
                label="Relic unique properties"
                options={relicUniqueOptions}
                chosen={draft.relics?.unique ?? []}
                empty="Any unique"
                onChange={(next) => change((state) => ({
                  ...state, relics: { ...state.relics, unique: next },
                }))} />
            </Line>}
            {monster !== undefined && <Line label="Current">
              <span className="overlay-current-value">
                {worn.relics.length === 0 ? 'None engraved' : worn.relics
                  .map((relic) => `${relic.mainProperty} ${relic.mainPercent} % · ${relicPropertyLabel(relic.unique.definition)}`)
                  .join(' · ')}
              </span>
            </Line>}
            <Line label="Most common">
              <Usage entries={usage.relics?.main.filter((entry) => entry.wanted)} />
            </Line>
            <Line label="Common uniques">
              <Usage entries={usage.relics?.unique.filter((entry) => entry.wanted)} />
            </Line>
          </div>
        </Section>
        </div>
      </div>
  </Overlay>;
}
