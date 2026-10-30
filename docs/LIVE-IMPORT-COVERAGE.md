# Live import coverage

**Status:** Binding coverage for the direct-import live route
**Reviewed:** October 30, 2026

What the helper's live route reads from the game's traffic. The counts it must
keep equal to the game's, the zero-stack rule and the ownership rule are
[Import and Count Parity Contract](./IMPORT-PARITY-CONTRACT.md) §2–§3.

JASWA accepts a live record only when both its request and its complete response
path establish a current account change. An identifier, a valid record shape,
or the account's `wizard_id` proves neither freshness nor acquisition: historical
awards carry all three. This boundary applies to every entity, including updates
to existing records, so history cannot restore sold gear or undo upgrades.

## One live-account boundary

`ProfileStore::live_entities` in `helper/src-tauri/src/profile.rs` is the one
reader used by the service's capture-gap check and by the update itself.

1. `account_request` separates mutation families, current-account queries,
   ordinary queries, historical notifications and unknown requests. Mutation
   families follow their operation, not a closed list of content names: a new
   dungeon result or a namespaced claim uses the same boundary. Current-state
   queries may update response values; they never execute request-side sales,
   craft consumption or movement. A query naming a rune is not a sale.
2. Authority follows a continuous recognised path from the response root:
   direct entity fields or their `_list` arrays, current `changed_item_list` / `item_list`
   records, or the legacy `reward.crate` form. An unknown ancestor breaks that
   chain. A familiar collection or `reward` below it never restarts authority.
3. Only the root mail entries identified by a successful `ReceiveMail` request
   are opened. The other inbox entries remain previews. Shrine movement and
   battle-team records and the root `upgrade_rune_list` in `UpgradeRuneList`
   have explicit, narrow paths; the shrine collections keep
   their own location-aware readers.
4. Known archives, previews, opponent records and `before_*` records are excluded
   at their boundary. The exclusions describe understood non-account data;
   they are not the permission model for everything else.
5. An incidental copy of an entity also present on an authoritative current
   path is ignored. The current record wins regardless of JSON key order;
   the copy cannot overwrite it, count twice or stop a valid update.
   A monster-shaped object outside a recognised account field needs a
   `wizard_id` before it is treated as a possible account record. Battle-local
   `unit_id` values and monster species are also used for NPCs and prove no
   ownership, even when a local id happens to match an owned monster. This
   applies across content names and wave wrappers, rather than adding a dungeon
   exception. Recognised account fields and owned records on unknown paths
   remain subject to the checks above.
   An otherwise plausible additional account record on an unknown request or path refuses the
   exchange whole and opens the existing visible capture gap. It is neither
   imported speculatively nor silently skipped. The diagnostic names its path
   and entity identifier, and the raw exchange remains available for modelling.
6. A direct record marked `confirmed_…` or `…_confirmed`, including its list
   form, is the committed state and wins over other copies of that identifier
   regardless of field order. The same request and continuous-path checks still
   apply. `before_…` and `…_before` are history. An `…_after` candidate does not
   gain authority from its name: when a confirmed record is present it is an
   incidental copy, never a second update. Conflicting confirmed records refuse
   the exchange rather than choosing by JSON key order.
7. Gear actions share one boundary for direct and compound answers. A root
   gear-operation envelope (for example `UpdateArtifactOccupation` inside
   `UpdateUnitEquip`) is opened only for a gear-moving request and with its
   own explicit successful `ret_code`. Failed children are ignored. An unknown
   ancestor still breaks authority. `updated_` collections use the same entity
   vocabulary as ordinary collections; they do not need per-command exceptions.
   Monster replacement lists are merged before individual gear records, so
   an item just removed from a monster returns to inventory. The returned
   gear's `occupied_id` applies its actual placement, including displaced gear;
   request-side identifiers are read only for the named gear type, since an
   artifact and a relic can share a `rid`.

The same request gate covers sales, material consumption, gear movement and
building moves. Removal lists are read at the current response root, with
explicit `result_from` / `result_to` envelopes for Shrine moves. An unknown
nested removal path opens a capture gap; archive removal lists are ignored.
Recursively finding a `remove_*` field is no longer enough to delete an item.

The request classification is stated once beside this reader. The concrete rune
and artifact actions and legacy/current reward paths were also checked against
[SWEX's live-sync implementation](https://github.com/Xzandro/sw-exporter/blob/master/app/plugins/live-sync.js),
including `ConfirmRune` and `UpdateArtifactOccupation`. This is a bounded
protocol contract, not a claim that every future game command is known.

## Account data that is updated

| Account data | Direct records | Reward records | Removal or movement |
| --- | --- | --- | --- |
| Monsters | `unit`, `unit_info`, `target_unit`, `unit_list` | Full unit records in a reward payload | `MoveUnitBuilding` (Monster Storage and back), any request naming a `building_id` and the units moving into it, `remove_unit_id_list`, sacrifice sources, sell requests, and the monsters a `ConvertUnitToItem` request names (crafting Engraved Stones answers with the item alone, so the request is the only record of what it spent; roster and Normal shrine copies both go, and a conversion naming no readable monster or spending an engraved one stops live import) |
| Sealed Shrine | `unit_storage_normal_list` at the top of a response; `unit_storage_list` from `getUnitStorageList` and from the `GetUnitStorageList` inside `GetWizardDataPart1` | — | Those lists are the whole tab and replace the collection. `SacrificeUnit_V4` answers with only the Summoned stacks it fed from — an empty list when every fodder came from the roster — and updates those stacks alone; a fed stack its answer does not restate, or a top-level Summoned list under any other command, stops live import. `MoveStorageFromTo` is read side by side — see below |
| Runes | `rune`, `rune_info`, `runes` | V2 `changed_item_list` type `8`; legacy `reward.crate.rune(s)`; shop and black-market responses | Upgrade, bulk power-up (`UpgradeRuneList`), confirmed rerolls, grind/Gem conversion, engrave/remove, sell and remove lists |
| Artifacts | `artifact`, `artifact_info`, `artifacts` | V2 `changed_item_list` type `73`; legacy reward crates and quest/mail claims | Upgrade, engrave/remove, sell and remove lists |
| Relics | `relic`, `relic_info`, `relics` | Relic-shaped `changed_item_list` records and reward crates | Power-up, engrave/remove on a unit, breakdown/sell and remove lists; the root relic stays present because one relic can be engraved on many monsters |
| Gems, grindstones and engraved conversion stones | `rune_craft_item`, `craft`, `craft_item`, `changestone(s)`, craft lists | Craft records inside reward crates and generic account reward containers | Amplify/convert and `SellRuneCraftItem` consume the requested quantity from a stack |
| Artifact craft materials | `artifact_craft`, `artifact_crafts` | Full artifact-craft records in account reward containers | Explicit artifact-craft removal fields and sell requests |
| Saved decks | `deck_info` in a `setDeckList` answer; `defense_deck_info` and `server_arena_defense_deck_info` | — | The saved type's decks are replaced whole (`DECK-PRESETS.md` §3) |
| Other account inventory | `inventory_item`, `inventory_info`, `inventory_item_list` | Full inventory rows in account reward containers | Updated by full account rows; opaque currency-only values remain outside the gear model |

## Acquisition path families

- Scenario, Cairos, Rift, Dimension Hole and other battle rewards, including
  both the older `reward.crate` form and the newer `changed_item_list` form.
- Shop and black-market purchases when the response contains a full rune or
  craft record.
- Mail, daily, Play Pass, quest and event claims using a current reward path.
- Crafting, power-ups and breakdown responses using current entity fields.
- Monster summons, power-ups, awakening, evolution, fusion and feeding, through
  current direct records or their list forms.
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
- `*_repurchase_list` is a list of items no longer owned, even when returned
  beside a successful sale. It is excluded for every entity type and every
  command. A successful repurchase enters through the current record returned
  for that action, never by replaying the list.
- `clear_reward_crate_list` is a reward archive, never current inventory.
  `GetGuildDataAll.GetGuildBossClearRewardCrateList` repeats items from opened
  guild-boss crates, including runes already sold. On October 30, 2026, a
  login supplied 1,661 runes and that archive restored three absent runes,
  raising the helper's count to 1,664. The archive is excluded whether nested
  in the guild response or returned directly; fresh claimed rewards still
  enter through their account reward records.
- `getServerArenaRewardInfoForNoti_v2` is a historical award notification,
  never an account mutation. Its `user_reward_info.reward_result` repeats
  `changed_item_list` records from when the rewards were awarded; replaying
  them revives sold runes (observed after a fresh login, October 11, 2026) and
  can roll back upgraded gear and spent inventory quantities. The notification
  is ignored as a whole. Its `user_reward_info` field is not globally excluded
  from other exchanges: an unclassified claimed-reward path must be reported,
  rather than silently losing a real award. Fresh acquisition responses still
  update inventory.
- **A `before_*` record is history, never account state.** Several commands
  answer with both the record they just changed and the record as it stood
  before: `UpgradeArtifact_v2` returns `artifact` at the new level *and*
  `before_artifact` at the old one. The previous state is this account's own
  record — same identifier, same `wizard_id`, complete valid shape — so every
  ownership test passes it, and it is ignored by name.
- Both new and existing records require the live-account boundary above.
  The `wizard_id` is an ownership check inside that boundary, never an
  alternative source of authority.
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
- **A helper-side refusal is said there too.** In live mode, an unavailable
  helper with an existing import raises the same notice even when its health
  answer withholds the profile. Recovery to the already accepted session and
  revision clears that connection warning without requiring another import.
  An empty workspace does not claim to be showing stale account data, and
  ordinary waiting for the game remains distinct from an error.

The raw traffic log remains the diagnostic record for a response shape that
the current model cannot identify. It is never converted into a guessed item.

An unreadable answer to a recognised account mutation or current-state read is
a capture gap, even when it is not a login. The service uses the account
reader's request classification for this decision. Auxiliary chat/service
lookups remain separate; their different envelopes cannot invalidate an account.

## Verification

`cargo test --manifest-path helper/src-tauri/Cargo.toml` covers all seven entity
types with empty and populated inventories, unknown commands, unknown ancestors
containing familiar reward paths, genuine acquisitions, selective mail claims,
failed actions and the observed guild-boss and Arena reward archives. It also
covers empty/single/100-rune sales with repurchase history, artifact and craft
sales, current-state reads, direct-record arrays, namespaced mutation families
and incidental mirrors. A service-level encrypted exchange test confirms that
a sale does not latch an incident and block the next reward.

`npm run audit:helper-replay -- <traffic.log-or-error-report.json> [expected-rune-count]`
replays a personal capture through the actual Rust account model. A traffic log
begins at a recorded login; an error report begins at its saved account and
decodes the failed exchange with the helper's own protocol reader. The audit
reports unresolved exchanges and final counts, and fails on gaps, an unexpected
rune count, or a sold rune remaining after an incident replay. Earlier traffic
is not replayed without a baseline. `--write-profile <path>` optionally saves
the replayed snapshot locally. Raw requests and records are never printed.

The October 30 capture's fresh login contains 1,661 runes. Replaying the guild
metadata and subsequent live responses keeps 1,661, without unresolved paths;
the previous helper restored three archived runes and reported 1,664.
This proves the captured session, not every unrecorded activity in the game.
`npm run audit:import-parity` separately checks that the application's import
readers preserve every entity in that login.

The first 1.0.32 sale exposed three coverage gaps in that verification: no sale
with repurchase history, no ordinary mutation absent from the closed command
list, and no direct-record array. Its `SellRune` returned 100 sold runes at the
root plus 95 repurchase listings. The latter stopped the whole exchange before
its removals, and all later responses were held back. Replaying the saved error
report now yields 1,661 → 1,561 runes and proves that all 100 sold identifiers
are absent. The broader fixtures exercise the other two gaps and current-record
mirrors. This replaces the closed command list, rather than expanding it.

The October 30 Dimensional Rift report exposed a different boundary error:
`BattleDimensionHoleDungeonStart.dungeon_units` holds enemy waves, with local
unit ids and no owner. Shape-based discovery called those enemies unrecognised
account records and paused import. The reader now requires account evidence for
unrecognised monster records; it does not authorise that enemy container or add
another command name to a permission list. Replays of the saved dungeon,
bulk-upgrade and sale incidents, plus fixtures with colliding NPC ids and new
wave wrappers, check both the false refusal and the original archive safeguard.

The later `ConvertArtifactByCraft` report carries `artifact_before`,
`artifact_after`, `artifact_confirmed` and the spent `artifact_craft` stack.
The committed record changes the converted sub property; its candidate differs
only in modification time in this capture, so comparing scores alone would
not detect choosing the wrong record. The replay checks the complete committed
record, its engraved copies, the material quantity and unchanged runes. A
service fixture proves that the next dungeon reward still arrives.

The subsequent 1.0.38 report stopped on
`UpdateUnitEquip.UpdateArtifactOccupation.updated_artifacts`. Its two current
artifact records and two updated monsters now pass through the shared gear
boundary. Replay keeps all 804 artifacts and 1,240 runes, and both monsters'
artifact lists and both returned artifact records match the captured answer
exactly. Tests cover direct and compound answers, zero/one/100 moved records,
swaps, removal to inventory, failed children, shared artifact/relic identifiers,
unknown ancestors and the next encrypted live exchange. A full rollback of the
continuous-path boundary was rejected: it would again let an unfamiliar
historical wrapper authorise its nested rewards. The common gear protocol is
modelled instead, with the archive regression tests kept intact.

`tests/helper-artifact-movement.spec.ts` sends Rust-replayed compound snapshots
through browser polling. It checks the empty workspace, all four fixture
artifacts before and after movement, unchanged row bounds and the next artifact
reward. A local browser replay of the private report also renders all 804
artifacts before and after the move, with every row's bounds unchanged. All
seven saved error reports replay without unresolved exchanges; the sale report
still removes all 100 sold runes.

[SWEX review](./SWEX-REVIEW.md) records the external sources, existing safeguards
and remaining evidence gaps. A logger displaying a reroll candidate is not proof
that the candidate is committed inventory.

`tests/helper-bulk-sale.spec.ts` generates snapshots with that Rust replay tool
and serves them through the helper polling route. It checks the empty workspace,
the populated Rune Clean-up table, Sold rows after a sale, and the next reward.
Before/after screenshots and row-box comparisons hold the layout still. The
test requires the Rust toolchain in addition to the project's Playwright setup.
