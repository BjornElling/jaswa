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
 *
 * `right` opens the same seam after a column instead, for when the text that
 * follows should stay where it is and the figures before it should give way.
 */
export type ColumnGutter = 'left' | 'right';

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
  if (gutter === 'left') return 'column-gutter-left';
  if (gutter === 'right') return 'column-gutter-right';
  return undefined;
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
  /* Gear slots read as codes rather than quantities, so they take the text
     side of the convention along with the rune sheet they follow: all three say
     what the monster has *engraved*, and the gear reads as one left-aligned block
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

/**
 * The artifact library, in the order Artifact Optimization reads the same
 * artifact: what it is, then where it sits and what it is worth there. Location
 * and value belong side by side because the value is read *against* that
 * monster — and the library once led with the two, which is why it read
 * differently from its sibling and opened a hole between a short `Inventory`
 * and the right-aligned figure after it, the slack of both columns landing in
 * one seam.
 *
 * Location is cut to a numbered, element-qualified name rather than given the
 * spare width, so that seam stays narrow; the spare width goes to Substats,
 * whose lines are ragged anyway. The marks column closes the row, as it does
 * on the Optimization table.
 */
export const artifactTableColumns: readonly TableColumn[] = [
  { key: 'category', width: '7.3394%', align: 'left' },
  { key: 'engraveClass', width: '7.7982%', align: 'left' },
  { key: 'grade', width: '7.3394%', align: 'left' },
  { key: 'mainProperty', width: '8.7156%', align: 'left' },
  { key: 'subProperties', width: '43.0092%', align: 'left' },
  { key: 'location', width: '14%', align: 'left' },
  { key: 'value', width: '7.7982%', align: 'right' },
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
 * The two figures the whole page exists for — Potential and Chance — sit beside
 * each other and beside the role they were measured against, because reading one
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
  { key: 'role', width: '8%', align: 'left' },
  { key: 'maxValue', width: '5%', align: 'right' },
  { key: 'quality', width: '13ch', align: 'right' },
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
  { key: 'role', width: '10%', align: 'left' },
  { key: 'maxValue', width: '6%', align: 'right' },
  { key: 'chance', width: '6%', align: 'right' },
  { key: 'action', width: '11%', align: 'left', gutter: 'left' },
];

export const relicTableColumns: readonly TableColumn[] = [
  { key: 'unique', width: '20%', align: 'left' },
  { key: 'main', width: '7%', align: 'left' },
  /* One mark and the longest band name, `Excellent`, leave this a third empty. */
  { key: 'synergy', width: '12%', align: 'left' },
  { key: 'level', width: '8%', align: 'right' },
  /* Durability is three marks rather than a quantity, so it centres under its
     heading instead of taking the numeric column's right edge. */
  { key: 'durability', width: '10%', align: 'center' },
  /* A count right against the verdict's left edge read as one block, so a
     double seam opens after it (`.relic-grid` in `globals.css`): the count gives
     way, and Advice and Reason stay put. Its width comes from Synergy and Unique
     property, which both had room. */
  { key: 'engraved', width: '17%', align: 'right', gutter: 'right' },
  /* The verdict alone, so the column a reader scans for Power up or Sell is
     one word wide. */
  { key: 'advice', width: '9%', align: 'left' },
  /* Why, beside the verdict: the explanation, then where the relic is likely to
     end — which is what makes the advice arguable rather than taken on trust.
     Reserved for the longest explanation, so a threshold move cannot crop it
     or reflow the rest of the table. */
  { key: 'reason', width: '17%', align: 'left' },
];

/**
 * The gem and grindstone box. An account holds hundreds of stacks of a dozen
 * repeating shapes, so the first five columns identify the item and its roll;
 * the last two say how many are held and how many runes they can improve.
 *
 * There were five. `Family` printed Standard on most of eight hundred rows to
 * say nothing, and on the rest repeated what the Set column now carries itself:
 * an Ancient stack wears the mark after its set name, and an Immemorial one has
 * no set to name, so that column reads `Immemorial`.
 *
 */
/* The other six columns share the space `Rolls` gives up, closing the gap
   between the left-aligned grade and the right-aligned range. */
const craftColumnWidth = '14.666666666666667%';

export const craftItemTableColumns: readonly TableColumn[] = [
  { key: 'item', width: craftColumnWidth, align: 'left' },
  { key: 'set', width: craftColumnWidth, align: 'left' },
  { key: 'stat', width: craftColumnWidth, align: 'left' },
  { key: 'grade', width: craftColumnWidth, align: 'left' },
  { key: 'range', width: '12%', align: 'right' },
  { key: 'quantity', width: craftColumnWidth, align: 'right' },
  { key: 'improves', width: craftColumnWidth, align: 'right' },
];

/** Fixed columns keep the plan steady as filters and saved monster choices change. */
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
  /* Each half reports points to two decimals, with room reserved before import. */
  { key: 'mainStat', width: '7.78%', align: 'right' },
  { key: 'uniqueStat', width: '8.77%', align: 'right' },
  /* A verdict and its one-line reason share this column, and its width is
     reserved for the longest reason so no row can crop or re-wrap the table.
     The gutter closes the run of values as the one above opens it, and the
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
  { key: 'index', width: '5%', align: 'left' },
  /* Wide enough for three sets and the slot 2, 4 and 6 mains after them. The room
     comes from the figures, whose headings and values need far less than an even
     share; E.HP D's heading alone needs more, and gets it. */
  { key: 'build', width: '21%', align: 'left' },
  { key: 'moves', width: '7%', align: 'right' },
  ...['hp', 'atk', 'def', 'spd', 'criRate', 'criDmg', 'res', 'acc', 'dmg', 'ehp']
    .map((key): TableColumn => ({ key, width: '6%', align: 'right' })),
  { key: 'ehpD', width: '7%', align: 'right' },
];

/**
 * The workspace result tables build their columns from a `SortableColumn` list
 * instead of a colgroup, so each declares its own `align` there beside the
 * column's label and comparison. `columnClasses` in `sortable-table.tsx` is what
 * hands that same declaration to the body cells.
 */
