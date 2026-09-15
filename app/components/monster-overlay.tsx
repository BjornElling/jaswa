import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './button';
import { MultiChoiceMenu } from './choice-menu';
import type { ChoiceMenuOption } from './choice-menu';
import { Dropdown } from './dropdown';
import { MonsterPortrait } from './monster-portrait';
import { RuneBuildMenu } from './rune-build-menu';
import { ShortfallMark } from './shortfall-mark';
import type { MonsterReference } from './monster-link';
import type { Artifact } from '../lib/artifacts';
import { readArtifacts } from '../lib/artifacts';
import type { ArtifactCategory, ArtifactMainProperty } from '../lib/artifact-properties';
import { artifactMainPropertyOrder, artifactPropertiesFor, artifactProperty } from '../lib/artifact-properties';
import { displaySubProperty } from '../lib/artifact-grid';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { monsterPresentation, monsterSpeciesPresentation } from '../lib/monster-catalog';
import type { RuneSlotKey } from '../lib/monster-defaults';
import { runeSlotKeys } from '../lib/monster-defaults';
import type {
  ArtifactSubPreference, MonsterCopyPreferences, MonsterStatTargets,
} from '../lib/monster-preferences';
import {
  blankMonsterCopyPreferences, monsterCompositeTargetMaximum, monsterLabelMaximum, substatMinimumMaximum,
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
import { relicMainPropertyOrder, relicProperties, relicPropertyLabel } from '../lib/relic-properties';
import type { RelicMainProperty } from '../lib/relic-properties';
import { presetTargetColumns, presetTargetMaximum, runeMainStats } from '../lib/rune-potential-presets';
import type { RuneMainStat } from '../lib/rune-potential-presets';
import { activeRuneSets, elementName } from '../lib/rune-sets';
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
 * A community row, shown as reference: what the population does, and the sample
 * behind it.
 *
 * It is reference only. There is no longer any way to adopt it as an answer —
 * the Adopt buttons are gone, because a statistic the user has not looked at is
 * not a decision they made, and a panel that let one become a decision in a
 * click made every default look like a choice. Where the user says nothing, the
 * optimizers fall back on these figures anyway, so adopting them explicitly
 * changed nothing except who appeared to have decided.
 */
function Usage({ entries, observations }: {
  entries: ReadonlyArray<{ label: string; share: number }> | undefined;
  observations: number | undefined;
}) {
  const shown = (entries ?? []).slice(0, 3);
  return <div className="usage-line">
    {shown.length === 0
      ? <span className="overlay-empty">Not captured for this monster.</span>
      : shown.map((entry) => <span className="usage-entry" key={entry.label}>
        {entry.label}
        <span className="usage-share">{(entry.share * 100).toFixed(0)} %</span>
      </span>)}
    {/* Reserved whether or not there is a sample, so the row keeps its height.
        A share without its sample size is what the dataset itself refuses to
        store: 58 % of 41,203 builds and 58 % of 12 are not the same fact. */}
    <span className="usage-sample">
      {shown.length > 0 && observations !== undefined ? `${observations.toLocaleString('en')} measured` : ''}
    </span>
  </div>;
}

/** The share the population gives one option, as the menus show it. */
function shareNote(share: number | undefined): string | undefined {
  return share === undefined ? undefined : `${(share * 100).toFixed(0)} %`;
}

export function MonsterOverlay({ target, game, general, preferences, onSave, onClose }: {
  target: MonsterReference;
  game: GameRecord | undefined;
  general: GeneralSettings;
  preferences: MonsterCopyPreferences | undefined;
  onSave: (unitId: string, preferences: MonsterCopyPreferences) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<MonsterCopyPreferences>(
    () => preferences ?? blankMonsterCopyPreferences(target.kind === 'copy' ? target.unitId : ''),
  );
  const [dirty, setDirty] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLFormElement>(null);

  const monster = useMemo(() => {
    if (target.kind !== 'copy' || !game) return undefined;
    const roster = Array.isArray(game.unit_list) ? game.unit_list : [];
    return roster.find((record) => String((record as GameRecord)?.unit_id) === target.unitId) as GameRecord | undefined;
  }, [game, target]);

  const masterId = target.kind === 'copy' ? target.masterId : target.speciesId;
  const display = target.kind === 'copy' ? monsterPresentation(masterId) : monsterSpeciesPresentation(masterId);
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
  const current = useMemo(() => (totals ? monsterTargetFigures(totals) : undefined), [totals]);

  const worn = useMemo(() => {
    if (!monster || !game) return { artifacts: {} as Partial<Record<ArtifactCategory, Artifact>>, relics: [] as Relic[] };
    const unitId = String(monster.unit_id);
    const artifacts: Partial<Record<ArtifactCategory, Artifact>> = {};
    for (const artifact of readArtifacts(game)) {
      if (artifact.occupiedId === unitId) artifacts[artifact.category] = artifact;
    }
    const engraved = new Set((Array.isArray(monster.relics) ? monster.relics : [])
      .map((entry) => String((entry as GameRecord | null)?.rid)));
    return { artifacts, relics: readRelics(game).filter((relic) => engraved.has(relic.id)) };
  }, [game, monster]);

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

  useEffect(() => {
    firstField.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        /* An overlay holding unsaved edits does not close on a stray Escape:
           it holds far more state than a confirmation does, and losing it to a
           keypress aimed at something else is the expensive failure. */
        if (dirty) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog.current) return;
      /* `aria-modal` alone does not trap focus in any browser, and this panel is
         long enough that tabbing out of it strands the reader behind a
         backdrop they cannot see past. */
      const focusable = dialog.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dirty, onClose]);

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
  const facts = [
    elementName(monster?.attribute),
    display.archetype && display.archetype !== 'none' ? display.archetype : undefined,
    monster?.unit_level === undefined ? undefined : `Lv. ${monster.unit_level}`,
  ].filter((fact): fact is string => Boolean(fact));

  /** One target field's value, written back as a whole number or cleared. */
  function setTarget(key: keyof MonsterStatTargets, raw: string) {
    const trimmed = raw.trim();
    const parsed = Number(trimmed);
    const ceiling = key === 'dmg' || key === 'ehp' || key === 'ehpD'
      ? monsterCompositeTargetMaximum : presetTargetMaximum;
    change((state) => {
      const targets = { ...state.statTargets };
      /* An empty field is *absent* — this copy does not aim at the stat — where
         `0` is a stated target of nothing (`AGENTS.md` §3). */
      if (trimmed === '' || !Number.isFinite(parsed)) delete targets[key];
      else targets[key] = Math.min(ceiling, Math.max(0, Math.round(parsed)));
      return { ...state, statTargets: Object.keys(targets).length > 0 ? targets : undefined };
    });
  }

  const artifactMainOptions = (category: ArtifactCategory): ChoiceMenuOption<ArtifactMainProperty>[] =>
    artifactMainPropertyOrder.map((property) => ({
      value: property,
      label: property,
      note: shareNote(resolved.artifacts[category].main.shares.get(property)),
    }));

  const substatOptions = (category: ArtifactCategory): ChoiceMenuOption<number>[] => {
    const shares = new Map((usage.artifacts?.[category]?.sub ?? []).map((entry) => [entry.id, entry.share]));
    /* Every property the category can carry, not only the ones the population
       picks: asking for a property nobody else wants is precisely what stating
       a preference is for. The widely used ones lead, because that is the order
       the shares beside them read in, and the rest keep the vocabulary's own
       order behind them. */
    return artifactPropertiesFor(category)
      .map((definition) => ({
        value: definition.id,
        label: definition.name,
        note: shareNote(shares.get(definition.id)),
      }))
      .sort((left, right) => (shares.get(right.value) ?? 0) - (shares.get(left.value) ?? 0));
  };

  const relicMainOptions: ChoiceMenuOption<RelicMainProperty>[] = relicMainPropertyOrder.map((property) => ({
    value: property,
    label: property,
    note: shareNote(resolved.relics.main.shares.get(property)),
  }));

  const relicUniqueOptions: ChoiceMenuOption<number>[] = relicProperties.map((definition) => ({
    value: definition.id,
    label: relicPropertyLabel(definition),
    note: shareNote(resolved.relics.unique.shares.get(definition.id)),
  }));

  const slotOptions = (key: RuneSlotKey): ChoiceMenuOption<RuneMainStat>[] => runeMainStats.map((stat) => ({
    value: stat,
    label: stat,
    note: shareNote(resolved.runes.slots[key].shares.get(stat)),
  }));

  return <div className="modal-backdrop" role="presentation"
    onMouseDown={(event) => { if (event.target === event.currentTarget && !dirty) onClose(); }}>
    <form ref={dialog} className="dialog overlay" role="dialog" aria-modal="true"
      aria-labelledby="monster-overlay-title" onSubmit={submit}>

      <header className="overlay-head">
        <MonsterPortrait imageFilename={display.imageFilename} initial={display.shortName} name={display.name} decorative />
        <div className="overlay-identity">
          <p className="eyebrow">Monster</p>
          <h2 id="monster-overlay-title" className="overlay-hero-name" title={display.name}>{display.name}</h2>
          <p className="overlay-hero-facts">{facts.join(' · ') || 'Not in this import'}</p>
        </div>
        {editable && <label className="field overlay-label-field"><span>Your name for this copy</span>
          {/* The placeholder says what an empty field means rather than echoing
              the name beside it, which read as a value already filled in. */}
          <input ref={firstField} value={draft.label ?? ''} placeholder="e.g. Arena nuker" maxLength={monsterLabelMaximum}
            onChange={(event) => {
              const label = event.target.value;
              change((state) => (label.trim() === '' ? { ...state, label: undefined } : { ...state, label }));
            }} />
        </label>}
      </header>

      <div className="overlay-body">
        {!editable && <p className="notice">
          You do not own a copy of this monster, so there is nothing to set preferences on.
          What the wider player base equips is below.
        </p>}

        {current !== undefined && <Section title="Stats"
          note="Type the figures you are building toward. Current values are shown for reference.">
          <div className="overlay-stats">
            {targetRows.map((row) => {
              const marks = statShortfalls.get(row.label) ?? [];
              return <div className="overlay-stat" key={row.key}>
                <p className="overlay-stat-head">{row.label}</p>
                {editable
                  ? <input className="overlay-stat-target" type="number" min={0} step={1} inputMode="numeric"
                    placeholder="—"
                    aria-label={`Desired ${row.label}`}
                    value={draft.statTargets?.[row.key] ?? ''}
                    onChange={(event) => setTarget(row.key, event.target.value)} />
                  : <p className="overlay-stat-value">{formatNumber(current[row.key], general)}</p>}
                {/* The copy's own figure, dimmed under the target: what is
                    wanted leads, what is there qualifies it. */}
                <p className="overlay-stat-current">{formatNumber(current[row.key], general)}</p>
                <ShortfallMark shortfalls={marks} general={general} />
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
        </Section>}

        <Section title="Runes">
          <div className="overlay-lines">
            {monster !== undefined && <Line label="Current">
              <span className="overlay-current-value">
                {activeRuneSets(monster).map((set) => `${set.name} (${set.count})`).join(' · ') || 'No runes equipped'}
              </span>
            </Line>}
            {editable && <Line label="Desired builds">
              <div className="overlay-build-row">
                <RuneBuildMenu chosen={resolved.runes.sets.chosen}
                  onChange={(next) => change((state) => ({ ...state, runeSets: next }))} />
                <label className="overlay-toggle">
                  <input type="checkbox" checked={resolved.runes.allowBroken}
                    onChange={(event) => change((state) => ({ ...state, allowBrokenRuneSets: event.target.checked }))} />
                  <span>Allow broken pairs</span>
                </label>
                <label className="overlay-toggle">
                  <input type="checkbox" checked={resolved.runes.allowIntangible}
                    onChange={(event) => change((state) => ({ ...state, allowIntangibleRunes: event.target.checked }))} />
                  <span>Allow Intangible runes</span>
                </label>
              </div>
            </Line>}
            {editable && <Line label="Slot mains">
              <div className="overlay-slot-row">
                {runeSlotKeys.map((key) => <div className="overlay-slot" key={key}>
                  <span className="overlay-slot-name">Slot {slotNumbers[key]}</span>
                  <MultiChoiceMenu<RuneMainStat>
                    label={`Slot ${slotNumbers[key]} main stat`}
                    options={slotOptions(key)}
                    chosen={resolved.runes.slots[key].source === 'user' ? resolved.runes.slots[key].chosen : []}
                    empty="Any"
                    onChange={(next) => change((state) => ({
                      ...state,
                      runeSlots: { ...state.runeSlots, [key]: next },
                    }))} />
                </div>)}
              </div>
            </Line>}
            <Line label="Most common">
              <Usage entries={usage.runes?.sets.filter((entry) => entry.wanted)}
                observations={usage.runes?.setObservations} />
            </Line>
          </div>
        </Section>

        <div className="overlay-artifact-pair">
          {(['attribute', 'type'] as const).map((category) => {
            const stated = draft.artifacts?.[category];
            const equipped = worn.artifacts[category];
            const panel = usage.artifacts?.[category];
            const chosenSubs = stated?.sub === undefined ? [] : Object.keys(stated.sub).map(Number);
            return <Section key={category} title={`${categoryLabels[category]} artifact`}>
              <div className="overlay-lines">
                {monster !== undefined && <Line label="Current">
                  <span className="overlay-current-value">
                    {equipped === undefined ? 'None equipped' : [
                      equipped.mainProperty,
                      ...equipped.subProperties.map((line) => displaySubProperty(line, (value) => formatNumber(value, general))),
                    ].join(' · ')}
                  </span>
                </Line>}
                {editable && <Line label="Main stats">
                  <MultiChoiceMenu<ArtifactMainProperty>
                    label={`${categoryLabels[category]} artifact main stats`}
                    options={artifactMainOptions(category)}
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
                        <ShortfallMark general={general}
                          shortfalls={shortfalls.filter((shortfall) => shortfall.kind === 'artifact-sub'
                            && shortfall.where === categoryLabels[category] && shortfall.wanted === name)} />
                      </label>;
                    })}
                  </div>
                </Line>}
                <Line label="Most common">
                  <Usage entries={panel?.main.filter((entry) => entry.wanted)}
                    observations={panel?.mainObservations} />
                </Line>
                <Line label="Common substats">
                  <Usage entries={panel?.sub.filter((entry) => entry.wanted)}
                    observations={panel?.subObservations} />
                </Line>
              </div>
            </Section>;
          })}
        </div>

        <Section title="Relics">
          <div className="overlay-lines">
            {monster !== undefined && <Line label="Current">
              <span className="overlay-current-value">
                {worn.relics.length === 0 ? 'None engraved' : worn.relics
                  .map((relic) => `${relic.mainProperty} ${relic.mainPercent} % · ${relicPropertyLabel(relic.unique.definition)}`)
                  .join(' · ')}
              </span>
            </Line>}
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
            <Line label="Most common">
              <Usage entries={usage.relics?.main.filter((entry) => entry.wanted)}
                observations={usage.relics?.mainObservations} />
            </Line>
            <Line label="Common uniques">
              <Usage entries={usage.relics?.unique.filter((entry) => entry.wanted)}
                observations={usage.relics?.uniqueObservations} />
            </Line>
          </div>
        </Section>
      </div>

      <div className="dialog-actions">
        {editable && <Button onClick={() => { setDraft(blankMonsterCopyPreferences(target.unitId)); setDirty(true); }}>
          Reset to defaults
        </Button>}
        <div className="overlay-actions-leave">
          <Button onClick={onClose}>Close</Button>
          {editable && <Button type="submit" tone="primary" disabled={!dirty}>Save changes</Button>}
        </div>
      </div>
    </form>
  </div>;
}
