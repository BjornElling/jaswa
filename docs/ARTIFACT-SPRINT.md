# Artifact Sprint — working record

**Status:** Live working document for the Artifacts workspace
**Started:** August 30, 2026
**Last updated:** August 31, 2026 — decision 35 defines the conversion-stone
settings and their four-step value scale; the controls are built and persisted.
Decision 32 defines the benchmark-based `calculateArtifactOptimalValue`, the
canonical artifact-versus-monster value.
Decision 30 fixes the workspace's five areas and decision 31 the
acceptable-versus-preferred factor, which is built and persisted. The placeholder
is gone — `artifacts` routes to a real component. Decision 29 fixes the
thresholds that turn engraving counts into preferred and acceptable defaults.
The dataset and its collector exist, every observation carries its own date
(decision 25), and the capture list is 1,086 monster types. Collection is now
the user's to run, in stages, with `scripts/collect-engraving-statistics.mjs`
after each session. A user-entered preference always wins, and the statistics
are consulted only where the user has stated nothing (decision 28).

This file is the memory of the Artifact sprint. It carries the purpose, the
decisions taken, the questions still open, and the state of the work, so a new
session can be started from this file alone and continue exactly where the last
one stopped.

---

## 0. How this sprint runs

**The user directs; the agent executes.** Nothing is started, designed, coded,
or committed until the user asks for it. The agent does not pick the next task
on its own, does not widen the scope of a task it was given, and does not
begin implementation because a decision was recorded here.

**This file is maintained continuously.** After every session, and after every
decision or completed step within a session, the agent updates:

- the **Last updated** line at the top;
- the relevant entry in [§5 Decision log](#5-decision-log);
- the state of the affected step in [§6 Work plan](#6-work-plan);
- anything answered in [§7 Open questions](#7-open-questions);
- the [§8 Session log](#8-session-log).

**How to resume in a new session.** Read `AGENTS.md`, then this file top to
bottom, then §8's last entry for where work stopped. Do not act on it — report
the state and wait for the user's direction.

**Binding documents this sprint sits under.** `AGENTS.md` (project rules),
`docs/LANGUAGE-CONTRACT.md` (English, concise, lightly playful),
`docs/LOCAL-PERSISTENCE-CONTRACT.md` (storage), and the definition of done in
`AGENTS.md` §7. Where any of them and this file disagree, they win and this
file is corrected.

---

## 1. Purpose of the sprint

Build the complete Artifacts section of JASWA — from an unbuilt placeholder to
a finished workspace on the same footing as Rune Potential.

Today `artifacts` is a navigation entry backed by `UpcomingWorkspace`, a
placeholder that says the workspace is coming. Its shipped tagline states the
intent:

> *That artifact is superb. Just not for the monster wearing it.*
> Compares artifact effects against the monsters that would gain most from
> them.

The sprint is finished when a user with an imported account can open
**Artifacts**, see their own artifacts, understand which of them are worth
keeping and worth upgrading, and have those judgements follow the preferences
they saved — with nothing left behind a placeholder.

---

## 2. What exists today

Verified by reading the repository on August 30, 2026.

**The navigation entry.** `app/lib/workspace-config.ts` — `'artifacts'` is a
member of the `Page` union and sits in the `Workspaces` group of
`navigationGroups` with the glyph `◇`.

**The placeholder is gone (step 7, session 3).** `app/page.tsx` routes
`artifacts` to `app/components/artifacts-section.tsx`, which frames decision
30's five areas as `Disclosure` headings; `UpcomingWorkspace` now covers only
`optimizer`, `speed`, `gems`, and `relics`, and `upcomingWorkspaces` no longer
carries an `artifacts` entry. **Settings** holds the decision 31 slider; the
other four hold their heading and stated purpose and no judgement — that arrives
with steps 2–6.

**The imported data.** `app/lib/file-imports.ts` already carries artifacts
through the import:

- `artifacts` is one of `expectedSections`, so its presence is reported in
  `ImportReport.knownSections`;
- `completeEquipmentCollections` merges account-level `data.artifacts` with the
  artifacts equipped on each unit and de-duplicates them on `rid`, so
  `game.data.artifacts` is the complete account-wide collection;
- import validity does **not** require artifacts — only `unit_list` and
  `runes`. An account with no artifacts is a valid import.

**The report category.** `ReportCategory` already includes `'Artifact'`, so a
user can already report unrecognized artifact data from the existing dialog.

**Three footholds already read artifact data.** These are the existing
understanding of the export, and the new work must agree with them or correct
them deliberately:

- `app/lib/monster-grid.ts` — `equipmentPrimaryTypes` maps `pri_effect[0]`
  values `100`, `101`, `102` to `'HP'`, `'ATK'`, `'DEF'`
  (`EquipmentPrimaryType`). `equippedEquipmentTypes(monster, 'artifacts')`
  reads the two equipped artifacts per monster, and `displayArtifactTypes`
  renders them as `HP/ATK`, with `-` per empty slot and `—` when neither is
  set. Shared with relics, which use the same primary-type encoding.
- `app/lib/monster-stats.ts` — `addArtifactMainEffect` adds `pri_effect[1]` to
  the flat HP, ATK, or DEF total. Its comment records a decision worth keeping:
  artifact **secondary** effects are situational battle effects and so do not
  enter the always-visible stat sheet.
- `app/components/monster-overview.tsx` — the Monsters table already has an
  Artifacts column (`monster-col-artifacts`, 112px in `globals.css`), sortable
  and filterable through `artifactTypes`.

**Rune Potential already has an artifact opinion.** A `RunePotentialPreset`
carries `preset.artifacts` with booleans `atk`, `def`, `hp` — "which artifact
primary stats suit this role" — rendered as a yes/no row in the preset editor.
Decision 12 leaves it exactly as it is: it states a main-stat preference for a
rune role, which is a different question from the property preferences
decision 9 introduces.

**The term this sprint uses.** A **property preference** is one monster type's
statement that a given artifact property, **on a given artifact category**, is
*preferred*, *acceptable*, or neither. It is keyed by `(category, property)`, not
by property alone (decision 21), so the fourteen properties available on both
categories carry two independent preferences. That set of statements, for one
monster type, is its **property preferences**.

Earlier drafts of this file called them "marks", which collided with `AGENTS.md`
§2 and §5, where a mark is a visual selected-state indicator — a different thing
entirely. Do not reintroduce the shorter word.

**A preference the user has stated is not the same object as a default they have
not.** Decision 28 makes the user's entry authoritative and the engraving
statistics a fallback consulted only where the user has said nothing, so the two
must never be merged into one stored table. Three states, and they are three:

| State | Stored | The answer comes from |
| --- | --- | --- |
| The user stated preferred or acceptable | The value | The user |
| The user stated *nothing* | Nothing | The engraving statistics, if the dataset covers the type |
| The user deliberately cleared it | An explicit "neither" | The user — **not** the default |

The third row is the one that will be got wrong. Seeding the stored preferences
from the defaults at first view collapses rows one and two, and treating a
cleared preference as absent collapses rows two and three — in which case the
default returns and quietly overrules the user. This is `AGENTS.md` rule 3's
absent-versus-zero distinction, in the place it costs most.

**The default rule is fixed.** Work from the raw counts in one `(monster type,
artifact category, view)` distribution, never from rounded display percentages:
`share = property count / sum of all property counts in that distribution`.

| View | Preferred | Acceptable | Neither |
| --- | --- | --- | --- |
| Main Property (HP, ATK, DEF) | share ≥ 40 % | share ≥ 10 % and < 40 % | share < 10 % |
| Sub Property (Attribute or Type) | share ≥ 10 % | share ≥ 5 % and < 10 % | share < 5 % |

The two thresholds intentionally differ. Main Property has three possible
values, so 40 % is a meaningful choice over an even split and 10 % preserves a
real minority option. Each sub-property distribution has 23 values, making an
even share about 4.3 %; 10 % is a clear preference and 5 % is worth accepting.
No category is forced to have a preferred default when its statistics make no
property stand out.

**The two preference models are keyed differently, and must stay separate.**
`MonsterPreference` is `{ unitId, label, runeSets, statGoals }` — keyed on the
**owned copy**. Artifact property preferences are keyed on the **monster type**
(`unit_master_id`, decision 15). Both live in `Preferences`, and nothing about
their names says which is which, so anyone reaching for "the monster preference"
must check which key they are holding. They cannot be merged.

**What does not exist.** No artifact rules document, no artifact-specific
types, no reading of artifact *secondary* effects, no artifact set or
attribute model, no library, no judgement, no artifact preferences of its own,
no component, no tests. Nothing in `app/lib/types.ts` mentions artifacts.

**The model to follow.** Rune Potential is the finished workspace in this
codebase and the pattern to match: a canonical rules document in `docs/`, a
maths document, pure library code in `app/lib/`, a section component that owns
no persistence, settings and presets living in `Preferences`, and validation
that rejects anything not matching the current contract.

---

## 2a. The engraving statistics — findings

Investigated August 30, 2026. **All three panels have now been captured from a
live session and verified against the user's screenshots** — see "Second
recording" below, which supersedes the expectations recorded above it.

### What the data is

The game's **Monster Info → Statistics** panel reports what the wider player
base equips on a given monster. Observed on Beth (screenshots supplied by the
user), it is three panels behind one monster, each with a dropdown:

| Panel | Dropdown options observed | Example values |
| --- | --- | --- |
| Rune Engraving Statistics | Rune Sets; Property (Slot 2); Property (Slot 4); Property (Slot 6) | Fatal Blade 30.8 %, Rage Blade 18.0 %; slot 2 ATK% 55.9 % / SPD 41.1 %; slot 4 CRI Dmg 83.7 %; slot 6 ATK% 89.4 % |
| Artifact Engraving Statistics | Main Property; Sub Prop. (Attribute); Sub Prop. (Type) | ATK 75.9 % / HP 15.6 % / DEF 8.5 %; "Add'l DMG Prop. to ATK" 11.4 %; "[Skill 3] Accuracy +" 7.6 % |
| Relic Engraving Statistics | Main Property; Unique Property | ATK 68.6 %; "[MAX HP increased per SPD] at the start of battle" 24.5 % |

Each panel truncates: the rune panel folds the tail into **Others**, and the
artifact and relic lists are scrollable, so a full capture must account for
entries below the fold.

### How it can be captured

The helper is already a decrypting man-in-the-middle proxy for the game's own
gateway, and it already sees every request and response — not only the ones it
uses:

- `helper/src/service.cjs` `proxy.onRequest` (~line 316) retains each request
  and response body for the gateway path.
- `helper/src/protocol.cjs` `decodeRequest` / `decodeResponse` decrypt the
  AES-128-CBC envelope and inflate the response.
- `service.cjs` (~line 328) routes `HubUserLogin` / `GuestLogin` to
  `acceptSnapshot`, and **everything else** to `profileStore.applyUpdate`,
  which silently ignores any response holding no tracked entity.

So the statistics response almost certainly already passes through the helper
and is discarded. Capturing it is a matter of **observing** traffic the user's
own play generates.

### Why this raises no account risk

The concern about mass server lookups does not apply, and cannot be made to
apply by this design:

- **The helper cannot ask.** It is a passive proxy on traffic the game itself
  initiates. There is no route by which JASWA sends a request of its own.
- **Capture generates zero additional traffic.** The only requests are the ones
  the game makes because the user opened a panel. Recording is indistinguishable
  from ordinary play, because it *is* ordinary play.
- **The cost is the user's time, not server exposure.** Three panel visits per
  monster type — one request each. (Estimated at nine before the capture, on the
  assumption that each dropdown fetched its own data; it does not.) That is the
  real limit on how many monster types this dataset can cover.

Any design that synthesises requests to fill the dataset faster is out of
bounds for this sprint. It would be exactly the behaviour the user asked to
avoid.

### First recording — what it settled, August 30, 2026

A 41-entry log covering login and about seven minutes of play. It did **not**
contain the statistics, but it ruled things out that matter:

- **The account arrives whole at login.** `HubUserLogin` carried 279 monsters,
  1574 runes and 1251 artifacts in a 152-key response — and **no** engraving
  statistics. So the figures are not a by-product of the import; they must be
  fetched by their own request.
- **Opening a monster fetched nothing.** Three-minute gaps in the timeline,
  where the user navigated and opened a monster, produced no gateway traffic at
  all. The client serves Monster Info from what it already holds.
- **`getArtifactOccupiedSnapshotInfo` is not it.** It is the artifact
  save/load-preset feature (`snapshot_info_list`, `save_cooltime`), and is
  unrelated to engraving statistics.

**A tray counter reading `(0)` is not a fault.** The first screenshot was taken
before the game was started; the log filled correctly afterwards. The counter
refreshes about every two seconds.

### Second recording — the statistics captured, August 30, 2026

Opening the **Statistics** tab on Beth produced the calls the first recording
missed. **This settles the payload shape.** Verified against the user's own
screenshots: every percentage below reproduces exactly.

**The three commands.** One per panel, all keyed the same way.

| Command | Request | Response |
| --- | --- | --- |
| `getUnitStatsRuneInfo` | `unit_master_id`, `request_type: 3`, `favorite_type: 0` | `runeset`, `primary_effect`, `secondary_effect`, `favorite_type` |
| `getUnitStatsArtifactInfo` | `unit_master_id`, `request_type: 3`, `favorite_type: 0` | `primary_effect`, `secondary_effect`, `favorite_type` |
| `getUnitStatsRelicInfo` | `unit_master_id`, `request_type: 3` | `primary_effect`, `secondary_effect` |

`GetUnitRecommendPage_V2` fires alongside them and carries `comments` — the
community write-ups, not statistics. Not wanted here.

**Keyed on `unit_master_id`, not `unit_id`.** Beth was `17911`. The dataset
therefore holds **one row per monster type**, not per owned copy — which
answers the keying question outright and matches decision 15.

**One call covers a whole panel's dropdowns.** A single
`getUnitStatsArtifactInfo` response carried the Main Property figures *and*
both Sub Property views: `secondary_effect` splits on `slot_id` 1 and 2, which
are the game's "Sub Prop. (Attribute)" and "Sub Prop. (Type)" tabs. The rune
call behaves the same way — its one response holds the Rune Sets list *and*
every slot's properties. **So a monster costs exactly three requests**, one per
panel, against the nine the dropdown count suggested.

**The rune payload.** `runeset` is a list of `{ set_list, count }`, where
`set_list` is the combination itself — `[4, 8]` for a two-set build, `[4]` for
a single set. `primary_effect` covers only the choosable slots (2, 4, 6), which
matches `RUNE-CANONICAL.md` §3 exactly; `secondary_effect` covers all six.

**Counts, not percentages.** Every row is `{ slot_id?, effect_id, count }` with
a raw occurrence count. The displayed percentage is derived by dividing by the
total of its own group:

- Artifact primary, `slot_id: 1` — `101: 67740`, `100: 10463`, `102: 5346`,
  total 83549 → 81.1 % / 12.5 % / 6.4 %.
- Artifact secondary, `slot_id: 1` — `219` is 11.4 %, `300` 6.4 %, `221` 6.2 %,
  `307` 6.1 %, `223` 4.9 %, matching the screenshot exactly.
- Relic primary — `101: 9195`, `100: 3759`, `102: 459` → 68.6 % / 28.0 % /
  3.4 %, matching the screenshot.
- Relic secondary — `14` is 24.5 %, `1` 12.9 %, `7` 8.8 %, matching.

Storing the counts rather than the percentages keeps the sample size, which the
percentage discards — a 30 % share drawn from 83549 uses is not the same
evidence as 30 % drawn from 12.

**No `Others` bucket, and nothing truncated.** The response carries the full
distribution: 46 artifact secondary rows (23 per slot) and 16 relic secondary
rows. The panel's **Others** row and its scroll limit are presentation only.
This is better data than the screenshots suggested.

**Three distinct `effect_id` vocabularies. They must not share a lookup
table.**

| Where | Space | Meaning |
| --- | --- | --- |
| Rune primary and secondary | `1`–`12` | **Already known.** Matches `RUNE-CANONICAL.md` §2 exactly: `1` HP+, `2` HP %, `3` ATK+, `4` ATK %, `5` DEF+, `6` DEF %, `8` SPD, `9` CRI Rate, `10` CRI Dmg, `11` Resistance, `12` Accuracy. No unmapped id appeared, and `7` was absent, as that document says it should be. |
| Artifact and relic **primary** | `100`/`101`/`102` | HP/ATK/DEF, agreeing with `equipmentPrimaryTypes` in `app/lib/monster-grid.ts`. |
| Artifact **secondary** | `2xx`/`3xx`/`4xx` | Not yet decoded (`219`, `300`, `409`…). |
| Relic **secondary** | small integers | Not yet decoded (`1`, `7`, `14`…), and **deliberately not** the rune space despite the overlap. |

The rune vocabulary landing exactly on the existing canonical table is a useful
corroboration: the statistics speak the same language the codebase already
does.

### Two game modes, selected by a badly named field

**There are two statistical models per monster type, and `favorite_type`
chooses between them: `0` is PvE, `1` is RTA.** Decision 22 takes PvE.

**The name is a lie, and this file says so because the field will mislead the
next reader.** It has nothing to do with favourite monsters. Proven three ways:

- The user's RTA favourite list is empty (`GetRtpvpFavoriteList` →
  `favorite_list: []`), yet every call made inside RTA sent `1`.
- Beth is not in `favorite_unit_list` either, yet sent `0` outside RTA and `1`
  inside.
- The clinching case: **Onmyouji (25012), a favourite in neither list, was
  opened in both places.** Same monster, same `request_type: 3`, only
  `favorite_type` differing.

| Onmyouji, rune sets | `favorite_type: 0` (PvE) | `favorite_type: 1` (RTA) |
| --- | ---: | ---: |
| Sample size | 41,861 | 4,961 |
| `[10,15]` Despair/Will | 27.1 % | 28.3 % |
| `[6,10]` | 14.2 % | 5.2 % |
| `[13,15]` Violent/Will | 12.4 % | 23.9 % |

The same split shows on Beth: 65,983 PvE observations against 3,598 in RTA.
The field name is reused elsewhere in this API for unrelated things —
`emoticon_favorites` carries a `favorite_type` about emoji packs — so it is a
generic "which list" field, not a favourite flag. **Do not name it after
favourites in JASWA's own code.**

**Relics have only one model.** `getUnitStatsRelicInfo` never sends
`favorite_type`, and its response was byte-identical inside and outside RTA. So
decision 22's "PvE for relics" is automatic rather than a choice: there is
nothing else on offer.

### What is still unknown

Nothing below has been observed; none of it may be assumed in code.

- **What `request_type: 3` selects.** Constant across every observed call —
  inside RTA and out, on three monster types. Not the game-mode switch; that is
  `favorite_type` (see below). Still unexplained, but it has never varied, so
  nothing depends on it.
- The meaning of each `effect_id` in the artifact `2xx`/`3xx`/`4xx` space and
  the relic small-integer space, and whether they match the identifiers on the
  user's own items. **This is now the only vocabulary work left** — the rune
  space is settled.
- Whether an unpopular monster returns empty lists or omits the keys entirely.
  Beth is a heavily used monster; a rarely built one is the case that will show
  it, and it decides what "no data" has to look like in the workspace.
- **How to tell, from the catalog alone, what a monster type's highest
  awakening is.** The capture needs this to know which id to ask for, and
  `swarfarm-monsters.json` carries no awakening relation — only `com2us_id`,
  `name`, `image_filename`, `archetype`. The arithmetic ("is there an entry at
  `id + 20`?") survives a first check: of 1237 tier-1 entries, 111 have a
  tier-3 partner, and 103 of those share the 1A name — the 8 that differ are
  renames like `13211` Lulu → `13231` "Lulu and Friends", not mismatches. The
  only failures are 6 six-digit boss and tower entries (`111331` Incarnation of
  Greed, `112033` Tower) with no tier-1 partner, which are not player monsters
  and should be excluded from the capture anyway. **Session 2 settled the shape
  of the list**, if not the rule's truth for every entry: restricting to
  five-digit ids gives 1,110 types at highest awakening (89 at tier 3, 1,021 at
  tier 1), and dropping 12 Material monsters — Devilmons and rainbowmons, which
  wear no equipment — and 16 Korean-named test rows leaves the **1,086** the
  collector's `--todo` works through. The `id + 20` rule stays unproven monster
  by monster; a 2A form the catalog fails to pair would be captured at tier 1
  and can be corrected when noticed.
- ~~**What tier digits `2` and `4`–`7` mean.**~~ **Answered in session 2, by
  reading the catalog.** Tier `2` is the *Imperfect* line — `11223` Imperfect
  Nine-tailed Fox, `13322` Imperfect Succubus — and tiers `4`–`7` are Ancient
  Spirits, guild bosses (`72041` 길드보스) and Towers. **None is an awakening
  above 2A**, so "highest awakening" still resolves to tier 3 where it exists
  and tier 1 otherwise. All are excluded from the capture, along with every
  six-digit id: the player-monster space is exactly the five-digit ids.
- **What a recommendation does with a monster whose type has no row** — because
  it is un-awakened, or because the capture never covered it. This is the same
  shape as Q7a and should get the same answer: not judged, rather than judged as
  zero.

### Way in — JASWA Helper's own "Log all traffic"

Built in session 1 (decision 5). The helper can now record every decoded
gateway exchange itself, so no second program is involved and the tool stays
available for any future question about what the proxy can derive.

**Where it is.** Tray menu → **Log all traffic** (a checkbox, off by default,
which asks for confirmation because the file holds account data in the clear),
and **Open traffic log** beside it.

**Rebuild the installer after changing the helper.** `npm run package` in
`helper/` refreshes `public/JASWA-Helper-Setup.exe`; committing helper source
alone leaves the installed program on the previous build. The installer's own
bytes are compressed, so verify a feature reached it by grepping the packaged
`win-unpacked/resources/app.asar` in electron-builder's output — grepping the
`.exe` gives a false negative.

**What it writes.** `%LOCALAPPDATA%\JASWA Helper\traffic.log` — one JSON object
per line: `{ at, command, request, response }`. Line-per-entry rather than one
array, so the file stays readable if the helper stops mid-session. Switching it
on starts a fresh file; it stops at 64 MB and says so on the menu label.

**How to capture a monster**, now that the second recording has shown what the
calls are:

1. Switch on **Log all traffic**, with the game already running.
2. **Open the monster from the ordinary monster list, not from inside RTA.**
   Decision 22 takes the PvE model, and the RTA screen returns the other one.
3. Open its **Statistics** tab. Opening the tab is what issues the requests —
   the monster alone fetches nothing.
4. Visit each of the three panels once: rune, artifact, relic. **One visit per
   panel is enough** — a panel's dropdowns are all served by its single
   response, so there is no need to click through them.
5. Switch recording off, then **Open traffic log**.

All three calls are now understood, so a capture run needs no exploration — it
is the five steps above, repeated per monster type.

### The collector — how a session's clicking becomes dataset

Built in session 2. `scripts/collect-engraving-statistics.mjs` reads the traffic
log and merges what it finds into `app/data/engraving-statistics.json`. It makes
no network request; everything it writes was already observed.

```
node scripts/collect-engraving-statistics.mjs --todo 40   what to capture next
… capture those monsters in the game, with logging on …
node scripts/collect-engraving-statistics.mjs             merge the session
node scripts/collect-engraving-statistics.mjs --progress  how far it has got
```

**Run the merge before switching recording on again.** The helper clears the log
at the start of each recording (decision 27), so the log is a buffer and the
dataset is the archive. The merge is additive and idempotent: re-running it
changes nothing, and a session only ever adds to what is already there.

**What it refuses.** An RTA row (`favorite_type: 1`), an un-awakened or
unrecognised tier, a response whose `ret_code` is not `0`, and any counts list
that is missing or malformed. Each refusal is counted and explained on stdout
rather than passed silently, because a quietly dropped monster is a hole nobody
notices until the defaults look wrong.

**What it stores.** Counts exactly as the game sends them, never percentages —
the sample size is evidence, and a percentage discards it. Each panel carries
its own `observedAt` (decision 25). The file is written compactly, one line per
monster type: indented JSON costs 2.6× the bytes, which at full coverage is
13 MB against 4.7 MB, and a line per monster keeps a session's diff readable
anyway.

**Every captured row must carry `favorite_type: 0`.** A `1` means it came from
the RTA screen and belongs to the other model; the import should reject it
rather than blend the two.

### How `unit_master_id` encodes the awakening tier

**A `unit_master_id` is `<family><tier><element>`.** The last digit is the
element (1–5); the second-to-last is the awakening tier. Each tier is a
*separate id with its own statistics*.

| Tier digit | Meaning | Example |
| ---: | --- | --- |
| `0` | un-awakened | `20802` Frankenstein, `25102` Onimusha |
| `1` | awakened (1A) | `20812` Bulldozer, `25112` Kaki, `17911` Beth |
| `3` | second awakened (2A) | `20832` Bulldozer 2A, `10631` Tarq 2A |

Tier `2` (52 catalog entries) and `4`–`7` (57) also occur and are not yet
identified. Of the catalog's 3089 entries, 1626 sit at tier 0, 1237 at tier 1
and 117 at tier 3.

A 2A monster keeps its name — `20812` and `20832` are both "Bulldozer" — so the
catalog cannot separate the tiers by name, only by id.

**2A has its own statistics, and they are genuinely different.** Bulldozer 2A
(`20832`) returns `[5,15]` at 37.0 % over 38,397 observations, a distribution
the 1A form does not. Reading 1A's numbers for a 2A monster would be wrong data,
not merely imprecise.

**Why two different ids can appear one second apart.** Opening an un-awakened
monster fires `GetUnitRecommendPage_V2` with the tier-0 id and
`getUnitStats*Info` with the tier-1 id — the recommend page addresses the
monster on screen, the statistics address the form worth measuring. Where the
monster is already at its final form the two agree: Beth sent `17911` on both,
Bulldozer 2A sent `20832` on both.

**The rule for the capture: collect each monster type at its highest awakening,
and read the id from the `getUnitStats*Info` request itself** — never from the
neighbouring recommend call. A type with a 2A form is collected at tier 3; one
without, at tier 1. Tier 0 is never collected: decision 23 rules it out, because
what players hang on an un-awakened monster is mostly spare runes parked out of
the way, which would describe the parking rather than the monster.

**Keyed on the monster type, as decision 15 needs.** The statistics are keyed on
`unit_master_id`, never `unit_id`, so the defaults seed the user's property
preferences directly with no mapping, and the question of two copies reporting
different statistics never arises.

**The log contains account data**, including the session keys JASWA's own
import strips (`app/lib/file-imports.ts`). It stays on the user's computer and
is never uploaded. Only the statistics responses matter here; nothing else from
it enters the repository.

---

## 3. Scope

### In scope

1. A canonical rules document for artifacts, in the manner of
   `docs/RUNE-CANONICAL.md`, separating verified rule from pending
   verification.
2. Reading and validating artifacts from the imported game data.
3. An artifact library the user can look through, sort, and filter.
4. A judgement of each artifact — worth keeping, worth upgrading, worth
   dismissing — driven by the user's saved preferences.
5. The link the tagline promises: which monsters would gain most from a given
   artifact.
6. Artifact settings and presets persisted in `Preferences` and travelling with
   the `.sw` file.
7. The workspace component, replacing the placeholder for `artifacts` only.

### Out of scope for this sprint

- The other placeholder workspaces: `optimizer`, `speed`, `gems`, `relics`.
  They keep `UpcomingWorkspace`.
- Any change to the rune model beyond what artifacts genuinely need.
- Helper or import-route changes. Artifacts arrive through the existing import.

### Explicitly undecided

Everything in [§7 Open questions](#7-open-questions). No part of it is settled
by having been written down here.

---

## 4. Principles for this workspace

Taken from `AGENTS.md`, restated where they will bite hardest in this sprint.

- **No legacy, no migrations.** There is no earlier artifact data to support.
  Design the best model and validate only that contract.
- **Layout must not move under the user.** Filter chips, sort headers, and any
  selected-state marks in the artifact list are exactly where rule 2 gets
  broken. Reserve space; never change text or weight on selection.
- **Both extremes get tested.** An account with no artifacts, and an account
  with every slot filled and every effect rolled. An empty numeric preference
  is absent, not zero.
- **Colour means "you can act on this."** Gold marks interactive state only. An
  artifact's quality is expressed through weight, position, or form — never by
  colouring the data.
- **Derived values are derived.** Any artifact score follows from the artifact
  and the user's preferences in one place, and is never stored alongside them.
- **Verification is by running the app.** Visual and interactive work is
  checked in the browser against the user's own running dev server, both
  extremes driven.

---

## 5. Decision log

Every settled decision, with its reason. Newest last. A decision is only
recorded here once the user has taken it.

| # | Date | Decision | Reason |
| ---: | --- | --- | --- |
| 1 | 2026-08-30 | Run the Artifacts work as a directed sprint tracked in this file, `docs/ARTIFACT-SPRINT.md`. | The work spans several sessions. A single maintained document lets any session resume from the recorded state instead of re-deriving it. |
| 2 | 2026-08-30 | The user decides the sequence and when each step starts; the agent executes only what is asked. | Stated by the user at the start of the sprint. |
| 3 | 2026-08-30 | Capture the game's own engraving statistics — the community usage percentages for rune sets, rune slot properties, artifact main and sub properties, and relic main and unique properties — as a one-time recorded dataset, not a live import. | The game already answers "what does everyone else run on this monster". Recording it once gives the sprint a real reference to judge against, without the program ever depending on that data staying fresh. |
| 4 | 2026-08-30 | *(Superseded by 5.)* Read an SWEX log before writing any helper capture code. | SWEX already decrypts the same gateway and can log it completely, answering the unknowns without building anything. |
| 5 | 2026-08-30 | Build "Log all traffic" into JASWA Helper itself — a general investigation tool, offered in the tray menu and off by default — rather than reading an SWEX log. | It answers the same questions as decision 4 while staying useful afterwards: any future question about what the proxy can derive is then one toggle away, with no second program and no account data leaving the user's own tooling. |
| 6 | 2026-08-30 | The artifact rules live in `docs/ARTIFACT-CANONICAL.md`, structured as a reference work rather than as a narrative, and separating verified rule from pending verification in the manner of `docs/RUNE-CANONICAL.md`. | Step 1 blocks every step after it, and the questions it must answer arrive one at a time over the sprint. A document organised by subject — equip rules, property pool, per-property behaviour, additional damage, rounding, conversion, reappraisal, legacy — can be consulted at the point of doubt; a narrative has to be re-read. |
| 7 | 2026-08-30 | Everything the pre-v8.0.0 artifact system did is treated as legacy and marked as such, but legacy *properties* stay importable. | The rule research found that most surviving guides describe the pre-v8 system, so the document has to state its own vintage loudly. `AGENTS.md` §0 forbids migrations for JASWA's own data — but a legacy property on a live account is current input, not an old JASWA format, so rejecting it would reject a legal artifact. |
| 8 | 2026-08-30 | A second specification of the same rules, supplied as TypeScript, is absorbed into `ARTIFACT-CANONICAL.md` rather than kept as its own document or committed as code. | Two documents on one subject drift, and the reader has to arbitrate between them at every question. Its four genuine contributions — the contribution count as data, the three evaluation axes, the `allowedRolls` escape hatch, and the rounding table — belong where the rules already live. Its concrete property IDs and roll values are exactly what `ARTIFACT-CANONICAL.md` §15 forbids assuming before an export exists. |
| 9 | 2026-08-30 | **The user declares what matters; JASWA measures only the roll.** Artifact value is not derived from what a property *does* in combat. Per monster type, the user sets each property to preferred or acceptable, and an artifact's value is how well it rolled on exactly those. | It removes the dependency on skill data entirely. JASWA has none, and judging "[Skill 2] Recovery" would otherwise require knowing whether Skill 2 heals. It also puts the judgement where the knowledge actually is: the player knows what their monster is for. |
| 10 | 2026-08-30 | The engraving statistics (§2a) supply the **default** property preferences per monster type. | Answers what decision 9 leaves open — an empty roster is useless, and asking the user to fill in every monster before seeing anything is worse. The community's own usage is the honest starting opinion, and the user overrides it wherever they disagree. This promotes A2/A3 from a side investigation to a dependency of the main product. |
| 11 | 2026-08-30 | One slider sets how much an *acceptable* property is worth against a *preferred* one, as a single global factor. | Rune Potential already establishes preferred-versus-acceptable as this project's two-tone device, and its "Accepted runes" slider is the same idea. One factor, not one per monster: the user is stating a general tolerance, not tuning each row. |
| 12 | 2026-08-30 | Artifacts get their own preference model in `Preferences`, not an extension of `RunePotentialPreset`. | `PresetArtifacts` is `{atk, def, hp}` — main property only, with no way to express a sub-property wish. Decision 9 needs per-type property preferences, which is a different shape from a role-based rune preset, and forcing both into one editor would burden Rune Potential with a model it does not use. |
| 13 | 2026-08-30 | The workspace answers all three questions — keep, who should wear it, what is missing — rather than leading with one. | The user's call. The three share one calculation under decision 9, so they are three readings of the same table rather than three products. |
| 14 | 2026-08-30 | Reuse the existing `Disclosure` component from `app/components/page-chrome.tsx` for the Artifacts workspace's sections. | The user named the Rune Potential fold-outs as working well visually and in use. It is already a shared component wrapping a native `<details>`, so reuse costs nothing and keeps keyboard behaviour and find-in-page consistent. Do not copy or reimplement it. |
| 15 | 2026-08-30 | Property preferences are held **per monster type**, keyed by `unit_master_id` — never per owned copy. Two copies of the same monster cannot carry different preferences, and the interface offers no way to try. | The user's call. It matches how the engraving statistics are expected to be keyed (§2a), so the defaults and the preferences they seed share one key. It also matches the nature of the judgement: a property preference says what this *kind* of monster is for. |
| 16 | 2026-08-30 | Property preferences are declared without reference to the monster's actual skills, and JASWA never checks whether one is sensible for that monster. | The completion of decision 9. Validating a preference against the monster's kit would reintroduce the skill-data dependency decision 9 removed, and would put JASWA in the position of overruling the user about their own monster. A preference the user regrets is theirs to change. |
| 17 | 2026-08-30 | Every available property is its own independent choice, set to preferred or acceptable on its own. The five attributes get no separate mechanic. | The ten elemental properties are chosen exactly like the other twenty-three. Keeping one rule rather than two also matches the defaults, which arrive per property (decision 10) rather than per element — and the offensive `Damage Dealt on X` and defensive `Damage Taken from X` families point in opposite directions, so collapsing them into one "element" choice would lose the distinction. |
| 18 | 2026-08-30 | A monster type with no property preferences is shown as **not yet judged**, kept out of score-sorted views, and given no fallback score derived from archetype or anything else. | `AGENTS.md` rule 3: an absent value is not a zero. Every artifact would score zero against such a monster, and a zero renders and sorts as though it were an answer. The dataset will never cover every monster type — each capture costs the user a visit to three panels, and new monsters keep arriving — so this is the ordinary case, not an edge case. A guess that looks like a judgement is worse than an honest gap. |
| 19 | 2026-08-30 | Property preferences cannot be copied from one monster type to another. | Asked and declined. Nothing is shared between monster types: each states its own preferences, seeded from the engraving defaults (decision 10) and edited from there. |
| 20 | 2026-08-30 | Attribute properties and Type properties are presented **separately**, not as one combined list — and probably as separate areas of the Artifacts workspace rather than only as two groups inside one editor. | The user's call, on a list of around 33 current properties. It also follows the game's own division: §5 of the canonical document puts nine properties on Type artifacts only and ten on Attribute artifacts only, and a monster wears exactly one of each. Two shorter lists that each mean something beat one long list that mixes two questions. How far the separation goes — two groups, two fold-outs, or two areas — is settled in step 5 against the running app. |
| 21 | 2026-08-30 | A property preference is keyed by **`(category, property)`**, not by property alone. The fourteen both-category properties therefore appear in both lists and are set independently: `Life Drain` may be preferred on the Type artifact and unwanted on the Attribute one. | The user's call, and the reason decision 20 is a model decision rather than a layout one. A monster wears one artifact of each category, so "which property do I want here" is genuinely two questions — a `Life Drain` roll on the Attribute artifact is a different opportunity from one on the Type artifact, and it competes against a different set of alternatives. Keying on the property alone would silently force one answer onto both. |
| 22 | 2026-08-30 | **The engraving statistics JASWA captures and turns into defaults are the PvE ones** (`favorite_type: 0`), for artifacts and relics alike. The RTA model is not captured. | The user's call. The game keeps two models per monster type and the capture must pick one, because a default seeded from a mix of both would mean nothing. PvE is the mode most of an account's equipment is actually built for, and it rests on far more observations — 41,861 against 4,961 on Onmyouji, 65,983 against 3,598 on Beth. For relics the choice is moot: the game offers only one model. |
| 23 | 2026-08-30 | **The dataset holds exactly one row per monster type: its highest awakening.** Nothing else is collected — not un-awakened forms, not a lower tier of a type that has a higher one. | The user's call. The statistics say what other players equip; on an un-awakened monster that is mostly poor runes parked somewhere convenient, so tier-0 data is actively misleading rather than merely thin. The tier lives in the id's second-to-last digit (`0` un-awakened, `1` awakened, `3` second awakened), and **2A is a separate monster with its own statistics, not a variant of 1A** — Bulldozer 2A returns a distribution 1A does not, and both are named "Bulldozer", so only the id separates them. See §2a. |
| 24 | 2026-08-30 | **The dataset is catalog-wide and has nothing to do with the user's own account.** It is collected per monster *type*, and the property preferences the user sets are likewise per type. Which monsters the user owns is irrelevant to both. | The user's correction of an agent misreading. Ownership enters at exactly one point: when the workspace recommends artifacts for the user's monsters, and even there it only looks up the preferences already recorded against that monster type. Letting the account shape the dataset or the preferences would make a general reference into a private one, and would mean the same monster type could be judged differently for no reason. |
| 25 | 2026-08-30 | **Every observation carries its own capture date**, and the dataset carries `observedFrom`, `observedTo` and `lastMergedAt` besides. The game recomputes these statistics monthly. | The user's requirement, and it answers half of Q8. A dataset gathered over several sessions is not a snapshot of one day, and a monthly recapture will land beside older rows rather than replacing the file wholesale. Dating each row is what lets a reader tell a figure captured this month from one captured three months ago — and what makes it possible to recapture the stale part only. |
| 26 | 2026-08-30 | **Collection runs in stages against the whole catalog** — 1,086 monster types — rather than being narrowed to natural 4/5★ or to the user's own roster. The dataset is usable at any coverage. | The user's call. Narrowing by rarity needs a natural-star field the catalog does not carry, and narrowing to the account would break decision 24. Because a type without a row is simply not judged (decision 18), partial coverage is a working state rather than a broken one, so the work can stop and resume at any point. |
| 27 | 2026-08-30 | **The traffic log is a buffer, not an archive.** `scripts/collect-engraving-statistics.mjs` merges it into the dataset additively after each session; the helper's "start a fresh file each recording" behaviour is left alone. | Switching recording on clears the log, which would lose a previous day's clicking. Making the helper append instead would need an installer rebuild and would undo a deliberate decision — a log that silently continued an earlier one invites reading yesterday's traffic as today's evidence. Merging after each session keeps that guarantee and still loses nothing, as long as the merge runs before recording is switched on again. |
| 28 | 2026-08-30 | **A user-entered preference always takes precedence over the game's figures. The engraving statistics are consulted only where the user has entered nothing.** The two are never blended, averaged, or reconciled: for a given `(monster type, category, property)` the answer comes from the user if they have stated one, and from the dataset otherwise. | The user's call, and it answers Q8's override half. It also removes a whole class of problem rather than solving it: because a recapture cannot touch anything the user has stated, the dataset needs no merge policy against preferences, and there is no "your default changed" case to design. The distinction it *does* require is between **never stated** and **deliberately stated as nothing** — under `AGENTS.md` rule 3 those are different answers, and a cleared preference that fell back to the default would silently overrule the user. So a monster type's preferences must be stored as an explicit record of what the user said, absent where they said nothing, and never as a copy of the defaults seeded at first view. |
| 29 | 2026-08-30 | **Default property preferences use fixed shares of their own engraving distribution.** Main Property is preferred at ≥ 40 % and acceptable at ≥ 10 %; Sub Property is preferred at ≥ 10 % and acceptable at ≥ 5 %. A lower share is neither; the calculation uses raw counts, separately for each monster type and artifact category. | Main Property has three values, whereas each Attribute or Type sub-property distribution has 23. One threshold would either discard useful main-property alternatives or label most sub-properties desirable. These limits keep the rule legible, produce a typical main-property result of one preferred and one acceptable choice, and leave a flat sub-property distribution honestly without a preferred default. |
| 30 | 2026-08-30 | **The workspace is five areas, in this order: Recommendations, Best monster for this artifact, Best artifact for this monster, All artifacts, Settings.** Each is a `Disclosure` on the single Artifacts page, and **none opens by default.** | The user's call, and it makes decision 13 concrete: Recommendations and the two "best" views are the three questions, All artifacts is the library they are read against, and Settings holds the tolerance applied to all of them. **Recommendations leads** because it is the answer a user comes to this page for — the account-wide "what should I actually change" — where the two "best" views answer a question about one artifact or one monster the user must first have in mind. **Settings sits last**, being set once and then left alone. Every fold starts closed and behaves identically, so the page never decides for the user which question they arrived with. Naming the five now lets them exist as headings before their content does, so steps 2–6 fill an agreed frame instead of negotiating one late. |
| 31 | 2026-08-30 | **The acceptable-versus-preferred factor is stored as the percentage itself** — one of 0, 25, 50, 75 or 100 — **not as a 1–5 step index.** It defaults to 50 %, lives in `Preferences.artifacts` as `ArtifactSettings.acceptableWorth`, and is offered as a five-stop slider in the Artifacts **Settings** area. | Decision 11 fixed that there is one global factor; this fixes what is stored. The judgement multiplies by the factor, so storing the percentage keeps the value the user reads and the value the calculation uses as one thing — a step index would need translating into a factor somewhere, and that translation is a second source of truth. 50 % is the honest midpoint and reads as a deliberate answer, where 0 % (an acceptable property may as well be unwanted) and 100 % (the distinction stops meaning anything) read as the feature switched off. The five stops are a validated set rather than a range: a `.sw` file claiming 37 % did not come from this slider. |
| 32 | 2026-08-30 | **Artifact-versus-monster value is `calculateArtifactOptimalValue`: main-property preference weight × weighted, roll-quality sub-property sum, divided by the fixed benchmark `1 preferred + 3 acceptable`.** Preferred weighs 1; acceptable weighs `Acceptable ctr. preferred`; unwanted weighs 0. Scores may exceed 100 %. | The user approved a benchmark rather than an artifact-specific denominator. It keeps a max-rolled `2 preferred + 2 acceptable` artifact visibly exceptional (120 % at the default factor), while rewarding the rarer four-property preferred match more still. A dynamic denominator would erase unmatched slots and falsely make a narrow match perfect. The complete contract is `ARTIFACT-CANONICAL.md` §16; the TypeScript function is its sole executable implementation. |
| 33 | 2026-08-30 | **The artifact library leaves the Artifacts workspace and becomes its own rail entry, `Artifacts`, beside Monsters; the workspace is renamed `Artifact Optimization` and keeps the other four of decision 30's areas.** | The user's call. It separates a library from a judgement: `Artifacts` is the plain list of what the account holds, where `Artifact Optimization` is the three questions read against it — and the rail now names each for what it is. It also gives the table the room it needs, which a `Disclosure` on a workspace page could not: the list is full-width, sortable and filterable in the manner of Monsters, and follows that page's conventions throughout rather than inventing a second table idiom. Decision 30's ordering of the remaining four areas is untouched. |
| 34 | 2026-08-30 | **Where the export contradicts `ARTIFACT-CANONICAL.md`, the export governs and the document is corrected.** Three roll ranges in §5 and two claims in §15.4 were wrong against the user's own 1,864 artifacts. | Session 4 built the property table from the export rather than from §5, and the disagreements were real: current artifacts acquired this month roll outside §5's stated range on three properties. §14's revision rule already makes an observation primary over a secondary guide, so the table records what was observed and §15.9 records the corrections. A range the code trusted over the data would have judged real lines as impossible ones. |
| 35 | 2026-08-31 | **Artifact Optimization settings factor in owned monsters by default and offer two conversion-stone sources:** *Conversion stones* with *Calculated values*, or *Engraved conversion stones* with *Use what you've got*. The stone-value control has four prose-labelled steps matching Rune Potential's Enchanted gems scale; the acceptable-versus-preferred factor stays outside the source choice. | The user's call. The two source cards now explain the difference directly: the first uses the fixed conversion range, while the second uses calculated values from engraved stones the user actually owns. Grade dropdowns are not part of this decision, and the shared value slider sits beside the cards so it is visibly common to both sources. The current preferences shape keeps only the choices that the interface offers. |

---

## 6. Work plan

Steps are a proposal, not a schedule. The user chooses what runs and when.
Status is one of **Not started**, **In progress**, **Blocked**, **Done**.

| # | Step | Status | Notes |
| ---: | --- | --- | --- |
| 0 | Write and maintain this sprint file | **In progress** | Created in session 1. Updated continuously for the sprint's life. |
| A1 | Helper "Log all traffic" — tray toggle, off by default, writing decoded exchanges | **Done, proven live** | Session 1. `helper/src/traffic-log.cjs`, wired in `service.cjs`, offered in `tray.cjs`. 7 tests; suite 37/37. Installer rebuilt and verified. Captured 41 real exchanges from a live session. |
| A2 | Record a log and write the true payload shape into §2a | **Done** | All three panels captured and verified against the screenshots: `getUnitStatsRuneInfo`, `getUnitStatsArtifactInfo`, `getUnitStatsRelicInfo`. Keyed on `unit_master_id`; raw counts, full distributions, one call per panel, three per monster. Rune `effect_id`s match `RUNE-CANONICAL.md` §2 exactly. Outstanding for A3, but not blocking it: the artifact and relic secondary vocabularies, and what `request_type`/`favorite_type` select. |
| A3 | Design and build the recorded dataset from the observed shape | **Built; collection in progress** | Session 2. `scripts/collect-engraving-statistics.mjs` merges the traffic log into `app/data/engraving-statistics.json` additively and idempotently. Verified against the user's screenshots: every stored count reproduces the displayed percentage exactly. Dates per observation (decision 25). **396 of 1,086 monster types captured (36 %), none part-captured** — the rest is the user's clicking, in stages (decision 26), and `--todo` names what is next. |
| 1 | Establish the artifact rules — a canonical document from the game and a real export | **Done** | `docs/ARTIFACT-CANONICAL.md`. The *rules* were written in session 1; the **encoding** was settled in session 2 against 1,785 real artifact records found in the traffic log (§15). Five of its six open questions are closed and §5.3's pending verification is discharged. Three narrow fields stay pending and may not be computed from. |
| 2 | Model and read artifacts — types, parsing, validation from `game.data.artifacts` | **Done** | Session 4. `app/lib/artifact-properties.ts` holds the vocabulary and the grade table; `app/lib/artifacts.ts` reads and validates a record. All 1,864 artifacts in the user's own export parse, and every malformed shape in §13's list is rejected rather than repaired. Three corrections to §15 came out of it, recorded in §15.9. §15 answers what blocked it. The record shape, the property vocabulary and its category split, the power-up encoding and its grade invariant, and the conversion slot are all verified. `equipmentPrimaryTypes` and `addArtifactMainEffect` were confirmed correct, so the existing footholds extend rather than get replaced (Q6). Validation rules are in `ARTIFACT-CANONICAL.md` §13. |
| 3 | Artifact library — list, sort, filter, empty state | **Done** | Session 4. `app/components/artifact-list.tsx`, on its own **Artifacts** rail entry beside Monsters rather than as a fold on the workspace page — see decision 33. Filter strip and sortable full-width table follow the Monsters page throughout. Columns: location, value on mon, type, restriction, quality, main stat, subs. |
| 4 | Judgement — roll quality against the monster type's property preferences | **Partly done** | Session 4 connected it: `app/lib/artifact-value-on-monster.ts` feeds real artifacts and the engraving defaults into decision 32's calculation, and the library's **Value on mon** column is its first reading. All six of `ARTIFACT-CANONICAL.md` §16's worked examples reproduce exactly. It still judges against the *defaults* only — the user's own preferences arrive with step 5's larger half. The canonical benchmark calculation is built (decision 32), but could not receive real artifacts or preferences until steps 2 and 5 provided their validated models. No skill data or combat simulation: the artifact's own category selects which half of the preferences applies (decision 21). |
| 5 | Artifact preferences — per-type property preferences, the acceptable factor, and the defaults | **Partly done** | The **acceptable factor is built** (decision 31): `ArtifactSettings.acceptableWorth` in `Preferences`, validated against its five stops, offered as the slider in the Artifacts Settings area. **Conversion-stone and monster-scope settings are built** (decision 35) in the same validated `ArtifactSettings` shape, but the eventual draft calculation does not consume them yet. The **decision 29 defaults are built** (session 4): `app/lib/artifact-preferences.ts` classifies each monster type's engraving distribution by the fixed shares, per category, and returns `undefined` for a type the dataset has not captured so decision 18's *not judged* is the honest answer rather than a zero. The per-type property preferences the user states themselves are unstarted, and they are the larger half. Decisions 9–12, 15–21, **28–29**, **35**. Its own model in `Preferences`, extending `isValidPreferences`. Preferences are keyed `(category, property)` (decision 21), and Attribute and Type properties are presented separately (20). **Store only what the user actually stated** — never a copy of the seeded defaults, or a cleared preference becomes indistinguishable from an unset one and the default silently returns (decision 28). The statistics are read at the point of use as a fallback, applying decision 29's raw-count thresholds. §7 Q7a governs a type the dataset does not cover. Breaking change by design. |
| 6 | Monster fit — which monsters gain most from an artifact | Not started | The tagline's promise, and decision 30's **Best monster for this artifact** area. Under decision 13 it is a second reading of step 4's table rather than separate work. Depends on 2 and 4. |
| 7 | Replace the placeholder — route `artifacts` to the real component | **Done** | Session 3. `app/components/artifacts-section.tsx` carries decision 30's four `Disclosure` headings and their stated purpose, and nothing more. `app/page.tsx` routes `artifacts` to it; `'artifacts'` is out of the `UpcomingWorkspace` branch and out of `upcomingWorkspaces`, whose tagline now lives in the component. |
| 8 | Verify and finish — both extremes, layout check, definition of done, commit | Not started | `AGENTS.md` §7. |

---

## 7. Open questions

To be answered by the user, or by evidence, before the steps that depend on
them. **None of these has an assumed default.**

**Q1 — What is the canonical source for artifact rules? — Answered.**
`docs/ARTIFACT-CANONICAL.md`, written in session 1 from the user's rules
research and listing its sources in §14. The **game rules** were settled there,
and the **export encoding** was settled in session 2 (§15) against 1,785 real
artifact records the traffic log already held. Five of the six encoding
questions are closed; the remainder are three narrow fields, each marked pending
and none of which may be computed from.

**Q2 — What does the workspace answer first? — Answered (decision 13).**
All three: which artifacts to keep, which monster should wear a given artifact,
and what a given monster is missing. Under decision 9 they are three readings of
one table rather than three products, so none has to lead.

**Q3 — How are the user's artifact preferences expressed? — Answered
(decisions 9, 11, 12, 29, 31).** Artifacts get their own model in `Preferences`, not an
extension of `RunePotentialPreset`. Per monster type, the user sets each property
to **preferred** or **acceptable**; one global slider sets what an acceptable
property is worth against a preferred one, stored as the percentage itself
(decision 31) and **built** in the Artifacts Settings area. The engraving
statistics supply the defaults (decision 10), classified by decision 29's fixed
raw-count thresholds.

**Q4 — How much does this share with Rune Potential? — Answered, in part.**
The preference *models* are separate (decision 12). The **interface** is shared:
the `Disclosure` fold-out is reused as-is (decision 14), and preferred-versus-
acceptable keeps the established two-tone device — full ink against dimmed,
`AGENTS.md` §5. Whether any *calculation* is shared is still open, and probably
answers itself as "no": Rune Potential scores against stat targets, artifacts
score against declared property preferences.

**Q5 — Does artifact judgement need to know about equipped runes? — Answered by
decision 9.** No. Judgement reads the artifact and the monster type's property
preferences, nothing else. This also settles the related question about skill data: JASWA
never needs to know what Skill 2 does, because the user states whether they want
a Skill 2 property.

**Q6 — Do the existing footholds stay, move, or get replaced? — The evidence
half is answered.** Both footholds are **correct**, confirmed in session 2
against 1,785 real records: `pri_effect[0]` really is `100`/`101`/`102` for
HP/ATK/DEF and nothing else, and `pri_effect[1]` really is the flat value
`addArtifactMainEffect` adds. So neither has to be *replaced* — the choice is
only whether the fuller model lifts them into an artifact library, and relics
come along if it does. Decide it in step 2, on structure rather than on doubt.

**Q7 — How many monsters must the engraving dataset cover? — Answered
(decision 26): all of them, in stages.** The capture list is **1,086 monster
types** — every five-digit id at its highest awakening, less Material monsters
and test rows. Coverage is not a precondition for anything: a type without a row
is simply not judged (decision 18), so the workspace works at 4 types and works
better at 1,086. `--todo` names what is next; `--progress` says how far it has
got.

The reasoning that led there is kept below, because it is what makes the staged
answer safe.
The capture is manual, but **much cheaper than first estimated**. The second
recording showed one call serves a whole panel's dropdowns, so a monster costs
opening its Statistics tab and visiting three panels — not nine dropdown views.
Still, it is per monster type, and the roster is 279 copies across rather fewer
types. Which types earn the effort?

The stakes changed. The dataset is no longer a reference to check against — it
is where every monster type's **default** property preferences come from
(decision 10). A type outside the dataset opens with no opinion at all, and the
user must state its preferences by hand. So this question now decides how much of
the workspace is populated on first use.

**Q7a — What does a monster outside the dataset look like? — Answered
(decision 18).** Not yet judged, with a way to state its preferences, and out of
score-sorted views. No fallback from archetype or anything else: every artifact
would score zero against such a type, and a zero reads as an answer.

**Q8 — What happens to the dataset as the game moves on? — Half answered
(decision 25).** The **dating** half is settled: every observation carries its
own `observedAt`, and the file carries `observedFrom`, `observedTo` and
`lastMergedAt`. The game recomputes these statistics monthly, so a row's age is
part of what it says, and a recapture can target the stale rows rather than the
whole file. Because the collector merges by `(monster, panel)` and takes the
later observation, a partial recapture is a normal operation rather than a
rebuild.

**The override half is now answered too (decision 28).** A user-entered
preference always wins; the statistics are consulted **only** where the user has
stated nothing. A recapture therefore cannot disturb anything the user has
touched, and the dataset needs no merge policy against preferences at all.

**What is still open** is smaller than it was:

- **Whether JASWA shows a row's age**, and whether a figure past some age is
  presented differently or withdrawn. Nothing forces a choice yet, and under
  decision 28 a stale row can only affect a monster type the user never edited.

**Q10 — Are properties set per monster, or per something reusable? —
Answered (decisions 15 and 16).** Per **monster type**, keyed by
`unit_master_id`. No named roles, and nothing per owned copy: two Beth share one
set of property preferences, and the interface offers no way to differ. Reusable
roles were considered and rejected — they exist to spare the user from filling in
a whole roster, and decision 10's defaults already do that.

**Q10a — Should property preferences be copyable from one monster type to
another? — Answered (decision 19).** No. Each monster type states its own,
seeded from the engraving defaults.

**Q11 — Are attributes set like properties, or separately? — Answered
(decision 17).** Like any other property: every property is an independent
choice, and there is no element mechanic. Note that the *presentation* is split
by category (decision 20) — that is a division of the list, not a special case
for the five attributes.

**Q11a — Is the property list split by category, or shown whole? — Answered
(decision 20).** Split. Attribute properties and Type properties are presented
separately, and likely as separate areas of the workspace rather than as two
groups inside one editor.

**Q11b — Where do the fourteen "both" properties appear once the list is split? —
Answered (decision 21).** In **both** lists, set independently. A preference is
keyed by `(category, property)`, so `Life Drain` on the Type artifact and
`Life Drain` on the Attribute artifact are two separate statements and either may
be preferred without the other.

This turns decision 20 from a layout choice into a model one, and it carries
three consequences worth stating before step 5 starts:

- **The key is the pair.** Anything keyed on the property alone — a lookup, a
  default, a validation, a saved preference — is wrong by construction.
- **The defaults already agree.** A2 found the artifact statistics split on
  `slot_id`, with separate `Sub Prop. (Attribute)` and `Sub Prop. (Type)`
  distributions. The engraving data is keyed the same way the preferences are,
  so decision 10's defaults seed each side from its own figures.
- **§5.3's pending verification now matters more.** The canonical document warns
  that "available on both categories" is unconfirmed against a real export. If it
  proves wrong for some property, that property simply stops appearing in one of
  the two lists — the model survives, but the list contents change. Decoding the
  `effect_id` vocabularies (A3) is what settles which properties really belong
  where, and it should be trusted over §5.3's table.

**Q9 — What is the acceptance test for "done"?**
Beyond `AGENTS.md` §7 — what must the user be able to do in the browser for
this sprint to be finished?

---

## 8. Session log

One entry per session. What was asked, what was done, where it stopped.

### Session 1 — August 30, 2026

**Asked.** Set up a sprint for the whole Artifacts section, tracked in a
maintained markdown file that allows a new session to resume from it. The user
directs the sequence; the agent starts nothing on its own. Begin by writing the
file.

**Done.** Read `AGENTS.md`, `docs/LANGUAGE-CONTRACT.md`, `app/page.tsx`,
`app/lib/workspace-config.ts`, `app/lib/types.ts`, `app/lib/file-imports.ts`,
`app/lib/monster-grid.ts`, `app/lib/monster-stats.ts`, and searched the whole
source tree for artifact references, to record §2 from the code rather than
from assumption. Wrote this file.

A first draft of §2 claimed nothing but the import carried artifacts. The
search corrected that: the primary-type mapping, the main-effect maths, the
Monsters column, and `RunePotentialPreset.artifacts` already exist. §2 and the
open questions now reflect it.

**Not done.** No code was changed. No commit was made. Steps 1–8 are all
unstarted.

**Then asked.** Investigate whether the game's own statistical values can be
extracted directly — which rune sets and slot 2/4/6 properties are typically
used, and the same for artifacts and relics — and gather them into one dataset
to work from. Captured once, now; never a live or automatic import. Take care
to avoid suspicious mass lookups against the server.

**Done.** Read `helper/src/service.cjs`, `protocol.cjs`, `profile-store.cjs`,
`hosts.cjs`, and `app/lib/helper-client.ts`. Recorded §2a: the helper already
decrypts and sees every gateway request and response, and discards the ones it
does not recognise, so the statistics response is very likely already passing
through unused. Added decision 3, steps A1–A3, and questions Q7 and Q8.

**The finding that changes the shape of the request.** The data cannot be
pulled from the server at all — there is no request JASWA can make, and the
helper is a passive proxy by construction. It can only be *observed* as the
user opens the panels themselves. This removes the mass-lookup risk entirely:
capture generates no traffic beyond what ordinary play already generates. The
real cost is the user's time — three panel visits per monster type, once the
later recordings had corrected an initial estimate of nine — which is what makes
Q7 the question that governs the dataset's scope.

**Not done.** No code was changed. No capture was made. Nothing was committed.
All of A1–A3 and 1–8 are unstarted.

**Then asked.** The user approved building the helper capture, then stopped the
work before any code was written: they have SWEX, which can produce a complete
log, and offered it as the design input instead. They also asked whether all
the statistics arrive together when a monster is opened, or whether each panel
must be visited one at a time — and said clicking through every monster once is
acceptable.

**Done.** Read `helper/src/api.cjs`, `config.cjs`, `diagnostics.cjs`,
`tray.cjs`, the `start()` return value in `service.cjs`, and an existing test
for style — enough to build A1, which was then deliberately not built. Recorded
decision 4, rewrote §2a's "way in" for the SWEX log, and reordered the plan to
A0 → A1 → A2.

**Open, and the reason the log is worth waiting for.** Whether one response
carries all three panels or each dropdown fetches its own is unanswerable from
the source alone, and it is the difference between one interaction per monster
and nine. §2a now lists what the log must show: the request pattern, whether
the payload exceeds what the panel displays, and whether it keys on
`unit_master_id` or `unit_id`.

**Then asked.** Rather than reading an SWEX log, build "log all" into JASWA
Helper itself — usable both for this and for any later question about what can
be derived from the proxy — as a tray option, off by default.

**Built (A1).** `helper/src/traffic-log.cjs`: a `TrafficLog` that appends one
JSON line per decoded exchange, starts a fresh file each time it is switched
on, caps at 64 MB, serialises its writes to preserve traffic order, and never
throws at the caller. Wired into `service.cjs` **before** the import runs, so a
response `applyUpdate` cannot digest is still recorded — which is exactly the
kind this sprint is hunting. `stop()` flushes it. `tray.cjs` gained a
confirmed, default-off **Log all traffic** checkbox and **Open traffic log**,
with the entry count, the size limit and any write failure on the menu label.

**Verified.** `npm test` in `helper/` 36/36, including 6 new cases (off by
default, ordering, fresh file per session, the limit, a null command, a write
failure). `npx tsc --noEmit` and `npm run lint` clean. `tray.cjs` loads under a
stubbed Electron. An end-to-end check encrypted a request and a deflated
response in the real wire format, decoded them through `protocol.cjs`, and
confirmed both round-trip intact into the log. **Not exercised against the
live game** — that is A2, and it needs the user.

**Then asked.** The user supplied their own research into the current artifact
rules — written with a calculation program in mind — and asked for it to be set
up as a canonical reference work that any question or uncertainty about
artifacts can be settled from.

**Written (step 1, rules half).** `docs/ARTIFACT-CANONICAL.md`, following the
shape of `docs/RUNE-CANONICAL.md`: status header, verified rule separated from
pending verification, sources and a revision rule at the end. Restructured from
the research's 48 sequential sections into 15 subject sections, so a question
lands on one place rather than being reconstructed from a narrative — the equip
model, main property, grade and roll maths, the property pool, per-property
behaviour, additional damage, runtime context, rounding, conversion,
reappraisal, legacy, and the calculation contract with its validation rules.
Recorded decisions 6 and 7, answered Q1 in part, and moved steps 1 and 2.

**The document's own headline.** Most artifact material still circulating
describes the pre-v8.0.0 system, so the file states its vintage at the top and
confines pre-v8 behaviour to its §12. The three rules most likely to be
implemented wrong are called out where they bite: additional damage is a flat
per-hit bucket that truncates **per stat component** and cannot crit; buff
amplification multiplies the buff's strength and floors it, so
`ATK/DEF UP Effect +25%` is not +25 percentage points of ATK; and Accuracy
moves the ACC-vs-RES check, never a debuff's activation chance.

**Two places the document deliberately refuses to guess.** §5.3 flags that
"available on both categories" is unconfirmed against a real export, and §12
flags that legacy roll ranges are unknown — in both cases prescribing a warning
or a display-only treatment rather than a rejection or a computed projection.

**Not done.** No code was changed. No commit was made. The export encoding —
`ARTIFACT-CANONICAL.md` §15 — is untouched, and step 2 is blocked on it.

**Then asked.** The user supplied a second specification of the same artifact
rules — a full TypeScript engine sketch with data tables, validation, and combat
functions — and asked whether it was sound and usable, leaving the judgement of
how to absorb it to the agent, on the grounds that the agent is the one who will
later write the calculating code.

**Judged, and absorbed (decision 8).** The specification is a competent second
pass over the same research, not new evidence. Keeping it as a separate document
would have created two answers to every artifact question; committing it as code
would have violated `ARTIFACT-CANONICAL.md` §15, which forbids assuming an export
encoding. Four contributions were genuinely new and went into the canonical
document where each belongs:

- **§3** — the contribution count as a stored `ArtifactGradeDefinition` field, so
  the per-grade maximum table becomes a test fixture rather than a second source;
  plus the `allowedRolls` escape hatch if a property ever proves non-contiguous.
- **§9** — the rounding policy as one named table, with `NONE` stated as a
  positive claim that a mechanic does *not* truncate there.
- **§12** — unknown legacy ranges modelled as `null`, not `0`.
- **§13** — `ArtifactEvaluation`'s three axes (roll quality, monster
  compatibility, combat value), the sharpest available answer to "there is no
  single artifact score", plus the two rival definitions of roll quality.

**Four faults in the specification, recorded so they are not reintroduced.**
Its property IDs (`'skill_1_crit_damage'` and friends) are invented and would
have to be rewritten once the export is read — §13 now says so explicitly. Its
legacy definitions carry `minRoll: 0, maxRoll: 0`, which makes a maximum compute
to a plausible-looking zero. Its grade table gives Normal
`initialProperties: 0, powerUpRolls: 0`, which yields no lines at all for an
artifact that must finish with four — §3 now calls that case out. And it defines
base buff strengths inside the artifact layer, which §13's new "What belongs
outside this layer" now forbids.

**Not done.** No code was changed. No commit was made. The specification itself
was not added to the repository; only its findings were. Step 2 remains blocked
on §15.

**Then asked.** Whether anything about artifacts was still unknown or unsettled,
with the agent's questions gathered and asked in one go rather than as they
arose.

**Asked, after reviewing what was already recorded.** Four questions, chosen to
avoid re-asking anything the canonical document already answers and to skip the
§15 encoding questions, which an export settles rather than the user: which of
the three products leads; whether JASWA can know what a monster's Skill 2 does;
what becomes of `PresetArtifacts`; and whether the user holds practical
knowledge the rules do not carry.

**The answer that reshapes the sprint (decision 9).** The skill-data question was
the wrong question. Artifact value is not derived from what a property does in
combat — the user states, per monster type, which properties are preferred and
which are acceptable, and JASWA measures only how well the artifact rolled on
those. Two consequences follow immediately. The dependency on skill data
disappears entirely, which would otherwise have blocked most of the judgement.
And `ArtifactEvaluation`'s `combatValue` axis — the one needing the full §13
damage pipeline — is not needed for the product at all; roll quality against
declared property preferences is the whole calculation.

**The answer that promotes a side front (decision 10).** The engraving statistics
supply the default property preferences per monster type. A2 and A3 were an
investigation running
beside the main work; they are now what decides whether the workspace opens
populated or empty. Q7 — how many monsters the capture covers — therefore stopped
being a question about a reference dataset and became a question about how much
of the product works on first use.

**Also settled.** Artifacts get their own preference model rather than an
extension of `RunePotentialPreset`, whose `{atk, def, hp}` cannot express a
sub-property wish (decision 12). One global slider weights acceptable against
preferred (11). All three questions are answered rather than one leading (13).
The existing `Disclosure` fold-out is reused as-is, at the user's request, since
it already works well in Rune Potential (14). The user confirmed the canonical
rules cover their practical knowledge; nothing was added to
`ARTIFACT-CANONICAL.md` in this exchange.

**Three new open questions**, all consequences of decision 9 and 10 rather than
gaps in the rules: Q7a, what a monster type without preferences looks like when
the dataset does not cover it; Q10, whether preferences are per monster or
reusable across monsters as Rune Potential's roles are; and Q11, whether the five
attributes are treated like any other property or expand into the ten elemental
ones.

**Then asked.** Put those three questions one at a time, each with a
recommendation, so they could be agreed to or corrected singly.

**Answered, and the preference model is now settled (decisions 15–18).**
Preferences hang on the **monster type**, not the owned copy — two Beth cannot
differ, and the interface offers no way to try. They are declared without regard
to the monster's actual skills, and JASWA never checks whether one makes sense
for that monster; validating it would reintroduce exactly the skill-data
dependency decision 9 removed. Every property is an independent choice, with no
separate mechanic for the five attributes. A monster type with no preferences is
shown as not judged and kept out of score-sorted views, with no fallback score.

**The recommendation that was simplified by the answer.** For Q10 the
recommendation was per-monster preferences with a possible "copy from another
monster" convenience; the user's answer settled the model as per monster *type*
and left the convenience unasked, so it was recorded as Q10a rather than assumed
— and then declined outright (decision 19). For Q11 the recommendation was to
treat the ten elemental properties as ordinary properties, which the answer
confirmed and went further on: every property is its own choice, full stop.

**Then asked.** Q10a and Q11a, the two interface questions left over.

**Answered, and a term was retired (decisions 19 and 20).** No copying of
preferences between monster types. The property list is **split** by category
rather than shown whole — and, in the user's words, the two may in truth belong
as separate areas of the Artifacts workspace rather than as two groups in one
editor. This follows the game's own division, since a monster wears exactly one
Attribute and one Type artifact.

**The word "marks" was removed from this file.** The user asked what it meant,
which was fair: the sprint had adopted it as shorthand while `AGENTS.md` §2 and
§5 already use *mark* for a visual selected-state indicator. Both senses appeared
in this document. The settled term is **property preference**, defined in §2, and
the short form is not to be reintroduced.

**One new question (Q11b).** Splitting the list raises where the fourteen
both-category properties from `ARTIFACT-CANONICAL.md` §5.3 appear — in both
lists, in a third group, or otherwise. Worth noting that §5.3 carries a pending
verification warning that the both-categories claim is itself unconfirmed against
a real export, so the question is best settled after that is.

**Two consequences recorded rather than acted on.** §2 now states that
`MonsterPreference` (keyed on the owned copy) and artifact property preferences
(keyed on the monster type) are two differently-keyed models in one `Preferences`
object, and cannot be merged. §2a now states what hangs on the log's keying
answer: if the statistics key on `unit_master_id`, the defaults seed the
preferences directly; if on `unit_id`, the capture must be reduced per type
first, and disagreeing copies become a question that needs an answer. **A2 has
since answered this: `unit_master_id`**, so the defaults seed directly.

**Not done.** No code was changed. No commit was made.

### Session 1, later — the first live recording

**Asked.** The user installed the rebuilt helper, switched logging on, started
the game and opened a monster, but the tray still read `recording (0)` — had
they done something wrong?

**Answered: no.** The screenshot was taken before the game started; the log
filled correctly afterwards. 41 exchanges, spanning login and about seven
minutes of play.

**What the recording settled**, now recorded in §2a: the account arrives whole
at `HubUserLogin` (279 monsters, 1574 runes, 1251 artifacts) **without** any
engraving statistics, and opening a monster produced no gateway traffic at all.
So the figures are neither a by-product of the import nor fetched when a
monster is opened — they need their own request.
`getArtifactOccupiedSnapshotInfo`, the one artifact-shaped command present, is
the save/load-preset feature and unrelated.

**Why it fell short.** The recording never reached the **Statistics** tab, which
is the likeliest place the request is issued. §2a's recipe now names that tab as
its own step, and says what it means if steps 3–5 still produce nothing.

**Not done.** No production code changed. The payload shape is still unobserved,
so A3 stays blocked and the one-click-or-nine question is still open.

### Session 1, later still — the statistics captured

**Asked.** The user opened the Statistics window on Beth, visited some but not
all sub-panels, and asked for the log to be read again.

**Captured.** `getUnitStatsArtifactInfo` and `getUnitStatsRelicInfo`, both keyed
on `unit_master_id` (Beth = 17911). Full findings in §2a; the four that change
the work:

1. **One call per panel, not one per dropdown.** A single artifact response
   holds Main Property *and* both Sub Property views, split on `slot_id`. A
   monster costs visiting three panels, not nine dropdown views — Q7's cost
   estimate was far too pessimistic.
2. **Raw counts, not percentages.** `{ slot_id?, effect_id, count }`; the
   displayed percentage is the row's share of its group's total. Storing counts
   keeps the sample size that a percentage throws away.
3. **Nothing is truncated.** 46 artifact and 16 relic secondary rows — the
   panel's **Others** bucket and its scroll limit are presentation only. Better
   data than the screenshots implied.
4. **Keyed on the monster type**, which matches decision 15 without adjustment.

**Verified, not assumed.** Every percentage recomputed from the counts matches
the user's screenshots exactly — artifact primary 81.1/12.5/6.4 for slot 1,
artifact secondary 11.4/6.4/6.2/6.1/4.9, relic primary 68.6/28.0/3.4, relic
secondary 24.5/12.9/8.8. A stripped sample (account identifiers removed) was
kept in the session scratchpad for designing against.

**Still missing: the rune statistics.** The user visited only some panels, and
no rune equivalent appeared. `getRuneOccupiedSnapshotInfo` in the log is the
rune save/load-preset feature, not statistics. §2a lists this first under what
is still unknown, along with what `request_type: 3` and `favorite_type: 0`
select.

**Not done.** No production code changed. A3 stays blocked on the rune shape
and on the `effect_id` vocabularies, which are not yet decoded.

### Session 1, final — the rune panel, and A2 complete

**Asked.** The user opened the rune panel on Beth and asked for another read.

**Captured.** `getUnitStatsRuneInfo` — the third and last command. Same shape as
its siblings: `unit_master_id`, `request_type: 3`, `favorite_type: 0`. Its one
response holds `runeset`, `primary_effect` and `secondary_effect` together, so
the rune panel's four dropdowns are also served by a single call. **A monster
costs exactly three requests.**

**Verified against the screenshots, every figure.** Rune sets 30.8 / 18.0 /
12.7 / 11.3 / 8.0 / 6.5 (Fatal Blade through Vampire Revenge); slot 2 ATK %
55.9 and SPD 41.1; slot 4 CRI Dmg 83.7 and ATK % 8.2; slot 6 ATK % 89.4. All
exact.

**Two findings worth keeping.**

- `runeset` rows carry the **combination**, as `{ set_list, count }` —
  `[4, 8]` for a two-set build, `[4]` for a single set. The screenshot's
  **Others** 12.7 % turns out to be four real combinations the panel folded
  away, so the payload is richer than the display.
- The rune `effect_id` space is `1`–`12` and matches `RUNE-CANONICAL.md` §2
  **exactly** — `7` absent, as that document says. The statistics speak the
  language the codebase already knows, which is a useful corroboration of both.

`primary_effect` covers only slots 2, 4 and 6 — the choosable ones, agreeing
with `RUNE-CANONICAL.md` §3 — while `secondary_effect` covers all six.

**A2 is complete.** All three payload shapes are recorded in §2a, and a stripped
sample of all three responses is in the session scratchpad.

**Still open, but no longer blocking A3.** The artifact `2xx`/`3xx`/`4xx` and
relic small-integer secondary vocabularies are undecoded; `request_type` and
`favorite_type` are unexplained constants; and it is unknown whether a rarely
built monster returns empty lists or omits the keys — Beth is heavily used, so
that case has not been seen, and it decides what "no data" must look like.

**Not done.** No production code changed.

### Session 1, closing — the two interface questions, and a term retired

**Asked.** Q10a and Q11a, the two questions left over from the preference model.

**Q10a — copying preferences between monster types: no (decision 19).** The user
also asked what "marks" meant, which exposed a real fault in this file rather
than a misunderstanding: the sprint had adopted the word as shorthand while
`AGENTS.md` §2 and §5 already use *mark* for a visual selected-state indicator,
and both senses appeared here — §4 of this file warns about "selected-state
marks" three paragraphs from a decision about preference marks. The settled term
is **property preference**, now defined in §2, and every occurrence in the
preference sense was rewritten. The legitimate uses — visual marks, "marked as
legacy" — were left alone.

**Q11a — the property list is split by category (decision 20).** Attribute
properties and Type properties are presented separately, and in the user's view
may belong as separate areas of the workspace rather than as two groups in one
editor. It follows the game's own division: a monster wears exactly one artifact
of each category, so two shorter lists each answer a question the user actually
has, where one list of 33 mixes two.

**Q11b, raised and immediately answered (decision 21).** Splitting the list
raised where the fourteen both-category properties from
`ARTIFACT-CANONICAL.md` §5.3 go. The answer — both lists, set independently —
turns decision 20 from a layout choice into a **model** one: a preference is
keyed by `(category, property)`, so `Life Drain` may be preferred on the Type
artifact and unwanted on the Attribute one.

That is the right shape for the question being asked. A monster wears one
artifact of each category, so a `Life Drain` roll on the Attribute artifact is a
different opportunity from one on the Type artifact, competing against a
different field. Keying on the property alone would have forced one answer onto
both, and the fault would not have surfaced until a user set a preference in one
list and found it changed in the other.

**A2 had already made the same split.** The artifact statistics separate
`Sub Prop. (Attribute)` from `Sub Prop. (Type)` on `slot_id`, so the engraving
defaults are keyed exactly as the preferences are, and each side seeds from its
own distribution.

**A2's result closed a question this model depended on.** Decision 15 keys
property preferences on `unit_master_id`, and §2a had recorded what hung on the
statistics being keyed the same way. All three captured commands are keyed on
`unit_master_id`, so the engraving defaults seed the preferences directly, with
no mapping and no per-copy reduction. The dependency is discharged.

**Not done.** No code was changed. No commit was made.

**Stopped at.** The judgement model is settled end to end (decisions 9–21) and
A2 is complete. Two fronts remain, and the user chooses which.

- **A3** — design and build the recorded dataset. Unblocked by A2 for shape, but
  the `effect_id` vocabularies for artifacts and relics are still undecoded, and
  §7 Q7 still governs how many monster types the capture covers.
- **Step 1's remaining half** — an export, so `ARTIFACT-CANONICAL.md` §15's six
  encoding questions can be answered. This is what unblocks step 2, and step 2 is
  what everything after it waits on.

Q11b and Q8 shape step 5 but need not be answered before it starts.

### Session 1, continued — which game mode the statistics describe

**Asked.** The user suspected `request_type: 3` selected a game mode — PvE by
default, with RTA and perhaps Siege as alternatives — and drove the game while
the log was read after each step.

**`request_type` was not it.** It stayed `3` across every call: inside RTA and
out, on four monster types. It has never varied and nothing depends on it.

**The mode switch is `favorite_type`, and the name is a lie.** `0` is PvE, `1`
is RTA. The user was right that two models exist; the field carrying the choice
is simply misnamed. Established against the user's own correction — they
pointed out, rightly, that a favourite-monster reading could not explain it:

- `GetRtpvpFavoriteList` returned `favorite_list: []` — no RTA favourites at
  all — yet every RTA call sent `1`.
- Beth is not in `favorite_unit_list` either, so her `0`/`1` split was not
  about favourites.
- **Onmyouji (25012) settled it.** A favourite in neither list, opened in both
  places: `favorite_type: 0` outside RTA over 41,861 observations, `1` inside
  over 4,961, with `[6,10]` at 14.2 % against 5.2 % and `[13,15]` at 12.4 %
  against 23.9 %.

`emoticon_favorites` uses the same field name for emoji packs, so it is a
generic "which list" selector. JASWA must not name it after favourites.

**Relics have one model only.** `getUnitStatsRelicInfo` never sends the field,
and returned identical bytes inside and outside RTA.

**Decision 22: the dataset captures PvE**, for artifacts and relics alike — the
user's call. Recorded, along with the recipe change (open monsters from the
ordinary list, never from RTA) and a rule that a captured row carrying
`favorite_type: 1` is rejected rather than blended in.

**A separate hazard found while checking.** `GetUnitRecommendPage_V2` and
`getUnitStats*Info` send *different* `unit_master_id` values for the same
monster, ten apart — 25102 against 25112, 25002 against 25012 — apparently the
un-awakened and awakened forms. A capture that takes the id from the neighbouring
recommend call would key every row ten too low. §2a now says to read it from the
statistics request itself, and a new open question asks how the workspace maps
an owned monster to that id, since the catalog holds no awakening relation.

**Not done.** No production code changed.

### Session 1, continued — the awakening tier in the id

**Asked.** The user explained the two-id behaviour: they had opened a monster in
both its un-awakened and awakened forms, and JASWA wants only the awakened one.
They then noted that monsters also exist in **2A (second awakened)** form, which
likely has its own id — and opened a 2A Bulldozer so it could be checked.

**The structure, now established.** A `unit_master_id` is
`<family><tier><element>`: the last digit is the element, the second-to-last the
awakening tier. `0` un-awakened, `1` awakened, `3` second awakened. Tier `2` (52
catalog entries) and `4`–`7` (57) exist but were never observed and the account
owns none.

**2A is a separate monster, not a variant — and this is the finding that
matters.** Bulldozer 1A is `20812` and 2A is `20832`, both named "Bulldozer", so
only the id tells them apart. The 2A form returns its own distribution:
`[5,15]` at 37.0 % over 38,397 observations. The account holds **38 types at
tier 3** against 225 at tier 1, so treating 2A as 1A would file the wrong
evidence against roughly a seventh of the roster.

**A correction to what the previous entry recorded.** That entry framed the two
ids as "the recommend call sends the un-awakened id, the statistics call the
awakened one", implying a fixed offset of ten. That is only true for an
un-awakened monster. Where the monster is already at its final form the two
calls agree — Beth sent `17911` on both, Bulldozer 2A sent `20832` on both. The
rule that survives is simpler: **read the id from the `getUnitStats*Info`
request itself and keep the tier it names.**

**Decision 23 rewritten** to say awakened forms only, each tier its own row.

**One question left open**, and it is small: the account owns exactly one
tier-0 type, so a monster held un-awakened is a rare case rather than a
structural gap. Either derive `id + 10` or leave it unjudged.

**Not done.** No production code changed.

### Session 1, continued — the dataset is a catalog, not an account

**Asked.** The user stated the collection rule: gather statistics only for each
monster type's **highest awakening**, because what players hang on an
un-awakened monster is mostly spare runes parked out of the way and says nothing
about the monster.

**Then corrected a misreading.** The agent had begun reasoning from the user's
own roster — counting how many owned types sat at each tier, and asking whether
a monster owned at 1A but having a 2A form should be captured at 2A. That
framing was wrong. **The dataset is catalog-wide and has nothing to do with the
account.** Statistics are collected per monster *type*, at its highest
awakening, full stop. The property preferences the user later sets are likewise
per type. Ownership enters at exactly one point — recommending artifacts for the
user's own monsters — and even there only by looking up the preferences already
recorded against that monster's type.

Recorded as **decision 24**, and decision 23 rewritten to say "one row per
monster type, its highest awakening" rather than describing tiers in terms of
what the account holds. The account-derived counts have been taken out of §2a.

**A check the correction made worth running.** Since the capture must resolve
"highest awakening" from the catalog rather than from owned monsters, the
`id + 20` arithmetic was tested across all 3089 entries: 111 of 1237 tier-1
entries have a tier-3 partner, 103 sharing the 1A name and 8 renamed
(`13211` Lulu → `13231` "Lulu and Friends"). The only failures are six
six-digit boss and tower entries with no tier-1 partner, which are not player
monsters. Recorded in §2a as promising but unproven.

**Not done.** No production code changed.

### Session 2 — August 30, 2026 — A3 built, and collection begins

**Asked.** Run the large data-mining: the user goes through the statistics for
every monster in the game, the agent reads out the values for runes, artifacts
and relics and keeps them in one dated reference file, which can later define
default preferred/acceptable artifact values. **The dataset must be dated**,
because the game produces new statistics every month.

**Two decisions taken before any code, because neither could be fixed
afterwards.** How much of the catalog to cover — all of it, in stages
(decision 26) — and how to keep a multi-day capture from losing yesterday's
work (decision 27). The second was a real hazard rather than a hypothetical:
`TrafficLog.setEnabled(true)` clears the file, so a second day's recording would
have silently discarded the first.

**Built.** `scripts/collect-engraving-statistics.mjs` and
`app/data/engraving-statistics.json`. The collector merges the traffic log into
the dataset additively and idempotently, keyed `(unit_master_id, panel)` with
the later observation winning. Modes: merge, `--dry-run`, `--progress`,
`--todo [n]`, `--log PATH`.

**Verified against the user's own screenshots, not merely against itself.**
Every percentage recomputed from the stored counts matches exactly — artifact
primary 81.1/12.5/6.4, artifact secondary 11.4/6.4/6.2/6.1/4.9, relic primary
68.6/28.0/3.4, rune sets 30.8/18.0/12.7/11.3/8.0/6.5. The 7 RTA responses in the
log were rejected and the 8 PvE panels kept, which is decision 22 working. A
second run reported "0 new, 8 already current" and wrote nothing.
`npx tsc --noEmit` and `npm run lint` both clean.

**Dating, as the user required (decision 25).** Three levels: each panel carries
its own `observedAt`, and the file carries `observedFrom`, `observedTo` and
`lastMergedAt`. Because the merge takes the later observation per
`(monster, panel)`, next month's recapture can target the stale rows instead of
rebuilding the file — which is the point of dating rows rather than the file.

**Two of §2a's unknowns fell out of the catalog work.** Tier `2` is the
*Imperfect* line and tiers `4`–`7` are Ancient Spirits, guild bosses and Towers
— **none is an awakening above 2A**, so "highest awakening" is settled. And the
capture list is now a number rather than an estimate: **1,086 monster types**,
being the 1,110 five-digit ids at highest awakening less 12 Material monsters
and 16 Korean-named test rows.

**A finding worth keeping about the payload.** No tail to trim: all 23 artifact
secondary rows for a slot sit above 1 %, so the distribution is informative all
the way down and nothing is dropped. Compact JSON puts full coverage at 4.7 MB
against 13 MB indented, which is why the file is written one line per monster.

**Not done.** No commit yet. Collection itself is 55 of 1,086 types — that is the
user's clicking, and it is what everything downstream of decision 10 waits on.
The `effect_id` vocabularies for artifact `2xx`/`3xx`/`4xx` and relic small
integers are still undecoded; the dataset stores them faithfully as raw ids, so
decoding is a later mapping rather than a recapture.

**Stopped at.** The collector is ready and the recipe is in §2a. The user
captures monsters in stages and runs the merge after each session. Q8's second
half — what a recapture does to a preference the user has edited — should be
answered before step 5 builds the preference model, because the
edited-versus-inherited distinction cannot be recovered after the fact.

### Session 2, continued — the override rule

**Stated by the user.** User-entered preferences always take precedence over the
game's figures. The statistics are used **solely** as defaults, where the user
has entered nothing.

**Recorded as decision 28, and it closes Q8.** The dating half was already
settled by decision 25; this settles the override half, and does it by removing
the problem rather than solving it. Because a recapture cannot touch anything
the user has stated, there is no merge policy to design between a changed
default and an existing preference, and no "your default has moved" case to
present.

**The one thing it demands of the model, recorded in §2 before step 5 starts.**
It requires three states where a careless implementation has two: stated,
never stated, and *deliberately cleared*. Seeding a monster type's stored
preferences from the defaults when it is first viewed would collapse "stated"
into "never stated"; treating a cleared preference as absent would collapse
"cleared" into "never stated", and the default would come back and overrule the
user — the exact outcome decision 28 forbids. So the preferences record only
what the user actually said, and the statistics are read at the point of use.
This is `AGENTS.md` rule 3 again, in the place it costs most.

**Not done.** No code was changed; step 5 is where this takes effect.

### Session 2, continued — the first real capture run, and what it taught

**Asked.** The user clicked through the statistics tabs for a number of monsters
as a test, and asked whether everything had been captured or something was
missed.

**Checked, and merged.** 366 log lines, 61 monster types, **55 complete and 5
short**. The dataset now holds 60 types (Kaki being present but RTA-only). No
empty lists, and no thin evidence anywhere: the smallest artifact sample is
1,942 observations (Anduril) against 267,831 at the top (Raoq).

**The five gaps have two different causes, and only one is a mistake.**

- **Purian, Anduril, Eludain, Drogan** (`11731`/`33`/`34`/`35`) are missing
  relics because **recording stopped mid-family** — the log's final line is an
  artifact call at 14:19:23, and the relic sweep for that family never happened.
- **Kaki** (`25112`) has all three panels, but every one was fetched **inside
  RTA** (`favorite_type: 1`), so decision 22 rejected them. Nothing was missed
  by the user; it was captured from the wrong screen back in the earlier
  exploration.

**A pattern in the log worth knowing, because it makes capture cheaper than the
recipe assumes.** The user does not visit three panels per monster. Opening one
monster's Statistics and switching element re-fetches the *same panel* for all
five of a family, so a family is captured as three sweeps of five rather than
five visits of three:

```
14:18:56  12031 Rune      14:19:00  12034 Artifact   14:19:05  12031 Relic
14:18:56  12033 Rune      14:19:01  12033 Artifact   14:19:06  12033 Relic
14:18:57  12034 Rune      14:19:02  12031 Artifact   14:19:07  12034 Relic
```

That is ~11 seconds for five monster types. It also explains the failure mode:
an interrupted run loses **one panel across a whole family**, not one monster.
So the thing to check after a session is exactly what `--todo` now reports
first.

**Changed.** `--todo` lists partially captured monsters ahead of untouched ones,
with the panels each still needs. A half-captured monster is the cheapest work
available and the easiest to lose track of, since nothing on screen says a panel
was missed.

**One reassurance from the repeats.** Bulldozer 2A's rune panel was captured
four times over 23 minutes and returned byte-identical counts (38,397
observations, `[5,15]` at 14,210) every time. The figures are stable within a
session, so revisiting a monster costs nothing but time and the merge keeps the
latest timestamp.

**Not done.** No production code changed beyond the `--todo` ordering.

### Session 2, continued — the dataset reaches a third of the catalog

**Asked.** The user captured a large batch and asked for it to be merged, then
to pause collection and move on to building the workspace itself.

**Merged.** 1,480 log lines, 392 monster types touched, **383 now complete —
35 % of the capture list**, from 55 before. 2.36 MB on disk, which puts full
coverage near the 4.7 MB projected.

**Quality checked rather than counted.** No empty lists and no thin evidence:
artifact sample sizes run from 275 (Stark, a recent monster) through a median of
16,302 to 417,100 (Icaru). Nothing in the batch needs recapturing.

**Six outstanding, both familiar cases.** Kaki still carries only its RTA rows,
and the five Frieren elements are missing relics because recording again stopped
just after a relic sweep — the log's last line is `24715 Relic` at 14:46:47.
Same failure mode as the 117xx family, and `--todo` names them first.

**Collection is deliberately paused here**, with the workspace to be built
against a third of the catalog. Decision 18 is what makes that safe: a monster
type without a row is not judged rather than judged as zero, so partial coverage
is the ordinary state the interface must handle well — and building against it
now means that state gets tested for real rather than assumed away.

### Session 2, continued — the export encoding, found in the log we already had

**Asked.** Move on from collection to building the workspace.

**The blocker was checked before choosing a direction, and it was gone.** Step 2
had been blocked since session 1 on `ARTIFACT-CANONICAL.md` §15 — the export
encoding, which needed "a real export". The traffic log contains one:
`HubUserLogin` carries **1,251 account artifacts and 534 equipped**, 1,785
records with full field detail. No export file was ever needed.

**§15 rewritten from observation.** Five of its six questions are closed, and
every claim is a count over the 1,785 records rather than a reading of a guide:

- **The record.** `type` 1 = Attribute (carries `attribute`), 2 = Type (carries
  `unit_style`); the unused one is always `0`, without exception. `rank` and
  `level` are constants (5 and 15) — §2's "drops arrive finished" visible in the
  data, so there is no upgrade path to model.
- **`pri_effect` confirms both existing footholds.** Exactly three id/value
  pairs exist — `100`→1500 HP, `101`→100 ATK, `102`→100 DEF — which is
  `equipmentPrimaryTypes` and `addArtifactMainEffect` proven right rather than
  merely plausible. That answers Q6's evidence half.
- **The grade invariant holds in all 1,785 records.** `sec_effects` position 2
  is the power-up count, and its sum per artifact is exactly `natural_rank − 1`:
  Rare 2, Hero 3, Legend 4. §3's table, observed. The grade is stored *and*
  derivable, so the two are a mutual check and a disagreement means a corrupt
  record.
- **The vocabulary splits exactly as §5 predicted** — `2xx` both categories,
  `3xx` Attribute-only, `4xx` Type-only, with **no crossover in 1,785 records**.
  This discharges §5.3's pending verification, so validation may now reject a
  category violation instead of warning.
- **Legacy properties are recognisable.** Three ids — `201`, `205`, `217` —
  appear in the account but in none of the 383 captured monster types' statistics,
  and all three sit on a single artifact added in 2022. That is §12 in the data.
  The reverse also holds: every id in the statistics appears in the collection.
  Recorded with a caution — absence from the statistics is a strong signal but
  **not a definition**, so the legacy list stays explicit.
- **The conversion slot is position 3**, non-zero on at most one line per
  artifact across all 1,785 — precisely §10's binding restriction, which makes
  `convertedPropertyIndex` a faithful model and validation rule 13 checkable.

**Three fields stay pending, and are marked so.** `attribute`/`unit_style` value
`98` (27 records) is neither an element nor a monster type. Position 3's
magnitude exceeds 1 on 17 lines, so it is not a boolean. Position 4 is set on
exactly one line of 452 equipped artifacts and **only ever on a line with zero
power-ups** — a reappraisal trace is the obvious guess and remains a guess.
Under §14 none of them may receive a fallback rule.

**One rule vindicated at the worst moment.** Property `218` (Additional Damage
by HP, 0.20–0.30 %) is stored as a decimal and arrives with float error already
present — `0.6000000000000001` is in the data. §9's "store hundredths of a
percent, never floats" is not a stylistic preference.

**Not done.** No production code changed. Step 2 is unblocked but unstarted.

### Session 2, continued — the outstanding six closed

**Asked.** The user re-visited the monsters `--todo` had named and asked for
another merge. (Kahli first, on a misreading of the list; then Kaki.)

**Merged, and the backlog is empty.** 393 of 1,086 monster types complete —
**and for the first time nothing is part-captured.** Every type the dataset
holds now carries all three panels.

- The five **Frieren** elements gained their missing relic panel.
- **Kaki** was recaptured from the ordinary monster list, so its PvE rows
  replaced the RTA-only ones decision 22 had been rejecting — 190,138
  observations where there had been none usable. The whole 251xx family came
  with it, Suiki through Ongyouki.

**Checked rather than counted, again.** No empty lists and no panel under 50
observations anywhere in the file. Sample sizes on the new rows run from 303
(Frieren Dark, a very recent monster) to 190,138.

**What the two rounds of gap-filling confirm about the workflow.** Both gaps
came from the same two causes the earlier entries named — recording stopped
mid-family, and a monster opened inside RTA — and both were closed by exactly
the work `--todo` described, with no hunting. The part-captured-first ordering
is doing its job.

### Session 3 — August 30, 2026 — default thresholds chosen

**Asked.** Propose a formula that uses the captured artifact statistics to set
preferred and acceptable defaults, separately for Main Property and Sub Property,
but remains easy to read and explain.

**Measured before choosing.** Across the 396 captured monster types, the median
largest main-property share is 82.0 % for Attribute artifacts and 75.6 % for Type
artifacts; the median second share is 12.1 % and 16.7 %. Sub-property use is much
flatter: its median largest share is 12.5 % and 13.1 %, while the second is 7.1 %
and 7.4 %. The two distributions cannot honestly use one percentage scale.

**Decision 29.** The user chose fixed shares of each monster type's own,
category-specific distribution. A main property is preferred at 40 % and
acceptable at 10 %; a sub-property is preferred at 10 % and acceptable at 5 %.
The shares are calculated from raw counts, never the game's rounded display
percentages. A lower share is neither.

**Why this is the working fit.** It produces a typical main-property default of
one preferred and one acceptable value. For each Attribute or Type sub-property
list it produces one preferred and three acceptable values, while leaving a flat
distribution without an invented preferred choice. The rule is now recorded in
§2 and the step 5 plan; implementation remains unstarted.

### Session 3, continued — the four areas, and the placeholder retired

**Asked.** Begin building the content of the Artifacts page. Put up the four
menu items that had been discussed before, as headings only — carrying any
content already clearly defined, and **no invented content beyond that**.

**The four were not written down anywhere.** They had been settled in
conversation but never recorded here, and the agent could not find them in the
repository, so it stopped and asked rather than reconstructing a plausible four
from §3's seven in-scope items. The user supplied them: *Best monster for this
artifact*, *Best artifact for this monster*, *Recommended changelist*, *All
artifacts*. Recorded as **decision 30** — which is the lesson as much as the
decision: a settled choice that lives only in a conversation is not settled for
the next session.

**Built (step 7).** `app/components/artifacts-section.tsx` — the four areas as
shared `Disclosure` fold-outs (decision 14), in decision 30's order, on the
`WorkspacePage` frame with the shipped tagline as its `PageHeader`. `page.tsx`
routes `artifacts` to it.

**The placeholder was removed rather than left beside it.** `'artifacts'` is out
of the `UpcomingWorkspace` branch and out of `upcomingWorkspaces`, whose
`Record` key union narrowed with it. `AGENTS.md` §0 forbids leaving the remnant,
and a second copy of the tagline in a table nothing reads is exactly the kind of
thing that later drifts from the one on screen.

**What each section says, and why it says so little.** A heading plus one
sentence of purpose, drawn only from what is already decided: decision 18's
"not ranked at all rather than ranked last" under the first, decision 9's
preferred-and-acceptable roll judgement under the second. No scores, no
placeholder rows, no invented controls. Writing an interim reading of the
judgement would put a second answer beside the one steps 2–6 will produce.

**One thing the frame does handle now.** With no import, the four folds would
have been four empty boxes, so the no-game case keeps the `empty-state` panel
and its next step, and the first fold opens by default only when an import
exists.

**Verified.** `npx tsc --noEmit` clean, `npm run lint` clean, `npx next build`
succeeds — so the new module typechecks and compiles. **The visual check of
`AGENTS.md` §3 and §7.4 was not done:** no browser-control tool is available in
this session, so the four folds were not opened, and the empty and imported
cases were not driven on screen. The dev server on `http://localhost:3000/` is
running and was confirmed responding; its initial HTML carries no workspace copy
for *any* page, this app being client-rendered, so fetching it proves nothing
about the section either way. This is the one step of the definition of done left
outstanding, and it needs the user or a browser session.

**Not done.** Steps 2–6 are unstarted; the four sections are frames waiting for
them. (A fifth, **Settings**, was added in the next exchange.)

### Session 3, continued — a Settings area, and the acceptable factor built

**Asked.** Add a fifth area, **Settings**, holding a slider for what percentage
an acceptable property is worth against a preferred one — keeping Rune
Potential's style and humorous tone, and a consistent look with that page.

**This is decision 11, which had been settled but never built.** So the work was
implementation rather than a new choice, and the one genuine decision left in it
was what to *store*.

**Decision 31: store the percentage, not a step index.** Rune Potential's
sliders are all 1–5 steps with prose labels, and copying that shape would have
meant a step index translated into a factor somewhere else. The judgement
multiplies by this value, so the number the user reads and the number the
calculation uses are kept as one thing. The slider is still a five-stop control
with a label per stop, so it looks and behaves like its neighbours; the stops
are 0, 25, 50, 75 and 100 %, and the stored value is the percentage.

**50 % is the default**, being the honest midpoint. The extremes are deliberately
reachable but read as answers rather than as an off switch: at 0 % an acceptable
property may as well be unwanted, at 100 % the preferred/acceptable distinction
stops meaning anything.

**Persisted through the one existing route.** `ArtifactSettings` in
`app/lib/types.ts`, `Preferences.artifacts`, `defaultArtifactSettings` and
`isArtifactSettings` in `file-imports.ts`, and `updateArtifactSettings` in
`page.tsx` going through `changePreferences` like every other preference. Added
to `docs/LOCAL-PERSISTENCE-CONTRACT.md`, as that document requires of new
persistent data. The validator checks the value against **the five offered
stops** rather than a 0–100 range: a `.sw` file claiming 37 % did not come from
this slider, and `AGENTS.md` §0 says to reject rather than repair.

**One breaking consequence, by design.** `isValidPreferences` now requires
`artifacts`, so preferences already in IndexedDB fail validation once and fall
back to `blankPreferences()`. That is `AGENTS.md` §0's intended behaviour and
the existing fallback in `page.tsx` already handles it, but it does mean saved
Rune Potential settings reset on the first load after this change.

**Then corrected, on the user's word.** The draft had copied Rune Potential's
`statistics pending` box into the aside and labelled the slider *Acceptable
properties*. Both were wrong: the statistics box is Rune Potential's, not a
house fixture to replicate, and the label was insider shorthand. The box is gone
— with it the whole `settings-layout`/aside scaffold, leaving the slider in a
plain `slider-grid` — and the label is now **Acceptable ctr. preferred**, which
states the comparison the slider actually makes. A `.slider-grid.single` CSS
modifier written for the one-slider case went with it; `globals.css` ends up
untouched.

**Verified.** `npx tsc --noEmit`, `npm run lint` and `npx next build` all clean.
A 22-case structural check of the contract passed: the default, both extremes
accepted as real answers, `37`/`'50'`/`null`/`NaN`/missing all rejected, 0 %
distinguishable from absent (`AGENTS.md` rule 3), and the step↔percentage
round-trip exact at every stop.

**Not verified, and it is the same gap as the previous entry.** No browser-control
tool is available in this session, so the slider was not dragged, the five labels
were not read on screen, the fold was not opened, and rule 2's
screenshot-interact-screenshot comparison was not done. The persistence gate in
`LOCAL-PERSISTENCE-CONTRACT.md` — a changed value surviving a reload, for an
empty and a populated workspace — also needs the running app. Outstanding for
the user or a browser session.

### Session 3, continued — the running order settled

**Asked.** Three corrections to the frame: Settings must not open by default and
should behave exactly as the other folds do; Settings moves to the bottom; and
*Recommended changelist* moves to the top and is renamed **Recommendations**.

**Done, and decision 30 rewritten** — the order is now Recommendations, Best
monster for this artifact, Best artifact for this monster, All artifacts,
Settings, with **no `defaultOpen` on any of them**.

**What the reordering says about the page, worth recording because it is a
product judgement rather than a preference.** Recommendations at the top makes
the account-wide "what should I actually change" the thing the page offers first;
the two "best" views answer a narrower question the user has to arrive already
holding, about one artifact or one monster. Settings at the bottom is the setting
you touch once. And with every fold closed and identical, the page stops
asserting which question the user came with — the previous draft's
`defaultOpen` on Settings had the workspace opening on its own configuration,
which is the least interesting thing on it.

**Verified.** `npx tsc --noEmit`, `npm run lint` and `npx next build` clean; the
22-case settings contract check still passes, being untouched by an ordering
change. The visual gap from the previous two entries stands unchanged.

### Session 4 — August 30, 2026 — value benchmark settled

**Asked.** Establish one canonical artifact value that rewards both roll quality
and the rarer case where an artifact matches more of a monster's desired sub
properties, without presenting an exceptional `2 preferred + 2 acceptable`
artifact as a disappointing 75 % result.

**Decision 32 revised and approved.** `calculateArtifactOptimalValue` uses the
fixed max-roll benchmark of **one preferred and three acceptable sub
properties**, not the preferences an artifact happens to match. Main-property
preference remains a separate multiplier. At the default 50 % acceptable
factor, the reference profile is 100 %, `2 preferred + 2 acceptable` is 120 %,
and four preferred lines are 160 %.

**Why a fixed benchmark is necessary.** The earlier weighted mean divided by
the artifact's matching weights. That normalised missing desired lines away: one
max preferred line plus three unwanted lines could score the same as four
desired max lines. A denominator fixed before reading the artifact preserves
the opportunity represented by all four slots. Scores above 100 % are a feature,
not an overflow: the reference is ordinary excellence, and extra preferred
lines identify a rarer artifact.

**Built.** The executable formula lives only in
`app/lib/artifact-optimal-value.ts`; `ARTIFACT-CANONICAL.md` §16 gives the same
contract, examples, endpoints, invalid-input behaviour, and the reason for the
design. The calculation has no real call site yet: the validated artifact and
preference models remain steps 2 and 5.

### Session 5 — August 31, 2026 — conversion-stone settings

**Asked.** Add an owned-monster checkbox, make Conversion stone value a
four-step scale like Rune Potential's Enchanted gems, and split conversion
stones into an owned-inventory option and a theoretical-calculation option.
Keep the stone-value and acceptable-versus-preferred sliders outside the option
cards so both sources share them.

**Built (decision 35).** `Artifacts` Settings now defaults to **Only factor in
mons you own**, with **Use only stones you own** selected. The owned source has
a grade dropdown whose choices read `Normal (and under)` through
`Legend (and under)`. The theoretical source keeps its existing grade question
and plain `Normal` through `Legend` choices. Both grade answers persist
separately, so switching sources does not overwrite the other answer.
Conversion stone value stores a four-step scale and uses the same
`None`/`Average`/`Three quarters`/`Maximum` vocabulary as Enchanted gems;
`Acceptable ctr. preferred` remains a five-stop percentage outside the cards.

The shared home-page option card is now reusable by the artifact source choice,
while its fixed box, radio, disabled-body and responsive behaviour stay the
same. New fields are part of the complete current preferences contract, so an
older preferences record is rejected and the existing blank-preferences path
provides the new shape.

**Verified.** `npx tsc --noEmit`, `npm run lint` and `npx next build` all pass.
The existing `http://localhost:3000/` server returned HTTP 200. Playwright
exercised the empty workspace and a minimally populated import: the checkbox
defaulted on, all labels and options appeared, the full-value state reached
the maximums, option switching kept every outside control at the same x/y/size,
and both states survived reload. The browser-control bridge itself had no
session, so the visual evidence came from Playwright screenshots against the
user's already-running local server.

### Session 6 — August 31, 2026 — source cards clarified

**Asked.** Replace the two grade dropdowns with clearer source descriptions:
**Conversion stones / Calculated values** for the fixed conversion range and
**Engraved conversion stones / Use what you've got** for the engraved stones
the user owns. Place the shared **Conversion stone value** slider to the right
of the source cards, using two thirds of the settings panel for those cards.

**Built.** The two grade fields are removed from `ArtifactSettings`, its
defaults and its validator. The cards keep their fixed radio-control boxes and
now carry only the explanatory copy. The four-step value slider is the right-
hand third on wide screens and stacks below the cards at the responsive
breakpoint; the acceptable-property slider remains below the source choice.
