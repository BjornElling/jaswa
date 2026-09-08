# A collaboration monster and its generic re-release are one species

**Status:** Binding project rule — the identity rule every general statement
about a monster rests on
**Settled:** September 1, 2026, against 112 pairs captured on both sides
**Enforced by:** `npm run verify:collaboration-species`
**Implemented in:** `app/lib/monster-species.ts`, `app/data/collaboration-species.json`

---

## The rule

**A collaboration monster and the generic unit the game re-released it as are
one *species*. Everything that speaks about monsters in general is keyed on the
species — statistics, default preferences, score matrices, rankings. A player's
own copy keeps its `unit_master_id` and the name the game gave it.**

The species representative is the **generic** id, because it outlives the event.
`app/data/collaboration-species.json` holds the 292 classes across 591 master
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
game calls *this copy*; the species is what the monster *is*. So a roster row
must keep the licensed name the player actually summoned, while a ranking must
not list the same monster twice — holding both halves of a pair is holding one
monster twice over, and scoring it twice would rank that result above everything
it ties with.

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
