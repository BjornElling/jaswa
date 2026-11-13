# Import and Count Parity Contract

**Status:** Binding product contract — the one home of the parity promise
**Reviewed:** October 20, 2026

## 1. Promise

What the game says the account owns is what JASWA imports, counts, and makes
reachable. Every account count JASWA shows is identical to the game's count
for the same snapshot. A record that cannot be read or used is an import
failure, never an invisible omission. `AGENTS.md` §0.1 states the three parts
an agent must hold — never silently exclude, never import more than is shown,
never accept an entity that cannot be used.

This is an account-data invariant, not a best-effort display convention. It
applies to file imports, helper snapshots, live helper updates, reward records,
and every future account collection, and it takes precedence whenever a
convenience would make two counts diverge.

## 2. Canonical count boundary

Counts are taken only from the prepared account data after the import boundary
has merged account-level and engraved records. The same prepared collections
feed the badge, tables, filters, and calculations (`accountCounts` in
`app/domain/account/account-counts.ts`).

| Game account value | JASWA count | Rule |
| --- | --- | --- |
| Monsters | `unit_list` length + Normal Sealed Shrine units + the quantities of the Summoned Sealed Shrine stacks | One per distinct positive `unit_id` on the roster, monsters in Monster Storage and fodder included; one per unit in the Normal tab (`normalShrineRecords`); one per copy in a Summoned stack of quantity above zero (`summonedShrineRecords`). The Numbers table lists the same records. |
| Runes | `runes` length | One per distinct positive `rune_id` across the account list and engraved copies. |
| Gems, grindstones, and engraved conversion stones | Sum of `amount` over `rune_craft_item_list` | The game groups identical craft items into stacks; stack count is not item count. |
| Artifacts | Readable artifact rows (`readArtifacts`) | One per distinct positive `rid` across the account list and engraved copies. Every counted row is accepted by the artifact reader. |
| Relics | `relics` length | One per distinct positive `rid`; an engraved relic is a reference to the same inventory relic and is not counted again. |

Filters may hide rows, but they may not change the account total. A summary such
as "visible of total" uses the same canonical rows as the account count and
makes the filtering explicit.

## 3. Import rules

- An account entity has a positive stable identifier. Zero, missing, and
  placeholder identifiers are not owned entities.
- **A zero stack is an empty remainder.** The game can leave a craft or
  Summoned Sealed Shrine stack at quantity zero after its last item is spent.
  Such a stack with a valid identity passes the shape check, so a live response
  cannot reject the whole account, and is removed before storage; a malformed
  zero record still fails the import.
- **Each Sealed Shrine tab is read from the containers the game sends it in**
  and no others (`sealed-shrine-storage.ts`, the same list the helper reads in
  `helper/src-tauri/src/profile.rs`): the Summoned tab's `unit_storage_list` at
  the account root, in `GetUnitStorageList`, in `GetWizardDataPart1`, or in
  `GetWizardDataPart1.GetUnitStorageList`; the Normal tab's
  `unit_storage_normal_list` at the root, in `GetWizardDataPart1`, or in
  `GetUnitStorageList`. A root list wins, even when empty. The import validates
  the list it resolves and publishes it at the root, so the count, the table
  and the validation read one list.
- **A monster record satisfies the unit contract**: a positive unique
  `unit_id`, a positive integer `unit_master_id`, and — where present — `class`
  1–6, `unit_level` 1–40 and `skills` as `[id ≥ 1, level ≥ 1]` pairs. An absent
  field reads as "—" on screen. The Normal tab's units are held to the same
  contract.
- **An uncatalogued monster is imported and named as such.** A `unit_master_id`
  the catalogue does not know is kept and warned about on Home and in the
  import dialog; the audit reports it (§5).
- Account-level and engraved copies are merged by their stable identifier.
  Runes and artifacts are counted once even when the export carries both
  copies; relics are counted once because the game permits one relic to be
  referenced by many monsters. In Scenario a rune or artifact listed under two
  monsters is refused (`DECK-PRESETS.md` §1, rule 8).
- A successful response can add a record only when it is in an account-owned
  container or is otherwise proven to belong to the current `wizard_id`.
  Preview, shop, opponent, definition, and unclaimed-reward containers are not
  account inventory, even when they carry that `wizard_id`.
- Every record needed by a displayed count satisfies the complete reader
  contract before it reaches storage. Malformed records, unknown rune sets, and
  unreadable artifacts fail the import instead of being counted and then hidden.
- The file and direct-import routes use the same account boundary and count
  definitions. A route-specific count is a parity defect.

## 4. Related contracts

[Live import coverage](./LIVE-IMPORT-COVERAGE.md) states what the helper's live
route reads. [Local persistence contract](./LOCAL-PERSISTENCE-CONTRACT.md)
states how the prepared account is stored: the durable snapshot keeps exactly
the collections the counts above read. `DECK-PRESETS.md` states how saved decks
and their placements are read.

## 5. Verification

`npm run audit:import-parity` reconciles a captured `HubUserLogin` against what
the readers accept, entity by entity, including stack amounts for craft items
and every saved deck reaching the preset menu, and reports the collection and
field behind every shortfall or surplus so the game meaning behind it can be
found and modelled. Run it after any change to a reader, a vocabulary table, or
an eligibility rule.

- It reads the helper's traffic log, by default
  `%USERPROFILE%\Downloads\JASWA Helper traffic.log` on Windows; another log is
  named directly: `node scripts/audit-import-parity.mjs <path>`.
- A plain account export works as a stand-in: a log of one line,
  `{"command":"HubUserLogin","response":<the export>}`.
- The capture is personal data that no checkout carries. Without one the audit
  says so and exits zero — **a skip, not a pass**: it has measured nothing.
  When a reader changed and no capture was available, report the audit as
  skipped rather than parity as holding.

The helper's Rust tests cover placeholder identifiers in reward previews
(`helper/src-tauri/src/profile.rs`); `verify:monster-import-ownership` holds the unit
contract, the shrine containers and the zero-stack rule.
