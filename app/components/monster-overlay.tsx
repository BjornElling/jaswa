import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './button';
import { ChoiceChip } from './choice-editor';
import { MonsterPortrait } from './monster-portrait';
import { ShortfallMark, describeShortfall } from './shortfall-mark';
import type { MonsterReference } from './monster-link';
import type { Artifact } from '../lib/artifacts';
import { readArtifacts } from '../lib/artifacts';
import type { ArtifactCategory, ArtifactMainProperty } from '../lib/artifact-properties';
import { artifactMainPropertyOrder, artifactProperty } from '../lib/artifact-properties';
import { displaySubProperty } from '../lib/artifact-grid';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { monsterPresentation, monsterSpeciesPresentation } from '../lib/monster-catalog';
import type { RuneSlotKey } from '../lib/monster-defaults';
import { runeSlotKeys } from '../lib/monster-defaults';
import type {
  ArtifactSubPreference, MonsterCopyPreferences, StatedBand,
} from '../lib/monster-preferences';
import { blankMonsterCopyPreferences, monsterLabelMaximum, substatMinimumMaximum } from '../lib/monster-preferences';
import { resolveMonsterPreferences } from '../lib/monster-preference-resolution';
import type { ResolvedMonsterPreferences } from '../lib/monster-preference-resolution';
import type { Shortfall } from '../lib/monster-shortfall';
import { monsterShortfalls } from '../lib/monster-shortfall';
import { calculateMonsterTotals } from '../lib/monster-stats';
import type { MonsterTotals } from '../lib/monster-stats';
import { monsterUsage } from '../lib/monster-usage-statistics';
import type { MonsterUsage } from '../lib/monster-usage-statistics';
import type { Relic } from '../lib/relics';
import { readRelics } from '../lib/relics';
import { relicMainPropertyOrder, relicPropertyLabel } from '../lib/relic-properties';
import type { RelicMainProperty } from '../lib/relic-properties';
import type { PresetStatTargets } from '../lib/rune-potential-presets';
import { presetTargetColumns, presetTargetMaximum, runeMainStats } from '../lib/rune-potential-presets';
import { activeRuneSets, elementName, presetRuneSetNameList } from '../lib/rune-sets';
import type { GeneralSettings } from '../lib/types';

/**
 * Where the user says what one monster is for.
 *
 * The overlay states preferences and reports facts. It never ranks a monster,
 * scores its gear or recommends a swap: for each choice there is one main stat
 * the user picks, several substats they may floor at a minimum roll, and until
 * they pick anything the species' most common choices stand in. The artifact
 * optimization pages keep their own calculation and are untouched by this.
 *
 * It opens over the table the user was reading rather than replacing the page,
 * because there is no router to bring them back to the row they came from.
 */

const categoryLabels: Record<ArtifactCategory, string> = { attribute: 'Attribute', type: 'Type' };
const slotNumbers: Record<RuneSlotKey, number> = { slot2: 2, slot4: 4, slot6: 6 };

/** The eight stats, paired with the totals that answer them. */
const statRows: ReadonlyArray<{
  key: keyof PresetStatTargets; total: keyof MonsterTotals; label: string; unit: string;
}> = presetTargetColumns
  .filter((column): column is typeof column & { key: keyof PresetStatTargets } =>
    (['hp', 'atk', 'def', 'spd', 'criRate', 'criDmg', 'res', 'acc'] as string[]).includes(column.key))
  .map((column) => ({
    key: column.key,
    total: ({
      hp: 'hp', atk: 'atk', def: 'def', spd: 'spd',
      criRate: 'criticalRate', criDmg: 'criticalDamage', res: 'resistance', acc: 'accuracy',
    } as const)[column.key as 'hp'],
    label: column.label,
    unit: column.unit ?? '',
  }));

function bandOf(stated: Record<string, StatedBand> | undefined, key: string): StatedBand | undefined {
  return stated?.[key];
}

/** A chip's three-state reading, from the user's statement or the default standing in. */
function chipState(
  stated: StatedBand | undefined,
  fallback: 'preferred' | 'acceptable' | 'unwanted' | undefined,
): 'preferred' | 'acceptable' | 'none' {
  const band = stated ?? fallback ?? 'unwanted';
  return band === 'unwanted' ? 'none' : band;
}

/* Cycling writes the user's own statement in every step, including the step
   back to "not wanted": that is `ARTIFACT-CANONICAL.md` §19.4's cleared state,
   and storing it as an absent key instead would let the default quietly return
   the next time the overlay opened. */
function cycleBand(current: 'preferred' | 'acceptable' | 'none'): StatedBand {
  if (current === 'none') return 'preferred';
  if (current === 'preferred') return 'acceptable';
  return 'unwanted';
}

function Section({ title, provenance, children }: {
  title: string; provenance?: string; children: ReactNode;
}) {
  return <section className="overlay-block">
    <header className="overlay-block-head">
      <h3 className="overlay-block-title">{title}</h3>
      {/* One line, always present: the three wordings are of a length, so a
          block cannot change height when its provenance changes. */}
      <p className="overlay-provenance">{provenance ?? ''}</p>
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

/** A community row: what the population does, and the sample behind it. */
function Usage({ entries, observations, noun, onAdopt, adoptLabel }: {
  entries: ReadonlyArray<{ label: string; share: number }> | undefined;
  observations: number | undefined;
  noun: string;
  onAdopt?: () => void;
  adoptLabel?: string;
}) {
  const shown = (entries ?? []).slice(0, 3);
  return <div className="usage-line">
    {shown.length === 0
      ? <span className="overlay-empty">Not captured for this monster.</span>
      : shown.map((entry) => <span className="usage-entry" key={entry.label}>
        {entry.label}
        <span className="usage-share">{(entry.share * 100).toFixed(0)} %</span>
      </span>)}
    {/* Reserved whether or not there is a sample, so the row keeps its height. */}
    <span className="usage-sample">
      {shown.length > 0 && observations !== undefined ? `from ${observations.toLocaleString('en')} ${noun}` : ''}
    </span>
    {onAdopt !== undefined && <Button size="compact" onClick={onAdopt} disabled={shown.length === 0}
      aria-label={adoptLabel}>Adopt</Button>}
  </div>;
}

/** The one main stat a category wants, as a radio group: an artifact carries one. */
function MainChoice<T extends string>({ name, options, chosen, source, onChoose }: {
  name: string;
  options: readonly T[];
  chosen: T | undefined;
  source: 'user' | 'default';
  onChoose: (value: T) => void;
}) {
  return <div className="overlay-mains" role="radiogroup" aria-label={name}>
    {options.map((option) => {
      const selected = chosen === option;
      return <button
        type="button"
        key={option}
        role="radio"
        aria-checked={selected}
        className={`choice-chip ${selected ? 'preferred' : 'none'}`}
        data-source={selected && source === 'default' ? 'statistics' : undefined}
        onClick={() => onChoose(option)}
        aria-label={`${option}${selected ? `: preferred${source === 'default' ? ', from community statistics' : ''}` : ''}`}
      >
        <span className="choice-chip-mark" aria-hidden="true" />
        {option}
      </button>;
    })}
  </div>;
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
    setDraft((current) => next(current));
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

  function provenanceOf(source: 'user' | 'default', judged: boolean): string {
    if (!judged) return 'No preference stated';
    return source === 'user' ? 'Your own choices' : 'Standing in from community statistics';
  }

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
              change((current) => (label.trim() === '' ? { ...current, label: undefined } : { ...current, label }));
            }} />
        </label>}
      </header>

      <div className="overlay-body">
        {!editable && <p className="notice">
          You do not own a copy of this monster, so there is nothing to set preferences on.
          What the wider player base equips is below.
        </p>}

        {totals !== undefined && <Section title="Stats">
          <div className="overlay-stats">
            {statRows.map((row) => {
              const marks = statShortfalls.get(`${row.label}${row.unit}`) ?? [];
              return <div className="overlay-stat" key={row.key}>
                <p className="overlay-stat-head">{row.label}{row.unit}</p>
                <p className="overlay-stat-value">{formatNumber(totals[row.total], general)}</p>
                <ShortfallMark shortfalls={marks} general={general} />
              </div>;
            })}
          </div>
        </Section>}

        <Section title="Runes" provenance={provenanceOf(
          draft.runeSets !== undefined ? 'user' : 'default', resolved.runes.judged,
        )}>
          <div className="overlay-lines">
            {monster !== undefined && <Line label="Current">
              <span className="overlay-current-value">
                {activeRuneSets(monster).map((set) => `${set.name} (${set.count})`).join(' · ') || 'No runes equipped'}
              </span>
            </Line>}
            {editable && <Line label="Desired sets">
              <div className="choice-editor columns">
                {presetRuneSetNameList.map((name) => {
                  const state = chipState(bandOf(draft.runeSets, name), resolved.runes.sets.get(name)?.band);
                  const standingIn = bandOf(draft.runeSets, name) === undefined && state !== 'none';
                  return <ChoiceChip key={name} state={state} label={name}
                    note={standingIn ? 'from community statistics' : undefined}
                    onCycle={() => change((current) => ({
                      ...current,
                      runeSets: { ...current.runeSets, [name]: cycleBand(state) },
                    }))} />;
                })}
              </div>
            </Line>}
            {editable && runeSlotKeys.map((key) => <Line label={`Slot ${slotNumbers[key]}`} key={key}>
              <div className="choice-editor">
                {runeMainStats.map((stat) => {
                  const state = chipState(bandOf(draft.runeSlots?.[key], stat), resolved.runes.slots[key].get(stat)?.band);
                  const standingIn = bandOf(draft.runeSlots?.[key], stat) === undefined && state !== 'none';
                  return <ChoiceChip key={stat} state={state} label={stat}
                    note={standingIn ? 'from community statistics' : undefined}
                    onCycle={() => change((current) => ({
                      ...current,
                      runeSlots: {
                        ...current.runeSlots,
                        [key]: { ...current.runeSlots?.[key], [stat]: cycleBand(state) },
                      },
                    }))} />;
                })}
              </div>
            </Line>)}
            <Line label="Most common">
              <Usage entries={usage.runes?.sets.filter((entry) => entry.wanted)}
                observations={usage.runes?.setObservations} noun="builds"
                adoptLabel="Adopt the most common rune sets as your preference"
                onAdopt={!editable ? undefined : () => change((current) => ({
                  ...current,
                  runeSets: Object.fromEntries((usage.runes?.sets ?? [])
                    .filter((entry) => entry.wanted).slice(0, 3)
                    .map((entry) => [entry.value, 'preferred' as StatedBand])),
                }))} />
            </Line>
          </div>
        </Section>

        <div className="overlay-artifact-pair">
          {(['attribute', 'type'] as const).map((category) => {
            const wishes = resolved.artifacts[category];
            const stated = draft.artifacts?.[category];
            const equipped = worn.artifacts[category];
            const panel = usage.artifacts?.[category];
            return <Section key={category} title={`${categoryLabels[category]} artifact`}
              provenance={provenanceOf(stated?.main === undefined && stated?.sub === undefined ? 'default' : 'user', wishes.judged)}>
              <div className="overlay-lines">
                {monster !== undefined && <Line label="Current">
                  <span className="overlay-current-value">
                    {equipped === undefined ? 'None equipped' : [
                      equipped.mainProperty,
                      ...equipped.subProperties.map((line) => displaySubProperty(line, (value) => formatNumber(value, general))),
                    ].join(' · ')}
                  </span>
                </Line>}
                {editable && <Line label="Main stat">
                  <MainChoice name={`${categoryLabels[category]} artifact main stat`}
                    options={artifactMainPropertyOrder}
                    chosen={wishes.main.value}
                    source={wishes.main.source}
                    onChoose={(value: ArtifactMainProperty) => change((current) => ({
                      ...current,
                      artifacts: {
                        ...current.artifacts,
                        [category]: { ...current.artifacts?.[category], main: value },
                      },
                    }))} />
                </Line>}
                {editable && <Line label="Substats">
                  <div className="overlay-substats">
                    {[...wishes.sub].map(([id, wish]) => {
                      const name = artifactProperty(id)?.name ?? `Property ${id}`;
                      const own = stated?.sub?.[String(id)];
                      return <div className="overlay-substat" key={id}>
                        <ChoiceChip state="preferred" label={name}
                          note={wish.source === 'default' ? 'from community statistics' : undefined}
                          onCycle={() => change((current) => {
                            /* Cycling a substat off has to leave the others
                               stated, so the list becomes the user's own rather
                               than reverting to the population's. */
                            const base = current.artifacts?.[category]?.sub
                              ?? Object.fromEntries([...wishes.sub.keys()].map((key) => [String(key), {} as ArtifactSubPreference]));
                            const next = { ...base };
                            delete next[String(id)];
                            return {
                              ...current,
                              artifacts: { ...current.artifacts, [category]: { ...current.artifacts?.[category], sub: next } },
                            };
                          })} />
                        <label className="overlay-substat-floor">
                          <span>at least</span>
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
                              change((current) => {
                                const base = current.artifacts?.[category]?.sub
                                  ?? Object.fromEntries([...wishes.sub.keys()].map((key) => [String(key), {} as ArtifactSubPreference]));
                                return {
                                  ...current,
                                  artifacts: {
                                    ...current.artifacts,
                                    [category]: {
                                      ...current.artifacts?.[category],
                                      sub: { ...base, [String(id)]: minimum === undefined ? {} : { minimumHundredths: minimum } },
                                    },
                                  },
                                };
                              });
                            }} />
                          <span>%</span>
                        </label>
                        <ShortfallMark general={general}
                          shortfalls={shortfalls.filter((shortfall) => shortfall.kind === 'artifact-sub'
                            && shortfall.where === categoryLabels[category] && shortfall.wanted === name)} />
                      </div>;
                    })}
                    {wishes.sub.size === 0 && <span className="overlay-empty">No substats wanted.</span>}
                  </div>
                </Line>}
                <Line label="Most common">
                  <Usage entries={panel?.main.filter((entry) => entry.wanted)}
                    observations={panel?.mainObservations} noun="artifacts" />
                </Line>
                <Line label="Common substats">
                  <Usage entries={panel?.sub.filter((entry) => entry.wanted)}
                    observations={panel?.subObservations} noun="artifacts"
                    adoptLabel={`Adopt the most common ${categoryLabels[category]} substats as your preference`}
                    onAdopt={!editable ? undefined : () => change((current) => ({
                      ...current,
                      artifacts: {
                        ...current.artifacts,
                        [category]: {
                          ...current.artifacts?.[category],
                          sub: Object.fromEntries((panel?.sub ?? []).filter((entry) => entry.wanted)
                            .map((entry) => [String(entry.id), {} as ArtifactSubPreference])),
                        },
                      },
                    }))} />
                </Line>
              </div>
            </Section>;
          })}
        </div>

        <Section title="Relics" provenance={provenanceOf(draft.relics === undefined ? 'default' : 'user', resolved.relics.judged)}>
          <div className="overlay-lines">
            {monster !== undefined && <Line label="Current">
              <span className="overlay-current-value">
                {worn.relics.length === 0 ? 'None engraved' : worn.relics
                  .map((relic) => `${relic.mainProperty} ${relic.mainPercent} % · ${relicPropertyLabel(relic.unique.definition)}`)
                  .join(' · ')}
              </span>
            </Line>}
            {editable && <Line label="Main stat">
              <MainChoice name="Relic main stat" options={relicMainPropertyOrder}
                chosen={resolved.relics.main.value}
                source={resolved.relics.main.source}
                onChoose={(value: RelicMainProperty) => change((current) => ({
                  ...current, relics: { ...current.relics, main: value },
                }))} />
            </Line>}
            <Line label="Most common">
              <Usage entries={usage.relics?.main.filter((entry) => entry.wanted)}
                observations={usage.relics?.mainObservations} noun="engravings" />
            </Line>
            <Line label="Common uniques">
              <Usage entries={usage.relics?.unique.filter((entry) => entry.wanted)}
                observations={usage.relics?.uniqueObservations} noun="engravings"
                adoptLabel="Adopt the most common relic uniques as your preference"
                onAdopt={!editable ? undefined : () => change((current) => ({
                  ...current,
                  relics: {
                    ...current.relics,
                    unique: Object.fromEntries((usage.relics?.unique ?? []).filter((entry) => entry.wanted).slice(0, 3)
                      .map((entry) => [String(entry.id), 'preferred' as StatedBand])),
                  },
                }))} />
            </Line>
          </div>
        </Section>

        {editable && <Section title="Desired stats"
          provenance={draft.statTargets === undefined ? 'No preference stated' : 'Your own choices'}>
          <div className="overlay-targets">
            {statRows.map((row) => {
              const marks = statShortfalls.get(`${row.label}${row.unit}`) ?? [];
              return <div className="overlay-target" key={row.key}>
                <label className="field field-compact">
                  <span>{row.label}{row.unit}</span>
                  <input type="number" min={0} max={presetTargetMaximum} step={1} inputMode="numeric"
                    placeholder="—"
                    value={draft.statTargets?.[row.key] ?? ''}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      const parsed = Number(raw);
                      change((current) => {
                        const targets = { ...current.statTargets };
                        if (raw === '' || !Number.isFinite(parsed)) delete targets[row.key];
                        else targets[row.key] = Math.min(presetTargetMaximum, Math.max(0, Math.round(parsed)));
                        return { ...current, statTargets: Object.keys(targets).length > 0 ? targets : undefined };
                      });
                    }} />
                </label>
                <p className="overlay-target-current">
                  {totals === undefined ? '—' : formatNumber(totals[row.total], general)}
                </p>
                <ShortfallMark shortfalls={marks} general={general} />
              </div>;
            })}
          </div>
        </Section>}

        {shortfalls.length > 0 && <Section title="Not yet met">
          <ul className="overlay-shortfalls">
            {shortfalls.map((shortfall, index) => <li key={`${shortfall.kind}-${shortfall.wanted}-${index}`}>
              {describeShortfall(shortfall, general)}
            </li>)}
          </ul>
        </Section>}
      </div>

      <div className="dialog-actions">
        {editable && <Button onClick={() => { setDraft(blankMonsterCopyPreferences(target.unitId)); setDirty(true); }}>
          Reset to defaults
        </Button>}
        <Button onClick={onClose}>Close</Button>
        {editable && <Button type="submit" tone="primary" disabled={!dirty}>Save changes</Button>}
      </div>
    </form>
  </div>;
}
