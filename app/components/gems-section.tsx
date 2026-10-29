import { filterIncludes, filterPair } from '../lib/filter-selection';
import { useMemo, useSyncExternalStore } from 'react';
import { AncientName } from './ancient-mark';
import { FilterButton } from './button';
import { CraftItemBestUse } from './craft-item-best-use';
import type { CraftViewMode } from './craft-item-best-use';
import { craftResultMemory, missingCraftResultMemory } from '../lib/compute/craft-result-memory';
import { DataTablePage, TableColumnGroup } from './data-table-page';
import { Dropdown } from './dropdown';
import { FilterSummary } from './filter-summary';
import { Disclosure, PageHeader } from './page-chrome';
import { ValueSlider } from './range-slider';
import { SortableHeader } from './sortable-table';
import { useSortedRows } from './use-sorted-rows';
import type { SortableColumn } from './use-sorted-rows';
import { WorkspacePage } from './workspace-page';
import { columnClasses, craftItemTableColumns } from '../lib/table-layouts';
import { formatNumber } from '../lib/formatting';
import type { GameRecord } from '../lib/game-data';
import { monsterNameCollator } from '../lib/monster-grid';
import {
  craftKindLabels, craftLineageLabels, craftSetName, craftLineageNotes, itemGrades, readCraftItems,
} from '../lib/rune-craft-items';
import type { CraftKind, CraftLineage } from '../lib/rune-craft-items';
import {
  compareCraftRows, compareCraftRowTieBreaks, craftRangeText, craftRequirementText,
  defaultCraftSortDirections,
} from '../lib/rune-craft-grid';
import type { CraftRow, CraftSortKey } from '../lib/rune-craft-grid';
import { craftBlockReason, craftReach } from '../lib/rune-craft-plan';
import { readRunes, runeStatIds, runeStatName } from '../lib/runes';
import type { RuneRole } from '../lib/rune-roles';
import type { ImportedGame, ItemGrade, Preferences } from '../lib/types';
import { useSessionStorageState } from '../lib/session-storage-state';
import type { CraftIgnore, CraftIgnoreView } from '../lib/craft-ignores';
import type { OpenRuneOverlay } from './rune-link';

const craftKinds: readonly CraftKind[] = ['gem', 'grindstone'];
const craftLineages: readonly CraftLineage[] = ['standard', 'immemorial', 'ancient'];
/** The value an Immemorial item carries where the Set control expects a name. */
const anySetValue = 'immemorial';

/**
 * Every control here decides which *stacks* are listed. None of them touches
 * `Can improve`, which is measured over the whole rune box on purpose: it says
 * how many runes can gain the item's stat, and a filter must never change what
 * a page computes (`AGENTS.md` §6).
 */
type CraftFilterState = {
  kinds: CraftKind[];
  lineages: CraftLineage[];
  grades: ItemGrade[];
  /** A stat id as text, or `''` for every stat. */
  statId: string;
  /** A set name, `anySetValue` for the Immemorial items, or `''` for all. */
  set: string;
  showUsable: boolean;
  showDead: boolean;
  minimumQuantityEnabled: boolean;
  minimumQuantity: number;
};

const minimumCraftQuantity = 1;
const maximumCraftQuantity = 10;

const defaultCraftFilters: CraftFilterState = {
  kinds: [],
  lineages: [],
  grades: [],
  statId: '',
  set: '',
  showUsable: false,
  showDead: false,
  minimumQuantityEnabled: false,
  minimumQuantity: minimumCraftQuantity,
};

function isCraftFilterState(value: unknown): value is CraftFilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.kinds)
    && candidate.kinds.every((entry) => craftKinds.includes(entry as CraftKind))
    && Array.isArray(candidate.lineages)
    && candidate.lineages.every((entry) => craftLineages.includes(entry as CraftLineage))
    && Array.isArray(candidate.grades)
    && candidate.grades.every((entry) => itemGrades.includes(entry as ItemGrade))
    && typeof candidate.statId === 'string'
    && typeof candidate.set === 'string'
    && typeof candidate.showUsable === 'boolean'
    && typeof candidate.showDead === 'boolean'
    && typeof candidate.minimumQuantityEnabled === 'boolean'
    && typeof candidate.minimumQuantity === 'number'
    && Number.isSafeInteger(candidate.minimumQuantity)
    && candidate.minimumQuantity >= minimumCraftQuantity
    && candidate.minimumQuantity <= maximumCraftQuantity;
}

const craftCell = columnClasses(craftItemTableColumns);

const craftColumns: readonly SortableColumn<CraftRow>[] = (() => {
  const column = (key: CraftSortKey, label: SortableColumn<CraftRow>['label'], accessibleLabel?: string) => {
    const planned = craftItemTableColumns.find((entry) => entry.key === key);
    return {
      key,
      label,
      accessibleLabel,
      align: planned?.align,
      gutter: planned?.gutter,
      initialDirection: defaultCraftSortDirections[key] ? 'ascending' as const : 'descending' as const,
      compare: (left: CraftRow, right: CraftRow) => compareCraftRows(left, right, key),
    };
  };
  return [
    column('item', 'Item'),
    column('set', 'Set'),
    column('stat', 'Stat'),
    column('grade', 'Grade'),
    /* `Rolls` keeps the visible heading compact; its accessible name says
       exactly what the number describes. */
    column('range', 'Rolls', 'What one use of this item can roll'),
    column('quantity', 'Quantity'),
    column('improves', 'Can improve', 'Runes on which this item can raise its stat value'),
  ];
})();

export function GemsSection({ game, roles, preferences, onOpenRune, onIgnoreCraft }: {
  game: ImportedGame | null;
  roles: readonly RuneRole[];
  preferences: Preferences;
  onOpenRune: OpenRuneOverlay;
  onIgnoreCraft: (view: CraftIgnoreView, entry: CraftIgnore | null) => void;
}) {
  const craftCalculation = useSyncExternalStore(craftResultMemory.subscribe, craftResultMemory.getSnapshot, craftResultMemory.getSnapshot);
  const missingCalculation = useSyncExternalStore(missingCraftResultMemory.subscribe, missingCraftResultMemory.getSnapshot, missingCraftResultMemory.getSnapshot);
  const [filters, setFilters] = useSessionStorageState(
    'jaswa.filters.craft-items', defaultCraftFilters, isCraftFilterState,
  );
  const { kinds, lineages, grades, statId, set, showUsable, showDead,
    minimumQuantityEnabled, minimumQuantity } = filters;

  const data = game?.data as GameRecord | undefined;
  const items = useMemo(() => readCraftItems(data), [data]);
  const runes = useMemo(() => readRunes(data), [data]);
  const monsters = useMemo(
    () => (Array.isArray(data?.unit_list) ? data.unit_list : []) as GameRecord[],
    [data],
  );
  const reach = useMemo(() => craftReach(items, runes), [items, runes]);
  const format = useMemo(() => (value: number) => formatNumber(value, preferences.general), [preferences.general]);

  const rows = useMemo<CraftRow[]>(() => items.map((item, index) => ({
    item,
    index,
    /* Every item was measured together, so the map always holds it; the
       fallback exists because a `Map` lookup is optional, not because a stack
       could be missing. */
    reach: reach.get(item.id) ?? { improves: 0, block: 'set' },
  })), [items, reach]);

  /* Both dropdowns offer what the box actually holds rather than the game's
     full vocabulary: an account with no Immemorial stone should not be asked
     whether it wants to filter to one. */
  const statOptions = useMemo(() => {
    const present = new Set(items.map((item) => item.statId));
    return runeStatIds.filter((id) => present.has(id));
  }, [items]);
  const setOptions = useMemo(() => {
    const names = new Set<string>();
    let immemorial = false;
    for (const item of items) {
      if (item.setName) names.add(item.setName); else immemorial = true;
    }
    return {
      names: [...names].sort((left, right) => monsterNameCollator.compare(left, right)),
      immemorial,
    };
  }, [items]);

  const visible = useMemo(() => {
    const chosenStat = statId === '' ? null : Number(statId);
    return rows.filter((row) => {
      const usable = row.reach.improves > 0;
      if (!filterPair(usable, showUsable, showDead)) return false;
      if (minimumQuantityEnabled && row.item.amount < minimumQuantity) return false;
      if (!filterIncludes(kinds, row.item.kind, craftKinds)) return false;
      if (!filterIncludes(lineages, row.item.lineage, craftLineages)) return false;
      if (!filterIncludes(grades, row.item.grade, itemGrades)) return false;
      if (chosenStat !== null && row.item.statId !== chosenStat) return false;
      if (set === anySetValue && row.item.setName !== null) return false;
      if (set !== '' && set !== anySetValue && row.item.setName !== set) return false;
      return true;
    });
  }, [rows, kinds, lineages, grades, statId, set, showUsable, showDead,
    minimumQuantityEnabled, minimumQuantity]);

  /* Gem/Grind, Set, Ancient, Stat and Grade give the box one repeatable order.
     A chosen column leads; those fields settle its ties. */
  const { sorted, sort, toggle } = useSortedRows(
    visible, craftColumns, { key: 'item', direction: 'ascending' },
    (left, right, activeSort) => compareCraftRowTieBreaks(left, right, activeSort.key as CraftSortKey)
      || left.index - right.index,
  );

  function toggleValue<T>(value: T, key: 'kinds' | 'lineages' | 'grades') {
    setFilters((current) => {
      const chosen = current[key] as T[];
      return {
        ...current,
        [key]: chosen.includes(value) ? chosen.filter((entry) => entry !== value) : [...chosen, value],
      };
    });
  }

  const noItems = <section className="empty-state">
    <h2>{game
      ? 'This import holds no gems or grindstones.'
      : 'Nothing to show until a game file is imported.'}</h2>
    <p className="next-step">{game
      ? 'If your account has any, report the missing items from the rail.'
      : 'Go to Home and drop in the JSON file exported from Summoners War.'}</p>
  </section>;
  const noRunes = <section className="empty-state">
    <h2>{game ? 'This import holds no runes to improve.' : 'Nothing to show until a game file is imported.'}</h2>
    <p className="next-step">{game
      ? 'Import an account that holds runes to see which gems and grindstones they lack.'
      : 'Go to Home and drop in the JSON file exported from Summoners War.'}</p>
  </section>;

  /* One engine, three ways to ask it, read here plus the box itself. Every
     view reads the same props; only the question differs. Deferred: `details`
     renders its children open or shut, so a closed bar would otherwise mount
     a second copy of the empty state and its controls. */
  const craftView = (mode: CraftViewMode, memory: typeof craftCalculation) => <CraftItemBestUse
    mode={mode}
    items={items}
    runes={runes}
    monsters={monsters}
    profiles={preferences.monsterPreferences}
    roles={roles}
    general={preferences.general}
    settings={preferences.runePotential}
    hardwareAcceleration={preferences.hardwareAcceleration}
    onOpenRune={onOpenRune}
    calculation={memory}
    onCalculated={mode === 'missing' ? missingCraftResultMemory.remember : craftResultMemory.remember}
    ignores={mode === 'recommendations' ? null : preferences.craftIgnores[mode]}
    onIgnore={mode === 'recommendations' ? undefined : (entry) => onIgnoreCraft(mode, entry)}
  />;

  /* Recommendations leads: it is the question most visits come with — what to
     spend next — and the box beneath it is the inventory it answers from. The
     box alone opens by itself, because it needs no calculation to say
     something. Best use narrows the answer to one stack; What's missing turns
     it round and asks what the box lacks. */
  return <WorkspacePage
    header={<PageHeader
      title="Gems &amp; Grinds"
      tagline="" />}
  >
    <Disclosure title="Recommendations" sessionKey="gems.recommendations" deferContent>
      {!items.length ? noItems : craftView('recommendations', craftCalculation)}
    </Disclosure>
    <Disclosure title="Your box" sessionKey="gems.box" defaultOpen>
      {!items.length ? noItems : <div className="craft-library">
        <DataTablePage
          filterClassName="craft-filter-strip"
          tableClassName="craft-grid"
          headerLabel="Gem and grindstone columns"
          tableLabel="Gems and grindstones"
          columnGroup={<TableColumnGroup columns={craftItemTableColumns} />}
          header={<SortableHeader columns={craftColumns} sort={sort} onToggle={toggle} />}
          filters={<>
            <div className="filter-group craft-filter-kind" role="group" aria-label="Filter by item">
              <span className="filter-label">Item</span>
              <div className="filter-group-controls">
                {craftKinds.map((kind) => <FilterButton key={kind}
                  active={kinds.includes(kind)}
                  onClick={() => toggleValue(kind, 'kinds')}
                  title={kind === 'gem'
                    ? "Replaces one sub property with this Gem's stat"
                    : 'Adds a grind bonus to one existing sub property'}
                >{craftKindLabels[kind]}</FilterButton>)}
              </div>
            </div>

            <div className="filter-group craft-filter-set">
              <label className="filter-label" htmlFor="craft-set">Set</label>
              <div className="filter-group-controls">
                <Dropdown id="craft-set" value={set} placeholder="Any set"
                  onChange={(event) => setFilters((current) => ({ ...current, set: event.target.value }))}
                  aria-label="Filter by the rune set the item belongs to">
                  {setOptions.names.map((name) => <option key={name} value={name}>{name}</option>)}
                  {setOptions.immemorial && <option value={anySetValue}>Immemorial</option>}
                </Dropdown>
              </div>
            </div>

            <div className="filter-group craft-filter-stat">
              <label className="filter-label" htmlFor="craft-stat">Stat</label>
              <div className="filter-group-controls">
                <Dropdown id="craft-stat" value={statId} placeholder="Any stat"
                  onChange={(event) => setFilters((current) => ({ ...current, statId: event.target.value }))}
                  aria-label="Filter by the stat the item gives">
                  {statOptions.map((id) => <option key={id} value={id}>{runeStatName(id)}</option>)}
                </Dropdown>
              </div>
            </div>

            <div className="filter-group craft-filter-lineage" role="group" aria-label="Filter by family">
              <span className="filter-label">Family</span>
              <div className="filter-group-controls">
                {craftLineages.map((lineage) => <FilterButton key={lineage}
                  active={lineages.includes(lineage)}
                  onClick={() => toggleValue(lineage, 'lineages')}
                  title={craftLineageNotes[lineage]}
                >{craftLineageLabels[lineage]}</FilterButton>)}
              </div>
            </div>

            <div className="filter-group craft-filter-grade" role="group" aria-label="Filter by grade">
              <span className="filter-label">Grade</span>
              <div className="filter-group-controls">
                {itemGrades.map((grade) => <FilterButton key={grade}
                  active={grades.includes(grade)}
                  onClick={() => toggleValue(grade, 'grades')}
                  aria-label={grade}
                >{grade.slice(0, 3).toUpperCase()}</FilterButton>)}
              </div>
            </div>

            {/* Fit is an inclusive pair, like Location: neither or both means all. */}
            <div className="filter-group craft-filter-fit" role="group" aria-label="Choose which items to include">
              <span className="filter-label">Fit</span>
              <div className="filter-group-controls">
                <FilterButton active={showUsable}
                  onClick={() => setFilters((current) => ({ ...current, showUsable: !current.showUsable }))}
                  title="Items that could improve at least one rune you own"
                >Usable</FilterButton>
                <FilterButton active={showDead}
                  onClick={() => setFilters((current) => ({ ...current, showDead: !current.showDead }))}
                  title="Items that cannot improve any rune you own"
                >Dead stock</FilterButton>
              </div>
            </div>

            <div className="filter-group craft-filter-quantity">
              <span className="filter-label">Quantity</span>
              <div className="filter-group-controls craft-quantity-filter">
                <label className="checkbox-row">
                  <input type="checkbox" checked={minimumQuantityEnabled}
                    onChange={(event) => setFilters((current) => ({
                      ...current, minimumQuantityEnabled: event.target.checked,
                    }))} />
                  <span>Have ≥</span>
                </label>
                <ValueSlider
                  minimum={minimumCraftQuantity} maximum={maximumCraftQuantity}
                  value={minimumQuantity} disabled={!minimumQuantityEnabled}
                  label="Minimum quantity of this item"
                  valueText={(value) => `Have at least ${value} of this item`}
                  onChange={(value) => setFilters((current) => ({ ...current, minimumQuantity: value }))} />
              </div>
            </div>

            <FilterSummary visible={visible.length} total={rows.length} noun="items"
              onReset={() => setFilters(defaultCraftFilters)} className="craft-filter-status" />
          </>}
        >
          <tbody>
            {sorted.length ? sorted.map((row) => <tr key={row.item.id}>
              <td className={craftCell('item')}>{craftKindLabels[row.item.kind]}</td>
              {/* The family the Family column used to name is in this cell now:
                  the mark for Ancient, the game's own word for Immemorial, and
                  on the title the rule each of the three plays by. */}
              <td className={craftCell('set', row.item.setName === null && 'muted')}
                title={craftLineageNotes[row.item.lineage]}>
                <AncientName name={craftSetName(row.item)} ancient={row.item.lineage === 'ancient'} />
              </td>
              <td className={craftCell('stat')}>{row.item.statName}</td>
              <td className={craftCell('grade')}>{row.item.grade}</td>
              <td className={craftCell('range', !row.item.range && 'muted')}
                title={row.item.range ? undefined : 'This item has no legal roll range.'}>
                {craftRangeText(row.item, format)}
              </td>
              <td className={craftCell('quantity')}>{format(row.item.amount)}</td>
              <td className={craftCell('improves', row.reach.improves === 0 && 'muted')}
                title={row.reach.block === null
                  ? craftRequirementText(row.item)
                  : craftBlockReason(row.item, row.reach.block)}>
                {format(row.reach.improves)}
              </td>
            </tr>) : <tr>
              <td className="table-empty-state" colSpan={craftItemTableColumns.length}>
                No gems or grindstones match these filters. Clear a filter to see more.
              </td>
            </tr>}
          </tbody>
        </DataTablePage>
      </div>}
    </Disclosure>

    <Disclosure title="Best use for this" sessionKey="gems.best-use" deferContent>
      {!items.length ? noItems : craftView('selected', craftCalculation)}
    </Disclosure>
    {/* An empty box is the one with the most missing, so this view needs
        runes, not items. */}
    <Disclosure title="What's missing" sessionKey="gems.missing" deferContent>
      {!runes.length ? noRunes : craftView('missing', missingCalculation)}
    </Disclosure>
  </WorkspacePage>;
}
