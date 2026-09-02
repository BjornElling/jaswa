# Import and Count Parity Contract

**Status:** Binding product contract
**Reviewed:** September 2, 2026

## Promise

What the game says the account owns is what JASWA imports, counts, and makes
reachable. Every account count shown by JASWA must be identical to the game's
count for the same snapshot. A record that cannot be read or used is an import
failure, never an invisible omission.

This is an account-data invariant, not a best-effort display convention. It
applies to file imports, helper snapshots, live helper updates, reward records,
and every future account collection.

## Canonical count boundary

Counts are taken only from the prepared account data after the import boundary
has merged account-level and equipped records. The same prepared collections
feed the badge, tables, filters, and calculations.

| Game account value | JASWA count | Rule |
| --- | --- | --- |
| Monsters | `unit_list` length | One row per distinct positive `unit_id`; storage and fodder monsters still count. |
| Runes | `runes` length | One per distinct positive `rune_id` across the account list and equipped copies. |
| Gems, grindstones, and engraved conversion stones | Sum of `amount` | The game groups identical craft items into stacks; stack count is not item count. |
| Artifacts | Readable artifact rows | One per distinct positive `rid` across the account list and equipped copies. Every counted row must be accepted by the artifact reader. |
| Relics | `relics` length | One per distinct positive `rid`; an equipped relic is a reference to the same inventory relic and is not counted again. |

Filters may hide rows, but they may not change the account total. A summary such
as “visible of total” therefore uses the same canonical rows as the account
count and makes the filtering explicit.

## Import rules

- An account entity must have a positive stable identifier. Zero, missing, and
  placeholder identifiers are not owned entities.
- Account-level and equipped copies are merged by their stable identifier.
  Runes and artifacts are counted once even when the export carries both copies;
  relics are counted once because the game permits one relic to be referenced by
  multiple monsters.
- A successful response can add a record only when it is in an account-owned
  container or is otherwise proven to belong to the current `wizard_id`.
  Preview, shop, opponent, definition, and unclaimed-reward containers are not
  account inventory, even when they carry that `wizard_id`.
- Every record needed by a displayed count must satisfy the complete reader
  contract before it reaches storage. Malformed records, unknown rune sets, and
  unreadable artifacts fail the import instead of being counted and then hidden.
- The file and direct-import routes use the same account boundary and count
  definitions. A route-specific count is a parity defect.

## Verification

`npm run audit:import-parity` compares a captured account snapshot with the
prepared collections and checks every counted category, including stack amounts
for craft items. Helper regression tests cover placeholder identifiers in reward
previews. Any shortfall or surplus is reported with its collection and field so
the underlying game meaning can be investigated and modelled.

This contract is read together with [Live import coverage](./LIVE-IMPORT-COVERAGE.md)
and [Local persistence contract](./LOCAL-PERSISTENCE-CONTRACT.md). The parity
promise takes precedence whenever a convenience would make the two counts
diverge.
