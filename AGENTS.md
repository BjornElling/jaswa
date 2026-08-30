# Agent rules for JASWA

**Status:** Binding project rules
**Reviewed:** August 30, 2026

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

**The user reviews JASWA through their own, manually started `npm run dev`
server.**

- Do not start, stop, replace, or take ownership of the development server
  unless the user explicitly asks.
- Use the already running local server for focused visual verification whenever
  it would materially test a changed interface, layout, interaction, or a
  visual defect reported by the user. Browser access is available for this
  purpose; do not infer otherwise from the editor in use.
- Keep visual verification proportional. Do not inspect every page by ritual
  after a documentation, data-only, or non-visual change. Do inspect the
  affected flow when a change could alter rendering, behaviour, layout, focus,
  state, or user-visible error handling.
- Work only against the existing local URL. Reuse its browser context, keep a
  stable viewport when comparing states, and drive the relevant real flow. For
  a reported visual bug, reproduce it first, make the fix, then repeat the
  same steps and confirm the result. Compare screenshots before and after an
  interaction when rule 2 applies.
- Do not use Sites, a hosted preview, deployment tooling, or any workflow that
  requests GitHub or hosting credentials merely to preview or verify JASWA.
- Do not deploy, publish, save a hosted build, obtain hosting credentials,
  or push to a hosting remote unless the user explicitly asks to publish or
  deploy. The presence of `.openai/hosting.json` is not publication approval.
- If the local server is unavailable, say so plainly. Do not substitute a
  hosted preview or start a competing server without the user's direction.

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
- **Two-tone emphasis.** Where something is primary-versus-secondary — a
  preferred set against an acceptable one — full ink (`--ink`) against dimmed
  (`--faint`) is the established device. Reuse it rather than inventing a
  second scale.
- **One 4px rhythm.** Every gap, padding, and inset is a step on `--s1`
  through `--s7`. Nothing lands on an arbitrary 9px or 13px.
- **Monospace for data, sans for prose.** Numbers use `--mono` with
  `font-variant-numeric: tabular-nums`, so columns of figures align and do not
  change width as digits change.
- **Icons are stroked SVG paths**, sized to the type, using `currentColor`. Not
  emoji — they render at a different weight in every browser.
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
- **Validate everything read back.** Preferences are user-editable files.
  Anything loaded from IndexedDB or a `.sw` file must satisfy the complete
  current contract before it reaches the interface. Discard malformed or
  obsolete records rather than repairing them into a newer shape.
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

## 7. Definition of done

Before reporting a change complete, all of these hold:

1. `npx tsc --noEmit` is clean.
2. `npm run lint` is clean — no new warnings, not just no errors.
3. `npx next build` succeeds.
4. For a visual or interactive change, the app was **run** and the changed flow
   driven, including the empty case and the full case from rule 3. For a
   non-visual change, the relevant automated or structural check was run.
5. For a layout or interaction change, layout was checked against rule 2 by
   interacting and comparing.
6. Every added string, comment, and identifier was reviewed against the
   language contract.
7. The work is committed to `main`.

Report faithfully. If a step was skipped or a check failed, say which and why.
