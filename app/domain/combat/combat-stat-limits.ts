/** Fandom's Guide: Accuracy and Resistance gives the check a 15 % resistance floor. */
export const resistanceFloorPercent = 15;

/** ACC and RES stop here, independent of a user's requested range. */
export const percentStatCap = 100;

/** Beyond this Accuracy even maximum player Resistance is at its unavoidable floor. */
export const usefulAccuracyCap = percentStatCap - resistanceFloorPercent;
