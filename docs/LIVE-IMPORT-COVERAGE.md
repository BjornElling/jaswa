# Live import coverage

**Status:** Binding coverage for the direct-import live route
**Reviewed:** October 28, 2026

What the helper's live route reads from the game's traffic. The counts it must
keep equal to the game's, the zero-stack rule and the ownership rule are
[Import and Count Parity Contract](./IMPORT-PARITY-CONTRACT.md) §2–§3.

JASWA treats a successful game response as an account mutation when it carries
an owned record. The live route is deliberately broader than a command allow
list: it recognises the stable record shapes and the account's `wizard_id`, so
new reward wrapper names do not silently lose a record.

## Account data that is updated

| Account data | Direct records | Reward records | Removal or movement |
| --- | --- | --- | --- |
| Monsters | `unit`, `unit_info`, `target_unit`, `unit_list` | Full unit records in a reward payload | `MoveUnitBuilding` (Monster Storage and back), any request naming a `building_id` and the units moving into it, `remove_unit_id_list`, sacrifice sources, sell requests, and the monsters a `ConvertUnitToItem` request names (crafting Engraved Stones answers with the item alone, so the request is the only record of what it spent; roster and Normal shrine copies both go, and a conversion naming no readable monster or spending an engraved one stops live import) |
| Sealed Shrine | `unit_storage_normal_list` at the top of a response; `unit_storage_list` from `getUnitStorageList` and from the `GetUnitStorageList` inside `GetWizardDataPart1` | — | Those lists are the whole tab and replace the collection. `SacrificeUnit_V4` answers with only the Summoned stacks it fed from — an empty list when every fodder came from the roster — and updates those stacks alone; a fed stack its answer does not restate, or a top-level Summoned list under any other command, stops live import. `MoveStorageFromTo` is read side by side — see below |
| Runes | `rune`, `rune_info`, `runes` | V2 `changed_item_list` type `8`; legacy `reward.crate.rune(s)`; shop and black-market responses | Upgrade, reappraisal, refine/convert, engrave/remove, sell and remove lists |
| Artifacts | `artifact`, `artifact_info`, `artifacts` | V2 `changed_item_list` type `73`; legacy reward crates and quest/mail claims | Upgrade, engrave/remove, sell and remove lists |
| Relics | `relic`, `relic_info`, `relics` | Relic-shaped `changed_item_list` records and reward crates | Power-up, engrave/remove on a unit, breakdown/sell and remove lists; the root relic stays present because one relic can be engraved on many monsters |
| Gems, grindstones and engraved conversion stones | `rune_craft_item`, `craft`, `craft_item`, `changestone(s)`, craft lists | Craft records inside reward crates and generic account reward containers | Amplify/convert and `SellRuneCraftItem` consume the requested quantity from a stack |
| Artifact craft materials | `artifact_craft`, `artifact_crafts` | Full artifact-craft records in account reward containers | Explicit artifact-craft removal fields and sell requests |
| Saved decks | `deck_info` in a `setDeckList` answer; `defense_deck_info` and `server_arena_defense_deck_info` | — | The saved type's decks are replaced whole (`DECK-PRESETS.md` §3) |
| Other account inventory | `inventory_item`, `inventory_info`, `inventory_item_list` | Full inventory rows in account reward containers | Updated by full account rows; opaque currency-only values remain outside the gear model |

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
- Monster roster/storage moves, one monster or a batch, and engrave/remove of
  gear.
- Sealing a monster into either Sealed Shrine tab and taking one back out, from
  the game's own answer to the move rather than only from a full account read.

## The Sealed Shrine door

`MoveStorageFromTo` moves monsters between the roster and the Sealed Shrine.
It never touches Monster Storage, which is `MoveUnitBuilding`. The sides
below come from a captured session that moved one monster each way through
each tab (September 23, 2026):

| Move | Sides | What the answer carries |
| --- | --- | --- |
| Roster → Summoned | `1 → 3` | `result_to.remove_unit_id_list`, and the touched stack in `result_to.unit_storage_list` |
| Summoned → roster | `3 → 1` | The new unit in `result_from.add_unit_list`, and the touched stack in `result_from.unit_storage_list` |
| Roster → Normal | `1 → 4` | Each monster whole in `result_to.stored_unit_list` |
| Normal → roster | `4 → 1` | The released unit in `result_from.add_unit_list` |

The stack list in a move's answer holds only the stacks the move touched, so
it updates those stacks instead of replacing the tab. A stack left at quantity
zero is removed.

Any other side, a known side answered without the fields above, gear coming
off with the seal, or sealing a monster that still carries gear opens a
capture gap and pauses live import.

## What the diagnostic log says

A command that reaches the account model and changes nothing records that it
changed nothing, so "the game said nothing about the account" and "the account
model does not know this command yet" read differently.

## Safety rules

- A non-zero top-level `ret_code` is ignored, so a failed action cannot erase
  or overwrite account data.
- `getServerArenaRewardInfoForNoti_v2` is a historical award notification,
  never an account mutation. Its `user_reward_info.reward_result` repeats
  `changed_item_list` records from when the rewards were awarded; replaying
  them revives sold runes (observed after a fresh login, October 11, 2026) and
  can roll back upgraded gear and spent inventory quantities. The notification
  is ignored as a whole. Fresh acquisition responses still update inventory.
- **A `before_*` record is history, never account state.** Several commands
  answer with both the record they just changed and the record as it stood
  before: `UpgradeArtifact_v2` returns `artifact` at the new level *and*
  `before_artifact` at the old one. The previous state is this account's own
  record — same identifier, same `wizard_id`, complete valid shape — so every
  ownership test passes it, and it is ignored by name.
- New records must either be in an account-owned response container or carry
  the current account's `wizard_id` with a positive entity identifier and an
  owned-record shape. The `wizard_id` alone never turns a preview into
  inventory.
- Opponent, helper, arena, market, event-definition and unclaimed-mail
  containers are excluded. Mail becomes eligible only through the claim
  response, and only the `mail_id` named by `ReceiveMail` is opened; an inbox
  list is never treated as owned inventory merely because it carries item data.
- RTA and World Arena commands remain completely outside the account sync.
- A relic is not treated like a rune or artifact: its inventory record remains
  in the root collection while individual monster copies are added or removed.
- **Only a command that moves gear changes which runes and artifacts a monster
  carries** — one whose name holds `equip` or `occupation`, and the request
  says where each item went. Any other answer may show a monster in the gear of
  a deck or a battle: `battleGuildRivalStart` answers with the attacking team in
  its World Guild Battle preset's runes (October 28, 2026). Read as the
  monsters' own, 24 runes stood on two monsters at once and JASWA refused every
  revision after it, so decks saved in the game afterwards never arrived. Such
  a record still updates the monster; its runes and artifacts are kept as the
  account has them, and the diagnostic log counts the monsters it did this to.
  The rule is not tied to a container name, because no list of names can know
  every screen the game shows a team on.
- **The rune and artifact inventories hold what no monster carries.** A record
  of gear a monster carries — a power-up answer, say — updates that monster's
  copy and is never added to the inventory as well.
- **An exchange that would leave a rune or artifact on two monsters is refused
  whole**, and the account is kept as it stood. JASWA's import refuses that
  account (`validateGameFile`), so serving it would stop live import until the
  next login; refusing the one exchange keeps every later one arriving. The
  diagnostic log names the command, so its shape can be modelled.
- **A refused snapshot is said on every page.** When JASWA cannot import the
  helper's newest snapshot, a *Live import stopped* card stands under the
  import badge with the reason until a readable snapshot arrives. Said on Home
  alone, the refusal left every other page quietly showing an older import.

The raw traffic log remains the diagnostic record for a response shape that
the current model cannot identify. It is never converted into a guessed item.
