# Artifact Sprint — working record

**Status:** Live working document for the Artifacts workspace
**Started:** August 30, 2026
**Last updated:** August 30, 2026 — session 1, before any code was written

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
This is the existing bridge between a saved role and artifacts, and §7 Q3 and
Q4 must decide whether the Artifacts workspace extends it or supersedes it.

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

Investigated August 30, 2026, from the helper source. **No code was changed and
nothing was captured yet.** These are the facts that decide how step A can work.

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
- **The cost is the user's time, not server exposure.** Roughly nine dropdown
  views per monster (four rune, three artifact, two relic). That is the real
  limit on how many monsters this dataset can cover.

Any design that synthesises requests to fill the dataset faster is out of
bounds for this sprint. It would be exactly the behaviour the user asked to
avoid.

### What is still unknown

Nothing below has been observed; none of it may be assumed in code.

- The command name for the statistics request, and whether one response carries
  a whole panel, one dropdown, or all three panels at once.
- Whether the response is keyed by `unit_master_id` or by `unit_id`.
- How percentages are encoded — a number, a scaled integer, or a rank order —
  and whether **Others** arrives as a value or must be derived.
- Whether the truncated lists are complete in the payload even when the panel
  scrolls.
- How artifact sub-property and relic unique-property effects are identified,
  and whether those identifiers match the ones already on the user's own items.

### Way in — JASWA Helper's own "Log all traffic"

Built in session 1 (decision 5). The helper can now record every decoded
gateway exchange itself, so no second program is involved and the tool stays
available for any future question about what the proxy can derive.

**Where it is.** Tray menu → **Log all traffic** (a checkbox, off by default,
which asks for confirmation because the file holds account data in the clear),
and **Open traffic log** beside it.

**What it writes.** `%LOCALAPPDATA%\JASWA Helper\traffic.log` — one JSON object
per line: `{ at, command, request, response }`. Line-per-entry rather than one
array, so the file stays readable if the helper stops mid-session. Switching it
on starts a fresh file; it stops at 64 MB and says so on the menu label.

**How to use it for this sprint:**

1. Switch on **Log all traffic**, with the game running and idle.
2. Open Monster Info on one monster and **stop** — touch no dropdown yet. This
   alone shows whether opening a monster fetches all three panels at once.
3. Work through the dropdowns one at a time: the rune panel's four, the
   artifact panel's three, the relic panel's two.
4. Open a **second monster**, and a **second copy of the same monster type**.
5. Switch recording off, then **Open traffic log**.

Step 2 answers the cost question, and step 4 answers the keying question.

**The request pattern is the question that governs cost.** Whether one response
carries all three panels when the monster is opened, or each dropdown fetches
its own, decides whether a monster costs one interaction or nine. Not yet
known; the log settles it.

**Worth checking in the log:** whether the response carries more than the panel
displays. If the client filters a fuller payload, the capture may yield the
untruncated lists — without the rune panel's **Others** bucket and without the
entries hidden below the artifact and relic scroll.

**Capture both a second monster and a second copy of the same monster type**,
so the log shows whether the statistics are keyed by `unit_master_id` (the
monster type, shared by every copy) or `unit_id` (this one instance). That
decides whether the dataset holds one row per type or per instance.

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

---

## 6. Work plan

Steps are a proposal, not a schedule. The user chooses what runs and when.
Status is one of **Not started**, **In progress**, **Blocked**, **Done**.

| # | Step | Status | Notes |
| ---: | --- | --- | --- |
| 0 | Write and maintain this sprint file | **In progress** | Created in session 1. Updated continuously for the sprint's life. |
| A1 | Helper "Log all traffic" — tray toggle, off by default, writing decoded exchanges | **Done** | Session 1. `helper/src/traffic-log.cjs`, wired in `service.cjs`, offered in `tray.cjs`. 6 tests; full suite 36/36. Not yet run against the live game. |
| A2 | Record a log and write the true payload shape into §2a | **Next** | Follow the recipe in §2a. Answers everything under "What is still unknown", including whether a monster costs one interaction or nine. Blocks A3. |
| A3 | Design and build the recorded dataset from the observed shape | Not started | Scope depends on §7 Q7. One-time capture, never a live import. |
| 1 | Establish the artifact rules — a canonical document from the game and a real export | Not started | Depends on the export sample and the sources in §7 Q1. Blocks every step after it. |
| 2 | Model and read artifacts — types, parsing, validation from `game.data.artifacts` | Not started | Needs step 1's field mapping. |
| 3 | Artifact library — list, sort, filter, empty state | Not started | The first thing the user can see. |
| 4 | Judgement — the score, its inputs, and its explanation | Not started | Needs step 1's rules and the §7 Q3 settings model. |
| 5 | Artifact preferences — settings and presets in `Preferences`, carried in `.sw` | Not started | Extends `isValidPreferences`. Breaking change by design. |
| 6 | Monster fit — which monsters gain most from an artifact | Not started | The tagline's promise. Depends on 2 and 4. |
| 7 | Replace the placeholder — route `artifacts` to the real component | Not started | Remove `'artifacts'` from the `UpcomingWorkspace` branch and from `upcomingWorkspaces`. |
| 8 | Verify and finish — both extremes, layout check, definition of done, commit | Not started | `AGENTS.md` §7. |

---

## 7. Open questions

To be answered by the user, or by evidence, before the steps that depend on
them. **None of these has an assumed default.**

**Q1 — What is the canonical source for artifact rules?**
Rune Potential rests on `docs/RUNE-CANONICAL.md`, verified against a real
export. Artifacts need the same. Which sources count, and is there a game
export available to verify the field encoding against? No such file is in the
repository today.

**Q2 — What does the workspace answer first?**
"Which artifacts should I keep?" and "which monster should wear this artifact?"
are different products. Both are in the tagline. Which one leads?

**Q3 — How are the user's artifact preferences expressed?**
Rune Potential uses scale settings plus named presets with stat targets. Do
artifacts reuse that shape, use a different one, or attach to the existing
per-monster `MonsterPreference`?

**Q4 — How much does this share with Rune Potential?**
Both judge an item against saved goals. Shared library code, or two independent
models that happen to rhyme?

**Q5 — Does artifact judgement need to know about equipped runes?**
An artifact's value may depend on what the wearing monster already has. Is that
in scope, or does judgement look at the artifact alone?

**Q6 — Do the existing footholds stay, move, or get replaced?**
`monster-grid.ts` owns the primary-type mapping and `monster-stats.ts` owns
the main-effect maths, both shared with relics. A fuller artifact model may
want that code in an artifact library instead. Extend in place, or lift it out
— and if lifted, relics come along.

**Q7 — How many monsters must the engraving dataset cover?**
The capture is manual: roughly nine dropdown views per monster, and the user
performs every one of them. One monster is a proof of concept; a whole roster
is hours of clicking. Which monsters earn the effort — and is the dataset
worth having if it covers only some of them?

**Q8 — What happens to the dataset as the game moves on?**
It is a snapshot of community usage on the day it was taken, and it will drift.
Does JASWA show its capture date, does it age out, or does it stand until the
user recaptures it?

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
real cost is the user's time — roughly nine dropdown views per monster — which
is what makes Q7 the question that governs the dataset's scope.

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

**Stopped at.** A2: the user records a log by the recipe in §2a, and the
observed payload shape gets written into §2a. Nothing further should be
designed until then. Q7 governs how far the capture goes; Q1 still blocks
step 1.
