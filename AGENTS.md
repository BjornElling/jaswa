# Agent rules for JASWA

**Status:** Binding project rules
**Reviewed:** October 20, 2026

Rules an agent must follow when working in this repository. A rule here
overrides an agent's own habits and defaults. Where a rule and a document in
`docs/` disagree, the document in `docs/` wins for its own subject and this
file is corrected.

---

## 0. Development posture

**JASWA is under active development and its developer is its only user.**

- Treat every product, architecture, storage, helper, and file-format change as
  intentionally breaking. No earlier application state, IndexedDB records,
  helper data, preference files, or other saved files exist; do not add code
  that assumes or supports them.
- JASWA has one form only: the form being built now. Do not add application
  version, format-version, schema-version, database-version, or migration
  fields and do not branch behaviour by an earlier form of data.
- Design from the best final product, not from the shape of an earlier
  implementation. A cleaner model, API, or file format takes precedence over
  continuity with any existing local data.
- Refactor opportunistically. Fix every incidental defect, inconsistency, and
  legacy remnant found while working, regardless of the size or consequences
  of the resulting breaking change.
- Validate only the current contract. Reject malformed or obsolete input
  rather than repairing it into a newer shape.
- **Except the user's own choices, which always survive a change.** The one
  saved state that does exist is the developer's own preferences — roles,
  presets built in JASWA, settings, the import mode — and a change to the code must never reset them.
  Rejection happens one choice at a time: a setting, a role, a preset, a
  monster's field the stored copy cannot satisfy starts from its default, and
  every other choice is kept. Never reject a whole preferences document because
  one part of it predates the change just made; that is what made every dev
  server restart after a contract change put everything back to defaults.
  `app/lib/preference-reading.ts` states the rule,
  `npm run verify:preference-survival` holds it, and
  `docs/LOCAL-PERSISTENCE-CONTRACT.md` lists what is saved and which reader
  reads each part back.

---

## 0.1 Import parity — a fundamental principle

**What the user owns in the game, JASWA imports, counts, and shows. There is no
acceptable gap.** This outranks convenience, schedule, and tidiness of code. It
applies to artifacts, runes, monsters, relics, craft items — every entity the
export carries.

The rule has three parts, and the third is the one that gets violated:

1. **Never silently exclude.** An entity the export carries and a reader drops
   must fail loudly, not quietly. A record JASWA cannot read is a defect in
   JASWA, to be diagnosed and fixed — never a record to skip past.
2. **Never import more than is shown.** A count in the interface must be the
   count the user can actually reach and act on. Importing 1,862 artifacts and
   ranking 1,831 of them is a parity break even though nothing was rejected.
3. **Never accept an entity you cannot use.** This is the subtle one. A record
   that passes the reader, is counted, and then cannot appear in any
   calculation — because a field did not resolve and no comparison can ever
   match it — is *invisible*, and invisible is worse than rejected: nothing
   surfaces it. Either the program understands the field well enough to act on
   it, or the reader rejects the record so the gap is visible. Never in between.

**When a deviation is found, the cause is always found and always fixed.** A
value the vocabulary does not cover is not a licence to shrug: it is evidence
about a game mechanic JASWA does not model yet. Find out what the game means by
it — the in-game panel names things the export only numbers — and model it.
`ARTIFACT-CANONICAL.md` §15.1's engrave class `98` was exactly this: 31 artifacts
imported and hidden for want of one lookup, and the game itself called them
Intangible on screen.

**Guessing is still forbidden.** Parity does not licence inventing a meaning to
make a record usable; that is `ARTIFACT-CANONICAL.md` §14's prohibition and it
stands. The two rules meet at rejection: while the meaning is unknown the record
must fail loudly, so the unknown is visible and someone can go and find out.

**`npm run audit:import-parity` is the check.** Run it after any change to a
reader, a vocabulary table, or an eligibility rule.
`docs/IMPORT-PARITY-CONTRACT.md` is the contract it holds — what each count
counts, and how to run the audit — and §5 there says why a run without a
capture is a skip, not a pass.

---

## 0.2 Passive reading — an inviolable boundary

**JASWA only reads game data passively. It never sends its own data back to
the game or its servers. This principle has no exceptions.**

`docs/PASSIVE-GAME-DATA-CONTRACT.md` is binding throughout the application,
helper, diagnostic tools and future features. A transparent relay carries only
the original messages, unchanged. Never create game requests, retry a game
operation, alter login fields or checksums, negotiate a substitute key, rewrite
a response, or automate game input to obtain data. An import defect must be
solved inside this boundary; parity never authorises crossing it. Keep an
unreadable change visible until a passive source establishes the actual data.
Read ordinary game messages and exports only; do not read the game process's
memory or request elevated access to obtain its private keys.

---

## 1. Source control

**Commit to `main`. This project does not use branches.**

- Work directly on `main` and commit there. Do not create a feature branch, do
  not open a pull request, and do not ask which branch to use.
- If work is found on a branch, move it onto `main` (fast-forward or merge) and
  delete the branch before finishing.
- Commit when a change is complete and verified, not before. A commit whose
  build or typecheck fails is not complete.
- Write the message in English, in the imperative, saying what changed and why.
  The *why* is the part a later reader cannot reconstruct from the diff.
- Do not push unless asked. Committing is expected; publishing is the user's
  call.

## 1.1 Local preview and publishing

**Visual verification always happens against a local server on
`http://localhost:3000/`. Reuse an existing working server; otherwise do what
is relevant to make that server work.**

The point of this rule is to avoid an unnecessary *second* server, not to
preserve a broken one. A competing server on another port splits the state the
user is looking at from the state being tested, which is why the check below
comes first:

- Before browser automation, probe that exact URL with
  `Invoke-WebRequest -UseBasicParsing http://localhost:3000/` and drive the
  route far enough to establish that the application actually renders.
- **It responds and works:** reuse it. Do not start another dev server merely
  because one already exists.
- **It does not respond or does not work:** take the smallest relevant
  corrective action — for example clear a stale local build cache, stop and
  restart the server, or start `npm run dev` when none is running — then verify
  against `http://localhost:3000/`. A stale dependency cache, failed HMR, or a
  route that returns an error is a reason to repair the local server, not a
  reason to report the visual change as unverified. Say in the report when the
  server was started or repaired for the check.
- **The browser is the project's Playwright.** Drive the page with the
  installed `@playwright/test` dependency; it is available for any
  verification where driving the real page helps. Do not look for another
  browser bridge, and do not treat the absence of one as a server failure.
- For a visual or interactive change, run Playwright at a stable viewport,
  drive the real affected flow, and take screenshots before and after the
  relevant interaction. Check both the empty state and the fully populated
  state, and compare the screenshots for unintended movement under rule 2.
  If Playwright cannot launch, state that visual verification was not done;
  do not replace this check with code inspection.
- Keep visual verification proportional. Do not inspect every page by ritual
  after a documentation, data-only, or non-visual change. Do inspect the
  affected flow when a change could alter rendering, behaviour, layout, focus,
  state, or user-visible error handling.
- Work only against `http://localhost:3000/`. For a reported visual bug,
  reproduce it first, make the fix, then repeat the same steps and confirm the
  result.
- Do not use Sites, a hosted preview, deployment tooling, or any workflow that
  requests GitHub or hosting credentials merely to preview or verify JASWA.
- Do not deploy, publish, save a hosted build, obtain hosting credentials,
  or push to a hosting remote unless the user explicitly asks to publish or
  deploy. `wrangler.jsonc` and `npm run deploy` (`docs/DEPLOYMENT-TARGET.md`)
  being in the repository is not publication approval.
- Report which server was used: the user's already-running one, or one started
  for the check. If verification could not happen at all — Playwright would not
  launch, `npm run dev` would not come up — say so plainly rather than
  substituting a hosted preview or code inspection for it.

## 2. Layout must not move under the user

**A user's choice must never move, resize, or re-wrap other content on the
page.** Clicking a control changes how that control looks. Everything around it
stays exactly where it was.

This is the rule most easily broken by accident. The failures to avoid:

- **Do not add or remove text on selection.** A chip that gains the word
  "Preferred" when chosen gets wider, and in a wrapping row that re-wraps every
  chip after it. Express state through colour, background, border, or a
  fixed-size mark instead.
- **Do not change `font-weight` on selection.** Bold is wider than regular, so
  the text reflows inside its own box and pushes its siblings.
- **Do not mount or unmount elements to show state.** Conditional rendering for
  interactive state removes a box from the flow and closes the gap. Keep the
  element and change its appearance, or reserve its space.
- **Reserve space for what varies.** A value that reads `—` when unset and
  `43,860` when set needs a column that already fits the wider of the two. Use
  fixed columns, `min-width`, `ch` widths, or tabular numerals — never
  content-sized boxes whose content changes.
- **Anything revealed on hover or focus must already occupy its space.** Use
  `opacity`/`color`, not `display`.
- **A control's own box is fixed.** Its size must be identical in every state it
  can be in. If one state needs more room, every state gets that room.

Legitimate movement is movement the user asked for: opening a disclosure,
adding a preset to a list, filtering rows away. The test is whether the content
that moved is the content acted upon.

**How to check it:** for a layout or interaction change, screenshot the
component, interact, screenshot again, and compare. Anything that moved and
was not the target of the click is a bug.

## 2.1 An overlay opens where the user is

**A button that opens an overlay opens it over the current page.** It never
goes to the page the overlay is about and opens it there. Presets' *Speed
tuning* once did, and the user lost the page they were working on for a dialog
that needed none of it. Only a control naming a *page* — the rail, *Optimize*, a
team's *Edit preset* — changes the page, and leaving a page closes what was opened over it.

- An overlay more than one page opens is mounted once, in `app/page.tsx`, and
  reached through one opener (`openMonsterOverlay`, `openRuneOverlay`,
  `openSpeedTeam`), Speed Tuning's own lines included.
- Every opener carries `aria-haspopup="dialog"` and passes the control that
  opened it, so focus returns there on close.
- `tests/overlay-in-place.spec.ts` clicks one opener of each kind on every rail
  page and fails if the page, the stored page or the browser's history moves.

## 2.2 Inclusive filters share one rule

No selected options means every option; selecting the whole group also means
every option. Only a proper, non-empty subset narrows the results. Apply this
to every inclusive filter group through `app/lib/filter-selection.ts`, including
Location groups stored as separate booleans. Keep the user's actual selections
as chosen; interpreting an empty group must not select its controls for them.
Conditions such as *Hide if*, *Only show if*, thresholds and calculation modes
retain their stated meaning. `docs/ACCOUNT-TABLES.md` owns the full contract.

## 3. Test both extremes of user input

**Every feature that changes user-visible behaviour is verified with nothing
filled in and with everything filled in.** Most real bugs live at these two
ends, not in the middle.

**Nothing filled in.** No import, no roles, no presets, an empty list, a record with only
a name, every number field blank. Specifically:

- An empty numeric field is *absent*, not `0`. A stat the user left blank means
  "this role does not aim at it"; an explicit `0` means "a stated target of
  nothing". These must stay distinguishable end to end — in state, on save, in
  IndexedDB, in the `.sw` file, and on screen.
- `Number('')` is `0` and `Number('x')` is `NaN`. Neither may reach state or
  storage. Parse, check `Number.isFinite`, then decide.
- No `.reduce` without an initial value, no `Math.max(...[])`, no `[0]` or
  `.find(...)` dereferenced without a guard, no division by a value that can be
  zero.
- Every list renders at length zero with an empty state that says what to do
  next, not a blank panel.

**Everything filled in.** All fields set, every option chosen, long strings,
large numbers, many records. Specifically:

- Long names must truncate or wrap without breaking the layout around them.
- Large numbers must format and fit the space reserved for them.
- Selecting every option in a group must not re-wrap or overflow its container.
- Duplicate names are allowed; duplicate identifiers are not.

**Nothing assumed from the defaults.** The roles JASWA ships with are
starting values the user may edit or delete. Never assume a field is populated
because the shipped data populated it.

**Verification of visual or interactive changes is by running the app**, in a
browser, driving the real flow — not by reading the code and reasoning that it
should hold. State plainly what was exercised and what the result was. For a
non-visual change, use the smallest relevant automated or structural check and
state it. If something was not tested, say so.

## 4. Language

`docs/LANGUAGE-CONTRACT.md` is binding and takes precedence over this section.
In short: all product work — interface text, identifiers, comments, commit
messages, documentation — is written in English, concise and lightly
playful. Every document in `docs/` is English since October 20, 2026.

## 4.1 Line endings

- This repository uses LF line endings for every text file.
- `.gitattributes` enforces LF in Git and in checked-out text files;
  `.editorconfig` and `.vscode/settings.json` set the same style in editors.
- Preserve LF when creating or editing files. Do not introduce CRLF conversion
  workarounds or rewrite files with another line-ending style.
- `npm run verify:line-endings` checks the working tree, including new
  non-ignored files, and runs as part of `npm run lint`.

## 5. Visual style

The house style is set in `app/globals.css` and stated at the top of it. The
parts an agent must not quietly break:

- **Colour carries one meaning: "you can act on this."** Gold (`--text-accent`,
  with `--gold-deep`, `--gold-edge` and `--gold-ink` for its grounds) marks
  interactive state — the sorted column, the active filter, the current
  section, a chosen option. Data is never coloured for decoration. A fact on
  screen is expressed through weight, position, or form.

  Three narrow exceptions, each a vocabulary the user already reads elsewhere
  rather than one invented here. Do not add a fourth without the same
  justification:
  - The verdict colours (`--state-*`), for a machine reporting its own state.
    They are also the three tones of **the marks after a figure**
    (`app/components/figure-marks.tsx`): red for something wrong, yellow for
    something left to do, green for a fact in the figure's favour. Every mark that
    applies is shown, side by side on the figure's own line, red first, then
    yellow, then green; none hides another, and none is uncoloured.
  - **An artifact's score, in three bands** (`docs/ARTIFACT-CANONICAL.md`
    §18) — the one place a fact wears the accent, because at the top band the
    number *is* the invitation to act. `artifactValueBands` is the single set
    of boundaries, and no table may carry its own.
  - **A ground rune sub property** (`--rune-ground`), gold because the game
    paints a Grindstone-touched figure gold — sign and percent sign included,
    the name not. An Enchanted Gem's mark — the circular arrows an artifact's
    converted line also carries, with nothing drawn around them — is gold
    always, as in the game, and so is that same mark on an artifact's converted
    line, so the one mark never reads as two. `app/components/rune-sub-line.tsx` is the
    one place that writes a rune property line, innate or sub, so no page can
    word or colour one its own way.

  A grade is **not** an exception. Tinting artifact quality in the game's own
  five hues was tried and removed: five colours competing across a dense table
  read as decoration rather than information, whatever their provenance. Grade
  is expressed as text, in its own column. The one recorded allowance is
  `ARTIFACT-CANONICAL.md` §18.1: a muted 2px rule on the leading edge of an
  item's row (`app/components/quality-rule.tsx`), outside the reading line and
  naming its tier in `aria-label` — on the artifact recommendations, the best
  artifact for a monster, Rune Clean-up and Rune Simulator. That document
  decides its subject, so the allowance stands; do not extend it to another
  shape.

  Where colour names a fact, the fact stays in the text too, and only the
  colour changes — never the weight, size, or a mark, each of which resizes the
  text and moves what sits beside it under rule 2.
- **Four text tones.** Every visible string takes one of `--text-muted`,
  `--text`, `--text-strong` and `--text-accent`. Where something is
  primary-versus-secondary — a preferred set against an acceptable one — strong
  text (`--text-strong`) against muted (`--text-muted`) is the established
  device. Reuse it rather than inventing a fifth tone.
- **One 4px rhythm.** Every gap, padding, and inset is a step on `--s1`
  through `--s7`. Nothing lands on an arbitrary 9px or 13px.
- **One family, tabular figures.** Prose and values alike are set in IBM Plex
  Sans (`--font-body`, and `--font-heading` for headings, which today resolve
  to the same family), so values never look as if they came from another
  system. Figures use `font-variant-numeric: tabular-nums`, so columns of
  figures align and do not change width as digits change.
- **Type comes from a voice, never from a call site.** The type section of
  `globals.css` declares the voices — display, title, heading, body, body
  emphasis, control, label, caption and figure — each as one family, size,
  weight and tracking. A rule joins a voice's selector list; it does not set
  `font-size`, `font-weight` or `letter-spacing` of its own. Where a size is
  genuinely local it is still a step on `--type-label` … `--type-figure`, and
  tracking is a step on `--track-*`. Two distinctions carry meaning and are
  worth keeping straight:
  - **A control naming an *action* takes the control voice; a control naming
    a *value* takes the body voice.** Calculate, Clear results and Reset
    filters are actions and read alike, at 600; a filter chip saying `Water`
    or `LEG` is a value out of the game's vocabulary and reads at body weight.
    Same family, same size: only the weight and the box's tone tell them apart.
  - **Label and caption are the same size and deliberately not the same
    weight.** A label (700, uppercase) names a group or column and is read
    before it; a caption (400) names a value sitting beside it and must stay
    quieter than the value.

  `tests/type-voices.spec.ts` holds the action voice, the value voice, the
  label voice and the single family. Adding a voice is a decision to make in
  `globals.css`, with a note saying what it is for — not a `font-size` added to
  one component.
- **Icons are stroked SVG paths**, sized to the type, using `currentColor`. Not
  emoji — they render at a different weight in every browser.
- **Buttons come from `app/components/button.tsx`.** `Button` and
  `FilterButton` own the box, the tones, the sizes and the disabled look;
  choose a `tone` and a `size` rather than writing `className="button …"` or
  giving one call site a height of its own. A button that reports its own work
  passes `busyLabel` instead of swapping its text — `LabelSwap` keeps every
  wording in the layout so the control cannot resize under the click that
  started the work, which is rule 2 applied to a control's own label.
  `tests/button-box.spec.ts` holds both halves of that.
- **An artifact's main stat is named, never quantified.** Every view says `HP`,
  `ATK` or `DEF` and stops there — no `+1,500`, no roll, no bar. The magnitude
  is fixed by grade and adds nothing to the judgement the user is making, so a
  number in that column only costs column width and reading time. `Artifact`
  deliberately carries no main value at all (`app/lib/artifacts.ts`); the import
  reads it once to reject a malformed record and drops it.
- **An ambiguous monster name keeps its element.** `DHALSIM (Water)` is not
  clutter to be tidied away: the game ships five elemental copies under that one
  name, so the parenthesis is the half that identifies the monster.
  `docs/MONSTER-NAME-ELEMENT-DECISION.md` is binding and explains why this one
  label is allowed to grow against the rule above;
  `npm run verify:element-qualified-names` fails if it is removed.
- Respect `prefers-reduced-motion`; it is already handled globally.

## 6. Code conventions

- **Comments explain the decision, not the mechanics.** The existing comments
  in this codebase say why a layout is two columns, why a value is derived
  rather than stored, what a previous approach cost. Match that. Do not narrate
  what the next line plainly does.
- **Derived values are derived, never stored twice.** `DMG`, `E.HP` and
  `E.HP D` are computed from a role's own stats on every save, so a role
  cannot carry a stale composite. Any figure that follows from another follows
  it in one place.
- **One artifact calculation, however many views read it.** Every page under
  Artifacts answers from the same engine and the same settings. Concretely:
  - The **rules** live in `app/lib/artifact-optimal-value.ts` (what a preferred
    or acceptable line is worth, what the main property adds, the benchmark in
    the denominator) and in `app/lib/compute/artifact-score-protocol.ts` (the
    engrave rule). Both readers call those rather than restating them: the
    packed scorer (`app/lib/compute/artifact-score-core.ts`), which the
    rankings run over every pair and a view reads for one pair through
    `artifactPairScore()`; and `artifactValueOnMonster()`
    (`app/lib/artifact-value-on-monster.ts`), which answers for one artifact
    object on one monster — the library row reads it through
    `artifactJudgementOnMonster()`, so the row's marks and its score come from
    one reading.
  - The **settings** come through `scoringSettings()`, which is the one
    classification of what defines a calculation. A view takes the settings
    object, never a loose field plucked out of it; that is how the library
    column came to read one setting where every other view read eight.
  - A view reads a pair with `artifactPairScore()`. It does not reach for
    `scoreArtifactOnMonster` and compose its own reading.
  - **A filter may narrow what a page shows; it may never change what a page
    computes.** Per-page filter controls are expected and fine. A figure must
    not depend on which page it is read from.

  `npm run verify:artifact-score-agreement` is the check. It runs both readers
  over every engraved artifact at every acceptable-worth setting and fails on
  any disagreement, including a disagreement about which pairs are judged at
  all. It runs inside `npm run test:domain` against the repository fixture, and
  takes a real export as an argument for a wider sweep.
- **One placement model: Scenario and presets.** `docs/DECK-PRESETS.md` is
  binding. A rune or artifact is engraved at most once per context — Scenario
  or one preset — and may be engraved in many contexts at once. The decks the
  game fights with in one battle share one pool — the Siege Battle defenses,
  and the teams of Temple of Chaos (monsters included), Dimension Raid (across
  its three phases; a phase's own presets are alternatives and share freely),
  Rift Raid and World Guild Battle — while Siege Battle attacks
  do not; a deck whose content is only assumed joins no pool. A pool limits
  what JASWA does, never what it reads, so an overlap the game allowed is shown
  as it stands and flagged, nothing here forms a new one, and no build keeps
  one: the overlapping rune is withheld from both its monsters. A relic belongs
  to Scenario and is read into every preset. Placement is resolved once at
  import; an item's own `occupiedId` names its Scenario monster only, and
  every reading of a monster's slots, stats or speed takes its context as an
  argument (`runesInPreset` for runes). Gear on a monster is **engraved**,
  never equipped or worn, and **preset** means the game's preset and nothing
  else. For runes, `app/lib/rune-placement.ts` is the one Scenario-first
  reading outside Rune Optimization: Scenario's monster and the count of its
  other placements, or *Engraved × n* when there is no Scenario placement.
  Location labels, engraved filters and sell safeguards all read that summary.
  Rune Optimization alone reads the selected preset's current placement and
  applies the game's remembered-placement rule; no other workspace resolves a
  rune's current location from one preset. **Whose engraved runes a monster
  may take is one rule, `app/lib/rune-sources.ts`:** a teammate's by the
  team's priority list, another deck of its pool's only with *Include runes
  from higher-priority monsters* — teams and phases are never ranked against
  each other — and an engrave that takes such a rune takes it off that deck.
  The search and the re-reading of a build read its answer (`withheld`); no
  other module decides it.
- **One Gem rule and one Grindstone rule, however many workspaces spend them.**
  `app/lib/rune-craft-end-state.ts` is the only module that applies
  `RUNE-CANONICAL.md` §8, and `app/lib/rune-craft-items.ts` is the only one that
  holds its tables. Nothing else under `app/` may read either. This is not
  tidiness: the same four rules were applied in five places, two of them had
  drifted, and the projection was reading the *weakest* line where the ceiling
  was reading the *best pair* — up to nine per cent of a rune's whole score, with
  nothing failing. `npm run verify:rune-craft-single-source` is the check, and it
  reads source text rather than behaviour, because two implementations that
  happen to agree today are still two implementations.
  **And one assumption about them:** every rune judgement credits an average
  Legend Gem and an average Legend Grindstone (`canonicalCraftCredit`) — Rune
  Clean-up's projection, its ruler and calibration, the Gem's placement, and Gems
  & Grinds' reading of a Gem, before and after alike (`craftComparison`). It is not
  a setting, and the ruler is not a parameter. Rune Optimization's own Gem and
  Grindstone choices are a different question — what to spend on one monster —
  and stay its own.
- **100 % is a mark, never a ceiling.** A perfect-rune or benchmark score of 100 %
  is a reference point. No rune, artifact or relic score is capped at it, and
  anything that would lift a score past it is still recommended. Only shares and
  probabilities stay inside 0–1, and the game's own limits — CRI Rate, RES and
  ACC at 100 % — remain game mechanics. `verify:rune-substat-weights` holds that
  a rune's score keeps rising past 100 %, and `verify:craft-recommendations`
  that no craft score is clamped.
- **The graphics card is asked through one door.**
  `docs/HARDWARE-ACCELERATION.md` is binding. A calculation states how the
  processor does it and how the card does it; it does not decide *whether* to use
  a card, because `app/lib/compute/accelerated-calculation.ts` does that once for
  the whole program. Three states and not two: switched off is the user's
  decision, refused is the card's, and only the third uses the card. Every
  calculation reports which engine answered, because a silent fall back to the
  processor is a thing the user is entitled to see.

  A shader is a second implementation, which this section is otherwise against.
  The bargain is that it must prove itself against the processor on this
  machine's own card before its answers are used, and that neither it nor the
  packing beside it may write a buffer offset of its own — **the headless shell
  `npm test` launches exposes no WebGPU, so no shader runs inside `npm test`.**
  `verify:webgpu-parameter-layout`, `verify:rune-chance-layout` and
  `verify:rune-optimization-layout` stand in for that there, and
  `verify:acceleration-routing` keeps the decision itself from growing a second
  copy. Chromium's new headless mode (`channel: 'chromium'`) does expose this
  machine's card, and `verify:rune-optimization-card` uses it to execute the
  optimization shader against the processor.
- **One main-stat model.** `docs/MAIN-STAT-MODEL.md` is binding, and
  `app/lib/main-stat-model.ts` is the only place that decides which of HP, ATK
  and DEF a monster's artifacts and relic should carry. The overlay's defaults,
  both artifact score readers, the relic plan and the overlay's advice mark all
  read it; none computes a need of its own.
- **One PvE database.** `docs/PVE-STAGES.md` is binding, and
  `app/lib/pve-stages.ts` is the only place JASWA looks up what the game sets
  against a team — an area's floors, waves and enemies with their speed,
  Resistance, Accuracy, HP, ATK and DEF. Speed Tuning's floors, the Accuracy
  goal and the fastest enemy all read it; a later figure that needs an enemy
  reads it too rather than carry a table of its own. A figure no source gives
  is unknown, never borrowed from another floor. `npm run verify:pve-stages`
  is the check.
- **One stat sheet, one build search.** `app/lib/monster-stats.ts` is the only
  place a monster's stats are summed — the Monsters page, the overlay, Speed
  Tuning and Rune Optimization all read it — and `docs/RUNE-OPTIMIZATION.md` is
  binding for the build search. Every reduction the search makes before its
  depth's cut is exact, and `npm run verify:rune-optimization` holds that
  against brute force; a shortcut that is not exact is only allowed where the
  page says it was taken.
- **SWCalc is the authority on how the game calculates.**
  `docs/CALCULATION-AUTHORITY.md` is binding: where
  [swcalc.cz/game-mechanics](https://swcalc.cz/game-mechanics#term-2-crit)
  states a damage, defense, crit or speed rule, JASWA follows it, and another
  source or an earlier JASWA choice gives way. Check a new calculation against
  that page before inventing or borrowing a formula.
- **One clock for every turn order.** `docs/SPEED-TICK-CANONICAL.md` is
  binding, and `app/lib/speed-tick.ts` is the only module that states a rule
  of the game's turn order — combat speed, the tick, a boost, a buff, a tie.
  `speed-tuning-analysis.ts` decides what to simulate and reports it; it never
  restates a rule, and an interval is found by running that one clock at every
  candidate display speed rather than by a second formula. Every speed on
  screen names its form, and there are two: *display speed*, as the game's
  monster screen shows it, and *combat speed*, the speed in a fight — one name
  in every content, never arena, dungeon, raid or guild speed
  (`SPEED-TICK-CANONICAL.md` §1).
  `npm run verify:speed-tick` is the check, and confirms every printed interval
  at both of its edges.
- **Validate everything read back, one choice at a time.** Preferences are
  user-editable files. Every value loaded from IndexedDB or a `.sw` file is
  checked against the current contract before it reaches the interface; one
  that fails is dropped and that one choice starts from its default — never
  coerced into a newer shape, and never allowed to take its neighbours with it
  (§0). A new preference field is read through `readSettings` or the section's
  own `read…` function, so a stored copy without it still loads.
- **`undefined` and empty are different answers.** A missing list means "never
  set, use the default"; an empty list means "the user cleared it", and must
  stay empty across a reload.
- **User data stays on the user's computer.** Nothing in this app sends game
  data or preferences anywhere. Do not add a network call, an analytics hook,
  or a remote font beyond what `globals.css` already loads.
- **Accessibility is part of the change.** Controls get accessible names,
  overlays get `role="dialog"` and `aria-modal`, Escape closes them, focus goes
  where the user is looking, and state is exposed with `aria-pressed` or
  `aria-current` rather than by colour alone.
- **A control character in source is written as an escape, never typed.** Use
  `'\0'`, `'\t'`, `'\x1b'`; do not put the byte itself in the file. A literal
  one makes git classify the whole file as **binary** — `git diff` prints
  `Bin 11975 -> 13394 bytes` instead of the change, `git blame` and PR review
  stop working, and grep reports "binary file matches" without the line. It is
  also invisible in an editor, so `` `${name}\0${id}` `` typed raw reads as a
  concatenation with nothing between the halves, which looks like a bug and
  invites someone to "fix" it into one. `monster-catalog.ts` and
  `verify-element-qualified-names.mjs` both carried a raw NUL as a key
  separator for this reason and were converted to `'\0'` constants.

## 7. Definition of done

Before reporting a change complete, all of these hold:

1. `npx tsc --noEmit` is clean.
2. `npm run lint` is clean — no new warnings, not just no errors.
3. `npm run build` succeeds. **This is a Vite application**; `next` is not a
   dependency and `npx next build` cannot work. Anything still describing this
   as a Next.js app is a remnant to correct, not an instruction to follow.
4. `npm run test:e2e` passes. The Playwright suite is the only check that holds
   the interface's own contracts — sorting, filters, session state, the search
   scope — so a change to a component is not done until it has run.
5. For a visual or interactive change, the app was **run** and the changed flow
   driven, including the empty case and the full case from rule 3. For a
   non-visual change, the relevant automated or structural check was run.
6. For a layout or interaction change, layout was checked against rule 2 by
   interacting and comparing.
7. Every added string, comment, and identifier was reviewed against the
   language contract.
8. After a change to monster naming, the catalogue, or the collaboration species
   table, `npm run verify:element-qualified-names` passes.
9. After a statistics capture or a change to the collector,
   `npm run verify:statistics-tiers` passes.
10. After a change to the turn-order rules, the speed skill reading, the
    speed snapshot or the account's buildings (`app/lib/account-buildings.ts`,
    the Sky Tribe Totem among them), `npm run verify:speed-tick` passes; after
    a change to the buildings, so does `npm run verify:monster-display-stats`.
    After a change to the PvE database or a refresh of it, both
    `npm run verify:pve-stages` and `npm run verify:speed-tick` pass.
11. After a change to the Rune Clean-up engine, all of
    `verify:rune-substat-weights`, `verify:rune-set-neutrality`,
    `verify:rune-slot-neutrality`, `verify:rune-craft-single-source`,
    `verify:rune-cleanup-calibration`, `verify:rune-cleanup-probability`,
    `verify:rune-cleanup-craft-monotonic`,
    `verify:rune-cleanup-preference-monotonic` (not in `npm test`) and
    `verify:rune-chance-stability` pass, and a **fresh `verify:rune-cleanup-equivalence` baseline** is recorded
    in the same commit — `work/` is not committed, so a baseline is always
    captured deliberately before a change and never inherited.
12. After a change to the stat sheet or to anything under
    `app/lib/rune-optimization-*`, `npm run verify:rune-optimization` passes.
    After a change to the search, its card backend, layout or shader, so does
    `npm run verify:rune-optimization-card` — it needs the dev server and a
    graphics card, and where either is missing, say the shader went unrun.
13. After a change under `helper/`, the helper is **released**, not merely
    edited: `npm run verify:helper-version` fails until the version is raised
    and an installer is built and recorded (`npm run release:helper`). The app
    tells every user which helper is newest, so an unreleased change leaves
    that statement false. Packaging needs the Rust toolchain and
    `JASWA_SIGNING_THUMBPRINT`; if neither is at hand, say the helper is
    unreleased rather than reporting the change complete.
14. **Renaming a user-visible label is a repository-wide rename.** The
    Playwright suite, the `scripts/verify-*.mjs` checks and `docs/` all address
    the interface by its accessible names, and a check under `scripts/` is not
    run by `npm test`, so a missed one stays silent until someone runs it. Grep
    the whole repository for the old string — every one of `tests/`, `scripts/`
    and `docs/` — before reporting the rename done.
15. The work is committed to `main`.

Two caveats worth knowing before trusting a green run:

- **`npm test` stops at the first failure.** It is one `&&` chain, so a failure
  early on hides every check behind it. When something fails, fix it and run the
  chain again rather than reading a truncated pass as a pass.
- **A green `npm test` may contain skips.** `verify:library-layout` and
  `verify:recommendation-filters` are in the chain, but they drive a real
  browser against a real imported account on `http://localhost:3000/`, and an
  account export is personal data no checkout carries. Without one (at
  `JASWA_IMPORT`, by default `%TEMP%/claude/shots/game.json`) each prints
  `Skipped:` and exits zero, so the checks behind it still run. A skip has
  measured nothing: after a change to the surface it covers, run it with an
  export and say so if none was at hand. `verify:library-layout` in particular
  is what holds the account tables' shared measure and their freedom from
  horizontal overflow. `verify:rune-optimization-card` is outside the chain
  altogether: it needs the server and a graphics card.

Report faithfully. If a step was skipped or a check failed, say which and why.
