import { relicMaximumDurability } from '../lib/relic-properties';
import { relicSynergyBandLabels } from '../lib/relic-synergy';
import type { RelicSynergyBand } from '../lib/relic-synergy';
import type { RelicLevelState } from '../lib/relic-grid';

/**
 * The marks the relic table reads by.
 *
 * Every one of them occupies the same box in every state it can be in. A cell
 * that gained or lost a glyph as its value changed would re-measure its column
 * and move the row beside it, which is the movement `AGENTS.md` rule 2 forbids
 * — so an unused slot is hidden rather than removed, and a state with nothing
 * to say still reserves its space.
 */

function Star() {
  return <svg className="relic-mark relic-mark-star" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M8 1.6 10 6.2 15 6.6 11.2 9.9 12.4 14.8 8 12.2 3.6 14.8 4.8 9.9 1 6.6 6 6.2z" />
  </svg>;
}

function Cross() {
  return <svg className="relic-mark relic-mark-cross" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M4 4 12 12M12 4 4 12" />
  </svg>;
}

function Diamond() {
  return <svg className="relic-mark relic-mark-diamond" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M8 2.5 13.5 8 8 13.5 2.5 8z" />
  </svg>;
}

/** How many marks a band draws, and which. The second slot is always present. */
const bandMarks: Record<RelicSynergyBand, { mark: 'star' | 'cross' | 'diamond'; count: 1 | 2 }> = {
  exceptional: { mark: 'star', count: 2 },
  strong: { mark: 'star', count: 1 },
  neutral: { mark: 'diamond', count: 1 },
  weak: { mark: 'cross', count: 1 },
  poor: { mark: 'cross', count: 2 },
};

function SynergyGlyph({ band, reserveSecondSlot = true }: {
  band: RelicSynergyBand;
  reserveSecondSlot?: boolean;
}) {
  const { mark, count } = bandMarks[band];
  const glyph = mark === 'star' ? <Star /> : mark === 'cross' ? <Cross /> : <Diamond />;
  return <span className="relic-mark-slots" aria-hidden="true">
    <span className="relic-mark-slot">{glyph}</span>
    {(count === 2 || reserveSecondSlot) && <span
      className={count === 2 ? 'relic-mark-slot' : 'relic-mark-slot relic-mark-spare'}
    >{glyph}</span>}
  </span>;
}

/**
 * A relic's fit, as two reserved slots and the band's name.
 *
 * The name stays in the text beside the marks. Colour here says the same thing
 * the shape does, and `AGENTS.md` rule 5 is explicit that where colour names a
 * fact the fact is written out too — so the column reads the same with the
 * colours removed.
 */
export function RelicSynergyMark({ band }: { band: RelicSynergyBand }) {
  return <span className="relic-synergy" data-band={band}>
    <SynergyGlyph band={band} />
    <span className="relic-synergy-label">{relicSynergyBandLabels[band]}</span>
  </span>;
}

/** The same mark vocabulary, without the table's band colour or text label. */
export function RelicSynergyFilterMark({ band }: { band: RelicSynergyBand }) {
  return <span className="relic-synergy-filter-mark" data-band={band}>
    <SynergyGlyph band={band} reserveSecondSlot={false} />
  </span>;
}

/**
 * Power-up attempts still available, as three pips.
 *
 * All three are always drawn: the spent ones are the reason a relic's level
 * will never move again, so they are as much of the answer as the ones left.
 */
export function RelicDurabilityMark({ durability }: { durability: number }) {
  return <span className="relic-durability" data-remaining={durability}>
    <span aria-hidden="true" className="relic-mark-slots">
      {Array.from({ length: relicMaximumDurability }, (_, index) => <svg
        key={index}
        className={index < durability ? 'relic-mark relic-pip relic-pip-left' : 'relic-mark relic-pip relic-pip-spent'}
        viewBox="0 0 16 16" focusable="false"
      ><circle cx="8" cy="8" r="4.5" /></svg>)}
    </span>
    <span className="visually-hidden">{durability} of {relicMaximumDurability} attempts left</span>
  </span>;
}

/**
 * Why a level is where it is.
 *
 * `open` draws nothing and keeps its slot, so the three states share one width.
 * The level's own colour carries the rest: a level that can still move is full
 * ink and one that cannot is dimmed — the two-tone device already used across
 * the app rather than a third colour vocabulary.
 */
export function RelicLevelMark({ state }: { state: RelicLevelState }) {
  const label = state === 'maxed' ? 'At the maximum level'
    : state === 'spent' ? 'No power-up attempts left' : 'Can still be powered up';
  return <span className="relic-level-mark" data-state={state}>
    <span className="relic-mark-slot" aria-hidden="true">
      {state === 'maxed' && <svg className="relic-mark relic-mark-line" viewBox="0 0 16 16" focusable="false">
        <path d="M3.5 3.5h9" />
        <path d="M8 13.5V6" />
        <path d="m5 9 3-3 3 3" />
      </svg>}
      {state === 'spent' && <svg className="relic-mark relic-mark-line" viewBox="0 0 16 16" focusable="false">
        <circle cx="8" cy="8" r="5.25" />
        <path d="m4.3 11.7 7.4-7.4" />
      </svg>}
    </span>
    <span className="visually-hidden">{label}</span>
  </span>;
}
