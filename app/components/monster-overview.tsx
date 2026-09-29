import { type ReactNode, useMemo } from 'react';
import { FilterButton } from './button';
import { Disclosure, PageHeader } from './page-chrome';
import { DataTablePage, TableColumnGroup } from './data-table-page';
import { FilterSummary } from './filter-summary';
import { SortableHeader } from './sortable-table';
import { useRowOpener } from './use-row-opener';
import { useSortedRows } from './use-sorted-rows';
import type { SortableColumn } from './use-sorted-rows';
import { MonsterStorage } from './monster-storage';
import { MonsterLink } from './monster-link';
import type { OpenMonsterOverlay } from './monster-link';
import { WorkspacePage } from './workspace-page';
import { isRainbowmon, monsterPresentation } from '../lib/monster-catalog';
import type { MonsterArchetype } from '../lib/monster-catalog';
import { withHigherAwakenings } from '../lib/monster-identity';
import { shrineMonsterRecords } from '../lib/sealed-shrine-storage';
import type { GameRecord } from '../lib/game-data';
import { calculateMonsterTotals } from '../lib/monster-stats';
import { calculateRunePotentialMetrics, displayRunePotentialMetric } from '../lib/rune-potential-metrics';
import { activeRuneSets, elementName, elementNameList } from '../lib/rune-sets';
import type { Preferences } from '../lib/types';
import {
  compareNumbersWithBlanks, compareTextWithBlanks, defaultMonsterSortDirections,
  displayArtifactTypes, displayRelicType, equippedEquipmentTypes, isStoredMonster,
  monsterArchetypeLabels, monsterFilterArchetypes, numericOrNull,
} from '../lib/monster-grid';
import type { MonsterGridColumn, MonsterRow, SortKey } from '../lib/monster-grid';
import { monsterCopyNames } from '../lib/monster-names';
import { formatNumber } from '../lib/formatting';
import { useSessionStorageState } from '../lib/session-storage-state';
import { alignmentClass, monsterTableColumns } from '../lib/table-layouts';
import type { ColumnAlignment } from '../lib/table-layouts';

type MonsterFilterState = {
  search: string;
  selectedElements: string[];
  selectedArchetypes: MonsterArchetype[];
  showStorage: boolean;
  showInventory: boolean;
  showBelowMaxLevel: boolean;
  showRainbowmons: boolean;
};

const defaultMonsterFilters: MonsterFilterState = {
  search: '',
  selectedElements: [],
  selectedArchetypes: [],
  showStorage: true,
  showInventory: true,
  showBelowMaxLevel: false,
  /* Rainbowmons and Devilmons are fed to other monsters, never played, and an
     account holds them by the dozen, so the roster opens without them. */
  showRainbowmons: false,
};
/* The game's five elements, in the game's order, shown whether or not the
   account holds one of each: a row of controls that gained and lost buttons
   with the import would move every control after it (`AGENTS.md` §2), and an
   element the user cannot find is itself worth seeing. */
const monsterElementOptions = elementNameList;

/** The stat columns between the gear block and E.HP, in the order they are read. */
const monsterStatColumns: readonly MonsterGridColumn[] = [
  { key: 'level', label: 'LVL' }, { key: 'hp', label: 'HP' }, { key: 'atk', label: 'ATK' },
  { key: 'def', label: 'DEF' }, { key: 'spd', label: 'SPD' }, { key: 'criticalRate', label: 'CR%' },
  { key: 'criticalDamage', label: 'CD%' }, { key: 'resistance', label: 'RES%' }, { key: 'accuracy', label: 'ACC%' },
];

/* Two columns sort under a different name than they are laid out under, so the
   sort key is mapped to the layout column before its alignment is read. */
const monsterLayoutKeys: Partial<Record<SortKey, string>> = { artifactTypes: 'artifacts', relicTypes: 'relic' };

/**
 * The alignment for one column of the monster table, taken from the column plan
 * in `table-layouts.ts` so the heading, the cells and the sort control all read
 * one declaration rather than each remembering the same answer.
 */
function monsterColumnAlignment(key: SortKey): ColumnAlignment | undefined {
  const layoutKey = monsterLayoutKeys[key] ?? key;
  return monsterTableColumns.find((column) => column.key === layoutKey)?.align;
}

/** One body cell's classes: the column's alignment, then the row's own state. */
function cell(key: SortKey, ...extra: Array<string | false | undefined>): string {
  return [alignmentClass(monsterColumnAlignment(key)), ...extra].filter(Boolean).join(' ');
}

/** A numeric column's value, or null where the row has none to compare. */
function monsterSortNumber(row: MonsterRow, key: SortKey): number | null {
  const value = row[key as keyof MonsterRow];
  return typeof value === 'number' ? value : null;
}

/** The text a text-ordered column compares on, or null where it has none. */
const monsterSortText: Partial<Record<SortKey, (row: MonsterRow) => string | null>> = {
  name: (row) => row.name,
  sets: (row) => row.sets.length ? row.sets.map((set) => set.name).join('/') : null,
  artifactTypes: (row) => row.artifactTypes.some((type) => type !== null) ? displayArtifactTypes(row.artifactTypes) : null,
  relicTypes: (row) => row.relicTypes.some((type) => type !== null) ? displayRelicType(row.relicTypes) : null,
};

/**
 * Every column of the roster table with the comparison that orders it (§17.8).
 * Built from the same key list the layout and the cells use, so a column cannot
 * be added to the table without an ordering coming with it.
 *
 * `index` is the import order the table opens in; the rest compare their own
 * value and fall back to that order, which is what keeps equal rows still.
 */
function monsterSortableColumns(statColumns: readonly MonsterGridColumn[]): readonly SortableColumn<MonsterRow>[] {
  const column = (key: SortKey, label: ReactNode, accessibleLabel?: string): SortableColumn<MonsterRow> => {
    const align = monsterColumnAlignment(key);
    const text = monsterSortText[key];
    return {
      key,
      label,
      accessibleLabel,
      align,
      /* Numbers open at their largest, where the interesting rows are; text and
         the row number open at their natural start. */
      initialDirection: defaultMonsterSortDirections[key] ? 'ascending' : 'descending',
      compare: key === 'index'
        ? (left, right) => left.index - right.index
        : text
          ? (left, right) => compareTextWithBlanks(text(left), text(right), 1) || left.index - right.index
          /* Everything not named in `monsterSortText` is one of the numeric
             columns, whose `MonsterRow` fields are all `number | null`. */
          : (left, right) => compareNumbersWithBlanks(
            monsterSortNumber(left, key), monsterSortNumber(right, key), 1) || left.index - right.index,
    };
  };
  return [
    column('index', '#', 'Row number'),
    column('name', 'Monster'),
    column('sets', 'Runes'),
    column('artifactTypes', 'Artifacts'),
    column('relicTypes', 'Relic'),
    ...statColumns.map((entry) => column(entry.key, entry.label)),
    column('ehp', 'E.HP'),
    column('ehpD', 'E.HP D'),
    column('dmg', 'DMG'),
  ];
}

const monsterColumns = monsterSortableColumns(monsterStatColumns);
/* The game caps monsters at 40 today, so a level below that is not maxed. Treating
   it as a floor rather than an exact match keeps the filter right if the cap rises. */
const maxMonsterLevel = 40;

function isMonsterFilterState(value: unknown): value is MonsterFilterState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.search === 'string'
    && Array.isArray(candidate.selectedElements)
    && candidate.selectedElements.every((entry) => typeof entry === 'string' && monsterElementOptions.includes(entry))
    && Array.isArray(candidate.selectedArchetypes)
    && candidate.selectedArchetypes.every((entry) => monsterFilterArchetypes.includes(entry as MonsterArchetype))
    && typeof candidate.showStorage === 'boolean'
    /* A stored filter set from before Inventory replaced the fodder toggle has
       no `showInventory`, so it fails here and the defaults are used. Carrying
       it over as `false` would open the page with the roster hidden. */
    && typeof candidate.showInventory === 'boolean'
    && typeof candidate.showBelowMaxLevel === 'boolean'
    && typeof candidate.showRainbowmons === 'boolean';
}

export function MonsterOverview({ monsters, gameData, preferences, onOpenMonster }: {
  monsters: GameRecord[];
  gameData: GameRecord;
  preferences: Preferences;
  onOpenMonster: OpenMonsterOverlay;
}) {
  const rowOpener = useRowOpener();
  const [filters, setFilters] = useSessionStorageState(
    'jaswa.filters.monsters', defaultMonsterFilters, isMonsterFilterState,
  );
  const {
    search, selectedElements, selectedArchetypes, showStorage, showInventory, showBelowMaxLevel, showRainbowmons,
  } = filters;
  const rows = useMemo<MonsterRow[]>(() => {
    const copyNames = monsterCopyNames(monsters, preferences.monsterPreferences);
    return monsters.map((monster, index) => {
      const unitId = String(monster.unit_id ?? `unknown-${index}`);
      const display = monsterPresentation(monster.unit_master_id);
      const totals = calculateMonsterTotals(monster);
      const baseHp = numericOrNull(monster.con);
      const baseAtk = numericOrNull(monster.atk);
      const baseDef = numericOrNull(monster.def);
      const baseSpd = numericOrNull(monster.spd);
      const hp = baseHp === null ? null : totals.hp;
      const atk = baseAtk === null ? null : totals.atk;
      const def = baseDef === null ? null : totals.def;
      const spd = baseSpd === null ? null : totals.spd;
      const criticalRate = numericOrNull(monster.critical_rate) === null ? null : totals.criticalRate;
      const criticalDamage = numericOrNull(monster.critical_damage) === null ? null : totals.criticalDamage;
      const metrics = calculateRunePotentialMetrics({
        atk: totals.atk, hp: totals.hp, def: totals.def,
        criticalRate: totals.criticalRate, criticalDamage: totals.criticalDamage,
      });
      return {
        unitId,
        masterId: String(monster.unit_master_id ?? `unknown-${index}`),
        /* Only a user's own label earns a second line, and it shows the game's
           name beneath it. A collaboration copy shows one name — its own. */
        ...copyNames[unitId],
        searchAliases: display.searchAliases,
        element: elementName(monster.attribute),
        archetype: display.archetype,
        imageFilename: display.imageFilename,
        initial: display.shortName,
        sets: activeRuneSets(monster),
        artifactTypes: equippedEquipmentTypes(monster, 'artifacts'),
        relicTypes: equippedEquipmentTypes(monster, 'relics'),
        index,
        inStorage: isStoredMonster(monster),
        level: numericOrNull(monster.unit_level),
        hp, atk, def, spd, criticalRate, criticalDamage,
        resistance: numericOrNull(monster.resist) === null ? null : totals.resistance,
        accuracy: numericOrNull(monster.accuracy) === null ? null : totals.accuracy,
        ehp: hp === null || def === null ? null : displayRunePotentialMetric(metrics.ehp),
        ehpD: hp === null || def === null ? null : displayRunePotentialMetric(metrics.ehpD),
        dmg: atk === null || criticalRate === null || criticalDamage === null ? null : displayRunePotentialMetric(metrics.dmg),
      };
    });
  }, [monsters, preferences]);

  /* Every monster the account holds anywhere, as the name a search would match
     it by. This table lists units only — a shrine stack has no stats to show —
     but a *seed* must not be limited to what the table lists, or a term would
     reach an awakened form only when the account still keeps the unawakened one
     as a unit. Sealing the last Fairy is not un-owning Elucia.

     Named forms below the table's own rows are what this adds: it seeds the
     lineage floor without ever putting a shrine row in the stat sheet. */
  const heldNames = useMemo(() => [
    ...monsters,
    ...shrineMonsterRecords(gameData),
  ].map((monster: GameRecord) => {
    const presentation = monsterPresentation(monster.unit_master_id);
    return {
      masterId: String(monster.unit_master_id ?? ''),
      names: [presentation.name, ...presentation.searchAliases],
    };
  }), [monsters, gameData]);

  /* A search names a monster, and awakening it does not change which monster it
     is, so the term reaches the forms above what it matched and never the forms
     below (§17.15) — the same rule the Numbers page reads, from the same module.

     Which rows are *shown* must not decide what the account is understood to
     hold: the seed is taken before any filter runs, so unchecking Inventory
     cannot change whether a search finds an awakened copy standing in Storage,
     and the level cap cannot hide the unawakened form a term was typed against.

     `available` stays the table's own rows, because that is the set being
     filtered — widening towards ids this table cannot list would accept nothing.

     A row's own name, its aliases and its rune sets are matched here too, and a
     set match seeds no widening: `fight` names equipment this copy is wearing,
     not a monster whose awakened form is also wanted. */
  const searchedMasterIds = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return undefined;
    const named = heldNames
      .filter((held) => held.names.some((name) => name.toLowerCase().includes(term)))
      .map((held) => held.masterId);
    /* A user's own label is on the row rather than in the catalogue, so it is
       matched from the rows themselves and seeds the widening alongside. */
    const labelled = rows
      .filter((row) => row.name.toLowerCase().includes(term)
        || row.secondaryName?.toLowerCase().includes(term))
      .map((row) => row.masterId);
    return withHigherAwakenings([...named, ...labelled], rows.map((row) => row.masterId));
  }, [heldNames, rows, search]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      /* Storage and Inventory are the game's two places a monster can be, so
         the pair is exhaustive: turning both off is a request for nothing. */
      if (!showStorage && row.inStorage) return false;
      if (!showInventory && !row.inStorage) return false;
      if (!showBelowMaxLevel && (row.level === null || row.level < maxMonsterLevel)) return false;
      if (!showRainbowmons && isRainbowmon(row.masterId)) return false;
      if (selectedElements.length && (!row.element || !selectedElements.includes(row.element))) return false;
      if (selectedArchetypes.length && (!row.archetype || !selectedArchetypes.includes(row.archetype))) return false;
      if (searchedMasterIds === undefined) return true;
      return searchedMasterIds.has(row.masterId)
        || row.sets.some((set) => set.name.toLowerCase().includes(term));
    });
  }, [rows, search, searchedMasterIds, selectedElements, selectedArchetypes, showStorage, showInventory, showBelowMaxLevel, showRainbowmons]);

  const { sorted, sort, toggle } = useSortedRows(
    visible, monsterColumns, { key: 'index', direction: 'ascending' },
  );

  function toggleElement(name: string) {
    setFilters((current) => ({
      ...current,
      selectedElements: current.selectedElements.includes(name)
        ? current.selectedElements.filter((entry) => entry !== name)
        : [...current.selectedElements, name],
    }));
  }

  function toggleArchetype(archetype: MonsterArchetype) {
    setFilters((current) => ({
      ...current,
      selectedArchetypes: current.selectedArchetypes.includes(archetype)
        ? current.selectedArchetypes.filter((entry) => entry !== archetype)
        : [...current.selectedArchetypes, archetype],
    }));
  }

  return <WorkspacePage
    header={<PageHeader
      title="Monsters"
      tagline="A menagerie of statistics, storage, and questionable life choices." />}
  >
    <Disclosure title="Stats" sessionKey="monsters.stats">
      {!monsters.length ? <section className="empty-state">
        <h2>Nothing to show until a game file is imported.</h2>
        <p className="next-step">Go to Home and drop in the JSON file exported from Summoners War.</p>
      </section> : <DataTablePage
        tableClassName="monster-grid"
        headerLabel="Stats columns"
        tableLabel="Monster stats"
        columnGroup={<TableColumnGroup columns={monsterTableColumns} />}
        header={<SortableHeader columns={monsterColumns} sort={sort} onToggle={toggle} />}
        filters={<>
      <div className="filter-group">
        <span className="filter-label">Search</span>
        <div className="filter-group-controls">
          <div className="search-field">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Filter monsters" aria-label="Filter monsters by name or set" />
            <FilterButton onClick={() => setFilters((current) => ({ ...current, search: '' }))}
              hidden={!search} disabled={!search} aria-label="Clear filter">✕</FilterButton>
          </div>
        </div>
      </div>
      <div className="filter-group" role="group" aria-label="Filter by element">
        <span className="filter-label">Element</span>
        <div className="filter-group-controls">
          {monsterElementOptions.map((name) => <FilterButton
            key={name}
            active={selectedElements.includes(name)}
            onClick={() => toggleElement(name)}
          >{name.slice(0, 3).toUpperCase()}</FilterButton>)}
        </div>
      </div>
      <div className="filter-group" role="group" aria-label="Filter by monster type">
        <span className="filter-label">Type</span>
        <div className="filter-group-controls">
          {monsterFilterArchetypes.map((archetype) => <FilterButton
            key={archetype}
            active={selectedArchetypes.includes(archetype)}
            onClick={() => toggleArchetype(archetype)}
          >{monsterArchetypeLabels[archetype]}</FilterButton>)}
        </div>
      </div>
      <div className="filter-group" role="group" aria-label="Choose which monsters to include">
        <span className="filter-label">Include</span>
        <div className="filter-group-controls">
          <FilterButton active={showInventory}
            onClick={() => setFilters((current) => ({ ...current, showInventory: !current.showInventory }))}
            title="Monsters on your island rather than in Monster Storage"
            aria-label="Monsters outside Monster Storage"
          >Inventory</FilterButton>
          <FilterButton active={showStorage}
            onClick={() => setFilters((current) => ({ ...current, showStorage: !current.showStorage }))}
          >Storage</FilterButton>
          <FilterButton active={showBelowMaxLevel}
            onClick={() => setFilters((current) => ({ ...current, showBelowMaxLevel: !current.showBelowMaxLevel }))}
          >Lvl. &lt; {maxMonsterLevel}</FilterButton>
          <FilterButton active={showRainbowmons}
            onClick={() => setFilters((current) => ({ ...current, showRainbowmons: !current.showRainbowmons }))}
            title="Rainbowmons and Devilmons"
            aria-label="Rainbowmons and Devilmons"
          >Rainbowmon</FilterButton>
        </div>
      </div>
      <FilterSummary visible={visible.length} total={rows.length} noun="monsters"
        onReset={() => setFilters(defaultMonsterFilters)} />
        </>}
      >
        <tbody>
          {sorted.map((row) => <tr key={row.unitId} {...rowOpener}>
            <td className={cell('index', 'row-index')}>{String(row.index + 1).padStart(2, '0')}</td>
            <td className={cell('name')}>
              <MonsterLink
                target={{ kind: 'copy', unitId: row.unitId, masterId: row.masterId }}
                name={row.name}
                secondaryName={row.secondaryName}
                portrait={{ imageFilename: row.imageFilename, initial: row.initial }}
                onOpen={onOpenMonster}
              />
            </td>
            <td className={cell('sets')}>
              {row.sets.length
                ? <span className="set-mark" title={row.sets.map((set) => set.name).join(' / ')}>{row.sets.map((set) => set.abbreviation).join('/')}</span>
                : <span className="set-none">—</span>}
            </td>
            <td className={cell('artifactTypes', 'equipment-start', row.artifactTypes.some((type) => type !== null) ? 'equipment-types' : 'muted')}>
              {displayArtifactTypes(row.artifactTypes)}
            </td>
            <td className={cell('relicTypes', row.relicTypes.some((type) => type !== null) ? 'equipment-types' : 'muted')}>
              {displayRelicType(row.relicTypes)}
            </td>
            <td className={cell('level', row.level === null ? 'dim muted' : 'dim')}>{formatNumber(row.level, preferences.general)}</td>
            <td className={cell('hp', row.hp === null && 'muted')}>{formatNumber(row.hp, preferences.general)}</td>
            <td className={cell('atk', row.atk === null && 'muted')}>{formatNumber(row.atk, preferences.general)}</td>
            <td className={cell('def', row.def === null && 'muted')}>{formatNumber(row.def, preferences.general)}</td>
            <td className={cell('spd', row.spd === null && 'muted')}>{formatNumber(row.spd, preferences.general)}</td>
            <td className={cell('criticalRate', row.criticalRate === null && 'muted')}>{formatNumber(row.criticalRate, preferences.general)}</td>
            <td className={cell('criticalDamage', row.criticalDamage === null && 'muted')}>{formatNumber(row.criticalDamage, preferences.general)}</td>
            <td className={cell('resistance', row.resistance === null && 'muted')}>{formatNumber(row.resistance, preferences.general)}</td>
            <td className={cell('accuracy', row.accuracy === null && 'muted')}>{formatNumber(row.accuracy, preferences.general)}</td>
            {/* The three composites are derived readings rather than the game's
                own figures, so they sit a step back from the stats they are
                computed from — the same `dim` the level column takes. */}
            <td className={cell('ehp', row.ehp === null ? 'dim muted' : 'dim')}>{formatNumber(row.ehp, preferences.general)}</td>
            <td className={cell('ehpD', row.ehpD === null ? 'dim muted' : 'dim')}>{formatNumber(row.ehpD, preferences.general)}</td>
            <td className={cell('dmg', row.dmg === null ? 'dim muted' : 'dim')}>{formatNumber(row.dmg, preferences.general)}</td>
          </tr>)}
        </tbody>
      </DataTablePage>}
    </Disclosure>

    <Disclosure title="Numbers" sessionKey="monsters.numbers">
      <MonsterStorage monsters={monsters} gameData={gameData} preferences={preferences} onOpenMonster={onOpenMonster} />
    </Disclosure>
  </WorkspacePage>;
}
