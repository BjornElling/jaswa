/**
 * The eight stats' names on screen, in two lengths and nowhere else.
 *
 * A grid heading has a column's width to fit in, so it takes the short form —
 * `CR%` — and prose, a mark's reading, a lead or a tag takes the form the game's
 * own rune screen writes — `CRI Rate`. The same stat once read `CRI Rate` in one
 * place and `CR%` beside it in another for want of a single list. The role
 * vocabulary (`roleTargetColumns`, `CtR%`) is a third spelling the role editor
 * stores and matches on, and is not one of these.
 */
export type StatKey = 'hp' | 'atk' | 'def' | 'spd' | 'criRate' | 'criDmg' | 'res' | 'acc';

/** Column headings over a grid of figures. */
export const statGridLabels: Readonly<Record<StatKey, string>> = {
  hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD', criRate: 'CR%', criDmg: 'CD%', res: 'RES%', acc: 'ACC%',
};

/** A stat named in a sentence, a tag or a mark. */
export const statLabels: Readonly<Record<StatKey, string>> = {
  hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD', criRate: 'CRI Rate', criDmg: 'CRI Dmg', res: 'RES', acc: 'ACC',
};
