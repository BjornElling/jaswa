import styles from './quality-rule.module.css';
import type { QualityTier } from '../domain/shared/quality-tiers';

const tierClass: Record<QualityTier, string> = {
  Normal: styles.normal,
  Magic: styles.magic,
  Rare: styles.rare,
  Hero: styles.hero,
  Legend: styles.legend,
};

/**
 * A tier shown as a discreet coloured rule down the left edge of its cell.
 *
 * The colour is the whole signal and it carries no text, so the tier is named
 * for a screen reader and on hover instead. That is deliberate rather than a
 * concession: a colour nobody can name is decoration, and this one has to
 * answer "which tier?" when the user asks it directly.
 *
 * Why a rule at all, when `ARTIFACT-CANONICAL.md` §18 removed grade colour: see
 * the note in `quality-rule.module.css`. In short, §18 rejected painting the
 * grade *word* in a dense table; this stays out of the reading line entirely.
 */
export function QualityRule({ tier }: { tier: QualityTier }) {
  return <span className={`${styles.rule} ${tierClass[tier]}`}
    role="img" aria-label={`${tier} quality`} title={`${tier} quality`} />;
}
