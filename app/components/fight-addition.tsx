import styles from './fight-addition.module.css';
import type { FightAddition } from '../lib/figure-marks';
import { formatNumber } from '../lib/formatting';
import type { StatFigure } from '../lib/monster-stats';
import type { GeneralSettings } from '../lib/types';

/**
 * **What the fight adds to a stat**, after the figure the monster's panel shows:
 * `(+1,234)`, or `→ 100` where a guaranteed crit lifts CRI Rate, with every
 * source named on hover and to a screen reader.
 *
 * The box holds the widest addition its stat can carry whether or not one is
 * shown, so a lead or a setting that changes it never moves the figure before
 * it or a column of figures out of line (`AGENTS.md` §2). Muted rather than
 * gold: it is a fact, not something to act on (§5).
 */
export function FightAdditionText({ stat, addition, general }: {
  stat: StatFigure;
  addition: FightAddition | null;
  general: GeneralSettings;
}) {
  const text = addition === null ? ''
    : addition.raisedTo !== null ? `→ ${formatNumber(addition.raisedTo, general)}`
      : addition.amount === 0 ? '' : `(+${formatNumber(addition.amount, general)})`;
  return <span className={styles.addition} data-stat={stat} title={text === '' ? undefined : addition?.reading}>
    {text === '' ? null : <>
      <span aria-hidden="true">{text}</span>
      <span className="visually-hidden">{`${text.replace('→', 'raised to')} in battle: ${addition?.reading}`}</span>
    </>}
  </span>;
}
