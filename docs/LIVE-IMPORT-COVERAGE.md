# Live import coverage

**Status:** Binding coverage for the direct-import live route  
**Reviewed:** September 2, 2026

The route is also bound by [Import and Count Parity Contract](./IMPORT-PARITY-CONTRACT.md):
the prepared profile must have the same account counts as the game for
monsters, runes, craft items, artifacts, and relics. A response record with a
zero, missing, or placeholder identifier is not an owned record and must not
enter a counted collection.

The game can briefly leave a valid craft or Summoned Shrine stack at quantity
zero after its last item is spent. The import validates its identity and shape,
then removes that empty remainder before the profile is stored; it does not
turn an otherwise healthy live account into an unreadable one.

JASWA treats a successful game response as an account mutation when it carries
an owned record. The live route is deliberately broader than a command allow
list: it recognises the stable record shapes and the account's `wizard_id`, so
new reward wrapper names do not silently lose a record.

## Account data that is updated

| Account data | Direct records | Reward records | Removal or movement |
| --- | --- | --- | --- |
| Monsters | `unit`, `unit_info`, `target_unit`, `unit_list` | Full unit records in a reward payload | `MoveStorageFromTo`, any request naming a `building_id` and the units moving into it, `remove_unit_id_list`, sacrifice sources, sell/convert requests |
| Sealed Shrine stacks | `unit_storage_list`, `unit_storage_normal_list`, wherever a response carries them | — | The list in the response replaces the collection, so a sealed or summoned copy is counted the moment the game answers |
| Runes | `rune`, `rune_info`, `runes` | V2 `changed_item_list` type `8`; legacy `reward.crate.rune(s)`; shop and black-market responses | Upgrade, reappraisal, refine/convert, equip/unequip, sell and remove lists |
| Artifacts | `artifact`, `artifact_info`, `artifacts` | V2 `changed_item_list` type `73`; legacy reward crates and quest/mail claims | Upgrade, occupation changes, sell and remove lists |
| Relics | `relic`, `relic_info`, `relics` | Relic-shaped `changed_item_list` records and reward crates | Power-up, occupation changes, breakdown/sell and remove lists; the root relic stays present because one relic can be engraved on many monsters |
| Gems, grindstones and engraved conversion stones | `rune_craft_item`, `craft`, `craft_item`, `changestone(s)`, craft lists | Craft records inside reward crates and generic account reward containers | Amplify/convert and `SellRuneCraftItem` consume the requested quantity from a stack |
| Artifact craft materials | `artifact_craft`, `artifact_crafts` | Full artifact-craft records in account reward containers | Explicit artifact-craft removal fields and sell requests |
| Other account inventory | `inventory_item`, `inventory_info`, `inventory_item_list` | Full inventory rows in account reward containers | Updated by full account rows; opaque currency-only values remain outside the equipment model |

## Acquisition paths covered

- Scenario, Cairos, Rift, Dimension Hole and other battle rewards, including
  both the older `reward.crate` form and the newer `changed_item_list` form.
- Shop and black-market purchases when the response contains a full rune or
  craft record.
- Quest, event and login rewards after the user claims them through the game,
  including artifacts delivered from a mail or quest box.
- Relic crafting, relic power-ups and relic breakdown rewards.
- Monster summons, fusion/evolution/awakening/skill changes and feeding when
  the response returns a full or partial account unit.
- Monster roster/storage moves, one monster or a batch, and equipment
  occupation changes.
- Sealing a monster into the Sealed Shrine and summoning one back out, from the
  shrine list the game returns with its own answer rather than only from a full
  account read.

## What the diagnostic log says

A command that reaches the account model and changes nothing now records that
it changed nothing. Silence used to be the answer for both "the game said
nothing about the account" and "the account model does not know this command
yet", and the second is the one a stale dashboard is made of.

## Safety rules

- A non-zero top-level `ret_code` is ignored, so a failed action cannot erase
  or overwrite account data.
- **A `before_*` record is history, never account state.** Several commands
  answer with both the record they just changed and the record as it stood
  before: `UpgradeArtifact_v2` returns `artifact` at the new level *and*
  `before_artifact` at the old one. The previous state is this account's own
  record, which is what makes it dangerous — same identifier, same `wizard_id`,
  complete valid shape, so every ownership test passes — and its key sorts
  after the new one, so it was written last and won. A refined artifact kept
  its old level in the snapshot and JASWA went on marking it unrefined, while
  the command itself reported having changed the snapshot, because the material
  it consumed had genuinely changed.
- New records must either be in an account-owned response container or carry
  the current account's `wizard_id` with a positive entity identifier and an
  owned-record shape. The `wizard_id` alone never turns a preview into
  inventory.
- Opponent, helper, arena, market, event-definition and unclaimed-mail
  containers are excluded. Mail becomes eligible only through the claim
  response, not merely because it appears in the inbox list.
- RTA and World Arena commands remain completely outside the account sync.
- A relic is not treated like a rune or artifact: its inventory record remains
  in the root collection while individual monster copies are added or removed.

The raw traffic log remains the diagnostic record for a response shape that
the current model cannot identify. It is never converted into a guessed item.
