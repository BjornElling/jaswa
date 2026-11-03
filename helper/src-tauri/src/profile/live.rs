//! What one game exchange says about the account.
//!
//! Two passes, kept apart on purpose. `read` follows only the paths an answer
//! uses to state the account as it now is, and what it reaches is applied.
//! `unread` looks everywhere else for this account's records and applies none
//! of them: it only names them, so a change JASWA does not understand yet is
//! said out loud instead of skipped in silence (`AGENTS.md` §0.1).
//!
//! Until October 30, 2026 the two were one pass, and anything the reader could
//! not place refused the whole exchange and paused live import until the next
//! login. Repurchase lists, dungeon enemies, conversion candidates and bundled
//! gear answers did that seven times in one day, each costing every change
//! after it. A record the reader cannot place now costs that record alone.
//!
//! The historical-reward safeguard is the reading rule itself, not a refusal:
//! a guild-boss crate archive or an Arena reward notification sits on no path
//! `read` follows, so its old runes cannot come back however it is wrapped.
use super::{
    ENTITIES, Entity, candidate, gear_moving_command, identifier, item_from_account,
    known_account_entity, merge_record, new_account_entity, request_entity_identifiers,
    response_removals, successful_response, valid_identifier,
};
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum AccountRequest {
    Mutation,
    CurrentState,
    Query,
    History,
    Unknown,
}

impl AccountRequest {
    pub(super) fn reads_current(self) -> bool {
        matches!(self, Self::Mutation | Self::CurrentState)
    }
}

/* The request establishes intent; the response path still has to establish
what changed. Content names do not define new protocols: a dungeon result,
claim or monster power-up uses the same current-record boundary throughout. */
pub(super) fn account_request(request: &Value) -> AccountRequest {
    let command = request.get("command").and_then(Value::as_str).unwrap_or("").to_ascii_lowercase();
    let base = command.rsplit_once("_v")
        .filter(|(_, suffix)| !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit()))
        .map_or(command.as_str(), |(base, _)| base);
    if base == "getserverarenarewardinfofornoti" {
        return AccountRequest::History;
    }
    if matches!(base, "getunitstoragelist" | "getunitinfo") || base.starts_with("getwizarddata") {
        return AccountRequest::CurrentState;
    }
    let verbs = [
        "receive", "claim", "pick", "buy", "repurchase", "summon", "sell",
        "upgrade", "awaken", "evolve", "evolution", "fuse", "fusion", "sacrifice",
        "convert", "amplify", "confirm", "craft", "create", "breakdown",
        "disassemble", "equip", "unequip",
        /* Turning crafting materials into Gems or Grindstones of a chosen set
        (`combineSelectRuneCraft`): the materials' remaining stack arrives in
        `item_list`, the new stones in `reward.crate.changestones`. */
        "combine",
    ];
    if (base.starts_with("battle") && base.ends_with("result"))
        || matches!(base, "arenabattleresult" | "moveunitbuilding" | "movestoragefromto"
            | "dorandomwishitem" | "getupdateddataafterwebevent")
        || (base.starts_with("update") && gear_moving_command(base))
    {
        AccountRequest::Mutation
    } else {
        // Namespaces such as collabo_ do not turn the same claim into a new protocol.
        // The first operation wins: get_sell_history is a query, never a sale.
        for part in base.split('_') {
            if ["get", "check", "list", "query", "preview", "notify"].iter().any(|verb| part.starts_with(verb)) {
                return AccountRequest::Query;
            }
            if verbs.iter().any(|verb| part.starts_with(verb)) {
                return AccountRequest::Mutation;
            }
        }
        AccountRequest::Unknown
    }
}

/// An unreadable answer to a known account operation is a change JASWA
/// missed, not auxiliary traffic. The service and the reader share this line.
pub fn requires_account_response(request: &Value) -> bool {
    account_request(request).reads_current()
}

pub(super) struct Reading {
    pub records: Vec<(Entity, Value)>,
    /// Changes this exchange made that JASWA did not apply, one sentence each.
    pub missed: Vec<String>,
    /// Set when the answer contradicts itself, so no part of it can be trusted.
    pub contradiction: Option<String>,
}

struct Scope<'a> {
    profile: &'a Value,
    wizard: Option<String>,
    command: String,
    kind: AccountRequest,
    claimed_mail_ids: Vec<String>,
}

impl Scope<'_> {
    fn moves_gear(&self) -> bool {
        self.kind == AccountRequest::Mutation && gear_moving_command(&self.command)
    }

    /* Which keys at the root of an answer state the account. Only commands
    that change or restate it have any; the few command-specific envelopes are
    named here, beside the rule they extend, rather than discovered by shape. */
    fn root_edge(&self, key: &str, entry: &Value) -> bool {
        match self.command.as_str() {
            /* A World Guild Battle start answers with the attacking team. Its
            monsters are read; their gear is the preset's, and `apply_update`
            keeps the account's own. */
            "battleguildrivalstart" => return matches!(key, "battle_team" | "unit_list" | "unit_info"),
            "upgraderunelist" if key == "upgrade_rune_list" => return true,
            "buyblackmarketitem" if key == "item_info" => return true,
            "movestoragefromto" if key == "result_from" => return true,
            _ => {}
        }
        if !self.kind.reads_current() {
            return false;
        }
        /* The game bundles gear operations under their command names, each
        with its own result code; a failed child changed nothing. */
        if self.moves_gear()
            && gear_moving_command(&key.to_ascii_lowercase())
            && entry.get("ret_code").is_some()
            && account_request(&json!({"command": key})).reads_current()
        {
            return successful_response(entry);
        }
        edge(key)
    }

    fn foreign(&self, value: &Value) -> bool {
        self.wizard.as_ref().is_some_and(|account| {
            identifier(value, "wizard_id").is_some_and(|wizard| wizard != *account)
        })
    }
}

/* A key below the root that keeps the path current: an entity field, its list
or `updated_` forms, or a reward container. Anything else ends the path, so a
familiar name inside an unfamiliar wrapper never restarts it. */
fn edge(key: &str) -> bool {
    !understood_elsewhere(key)
        && (account_container(key)
            || ENTITIES.iter().any(|entity| direct_record_field(key, *entity) || account_collection(key, *entity)))
}

fn child_edge(path: &str, parent: &str, key: &str) -> bool {
    edge(key)
        || (matches!(parent, "changed_item_list" | "item_list" | "changed_item") && key == "info")
        || (path == "result_from" && key == "add_unit_list")
}

pub(super) fn read(profile: &Value, request: &Value, response: &Value) -> Reading {
    let scope = Scope {
        profile,
        wizard: identifier(profile, "wizard_id"),
        command: request.get("command").and_then(Value::as_str).unwrap_or("").to_ascii_lowercase(),
        kind: account_request(request),
        claimed_mail_ids: mail_claim_ids(request),
    };
    let mut found = Found::default();
    if let Some(map) = response.as_object() {
        for (key, entry) in map {
            if is_mail_list(key) && !scope.claimed_mail_ids.is_empty() {
                // Only the mail the claim named is opened; the rest of the
                // inbox stays a preview.
                for mail in entry.as_array().into_iter().flatten().filter(|mail| {
                    identifier(mail, "mail_id").is_some_and(|id| scope.claimed_mail_ids.contains(&id))
                }) {
                    walk_children(mail, key, &scope, &mut found);
                }
            } else if scope.root_edge(key, entry) {
                walk(entry, key, key, &scope, &mut found);
            }
        }
    }
    let mut reading = found.settle();
    /* Even a query is looked through: one that shows a rune the account does
    not have is evidence of a change JASWA missed. A history notification is
    the exception, because repeating old awards is all it does. */
    if scope.kind != AccountRequest::History {
        let read_ids = reading.records.iter()
            .filter_map(|(entity, item)| Some((entity.collection, identifier(item, entity.identifier)?)))
            .collect::<HashSet<_>>();
        reading.missed.extend(unread(response, request, &scope, &read_ids));
    }
    reading
}

#[derive(Default)]
struct Found {
    records: Vec<(Entity, Value)>,
    confirmed: Vec<(Entity, Value)>,
    missed: Vec<String>,
}

impl Found {
    fn take(&mut self, scope: &Scope<'_>, entity: Entity, item: Value, path: &str, confirmed: bool) {
        if known_account_entity(scope.profile, entity, &item) || new_account_entity(scope.profile, entity, &item) {
            if confirmed { self.confirmed.push((entity, item)) } else { self.records.push((entity, item)) }
        } else {
            self.missed.push(format!(
                "a new {} record at {path} is incomplete ({} {})",
                noun(entity), entity.identifier, identifier(&item, entity.identifier).unwrap_or_default()
            ));
        }
    }

    /* A confirmed record is the committed state, not another candidate to
    merge in JSON order: it replaces every plain copy of its identifier. */
    fn settle(self) -> Reading {
        let Found { mut records, confirmed, missed } = self;
        let mut contradiction = None;
        let mut positions: HashMap<(&str, Option<String>), usize> = HashMap::new();
        let mut committed: Vec<(Entity, Value)> = Vec::new();
        for (entity, item) in confirmed {
            let key = (entity.collection, identifier(&item, entity.identifier));
            if let Some(&index) = positions.get(&key) {
                let existing = &mut committed[index].1;
                let conflict = item.as_object().is_some_and(|fields| fields.iter()
                    .any(|(field, value)| existing.get(field).is_some_and(|current| current != value)));
                if conflict {
                    contradiction.get_or_insert_with(|| format!("two different confirmed {} records", noun(entity)));
                } else {
                    *existing = merge_record(Some(existing), item);
                }
            } else {
                positions.insert(key, committed.len());
                committed.push((entity, item));
            }
        }
        records.retain(|(entity, item)| !positions.contains_key(&(entity.collection, identifier(item, entity.identifier))));
        records.extend(committed);
        Reading { records, missed, contradiction }
    }
}

fn walk(value: &Value, path: &str, parent: &str, scope: &Scope<'_>, found: &mut Found) {
    if scope.command == "buyblackmarketitem" && path == "item_info" {
        if scope.foreign(value) { return; }
        // A purchase must state the new stock total, even for a known item;
        // merging an identifier alone would keep yesterday's quantity silently.
        if !valid_identifier(value,"rid") || !valid_identifier(value,"item_master_id")
            || !valid_identifier(value,"item_master_type")
            || value.get("item_quantity").and_then(Value::as_u64).is_none()
        {
            found.missed.push("the purchased inventory record at item_info is incomplete".into());
        } else {
            found.take(scope,ENTITIES[6],value.clone(),path,false);
        }
        return;
    }
    match value {
        Value::Array(entries) => {
            for entry in entries {
                walk(entry, path, parent, scope, found);
            }
        }
        Value::Object(_) => {
            if matches!(parent, "changed_item_list" | "item_list")
                && let Some((entity, item)) = changed_item_entity(value)
            {
                if !scope.foreign(&item) {
                    found.take(scope, entity, item, path, false);
                }
                return;
            }
            let mut record = false;
            for entity in ENTITIES {
                let named = direct_record_field(parent, entity) || account_collection(parent, entity);
                if valid_identifier(value, entity.identifier) && (named || candidate_at(value, entity, parent)) {
                    record = true;
                    if !scope.foreign(value) {
                        found.take(scope, entity, value.clone(), path, confirmed_record_field(parent).is_some());
                    }
                }
            }
            // A monster's gear is read with the monster, never as records of its own.
            if !record {
                walk_children(value, path, scope, found);
            }
        }
        _ => {}
    }
}

fn walk_children(value: &Value, path: &str, scope: &Scope<'_>, found: &mut Found) {
    let parent = path.rsplit('.').next().unwrap_or(path);
    for (key, entry) in value.as_object().into_iter().flatten() {
        if child_edge(path, parent, key) {
            walk(entry, &format!("{path}.{key}"), key, scope, found);
        }
    }
}

/* Everything this account owns that the answer carries and `read` did not
reach. Nothing here is applied. A record identical to the account's own copy
changed nothing and is not reported; neither are the containers whose meaning
is understood and is not current inventory. */
fn unread(response: &Value, request: &Value, scope: &Scope<'_>, read_ids: &HashSet<(&str, String)>) -> Vec<String> {
    let mut places: BTreeMap<String, (Entity, usize)> = BTreeMap::new();
    let mut removals = Vec::new();
    fn visit(
        value: &Value,
        path: &str,
        scope: &Scope<'_>,
        read_ids: &HashSet<(&str, String)>,
        places: &mut BTreeMap<String, (Entity, usize)>,
        removals: &mut Vec<String>,
    ) {
        match value {
            Value::Array(entries) => {
                for entry in entries {
                    visit(entry, path, scope, read_ids, places, removals);
                }
            }
            Value::Object(map) => {
                if !path.is_empty() && !successful_response(value) {
                    return;
                }
                let root_removals_apply = path.is_empty() && scope.kind.reads_current();
                let shrine_removals_apply = scope.command == "movestoragefromto"
                    && matches!(path, "result_from" | "result_to");
                if !root_removals_apply && !shrine_removals_apply && !response_removals(value).is_empty() {
                    removals.push(if path.is_empty() { "the answer".to_owned() } else { path.to_owned() });
                }
                let mut record = false;
                for entity in ENTITIES {
                    if !valid_identifier(value, entity.identifier) || !candidate(value, entity) {
                        continue;
                    }
                    record = true;
                    if owned_change(value, entity, scope, read_ids) {
                        places.entry(path.to_owned()).or_insert((entity, 0)).1 += 1;
                    }
                }
                if let Some((entity, item)) = changed_item_entity(value) {
                    record = true;
                    if owned_change(&item, entity, scope, read_ids) {
                        places.entry(path.to_owned()).or_insert((entity, 0)).1 += 1;
                    }
                }
                if record {
                    return;
                }
                for (key, entry) in map {
                    if understood_elsewhere(key) {
                        continue;
                    }
                    let child = if path.is_empty() { key.clone() } else { format!("{path}.{key}") };
                    visit(entry, &child, scope, read_ids, places, removals);
                }
            }
            _ => {}
        }
    }
    visit(response, "", scope, read_ids, &mut places, &mut removals);
    let mut missed = places.into_iter()
        .map(|(path, (entity, count))| format!(
            "{count} {} record{} at {} {} not read",
            noun(entity), if count == 1 { "" } else { "s" },
            if path.is_empty() { "the answer's root" } else { &path },
            if count == 1 { "was" } else { "were" }
        ))
        .collect::<Vec<_>>();
    missed.extend(removals.into_iter().map(|path| format!("a removal list at {path} was not read")));
    let action = ["sell", "amplify", "convert", "sacrifice"].iter().any(|verb| scope.command.contains(verb))
        || gear_moving_command(&scope.command)
        || request.get("building_id").is_some();
    if scope.kind == AccountRequest::Unknown
        && action
        && ENTITIES.iter().any(|entity| !request_entity_identifiers(request, *entity).is_empty())
    {
        missed.push("its request acts on account items JASWA does not know this command for".into());
    }
    missed
}

/* A record of this account that would change it. Battle-local monsters carry
`unit_id` and species too, so a monster needs this account's `wizard_id`
before it counts as ours; gear needs only not to name another account. A known
record is compared with the account's copy, a monster's without its gear,
because an answer may show a monster in a deck's gear. */
fn owned_change(value: &Value, entity: Entity, scope: &Scope<'_>, read_ids: &HashSet<(&str, String)>) -> bool {
    let Some(id) = identifier(value, entity.identifier) else { return false };
    if read_ids.contains(&(entity.collection, id.clone())) || scope.foreign(value) {
        return false;
    }
    let monster = entity.collection == "unit_list";
    let Some(current) = item_from_account(scope.profile, entity, &id) else {
        return !monster || (scope.wizard.is_some() && identifier(value, "wizard_id") == scope.wizard);
    };
    if monster && identifier(value, "wizard_id").is_none() {
        return false;
    }
    value.as_object().is_some_and(|fields| fields.iter().any(|(field, incoming)| {
        !(monster && matches!(field.as_str(), "runes" | "artifacts" | "relics"))
            && current.get(field) != Some(incoming)
    }))
}

fn noun(entity: Entity) -> &'static str {
    match entity.collection {
        "unit_list" => "monster",
        "runes" => "rune",
        "artifacts" => "artifact",
        "relics" => "relic",
        "rune_craft_item_list" => "Gem or Grindstone",
        "artifact_crafts" => "artifact material",
        _ => "inventory",
    }
}

fn mail_claim_ids(request: &Value) -> Vec<String> {
    let command = request.get("command").and_then(Value::as_str).unwrap_or("").to_ascii_lowercase();
    if command != "receivemail" && command != "receivemail_v2" {
        return Vec::new();
    }
    super::identifiers_in_fields(request, "mail_id", &["mail_id", "mail_id_list", "mail_ids"])
}

fn is_mail_list(key: &str) -> bool {
    matches!(
        key.to_ascii_lowercase().as_str(),
        "mail_list" | "mail_message_list" | "inventory_mail_info" | "mail_info_list"
    )
}

fn confirmed_record_field(parent: &str) -> Option<&str> {
    let parent = parent.strip_suffix("_list").unwrap_or(parent);
    parent.strip_prefix("confirmed_").or_else(|| parent.strip_suffix("_confirmed"))
}

fn direct_record_field(parent: &str, entity: Entity) -> bool {
    entity.direct.contains(&confirmed_record_field(parent).unwrap_or(parent))
}

fn account_collection(parent: &str, entity: Entity) -> bool {
    let parent = parent.strip_prefix("updated_").unwrap_or(parent);
    if parent.strip_suffix("_list").is_some_and(|name| direct_record_field(name, entity)) {
        return true;
    }
    match entity.collection {
        "unit_list" => matches!(parent, "unit_list" | "units" | "mob_list"),
        "runes" => matches!(parent, "runes" | "rune_list"),
        "artifacts" => matches!(parent, "artifacts" | "artifact_list"),
        "relics" => matches!(parent, "relics" | "relic_list"),
        "rune_craft_item_list" => {
            matches!(parent, "rune_craft_item_list" | "craft_item_list" | "crafts" | "runecraft_list")
        }
        "artifact_crafts" => matches!(parent, "artifact_crafts" | "artifact_craft_list"),
        "inventory_info" => matches!(parent, "inventory_info" | "inventory_item_list"),
        _ => false,
    }
}

fn account_container(parent: &str) -> bool {
    matches!(parent, "changed_item_list" | "item_list" | "inventory_item_list" | "reward" | "crate")
}

/* Containers whose meaning is known and is not this account's current state:
another account, a preview, history, a candidate, or a collection with a
location-aware reader of its own. `read` never enters them and `unread` does
not report them. */
fn understood_elsewhere(key: &str) -> bool {
    let key = key.to_ascii_lowercase();
    let bare = key.strip_suffix("_list").unwrap_or(&key);
    /* The record as it was *before* the action. It is this account's own
    record, same identifier and wizard id, which is exactly what makes it
    dangerous: `UpgradeArtifact_v2` answers with `artifact` at level 15 and
    `before_artifact` at 12, and merged in key order the account kept 12. */
    if bare.starts_with("before_") || bare.ends_with("_before") {
        return true;
    }
    /* A proposal the player may still decline. Conversions answer with one
    (`artifact_after`) and commit it only in a later confirmation, or beside
    it as a `…_confirmed` record. */
    if bare.starts_with("after_") || bare.ends_with("_after") {
        return true;
    }
    if key.starts_with("opp")
        || key.starts_with("enemy")
        || key.starts_with("helper")
        || key.starts_with("friend")
        || key.starts_with("npc")
        || key.starts_with("defense")
        || key.starts_with("temporary_defense")
        || key.contains("world_arena")
        || key.contains("ranking")
        // Items already sold, offered back; a repurchase answers with its own record.
        || key.ends_with("_repurchase_list")
    {
        return true;
    }
    matches!(
        key.as_str(),
        "market_list"
            | "shop_item_list"
            | "shop_info"
            | "reward_item_list"
            // Opened guild-boss crates retain old item records, including sold gear.
            | "clear_reward_crate_list"
            // Displayed teams and previews, not live monster records.
            | "my_unit_deck_list"
            | "rift_dungeon_unit_list"
            | "unit_preview"
            | "pass_reward_rune_info"
            // A monster just sealed into the Normal tab; `apply_shrine_move` files it.
            | "stored_unit_list"
            // These collections have their own location-aware readers.
            | "unit_storage_normal_list"
            | "unit_storage_list"
            | "event_list"
            | "webevent_list"
            | "mail_list"
            | "mail_message_list"
            | "mail_info_list"
            | "inventory_mail_info"
            | "arena_list"
            | "guild"
            | "server_arena_defense_deck_info"
            /* A saved deck names each monster by `unit_id` beside the runes it
            carries in that deck. Read as a unit record it wrote the deck's
            `rune_id_list` into the monster itself; decks are read whole in
            `apply_deck_list` instead. */
            | "deck_info"
            | "deck_list"
            | "deck_recent_list"
            | "equip"
    )
}

fn changed_item_entity(value: &Value) -> Option<(Entity, Value)> {
    let info = value.get("info")?.clone();
    let item_type = identifier(value, "type");
    match item_type.as_deref() {
        /* These are the stable item categories used by the game's V2 dungeon
        reward payload. The shape fallback keeps relics and future equipment
        categories readable without inventing a numeric type code. */
        Some("8") if valid_identifier(&info, ENTITIES[1].identifier) => Some((ENTITIES[1], info)),
        Some("73") if valid_identifier(&info, ENTITIES[2].identifier) => Some((ENTITIES[2], info)),
        _ if valid_identifier(&info, ENTITIES[3].identifier)
            && info.get("sec_effect").is_some()
            && info.get("pri_effect").is_some() =>
        {
            Some((ENTITIES[3], info))
        }
        _ if valid_identifier(&info, ENTITIES[2].identifier)
            && info.get("sec_effects").is_some()
            && info.get("pri_effect").is_some() =>
        {
            Some((ENTITIES[2], info))
        }
        _ => None,
    }
}

fn candidate_at(value: &Value, entity: Entity, parent: &str) -> bool {
    if candidate(value, entity) {
        return true;
    }
    match entity.collection {
        "artifacts" if direct_record_field(parent, entity) => {
            ["upgrade_curr", "occupied_id", "level", "locked"].iter().any(|key| value.get(*key).is_some())
        }
        "relics" if direct_record_field(parent, entity) => {
            ["upgrade_curr", "occupied_id", "level", "locked", "durability"]
                .iter()
                .any(|key| value.get(*key).is_some())
        }
        _ => false,
    }
}
