# The engraving statistics — what they are and what binds them

**Status:** Binding project rules for `app/data/engraving-statistics.json` and the defaults read from it
**Reviewed:** October 20, 2026
**Collected by:** `scripts/collect-engraving-statistics.mjs`
**Read by:** `app/lib/monster-defaults.ts` (all three panels, as the preference
defaults), `app/lib/artifact-preferences.ts` (the artifact scoring defaults),
`app/lib/monster-usage-statistics.ts` (the game statistics overlay, §11)
**Held by:** `npm run verify:statistics-tiers`, `npm run verify:monster-defaults`

---

## 1. What the data is

The game's **Monster Info → Statistics** panel reports what the wider player
base engraves on a monster. Three panels sit behind one monster, and JASWA
records all three:

| Command | Panel | Response |
| --- | --- | --- |
| `getUnitStatsRuneInfo` | Rune Engraving Statistics | `runeset`, `primary_effect`, `secondary_effect` |
| `getUnitStatsArtifactInfo` | Artifact Engraving Statistics | `primary_effect`, `secondary_effect` |
| `getUnitStatsRelicInfo` | Relic Engraving Statistics (since v9.2.8, 2026-07-29) | `primary_effect`, `secondary_effect` |

**One call covers a whole panel's dropdowns**, so a monster costs three
requests. An artifact response carries the main figures and both sub views:
`secondary_effect` splits on `slot_id`, `1` the game's "Sub Prop. (Attribute)"
tab and `2` "Sub Prop. (Type)".

**Counts, not percentages.** Every row is `{ slot_id?, effect_id, count }`; the
displayed percentage is the count over its own group's total. The dataset stores
counts, because a share without its sample size is not evidence. Every stored
count reproduces the game's displayed percentage exactly.

**Nothing is truncated except `runeset`.** The effect distributions arrive whole
(46 artifact sub rows, 23 per slot); the panel's *Others* row is presentation.
**The rune-set list is the game's top ten**: across 1,044 captured monsters it
never exceeds ten rows (mean 9.8), summing to a median 74 % of the same
monster's slot-2 main total. A set share is therefore a share *of the builds
that reached the top ten* — what the game's panel shows, and the only honest
denominator. `RuneSetShareBasis` names that basis in the type.

**Every rune main is read**, flat `HP +`, `ATK +` and `DEF +` (ids 1, 3, 5)
included, in `rune-slot-mains.ts`'s vocabulary. `RuneMainStat` stays the
Clean-up roles' own.

**A rune build's share is the game's.** Each `runeset` row is one combination;
the game statistics overlay shows its count over the list's total
(`Violent/Revenge 28 %`), a partition summing to one. The per-set participation
rate behind the defaults (§10) is a separate reading and is not shown.

**Keyed on `unit_master_id`, never `unit_id`.** One row per monster *type*, so
two owned copies can never report different statistics.

**Three `effect_id` vocabularies, never one lookup.** Rune primary and secondary
are `1`–`12` (`RUNE-CANONICAL.md` §2); artifact and relic primary are
`100`/`101`/`102` for HP/ATK/DEF; artifact secondary is the `2xx`/`3xx`/`4xx`
space of `ARTIFACT-CANONICAL.md` §15.4; relic secondary is the unique-property
space `1`–`16` of `RELIC-CANONICAL.md` §4, deliberately **not** the rune one.

## 2. Capture is observation, never a request JASWA makes

The helper is a passive decrypting proxy on traffic the game itself initiates.
JASWA has no route to ask the server anything, and capture adds no traffic: the
only requests are the ones the game makes because the user opened a panel.

The cost is the user's time — three panel visits per type — never server
exposure. **Any design that synthesises requests to fill the dataset faster is
out of bounds.**

The traffic log holds account data in the clear, including the session keys the
import strips. It stays on the user's computer; nothing but the statistics
responses enters the repository.

## 3. PvE only, and `favorite_type` is not about favourites

**`favorite_type` selects between two statistical models: `0` PvE, `1` RTA.
JASWA captures PvE**, for artifacts and relics alike, because that is what most
of an account's gear is built for and it rests on far more observations (41,861
against 4,961 on Onmyouji). The field is a generic "which list" switch the same
API reuses for emoji packs; a monster in neither favourite list still sent `0`
outside RTA and `1` inside. **Do not name it after favourites in JASWA's code.**

Relics have one model: `getUnitStatsRelicInfo` never sends the field, and its
response was byte-identical inside and outside RTA. `request_type: 3` is constant
and unexplained; nothing may depend on it.

## 4. One row per monster type, at its highest awakening

**A `unit_master_id` ends `<tier><element>`.** The last digit is the element
(1–5); the second-to-last the awakening tier, each tier a separate id with its
own statistics.

| Tier digit | Meaning | Example |
| ---: | --- | --- |
| `0` | un-awakened | `20802` Frankenstein |
| `1` | awakened (1A) | `17911` Beth, `20812` Bulldozer |
| `3` | second awakened (2A) | `20832` Bulldozer 2A |

**The capture list** (`captureList` in the collector) is every catalogue
monster at tier 3, plus every tier-1 monster with no 2A, once per species
(a collaboration pair counts once, §8). It leaves out:

- tiers `0`, `2` (the Imperfect line) and `4`–`7` (Ancient Spirits, guild
  bosses, Towers);
- catalogue archetype `none` or missing — rows no player fields, such as the
  Ancient Spirit line, whose ids reuse the tier digit;
- catalogue archetype `Material` (Angelmon, Rainbowmon, Devilmon and kin);
- Korean-named test rows.

The id's length is deliberately not a test: Homunculus carries seven-digit ids.

**Leaving Material monsters out is the capture's scope, not a game rule.**
Nobody engraves fodder, so their panels hold nothing to measure; whether the
game forbids gear on them is not established. The relic plan's own Material
policy is `RELIC-CANONICAL.md` §11.5.

**2A is a separate monster.** Bulldozer 2A returns a distribution 1A does not,
and both are named "Bulldozer", so only the id separates them.

**Tier 0 is never collected**: what players park on an un-awakened monster
describes the parking. **The game never serves a lower tier at all** (measured
2026-09-01 over 685 monsters: no request at tier 0, none at tier 1 where a 2A
exists, every mismatch with the recommend call running upward, `24702 →
24712`). Read the id from the `getUnitStats*Info` request itself, never from the
neighbouring `GetUnitRecommendPage_V2`.

**It is guarded anyway.** Two tiers of one monster stored side by side would be
two unrelated monsters, each claiming to be it — counted, usable and wrong
(`AGENTS.md` §0.1). The collector detects the collision, keeps the higher tier
(tier outranks recency) and reports it.

## 5. An empty panel is not a capture

**A panel answered with an empty distribution is rejected, not stored.** The
monsters that can never awaken return `ret_code 0` with both effect lists empty
(23 of 23 such responses, against 6 of 2,421 at tier 1 or 3). The rule is written
against the empty response rather than a star rating, because that is what the
traffic carries, and it also leaves the few relic panels nobody fills honestly
incomplete. A stored empty panel would be counted while holding nothing usable
(`AGENTS.md` §0.1).

## 6. Every observation is dated, and coverage is staged

The game recomputes these statistics monthly. **Every panel carries its own
`observedAt`**, and the file carries `observedFrom`, `observedTo` and
`lastMergedAt`; a recapture can target stale rows. Collection runs in stages
against the capture list, and a type without a row is simply not judged
(`ARTIFACT-CANONICAL.md` §19.5): the workspace works at four types and better at
all of them.

## 7. The traffic log is a buffer; the dataset is the archive

The helper clears the log at the start of each recording, so **run the merge
before switching recording on again.**

```
node scripts/collect-engraving-statistics.mjs --todo 40   what to capture next
… capture those monsters in the game, with logging on …
node scripts/collect-engraving-statistics.mjs             merge the session
node scripts/collect-engraving-statistics.mjs --progress  how far it has got
```

The merge is additive and idempotent and makes no network request. **It
refuses**, counting and explaining each on stdout: an RTA row (`favorite_type:
1`), an un-awakened or unrecognised tier, a `ret_code` other than `0`, an empty
panel, and a missing or malformed counts list. The file is one line per monster
type (indented JSON costs 2.6× the bytes, and a line per type keeps a session's
diff readable).

## 8. A collaboration pair is one monster

The game serves byte-identical distributions for a collaboration monster and its
generic twin (all 112 pairs captured on both sides), so the two rows are one
observation seen twice. They are pooled at read time by taking the later row,
never summed — `MONSTER-SPECIES-DECISION.md` owns the rule.

## 9. What the verifiers check

`npm run verify:statistics-tiers` re-checks the stored dataset: no row at an
excluded tier, no two tiers of one monster, no empty panel. Run it after every
capture session and every change to the collector. `npm run
verify:monster-defaults` holds §10's figures, so a recapture cannot quietly move
what a cut means.

## 10. How the panels become defaults

The panels supply the **provisional preferences** a monster starts from in the
overlay (`monster-defaults.ts`). A default is a starting value the user
overwrites; a stated answer always wins (`ARTIFACT-CANONICAL.md` §19.4).

**The rule:** a share is a count over its own distribution's total, and each cut
is chosen relative to the distribution's size, then measured across all captured
monsters (1,044 with rune and artifact panels, 1,035 with relic panels). No
panel leaves a captured monster with nothing. `defaultThresholds` holds every
cut in one table and `classifyShare` is the one classifier.

| Panel | Values | Preferred | Acceptable | Yields |
| --- | ---: | --- | --- | --- |
| Rune slot main (2, 4, 6) | 7–8 | ≥ 40 % | ≥ 10 % | ~1.0 preferred per slot |
| Rune set | ~7 | ≥ 35 % | ≥ 12 % | ~2.0 preferred |
| Artifact main | 3 | ≥ 40 % | ≥ 10 % | reference only |
| Artifact sub (overlay) | 23 | ≥ 6 % | — | 3.6 on average |
| Relic main | 3 | ≥ 40 % | ≥ 10 % | reference only |
| Relic unique | 16 | ≥ 15 % | ≥ 6.25 % | ~1.2 preferred |

- **Rune slot main** keeps the three-value cuts despite seven or eight values:
  a slot holds one rune, and at 40 % each slot averages almost exactly one
  preferred main, because a slot's leader routinely takes half of it.
- **Rune set** shares are *participation rates* — a two-set build votes for
  both, so they sum to about 1.7 — and a monster carries two sets, so the
  answer is about two preferred: 35 % yields 1.96 where 40 % gives 1.67 and
  30 % 2.30. It also absorbs the top-ten inflation of §1. A set the table gives
  no piece count throws rather than being guessed.
- **Artifact and relic mains are not defaults.** Every gear main defaults to
  the main-stat model (`MAIN-STAT-MODEL.md`); these shares stay on the game
  statistics overlay as reference.
- **Artifact sub** has a separate, stricter scoring cut (10 % / 5 %,
  `ARTIFACT-CANONICAL.md` §19.3); the overlay's single 6 % band is what this
  table holds. A second overlay band would hold fourteen of twenty-three
  properties and distinguish nothing.
- **Relic unique** has sixteen values, so chance is exactly 6.25 % — the
  acceptable cut; preferred at 15 % is 2.4× chance, the multiple the artifact
  scoring cut uses. Artifact's 10 % / 5 % was measured here and is too loose
  (3.24 acceptable per monster).

**Why the relic panel is a fair default and an unfair judgement.** Relics are
new and an account engraves what it happened to craft, so the panel's global
level mostly records the drop table — which is why the synergy table is
hand-written (`RELIC-CANONICAL.md` §5.2). But drops are monster-independent, so
the *variation between monsters* is real signal, and a default exists to be
overwritten. **The caveat stands**: the main half carries monster-specific
signal (HP leads on 546 types, ATK on 422, DEF on 49), the unique half little —
Nimble Primal leads on 974 of 1,017 captured relic panels. Accepting that
default accepts population habit, not knowledge about the monster. A relic
default never enters the relic plan's score (`RELIC-CANONICAL.md` §11.5).

## 11. Where the panels are shown

**The shares have one place on screen: the game statistics overlay**
(`app/components/monster-statistics-overlay.tsx`). The monster profile and
Rune Optimization each carry one *Statistics* button that opens it over
the page — on the profile beside the monster's own facts, since the figures are
about the species, and on Rune Optimization after *Reset to profile*, under the
monster it is about; neither shows a share beside its own fields any more, because a
share sitting next to a choice leans on it, and the profile's answers are the
user's while these figures are the game's.

The overlay says so before anything else — the eyebrow reads *Game
statistics* — and then shows only the shares: no facts row, no sample counts.
It shows every panel the dataset holds:

| Card | Reads | Share of |
| --- | --- | --- |
| Builds | `runeset` | the game's top-ten list (§1) |
| Slot 2, 4, 6 | `primary_effect` by slot | that slot's runes |
| Sub properties | rune `secondary_effect`, all six slots | every sub line |
| Attribute and Type artifact | artifact `primary_effect` and `secondary_effect` by slot | that piece's mains and sub lines |
| Relic | relic `primary_effect` and `secondary_effect` | relics and their uniques |

A rune sub property is a share of **lines**, not of runes: the panel's sub
totals are not four lines per rune for every monster, so nothing may divide by
a rune count it does not state. Artifact sub properties and relic uniques keep
their six leaders and fold the rest into *Others*, as the game's panel does.
A share is a figure only, with no bar behind it. A species with no captured panel says so in one line; a
missing panel inside a captured one reads *Not captured* in its card.
