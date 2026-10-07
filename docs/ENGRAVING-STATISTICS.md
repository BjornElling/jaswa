# The engraving statistics — what they are and what binds them

**Status:** Binding project rules for `app/data/engraving-statistics.json`
**Settled:** August 30 – September 1, 2026, against live captures
**Collected by:** `scripts/collect-engraving-statistics.mjs`
**Enforced by:** `npm run verify:statistics-tiers`
**Read by:** `app/lib/monster-defaults.ts` (all three panels, as the preference
defaults) and `app/lib/artifact-preferences.ts`
**Held by:** `npm run verify:statistics-tiers`, `npm run verify:monster-defaults`

---

## 1. What the data is

The game's **Monster Info → Statistics** panel reports what the wider player
base engraves on a monster. Three panels sit behind one monster, and JASWA records
all three:

| Command | Panel | Response |
| --- | --- | --- |
| `getUnitStatsRuneInfo` | Rune Engraving Statistics | `runeset`, `primary_effect`, `secondary_effect` |
| `getUnitStatsArtifactInfo` | Artifact Engraving Statistics | `primary_effect`, `secondary_effect` |
| `getUnitStatsRelicInfo` | Relic Engraving Statistics | `primary_effect`, `secondary_effect` |

**One call covers a whole panel's dropdowns**, so a monster costs exactly three
requests. A single artifact response carries the Main Property figures *and*
both Sub Property views: `secondary_effect` splits on `slot_id`, where `1` is
the game's "Sub Prop. (Attribute)" tab and `2` is "Sub Prop. (Type)".

**Counts, not percentages.** Every row is `{ slot_id?, effect_id, count }` with
a raw occurrence count, and the displayed percentage is that count over its own
group's total. The dataset stores the counts, because the percentage discards
the sample size: a 30 % share drawn from 83,549 uses is not the same evidence as
30 % drawn from 12. Every stored count reproduces the game's own displayed
percentage exactly, which is how the shape was verified.

**Nothing is truncated — except `runeset`.** The panel's *Others* row and its
scroll limit are presentation only for the effect distributions; the response
carries the full distribution — 46 artifact secondary rows, 23 per slot.

**The rune-set list is the one exception, and the game truncates it.** Across all
1,044 captured monsters `runeset` never exceeds **ten rows** (mean 9.795), and
those rows sum to a median **74 %** of the same monster's slot-2 main total. The
collector copies the response verbatim, so this is the game's limit rather than
JASWA's. A share computed from it is therefore a share *of the builds that
reached the top ten* — which is what the game's own panel shows the player, and
the only honest denominator available: normalising against the main-stat total
instead would divide one population's counts by another's.
`RuneSetShareBasis` in `app/lib/monster-defaults.ts` names that basis in the type
so it cannot be forgotten at a call site.

**Every rune main is read.** The rune primary distributions include flat
`HP +`, `ATK +` and `DEF +` mains (effect ids 1, 3 and 5). They used to be
excluded, because the role vocabulary `RuneMainStat` has no word for them.
A monster's slots are now read in `app/lib/rune-slot-mains.ts`, which names all
seven or eight mains the game allows per slot, so the flat mains are counted,
shown under the slot and offered as a choice. `RuneMainStat` stays the Clean-up
roles' own.

**A rune build's share is the game's.** Each `runeset` row is one whole
combination with its count, and the monster overlay's Most common line shows
each combination's count over the list's total, as the game's panel does —
`Violent/Revenge 28 %`, a partition that sums to one. The per-set participation
rate behind the defaults is a separate reading and is not shown.

**All three panels are now read.** They supply the provisional preferences a
monster starts from in the monster overlay (`app/lib/monster-defaults.ts`).

Relic synergy remains a hand-written table (`RELIC-CANONICAL.md` §5), and §5.2
there now says why both are true at once: the panel is the wrong basis for an
account-wide *judgement*, because relics are new and an account engraves what it
happened to craft — but it is a legitimate basis for a per-monster *starting
value* the user overwrites, since drops are monster-independent and a
distribution that varies between monsters is not describing the drop table.

**Keyed on `unit_master_id`, never `unit_id`.** The dataset holds one row per
monster *type*, so the defaults it produces seed a per-type preference with no
mapping, and two owned copies can never report different statistics.

**Three separate `effect_id` vocabularies, which must not share a lookup
table.** Rune primary and secondary are `1`–`12` and match `RUNE-CANONICAL.md`
§2 exactly; artifact and relic *primary* are `100`/`101`/`102` for HP/ATK/DEF;
artifact *secondary* is the `2xx`/`3xx`/`4xx` space of
`ARTIFACT-CANONICAL.md` §15.4; relic secondary is a small-integer space of its
own that deliberately is **not** the rune one despite the overlap.

## 2. Capture is observation, never a request JASWA makes

The helper is a passive decrypting proxy on traffic the game itself initiates.
There is no route by which JASWA asks the server anything, and capture generates
no additional traffic: the only requests are the ones the game makes because the
user opened a panel. Recording is indistinguishable from ordinary play because
it *is* ordinary play.

The cost is therefore the user's time — three panel visits per monster type —
and never server exposure. **Any design that synthesises requests to fill the
dataset faster is out of bounds.**

The traffic log holds account data in the clear, including the session keys the
import strips. It stays on the user's computer, and nothing from it but the
statistics responses enters the repository.

## 3. PvE only, and `favorite_type` is not about favourites

**There are two statistical models per monster type, and `favorite_type` selects
between them: `0` is PvE, `1` is RTA. JASWA captures PvE**, for artifacts and
relics alike, because that is the mode most of an account's gear is
actually built for and it rests on far more observations — 41,861 against 4,961
on Onmyouji, 65,983 against 3,598 on Beth.

The field name is a lie, and this document says so because it will mislead the
next reader. It has nothing to do with favourite monsters: a monster in neither
favourite list still sent `0` outside RTA and `1` inside, on the same
`request_type: 3`. It is a generic "which list" field — the same API reuses it
for emoji packs. **Do not name it after favourites in JASWA's own code.**

Relics have only one model: `getUnitStatsRelicInfo` never sends the field, and
its response was byte-identical inside and outside RTA.

`request_type: 3` is constant on every observed call and remains unexplained.
Nothing may depend on it.

## 4. One row per monster type, at its highest awakening

**A `unit_master_id` is `<family><tier><element>`.** The last digit is the
element (1–5); the second-to-last is the awakening tier, and each tier is a
separate id with its own statistics.

| Tier digit | Meaning | Example |
| ---: | --- | --- |
| `0` | un-awakened | `20802` Frankenstein |
| `1` | awakened (1A) | `17911` Beth, `20812` Bulldozer |
| `3` | second awakened (2A) | `20832` Bulldozer 2A |

Tier `2` is the *Imperfect* line and tiers `4`–`7` are Ancient Spirits, guild
bosses and Towers. None is an awakening above 2A, and all are excluded along
with every six-digit id: the player-monster space is exactly the five-digit
ids. Less 12 Material monsters, which take no engravings, and 16 test rows, the
capture list is **1,086 monster types**.

**2A is a separate monster, not a variant.** Bulldozer 2A returns a distribution
the 1A form does not, and both are named "Bulldozer", so only the id separates
them. Reading 1A's numbers for a 2A monster is wrong data, not merely imprecise.

**Tier 0 is never collected.** What players hang on an un-awakened monster is
mostly spare runes parked out of the way, which would describe the parking
rather than the monster.

**The game never serves a lower tier at all**, measured September 1, 2026 across
685 monsters: zero requests at tier 0, zero at tier 1 where a 2A exists, and
every mismatch between the recommend call and the statistics call runs *upward*
(`24702 → 24712`). The panel is a property of the fully awakened monster, so
clicking an un-awakened monster cannot put a lower tier in the log. Read the id
from the `getUnitStats*Info` request itself, never from the neighbouring
`GetUnitRecommendPage_V2`.

**It is guarded anyway.** The reader keys on the master id with no notion of
tier, so two tiers of one monster would sit in the dataset as two unrelated
monsters — each ranked separately, each claiming to be that monster: counted,
usable and wrong, which is `AGENTS.md` §0.1's third failure. The collector
detects the collision, keeps the higher tier, and reports it; tier outranks
recency in that choice, since a stale higher tier still describes the right
monster while a fresh lower one does not.

## 5. An empty panel is not a capture

**A panel the game answers with an empty distribution is rejected rather than
stored, and 1★ monsters are deliberately left out.** There is too little data on
a monster nobody builds to make a meaningful statistic, and the game says the
same thing in its own way: the 46 monsters that can never awaken return
`ret_code 0` with *both* effect lists empty — 23 of 23 such responses carried
nothing at all, against 6 of 2,421 at tier 1 or 3.

The rule is written against the empty response rather than against a star
rating, because that is what the export actually carries, and it catches the
same thing one level deeper: the few relic panels for monsters nobody puts
relics on now show as honestly incomplete instead of falsely complete. A stored
empty panel would be `AGENTS.md` §0.1's third failure again — counted as a
capture while holding nothing any calculation can use.

## 6. Every observation is dated, and coverage is staged

The game recomputes these statistics monthly, so a dataset gathered over several
sessions is not a snapshot of one day. **Every panel carries its own
`observedAt`**, and the file carries `observedFrom`, `observedTo` and
`lastMergedAt` besides. A row's age is part of what it says, and a recapture can
target the stale rows rather than rebuilding the file.

**Collection runs in stages against the whole catalogue**, and partial coverage
is a working state rather than a broken one: a monster type without a row is
simply not judged (`ARTIFACT-CANONICAL.md` §19), so the workspace works at 4
types and works better at 1,086.

## 7. The traffic log is a buffer; the dataset is the archive

The helper clears the log at the start of each recording, which is deliberate: a
log that silently continued an earlier one invites reading yesterday's traffic
as today's evidence. **So run the merge before switching recording on again.**

```
node scripts/collect-engraving-statistics.mjs --todo 40   what to capture next
… capture those monsters in the game, with logging on …
node scripts/collect-engraving-statistics.mjs             merge the session
node scripts/collect-engraving-statistics.mjs --progress  how far it has got
```

The merge is additive and idempotent: re-running it changes nothing, and a
session only ever adds to what is there. It makes no network request; everything
it writes was already observed.

**What it refuses:** an RTA row (`favorite_type: 1`), an un-awakened or
unrecognised tier, a response whose `ret_code` is not `0`, an empty panel, and
any counts list that is missing or malformed. Each refusal is counted and
explained on stdout rather than passed silently, because a quietly dropped
monster is a hole nobody notices until the defaults look wrong.

The file is written one line per monster type. Indented JSON costs 2.6× the
bytes — 13 MB against 4.7 MB at full coverage — and a line per monster keeps a
session's diff readable anyway.

## 8. A collaboration pair is one monster

The game serves byte-identical distributions for a collaboration monster and the
generic unit it was re-released as, so the two rows are one observation seen
twice. They are pooled at read time, taking the later row rather than summing —
see `docs/MONSTER-SPECIES-DECISION.md`, which owns that rule.

## 9. What the verifier checks

`npm run verify:statistics-tiers` re-checks the whole stored dataset: that no
row sits at an excluded tier, that no two tiers of one monster are stored, and
that no stored panel is an empty answer. Run it after any capture session and
after any change to the collector.
