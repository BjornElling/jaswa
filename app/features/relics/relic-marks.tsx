import { relicMaximumDurability } from '../../domain/relics/relic-properties';
import { relicSynergyBandLabels } from '../../domain/relics/relic-synergy';
import type { RelicSynergyBand } from '../../domain/relics/relic-synergy';
import type { RelicLevelState } from '../../domain/relics/relic-grid';

/**
 * The marks the relic table reads by.
 *
 * Every one of them occupies the same box in every state it can be in. A cell
 * that gained or lost a glyph as its value changed would re-measure its column
 * and move the row beside it, which is the movement `AGENTS.md` rule 2 forbids
 * — so an unused slot is hidden rather than removed, and a state with nothing
 * to say still reserves its space.
 */

/**
 * One shape per band, and one mark only.
 *
 * Degree was once the number of marks — two gold stars against one — and a
 * column of gold read as gold before it read as two, so Excellent drowned in
 * Good. Each band now owns a shape. The star is the only filled one, so the top
 * band carries the most ink without needing a second copy of itself.
 */
const bandPaths: Record<RelicSynergyBand, string> = {
  excellent: 'M8 1.6 10 6.2 15 6.6 11.2 9.9 12.4 14.8 8 12.2 3.6 14.8 4.8 9.9 1 6.6 6 6.2z',
  good: 'M3 8.6 6.4 12 13 4.4',
  niche: 'M8 2.5 13.5 8 8 13.5 2.5 8z',
  /* A thumb down: the hand as one outline, a long thumb and a short cuff
     stroke. Finger lines are noise at 14px; without the cuff the hand reads
     as a flag. */
  poor: 'M3.6 1.8H10A1.2 1.2 0 0 1 11.2 3V7.6A1 1 0 0 1 10.2 8.6H8.6L8.2 13.2A1.3 1.3 0 0 1 5.6 13.2L5.7 8.6H3.1A1 1 0 0 1 2.1 7.4L2.4 2.9A1.2 1.2 0 0 1 3.6 1.8zM13.6 2V8.2',
  trash: 'M4 4 12 12M12 4 4 12',
};

function SynergyGlyph({ band }: { band: RelicSynergyBand }) {
  return <span className="relic-mark-slot" aria-hidden="true">
    <svg className="relic-mark relic-mark-synergy" data-band={band} viewBox="0 0 16 16" focusable="false">
      <path d={bandPaths[band]} />
    </svg>
  </span>;
}

/**
 * A relic's fit, as the band's mark and its name.
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
    <SynergyGlyph band={band} />
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
