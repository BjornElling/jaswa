# Main-stat model

**Status:** Binding
**Decided:** October 7, 2026
**Code:** `app/lib/main-stat-model.ts`

Which main stat — HP, ATK or DEF — a monster's artifacts and relic should
carry, worked out from what the monster needs rather than from what other
players happen to engrave. This document is the rule; the module is its only
implementation.

**Where the answer comes from, in order:**

1. **The owner's own answer**, where it prefers at least one main. Its preferred
   and accepted bands are the whole answer.
2. **The copy's six runes**, where it has a finished build engraved.
3. **The game's rune statistics** for its species.

The model computes 2 and 3; 1 replaces them (§5).

---

## 1. The premise

The stat a monster's runes must lift furthest above its base is the stat
hardest to reach with runes. Every percentage point a piece of gear supplies on
that stat is a point the runes no longer have to find, and points on the
hardest stat are the scarcest. So the main worth most is the one that relieves
the largest need.

## 2. The need

The need is how far HP, ATK and DEF are lifted above base, **in percent of
base**. Percentages are the common scale because a rune's HP %, ATK % and DEF %
lines roll from identical ranges: one point of any of them costs the runes the
same.

It is read from the first of two sources that can say:

| # | Source | Used when | Need per stat |
| --- | --- | --- | --- |
| 1 | **Runes** | the copy has six runes engraved, one per slot | everything the six runes add — slot-2/4/6 mains, innates, subs, grinds and completed-set bonuses — except the fixed flat mains of slots 1, 3 and 5. A flat line is converted against the copy's own base. |
| 2 | **Statistics** | no finished build | the game's rune panel for the species: each slot-2/4/6 % main at its +15 value times its share of that slot, plus each % sub line at its expected +12 worth times how often a build carries it. |

A need is never negative. A source whose three needs are all zero cannot say
anything, and the next one is tried. Where none can, the model gives no answer
and nothing is defaulted or marked.

**Why the fixed mains are excluded.** Slots 1, 3 and 5 always carry flat ATK,
DEF and HP whatever the build is for. Counting them adds roughly the same
quarter of base to all three stats and so flattens every answer towards a tie,
while saying nothing about what the build was chosen to do.

**Why the statistics leave flats out.** Converting a flat line needs the base
stat it adds to, and a species has no single base. A copy that falls back on its
species' statistics reads them exactly as the species does, so the two cannot
disagree for a reason that has nothing to do with the copy.

**Stat targets are not a source.** They were, between the runes and the
statistics, and were removed: a target is a floor a build must clear, not a
statement of what the build is for. The figure a copy is really built around is
usually the one it maximises once its floors are met, and that one rarely has a
floor at all — so a need read off the floors misses exactly the stat that
matters most, and the answer turned on how many floors happened to be typed.

## 3. The worth of a main on a piece

```
worth[stat] = need[stat] × relief[stat]
```

`relief` is how much of that stat the piece's main supplies, in the same
percent of base:

- **A relic** grants a percentage of base — the same percentage whichever of the
  three it is. Relief cancels, and a relic's answer is the need's own order.
- **An artifact** grants a fixed amount: 1,500 HP, 100 ATK or 100 DEF. Its relief
  is that amount over the copy's base, so 100 DEF on a 500-DEF monster relieves
  20 % where 1,500 HP on a 12,000-HP one relieves 12.5 %. A species has no base,
  and there the three are taken as equal.

Multiplying by the need rather than adding is the convexity in the premise: the
last points of a large need are the hardest the runes find, so a point of relief
there is worth more than one on a stat barely lifted at all.

Both artifact categories carry the same three mains at the same values, so the
model answers the Attribute and the Type artifact alike by construction.

## 4. The bands

Each main's worth is divided by the best main's worth:

| Share of the best | Band |
| --- | --- |
| ≥ 80 % | preferred |
| ≥ 50 % | acceptable |
| below | not wanted |

The best main is always at 100 %, so **every answer has at least one preferred
main**. 80 % because a need measured off engraved runes moves by a sub roll or two
with every rune swapped, and two needs within a fifth of each other are a tie
inside that noise. 50 % because a main worth half the best still takes real work
off the runes; below that it is a concession.

Worked examples (relic, so worth is the need's own order):

- HP 80, ATK 10, DEF 10 → HP preferred; ATK and DEF at 12.5 % are not wanted.
- HP 40, DEF 40, ATK 20 → HP and DEF preferred; ATK at 50 % acceptable.

## 5. Where the answer is used

- **Defaults.** Where a copy has no honoured main answer (`honouredMainStat`:
  at least one preferred main), its artifact mains and its relic main default to
  the model's answer for that copy, through `resolveMonsterPreferences`. Two
  cleared bands are no answer, and the model decides. The population's main-stat shares are no longer a
  default; they remain on the overlay as reference.
- **Artifact scoring.** A species row is scored on the model's statistics answer
  for that species. An owned copy whose own answer differs — because its runes
  say something its species' statistics do not — gets a row of its
  own, exactly as a copy with stated preferences does (`ARTIFACT-CANONICAL.md`
  §19.2). Both readers take the main through `copyArtifactMainBands`.
- **Relic plan.** `relic-monster-value.ts` weights a relic's main and unique by
  the need's shares (`RELIC-CANONICAL.md` §11.1). It no longer computes a need of
  its own.
- **The advice mark.** On the overlay, a stated main that **contradicts** the
  model carries a yellow info mark after the row's name, whose reading says what
  the copy needs and what the model would choose. A contradiction is a main
  stated preferred that the model calls not wanted (or the reverse), or two mains
  ranked in opposite order. Moving one main a single band is the owner's call and
  is not marked. The owner's answer still stands — the mark informs, it never
  overrides.
- **The no-preferred mark.** Mains accepted with none preferred are not an
  answer: an accepted main is one taken when nothing preferred is to hand, and
  here nothing ever is. They are kept as typed and ignored — the model decides —
  and the same row carries a red mark asking for a preferred main. Red, not
  yellow, because the answer is incomplete rather than merely debatable.

## 6. One stated answer, two pieces

The owner states one main answer for all gear (`ARTIFACT-CANONICAL.md` §19.2),
while the model can answer an artifact and a relic one band apart on a monster
whose bases are lopsided. The contradiction rule is what makes that livable: an
answer placing both stats in the two bands contradicts neither piece. The mark
names only the pieces it contradicts.
