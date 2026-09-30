/**
 * How a column's cells sit against their box. Declared once per column and used
 * by both the header and the body, so a heading can never drift away from the
 * figures under it.
 *
 * The convention the app reads by: text left, numbers right, so digits line up
 * on their units and columns of figures can be compared down the page.
 */
export type ColumnAlignment = 'left' | 'right' | 'center';

/**
 * Extra room before a column, for the seam between two groups of columns that
 * happen to sit next to each other but are not read together. A right-aligned
 * figure and the left-aligned text after it otherwise meet at one shared pad
 * and read as one block.
 *
 * It is declared on the column plan beside the width rather than written as a
 * CSS rule, for the same reason the widths are: a rule keyed on position would
 * follow the position and not the column when the plan is reordered.
 */
export type ColumnGutter = 'left';

export type TableColumn = {
  key: string;
  width: string;
  /** Omitted means 'left'; only a numeric column states 'right'. */
  align?: ColumnAlignment;
  /** Omitted means the table's ordinary cell padding on both sides. */
  gutter?: ColumnGutter;
};

/** The class both a `th` and a `td` take for one column, so the pair agrees. */
export function alignmentClass(align: ColumnAlignment | undefined): string {
  if (align === 'right') return 'align-right';
  if (align === 'center') return 'align-center';
  return 'align-left';
}

/** The gutter's class, on the same terms: one declaration, both halves. */
export function gutterClass(gutter: ColumnGutter | undefined): string | undefined {
  return gutter === 'left' ? 'column-gutter-left' : undefined;
}

/**
 * The body-cell classes for one table, keyed by column, taken from the same
 * column list the header is built from. A cell asks for its column by key
 * rather than restating an alignment, which is what keeps the two in step when
 * a column's alignment changes or the columns are reordered.
 *
 * It lives here rather than beside `SortableHeader`, where it was, because a
 * module that exports a React component may export *only* components: React
 * Fast Refresh cannot reason about a mixed module and disables itself for the
 * whole file, which cost `sortable-table.tsx` its hot reloading and printed a
 * warning on every edit. It only ever needed a column's key and alignment, so
 * it takes that shape rather than `SortableColumn` and no import runs back the
 * other way. `useSortedRows` left the same file for the same reason and sits in
 * `use-sorted-rows.ts`, which is where `SortableColumn` itself now lives.
 */
export function columnClasses(
  columns: readonly { key: string; align?: ColumnAlignment; gutter?: ColumnGutter }[],
) {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  return (key: string, ...extra: Array<string | false | undefined>) => {
    const column = byKey.get(key);
    return [alignmentClass(column?.align), gutterClass(column?.gutter), ...extra]
      .filter(Boolean).join(' ');
  };
}

/**
 * Which side of the heading text the sort arrow sits on.
 *
 * The mark belongs on the outside of the label — away from the figures the
 * column is read against. A right-aligned column's text hugs the column's right
 * edge, where the digits line up, so an arrow after the text would drive a
 * wedge between the heading and the numbers under it; the arrow goes before the
 * text instead. A left-aligned column is the mirror image, and a centred one has
 * no edge to defend, so its arrow trails the text as reading order expects.
 */
export function sortMarkSide(align: ColumnAlignment | undefined): 'before' | 'after' {
  return align === 'right' ? 'before' : 'after';
}

/**
 * The two account libraries use declared column plans instead of scattered CSS
 * percentages. A table's two rendered halves receive the same plan, which is
 * what keeps its filter, heading and rows on one immutable grid.
 */
export const monsterTableColumns: readonly TableColumn[] = [
  { key: 'index', width: '4.1284%', align: 'left' },
  { key: 'name', width: '13.7615%', align: 'left' },
  { key: 'sets', width: '7.7982%', align: 'left' },
  /* Equipment slots read as codes rather than quantities, so they take the text
     side of the convention along with the rune sheet they follow: all three say
     what the monster is *wearing*, and the gear reads as one left-aligned block
     before the run of figures begins. */
  { key: 'artifacts', width: '6.422%', align: 'left' },
  { key: 'relic', width: '4.5872%', align: 'left' },
  { key: 'level', width: '3.6697%', align: 'right' },
  { key: 'hp', width: '5.5046%', align: 'right' },
  { key: 'atk', width: '5.5046%', align: 'right' },
  { key: 'def', width: '5.5046%', align: 'right' },
  { key: 'spd', width: '4.5872%', align: 'right' },
  { key: 'criticalRate', width: '4.5872%', align: 'right' },
  { key: 'criticalDamage', width: '4.5872%', align: 'right' },
  { key: 'resistance', width: '4.5872%', align: 'right' },
  { key: 'accuracy', width: '4.5872%', align: 'right' },
  { key: 'ehp', width: '6.422%', align: 'right' },
  { key: 'ehpD', width: '6.422%', align: 'right' },
  { key: 'dmg', width: '7.3394%', align: 'right' },
];

export const storageTableColumns: readonly TableColumn[] = [
  { key: 'index', width: '4%', align: 'left' },
  { key: 'name', width: '24%', align: 'left' },
  { key: 'location', width: '13%', align: 'left' },
  { key: 'element', width: '10%', align: 'left' },
  { key: 'archetype', width: '10%', align: 'left' },
  { key: 'grade', width: '9%', align: 'right' },
  { key: 'level', width: '10%', align: 'right' },
  { key: 'skills', width: '10%', align: 'right' },
  { key: 'quantity', width: '10%', align: 'right' },
];

export const artifactTableColumns: readonly TableColumn[] = [
  { key: 'location', width: '17.8899%', align: 'left' },
  { key: 'value', width: '7.7982%', align: 'right' },
  { key: 'category', width: '7.3394%', align: 'left' },
  { key: 'equipClass', width: '7.7982%', align: 'left' },
  { key: 'grade', width: '7.3394%', align: 'left' },
  { key: 'mainProperty', width: '8.7156%', align: 'left' },
  { key: 'subProperties', width: '39.1193%', align: 'left' },
  { key: 'refinement', width: '4%', align: 'right' },
];

/**
 * The relic library. An account holds a handful of relics rather than hundreds,
 * so the columns are wide enough to say what they mean in words: the two that
 * carry a judgement — Synergy and Advice — take a third of the measure between
 * them, because they are the reason the page exists and abbreviating them would
 * turn a verdict back into a puzzle.
 */
/**
 * The Rune Clean-up verdict table.
 *
 * The two figures the whole page exists for — Max value and Chance — sit beside
 * each other and beside the preset they were measured against, because reading one
 * without the other two says nothing. The sub properties take the widest column:
 * they are what the player is actually judging when they disagree with the verdict.
 *
 * Level follows Slot because the two small identifying figures belong together.
 * Main and Innate then sit beside each other, before the wider Sub properties
 * column. Location closes the descriptive half, so the row reads as "this rune,
 * here" before the judgement begins. It is wide enough for a numbered,
 * element-qualified name — `DHALSIM (Water) #2` is the shape to fit — because a
 * truncated monster name is the one thing in that column nobody can act on. Set
 * carries the same obligation in miniature: it has to fit `Ancient Determination`,
 * not just `Determination`.
 */
export const runeCleanupTableColumns: readonly TableColumn[] = [
  { key: 'set', width: '12%', align: 'left' },
  { key: 'slot', width: '3%', align: 'center' },
  { key: 'level', width: '4%', align: 'right' },
  { key: 'main', width: '7%', align: 'left' },
  { key: 'innate', width: '8%', align: 'left' },
  /* Four lines of `Resistance +19%` and a gem mark: the width is for the longest
     four the game can roll, signed and with their percent signs, not for four
     bare ones. It comes from the small figures either side, which never needed
     the room they had. */
  { key: 'subs', width: '27%', align: 'left' },
  { key: 'location', width: '11%', align: 'left' },
  { key: 'preset', width: '8%', align: 'left' },
  { key: 'maxValue', width: '5%', align: 'right' },
  { key: 'chance', width: '6%', align: 'right' },
  /* A verdict and its chance share this column, and its width is reserved for the
     longest reading so that moving a slider cannot reflow the table. */
  { key: 'advice', width: '9%', align: 'left' },
];

/**
 * The Rune Simulator's table: the Clean-up plan's vocabulary for a rune nobody
 * owns yet. Location has nothing to say about a generated rune, so its width goes
 * to Stars and Quality, which the simulator may vary where an account rune is
 * already known. Substats stack one line per property rather than running on,
 * because the power-up and craft marks beside each value make four inline pairs
 * too wide to share a row with eleven other columns.
 */
export const runeSimulatorTableColumns: readonly TableColumn[] = [
  { key: 'set', width: '11%', align: 'left' },
  { key: 'slot', width: '4%', align: 'center' },
  { key: 'stars', width: '4%', align: 'center' },
  { key: 'quality', width: '6%', align: 'left' },
  { key: 'level', width: '4%', align: 'right' },
  /* Wide enough for `CRI Dmg` after the seam's extra padding; at 7 % it met the
     innate beside it on a 1280px screen. */
  { key: 'main', width: '9%', align: 'left', gutter: 'left' },
  { key: 'innate', width: '12%', align: 'left' },
  { key: 'subs', width: '17%', align: 'left' },
  { key: 'preset', width: '10%', align: 'left' },
  { key: 'maxValue', width: '6%', align: 'right' },
  { key: 'chance', width: '6%', align: 'right' },
  { key: 'action', width: '11%', align: 'left', gutter: 'left' },
];

export const relicTableColumns: readonly TableColumn[] = [
  { key: 'unique', width: '23%', align: 'left' },
  { key: 'main', width: '7%', align: 'left' },
  { key: 'synergy', width: '15%', align: 'left' },
  { key: 'level', width: '8%', align: 'right' },
  /* Durability is three marks rather than a quantity, so it centres under its
     heading instead of taking the numeric column's right edge. */
  { key: 'durability', width: '10%', align: 'center' },
  /* Where the relic ends up, beside the advice that reads it — which is what
     makes the advice arguable rather than something to be taken on trust. */
  { key: 'landing', width: '11%', align: 'right' },
  { key: 'engraved', width: '11%', align: 'right' },
  /* A verdict and its compact explanation share this column. Its width is
     reserved for the longest explanation, so a threshold move cannot crop it
     or reflow the rest of the table. */
  { key: 'advice', width: '15%', align: 'left' },
];

/**
 * The gem and grindstone box. An account holds hundreds of stacks of a dozen
 * repeating shapes, so the four columns that say *what* an item is are cut to
 * their own words and the width is spent on the two that say what it is worth
 * keeping: how far it reaches into the rune box, and what it is looking for.
 *
 * There were five. `Family` printed Standard on most of eight hundred rows to
 * say nothing, and on the rest repeated what the Set column now carries itself:
 * an Ancient stack wears the mark after its set name, and an Immemorial one has
 * no set to name, so that column reads `Immemorial`. The 10 % the family took
 * went back to the columns that were tightest against their own headings.
 *
 * The gutter sits on the last column rather than on `Fits`: that is where the
 * run of figures ends and prose begins, and a right-aligned number followed by
 * left-aligned text otherwise meets at bare padding and the two read as one
 * block. Put on `Fits` instead, the seam ate two thirds of a column whose
 * heading is already wider than the figure under it.
 */
export const craftItemTableColumns: readonly TableColumn[] = [
  { key: 'item', width: '9%', align: 'left' },
  /* The widest of the four descriptive columns: it now has to hold the longest
     set name and the mark after it, and `Immemorial` besides. */
  { key: 'set', width: '15%', align: 'left' },
  { key: 'stat', width: '11%', align: 'left' },
  { key: 'grade', width: '10%', align: 'left' },
  { key: 'range', width: '11%', align: 'right' },
  { key: 'held', width: '9%', align: 'right' },
  { key: 'fits', width: '9%', align: 'right' },
  { key: 'scope', width: '26%', align: 'left', gutter: 'left' },
];

/**
 * The roster, read as relic destinations. The monster's identity leads, because
 * that is what the user sorts and searches by, and the three columns that carry
 * the judgement sit together on the right: what it wears, what the plan gives
 * it, and why.
 *
 * The widths are set from one measurement of the rendered table rather than by
 * eye, because the space a reader sees between two columns is not the padding
 * between them: it is the padding *plus* whatever width each column carries
 * beyond its own content, and which end that slack lands on depends on the
 * alignment. Two left-aligned columns push their slack into the seam after them.
 * A left column followed by a right one puts *both* columns' slack into the same
 * seam, which is why the widest hole on this table — 207px — sat between the
 * recommended relic and the first percentage that rates it. A right column
 * followed by a left one has no slack in the seam at all and closes up to bare
 * padding, which is what happened at the level and again at the advice.
 *
 * So the widths below are solved rather than chosen: each column is given its
 * content, plus whatever slack the seam beside it needs to match the rest, and
 * the two seams that would otherwise close up are opened with a `gutter`. Every
 * seam then measures 82–100px, against 27–108px before, and the row fills its
 * width with no spare band at either end.
 *
 * Two of them sit at the top of that range and cannot come down: a column can
 * never be narrower than its own heading, and `Recc. main stat` and `Recc.
 * unique prop.` are both headings far wider than the percentage under them. Any
 * width a heading forces past its content becomes seam, so shortening those two
 * headings is the only thing that would even them out further.
 *
 * `npx playwright test` has no assertion on any of this — the numbers come from
 * measuring the rendered rows, and they have to be re-measured after a heading,
 * a font or a canvas width changes, not nudged one percent at a time.
 */
export const relicMonsterTableColumns: readonly TableColumn[] = [
  { key: 'index', width: '7.65%', align: 'left' },
  { key: 'name', width: '12.26%', align: 'left' },
  { key: 'element', width: '7.25%', align: 'left' },
  { key: 'archetype', width: '5.41%', align: 'left' },
  { key: 'level', width: '4.61%', align: 'right' },
  /* The roster facts end at the level, and the plan for this monster starts
     here. The level's digits sit at their column's right edge and the relic's
     name at this one's left, so without the gutter the two meet at bare padding
     and the groups run together — the tightest seam on the row was here. */
  { key: 'current', width: '16.55%', align: 'left', gutter: 'left' },
  { key: 'recommended', width: '9.16%', align: 'left' },
  /* The recommended relic's two halves, each as a share of the best that half
     could be on this monster. Two readings rather than one composite, because
     a reader can check either against the game's own Statistics panel and a
     blended figure they cannot check is a figure they have to trust.
     Both are cut to their headings and no wider. A right-aligned column parks
     its figure at its far edge, so every pixel of width past the heading turns
     into a hole in *front* of the number, between it and the relic name it
     rates. These two were 10 % each and opened a 207px gap doing it. */
  { key: 'mainStat', width: '7.78%', align: 'right' },
  { key: 'uniqueStat', width: '8.77%', align: 'right' },
  /* A verdict and its one-line reason share this column, and its width is
     reserved for the longest reason so no row can crop or re-wrap the table.
     The gutter closes the run of percentages as the one above opens it, and the
     slack past the longest reason sits at the table's own edge — the one place
     on the row where spare width opens no hole between two things. */
  { key: 'advice', width: '20.56%', align: 'left', gutter: 'left' },
];

/**
 * Rune Optimization's builds. The build is named in the one wide column — it has
 * to hold `Violent/Will` and `Energy/Blade/Broken` alike — and every figure gets
 * the same measure, wide enough for a six-digit E.HP in either number format, so
 * the eleven read down the page as one grid and sorting one cannot widen another.
 */
export const runeOptimizationTableColumns: readonly TableColumn[] = [
  { key: 'index', width: '4%', align: 'left' },
  { key: 'build', width: '15%', align: 'left' },
  { key: 'moves', width: '5%', align: 'right' },
  ...['hp', 'atk', 'def', 'spd', 'criRate', 'criDmg', 'res', 'acc', 'dmg', 'ehp', 'ehpD']
    .map((key): TableColumn => ({ key, width: `${76 / 11}%`, align: 'right' })),
];

/**
 * The workspace result tables build their columns from a `SortableColumn` list
 * instead of a colgroup, so each declares its own `align` there beside the
 * column's label and comparison. `columnClasses` in `sortable-table.tsx` is what
 * hands that same declaration to the body cells.
 */
