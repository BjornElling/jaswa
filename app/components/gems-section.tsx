import { useMemo } from 'react';
import { usePresets } from '../lib/presets-context';
import { AncientName } from './ancient-mark';
import { FilterButton } from './button';
import { CraftItemBestUse } from './craft-item-best-use';
import { DataTablePage, TableColumnGroup } from './data-table-page';
import { Dropdown } from './dropdown';
import { FilterSummary } from './filter-summary';
import { Disclosure, PageHeader } from './page-chrome';
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
  compareCraftRows, craftRangeText, craftRequirementText, craftRowSearchText, craftScopeText,
  defaultCraftSortDirections,
} from '../lib/rune-craft-grid';
import type { CraftRow, CraftSortKey } from '../lib/rune-craft-grid';
import { craftReach } from '../lib/rune-craft-plan';
import { readRunes, runeStatIds, runeStatName } from '../lib/runes';
import type { RuneRole } from '../lib/rune-roles';
import type { ImportedGame, ItemGrade, Preferences } from '../lib/types';
import { useSessionStorageState } from '../lib/session-storage-state';
import type { OpenRuneOverlay } from './rune-link';

const craftKinds: readonly CraftKind[] = ['gem', 'grindstone'];
const craftLineages: readonly CraftLineage[] = ['standard', 'immemorial', 'ancient'];
/** The value an Immemorial item carries where the Set control expects a name. */
const anySetValue = 'immemorial';

/**
 * Every control here decides which *stacks* are listed. None of them touches
 * `Fits`, which is measured over the whole rune box on purpose: it is the
 * figure that says whether a stack is worth keeping, and a filter must never
 * change what a page computes (`AGENTS.md` §6).
 */
type CraftFilterState = {
  search: string;
  kinds: CraftKind[];
  lineages: CraftLineage[];
  grades: ItemGrade[];
  /** A stat id as text, or `''` for every stat. */
  statId: string;
  /** A set name, `anySetValue` for the Immemorial items, or `''` for all. */
  set: string;
  showUsable: boolean;
  showDead: boolean;
};

const defaultCraftFilters: CraftFilterState = {
  search: '',
  kinds: [],
  lineages: [],
  grades: [],
  statId: '',
  set: '',
  showUsable: true,
  showDead: true,
};

function isCraftFilterState(value: unknown): value is CraftFilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.search === 'string'
    && Array.isArray(candidate.kinds)
    && candidate.kinds.every((entry) => craftKinds.includes(entry as CraftKind))
    && Array.isArray(candidate.lineages)
    && candidate.lineages.every((entry) => craftLineages.includes(entry as CraftLineage))
    && Array.isArray(candidate.grades)
    && candidate.grades.every((entry) => itemGrades.includes(entry as ItemGrade))
    && typeof candidate.statId === 'string'
    && typeof candidate.set === 'string'
    && typeof candidate.showUsable === 'boolean'
    && typeof candidate.showDead === 'boolean';
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
    /* One word each. The columns either side are narrow enough that a
       two-line heading here overhangs them, and the word a reader needs is
       the first one — the rest belongs to the accessible name. */
    column('range', 'Rolls', 'What one use of this item can roll'),
    column('held', 'Held'),
    column('fits', 'Fits', 'Runes in your account it can be spent on'),
    column('scope', 'Where it can go'),
  ];
})();

export function GemsSection({ game, roles, preferences, onOpenRune }: {
  game: ImportedGame | null;
  roles: readonly RuneRole[];
  preferences: Preferences;
  onOpenRune: OpenRuneOverlay;
}) {
  const [filters, setFilters] = useSessionStorageState(
    'jaswa.filters.craft-items', defaultCraftFilters, isCraftFilterState,
  );
  const { search, kinds, lineages, grades, statId, set, showUsable, showDead } = filters;

  const data = game?.data as GameRecord | undefined;
  const items = useMemo(() => readCraftItems(data), [data]);
  const runes = useMemo(() => readRunes(data), [data]);
  const monsters = useMemo(
    () => (Array.isArray(data?.unit_list) ? data.unit_list : []) as GameRecord[],
    [data],
  );
  const placements = usePresets();
  const reach = useMemo(() => craftReach(items, runes, placements.runes), [items, runes, placements]);
  const format = useMemo(() => (value: number) => formatNumber(value, preferences.general), [preferences.general]);

  const rows = useMemo<CraftRow[]>(() => items.map((item, index) => ({
    item,
    index,
    /* Every item was measured together, so the map always holds it; the
       fallback exists because a `Map` lookup is optional, not because a stack
       could be missing. */
    reach: reach.get(item.id) ?? { fits: 0, spare: 0, block: 'set' },
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

  const held = useMemo(() => items.reduce((total, item) => total + item.amount, 0), [items]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const chosenStat = statId === '' ? null : Number(statId);
    return rows.filter((row) => {
      const usable = row.reach.fits > 0;
      if (!showUsable && usable) return false;
      if (!showDead && !usable) return false;
      if (kinds.length && !kinds.includes(row.item.kind)) return false;
      if (lineages.length && !lineages.includes(row.item.lineage)) return false;
      if (grades.length && !grades.includes(row.item.grade)) return false;
      if (chosenStat !== null && row.item.statId !== chosenStat) return false;
      if (set === anySetValue && row.item.setName !== null) return false;
      if (set !== '' && set !== anySetValue && row.item.setName !== set) return false;
      if (!term) return true;
      return craftRowSearchText(row).includes(term);
    });
  }, [rows, search, kinds, lineages, grades, statId, set, showUsable, showDead]);

  /* The box opens on the items worth spending, best grade first. The tiebreak
     goes to the hook rather than into each column's own comparison: inside it,
     it is reversed along with the column and a descending sort would walk the
     import backwards. */
  const { sorted, sort, toggle } = useSortedRows(
    visible, craftColumns, { key: 'grade', direction: 'descending' },
    (left, right) => left.index - right.index,
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
      ? 'Report it from the rail if your account does have a craft inventory.'
      : 'Go to Home and drop in the JSON file exported from Summoners War.'}</p>
  </section>;

  /* Two questions, two menus, the same split the relic workspace makes. The box
     asks what the account is sitting on and whether any of it can still be
     spent; Best use takes one item and asks where it should go. */
  return <WorkspacePage
    header={<PageHeader
      title="Gems &amp; Grinds"
      tagline="You have a box full of upgrades and a shortage of patience. One of those is fixable." />}
  >
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
            <div className="filter-group craft-filter-search">
              <span className="filter-label">Search</span>
              <div className="filter-group-controls">
                <div className="search-field">
                  <span aria-hidden="true">⌕</span>
                  <input value={search}
                    onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                    placeholder="Filter the box" aria-label="Filter gems and grindstones by set, stat or grade" />
                  <FilterButton
                    onClick={() => setFilters((current) => ({ ...current, search: '' }))}
                    hidden={!search} disabled={!search} aria-label="Clear filter">✕</FilterButton>
                </div>
              </div>
            </div>

            <div className="filter-group craft-filter-kind" role="group" aria-label="Filter by item">
              <span className="filter-label">Item</span>
              <div className="filter-group-controls">
                {craftKinds.map((kind) => <FilterButton key={kind}
                  active={kinds.includes(kind)}
                  onClick={() => toggleValue(kind, 'kinds')}
                  title={kind === 'gem'
                    ? 'Replaces one sub property with its own stat'
                    : 'Adds to a sub property the rune already has'}
                >{craftKindLabels[kind]}</FilterButton>)}
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

            {/* The pair is exhaustive — an item either has somewhere to go or it
                has not — so turning both off is a request for nothing, exactly
                as Inventory and Storage are on the roster. */}
            <div className="filter-group craft-filter-fit" role="group" aria-label="Choose which items to include">
              <span className="filter-label">Fit</span>
              <div className="filter-group-controls">
                <FilterButton active={showUsable}
                  onClick={() => setFilters((current) => ({ ...current, showUsable: !current.showUsable }))}
                  title="Items at least one rune in your account can take"
                >Usable</FilterButton>
                <FilterButton active={showDead}
                  onClick={() => setFilters((current) => ({ ...current, showDead: !current.showDead }))}
                  title="Items no rune in your account can take today"
                >Dead stock</FilterButton>
              </div>
            </div>

            <FilterSummary visible={visible.length} total={rows.length} noun="items"
              onReset={() => setFilters(defaultCraftFilters)} className="craft-filter-status"
              below={<aside className="craft-held-balance" aria-label={`Gems and grindstones held: ${format(held)}`}>
                <span className="craft-held-balance-label">Held</span>
                <span className="craft-held-balance-value">{format(held)}</span>
              </aside>} />
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
              <td className={craftCell('held')}>{format(row.item.amount)}</td>
              {/* The count carries the rule it counted by, so a reader who
                  wonders where 116 came from has the answer without leaving
                  the row. */}
              <td className={craftCell('fits', row.reach.fits === 0 && 'muted')}
                title={craftRequirementText(row.item)}>
                {row.reach.fits === 0 ? '—' : format(row.reach.fits)}
              </td>
              <td className={craftCell('scope', row.reach.fits === 0 && 'muted')}>
                {craftScopeText(row.item, row.reach)}
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

    {/* Deferred: `details` renders its children open or shut, so a closed bar
        would otherwise mount a second copy of the empty state and judge every
        rune in the box against an item nobody has chosen yet. */}
    <Disclosure title="Best use for this" sessionKey="gems.best-use" deferContent>
      {!items.length ? noItems : <CraftItemBestUse
        items={items}
        runes={runes}
        monsters={monsters}
        profiles={preferences.monsterPreferences}
        roles={roles}
        general={preferences.general}
        onOpenRune={onOpenRune}
      />}
    </Disclosure>
  </WorkspacePage>;
}
