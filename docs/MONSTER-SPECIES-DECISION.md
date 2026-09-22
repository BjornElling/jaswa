# Collaboration statistics and monster identity are separate rules

**Status:** Binding project rule — the identity rule every general statement
about a monster rests on
**Settled:** September 1, 2026, against 112 pairs captured on both sides
**Enforced by:** `npm run verify:collaboration-species`
**Implemented in:** `app/lib/monster-species.ts`, `app/data/collaboration-species.json`

---

## The rule

**A documented collaboration monster and the generic unit the game re-released
it as may share one *statistics species*. That key is used only where the game
serves one captured population: statistics, default preferences and score
matrices. A player's owned copy keeps its own monster identity.**

The species representative is the **generic** id, because it outlives the event.
`app/data/collaboration-species.json` holds the 282 documented classes across 571 master
ids. In a general context the pair is shown once, under both of its names:

```
RYU / Moore
```

## Why the game itself settles it

For all 112 pairs captured on both sides, the two ids return **byte-identical**
engraving distributions, down to the last count. They are not two samples of a
comparable monster — they are one population served under two names.

That is why the merge **takes one row rather than summing**. Summing would
double every count and claim twice the evidence that exists.

## Why the duties split the way they do

The split follows from what each identifier means. `unit_master_id` is what the
game calls *this copy*; the statistics species is only the population key behind
captured data. Storage, fodder and row merging use the canonical monster
identity and skill-up family instead. Those follow the catalogue's own awakening
lineage and raw family id, so a collaboration line and a generic line never
become one owned monster merely because the statistics table relates them.

Choco Knight and Madeleine Cookie are an explicit non-pair. They are separate
monster families, and no Choco Knight copy may make a Madeleine Cookie copy a
duplicate for fodder or quantity purposes. The same ownership rule applies to
every other collaboration pairing in the table.

## Pooling happens at read time

The dataset on disk stays a faithful record of what was observed under each
name. `app/lib/artifact-preferences.ts` resolves the species when it reads, and
takes the later observation of the two. This keeps 3.9 MB of history honest and
lets a corrected pairing take effect without a migration.

## Unresolved pairs are recorded as pending

Unawakened collaboration monsters carry Korean placeholder names in the
catalogue, so a species falls back to the generic name alone rather than pairing
a readable name with an unreadable one.

Jujutsu Kaisen's five pairs are *pending*: the collaboration side is in the
catalogue and the `Exorcist Association *` generics are not. The verifier fails
once they appear, so the table is completed rather than forgotten.

## What the verifier checks

`npm run verify:collaboration-species` proves each class internally consistent:
its members exist in the catalogue, share an element and an awakening tier, and
agree on `archetype`. Archetype is the load-bearing check, because it does not
follow from the id — agreement across a pair is therefore real evidence that the
pairing is right. It also reports when a pending pair can be resolved.

Run it after every catalogue refresh.
