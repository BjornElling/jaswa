import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { AncientName } from './ancient-mark';
import { FilterButton } from './button';
import { Dropdown } from './dropdown';
import { EngravedPlace } from './engraved-place';
import { ValueSlider } from './range-slider';
import { SortableHeader } from './sortable-table';
import { useRowOpener } from './use-row-opener';
import { useSortedRows } from './use-sorted-rows';
import type { SortableColumn } from './use-sorted-rows';
import { withAncientMark } from '../lib/ancient-mark';
import { columnClasses } from '../lib/table-layouts';
import { formatDecimal, formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { monsterNameCollator } from '../lib/monster-grid';
import { monsterCopyNamesIn } from '../lib/monster-names';
import type { Engraving } from '../lib/presets';
import { usePresets } from '../lib/presets-context';
import type { MonsterPreferences } from '../lib/monster-preferences';
import {
  craftKindLabels, craftLineageLabels, craftLineageNotes, craftRollDescriptions,
  craftRollLabels, craftRollAssumptions, craftSetLabel, defaultCraftRollAssumption, craftSetName, itemGrades,
} from '../lib/rune-craft-items';
import type { CraftItem, CraftKind, CraftLineage, CraftRollAssumption } from '../lib/rune-craft-items';
import { craftItemRange } from '../lib/rune-craft-end-state';
import { craftRangeText } from '../lib/rune-craft-grid';
import {
  craftBlockReason, craftCandidate, craftLandingScore, craftReach, roleWantsRune, subPropertyText,
} from '../lib/rune-craft-plan';
import type { CraftCandidate } from '../lib/rune-craft-plan';
import { runeStatIds, runeStatName } from '../lib/runes';
import type { Rune } from '../lib/runes';
import type { RuneRole } from '../lib/rune-roles';
import type { GeneralSettings, ItemGrade } from '../lib/types';
import { useSessionStorageState } from '../lib/session-storage-state';
import { RuneLink } from './rune-link';
import type { OpenRuneOverlay } from './rune-link';

const craftKinds: readonly CraftKind[] = ['gem', 'grindstone'];
const craftLineages: readonly CraftLineage[] = ['standard', 'immemorial', 'ancient'];
const optionRange = { minimum: 1, maximum: 10, default: 5 } as const;
/** What a rune is called in the Rune column, in plain text, for the sort. */
const runeName = (rune: Rune) => withAncientMark(rune.setName, rune.ancient);
const optionSeparator = ' · ';

/**
 * Everything the panel asks, in one object so one Reset puts all of it back.
 *
 * The first four narrow the chooser and nothing else; the rest shape the
 * answer. They live together because the chosen item was picked out of the
 * narrowed list, and leaving it behind on a reset would name a stack the
 * restored list no longer points at.
 */
type BestUseState = {
  kinds: CraftKind[];
  lineages: CraftLineage[];
  grades: ItemGrade[];
  statId: string;
  selectedItemId: string;
  /** A role id, or `''` for every rune the item can legally go on. */
  roleId: string;
  roll: CraftRollAssumption;
  /** Grind the gemmed property afterwards, at `grindGrade`'s range. */
  grindAfter: boolean;
  grindGrade: ItemGrade;
  showEngraved: boolean;
  showInventory: boolean;
  count: number;
};

const defaultState: BestUseState = {
  kinds: [],
  lineages: [],
  grades: [],
  statId: '',
  selectedItemId: '',
  roleId: '',
  /* The program's one default for a craft roll. Best would rank the box by how
     well it could conceivably go. */
  roll: defaultCraftRollAssumption,
  grindAfter: false,
  grindGrade: 'Legend',
  showEngraved: true,
  showInventory: true,
  count: optionRange.default,
};

function isBestUseState(value: unknown): value is BestUseState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.kinds) && candidate.kinds.every((entry) => craftKinds.includes(entry as CraftKind))
    && Array.isArray(candidate.lineages) && candidate.lineages.every((entry) => craftLineages.includes(entry as CraftLineage))
    && Array.isArray(candidate.grades) && candidate.grades.every((entry) => itemGrades.includes(entry as ItemGrade))
    && typeof candidate.statId === 'string'
    && typeof candidate.selectedItemId === 'string'
    && typeof candidate.roleId === 'string'
    && craftRollAssumptions.includes(candidate.roll as CraftRollAssumption)
    && typeof candidate.grindAfter === 'boolean'
    && itemGrades.includes(candidate.grindGrade as ItemGrade)
    && typeof candidate.showEngraved === 'boolean'
    && typeof candidate.showInventory === 'boolean'
    && typeof candidate.count === 'number' && Number.isInteger(candidate.count)
    && candidate.count >= optionRange.minimum && candidate.count <= optionRange.maximum;
}

type Row = { candidate: CraftCandidate; location: 'Engraved' | 'Inventory'; places: readonly Engraving[]; order: number };

/**
 * One ranking, with the sentence that says what it ranked by.
 *
 * The two cards carry the same columns on purpose: the question the user asked
 * has two readings — where it ends up highest, and where it helps most — and
 * they are only the same rune when the box is tidy. Sharing the columns lets
 * one be checked against the other instead of taken on trust.
 */
function ResultCard({ title, description, children, empty }: {
  title: string;
  description: string;
  children: ReactNode;
  empty: string | undefined;
}) {
  const id = `craft-best-use-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return <section className="best-artifact-result" aria-labelledby={id}>
    <header>
      <h3 id={id}>{title}</h3>
      <p>{description}</p>
    </header>
    {empty ? <p className="best-artifact-empty">{empty}</p> : <div className="best-monster-result-scroll">{children}</div>}
  </section>;
}

export function CraftItemBestUse({ items, runes, monsters, profiles, roles, general, onOpenRune }: {
  items: readonly CraftItem[];
  runes: readonly Rune[];
  monsters: readonly GameRecord[];
  profiles: MonsterPreferences;
  roles: readonly RuneRole[];
  general: GeneralSettings;
  onOpenRune: OpenRuneOverlay;
}) {
  const rowOpener = useRowOpener();
  const [state, setState] = useSessionStorageState(
    'jaswa.filters.craft-best-use', defaultState, isBestUseState,
  );
  const format = useMemo(() => (value: number) => formatNumber(value, general), [general]);
  const score = (value: number | null) => formatDecimal(value, general);

  const statOptions = useMemo(() => {
    const present = new Set(items.map((item) => item.statId));
    return runeStatIds.filter((id) => present.has(id));
  }, [items]);

  const chosenStat = state.statId === '' ? null : Number(state.statId);
  const offered = useMemo(() => items.filter((item) =>
    (!state.kinds.length || state.kinds.includes(item.kind))
    && (!state.lineages.length || state.lineages.includes(item.lineage))
    && (!state.grades.length || state.grades.includes(item.grade))
    && (chosenStat === null || item.statId === chosenStat)),
  [items, state.kinds, state.lineages, state.grades, chosenStat]);

  /* The ordinary sets first and alphabetically, then the set-less Immemorial
     items, then the Ancient ones — two shelves of specials after the shelf a
     player reaches for every day. Inside a group the gems lead, then the stat,
     then the best grade of it.

     A box holds hundreds of stacks of a dozen repeating shapes, and the half a
     player reaches for first is the set — "my Legend Violent SPD gem". Grouping
     on that turns one flat list of eight hundred into a list of sets, each a
     handful long, and lets an option drop the words its own group already says.
     An `<optgroup>` carries text and no markup, so the Ancient mark is spelled
     out in the heading: `Violent A`. */
  const chooserGroups = useMemo(() => {
    const rank = (item: CraftItem) => item.lineage === 'standard' ? 0 : item.lineage === 'immemorial' ? 1 : 2;
    const groups = new Map<string, { order: number; entries: CraftItem[] }>();
    for (const item of offered) {
      const label = craftSetLabel(item);
      const group = groups.get(label) ?? { order: rank(item), entries: [] };
      group.entries.push(item);
      groups.set(label, group);
    }
    return [...groups.entries()]
      .sort(([leftLabel, left], [rightLabel, right]) => left.order - right.order
        || monsterNameCollator.compare(leftLabel, rightLabel))
      .map(([label, group]) => ({
        label,
        entries: group.entries.sort((left, right) => craftKindLabels[left.kind].localeCompare(craftKindLabels[right.kind])
          || runeStatIds.indexOf(left.statId) - runeStatIds.indexOf(right.statId)
          || itemGrades.indexOf(right.grade) - itemGrades.indexOf(left.grade)),
      }));
  }, [offered]);

  /* Both choosers read back what the current lists can actually offer, not what
     state remembers. Narrowing the filters past the chosen item, or deleting the
     chosen role on the Clean-up page, would otherwise leave a select whose
     value names nothing — which the browser draws as an empty control rather
     than as the placeholder that says what to do. */
  const item = offered.find((entry) => entry.id === state.selectedItemId);
  const role = roles.find((entry) => entry.id === state.roleId);
  const selectedItemId = item?.id ?? '';
  const roleId = role?.id ?? '';

  const placements = usePresets();
  const namesIn = useMemo(() => monsterCopyNamesIn(monsters, profiles, placements.presets), [monsters, profiles, placements.presets]);

  /* A follow-up grind is only a question for a gem, and only for one whose stat
     can be ground at all (§8). The control stays mounted in every state and
     dims instead, so choosing a grindstone does not close a gap under the
     pointer (`AGENTS.md` §2). */
  const grindRange = item?.kind === 'gem'
    ? craftItemRange('grindstone', item.lineage, item.statId, state.grindGrade)
    : undefined;
  /* `craftItemRange` is the one place that knows a stone cannot touch CRI Rate, CRI
     Dmg, Resistance or Accuracy, so "no such item exists" and "this stat cannot be
     ground" are the same answer and this control does not restate either. */
  const grindPossible = grindRange !== undefined;
  const grindApplied = state.grindAfter && grindPossible;

  const rows = useMemo<Row[]>(() => {
    if (!item) return [];
    /* The planner is told the grade, not the range: it reads the table itself through
       the same door this panel does, and answers `null` where no such stone exists —
       which is the legality the control above is already dimmed by. */
    const options = {
      roll: state.roll,
      grindAfter: grindApplied && grindRange ? { grade: state.grindGrade } : null,
    };
    const found: Row[] = [];
    runes.forEach((rune, order) => {
      const places = placements.runes.get(rune.id) ?? [];
      const engraved = places.length > 0;
      if (engraved ? !state.showEngraved : !state.showInventory) return;
      if (role && !roleWantsRune(role, rune)) return;
      const candidate = craftCandidate(item, rune, options);
      if (!candidate) return;
      found.push({
        candidate,
        location: engraved ? 'Engraved' : 'Inventory',
        places,
        order,
      });
    });
    return found;
  }, [item, runes, role, state.roll, state.showEngraved, state.showInventory,
    grindApplied, grindRange, state.grindGrade, placements]);

  const columns = useMemo<SortableColumn<Row>[]>(() => [
    /* Sorted on the name as the column draws it, mark included, so a set's
       Ancient runes sit beside its ordinary ones instead of tying with them. */
    { key: 'rune', label: 'Rune', align: 'left', compare: (left, right) => monsterNameCollator.compare(runeName(left.candidate.rune), runeName(right.candidate.rune)) || left.candidate.rune.slot - right.candidate.rune.slot },
    { key: 'location', label: 'Location', align: 'left', compare: (left, right) => left.location.localeCompare(right.location) || left.places.length - right.places.length },
    { key: 'target', label: item?.kind === 'grindstone' ? 'Improves' : 'Replaces', align: 'left', compare: (left, right) => left.candidate.replaced.statId - right.candidate.replaced.statId },
    { key: 'now', label: 'Now', align: 'right', compare: (left, right) => (left.candidate.scoreNow ?? -1) - (right.candidate.scoreNow ?? -1), initialDirection: 'descending' },
    { key: 'after', label: 'After', align: 'right', compare: (left, right) => (craftLandingScore(left.candidate) ?? -1) - (craftLandingScore(right.candidate) ?? -1), initialDirection: 'descending' },
    { key: 'gain', label: 'Gain', align: 'right', compare: (left, right) => (left.candidate.gain ?? -Infinity) - (right.candidate.gain ?? -Infinity), initialDirection: 'descending' },
  ], [item?.kind]);
  const cell = columnClasses(columns);

  /* Both rankings are cut to the chosen count before they are handed to the
     header, so sorting a card re-orders the shortlist the page recommended
     rather than quietly pulling in an eleventh rune from behind it. */
  const strongest = useMemo(() => [...rows]
    .sort((left, right) => (craftLandingScore(right.candidate) ?? -Infinity)
      - (craftLandingScore(left.candidate) ?? -Infinity) || left.order - right.order)
    .slice(0, state.count), [rows, state.count]);
  const improved = useMemo(() => rows
    .filter((row) => (row.candidate.gain ?? 0) > 0)
    .sort((left, right) => (right.candidate.gain ?? 0) - (left.candidate.gain ?? 0) || left.order - right.order)
    .slice(0, state.count), [rows, state.count]);

  const byOrder = (left: Row, right: Row) => left.order - right.order;
  const strongestSort = useSortedRows(strongest, columns, { key: 'after', direction: 'descending' }, byOrder);
  const improvedSort = useSortedRows(improved, columns, { key: 'gain', direction: 'descending' }, byOrder);

  function toggleValue<T>(value: T, key: 'kinds' | 'lineages' | 'grades') {
    setState((current) => {
      const chosen = current[key] as T[];
      return {
        ...current,
        [key]: chosen.includes(value) ? chosen.filter((entry) => entry !== value) : [...chosen, value],
      };
    });
  }

  const buttonGroup = <T extends string>(
    label: string, key: 'kinds' | 'lineages' | 'grades', values: readonly T[],
    display: (value: T) => string, className: string, title?: (value: T) => string,
  ) => <div className={`filter-group ${className}`} role="group" aria-label={label}>
    <span className="filter-label">{label}</span>
    <div className="filter-group-controls">
      {values.map((value) => <FilterButton key={value}
        active={(state[key] as string[]).includes(value)}
        title={title?.(value)}
        aria-label={value === display(value) ? undefined : value}
        onClick={() => toggleValue(value, key)}>{display(value)}</FilterButton>)}
    </div>
  </div>;

  /* The table shows the rune's own facts; the gem's arithmetic is in the two
     score columns beside them. A rune is named by what a player would call it. */
  const body = (sorted: readonly Row[]) => <tbody>{sorted.map(({ candidate, places }) => <tr key={candidate.rune.id} {...rowOpener}>
    <td className={cell('rune')}>
      <RuneLink
        target={{ kind: 'account', runeId: candidate.rune.id }}
        label={`${candidate.rune.setName} rune, slot ${candidate.rune.slot}`}
        onOpen={onOpenRune}
      >
        <span className="rune-link-cell craft-rune-link-cell">
          <span className="craft-rune-name">
            <AncientName name={candidate.rune.setName} ancient={candidate.rune.ancient} />
          </span>
          <span className="craft-rune-detail">
            Slot {candidate.rune.slot}{optionSeparator}+{format(candidate.rune.level)}
            {optionSeparator}{runeStatName(candidate.rune.mainStatId)}
          </span>
        </span>
      </RuneLink>
    </td>
    <td className={cell('location')}>
      <EngravedPlace places={places} presets={placements.presets} monsterName={(unitId: string, presetId: string) => namesIn(unitId, presetId) ?? 'A monster not in this import'} />
    </td>
    {/* What lands where, in the game's own numbers: the property being spent
        on, and what it would read afterwards. A gem changes the stat as well
        as the value, so the name line carries the change too. */}
    <td className={cell('target')}>
      <span className="craft-rune-name">
        {runeStatName(candidate.replaced.statId)}
        {candidate.result && candidate.result.statId !== candidate.replaced.statId
          && <> → {runeStatName(candidate.result.statId)}</>}
      </span>
      <span className="craft-rune-detail">
        {subPropertyText(candidate.replaced, format)}
        {candidate.result && <> → {subPropertyText(candidate.result, format)}</>}
      </span>
    </td>
    <td className={cell('now')}><b className="craft-score-quiet">{score(candidate.scoreNow)}</b></td>
    <td className={cell('after')}><b>{score(candidate.scoreAfter)}</b></td>
    <td className={cell('gain', (candidate.gain ?? 0) < 0 && 'muted')}>
      <b>{candidate.gain === null ? '—' : `${candidate.gain > 0 ? '+' : ''}${score(candidate.gain)}`}</b>
    </td>
  </tr>)}</tbody>;

  const scoreTable = (sorting: ReturnType<typeof useSortedRows<Row>>) => <table className="best-monster-table craft-best-use-table">
    <SortableHeader columns={columns} sort={sorting.sort} onToggle={sorting.toggle} />
    {body(sorting.sorted)}
  </table>;

  /* Why a chosen item can come back with nothing. The two answers point at
     different things to do, so they are separated: the panel's own controls
     ruled every candidate out, or the game's rules did — and in the second case
     the box list's own words say which rule, from the same reader, so the two
     pages cannot explain the same dead stack differently. */
  const reach = useMemo(() => (item ? craftReach([item], runes, placements.runes).get(item.id) : undefined), [item, runes, placements]);

  return <div className="craft-best-use">
    <p className="lead">
      Pick one gem or grindstone, and see the runes it would leave strongest — and the runes it would
      move furthest.
    </p>

    <div className="filter-panel craft-best-use-filters">
      {buttonGroup('Item', 'kinds', craftKinds, (kind) => craftKindLabels[kind], 'craft-best-use-kind',
        (kind) => kind === 'gem'
          ? "Replaces one sub property with this Gem's stat"
          : 'Adds a grind bonus to one existing sub property')}
      {buttonGroup('Family', 'lineages', craftLineages, (lineage) => craftLineageLabels[lineage],
        'craft-best-use-lineage', (lineage) => craftLineageNotes[lineage])}
      {buttonGroup('Grade', 'grades', itemGrades, (grade) => grade.slice(0, 3).toUpperCase(), 'craft-best-use-grade')}
      <div className="filter-group craft-best-use-stat">
        <label className="filter-label" htmlFor="craft-best-use-stat">Stat</label>
        <div className="filter-group-controls">
          <Dropdown id="craft-best-use-stat" value={state.statId} placeholder="Any stat"
            onChange={(event) => setState((current) => ({ ...current, statId: event.target.value }))}
            aria-label="Narrow the list to one stat">
            {statOptions.map((id) => <option key={id} value={id}>{runeStatName(id)}</option>)}
          </Dropdown>
        </div>
      </div>

      <div className="filter-group craft-best-use-select">
        <label className="filter-label" htmlFor="craft-best-use-item">Gem or grindstone</label>
        <div className="filter-group-controls">
          <Dropdown id="craft-best-use-item" value={selectedItemId} placeholder="Choose one from your box"
            onChange={(event) => setState((current) => ({ ...current, selectedItemId: event.target.value }))}
            aria-label="Choose a gem or grindstone to place">
            {chooserGroups.map((group) => <optgroup key={group.label} label={group.label}>
              {group.entries.map((entry) => <option key={entry.id} value={entry.id}>
                {[craftKindLabels[entry.kind], entry.statName, entry.grade, `${format(entry.amount)} held`]
                  .join(optionSeparator)}
              </option>)}
            </optgroup>)}
          </Dropdown>
        </div>
      </div>

      <div className="filter-group craft-best-use-role">
        <label className="filter-label" htmlFor="craft-best-use-role">Role</label>
        <div className="filter-group-controls">
          <Dropdown id="craft-best-use-role" value={roleId} placeholder="Every rune it fits"
            onChange={(event) => setState((current) => ({ ...current, roleId: event.target.value }))}
            aria-label="Judge the runes against one role">
            {roles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </Dropdown>
        </div>
      </div>

      <div className="filter-group craft-best-use-roll">
        <label className="filter-label" htmlFor="craft-best-use-roll">Assumed roll</label>
        <div className="filter-group-controls">
          <Dropdown id="craft-best-use-roll" value={state.roll}
            onChange={(event) => setState((current) => ({ ...current, roll: event.target.value as CraftRollAssumption }))}
            aria-label="How well the roll is assumed to land">
            {craftRollAssumptions.map((assumption) => <option key={assumption} value={assumption}>
              {craftRollLabels[assumption]}
            </option>)}
          </Dropdown>
        </div>
      </div>

      {/* Both halves of one question — whether to follow the gem with a
          grindstone, and with which one — so they share a group. */}
      <div className="filter-group craft-best-use-grind" role="group" aria-label="Grind the gemmed property afterwards">
        <span className="filter-label">Then grind it</span>
        <div className="filter-group-controls">
          <FilterButton active={state.grindAfter} disabled={!grindPossible}
            onClick={() => setState((current) => ({ ...current, grindAfter: !current.grindAfter }))}
            title={grindPossible
              ? 'Grind the gemmed property once the gem has landed'
              : 'Only a gem giving a grindable stat can be followed by a grindstone'}
          >Yes</FilterButton>
          <Dropdown value={state.grindGrade} disabled={!grindPossible || !state.grindAfter}
            onChange={(event) => setState((current) => ({ ...current, grindGrade: event.target.value as ItemGrade }))}
            aria-label="Grade of the grindstone to assume">
            {itemGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </Dropdown>
        </div>
      </div>

      <div className="filter-group craft-best-use-location" role="group" aria-label="Choose rune locations">
        <span className="filter-label">Location</span>
        <div className="filter-group-controls">
          <FilterButton active={state.showEngraved}
            onClick={() => setState((current) => ({ ...current, showEngraved: !current.showEngraved }))}
          >Engraved</FilterButton>
          <FilterButton active={state.showInventory}
            onClick={() => setState((current) => ({ ...current, showInventory: !current.showInventory }))}
          >Inventory</FilterButton>
        </div>
      </div>

      <div className="filter-group craft-best-use-count" role="group" aria-label="Number of runes to list">
        <span className="filter-label"># of options</span>
        <div className="filter-group-controls">
          <ValueSlider minimum={optionRange.minimum} maximum={optionRange.maximum} value={state.count}
            label="Number of runes listed in each ranking"
            valueText={(value) => `${value} ${value === 1 ? 'rune' : 'runes'} in each ranking`}
            onChange={(count) => setState((current) => ({ ...current, count }))} />
        </div>
      </div>

      <div className="filter-panel-actions craft-best-use-actions">
        <button type="button" className="filter-reset" aria-label="Reset best use filters"
          onClick={() => setState(defaultState)}>Reset filters</button>
      </div>
    </div>

    {item && <section className="craft-best-use-item" aria-labelledby="craft-best-use-item-title">
      <div>
        <p className="filter-label">Selected item</p>
        {/* The same words as the chooser's own option, but this one is markup
            rather than an `<option>`, so it draws the mark instead of spelling
            it. `craftItemLabel` stays the text form the chooser needs. */}
        <h3 id="craft-best-use-item-title">
          {item.grade}{' '}
          <AncientName name={craftSetName(item)} ancient={item.lineage === 'ancient'} />{' '}
          {item.statName} {craftKindLabels[item.kind]}
        </h3>
        <p>{craftLineageNotes[item.lineage]}.</p>
      </div>
      <dl className="craft-best-use-facts">
        <div>
          <dt>Held</dt>
          <dd>{format(item.amount)}</dd>
        </div>
        <div>
          <dt>Rolls for</dt>
          <dd>{craftRangeText(item, format)}</dd>
        </div>
        <div>
          <dt>Assumed</dt>
          <dd>{item.range
            ? `${craftRollLabels[state.roll]} — ${craftRollDescriptions[state.roll]}`
            : 'Nothing — no verified range'}</dd>
        </div>
        <div>
          <dt>Then ground</dt>
          <dd>{grindApplied && grindRange
            ? `${state.grindGrade} grindstone, ${craftRangeText({ ...item, range: grindRange }, format)}`
            : 'No'}</dd>
        </div>
      </dl>
    </section>}

    {/* The score is the one figure on this page that is not yet the real
        answer, so it says so where it is read rather than in a note somewhere
        else. Everything else here — what fits, what it replaces, what it rolls
        — comes from the game's own rules. */}
    {item && <p className="notice" role="note">
      <b>Provisional score.</b> Rune scoring is still being built. These figures are SWOP rune
      efficiency, which reads the whole rune and does move when a gem or a grindstone lands —
      but it is role-blind, so a Role above narrows which runes are offered rather than changing
      the numbers.
    </p>}

    {item && !item.range && Boolean(rows.length) && <p className="notice warning" role="status">
      This item has no verified roll range, so the runes below are listed as legal placements but
      are not numerically projected.
    </p>}

    {item && !rows.length && <p className="notice warning" role="status">{reach?.block
      ? `Nothing in your rune box can take this. ${craftBlockReason(item, reach.block)}.`
      : 'No rune matches the Role and the Location filters above. Widen one of them to see where this can go.'}</p>}

    {item && Boolean(rows.length) && <div className="craft-best-use-results">
      {/* Ranked by where it *ends up*, which is not the same question as where
          it helps most — and not always an improvement either, because a gem
          replaces whatever was there. Gain is in the last column so the cost of
          the strongest landing is read beside it rather than assumed away. */}
      <ResultCard title="Highest score"
        description="Where this item leaves a rune strongest. Ranked by the score once it lands, which is not the same as an improvement — read Gain before you spend it."
        empty={strongest.length ? undefined : 'No rune can take this item.'}>
        {scoreTable(strongestSort)}
      </ResultCard>
      <ResultCard title="Biggest gain"
        description="Where this item moves a rune furthest. Ranked by what it adds, whatever the rune was worth to begin with."
        empty={improved.length ? undefined : item.range
          ? 'No rune gains anything from this item at the assumed roll. Try a better roll, or a better item.'
          : 'A gain cannot be projected without a verified roll range.'}>
        {scoreTable(improvedSort)}
      </ResultCard>
    </div>}

    {!item && <p className="best-artifact-empty">
      Choose a gem or grindstone above. The filters beside it narrow a box that holds hundreds.
    </p>}
  </div>;
}
