# Agent rules for JASWA

**Status:** Binding project rules
**Reviewed:** August 31, 2026

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
  saved state that does exist is the developer's own preferences — presets,
  settings, the import mode — and a change to the code must never reset them.
  Rejection happens one choice at a time: a setting, a preset, a monster's
  field, a team the stored copy cannot satisfy starts from its default, and
  every other choice is kept. Never reject a whole preferences document because
  one part of it predates the change just made; that is what made every dev
  server restart after a contract change put everything back to defaults.
  `app/lib/preference-reading.ts` states the rule and
  `npm run verify:preference-survival` holds it.

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
`ARTIFACT-CANONICAL.md` §15.1's equip class `98` was exactly this: 31 artifacts
imported and hidden for want of one lookup, and the game itself called them
Intangible on screen.

**Guessing is still forbidden.** Parity does not licence inventing a meaning to
make a record usable; that is `ARTIFACT-CANONICAL.md` §14's prohibition and it
stands. The two rules meet at rejection: while the meaning is unknown the record
must fail loudly, so the unknown is visible and someone can go and find out.

**`npm run audit:import-parity` is the check.** It reconciles a real captured
account against what the readers accept, entity by entity, and reports the
field behind every shortfall. Run it after any change to a reader, a
vocabulary table, or an eligibility rule.

It needs a traffic log the helper captured, which is personal data that no
checkout carries. Without one it says so and exits zero — a skip, not a pass:
it has measured nothing. A log elsewhere can be named directly
(`node scripts/audit-import-parity.mjs <path>`), and a plain account export
works as a one-line stand-in — a single `{"command":"HubUserLogin","response":
<the export>}` is the shape it reads. When a reader changed and no capture was
available, say the audit was skipped rather than reporting parity as holding.

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
- **VS Code visual-verification rule:** The ChatGPT Browser/in-app browser is
  not available from the Codex IDE extension or Codex CLI. Do not try to find a
  browser bridge in this environment and do not treat a missing browser session
  as a server failure. Drive the page with the installed project Playwright
  dependency instead — that is the browser for this environment, and it is
  available for any verification where driving the real page helps.
- For a visual or interactive change, run Playwright at a stable viewport,
  drive the real affected flow, and take screenshots before and after the
  relevant interaction. Check both the empty state and the fully populated
  state, and compare the screenshots for unintended movement under rule 2.
  If Playwright cannot launch, state that visual verification was not done;
  do not replace this check with code inspection or an unavailable Browser
  bridge.
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
  deploy. The presence of `.openai/hosting.json` is not publication approval.
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

## 3. Test both extremes of user input

**Every feature that changes user-visible behaviour is verified with nothing
filled in and with everything filled in.** Most real bugs live at these two
ends, not in the middle.

**Nothing filled in.** No import, no presets, an empty list, a record with only
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

**Nothing assumed from the defaults.** The presets JASWA ships with are
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
messages, new documentation — is written in English, concise and lightly
playful. Existing Danish documents in `docs/` stay as they are; do not
translate them unasked.

## 5. Visual style

The house style is set in `app/globals.css` and stated at the top of it. The
parts an agent must not quietly break:

- **Colour carries one meaning: "you can act on this."** Gold (`--gold`) marks
  interactive state — the sorted column, the active filter, the current
  section, a chosen option. Data is never coloured for decoration. A fact on
  screen is expressed through weight, position, or form.

  Three narrow exceptions, each a vocabulary the user already reads elsewhere
  rather than one invented here. Do not add a fourth without the same
  justification:
  - The verdict colours (`--state-*`), for a machine reporting its own state.
  - **An artifact's score, in three bands** (`docs/ARTIFACT-CANONICAL.md`
    §18) — the one place a fact wears the accent, because at the top band the
    number *is* the invitation to act. `artifactValueBands` is the single set
    of boundaries, and no table may carry its own.
  - **A ground rune sub property** (`--rune-ground`), gold because the game
    paints a Grindstone-touched figure gold — sign and percent sign included,
    the name not. An Enchanted Gem's mark — the circular arrows an artifact's
    converted line also carries, with nothing drawn around them — is gold
    always, as in the game. `app/components/rune-sub-line.tsx` is the
    one place that writes a rune property line, innate or sub, so no page can
    word or colour one its own way.

  A grade is **not** an exception. Tinting artifact quality in the game's own
  five hues was tried and removed: five colours competing across a dense table
  read as decoration rather than information, whatever their provenance. Grade
  is expressed as text, in its own column.

  Where colour names a fact, the fact stays in the text too, and only the
  colour changes — never the weight, size, or a mark, each of which resizes the
  text and moves what sits beside it under rule 2.
- **Two-tone emphasis.** Where something is primary-versus-secondary — a
  preferred set against an acceptable one — full ink (`--ink`) against dimmed
  (`--faint`) is the established device. Reuse it rather than inventing a
  second scale.
- **One 4px rhythm.** Every gap, padding, and inset is a step on `--s1`
  through `--s7`. Nothing lands on an arbitrary 9px or 13px.
- **Monospace for data, sans for prose.** Numbers use `--mono` with
  `font-variant-numeric: tabular-nums`, so columns of figures align and do not
  change width as digits change.
- **Type comes from a voice, never from a call site.** The top of
  `globals.css` declares the voices — display, title, heading, lead, body,
  body-emphasised, control, label, caption, data, data-lead, figure — each as
  one family, size, weight and tracking. A rule joins a voice's selector list;
  it does not set `font-size`, `font-weight` or `letter-spacing` of its own.
  Where a size is genuinely local it is still a step on `--t-micro`…
  `--t-display`, and tracking is a step on `--track-*`. Two distinctions carry
  meaning and are worth keeping straight:
  - **A control naming an *action* is sans; a control naming a *value* is
    mono.** Calculate, Clear results and Reset filters are actions and read
    alike; a filter chip saying `Water` or `LEG` is a value out of the game's
    vocabulary and stays in the data voice. This is why one filter panel can
    hold two voices without looking careless.
  - **Label and caption are the same size and deliberately not the same
    weight.** A label (700, uppercase) names a group or column and is read
    before it; a caption (400) names a value sitting beside it and must stay
    quieter than the value.

  `tests/type-voices.spec.ts` holds the three that drifted worst. Adding a
  thirteenth voice is a decision to make in `globals.css`, with a note saying
  what it is for — not a `font-size` added to one component.
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
  `E.HP D` are computed from a preset's own stats on every save, so a preset
  cannot carry a stale composite. Any figure that follows from another follows
  it in one place.
- **One artifact calculation, however many views read it.** Every page under
  Artifacts answers from the same engine and the same settings. Concretely:
  - The **rules** live in `app/lib/artifact-optimal-value.ts` (what a preferred
    or acceptable line is worth, what the main property adds, the benchmark in
    the denominator) and in `artifact-score-protocol.ts` (the equip rule). Both
    readers — the packed scorer for rankings, `artifact-value-on-monster.ts`
    for a single artifact — call those rather than restating them.
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
  over every equipped artifact at every acceptable-worth setting and fails on
  any disagreement, including a disagreement about which pairs are judged at
  all. It runs inside `npm run test:domain` against the repository fixture, and
  takes a real export as an argument for a wider sweep.
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
- **One stat sheet, one build search.** `app/lib/monster-stats.ts` is the only
  place a monster's stats are summed — the Monsters page, the overlay, Speed
  Tuning and Rune Optimization all read it — and `docs/RUNE-OPTIMIZATION.md` is
  binding for the build search. Every reduction the search makes before its
  depth's cut is exact, and `npm run verify:rune-optimization` holds that
  against brute force; a shortcut that is not exact is only allowed where the
  page says it was taken.
- **One clock for every turn order.** `docs/SPEED-TICK-CANONICAL.md` is
  binding, and `app/lib/speed-tick.ts` is the only module that states a rule
  of the game's turn order — combat speed, the tick, a boost, a buff, a tie.
  `speed-tuning-analysis.ts` decides what to simulate and reports it; it never
  restates a rule, and an interval is found by running that one clock at every
  candidate display speed rather than by a second formula. Every speed on
  screen names its form — display speed, arena speed or dungeon speed.
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
10. After a change to the turn-order rules, the speed skill reading or the
    speed snapshot, `npm run verify:speed-tick` passes.
11. After a change to the Rune Clean-up engine, all of
    `verify:rune-substat-weights`, `verify:rune-set-neutrality`,
    `verify:rune-slot-neutrality`, `verify:rune-craft-single-source`,
    `verify:rune-cleanup-calibration`, `verify:rune-cleanup-probability`,
    `verify:rune-cleanup-craft-monotonic` and `verify:rune-chance-stability`
    pass, and a **fresh `verify:rune-cleanup-equivalence` baseline** is recorded
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
- **`npm test` does not run every check that exists.** `verify:library-layout`,
  `verify:recommendation-filters` and `verify:artifact-obtained-order` are
  deliberately outside it — they drive a real browser against a real imported
  account on `http://localhost:3000/`, which needs a running server and a local
  export. `verify:rune-optimization-card` is outside it for the same reason: it
  needs the server and a graphics card. Run the relevant one by hand after a change to the surface it covers;
  `verify:library-layout` in particular is what holds the account tables'
  shared measure and their freedom from horizontal overflow.

Report faithfully. If a step was skipped or a check failed, say which and why.
