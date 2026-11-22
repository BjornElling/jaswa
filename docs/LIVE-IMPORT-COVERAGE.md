# Live import coverage

**Status:** Binding coverage for the direct-import live route
**Reviewed:** October 30, 2026

What the helper's live route reads from the game's traffic. The counts it must
keep equal to the game's, the zero-stack rule and the ownership rule are
[Import and Count Parity Contract](./IMPORT-PARITY-CONTRACT.md) §2–§3.

JASWA applies a live record only when both its request and its path from the
root of the response establish a current account change. An identifier, a valid
record shape, or the account's `wizard_id` proves neither freshness nor
acquisition: historical awards carry all three. This boundary applies to every
entity, including updates to existing records, so history cannot restore sold
gear or undo upgrades.

## Two passes: what is read, and what is missed

`helper/src-tauri/src/profile/live.rs` reads every exchange twice, and the two
passes never share a decision.

- **`read`** follows only the paths an answer uses to state the account as it
  now is. What it reaches is applied; nothing else is.
- **`unread`** looks everywhere else for this account's records. It applies
  none of them. Each one it finds is a **missed change**: named in the
  diagnostic log, kept as error-report evidence, and listed in `/health` as
  `missedChanges` until the next login replaces the account.

A missed change never stops capture. Every change before and after it is
applied as usual. Until October 30, 2026 the two passes were one, and anything
the reader could not place refused the whole exchange and paused live import
until the next login. A repurchase list, dungeon enemies, a bulk power-up, two
conversion answers and a bundled gear answer did that in one day, each costing
every change after it. `AGENTS.md` §0.1 asks that a gap fail *loudly*; it does
not ask that it take the rest of the session with it.

The historical-reward safeguard is the reading rule, not a refusal. A guild-boss
crate archive or an Arena reward notification sits on no path `read` follows,
so its old runes cannot come back however it is wrapped. The tests that hold
this (`guild_boss_crate_history_cannot_restore_sold_runes`,
`arena_reward_notification_cannot_replay_old_inventory`) are unchanged.

### What `read` follows

1. `account_request` separates mutation families, current-account queries,
   ordinary queries, historical notifications and unknown requests. Mutation
   families follow their operation, not a closed list of content names: a new
   dungeon result or a namespaced claim uses the same boundary. Only mutations
   and current-state reads have root paths. A query naming a rune is not a sale.
2. From the root, a path continues through direct entity fields and their
   `_list` and `updated_` forms, `changed_item_list` / `item_list` records, and
   the `reward` / `crate` containers. Any other key ends the path, so a familiar
   collection or `reward` inside an unfamiliar wrapper never restarts it.
3. A few commands add one named root envelope each, written beside the rule in
   `Scope::root_edge`: the attacking team of `battleGuildRivalStart`, Siege's
   `guildsiege_my_unit_list` in `BattleGuildSiegeStart_v2`, the root
   `upgrade_rune_list` of `UpgradeRuneList`, `result_from` of a Shrine move,
   `item_info` of `BuyBlackMarketItem`, `sellSummonPieces` and `RevalueRune`,
   `pick_changestone_list.after` of a successful `pickGuildMazeBattleClearReward`,
   and a bundled gear operation (for example `UpdateArtifactOccupation` inside
   `UpdateUnitEquip`) with its own successful `ret_code`. Only the mail entries
   a successful `ReceiveMail` names are opened; the rest of the inbox stays a
   preview.
   Numeric `_v…` suffixes identify the same operation in both request
   classification and response paths; they never grant a new path by themselves.
4. A record marked `confirmed_…` or `…_confirmed`, including its list form, is
   the committed state and replaces every plain copy of its identifier,
   whatever the JSON key order. Two confirmed records that disagree are a
   contradiction: none of that answer is applied, and it is a missed change.
5. A monster record needs this account's `wizard_id` to be new to the account;
   battle-local `unit_id` values and species prove no ownership. A new record
   that does not have the shape of its entity is not applied and is a missed
   change.

### What neither pass reads

Some containers are understood and are not current state. `read` never enters
them and `unread` does not report them (`understood_elsewhere`):

- `before_…` / `…_before`: the record as it was before the action.
  `UpgradeArtifact_v2` answers with `artifact` at level 15 and `before_artifact`
  at 12; merged in key order the account kept 12.
- `after_…` / `…_after`: a candidate the player may still decline. Repeat
  Conversion answers each `ConvertArtifactByPiece` with `artifact_after` and
  the spent material, and commits the player's choice in a separate
  `ConfirmArtifactConversion` answering with `artifact` (captured October 30,
  2026). `ConvertArtifactByCraft` answers with a `…_confirmed` record beside it.
- `…_repurchase_list`: items already sold, offered back.
- `clear_reward_crate_list`: opened guild-boss crates, including sold runes.
- Opponent, helper, friend, NPC, defense, ranking and World Arena containers,
  shop and market lists, previews, deck lists, and the Sealed Shrine lists,
  which have location-aware readers of their own.

`getServerArenaRewardInfoForNoti_v2` is ignored as a whole: repeating old
awards is all it does. Every other command, queries included, is looked through
by `unread`, because a query showing a rune the account does not have is
evidence of a change JASWA missed.

### What `unread` reports

- A record of this account outside the read paths that would change it: new to
  the account, or different from the account's copy. A copy identical to the
  account's changes nothing and is not reported; a monster is compared without
  its gear, since an answer may show it in a deck's gear.
- A removal list anywhere but the root of a mutation or current-state read, or
  a Shrine move's two envelopes.
- An unknown command whose request acts on account items (a sale, conversion,
  feeding, gear move or building move).

Three answers that move monsters between places are set aside whole when they
lack a half they need, because applying part of them would count a monster in
two places or none: a Shrine move, `ConvertUnitToItem`, and a top-level
Summoned list under a command not known to send one. So is an answer that would
leave a rune or artifact on two monsters. These are missed changes too, and
capture goes on.

An empty root `unit_storage_list` on a mutation names no touched Summoned
stacks and does not prevent its other records from being read. It never clears
the tab. This applies across mutation families, including `BuyShopItem`, rather
than adding a separate exception for each purchase or craft. A request naming
`source_storage_list` still needs a reader that checks every spent stack's
remainder. Non-empty lists under unseen operations remain visible gaps: an
empty-list fix is no evidence of what a non-empty list means.

An unreadable answer to a mutation or current-state read is a missed change.
An unreadable login is the one thing that stops capture: without it there is no
account to update. The service uses the reader's request classification for
this decision; auxiliary chat and service lookups are not account data.

### Where a miss is said

| Surface | What it shows |
| --- | --- |
| `/health` | `missedChanges`: distinct `{command, reason, cause}` misses since the login, at most 50; repeat failures do not use more slots |
| Helper window | *Following your account, with a gap*, naming each command once |
| JASWA, every page | *Live import has a gap* under the import badge, naming up to three commands |
| Diagnostic log | `Missed part of <command>: <reason>` |
| Error report | The first reader failure and the account before it, for replay; an encrypted miss is kept until a reader failure supersedes it |

### Encrypted or unread

Every miss carries a `cause`, and the two ask opposite things of the user.

- **`encrypted`** is proven, never supposed: the answer could not be decoded
  *and* carries the game's per-session-key marker over whole AES blocks
  (`protocol::session_encrypted`). That key never crosses the wire readably
  (below), so no reader can open the answer passively. The surfaces call it the
  game developer's deliberate limit, ask for a game restart rather than an
  error report, and name a Raid result *Rift Raid rewards*.
- **`unread`** is every other miss: a record off the read paths, an answer
  that is not text, JSON or an object, or a broken envelope without the
  marker. It is a reader JASWA still has to write, and the surfaces say a JASWA
  update can fix it and ask for an error report.

The cause, not the command name, decides. A Raid result that failed without
the marker is `unread`, and another command sealed with the session key is
`encrypted` under its own name. When both kinds stand, each sentence names only
its own commands: one sentence once followed the other's, and read as if a
sale of summoning pieces were a Rift Raid reward.

The private session key is named in both the encrypted-only and mixed notices:
no technical change to JASWA or its helper can open these answers through
passive import. That statement applies only to the proven encrypted cause.
Unknown readable formats remain defects to investigate, never relabelled as
impossible to read. A Raid miss must not take the report's only evidence slot
away from a later readable failure such as `BuyShopItem`.

**An encrypted miss that changes nothing JASWA models may be left unsaid.**
`IRRELEVANT_ENCRYPTED_COMMANDS` in `profile.rs` lists such commands; one on it
is written to the diagnostic log and kept off the status. A command joins only
when both halves are established: its misses are `encrypted`, and nothing its
answer can carry is read by JASWA. An `unread` miss never qualifies, however
little its command matters, because a readable answer is a reader to write.
The Raid result never joins: it carries craft items.

| Command | Why its sealed answer changes nothing JASWA reads |
| --- | --- |
| `BattleGuildSiegeResult` | Ends one Siege Battle attack. A Siege fight drops no runes, artifacts, relics, crafts or monsters and gives no experience. Siege rewards arrive later through `GetGuildSiegeRewardCrateList` and `receiveGuildSiegeHonorReward`, both readable; attack decks are saved by `setDeckList`. SWEX's live sync does not read it either. Seen sealed on two attacks, November 3, 2026, between readable Siege queries |

`sellSummonPieces` was the first case this rule decided (November 3, 2026). It
looked like a gap to wave away, since JASWA does nothing with summoning pieces,
but its miss was `unread` — *1 inventory record at item_info was not read* — so
it was read instead: like `BuyBlackMarketItem`, its root `item_info` is the one
inventory stack it changed, at its new total, and a record without a valid
`item_quantity` stays a miss.

JASWA's gap card is yellow for every miss, Raid or not. Import goes on and a
restart closes the gap, so it is something left to do rather than something
broken; red is kept for a stopped import or a lost helper, where nothing
arrives any more.

The fix for a miss is a reader for its path, found in the saved report with
`npm run audit:helper-replay`, never a wider rule that would also admit the
archives above. Often the path is already read and the command is not yet
known as one that changes the account: `combineSelectRuneCraft` (materials
combined into Gems or Grindstones of a chosen set) answered with its new
stones under `reward.crate.changestones` and the materials' remaining stack in
`item_list`, both readable, and was missed until `combine` joined the
reader's account-changing verbs. The answer lists a stack once per stone it
made, each copy already at the new total. The Dimensional Predator raid was the
same case (November 8, 2026): `battleResultDimensionHoleRaid` answers with its
Gem or Grindstone in `changed_item_list[].info` at the stack's new total, as a
Rift Beast does, but a battle counted as a result only when its name *ended*
in `result`. A name that starts with `battleresult` is now one too.

Tartarus's selected Gem or Grindstone was another named-envelope gap
(November 16, 2026): `pickGuildMazeBattleClearReward` was already a mutation,
but the log reported its stack at `pick_changestone_list.after` as unread.
Only that successful selection opens this path. Its `after` record states
the committed stack total, which replaces the previous amount; its `before`
copy is historical and is never imported. A missing identifier or total is a
visible gap, including for a stack the account already knows. Other commands'
`after` fields retain their candidate meaning, and an archive cannot reopen
this path just by containing its name.

Daily quest claims use the same current-record boundary (November 16, 2026).
The diagnostic log recorded three inventory records at `item_list` and one
rune at `rune_list` missed by `rewardDailyQuestPoint_v2`: both paths were
already readable, but `reward` was missing from the account-changing verbs.
It now joins `receive` and `claim`; numeric suffixes and case follow the same
classification. Queries and historical wrappers still cannot apply rewards,
failed claims change nothing, and repeating a claim replaces totals rather
than adding them again. Empty and populated account tests hold these boundaries.

Reappraisal Stones were the same kind of gap (November 22, 2026). The
diagnostic log reported *1 inventory record at item_info was not read; 1 rune
record at rune was not read* on every `RevalueRune`, because no verb in its
name was known. Its answer carries two different things. `item_info` is the
Reappraisal Stone stack (`item_master_type` 37) at its new total, and is read
as `BuyBlackMarketItem`'s is. `rune` is a candidate: the game then sends
`ConfirmRune` with `before_after` 1 to keep the rune as it was or 2 to take
the roll, and answers with the committed rune, which the existing confirm
reading applies. The candidate is therefore never read and never reported;
read as current, a declined roll would have replaced the rune the player
kept. A captured session of ten rolls on two runes, with both choices,
established both halves.

### Raid response-key negotiation

`PASSIVE-GAME-DATA-CONTRACT.md` is binding: substitute response keys, login
fallback rewrites and translated replies are forbidden. Investigation and
recovery must read existing game data without changing game messages.

A private report captured on November 1, 2026 reproduces a failure before the
record reader: `BattleRiftOfWorldsRaidResult` cannot pass `decode_response`.
The HTTP response is complete: its body is exactly the declared 1,768 bytes.
Its first 16 ASCII characters are the marker `Vv2XRzS1O1AW8FuV`, followed by
base64 ciphertext. Decoding the marker as part of the ciphertext produces the
misleading 1,324-byte result, which is not aligned to AES's 16-byte blocks.
Removing the marker fixes that alignment, but does not supply the key. The
request decodes normally. Both saved reports show successive Raid failures
interleaved with successful rune changes; replay fails without a browser or
recommendation calculation running. A fresh Steam login followed by a 30-run
R5 repeat reproduced the miss on each completed result, with no Gem or
Grindstone operation since login. Simultaneous crafting is not needed to
trigger the defect.

Inspection of the current Android client (9.3.8, ARM64) establishes the transport
contract. Offsets below are relative to its unpacked `libc2ssmon.so`, rather
than to its load address:

- `0x15331f0` generates a 16-character AES key using printable ASCII 33–126;
  `0x15332dc` retrieves it from the client's private state.
- `0x519c24` wraps that key using the server's public RSA key. The Java
  `CommonSrc.RSAEncrypt` implementation uses `RSA/NONE/PKCS1Padding` and
  base64. The login builder at `0x15227e8` writes this envelope as `sck`.
- The response callback at `0x154ec48` recognises the marker, skips its 16
  characters and decrypts the remaining base64 with the private response key,
  AES-128-CBC, a zero IV and PKCS7 padding, then inflates zlib JSON. The same
  callback also accepts unmarked responses encrypted with the fixed gateway
  key, at `0x154ef70` and `0x154f098`.

The saved Raid reports contain neither the client's private AES key nor a
plaintext Raid answer. An RSA-wrapped login key would not recover the AES key
either. These reports cannot be retrospectively decoded with the fixed key;
their reward contents remain unknown. Do not invent those contents, suppress
the miss or reclassify Raid results as auxiliary traffic.

The helper remains passive: it does not replace `sck`, negotiate its own key
or translate replies. A fresh Steam login captured the same 256-byte RSA
envelope in `sck`, and its readable response supplied the full craft inventory.
The import-parity audit passed against that actual login capture. Local key
negotiation is not necessary for a complete import at login, whose snapshot
already contains the owned grindstones. For live awards after that login, a readable Raid result
or another authoritative current inventory response is necessary. An unreadable
result cannot be reconstructed from a battle-start request or a rune change.

SWEX does not provide a different passive decoder for this envelope. Its
[current decoder](https://github.com/Xzandro/sw-exporter/blob/eb7f8c09b976d7b76c51ebb30765bfdf381c3888/app/proxy/smon_decryptor.js)
uses fixed-key AES-CBC and zlib, and its
[proxy](https://github.com/Xzandro/sw-exporter/blob/eb7f8c09b976d7b76c51ebb30765bfdf381c3888/app/proxy/SWProxy.js)
catches a decoding failure and emits no command. Its
[LiveSync plugin](https://github.com/Xzandro/sw-exporter/blob/eb7f8c09b976d7b76c51ebb30765bfdf381c3888/app/plugins/live-sync.js)
reads Raid crafts from `BattleRiftOfWorldsRaidResult` itself. The installed
SWEX 1.0.0 decoder was also run against both private reports: each request
decoded, and each response failed with `WRONG_FINAL_BLOCK_LENGTH`. Its fixed
key equals JASWA's. Silently following SWEX's failure handling would hide the
gap rather than recover the inventory.

The saved readable traffic contains 82 `battleRiftOfWorldsRaidCreateSingle`
answers and 5 `battleScoutResume` answers: these carry battle progress, not
owned craft records. Its 247 `AmplifyRune_v2` and 37 `ConvertRune_v2` answers
restate only the consumed craft stack, so cannot recover awards to other
stacks. The client also names `GetRuneCraftItemList`, but opening the craft
inventory in the recorded Steam session sent no inventory request. A capture
of that command is still needed to establish its response path, completeness
and trigger before making it an authoritative replacement.

Read-only inspection also found the Steam client's local `app.conf`,
`preparehub.dat` and `localvalue.dat`. They are not gateway JSON exports:
`app.conf` contains a binary store with some JSON values, while the latter
two contain encoded data terminated as C strings and do not decode with the
gateway key. No readable current craft inventory or private response key was
established from these files. The cached `localvalue.dat` predates the fresh
game session. These observations are not a licence to treat unknown local
bytes as inventory. The Raid gap remains unresolved under the passive-only
boundary; local key substitution and fallback negotiation are not solutions
JASWA may implement.

Rift Beasts are a separate, readable path: `BattleRiftDungeonResult` carries
craft records at `item_list[].info`, with the stack's new total `amount` rather
than just the drop quantity. A real Fire Beast Repeat Battle capture contained
all 30 results and 28 craft awards. Comparing their latest amounts with the
helper's account found no disagreement; a stack sold through
`SellRuneCraftItem_v2` remained at zero after `GetRuneCraftRepurchaseList`.
The sale response states that zero; repurchase history must not restore it.

A Repeat Battle's acquired-reward display is not itself a current-inventory
source. Items can be spent or sold while the series runs, and the game keeps
them in the display with a sold mark. Establish what messages opening the
final summary or Record actually sends before giving any returned records
inventory authority. A readable list of historical drops alone does not close
the Raid gap and must not be added to the account a second time.

The November 1 Steam test completed a separate 30-run Chaos Beast Level 5
series. All 30 `BattleRiftOfWorldsRaidResult` responses were unreadable.
Completion sent `battleScoutResume` with series status, without inventory.
The user then opened Record: the traffic and diagnostic logs contained no
new reward or inventory exchange. Ordinary heartbeats and a later
`getInstanceList` were captured, so recording was still active. Neither
completion nor Record supplied a readable replacement in this test.

The same session exposed an independent readable purchase defect:
`BuyBlackMarketItem.item_info` carries a committed generic inventory stack
with `rid`, `item_master_type`, `item_master_id` and the new total
`item_quantity`. Only that purchase's root path authorises the record; a
generic `item_info` elsewhere is not inventory authority. A purchase without
a valid quantity is rejected even for an existing stack, rather than silently
keeping its old total. The captured purchase replays without a miss; this
does not repair the separate encrypted Raid results.

Connection recovery preserves established sockets, the account and missed
changes. It cannot recover an earlier unreadable response and must not say a
gapped account is complete. A fresh readable login repairs the snapshot; the
transport defect must also be fixed to prevent the next Raid result from
opening another gap. Private reports and extracted game binaries stay outside
source control.

## Account data that is updated

| Account data | Direct records | Reward records | Removal or movement |
| --- | --- | --- | --- |
| Monsters | `unit`, `unit_info`, `target_unit`, `unit_list` | Full unit records in a reward payload | `MoveUnitBuilding` (Monster Storage and back), any request naming a `building_id` and the units moving into it, `remove_unit_id_list`, sacrifice sources, sell requests, and the monsters a `ConvertUnitToItem` request names (crafting Engraved Stones answers with the item alone, so the request is the only record of what it spent; roster and Normal shrine copies both go, and a conversion naming no readable monster or spending an engraved one stops live import) |
| Sealed Shrine | `unit_storage_normal_list` at the top of a response; `unit_storage_list` from `getUnitStorageList` and from the `GetUnitStorageList` inside `GetWizardDataPart1` | — | Those lists are the whole tab and replace the collection. `SacrificeUnit_V4` answers with only the Summoned stacks it fed from — an empty list when every fodder came from the roster — and updates those stacks alone; a fed stack its answer does not restate, or an unknown non-empty top-level Summoned list, leaves a visible gap. An empty mutation list with no named Shrine fodder preserves the tab and lets the other rewards arrive. `MoveStorageFromTo` is read side by side — see below |
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
off with the seal, or sealing a monster that still carries gear is set aside
whole as a missed change. Capture goes on.

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
- RTA, World Arena and the `dimensionarena_` command namespace remain outside
  ordinary account sync. One request-scope classification runs before operation
  classification and is shared by the profile reader and unreadable-response
  handling. A seasonal summon, sale, reward or gear move therefore cannot alter
  Scenario, consume its items, replace its Arena defense or report a missed
  ordinary account change. Unknown operations in that namespace stay isolated.
  This is an inventory boundary, not support for Dimension Arena: its seasonal
  monsters, runes and decks need their own model and interface before JASWA can
  use them. A future Rune Exchange into the ordinary account also needs a
  passively captured transfer contract; seasonal records are never promoted by
  their shape or `wizard_id`.
- A relic is not treated like a rune or artifact: its inventory record remains
  in the root collection while individual monster copies are added or removed.
- **Only a command that moves gear changes which runes and artifacts a monster
  carries** — one whose name holds `equip` or `occupation`, and its request or
  the monsters' new gear lists in its answer say where each item went. Any other answer may show a monster in the gear of
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
  copy and is never added to the inventory as well. A monster's gear list read
  from a gear-moving answer takes each item it names out of the inventory, and
  each item that left the list and stands on no monster returns to the
  inventory with its own record. The game's rune management answers
  `EquipRuneList` with the monster's new runes and names what came off only by
  id (`equip_rune_id_list`, `unequip_rune_id_list`), and its request names no
  rune. Read through the request, it left an inventory copy of nearly every
  rune it engraved, lost every rune it took off, and at the next swap kept the
  copy saying "engraved on Lyn" for a rune Lyn no longer carried (November 8,
  2026). Rune Optimization showed that inventory rune as Lyn's while its
  priority rule rightly treated it as free. The account holding such a copy is
  now a contradiction, below, and JASWA's import refuses it.
- **A monster's gear list read from a gear-moving answer takes each rune and
  artifact in it off every other monster**, since one stands on one monster.
  Moving Beth's runes onto Spectra through the game's rune management answered
  with Spectra's list alone and never named Beth, so every moved rune stood on
  both and the move was refused whole (November 8, 2026). A monster the same
  answer also gives a list keeps it: two monsters in one answer claiming one
  rune is an answer at odds with itself, and is refused below.
- **An exchange that would leave a rune or artifact on two monsters, or in the
  inventory while a monster carries it or while its own record says it is
  engraved, is refused whole**, and the account is kept as it stood. JASWA's
  import refuses that account (`validateGameFile`), so serving it would stop live import until the
  next login; refusing the one exchange keeps every later one arriving. The
  diagnostic log names the command, so its shape can be modelled.
- **A refused snapshot is said on every page.** When JASWA cannot import the
  helper's newest snapshot, a *Live import stopped* card stands under the
  import badge with the reason while the helper offers that refused snapshot.
  A readable snapshot or ordinary waiting after the game closes clears it.
  Said on Home alone, the refusal left every other page quietly showing an older
  import.
- **Connection status and import acceptance are separate facts.** A readable
  health answer followed by a refused account remains connected; the refusal
  belongs to import status. A poll publishes its connection outcome only after
  the profile request finishes, so an HTTP or envelope failure cannot alternate
  with a provisional success on every poll. A rejected account is retained by
  helper instance, game session and revision and is not downloaded again until
  one changes or the user explicitly reloads. Transport and envelope failures
  remain retryable, since they do not establish an immutable rejected snapshot.
- **A helper-side refusal is said there too.** In live mode, an unavailable
  helper with an existing import raises the same notice only when its health
  answer reports `lastError`, the helper dashboard's red capture state.
  An unreachable API, an HTTP failure, ordinary waiting and a closed game never
  stand in for that report. A healthy waiting state clears an earlier capture
  warning; recovery to the accepted session and revision needs no new import.
  A rejected account snapshot still names its validation failure on every page,
  in red, as does a helper-side capture failure.
- **A closed game takes its notices with it.** The helper alone decides whether
  Summoners War is running (`gameRunning`, `helper/README.md` *The game
  session*), and when it closes, the helper ends the snapshot, its gaps and
  the errors of that session together. JASWA keeps no copy of its own, so its
  *Live import has a gap* and red cards clear on the next poll. A helper too
  old to read is told to update, not to restart the game.
  An empty workspace does not claim to be showing stale account data.
- **Connection failures have their own corner card on every page.** In direct
  import mode, an unreachable helper, an invalid health response or a missed
  login raises *Helper connection failed*, even before an account is imported.
  A missed login tells the user to quit and reopen the game. Healthy waiting
  clears the card; switching to file import hides it. A live-import stop takes
  precedence so the same failure is never reported twice.
- **Corner colours name the outcome consistently.** Imported data and successful
  loads use green; information such as a helper update uses gold; failed
  connections, refused snapshots, reload failures and missed game changes use
  red. The existing verdict palette supplies all three tones.

The raw traffic log remains the diagnostic record for a response shape that
the current model cannot identify. It is never converted into a guessed item.

### Siege attack teams and useful error evidence

The November 10 Siege warning names one unread monster at
`guildsiege_my_unit_list`. This is the attacking team, separately from
`guildsiege_opp_unit_list`; the
[SWGT personal logger](https://github.com/Cerusa/swgt-personal-swex-plugin/blob/5581abb5d0e55149089b5ab4c778cf21c84c83cc/SWGTPersonalLogger/index.js#L1007)
also reads the former as the attacker's monster records and the latter as
opponents. The reader now opens the attacking list only at the Siege start's
root. Monsters keep their Scenario gear through the existing shared rule.
The opposing list is understood as battle data and cannot introduce account
records, even with colliding identifiers. Neither an unrelated command nor an
archive gains authority from carrying the attacking field name.
Both known guild attack-team starts are current-state reads for decoding
failures too: an unreadable answer must be a visible gap, rather than being
called auxiliary traffic. Their named root paths still limit what is read.

The saved report exposed a second defect: an earlier sealed
`BattleGuildSiegeResult`, already excluded from status as irrelevant, occupied
the report's sole first-failure slot and hid the later readable Siege start.
Such answers now remain in diagnostics and, when enabled, traffic recordings,
but do not occupy that slot. Relevant encrypted misses and readable misses
remain reportable. The saved report therefore establishes the missed path and
the diagnostic defect, but does not permit an exact replay of the Siege start;
its response was not retained by the previous helper.

Rust fixtures cover empty, one and 100 attacking monsters, repeated reads,
foreign owners, failed starts, opponents, archive wrappers, Scenario gear and
numeric command suffixes (including World Guild Battle). Service fixtures
check that an irrelevant sealed result leaves the error slot free for a later
reader defect and that the next dungeon reward still arrives, with empty and
populated inventories. Other battle starts do not gain general authority to
read monsters or rewards; unknown shapes remain visible until passive evidence
establishes their meaning.

## Verification

The November 10 report's `dimensionarena_getSeasonInfo` contains 190 default
monsters, 50 summoned monsters, 49 runes and a seasonal `defense_deck_info`.
The latter shares the ordinary Arena field name and overwrote it, producing an
invalid preset while the unfamiliar seasonal entities raised a false gap.
The [official v9.3.9 announcement](https://steamcommunity.com/app/2426960/announcements/?l=english)
establishes that these are a separate, resettable seasonal inventory. Replaying
the incident now leaves the entire ordinary account and its revision unchanged,
with no miss: 301 roster monsters, 1,249 runes, 620 artifacts and 8 relics.
Fixtures cover empty/one/100 seasonal records, colliding identifiers, matching
owners, reads, summons, sales, gear moves, rewards and unknown seasonal commands.
Service fixtures cover readable and unreadable seasonal answers followed by a
normal dungeon reward. Dimension Raid still reaches ordinary account sync.

`tests/helper-poll-stability.spec.ts` reproduces the Connected/Unavailable loop
using delayed profile responses and observes intermediate DOM changes across
three polls. It checks empty and populated workspaces, unchanged layout,
one read per rejected revision, manual retry and recovery on a new revision or
game session. Delayed HTTP and invalid-envelope failures remain stable and
recover at the same revision. A local browser replay of the private report
also checks the real 1,811-monster account, its refused live snapshot and the
next valid snapshot. The separately downloaded account export is valid: its
original login envelope retained the ordinary defense.

`cargo test --manifest-path helper/src-tauri/Cargo.toml` covers all seven entity
types with empty and populated inventories, unknown commands, unknown ancestors
containing familiar reward paths, genuine acquisitions, selective mail claims,
failed actions and the observed guild-boss and Arena reward archives. It also
covers empty/single/100-rune sales with repurchase history, artifact and craft
sales, current-state reads, direct-record arrays, namespaced mutation families
and incidental mirrors. Service-level encrypted exchange tests confirm that an
unreadable answer to each kind of account command is a missed change, that the
next reward still arrives after it, and that a login clears the list.

`npm run audit:helper-replay -- <traffic.log-or-error-report.json> [expected-rune-count]`
replays a personal capture through the actual Rust account model. A traffic log
must start with its `capture-started` recording boundary and contain a login.
An error report begins at its saved account and
decodes the failed exchange with the helper's own protocol reader. The audit
reports missed changes and final counts, and fails on a miss, an unexpected
rune count, or a sold rune remaining after an incident replay. Earlier traffic
is not replayed without a baseline. `--write-profile <path>` optionally saves
the replayed snapshot locally. Raw requests and records are never printed.
Unreadable exchanges retain their original HTTP messages as `requestBase64`
and `responseBase64`, beside `decodeError`, and are rechecked with the current
decoder. A still-unreadable account reply fails replay; unreadable auxiliary
traffic is explicitly counted as excluded. Missing boundaries and malformed
entries fail instead of disappearing. The audit covers the recorded interval,
not activity outside it or after recording stopped.

The October 30 capture's fresh login contains 1,661 runes. Replaying the guild
metadata and subsequent live responses keeps 1,661, without missed changes;
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
seven saved error reports replay without missed changes; the sale report
still removes all 100 sold runes.

The eighth report, from Repeat Conversion, stopped on
`ConvertArtifactByPiece.artifact_after`, and the same session stopped on it
again with the first of thirty conversions. It was the occasion for separating
`read` from `unread` instead of adding an eighth path. Before the change, each of
the seven earlier reports was replayed and its account saved; after it, every
one replays to an account identical field for field, and none reports a miss.
The eighth replays without a miss too. A traffic recording of the evening's
Repeat Conversion (one login baseline, 69 exchanges, thirty
`ConvertArtifactByPiece` / `ConfirmArtifactConversion` pairs) replays without a
miss; the artifact ends equal to the last confirmation and the material
quantity equal to the last conversion. The fixture
`repeat_conversion_reads_the_confirmation_and_never_the_candidate` holds that
shape for an engraved and an unengraved artifact, with zero, one and ten
attempts, and `a_missed_change_is_named_and_never_stops_the_next_one` holds the
structural promise itself.

[SWEX review](./SWEX-REVIEW.md) records the external sources, existing safeguards
and remaining evidence gaps. A logger displaying a reroll candidate is not proof
that the candidate is committed inventory.

`tests/helper-bulk-sale.spec.ts` generates snapshots with that Rust replay tool
and serves them through the helper polling route. It checks the empty workspace,
the populated Rune Clean-up table, the sold runes leaving it after a sale, and
the next reward. Before/after screenshots and row-box comparisons hold the
remaining rows' measure. The
test requires the Rust toolchain in addition to the project's Playwright setup.

Connection recovery is covered by local TCP/TLS tests in `service.rs`: empty
and populated accounts, repeated recovery on one game connection, partial
requests, in-flight responses, invalid encrypted updates and logins, refused
upstreams, closed and truncated responses, invalid HTTP, failed redirect repair,
shutdown, and new faults arriving during recovery. The real `/health` and
`/profile` responders expose the retained session and the next imported reward;
failed mutations are never replayed. These tests use local game/server peers,
not a running Summoners War client.
