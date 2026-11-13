/**
 * The one reason given wherever Always synchronized turns a control off. Live
 * sync puts the game's own state back at once, so the control is not the
 * user's to use; every such control says so in these same words, rather than
 * each telling the user which other mode to choose.
 */
export const alwaysSynchronizedReason = 'Always synchronized is on, so this comes from the game.';
