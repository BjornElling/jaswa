# Force role: judging one rune in the role the user names

**Status:** Todo. A design proposal; does not change the current contracts or application.
**Date:** November 6, 2026.
**Scope:** Rune Clean-up, the rune overlay and Gems & Grinds — every view that names a rune's Best role.

## 1. The request

On a Gems & Grinds card, to the right of *Best role*, a control — *Force role*
with a dropdown of the roles — that makes the rune be judged in that role from
then on. The user decided (November 6, 2026) that the forced role applies
**everywhere**, not only in Gems & Grinds: the overlay and Rune Clean-up once
appeared to disagree with the table about a Gem, and a forced role read by one
view only would recreate exactly that.

## 2. Design

### 2.1 The stored choice

- A new preference, `runeForcedRoles: Record<rune_id, role id>`, beside
  `runeHolds` and `craftIgnores`, keyed by `rune_id` so it survives every import
  and live sync, and by the role's id so a renamed role keeps it.
- Read entry by entry (`AGENTS.md` §0): an entry that is not a pair of non-empty
  ids is dropped alone. Listed in `docs/LOCAL-PERSISTENCE-CONTRACT.md`.
- Deleting a role deletes the choices that name it, in the one place roles are
  changed (`page.tsx`, the `runeRoles` update). A choice naming an unknown role
  forces nothing.

### 2.2 How the engines learn it — one point of entry

Lay the choice onto the rune as an optional `forcedRoleId` before any engine
sees it, in a single helper (`withForcedRoles(runes, forced, roles)`), at the
three places account runes are read for judging: `gems-section.tsx` (the craft
views only, not the item counts), `rune-recommendations.tsx`, and the overlay's
rune in `page.tsx` (account runes only; simulator runes take none).

This is what keeps the change small and the caches right: `runeAdviceKey`,
`craftRuneKey` and the overlay's advice memory all key on the whole rune, so
changing one rune's forced role re-judges that rune alone — Rune Clean-up's
per-rune refresh and Gems & Grinds' extension requests already do the rest. A
rune with nothing forced stays the same object.

### 2.3 What forcing means in each engine

- **Rune Clean-up** (`runeAdvice`, step 3): every role is still valued and its
  chance counted, so the overlay's *Every role's reading* table is unchanged. Only
  the choosing narrows: the pool Best role is chosen from is the forced role's
  readings, through the same gates (qualified first, then `mostExpected`).
- **Gems & Grinds** (`recommendRuneCraft`): the readings a rune is priced in are the
  forced role's builds only, so the score, the Best role on the card *and* the Gem
  placement (`gemChoiceOf`) follow it. `CraftReading` and `CraftEvaluation` need the
  role's id, not just its name.
- **Calibration** is untouched: it describes the roles, not a rune.

### 2.4 When the forced role cannot read the rune

Its sets and mains rule the rune out, or Broken is No and it reads the rune only
as broken. Proposed: the engine then chooses as if nothing were forced, and every
view marks it (*forced role unmet*), because forcing a role that cannot use the
rune must not turn a Keep into a Sell. See open question 1.

### 2.5 Interface

- **Gems & Grinds card:** the *Best role* row gets a fixed-width dropdown at its
  right end: *Automatic* first, then every role. *Automatic* is how the user goes
  back. The dropdown takes the accent while a role is forced (interactive state,
  `AGENTS.md` §5). Fixed width, so a choice resizes nothing (§2).
- **Rune overlay:** the same dropdown under *Best role for this rune*, disabled
  for simulator runes but present, so the panel keeps one height.
- **Rune Clean-up table:** a small fixed-size mark beside the Best role name when
  it is forced, with a tooltip; the unmet case uses the red figure mark.
- Choosing a role re-judges the one rune; its card may move in the rankings,
  which is movement the user asked for.

### 2.6 Verification

- Playwright: force a role on a card, see the card, the overlay and the Clean-up
  row name it; choose *Automatic* and see all three return; reload and see the
  choice kept; delete the role and see the choice gone.
- Rule 2 check on the card and the overlay: screenshot, choose, compare.
- `verify:preference-survival`, and the rule 11 Rune Clean-up checks with a fresh
  `verify:rune-cleanup-equivalence` baseline, since `runeAdvice` changes.

## 3. Open questions

1. **Unmet forced role:** fall back to the automatic choice with a mark (proposed),
   or leave the rune unjudged ("Forced role cannot read this rune") so the user
   must act? The second is stricter but can show a Sell where there was a Keep.
2. **Which roles the dropdown offers:** every role (simple, but some cannot read
   the rune), or only roles that read it (needs the readings first, and an
   already-forced role that stops reading the rune must still be shown)?
3. **A way to reset every forced role** at once, like *Reset ignored* — and where:
   Rune Clean-up's settings, or Gems & Grinds' filter panel?
4. **Rune Clean-up filters:** should the table get a filter for forced runes?
5. **Name:** *Force role* or *Judge as*?
