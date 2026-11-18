/** What Rune Clean-up says to do with a rune: the vocabulary a user's hold is stated in too.

    `reapp` and `refine` are never the engine's own answer: only the user's re-app and
    refine targets (`rune-reapp-targets.ts`) put them on a rune, through `withRuneSellProtection`. */
export type RuneVerdict = 'power-up' | 'keep' | 'reapp' | 'refine' | 'sell' | 'unavailable';
