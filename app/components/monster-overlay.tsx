import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { BandedChoiceLine } from './banded-choice-line';
import type { ChoiceBand } from './banded-choice-line';
import { Dropdown } from './dropdown';
import { FigureMarks } from './figure-marks';
import { combatBonusMarks, mainStatAdviceMarks, shortfallMarks } from '../lib/figure-marks';
import type { FigureMark } from '../lib/figure-marks';
import { MonsterPortrait } from './monster-portrait';
import { EngravedArtifacts, EngravedRelics, EngravedRunes } from './monster-engraved-gear';
import { RuneBuildField } from './rune-build-field';
import { RuneSlotMainField } from './rune-slot-main-field';
import { StatRangeField } from './stat-range-field';
import type { TokenChoiceOption } from './token-choice-field';
import { Button } from './button';
import { Overlay, OverlayAction } from './overlay';
import { PencilIcon } from './pencil-icon';
import type { MonsterReference } from './monster-link';
import type { Artifact } from '../lib/artifacts';
import { usePresets } from '../lib/presets-context';
import { accountItems, defaultPresetId, monsterInPreset } from '../lib/presets';
import { readArtifacts } from '../lib/artifacts';
import type { ArtifactCategory, ArtifactMainProperty } from '../lib/artifact-properties';
import { artifactMainPropertyOrder, artifactPropertiesFor } from '../lib/artifact-properties';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { monsterPresentation, monsterSpeciesPresentation } from '../lib/monster-catalog';
import { labelledMonsterName, numberedMonsterNames } from '../lib/monster-names';
import type { RuneSlotKey } from '../lib/monster-defaults';
import { runeSlotKeys } from '../lib/monster-defaults';
import type {
  BandedChoices, MonsterCopyPreferences, MonsterStatTargets,
} from '../lib/monster-preferences';
import {
  blankMonsterCopyPreferences, leadFieldOf, leadMaximum, monsterLabelMaximum, readLeadField, readTargetField,
} from '../lib/monster-preferences';
import { resolveMonsterPreferences } from '../lib/monster-preference-resolution';
import type { ResolvedMonsterPreferences } from '../lib/monster-preference-resolution';
import type { Shortfall } from '../lib/monster-shortfall';
import { monsterShortfalls } from '../lib/monster-shortfall';
import { monsterTargetFigures } from '../lib/monster-stats';
import type { LeadStat } from '../lib/monster-stats';
import { monsterUsage } from '../lib/monster-usage-statistics';
import type { MonsterUsage } from '../lib/monster-usage-statistics';
import type { Relic } from '../lib/relics';
import { readRelics } from '../lib/relics';
import { canEngraveArtifacts, canEngraveRelics } from '../lib/monster-engrave-eligibility';
import { relicProperties, relicPropertyLabel } from '../lib/relic-properties';
import { roleTargetColumns } from '../lib/rune-roles';
import { runeSlotMainsBySlot } from '../lib/rune-slot-mains';
import { activeRuneSets, elementName } from '../lib/rune-sets';
import { runeBuildName } from '../lib/rune-set-pairs';
import { readRune } from '../lib/runes';
import type { Rune } from '../lib/runes';
import type { GeneralSettings } from '../lib/types';

/**
 * Where the user says what one monster is for.
 *
 * **Everything on this panel is a statement the optimizers will act on.** The
 * user names the rune builds they will accept, the artifact and relic
 * properties worth engraving, and the figures the copy is being built toward;
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
 *
 * **Two columns: what is wanted on the left, what is engraved on the right.** The
 * answers take two thirds, in the order they are given — builds, stats, the
 * switches that qualify both, then gear — and what the copy has engraved now takes the
 * last third, compactly, so the two are read across one line of sight and the
 * whole panel fits a 1080-pixel screen without scrolling.
 */

const categoryLabels: Record<ArtifactCategory, string> = { attribute: 'Attribute', type: 'Type' };
const slotNumbers: Record<RuneSlotKey, number> = { slot2: 2, slot4: 4, slot6: 6 };

/* The five leads, in the order the user asked for them: the crit lead first, as
   it was alone before the other four joined it. */
const leadRows: ReadonlyArray<{ stat: LeadStat; label: string; name: string }> = [
  { stat: 'criRate', label: 'Crit lead', name: 'Crit lead' },
  { stat: 'atk', label: 'Attack', name: 'Attack lead' },
  { stat: 'def', label: 'Defence', name: 'Defence lead' },
  { stat: 'spd', label: 'Speed', name: 'Speed lead' },
  { stat: 'hp', label: 'HP', name: 'HP lead' },
];
/* The figures a lead or a crit condition can mark, which keep room for two marks. */
const leadFigures: ReadonlySet<string> = new Set(['criRate', 'atk', 'def', 'spd', 'hp']);

/** The eleven figures a copy can be built toward, in the order they are offered. */
const targetRows: ReadonlyArray<{ key: keyof MonsterStatTargets; label: string }> =
  roleTargetColumns.map((column) => ({ key: column.key, label: `${column.label}${column.unit ?? ''}` }));

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
  const share = (value: number) => `${(value * 100).toFixed(0)} %`;
  /* The whole row in the title as well, since a narrow column clips its tail
     rather than wrapping it onto a second line. */
  return <div className="usage-line" title={shown.map((entry) => `${entry.label} ${share(entry.share)}`).join(', ') || undefined}>
    {shown.length === 0
      ? <span className="overlay-empty">Not captured</span>
      : shown.map((entry) => <span className="usage-entry" key={entry.label}>
        {entry.label}
        <span className="usage-share">{share(entry.share)}</span>
      </span>)}
  </div>;
}

/**
 * One gear question across the gear grid: its name and the two bands it is
 * answered in, on one row.
 */
function GearRow<T extends string | number>({ name, options, value, onChange, marks = [] }: {
  name: string;
  options: readonly TokenChoiceOption<T>[];
  value: BandedChoices<T> | undefined;
  onChange: (next: BandedChoices<T>) => void;
  /* After the name, which sits flush left in a fixed column, so a mark arriving
     moves nothing (`AGENTS.md` §2). */
  marks?: readonly FigureMark[];
}) {
  const bands: ChoiceBand[] = ['preferred', 'acceptable'];
  return <>
    <p className="overlay-row-label">{name}<FigureMarks marks={marks} /></p>
    {bands.map((band) => <BandedChoiceLine key={band} name={name} band={band}
      options={options} value={value} onChange={onChange} />)}
  </>;
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

export function MonsterOverlay({ target, game, general, preferences, presetId, onSave, onClose, onOptimize }: {
  target: MonsterReference;
  game: GameRecord | undefined;
  general: GeneralSettings;
  preferences: MonsterCopyPreferences | undefined;
  /** The preset the overlay was opened for, else the one chosen across the program; read here only where the copy stands in it. */
  presetId: string;
  onSave: (unitId: string, preferences: MonsterCopyPreferences) => void;
  onClose: () => void;
  onOptimize: (unitId: string, presetId: string) => void;
}) {
  const [draft, setDraft] = useState<MonsterCopyPreferences>(
    () => preferences ?? blankMonsterCopyPreferences(target.kind === 'copy' ? target.unitId : ''),
  );
  const [dirty, setDirty] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const presetsReading = usePresets();

  /* One preset for the whole panel — the gear it shows, the figures it reads and
     the build Optimize opens — so the box in the head names what everything
     below is about. It is the preset the overlay was opened for — or, from a
     place about no preset, the program's chosen one — where the copy stands in
     it, and Default where it does not. */
  const preset = useMemo(() => {
    const unitId = target.kind === 'copy' ? target.unitId : '';
    return presetsReading.presets.find((entry) => entry.id === presetId && (entry.kind === 'default' || entry.members.includes(unitId)))
      ?? presetsReading.presets.find((entry) => entry.kind === 'default');
  }, [presetsReading.presets, presetId, target]);
  const monster = useMemo(() => {
    if (target.kind !== 'copy' || !game) return undefined;
    const roster = Array.isArray(game.unit_list) ? game.unit_list : [];
    const record = roster.find((entry) => String((entry as GameRecord)?.unit_id) === target.unitId) as GameRecord | undefined;
    return record && preset ? monsterInPreset(record, preset, accountItems(game)) : record;
  }, [game, target, preset]);

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
    () => resolveMonsterPreferences(target.kind === 'copy' ? target.unitId : '', masterId, draft, monster),
    [target, masterId, draft, monster],
  );

  /* The eleven figures this copy has, as its own panel shows them — no lead in
     any of them. The three composites are derived rather than stored, from the
     same stat sheet the shortfall check reads with the leads counted. */
  const current = useMemo(
    () => (monster ? monsterTargetFigures(monster, resolved) : undefined),
    [monster, resolved],
  );

  const engraved = useMemo(() => {
    if (!monster || !game) return { artifacts: {} as Partial<Record<ArtifactCategory, Artifact>>, relics: [] as Relic[] };
    const unitId = String(monster.unit_id);
    const artifacts: Partial<Record<ArtifactCategory, Artifact>> = {};
    /* The preset's artifacts, not the ones the export marks as engraved, which are Default's. */
    const inPreset = new Set(preset?.artifactsOf.get(unitId) ?? []);
    for (const artifact of readArtifacts(game)) {
      if (!canEngraveArtifacts(monster)) continue;
      if (inPreset.has(artifact.id)) artifacts[artifact.category] = artifact;
    }
    const relicIds = new Set((Array.isArray(monster.relics) ? monster.relics : [])
      .map((entry) => String((entry as GameRecord | null)?.rid)));
    return { artifacts, relics: canEngraveRelics(monster)
      ? readRelics(game).filter((relic) => relicIds.has(relic.id)) : [] };
  }, [game, monster, preset]);

  /* Read from the copy's own record, where the export keeps what a monster
     has engraved, through the one rune reader every page uses. */
  const engravedRunes = useMemo(() => (Array.isArray(monster?.runes) ? monster.runes : [])
    .map(readRune).filter((rune): rune is Rune => rune !== null), [monster]);

  /* What the copy has engraved, written the way a desired build is, so the two read
     against each other without translation. */
  const currentBuild = useMemo(
    () => (monster ? runeBuildName(activeRuneSets(monster).map((set) => set.name)) : ''),
    [monster],
  );

  const shortfalls: Shortfall[] = useMemo(
    () => (monster ? monsterShortfalls(monster, resolved, engraved) : []),
    [monster, resolved, engraved],
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

  /* The same reason the role editor keeps its focus call alone: this effect
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
  /* The presets the copy stands in, each with gear of its own, are counted here
     and named on hover (`DECK-PRESETS.md` §5); the box beside names the one read. */
  const memberOf = target.kind === 'copy'
    ? presetsReading.presets.filter((preset) => preset.kind !== 'default' && preset.members.includes(target.unitId))
    : [];
  const facts: { label: string; value: string | undefined; title?: string }[] = [
    { label: 'Element', value: elementName(target.kind === 'copy' ? monster?.attribute : Number(masterId.at(-1))) },
    { label: 'Type', value: display.archetype && display.archetype !== 'none' ? display.archetype : undefined },
    ...(target.kind === 'copy' ? [
      { label: 'Level', value: monster?.unit_level === undefined ? undefined : String(monster.unit_level) },
      { label: 'Presets', value: String(memberOf.length), title: memberOf.map((preset) => preset.name).join('\n') || undefined },
    ] : []),
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
     population's shares are read only in the Most common column beside the
     fields: a percentage beside an option, or an order sorted by it, leans on
     the choice it is meant only to inform. */
  const mainStatOptions: TokenChoiceOption<ArtifactMainProperty>[] =
    artifactMainPropertyOrder.map((property) => ({ value: property, label: property }));

  /* Every property the category can carry, not only the ones the population
     picks: asking for a property nobody else wants is precisely what stating a
     preference is for. */
  const substatOptions = (category: ArtifactCategory): TokenChoiceOption<number>[] =>
    artifactPropertiesFor(category).map((definition) => ({ value: definition.id, label: definition.name }));

  const relicUniqueOptions: TokenChoiceOption<number>[] = relicProperties.map((definition) => ({
    value: definition.id,
    label: relicPropertyLabel(definition),
  }));

  /* The one main answer serves every piece, but the population was asked per
     artifact category, so its reference names which artifact each share is
     from — on one line, the leading main of each. */
  const mainUsage = (['attribute', 'type'] as const).flatMap((category) => {
    const leading = usage.artifacts?.[category]?.main.find((entry) => entry.wanted);
    return leading === undefined ? [] : [{ label: `${categoryLabels[category]} ${leading.label}`, share: leading.share }];
  });

  const setArtifactSub = (category: ArtifactCategory, next: BandedChoices<number>) => change((state) => ({
    ...state, artifacts: { ...state.artifacts, sub: { ...state.artifacts?.sub, [category]: next } },
  }));

  const format = (value: number) => formatNumber(value, general);

  const toggle = (label: string, checked: boolean, onChange: (checked: boolean) => void) =>
    <label className="overlay-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>;

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
            {facts.map((fact) => <div key={fact.label} title={fact.title}>
              <dt>{fact.label}</dt>
              <dd>{fact.value ?? '—'}</dd>
            </div>)}
          </dl>
        </div>
        {editable && <Button size="prominent" className="monster-overlay-optimize"
          aria-label={`Optimize runes for ${heroName}`}
          onClick={() => {
            if (dirty) onSave(target.unitId, { ...draft, unitId: target.unitId });
            onOptimize(target.unitId, preset?.id ?? defaultPresetId);
          }}>Optimize</Button>}
        {/* Which preset the build is for, where it cannot be missed: the same copy
            carries a different build in each preset it stands in. */}
        {editable && <div className="monster-overlay-preset" role="group" aria-label="Build for preset">
          <span className="monster-overlay-preset-label">Build for</span>
          <span className="monster-overlay-preset-name" title={preset?.name}>{preset?.name ?? 'Default'}</span>
        </div>}
      </header>

      <div className="overlay-body monster-overlay-body">
        <div className="monster-overlay-wants">
          <Section title="Runes">
            <div className="overlay-lines">
              {editable && <Line label="Desired builds">
                <RuneBuildField chosen={resolved.runes.sets.chosen}
                  onChange={(next) => change((state) => ({ ...state, runeSets: next }))} />
              </Line>}
              <Line label="Most common">
                <Usage entries={usage.runes?.builds} />
              </Line>
            </div>
            {/* A slot's statistics sit under the slot they describe, where they
                are read against its answer. */}
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
          </Section>

          {current !== undefined && <Section title="Stats">
            <div className="stat-ranges overlay-stat-ranges">
              {targetRows.map((row, index) => {
                const marks = statShortfalls.get(row.label) ?? [];
                /* The copy's own figure, dimmed under the range: what is wanted
                   leads, what is there qualifies it. Every mark the figure carries
                   follows it on its own line. */
                const now = <>
                  {formatNumber(current[row.key], general)}
                  <FigureMarks marks={[...shortfallMarks(marks, general), ...combatBonusMarks(row.key, resolved)]}
                    reserve={leadFigures.has(row.key) ? 2 : 1} />
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
                    <span className="overlay-stat-current">{now}</span>
                  </div>;
              })}
              {/* The tie-break the ranges leave open, in the twelfth cell beside
                  them: what to maximise once every range above is met. */}
              {editable && <div className="overlay-sort">
                <label className="overlay-stat-head" htmlFor="rune-suggestion-stat">When met, sort by</label>
                <Dropdown id="rune-suggestion-stat" className="overlay-sort-select"
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
            </div>
          </Section>}

          {/* The switches that qualify the answers above rather than being
              answers of their own: which runes a build may use and how its
              damage is counted on the left, and what a leader adds on the right.
              Which held Immemorial items may be spent is not here — that is the
              account's question, asked once on Rune Optimization. */}
          {editable && <Section title="Settings">
            <div className="overlay-settings">
              <div className="overlay-settings-toggles" role="group" aria-label="Rune allowances and crit bonuses">
                {toggle('Allow broken sets', resolved.runes.allowBroken,
                  (checked) => change((state) => ({ ...state, allowBrokenSets: checked })))}
                {/* Two columns read down: the rune allowances on the left, how
                    damage is counted on the right. */}
                {toggle('Always crits', resolved.alwaysCrits,
                  (checked) => change((state) => ({ ...state, alwaysCrits: checked })))}
                {toggle('Allow Intangible runes', resolved.runes.allowIntangible,
                  (checked) => change((state) => ({ ...state, allowIntangibleRunes: checked })))}
                {toggle('Always element advantage', resolved.alwaysElementAdvantage,
                  (checked) => change((state) => ({ ...state, alwaysElementAdvantage: checked })))}
              </div>
              <div className="overlay-leads" role="group" aria-label="Leads and bonuses">
                <p className="overlay-row-label">Leads and bonuses</p>
                <div className="overlay-leads-fields">
                  {leadRows.map((row) => <label className="overlay-lead" key={row.stat}>
                    <span>{row.label}</span>
                    <input type="number" min={0} max={leadMaximum} step={1} inputMode="numeric"
                      aria-label={`${row.name}, in percent`} placeholder="—" value={draft[leadFieldOf[row.stat]] ?? ''}
                      onChange={(event) => {
                        const value = readLeadField(event.target.value);
                        change((state) => ({ ...state, [leadFieldOf[row.stat]]: value }));
                      }} />
                    <span>%</span>
                  </label>)}
                </div>
              </div>
            </div>
          </Section>}

          {/* One grid for every gear question, so Preferred and Accepted each
              start on one vertical line and a row reads across. */}
          {editable && <Section title="Artifacts and relics">
            <div className="overlay-gear">
              <span aria-hidden="true" />
              <p className="overlay-row-label">Preferred</p>
              <p className="overlay-row-label">Accepted</p>
              <GearRow name="Main stat" options={mainStatOptions} value={draft.mainStat}
                marks={mainStatAdviceMarks(draft, resolved.mainStatAdvice)}
                onChange={(next) => change((state) => ({ ...state, mainStat: next }))} />
              {(['attribute', 'type'] as const).map((category) => <GearRow key={category}
                name={`${categoryLabels[category]} substats`} options={substatOptions(category)}
                value={draft.artifacts?.sub?.[category]}
                onChange={(next) => setArtifactSub(category, next)} />)}
              <GearRow name="Relic uniques" options={relicUniqueOptions} value={draft.relics?.unique}
                onChange={(next) => change((state) => ({ ...state, relics: { ...state.relics, unique: next } }))} />
            </div>
          </Section>}
        </div>

        <div className="monster-overlay-engraved">
          {monster === undefined
            ? <p className="notice">
              You do not own a copy of this monster, so there is nothing to set preferences on.
              What the wider player base engraves is below.
            </p>
            : <>
              {/* What the copy has engraved, written the way a desired build is, so the
                  two read against each other without translation. */}
              {/* The gear of the preset named in the head; the relics are Default's in every preset. */}
              <Section title="Engraved runes" note={currentBuild === '' ? 'No runes engraved' : currentBuild}>
                <EngravedRunes runes={engravedRunes} format={format} />
              </Section>
              <Section title="Engraved artifacts">
                <EngravedArtifacts artifacts={engraved.artifacts} format={format} />
              </Section>
              <Section title="Engraved relics">
                <EngravedRelics relics={engraved.relics} format={format} />
              </Section>
            </>}
          {/* The population's artifacts, as reference beside what this copy
              has engraved rather than inside the answers. Relics are left out: their
              statistics are one unique nearly every monster leads with, and say
              almost nothing about this one (`ARTIFACT-CANONICAL.md` §19.3). */}
          <Section title="Most common artifacts">
            <div className="overlay-lines overlay-common">
              <Line label="Main stat"><Usage entries={mainUsage} /></Line>
              {(['attribute', 'type'] as const).map((category) => <Line key={category} label={categoryLabels[category]}>
                <Usage entries={usage.artifacts?.[category]?.sub.filter((entry) => entry.wanted)} />
              </Line>)}
            </div>
          </Section>
        </div>
      </div>
  </Overlay>;
}
