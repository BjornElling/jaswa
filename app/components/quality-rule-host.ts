import styles from './quality-rule.module.css';

/** The class a cell hosting a `QualityRule` needs: it positions the rule and
 * leaves the gap the rule sits in. Exported so a caller adds it to a `td` it
 * already styles rather than nesting another element inside the cell.
 *
 * It lives apart from the component because a module that exports anything
 * but components cannot be Fast Refreshed: every edit to the rule would reload
 * each table that draws one. */
export const qualityRuleHost = styles.host;
