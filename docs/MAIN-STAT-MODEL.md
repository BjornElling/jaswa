# Main-stat model

**Status:** Binding
**Reviewed:** October 20, 2026
**Code:** `app/domain/combat/main-stat-model.ts`
**Check:** `npm run verify:main-stat-model`

Which main stat — HP, ATK or DEF — a monster's artifacts and relic should
carry, worked out from what the monster needs rather than from what other
players engrave. This document is the rule; the module is its only
implementation.

**Where the answer comes from, in order:**

1. **The owner's own answer**, where it prefers at least one main
   (`honouredMainStat`). Its preferred and accepted bands are the whole answer.
2. **The copy's six runes**, where it has a finished build engraved.
3. **The game's rune statistics** for its species.

The model computes 2 and 3; 1 replaces them (§5).

---

## 1. The premise

The stat a monster's runes must lift furthest above its base is the stat hardest
to reach with runes. Every point a piece of gear supplies on that stat is a
point the runes no longer have to find, and points on the hardest stat are the
scarcest. So the main worth most is the one that relieves the largest need.
**Modelled:** this is JASWA's premise, not a game rule.

## 2. The need

The need is how far HP, ATK and DEF are lifted above base, **in percent of
base** — the common scale, because a rune's HP %, ATK % and DEF % lines roll from
identical ranges. It is read from the first source that can say
(`copyMainStatNeed`):

| # | Source | Used when | Need per stat |
| --- | --- | --- | --- |
| 1 | **Runes** (`basis: 'runes'`) | the copy has six runes, one per slot | everything the six runes add through `monsterEffects` — slot-2/4/6 mains at their +15 values, innates, subs, grinds and the bonuses of the sets those runes complete (own team sets and Intangible completion included) — except the fixed mains of slots 1, 3 and 5. A flat line is converted against the copy's own base. |
| 2 | **Statistics** (`basis: 'statistics'`) | no finished build | the species' rune panel (`monster-defaults.ts`, `mainStatNeed`): each slot-2/4/6 % main at its six-star +15 value times its share of that slot, plus each % sub line at a mean initial roll plus one mean power-up roll, times the number of such lines an average build carries. |

- A need is never negative. A source whose three needs are all zero says
  nothing and the next is tried; where none can, the model gives no answer and
  nothing is defaulted or marked.
- An unfinished slot-2/4/6 rune counts its deterministic +15 main, at its own
  star class (an Ancient rune, class 16, reads as six-star). Future sub reveals
  and rolls are not projected. The displayed stats and a relic's source still
  use the current value.
- **The fixed mains are excluded.** Slots 1, 3 and 5 always carry flat ATK, DEF
  and HP; counting them adds about the same quarter of base to all three and
  flattens every answer towards a tie.
- **A chosen main counts twice** (`chosenMainWeight` = 2), in both sources. A
  slot-2/4/6 main is the one line of a rune its owner picks; a sub, an innate, a
  grind's target and a set's bonus come with whatever rolled, and count once.
  Counted alike, a damage dealer whose subs happened to roll HP read as half a
  tank: Shaina's ATK % slot-6 main and three ATK % subs came to 131 % against
  111 % from five HP % subs, and the relic plan gave her an HP relic. At 2 that
  build reads ATK 194 % against HP 111 %. Not more than 2, because a +15 main
  already carries 63 %, about ten sub rolls' worth: doubling it makes the
  choice decisive over incidental rolls without letting one main erase subs
  collected on purpose. The runes source reads the mains as the build's lift with
  them less its lift without them, so every other line is counted once, by the
  one effect engine. **Modelled:** JASWA's judgement, not a game rule.
- **The two sources differ in what they can see.** The statistics source counts
  no set bonus, no grind and no flat line: the panel reports sets only as a
  top-ten list of builds and no grinds at all, and a flat line needs a base the
  species does not have. A copy on its statistics reads exactly as its species
  does, so the two cannot disagree for a reason unrelated to the copy. The
  runes source counts all three, because they are part of the build engraved.
- **Nothing outside the runes enters.** Artifacts, relics, leads, buildings and
  stat targets are not part of the need. A stat target is a floor a build must
  clear, not a statement of what it is for; the figure a build is built around
  usually has no floor at all.

## 3. The worth of a main on a piece

```
worth[stat] = need[stat] × relief[stat]
```

`relief` is how much of that stat the piece's main supplies, in the same percent
of base:

- **A relic** grants the same percentage of base whichever main it is, so relief
  cancels and a relic's answer is the need's own order.
- **An artifact** grants a fixed amount (`artifactMainValue`: 1,500 HP, 100 ATK,
  100 DEF). Its relief is that amount over the copy's base: 100 DEF on a 500-DEF
  monster relieves 20 %, 1,500 HP on 12,000 HP relieves 12.5 %. A species has
  no base, and there the three are taken as equal.

Multiplying by the need is the premise's convexity: the last points of a large
need are the hardest to find. Both artifact categories carry the same three
mains, so the model answers them alike.

## 4. The bands

Each main's worth over the best main's worth (`mainStatCuts`):

| Share of the best | Band |
| --- | --- |
| ≥ 80 % | preferred |
| ≥ 50 % | acceptable |
| below | not wanted |

The best main is always at 100 %, so **every answer has a preferred main**. 80 %
because a need off engraved runes moves by a sub roll or two with every rune
swapped, and needs within a fifth of each other are a tie in that noise; 50 %
because a main worth half the best still takes real work off the runes.

Worked examples (relic, so worth is the need's own order):

- HP 80, ATK 10, DEF 10 → HP preferred; ATK and DEF at 12.5 % not wanted.
- HP 40, DEF 40, ATK 20 → HP and DEF preferred; ATK at 50 % acceptable.

## 5. Where the answer is used

- **Defaults.** Where a copy has no honoured main answer, its artifact mains and
  relic main default to the model's answer for that copy, through
  `resolveMonsterPreferences`. Two emptied bands are no answer and are not
  stored (`ARTIFACT-CANONICAL.md` §19.4). The population's
  main-stat shares are reference on the overlay only
  (`ENGRAVING-STATISTICS.md` §10).
- **Artifact scoring.** A species row is scored on the model's statistics
  answer (`speciesMainStatAdvice`). An owned copy whose own answer differs gets a
  row of its own, as a copy with stated preferences does
  (`ARTIFACT-CANONICAL.md` §19.2). Both readers take the main through
  `copyArtifactMainBands`.
- **Relic plan.** `relic-monster-value.ts` weights a relic's main and unique by
  the need's shares (`RELIC-CANONICAL.md` §11.1).
- **The advice mark.** On the overlay, a stated main that **contradicts** the
  model (`contradictsAdvice`) carries a yellow mark after the row's name, its
  tooltip naming the suggested mains and their source. A contradiction is a main
  stated preferred that the model calls not wanted (or the reverse), or two
  mains in opposite order; moving one main a single band is the owner's call.
  The mark informs; it never overrides.
- **The no-preferred mark.** Mains accepted with none preferred are not an
  answer (`mainStatStatement`: `no-preferred`): they are kept as typed and
  ignored — the model decides — and the row carries a red mark asking for a
  preferred main.

## 6. One stated answer, two pieces

The owner states one main answer for all gear (`ARTIFACT-CANONICAL.md` §19.2),
while the model can answer an artifact and a relic one band apart on a monster
with lopsided bases. The contradiction rule makes that livable: an answer placing
both stats in the two bands contradicts neither piece, and the mark names only
the pieces it contradicts.
