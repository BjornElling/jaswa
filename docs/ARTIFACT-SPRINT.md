# Artifact Sprint — working record

**Status:** Live working document for the Artifacts workspace
**Started:** August 30, 2026
**Last updated:** August 30, 2026 — session 1, the judgement model settled
(decisions 9–21): each monster **type** states its own property preferences,
keyed `(category, property)`, JASWA measures only the roll, and a type with none
is not judged rather than scored zero

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
member of the `Page` union, sits in the `Workspaces` group of
`navigationGroups` with the glyph `◇`, and has copy in `upcomingWorkspaces`.

**The placeholder.** `app/page.tsx` routes `artifacts` into
`UpcomingWorkspace` together with `optimizer`, `speed`, `gems`, and `relics`.
`app/components/upcoming-workspace.tsx` renders title, tagline, and one empty
state.

**The imported data.** `app/lib/file-imports.ts` already carries artifacts
through the import:

- `artifacts` is one of `expectedSections`, so its presence is reported in
  `ImportReport.knownSections`;
- `completeEquipmentCollections` merges account-level `data.artifacts` with the
  artifacts equipped on each unit and de-duplicates them on `artifact_id`, so
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
  and should be excluded from the capture anyway. **Still unproven** that the
  rule holds for every real monster, and tiers `2` and `4`–`7` are unexamined.
- **What tier digits `2` and `4`–`7` mean.** 52 and 57 catalog entries
  respectively, none observed in a statistics call. They matter only if one of
  them turns out to be an awakening above tier 3, which would change what
  "highest awakening" resolves to.
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

---

## 6. Work plan

Steps are a proposal, not a schedule. The user chooses what runs and when.
Status is one of **Not started**, **In progress**, **Blocked**, **Done**.

| # | Step | Status | Notes |
| ---: | --- | --- | --- |
| 0 | Write and maintain this sprint file | **In progress** | Created in session 1. Updated continuously for the sprint's life. |
| A1 | Helper "Log all traffic" — tray toggle, off by default, writing decoded exchanges | **Done, proven live** | Session 1. `helper/src/traffic-log.cjs`, wired in `service.cjs`, offered in `tray.cjs`. 7 tests; suite 37/37. Installer rebuilt and verified. Captured 41 real exchanges from a live session. |
| A2 | Record a log and write the true payload shape into §2a | **Done** | All three panels captured and verified against the screenshots: `getUnitStatsRuneInfo`, `getUnitStatsArtifactInfo`, `getUnitStatsRelicInfo`. Keyed on `unit_master_id`; raw counts, full distributions, one call per panel, three per monster. Rune `effect_id`s match `RUNE-CANONICAL.md` §2 exactly. Outstanding for A3, but not blocking it: the artifact and relic secondary vocabularies, and what `request_type`/`favorite_type` select. |
| A3 | Design and build the recorded dataset from the observed shape | Not started | **Now a product dependency, not a reference.** Decision 10 makes this the source of every monster type's default property preferences, so what it covers is what the workspace can open with. A2 confirmed the keying is `unit_master_id`, which matches decision 15 — the defaults seed the preferences directly, with no mapping. Scope still governed by §7 Q7. One-time capture, never a live import. |
| 1 | Establish the artifact rules — a canonical document from the game and a real export | **Mostly done** | `docs/ARTIFACT-CANONICAL.md` written in session 1 from the user's rules research, then extended from a second independent specification (decision 8). The *game rules* are recorded. What remains is the **encoding**, listed in its §15: field layout, property IDs, how power-up counts and the conversion slot are stored. That needs a real export. |
| 2 | Model and read artifacts — types, parsing, validation from `game.data.artifacts` | **Blocked** | Blocked on `ARTIFACT-CANONICAL.md` §15 — the export encoding. The rules it must enforce are already written (§13 validation rules). |
| 3 | Artifact library — list, sort, filter, empty state | Not started | The first thing the user can see. Sections framed by the shared `Disclosure` (decision 14). |
| 4 | Judgement — roll quality against the monster type's property preferences | Not started | Decision 9: value is how well the artifact rolled on the properties the user preferred, weighted by the decision 11 slider. No skill data, no combat simulation. The artifact's own category selects which half of the preferences applies (decision 21). Needs step 2's parsed values and step 5's preferences. |
| 5 | Artifact preferences — per-type property preferences, the acceptable factor, and the defaults | Not started | Decisions 9–12, 15–21. Its own model in `Preferences`, extending `isValidPreferences`. Preferences are keyed `(category, property)` (decision 21), and Attribute and Type properties are presented separately (20). Defaults come from A3; §7 Q7a governs a type the dataset does not cover. Breaking change by design. |
| 6 | Monster fit — which monsters gain most from an artifact | Not started | The tagline's promise. Under decision 13 it is a second reading of step 4's table rather than separate work. Depends on 2 and 4. |
| 7 | Replace the placeholder — route `artifacts` to the real component | Not started | Remove `'artifacts'` from the `UpcomingWorkspace` branch and from `upcomingWorkspaces`. |
| 8 | Verify and finish — both extremes, layout check, definition of done, commit | Not started | `AGENTS.md` §7. |

---

## 7. Open questions

To be answered by the user, or by evidence, before the steps that depend on
them. **None of these has an assumed default.**

**Q1 — What is the canonical source for artifact rules? — Answered, in part.**
`docs/ARTIFACT-CANONICAL.md`, written in session 1 from the user's rules
research and listing its sources in §14. The **game rules** are settled there.
The **export encoding** is not: no export is in the repository, so §15 lists the
six encoding questions that remain, and the document forbids computing a
maximum, a projection, or a score from a guessed encoding until they are
answered.

**Q2 — What does the workspace answer first? — Answered (decision 13).**
All three: which artifacts to keep, which monster should wear a given artifact,
and what a given monster is missing. Under decision 9 they are three readings of
one table rather than three products, so none has to lead.

**Q3 — How are the user's artifact preferences expressed? — Answered
(decisions 9, 11, 12).** Artifacts get their own model in `Preferences`, not an
extension of `RunePotentialPreset`. Per monster type, the user sets each property
to **preferred** or **acceptable**; one global slider sets what an acceptable
property is worth against a preferred one. The engraving statistics supply the
defaults (decision 10).

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

**Q6 — Do the existing footholds stay, move, or get replaced?**
`monster-grid.ts` owns the primary-type mapping and `monster-stats.ts` owns
the main-effect maths, both shared with relics. A fuller artifact model may
want that code in an artifact library instead. Extend in place, or lift it out
— and if lifted, relics come along.

**Q7 — How many monsters must the engraving dataset cover? — Raised in
importance by decision 10, still open.**
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

**Q8 — What happens to the dataset as the game moves on?**
It is a snapshot of community usage on the day it was taken, and it will drift.
Does JASWA show its capture date, does it age out, or does it stand until the
user recaptures it? Under decision 10 this also asks what happens to a user's
own property preferences when the dataset is recaptured — overwritten, or
preserved as deliberate overrides of a changed default?

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
