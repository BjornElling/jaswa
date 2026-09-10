use serde::Serialize;
use serde_json::{Map, Value};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use uuid::Uuid;

#[derive(Clone, Copy)]
struct Entity {
    collection: &'static str,
    identifier: &'static str,
    direct: &'static [&'static str],
}

const ENTITIES: [Entity; 7] = [
    Entity {
        collection: "unit_list",
        identifier: "unit_id",
        direct: &["unit_info", "target_unit", "unit"],
    },
    Entity {
        collection: "runes",
        identifier: "rune_id",
        direct: &["rune", "rune_info"],
    },
    Entity {
        collection: "artifacts",
        identifier: "rid",
        direct: &["artifact", "artifact_info"],
    },
    Entity {
        collection: "relics",
        identifier: "rid",
        direct: &["relic", "relic_info"],
    },
    Entity {
        collection: "rune_craft_item_list",
        identifier: "craft_item_id",
        direct: &[
            "rune_craft_item",
            "craft",
            "craft_item",
            "changestone",
            "changestones",
        ],
    },
    Entity {
        collection: "artifact_crafts",
        identifier: "rid",
        direct: &["artifact_craft", "artifact_craft_info", "artifact_crafts"],
    },
    Entity {
        collection: "inventory_info",
        identifier: "rid",
        direct: &["inventory_item", "inventory_info"],
    },
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub has_profile: bool,
    pub updated_at: Option<String>,
    pub source: Option<String>,
    pub revision: u64,
    pub session_id: u64,
    pub instance_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishedProfile {
    pub updated_at: String,
    pub source: String,
    pub revision: u64,
    pub session_id: u64,
    pub instance_id: String,
    pub data: Value,
}

pub struct SwexExport {
    pub filename: String,
    pub content: String,
}

pub struct ProfileStore {
    profile: Option<Value>,
    swex_snapshot: Option<Value>,
    updated_at: Option<String>,
    source: Option<String>,
    revision: u64,
    session_id: u64,
    instance_id: String,
}

impl Default for ProfileStore {
    fn default() -> Self {
        Self {
            profile: None,
            swex_snapshot: None,
            updated_at: None,
            source: None,
            revision: 0,
            session_id: 0,
            instance_id: Uuid::new_v4().to_string(),
        }
    }
}

impl ProfileStore {
    pub fn clear(&mut self) {
        self.profile = None;
        self.swex_snapshot = None;
        self.updated_at = None;
        self.source = None;
    }

    pub fn status(&self) -> Status {
        Status {
            has_profile: self.profile.is_some(),
            updated_at: self.updated_at.clone(),
            source: self.source.clone(),
            revision: self.revision,
            session_id: self.session_id,
            instance_id: self.instance_id.clone(),
        }
    }

    pub fn read(&self) -> Option<PublishedProfile> {
        Some(PublishedProfile {
            updated_at: self.updated_at.clone()?,
            source: self.source.clone()?,
            revision: self.revision,
            session_id: self.session_id,
            instance_id: self.instance_id.clone(),
            data: self.profile.clone()?,
        })
    }

    /// Keeps the untouched login response separate from JASWA's live model.
    /// SWOP consumes the former wire shape, while the latter deliberately
    /// changes as game actions arrive after login.
    pub fn swex_snapshot(&self) -> Option<Value> {
        self.swex_snapshot.clone()
    }

    /* The login response is the snapshot's shape, but it is not always the
    whole login: the game answers `GetUnitStorageList` separately, so both
    Sealed Shrine lists arrive after the snapshot has been taken. Leaving them
    out made the export disagree with the account it was exported from — a
    shrine holding 140 stacks downloaded as a file holding none, and JASWA
    then read that file as an empty shrine.

    Only sections the game itself sent are written back, in the wire shape it
    sent them, so the snapshot stays the untouched login document SWOP expects
    rather than becoming a copy of JASWA's live model. */
    fn record_snapshot_section(&mut self, key: &str, records: &[Value]) {
        let Some(Value::Object(snapshot)) = self.swex_snapshot.as_mut() else {
            return;
        };
        snapshot.insert(key.to_owned(), Value::Array(records.to_vec()));
    }

    pub fn accept_snapshot(&mut self, snapshot: Value) -> bool {
        let Some(object) = snapshot.as_object() else {
            return false;
        };
        if !successful_response(&snapshot) {
            return false;
        }
        if !is_array(object.get("unit_list")) || !is_array(object.get("runes")) {
            return false;
        }
        if !valid_snapshot_collections(object) {
            return false;
        }
        let wizard = identifier(&snapshot, "wizard_id");
        let mut normalized = object.clone();
        let units: Vec<Value> = collection(&snapshot, "unit_list")
            .iter()
            .filter(|unit| wizard.is_none() || identifier(unit, "wizard_id") == wizard)
            .cloned()
            .collect();
        normalized.insert(
            "unit_list".into(),
            Value::Array(normalize(units, "unit_id")),
        );
        if let Some(normal_storage) = snapshot
            .get("unit_storage_normal_list")
            .and_then(Value::as_array)
        {
            /* Normal-shrine records are account-level records in the login
            snapshot, and some game responses omit the per-unit wizard id.
            An explicit different id is still a foreign record and rejects
            the snapshot; an absent id is not evidence that the account
            record should be discarded. */
            if wizard.is_some()
                && normal_storage.iter().any(|unit| {
                    identifier(unit, "wizard_id")
                        .is_some_and(|unit_wizard| Some(unit_wizard) != wizard)
                })
            {
                return false;
            }
            let normal_storage = normal_storage.to_vec();
            normalized.insert(
                "unit_storage_normal_list".into(),
                Value::Array(normalize(normal_storage, "unit_id")),
            );
        }
        normalized.insert(
            "runes".into(),
            Value::Array(normalize(
                collection(&snapshot, "runes").to_vec(),
                "rune_id",
            )),
        );
        normalized.insert(
            "artifacts".into(),
            Value::Array(normalize(
                collection(&snapshot, "artifacts").to_vec(),
                "rid",
            )),
        );
        normalized.insert(
            "relics".into(),
            Value::Array(normalize(collection(&snapshot, "relics").to_vec(), "rid")),
        );
        normalized.insert(
            "rune_craft_item_list".into(),
            Value::Array(normalize(
                collection(&snapshot, "rune_craft_item_list").to_vec(),
                "craft_item_id",
            )),
        );
        self.profile = Some(Value::Object(normalized));
        self.swex_snapshot = Some(snapshot);
        self.updated_at = Some(now());
        self.source = Some("game-start".into());
        self.session_id += 1;
        self.revision += 1;
        true
    }

    pub fn apply_update(&mut self, response: &Value, request: &Value) -> bool {
        if self.profile.is_none()
            || !response.is_object()
            || rta_command(request)
            || !successful_response(response)
        {
            return false;
        }
        let mut profile = self.profile.clone().expect("checked above");
        let mut changed = false;
        let account_wizard_id = identifier(&profile, "wizard_id");
        let response_items = response_entities(
            response,
            "",
            false,
            false,
            false,
            account_wizard_id.as_deref(),
        );
        for (entity, item, trusted) in &response_items {
            if !known_account_entity(&profile, *entity, item)
                && !trusted_account_entity(&profile, *entity, item, *trusted)
            {
                continue;
            }
            let current = collection(&profile, entity.collection).to_vec();
            let next = merge_collection(current.clone(), vec![item.clone()], entity.identifier);
            if next != current {
                set_collection(&mut profile, entity.collection, next);
                changed = true;
                if entity.collection == "unit_list" {
                    changed |= sync_unit_equipment(&mut profile, item);
                }
            }
            if matches!(entity.collection, "runes" | "artifacts" | "relics") {
                changed |= sync_equipment_copies(&mut profile, *entity, item);
            }
        }
        let response_craft_ids = response_items
            .iter()
            .filter(|(entity, _, _)| entity.collection == "rune_craft_item_list")
            .filter_map(|(_, item, _)| identifier(item, "craft_item_id"))
            .collect::<Vec<_>>();
        let command = request
            .get("command")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_ascii_lowercase();
        /* Any response that carries a shrine list carries this account's shrine
        list, so the list itself is the signal — not the command that happened
        to bring it. Gating on `GetUnitStorageList` and `GetWizardDataPart1`
        left the shrine frozen at whatever the last full read said: sealing a
        monster answers under the command that sealed it, and the sealed copy
        stayed on screen until the next login. The response is already known to
        belong to this account — an RTA command and a failed response never
        reach here — and the list it carries is the whole list, so replacing
        the collection with it cannot lose a stack the game still holds. */
        let storage_list = summoned_storage_list(response);
        if storage_list.is_some() {
            let next = normalize(storage_list.unwrap_or_default(), "unit_master_id");
            self.record_snapshot_section("unit_storage_list", &next);
            if collection(&profile, "unit_storage_list") != next.as_slice() {
                set_collection(&mut profile, "unit_storage_list", next);
                changed = true;
            }
        }
        let normal_storage_list = response
            .get("unit_storage_normal_list")
            .and_then(Value::as_array)
            .or_else(|| {
                response
                    .get("GetWizardDataPart1")
                    .and_then(|value| value.get("unit_storage_normal_list"))
                    .and_then(Value::as_array)
            })
            .or_else(|| {
                response
                    .get("GetUnitStorageList")
                    .and_then(|value| value.get("unit_storage_normal_list"))
                    .and_then(Value::as_array)
            });
        if normal_storage_list.is_some() {
            let next = normalize(normal_storage_list.cloned().unwrap_or_default(), "unit_id");
            self.record_snapshot_section("unit_storage_normal_list", &next);
            if collection(&profile, "unit_storage_normal_list") != next.as_slice() {
                set_collection(&mut profile, "unit_storage_normal_list", next);
                changed = true;
            }
        }
        /* A request that names a building and the monsters going into it says
        the same thing whether it carries one `unit_id` or a `unit_id_list`.
        Reading only the singular field left a batched move — the game's own
        way of putting several monsters away at once — changing nothing at
        all, and changing nothing is silent. */
        if let Some(building_id) = request
            .get("building_id")
            .filter(|value| value.is_number() || value.is_string())
        {
            let building_id = building_id.clone();
            changed |= update_unit_building(
                &mut profile,
                &request_identifiers(request, "unit_id"),
                &building_id,
            );
        }
        if command.contains("movestoragefromto") {
            let unit_ids = request_identifiers(request, "unit_id");
            let building_id = match (
                identifier(request, "from").as_deref(),
                identifier(request, "to").as_deref(),
            ) {
                /* `3` is the game's monster-storage side. The actual building
                id is account-specific, so read it from the captured account
                instead of treating the side number as a building id. */
                (_, Some("3")) => monster_storage_building_id(&profile),
                (Some("3"), _) => Some(Value::from(0)),
                _ => None,
            };
            if let Some(building_id) = building_id {
                changed |= update_unit_building(&mut profile, &unit_ids, &building_id);
            }
        }
        for entity in [ENTITIES[1], ENTITIES[2], ENTITIES[3]] {
            if command.contains("equip")
                || command.contains("occupation")
                || command.contains("unequip")
            {
                let bare_item_allowed = entity.collection != "relics";
                for (item_id, destination) in
                    occupation_updates(request, entity.identifier, bare_item_allowed)
                {
                    if entity.collection == "relics" {
                        changed |= if command.contains("unequip") {
                            unequip_relic(&mut profile, &item_id, destination.as_deref())
                        } else {
                            equip_relic(&mut profile, &item_id, destination.as_deref())
                        };
                    } else if command.contains("unequip") {
                        changed |= unequip_equipment(
                            &mut profile,
                            entity,
                            &item_id,
                            destination.as_deref(),
                        );
                    } else {
                        changed |=
                            move_equipment(&mut profile, entity, &item_id, destination.as_deref());
                    }
                }
            }
        }
        if !command.contains("movestoragefromto") {
            changed |= remove_response_entities(&mut profile, response);
            let mut removed_unit_ids = identifiers_in_fields(
                response,
                "unit_id",
                &["remove_unit_id_list", "remove_unit_ids"],
            );
            if command.contains("sacrifice") {
                removed_unit_ids.extend(identifiers_in_fields(
                    request,
                    "unit_id",
                    &["source_unit_list"],
                ));
            }
            changed |= remove_everywhere(&mut profile, ENTITIES[0], &unique(removed_unit_ids));
        }
        if command.contains("sell") {
            for entity in ENTITIES {
                if entity.collection == "inventory_info"
                    || (entity.collection == "rune_craft_item_list"
                        && command.contains("sellrunecraftitem"))
                {
                    continue;
                }
                let ids = request_entity_identifiers(request, entity);
                if ids.is_empty() {
                    continue;
                }
                changed |= remove_everywhere(&mut profile, entity, &ids);
            }
        }
        if command.contains("amplify")
            || command.contains("convert")
            || command.contains("sellrunecraftitem")
        {
            let consumptions = craft_consumptions(request);
            let consumptions = consumptions
                .into_iter()
                .filter(|(id, _)| !response_craft_ids.contains(id))
                .collect::<Vec<_>>();
            if !consumptions.is_empty() {
                let current = collection(&profile, "rune_craft_item_list").to_vec();
                let next = consume_crafts_by_amount(current.clone(), &consumptions);
                if next != current {
                    set_collection(&mut profile, "rune_craft_item_list", next);
                    changed = true;
                }
            }
        }
        if changed {
            self.profile = Some(profile);
            self.updated_at = Some(now());
            self.source = Some("live".into());
            self.revision += 1;
        }
        changed
    }
}

/// Produces the wire-compatible login file that SWEX and SWOP exchange. The
/// explicit download is kept local, but it must retain every response field:
/// a smaller JASWA import payload is not a valid SWOP profile.
pub fn serialize_swex_export(snapshot: &Value) -> Option<SwexExport> {
    let source = snapshot.as_object()?;
    if !is_array(source.get("building_list")) {
        return None;
    }
    let wizard = source.get("wizard_info")?.as_object()?;
    let name = wizard.get("wizard_name")?.as_str()?;
    let wizard_id = identifier(&Value::Object(wizard.clone()), "wizard_id")?;
    let filename = sanitize_filename(&format!("{name}-{wizard_id}"));
    if filename.is_empty() {
        return None;
    }
    Some(SwexExport {
        filename: format!("{filename}.json"),
        content: format!("{}\n", serde_json::to_string_pretty(snapshot).ok()?),
    })
}

/// Matches the Windows-safe basename SWEX derives before adding `.json`.
fn sanitize_filename(name: &str) -> String {
    let sanitized = name
        .chars()
        .filter(|character| {
            !character.is_control()
                && !('\u{0080}'..='\u{009f}').contains(character)
                && !matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
        })
        .collect::<String>()
        .trim_end_matches([' ', '.'])
        .to_owned();
    let mut result = String::new();
    for character in sanitized.chars() {
        if result.len() + character.len_utf8() > 255 {
            break;
        }
        result.push(character);
    }
    result
}

fn now() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_default()
}
fn is_array(value: Option<&Value>) -> bool {
    matches!(value, Some(Value::Array(_)))
}
fn collection<'a>(profile: &'a Value, key: &str) -> &'a [Value] {
    profile
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}
/* The game has returned this complete list in more than one envelope over
time. Keep the wire-shape knowledge at the helper boundary so the profile
never depends on whichever response wrapper happened to carry it. */
fn summoned_storage_list(response: &Value) -> Option<Vec<Value>> {
    response
        .get("unit_storage_list")
        .and_then(Value::as_array)
        .or_else(|| {
            response
                .get("GetUnitStorageList")
                .and_then(|value| value.get("unit_storage_list"))
                .and_then(Value::as_array)
        })
        .or_else(|| {
            response
                .get("GetWizardDataPart1")
                .and_then(|value| value.get("unit_storage_list"))
                .and_then(Value::as_array)
        })
        .or_else(|| {
            response
                .get("GetWizardDataPart1")
                .and_then(|value| value.get("GetUnitStorageList"))
                .and_then(|value| value.get("unit_storage_list"))
                .and_then(Value::as_array)
        })
        .cloned()
}
fn identifier(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(|value| match value {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    })
}
fn object(value: &Value) -> Option<&Map<String, Value>> {
    value.as_object()
}
fn merge_record(current: Option<&Value>, incoming: Value) -> Value {
    match (current.and_then(Value::as_object), incoming) {
        (Some(existing), Value::Object(mut next)) => {
            let mut merged = existing.clone();
            merged.append(&mut next);
            Value::Object(merged)
        }
        (_, value) => value,
    }
}
fn merge_collection(current: Vec<Value>, incoming: Vec<Value>, key: &str) -> Vec<Value> {
    let mut result = Vec::new();
    for item in current {
        if valid_identifier(&item, key) {
            let id = identifier(&item, key).expect("validated identifier");
            if let Some(index) = result
                .iter()
                .position(|current| identifier(current, key).as_deref() == Some(&id))
            {
                result[index] = merge_record(Some(&result[index]), item);
            } else {
                result.push(item);
            }
        }
    }
    for item in incoming {
        if valid_identifier(&item, key) {
            let id = identifier(&item, key).expect("validated identifier");
            if let Some(index) = result
                .iter()
                .position(|current| identifier(current, key).as_deref() == Some(&id))
            {
                result[index] = merge_record(Some(&result[index]), item);
            } else {
                result.push(item);
            }
        }
    }
    result
}

/* Zero and missing ids belong to reward definitions and previews, not to an
owned account collection. Treating them as entities is how five pass-reward
previews collapsed into one phantom rune in the live profile. */
fn valid_identifier(value: &Value, key: &str) -> bool {
    match value.get(key) {
        Some(Value::Number(number)) => number
            .as_u64()
            .is_some_and(|id| (1..=9_007_199_254_740_991).contains(&id)),
        Some(Value::String(string)) => string
            .parse::<u64>()
            .is_ok_and(|id| (1..=9_007_199_254_740_991).contains(&id)),
        _ => false,
    }
}

fn valid_identifier_collection(value: Option<&Value>, key: &str) -> bool {
    let Some(value) = value else {
        return true;
    };
    let Some(items) = value.as_array() else {
        return false;
    };
    let mut identifiers = Vec::with_capacity(items.len());
    for item in items {
        let Some(id) = identifier(item, key).filter(|_| valid_identifier(item, key)) else {
            return false;
        };
        if identifiers.contains(&id) {
            return false;
        }
        identifiers.push(id);
    }
    true
}

fn valid_craft_collection(value: Option<&Value>) -> bool {
    let Some(value) = value else {
        return true;
    };
    let Some(items) = value.as_array() else {
        return false;
    };
    let mut identifiers = Vec::with_capacity(items.len());
    for item in items {
        let Some(id) =
            identifier(item, "craft_item_id").filter(|_| valid_identifier(item, "craft_item_id"))
        else {
            return false;
        };
        let valid_amount = item
            .get("amount")
            .and_then(Value::as_u64)
            .is_some_and(|amount| amount <= 9_007_199_254_740_991);
        if !valid_amount || identifiers.contains(&id) {
            return false;
        }
        identifiers.push(id);
    }
    true
}

/* A full snapshot is the baseline for every visible account total. Rejecting
malformed or duplicate entities here keeps the helper from quietly
producing a smaller profile by normalizing them away. */
fn valid_snapshot_collections(object: &Map<String, Value>) -> bool {
    if !valid_identifier_collection(object.get("unit_list"), "unit_id")
        || !valid_identifier_collection(object.get("unit_storage_normal_list"), "unit_id")
        || !valid_identifier_collection(object.get("runes"), "rune_id")
        || !valid_identifier_collection(object.get("artifacts"), "rid")
        || !valid_identifier_collection(object.get("relics"), "rid")
        || !valid_craft_collection(object.get("rune_craft_item_list"))
        || !valid_identifier_collection(object.get("artifact_crafts"), "rid")
        || !valid_identifier_collection(object.get("inventory_info"), "rid")
    {
        return false;
    }
    let Some(units) = object.get("unit_list").and_then(Value::as_array) else {
        return false;
    };
    for unit in units {
        let Some(unit) = unit.as_object() else {
            return false;
        };
        if !valid_identifier_collection(unit.get("runes"), "rune_id")
            || !valid_identifier_collection(unit.get("artifacts"), "rid")
            || !valid_identifier_collection(unit.get("relics"), "rid")
        {
            return false;
        }
    }
    true
}

fn normalize(items: Vec<Value>, key: &str) -> Vec<Value> {
    merge_collection(Vec::new(), items, key)
}
fn set_collection(profile: &mut Value, key: &str, value: Vec<Value>) {
    if let Some(object) = profile.as_object_mut() {
        object.insert(key.into(), Value::Array(value));
    }
}
fn sync_unit_equipment(profile: &mut Value, unit: &Value) -> bool {
    let mut changed = false;
    for entity in [ENTITIES[1], ENTITIES[2], ENTITIES[3]] {
        let current = collection(profile, entity.collection).to_vec();
        let incoming = collection(unit, entity.collection).to_vec();
        let next = merge_collection(current.clone(), incoming, entity.identifier);
        if next != current {
            set_collection(profile, entity.collection, next);
            changed = true;
        }
    }
    changed
}
fn monster_storage_building_id(profile: &Value) -> Option<Value> {
    collection(profile, "building_list")
        .iter()
        .find(|building| identifier(building, "building_master_id").as_deref() == Some("25"))
        .and_then(|building| building.get("building_id"))
        .cloned()
}
fn update_unit_building(profile: &mut Value, ids: &[String], building_id: &Value) -> bool {
    if ids.is_empty() {
        return false;
    }
    let mut changed = false;
    let mut units = collection(profile, "unit_list").to_vec();
    for unit in &mut units {
        if !identifier(unit, "unit_id").is_some_and(|id| ids.contains(&id)) {
            continue;
        }
        if unit.get("building_id") == Some(building_id) {
            continue;
        }
        if let Some(object) = unit.as_object_mut() {
            object.insert("building_id".into(), building_id.clone());
            changed = true;
        }
    }
    if changed {
        set_collection(profile, "unit_list", units);
    }
    changed
}
fn candidate(value: &Value, entity: Entity) -> bool {
    let Some(value) = object(value) else {
        return false;
    };
    match entity.collection {
        "unit_list" => [
            "unit_master_id",
            "building_id",
            "unit_level",
            "runes",
            "artifacts",
            "relics",
        ]
        .iter()
        .any(|key| value.contains_key(*key)),
        "rune_craft_item_list" => {
            value.contains_key("craft_type") || value.contains_key("craft_type_id")
        }
        "artifact_crafts" => {
            value.contains_key("master_id")
                && (value.contains_key("quantity") || value.contains_key("type"))
        }
        "inventory_info" => {
            value.contains_key("item_master_id")
                && value.contains_key("item_master_type")
                && value.contains_key("item_quantity")
        }
        "runes" => [
            "set_id",
            "slot_no",
            "upgrade_curr",
            "pri_eff",
            "sec_eff",
            "occupied_id",
        ]
        .iter()
        .any(|key| value.contains_key(*key)),
        "artifacts" => ["sec_effects", "slot", "attribute", "unit_style"]
            .iter()
            .any(|key| value.contains_key(*key)),
        "relics" => ["sec_effect", "durability"]
            .iter()
            .any(|key| value.contains_key(*key)),
        _ => false,
    }
}
fn candidate_at(value: &Value, entity: Entity, parent: &str) -> bool {
    if candidate(value, entity) {
        return true;
    }
    match entity.collection {
        "artifacts" if entity.direct.contains(&parent) => {
            ["upgrade_curr", "occupied_id", "level", "locked"]
                .iter()
                .any(|key| value.get(*key).is_some())
        }
        "relics" if entity.direct.contains(&parent) => [
            "upgrade_curr",
            "occupied_id",
            "level",
            "locked",
            "durability",
        ]
        .iter()
        .any(|key| value.get(*key).is_some()),
        _ => false,
    }
}
fn response_entities(
    value: &Value,
    parent: &str,
    inside_unit: bool,
    account_context: bool,
    blocked_context: bool,
    account_wizard_id: Option<&str>,
) -> Vec<(Entity, Value, bool)> {
    let mut found = Vec::new();
    fn visit(
        value: &Value,
        parent: &str,
        inside_unit: bool,
        account_context: bool,
        blocked_context: bool,
        account_wizard_id: Option<&str>,
        found: &mut Vec<(Entity, Value, bool)>,
    ) {
        if let Value::Array(entries) = value {
            for entry in entries {
                visit(
                    entry,
                    parent,
                    inside_unit,
                    account_context,
                    blocked_context,
                    account_wizard_id,
                    found,
                );
            }
            return;
        }
        let Some(map) = value.as_object() else {
            return;
        };
        let blocked_context =
            blocked_context || non_account_container(parent) || superseded_record(parent);
        let account_context = account_context || account_container(parent);
        for entity in ENTITIES {
            let account_identity = account_wizard_id.is_some_and(|wizard_id| {
                identifier(value, "wizard_id").as_deref() == Some(wizard_id)
            });
            if !inside_unit
                && valid_identifier(value, entity.identifier)
                && candidate_at(value, entity, parent)
                && !blocked_context
                && (entity.direct.contains(&parent)
                    || account_collection(parent, entity)
                    || account_context
                    || account_identity)
            {
                found.push((
                    entity,
                    value.clone(),
                    entity.direct.contains(&parent)
                        || account_collection(parent, entity)
                        || account_context
                        || account_identity,
                ));
            }
        }
        if !inside_unit
            && !blocked_context
            && parent == "changed_item_list"
            && changed_item_entity(value).is_some()
        {
            let (entity, item) = changed_item_entity(value).expect("checked above");
            found.push((entity, item, true));
        }
        let is_unit =
            identifier(value, "unit_id").is_some() && candidate_at(value, ENTITIES[0], parent);
        for (key, entry) in map {
            visit(
                entry,
                key,
                inside_unit || is_unit,
                account_context,
                blocked_context,
                account_wizard_id,
                found,
            );
        }
    }
    visit(
        value,
        parent,
        inside_unit,
        account_context,
        blocked_context,
        account_wizard_id,
        &mut found,
    );
    found
}

fn account_collection(parent: &str, entity: Entity) -> bool {
    match entity.collection {
        "unit_list" => matches!(parent, "unit_list" | "units"),
        "runes" => matches!(parent, "runes" | "rune_list"),
        "artifacts" => matches!(parent, "artifacts" | "artifact_list"),
        "relics" => matches!(parent, "relics" | "relic_list"),
        "rune_craft_item_list" => {
            matches!(
                parent,
                "rune_craft_item_list" | "craft_item_list" | "crafts"
            )
        }
        "artifact_crafts" => matches!(parent, "artifact_crafts" | "artifact_craft_list"),
        "inventory_info" => matches!(parent, "inventory_info" | "inventory_item_list"),
        _ => false,
    }
}

fn account_container(parent: &str) -> bool {
    matches!(
        parent,
        "changed_item_list" | "item_list" | "inventory_item_list" | "reward" | "crate"
    )
}

/* The record as it was *before* the action the response is answering. It is
this account's own record, which is exactly what makes it dangerous: it carries
the same identifier, the same wizard id and a complete valid shape, so every
ownership test passes and the merge writes it — after the new state, because the
key sorts later. `UpgradeArtifact_v2` proved it: the response holds `artifact`
at level 15 and `before_artifact` at level 12, and the account kept 12, so a
refined artifact stayed marked unrefined however many times the snapshot
refreshed. A "before" record is history, never account state. */
fn superseded_record(parent: &str) -> bool {
    parent.starts_with("before_")
}

/* These containers describe somebody else's account, a shop preview, or an
unclaimed reward. Their nested records must never become owned inventory. */
fn non_account_container(parent: &str) -> bool {
    let parent = parent.to_ascii_lowercase();
    if parent.starts_with("opp")
        || parent.starts_with("enemy")
        || parent.starts_with("helper")
        || parent.starts_with("friend")
        || parent.starts_with("npc")
        || parent.starts_with("defense")
        || parent.starts_with("temporary_defense")
        || parent.contains("world_arena")
        || parent.contains("ranking")
    {
        return true;
    }
    matches!(
        parent.as_str(),
        "opp_unit_list"
            | "market_list"
            | "shop_item_list"
            | "shop_info"
            | "reward_item_list"
            | "pass_reward_rune_info"
            | "event_list"
            | "webevent_list"
            | "mail_list"
            | "mail_message_list"
            | "inventory_mail_info"
            | "npc_list"
            | "arena_list"
            | "world_ranking"
            | "helper_list"
            | "helper_info"
            | "friend_list"
            | "guild"
            | "defense_deck_info"
            | "temporary_defense_deck"
            | "world_arena_rune_equip_list"
            | "world_arena_artifact_equip_list"
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
fn item_from_account<'a>(profile: &'a Value, entity: Entity, id: &str) -> Option<&'a Value> {
    collection(profile, entity.collection)
        .iter()
        .find(|item| identifier(item, entity.identifier).as_deref() == Some(id))
        .or_else(|| {
            collection(profile, "unit_list")
                .iter()
                .flat_map(|unit| collection(unit, entity.collection))
                .find(|item| identifier(item, entity.identifier).as_deref() == Some(id))
        })
}
fn known_account_entity(profile: &Value, entity: Entity, item: &Value) -> bool {
    identifier(item, entity.identifier)
        .and_then(|id| item_from_account(profile, entity, &id))
        .is_some()
}
fn trusted_account_entity(profile: &Value, entity: Entity, item: &Value, trusted: bool) -> bool {
    if !trusted || !valid_identifier(item, entity.identifier) || !candidate(item, entity) {
        return false;
    }
    let Some(account_wizard_id) = identifier(profile, "wizard_id") else {
        return true;
    };
    /* A unit is the one entity that can look perfectly valid while describing
    somebody else's battle roster. Equipment already proves ownership by
    being in an account reward or carrying the wizard id; a new unit must
    do the same. Known units still follow the merge path above, so partial
    updates to a monster already in the account remain valid. */
    if entity.collection == "unit_list"
        && identifier(item, "wizard_id").as_deref() != Some(account_wizard_id.as_str())
    {
        return false;
    }
    identifier(item, "wizard_id").is_none_or(|wizard_id| wizard_id == account_wizard_id)
}
fn successful_response(response: &Value) -> bool {
    response
        .get("ret_code")
        .map(|value| {
            identifier(&serde_json::json!({"value": value}), "value")
                .is_some_and(|code| code == "0")
        })
        .unwrap_or(true)
}
fn rta_command(request: &Value) -> bool {
    request
        .get("command")
        .and_then(Value::as_str)
        .map(|command| {
            let command = command.to_ascii_lowercase();
            command.contains("rtpvp") || command.contains("world_arena")
        })
        .unwrap_or(false)
}
fn remove_items(items: &[Value], ids: &[String], key: &str) -> Vec<Value> {
    items
        .iter()
        .filter(|item| !identifier(item, key).is_some_and(|id| ids.contains(&id)))
        .cloned()
        .collect()
}
fn move_equipment(
    profile: &mut Value,
    entity: Entity,
    id: &str,
    destination: Option<&str>,
) -> bool {
    let Some(item) = item_from_account(profile, entity, id).cloned() else {
        return false;
    };
    let mut changed = false;
    let mut units = collection(profile, "unit_list").to_vec();
    for unit in &mut units {
        let current = collection(unit, entity.collection).to_vec();
        let mut next = remove_items(&current, &[id.to_owned()], entity.identifier);
        if identifier(unit, "unit_id").as_deref() == destination {
            next = merge_collection(
                next,
                vec![set_equipment_occupation(item.clone(), destination)],
                entity.identifier,
            );
        }
        if next != current {
            set_collection(unit, entity.collection, next);
            changed = true;
        }
    }
    if changed {
        set_collection(profile, "unit_list", units);
    }
    let inventory = collection(profile, entity.collection).to_vec();
    let next = if destination.is_some() {
        remove_items(&inventory, &[id.to_owned()], entity.identifier)
    } else {
        merge_collection(
            inventory.clone(),
            vec![set_equipment_occupation(item, None)],
            entity.identifier,
        )
    };
    if next != inventory {
        set_collection(profile, entity.collection, next);
        changed = true;
    }
    changed
}
fn unequip_equipment(profile: &mut Value, entity: Entity, id: &str, source: Option<&str>) -> bool {
    let Some(item) = item_from_account(profile, entity, id).cloned() else {
        return false;
    };
    let mut changed = false;
    let mut units = collection(profile, "unit_list").to_vec();
    for unit in &mut units {
        if source.is_some() && identifier(unit, "unit_id").as_deref() != source {
            continue;
        }
        let current = collection(unit, entity.collection).to_vec();
        let next = remove_items(&current, &[id.to_owned()], entity.identifier);
        if next != current {
            set_collection(unit, entity.collection, next);
            changed = true;
        }
    }
    if changed {
        set_collection(profile, "unit_list", units);
    }
    let inventory = collection(profile, entity.collection).to_vec();
    let next = merge_collection(
        inventory.clone(),
        vec![set_equipment_occupation(item, None)],
        entity.identifier,
    );
    if next != inventory {
        set_collection(profile, entity.collection, next);
        changed = true;
    }
    changed
}
fn equip_relic(profile: &mut Value, id: &str, destination: Option<&str>) -> bool {
    let Some(destination) = destination else {
        return false;
    };
    let Some(item) = item_from_account(profile, ENTITIES[3], id).cloned() else {
        return false;
    };
    let mut units = collection(profile, "unit_list").to_vec();
    let mut changed = false;
    for unit in &mut units {
        if identifier(unit, "unit_id").as_deref() != Some(destination) {
            continue;
        }
        let current = collection(unit, "relics").to_vec();
        let next = merge_collection(current.clone(), vec![item.clone()], "rid");
        if next != current {
            set_collection(unit, "relics", next);
            changed = true;
        }
    }
    if changed {
        set_collection(profile, "unit_list", units);
    }
    changed
}
fn unequip_relic(profile: &mut Value, id: &str, source: Option<&str>) -> bool {
    let Some(source) = source else {
        /* A relic can be on up to 100 monsters. Without the source monster a
        bare unequip request is not enough information to remove one copy. */
        return false;
    };
    let mut changed = false;
    let mut units = collection(profile, "unit_list").to_vec();
    for unit in &mut units {
        if identifier(unit, "unit_id").as_deref() != Some(source) {
            continue;
        }
        let current = collection(unit, "relics").to_vec();
        let next = remove_items(&current, &[id.to_owned()], "rid");
        if next != current {
            set_collection(unit, "relics", next);
            changed = true;
        }
    }
    if changed {
        set_collection(profile, "unit_list", units);
    }
    changed
}
fn set_equipment_occupation(mut item: Value, destination: Option<&str>) -> Value {
    let occupied_id = destination
        .and_then(|value| value.parse::<i64>().ok())
        .map(Value::from)
        .unwrap_or_else(|| Value::from(0));
    if let Some(object) = item.as_object_mut() {
        object.insert("occupied_id".into(), occupied_id);
        if object.contains_key("occupied_type") {
            object.insert(
                "occupied_type".into(),
                Value::from(if destination.is_some() { 1 } else { 2 }),
            );
        }
    }
    item
}
fn sync_equipment_copies(profile: &mut Value, entity: Entity, item: &Value) -> bool {
    let Some(id) = identifier(item, entity.identifier) else {
        return false;
    };
    let mut changed = false;
    let mut units = collection(profile, "unit_list").to_vec();
    for unit in &mut units {
        let current = collection(unit, entity.collection).to_vec();
        if !current
            .iter()
            .any(|equipment| identifier(equipment, entity.identifier).as_deref() == Some(&id))
        {
            continue;
        }
        let next = merge_collection(current.clone(), vec![item.clone()], entity.identifier);
        if next != current {
            set_collection(unit, entity.collection, next);
            changed = true;
        }
    }
    if changed {
        set_collection(profile, "unit_list", units);
    }
    changed
}
fn remove_response_entities(profile: &mut Value, response: &Value) -> bool {
    let removals = [
        (
            ENTITIES[0],
            ["remove_unit_id_list", "remove_unit_ids"].as_slice(),
        ),
        (
            ENTITIES[1],
            ["remove_rune_id_list", "remove_rune_ids"].as_slice(),
        ),
        (
            ENTITIES[2],
            ["remove_artifact_id_list", "remove_artifact_ids"].as_slice(),
        ),
        (
            ENTITIES[3],
            ["remove_relic_id_list", "remove_relic_ids"].as_slice(),
        ),
        (
            ENTITIES[4],
            [
                "remove_craft_item_id_list",
                "remove_craft_item_ids",
                "remove_craft_id_list",
            ]
            .as_slice(),
        ),
        (
            ENTITIES[5],
            ["remove_artifact_craft_id_list", "remove_artifact_craft_ids"].as_slice(),
        ),
    ];
    let mut changed = false;
    for (entity, fields) in removals {
        let ids = identifiers_in_fields(response, entity.identifier, fields);
        if !ids.is_empty() {
            changed |= remove_everywhere(profile, entity, &ids);
        }
    }
    changed
}
fn remove_everywhere(profile: &mut Value, entity: Entity, ids: &[String]) -> bool {
    let mut changed = false;
    let inventory = collection(profile, entity.collection).to_vec();
    let next = remove_items(&inventory, ids, entity.identifier);
    if next != inventory {
        set_collection(profile, entity.collection, next);
        changed = true;
    }
    let mut units = collection(profile, "unit_list").to_vec();
    for unit in &mut units {
        let current = collection(unit, entity.collection).to_vec();
        let next = remove_items(&current, ids, entity.identifier);
        if next != current {
            set_collection(unit, entity.collection, next);
            changed = true;
        }
    }
    if changed {
        set_collection(profile, "unit_list", units);
    }
    changed
}
fn request_identifiers(value: &Value, key: &str) -> Vec<String> {
    let mut ids = Vec::new();
    fn visit(value: &Value, key: &str, ids: &mut Vec<String>) {
        match value {
            Value::Array(values) => {
                for value in values {
                    visit(value, key, ids);
                }
            }
            Value::Object(values) => {
                for (name, entry) in values {
                    if is_identifier_field(name, key) {
                        collect_identifier_values(entry, key, ids);
                    }
                    visit(entry, key, ids);
                }
            }
            _ => {}
        }
    }
    visit(value, key, &mut ids);
    unique(ids)
}
fn request_entity_identifiers(value: &Value, entity: Entity) -> Vec<String> {
    match entity.collection {
        "unit_list" => request_identifiers(value, "unit_id"),
        "runes" => identifiers_in_fields(value, "rune_id", &["rune_id", "rune_id_list"]),
        "artifacts" => identifiers_in_fields(value, "rid", &["artifact_ids", "artifact_id_list"]),
        "relics" => identifiers_in_fields(value, "rid", &["relic_ids", "relic_id_list"]),
        "rune_craft_item_list" => identifiers_in_fields(
            value,
            "craft_item_id",
            &[
                "craft_item_id",
                "craft_item_id_list",
                "craft_ids",
                "craft_id",
                "craft_id_list",
            ],
        ),
        "artifact_crafts" => identifiers_in_fields(
            value,
            "rid",
            &["artifact_craft_ids", "artifact_craft_id_list"],
        ),
        "inventory_info" => Vec::new(),
        _ => Vec::new(),
    }
}
fn is_identifier_field(name: &str, key: &str) -> bool {
    name == key
        || name == format!("{key}s")
        || name == format!("{key}_list")
        || name == format!("{}_ids", key.trim_end_matches("_id"))
        || (key == "unit_id" && name == "source_unit_list")
        || (key == "rid"
            && matches!(
                name,
                "artifact_ids"
                    | "artifact_id_list"
                    | "relic_ids"
                    | "relic_id_list"
                    | "artifact_craft_ids"
                    | "artifact_craft_id_list"
            ))
        || (key == "craft_item_id"
            && matches!(
                name,
                "craft_id"
                    | "craft_id_list"
                    | "craft_ids"
                    | "craft_item"
                    | "craft_items"
                    | "craft_item_list"
            ))
}
fn collect_identifier_values(value: &Value, key: &str, ids: &mut Vec<String>) {
    match value {
        Value::Array(values) => {
            for value in values {
                collect_identifier_values(value, key, ids);
            }
        }
        Value::Object(_) => {
            if let Some(id) = identifier(value, key) {
                ids.push(id);
            }
        }
        Value::String(value) => ids.push(value.clone()),
        Value::Number(value) => ids.push(value.to_string()),
        _ => {}
    }
}
fn identifiers_in_fields(value: &Value, key: &str, fields: &[&str]) -> Vec<String> {
    let mut ids = Vec::new();
    fn visit(value: &Value, key: &str, fields: &[&str], ids: &mut Vec<String>) {
        let Value::Object(values) = value else {
            if let Value::Array(entries) = value {
                for entry in entries {
                    visit(entry, key, fields, ids);
                }
            }
            return;
        };
        for (name, entry) in values {
            if fields.contains(&name.as_str()) {
                collect_identifier_values(entry, key, ids);
            }
            visit(entry, key, fields, ids);
        }
    }
    visit(value, key, fields, &mut ids);
    unique(ids)
}
fn unique(values: Vec<String>) -> Vec<String> {
    let mut unique = Vec::new();
    for value in values {
        if !unique.contains(&value) {
            unique.push(value);
        }
    }
    unique
}
fn occupation_updates(
    request: &Value,
    key: &str,
    allow_bare_item: bool,
) -> Vec<(String, Option<String>)> {
    let mut updates = Vec::new();
    fn visit(
        value: &Value,
        key: &str,
        allow_bare_item: bool,
        updates: &mut Vec<(String, Option<String>)>,
    ) {
        match value {
            Value::Array(values) => {
                for value in values {
                    visit(value, key, allow_bare_item, updates);
                }
            }
            Value::Object(values) => {
                if let Some(id) = identifier(value, key) {
                    if values.contains_key("unit_id") {
                        updates.push((id, identifier(value, "unit_id")));
                    } else if let Some(occupied_id) = identifier(value, "occupied_id") {
                        updates.push((id, (occupied_id != "0").then_some(occupied_id)));
                    } else if allow_bare_item && (key == "rune_id" || key == "rid") {
                        /* Unequip requests identify the item but omit its old
                        owner; that omission is the game's inventory signal. */
                        updates.push((id, None));
                    }
                }
                for value in values.values() {
                    visit(value, key, allow_bare_item, updates);
                }
            }
            _ => {}
        }
    }
    visit(request, key, allow_bare_item, &mut updates);
    updates
}
fn consume_crafts_by_amount(items: Vec<Value>, consumptions: &[(String, i64)]) -> Vec<Value> {
    items
        .into_iter()
        .filter_map(|item| {
            let Some(id) = identifier(&item, "craft_item_id") else {
                return Some(item);
            };
            let Some(consumed) = consumptions
                .iter()
                .find(|(consumed_id, _)| consumed_id == &id)
                .map(|(_, amount)| *amount)
            else {
                return Some(item);
            };
            let Some(amount) = item.get("amount").and_then(Value::as_i64) else {
                return Some(item);
            };
            let remaining = amount - consumed;
            if remaining <= 0 {
                None
            } else {
                let mut item = item;
                item["amount"] = Value::from(remaining);
                Some(item)
            }
        })
        .collect()
}
fn craft_consumptions(value: &Value) -> Vec<(String, i64)> {
    let mut consumptions: Vec<(String, i64)> = Vec::new();
    fn visit(value: &Value, consumptions: &mut Vec<(String, i64)>) {
        match value {
            Value::Array(values) => {
                for value in values {
                    visit(value, consumptions);
                }
            }
            Value::Object(values) => {
                if let Some(id) = identifier(value, "craft_item_id") {
                    let amount = values
                        .get("amount")
                        .or_else(|| values.get("quantity"))
                        .and_then(Value::as_i64)
                        .unwrap_or(1);
                    if amount > 0 {
                        if let Some((_, current)) =
                            consumptions.iter_mut().find(|(known, _)| known == &id)
                        {
                            *current += amount;
                        } else {
                            consumptions.push((id, amount));
                        }
                    }
                }
                for (name, value) in values {
                    if matches!(name.as_str(), "craft_item_id" | "amount" | "quantity") {
                        continue;
                    }
                    if value.is_array() || value.is_object() {
                        visit(value, consumptions);
                    }
                }
            }
            Value::String(value) => {
                if !value.is_empty() {
                    if let Some((_, current)) =
                        consumptions.iter_mut().find(|(known, _)| known == value)
                    {
                        *current += 1;
                    } else {
                        consumptions.push((value.clone(), 1));
                    }
                }
            }
            Value::Number(value) => {
                let id = value.to_string();
                if let Some((_, current)) = consumptions.iter_mut().find(|(known, _)| known == &id)
                {
                    *current += 1;
                } else {
                    consumptions.push((id, 1));
                }
            }
            _ => {}
        }
    }
    /* Only these request fields describe craft consumption. Traversing the
    complete request would mistake unrelated numbers for craft ids. */
    for field in [
        "craft_item_id",
        "craft_item_id_list",
        "craft_ids",
        "craft_id",
        "craft_item",
        "craft_item_list",
    ] {
        if let Some(value) = value.get(field) {
            visit(value, &mut consumptions);
        }
    }
    consumptions
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn merges_known_live_equipment_without_leaking_an_opponent() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({"wizard_id": 7, "unit_list": [{"unit_id": 1, "wizard_id": 7, "building_id": 0}], "runes": [{"rune_id": 5, "upgrade_curr": 9}], "artifacts": [], "relics": [], "rune_craft_item_list": []})));
        assert!(store.apply_update(
            &json!({"rune": {"rune_id": 5, "upgrade_curr": 12}}),
            &json!({"command": "UpgradeRune"})
        ));
        assert!(!store.apply_update(
            &json!({"helper": {"unit_id": 2, "wizard_id": 9, "unit_master_id": 10101}}),
            &json!({"command": "GetHelperList_v2"})
        ));
        assert_eq!(store.read().unwrap().data["runes"][0]["upgrade_curr"], 12);
    }

    #[test]
    fn rejects_snapshots_that_cannot_preserve_account_counts() {
        let mut store = ProfileStore::default();
        assert!(!store.accept_snapshot(json!({
            "unit_list": [{"unit_id": 0}],
            "runes": []
        })));
        assert!(store.read().is_none());
    }

    #[test]
    fn moves_and_sells_every_owned_equipment_copy() {
        let mut store = ProfileStore::default();
        store.accept_snapshot(json!({"unit_list": [{"unit_id": 1, "runes": []}], "runes": [{"rune_id": 5}], "artifacts": [], "relics": [], "rune_craft_item_list": []}));
        assert!(store.apply_update(
            &json!({}),
            &json!({"command": "EquipRune", "rune_id": 5, "unit_id": 1})
        ));
        assert_eq!(
            store.read().unwrap().data["unit_list"][0]["runes"][0]["rune_id"],
            5
        );
        assert!(store.apply_update(
            &json!({}),
            &json!({"command": "SellRune", "rune_id_list": [5]})
        ));
        assert_eq!(
            store.read().unwrap().data["unit_list"][0]["runes"],
            json!([])
        );
    }

    #[test]
    fn applies_storage_moves_in_both_directions() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "building_list": [{"building_id": 99, "building_master_id": 25}],
            "unit_list": [
                {"unit_id": 1, "building_id": 0},
                {"unit_id": 2, "building_id": 0}
            ],
            "runes": []
        })));

        assert!(store.apply_update(
            &json!({"result_to": {"unit_storage_list": [{"unit_master_id": 10101}]} }),
            &json!({"command": "MoveStorageFromTo", "from": 1, "to": 3, "unit_id_list": [{"unit_id": 1}, {"unit_id": 2}]})
        ));
        let data = &store.read().unwrap().data;
        assert_eq!(data["unit_list"][0]["building_id"], 99);
        assert_eq!(data["unit_list"][1]["building_id"], 99);

        assert!(store.apply_update(
            &json!({"result_from": {"unit_storage_list": []}}),
            &json!({"command": "MoveStorageFromTo", "from": 3, "to": 1, "unit_id_list": [{"unit_id": 1}]})
        ));
        assert_eq!(store.read().unwrap().data["unit_list"][0]["building_id"], 0);
    }

    #[test]
    fn keeps_normal_shrine_records_without_per_unit_wizard_ids() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [{"unit_id": 1, "wizard_id": 7}],
            "unit_storage_normal_list": [{"unit_id": 8, "unit_master_id": 10101}],
            "runes": []
        })));
        assert_eq!(
            store.read().unwrap().data["unit_storage_normal_list"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn captures_normal_shrine_records_from_a_late_storage_response() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [{"unit_id": 1, "wizard_id": 7}],
            "runes": []
        })));
        assert!(store.apply_update(
            &json!({
                "ret_code": 0,
                "GetWizardDataPart1": {
                    "unit_storage_normal_list": [
                        {"unit_id": 8, "unit_master_id": 10101},
                        {"unit_id": 9, "unit_master_id": 10102}
                    ]
                }
            }),
            &json!({"command": "GetWizardDataPart1"})
        ));
        assert_eq!(
            store.read().unwrap().data["unit_storage_normal_list"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn captures_summoned_shrine_records_from_the_game_response_envelope() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [{"unit_id": 1, "wizard_id": 7}],
            "runes": []
        })));
        assert!(store.apply_update(
            &json!({
                "ret_code": 0,
                "GetUnitStorageList": {
                    "unit_storage_list": [
                        {"unit_master_id": 10101, "quantity": 8, "class": 3},
                        {"unit_master_id": 10102, "quantity": 12, "class": 3}
                    ]
                }
            }
            ),
            &json!({"command": "GetWizardDataPart1"})
        ));
        let storage = &store.read().unwrap().data["unit_storage_list"];
        assert_eq!(storage.as_array().unwrap().len(), 2);
        assert_eq!(storage[0]["quantity"], 8);
        assert_eq!(storage[1]["quantity"], 12);
        assert_eq!(
            summoned_storage_list(&json!({
                "GetWizardDataPart1": {
                    "GetUnitStorageList": {
                        "unit_storage_list": [{"unit_master_id": 10103}]
                    }
                }
            }))
            .unwrap()
            .len(),
            1
        );
    }

    /* One monster or several, the request says the same thing: these units now
    live in that building. Only the singular field was read, so a batched move
    left the roster showing monsters the game had already put away. */
    #[test]
    fn applies_a_building_move_that_names_several_units() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "building_list": [{"building_id": 99, "building_master_id": 25}],
            "unit_list": [
                {"unit_id": 1, "building_id": 0},
                {"unit_id": 2, "building_id": 0},
                {"unit_id": 3, "building_id": 0}
            ],
            "runes": []
        })));
        assert!(store.apply_update(
            &json!({"ret_code": 0}),
            &json!({"command": "MoveUnitBuilding", "building_id": 99, "unit_id_list": [1, 2]})
        ));
        let data = &store.read().unwrap().data;
        assert_eq!(data["unit_list"][0]["building_id"], 99);
        assert_eq!(data["unit_list"][1]["building_id"], 99);
        assert_eq!(data["unit_list"][2]["building_id"], 0);
    }

    /* A building move names units the account already has. A request naming an
    unknown unit must not invent one: a record with no master id is a monster
    no table can show and no count can honour. */
    #[test]
    fn a_building_move_never_invents_a_unit() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "unit_list": [{"unit_id": 1, "building_id": 0}],
            "runes": []
        })));
        assert!(!store.apply_update(
            &json!({"ret_code": 0}),
            &json!({"command": "MoveUnitBuilding", "building_id": 99, "unit_id": 404})
        ));
        assert_eq!(
            store.read().unwrap().data["unit_list"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }

    /* Sealing a monster answers under the command that sealed it, and the game
    sends the whole shrine list back with it. Reading the list only under the
    two full-account commands left the shrine showing yesterday's stacks until
    the next login. */
    #[test]
    fn captures_shrine_lists_from_any_command_that_carries_them() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [{"unit_id": 1, "wizard_id": 7}],
            "unit_storage_list": [{"unit_master_id": 10101, "quantity": 1}],
            "unit_storage_normal_list": [{"unit_id": 8, "unit_master_id": 10101}],
            "runes": []
        })));
        assert!(store.apply_update(
            &json!({
                "ret_code": 0,
                "unit_storage_list": [{"unit_master_id": 10101, "quantity": 2}]
            }),
            &json!({"command": "SealUnit", "unit_id": 1})
        ));
        assert_eq!(
            store.read().unwrap().data["unit_storage_list"][0]["quantity"],
            2
        );
        assert!(store.apply_update(
            &json!({"ret_code": 0, "unit_storage_normal_list": []}),
            &json!({"command": "SummonUnitFromStorage"})
        ));
        assert!(
            store.read().unwrap().data["unit_storage_normal_list"]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn removes_converted_and_sacrificed_units() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "unit_list": [
                {"unit_id": 1},
                {"unit_id": 2},
                {"unit_id": 3}
            ],
            "runes": []
        })));

        assert!(store.apply_update(
            &json!({"remove_unit_id_list": [{"unit_id": 1}], "inventory_item_list": []}),
            &json!({"command": "ConvertUnitToItem", "unit_id_list": [{"unit_id": 1}]})
        ));
        assert!(
            store.read().unwrap().data["unit_list"]
                .as_array()
                .unwrap()
                .iter()
                .all(|unit| unit["unit_id"] != 1)
        );

        assert!(store.apply_update(
            &json!({"target_unit": {"unit_id": 2, "unit_level": 40}}),
            &json!({"command": "SacrificeUnit_V4", "source_unit_list": [{"unit_id": 3}], "target_unit_id": 2})
        ));
        let units = store.read().unwrap().data["unit_list"]
            .as_array()
            .unwrap()
            .clone();
        assert!(units.iter().all(|unit| unit["unit_id"] != 3));
        assert_eq!(
            units.iter().find(|unit| unit["unit_id"] == 2).unwrap()["unit_level"],
            40
        );
    }

    #[test]
    fn keeps_account_equipment_in_step_with_a_unit_update() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "unit_list": [{
                "unit_id": 1,
                "runes": [{"rune_id": 5, "upgrade_curr": 9}],
                "artifacts": [{"rid": 7, "upgrade_curr": 0}]
            }],
            "runes": [{"rune_id": 5, "upgrade_curr": 9}],
            "artifacts": [{"rid": 7, "upgrade_curr": 0}]
        })));
        assert!(store.apply_update(
            &json!({"unit_info": {
                "unit_id": 1,
                "runes": [{"rune_id": 5, "upgrade_curr": 12}],
                "artifacts": [{"rid": 7, "upgrade_curr": 1}]
            }}),
            &json!({"command": "EquipRuneList"})
        ));
        let data = &store.read().unwrap().data;
        assert_eq!(data["runes"][0]["upgrade_curr"], 12);
        assert_eq!(data["artifacts"][0]["upgrade_curr"], 1);
    }

    /* `UpgradeArtifact_v2` answers with the artifact it just refined *and* the
    record as it stood before. Both are this account's, both are complete and
    both carry the wizard id, so the previous state passes every ownership test
    and — sorting after `artifact` — used to be written last. The refined
    artifact kept its old level in the snapshot, and JASWA went on marking it
    unrefined however often it refreshed. */
    #[test]
    fn ignores_the_record_a_response_kept_from_before_the_action() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 21822407,
            "unit_list": [{"unit_id": 1, "wizard_id": 21822407, "artifacts": [{"rid": 7, "slot": 1, "level": 12}]}],
            "runes": [],
            "artifacts": [],
            "relics": []
        })));
        assert!(store.apply_update(
            &json!({
                "artifact": {"rid": 7, "wizard_id": 21822407, "slot": 1, "level": 15},
                "before_artifact": {"rid": 7, "wizard_id": 21822407, "slot": 1, "level": 12},
                "ret_code": 0
            }),
            &json!({"command": "UpgradeArtifact_v2", "artifact_id": 7})
        ));
        let data = &store.read().unwrap().data;
        assert_eq!(data["artifacts"][0]["level"], 15);
        assert_eq!(data["unit_list"][0]["artifacts"][0]["level"], 15);
    }

    #[test]
    fn removes_artifacts_from_the_game_artifact_id_field() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "unit_list": [],
            "runes": [],
            "artifacts": [{"rid": 7, "set_id": 1}],
            "relics": [{"rid": 7, "pri_effect": [100, 12], "sec_effect": [14, 150, 2]}]
        })));
        assert!(store.apply_update(
            &json!({}),
            &json!({"command": "SellArtifacts", "artifact_ids": [7]})
        ));
        assert!(
            store.read().unwrap().data["artifacts"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            store.read().unwrap().data["relics"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn swex_export_keeps_the_complete_login_snapshot_and_uses_its_account_name() {
        let snapshot = json!({
            "session_key": "root",
            "wizard_id": 7,
            "wizard_info": {"wizard_name": "Culpa", "wizard_id": 21822407},
            "unit_list": [{"session_key_node": "nested", "unit_id": 1}],
            "unit_storage_normal_list": [{"unit_id": 8, "wizard_id": 7}],
            "runes": [],
            "artifacts": [],
            "relics": [],
            "rune_craft_item_list": [],
            "artifact_crafts": [{"rid": 4, "session_key": "craft-secret"}],
            "inventory_info": [{"rid": 5}],
            "building_list": [],
            "account_info": {"device_name": "private"},
            "swop_required_field": {"kept": true}
        });
        let export = serialize_swex_export(&snapshot).unwrap();
        let document: Value = serde_json::from_str(&export.content).unwrap();
        assert_eq!(export.filename, "Culpa-21822407.json");
        assert_eq!(document, snapshot);
        assert!(export.content.contains("\n  \"building_list\": []"));
    }

    /* The account this reproduces held 140 summoned stacks and 153 normal
    shrine records, and downloaded an export containing the normal list and no
    summoned list at all: the game sends `GetUnitStorageList` after the login
    response the snapshot is taken from. Re-importing that file showed an empty
    Sealed Shrine · Summoned tab. */
    #[test]
    fn swex_export_carries_shrine_lists_that_arrive_after_the_login_response() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 7,
            "wizard_info": {"wizard_name": "Culpa", "wizard_id": 21822407},
            "building_list": [],
            "unit_list": [{"unit_id": 1, "wizard_id": 7}],
            "runes": []
        })));
        assert!(
            store
                .swex_snapshot()
                .unwrap()
                .get("unit_storage_list")
                .is_none()
        );

        assert!(store.apply_update(
            &json!({
                "ret_code": 0,
                "GetUnitStorageList": {
                    "unit_storage_list": [
                        {"unit_master_id": 10101, "quantity": 8, "class": 3}
                    ],
                    "unit_storage_normal_list": [
                        {"unit_id": 8, "unit_master_id": 10111, "unit_level": 40}
                    ]
                }
            }),
            &json!({"command": "GetUnitStorageList"})
        ));

        let export = serialize_swex_export(&store.swex_snapshot().unwrap()).unwrap();
        let document: Value = serde_json::from_str(&export.content).unwrap();
        assert_eq!(document["unit_storage_list"][0]["quantity"], 8);
        assert_eq!(document["unit_storage_normal_list"][0]["unit_level"], 40);
        /* The snapshot stays the login document: the shrine sections are added
        without the live model's other collections being written over it. */
        assert_eq!(document["unit_list"][0]["unit_id"], 1);
    }

    #[test]
    fn swex_export_requires_the_profile_section_swex_uses_to_identify_a_login() {
        assert!(
            serialize_swex_export(&json!({
                "wizard_info": {"wizard_name": "Culpa", "wizard_id": 21822407}
            }))
            .is_none()
        );
    }

    #[test]
    fn swex_export_sanitizes_only_the_filename_not_the_profile_data() {
        let snapshot = json!({
            "wizard_info": {"wizard_name": "Cul:pa?", "wizard_id": 21822407},
            "building_list": []
        });
        let export = serialize_swex_export(&snapshot).unwrap();
        assert_eq!(export.filename, "Culpa-21822407.json");
        assert_eq!(
            serde_json::from_str::<Value>(&export.content).unwrap(),
            snapshot
        );
    }

    #[test]
    fn accepted_login_keeps_the_untouched_snapshot_for_swex_export() {
        let snapshot = json!({
            "wizard_id": 7,
            "wizard_info": {"wizard_name": "Culpa", "wizard_id": 21822407},
            "building_list": [],
            "unit_list": [],
            "runes": [],
            "unrelated_login_section": {"swop_needs_this": true}
        });
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(snapshot.clone()));
        assert_eq!(store.swex_snapshot(), Some(snapshot));
    }

    #[test]
    fn imports_new_rewards_from_v2_and_legacy_payloads() {
        let mut store = ProfileStore::default();
        store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [],
            "runes": [],
            "artifacts": [],
            "relics": []
        }));

        assert!(store.apply_update(
            &json!({
                "ret_code": 0,
                "changed_item_list": [{
                    "type": 8,
                    "info": {"rune_id": 11, "wizard_id": 7, "set_id": 13, "slot_no": 1}
                }]
            }),
            &json!({"command": "BattleDungeonResult_V2"})
        ));
        assert!(store.apply_update(
            &json!({
                "ret_code": 0,
                "reward": {"crate": {"artifacts": [{
                    "rid": 12,
                    "wizard_id": 7,
                    "type": 1,
                    "pri_effect": [100, 1000],
                    "sec_effects": []
                }]}}
            }),
            &json!({"command": "BattleDungeonResult"})
        ));

        let data = &store.read().unwrap().data;
        assert_eq!(data["runes"].as_array().unwrap().len(), 1);
        assert_eq!(data["artifacts"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn imports_relics_crafts_and_inventory_items_from_account_rewards() {
        let mut store = ProfileStore::default();
        store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [],
            "runes": [],
            "artifacts": [],
            "relics": [],
            "rune_craft_item_list": [{"craft_item_id": 20, "craft_type": 6, "amount": 5}],
            "artifact_crafts": [],
            "inventory_info": []
        }));

        assert!(store.apply_update(
            &json!({
                "ret_code": 0,
                "changed_item_list": [{
                    "type": 999,
                    "info": {
                        "rid": 13,
                        "wizard_id": 7,
                        "pri_effect": [100, 12],
                        "sec_effect": [14, 150, 2]
                    }
                }],
                "reward": {"crate": {"changestones": [{
                    "craft_item_id": 21,
                    "craft_type": 6,
                    "craft_type_id": 140814,
                    "amount": 1,
                    "wizard_id": 7
                }]}},
                "inventory_item_list": [{
                    "rid": 22,
                    "item_master_id": 61,
                    "item_master_type": 61,
                    "item_quantity": 1,
                    "wizard_id": 7
                }]
            }),
            &json!({"command": "ReceiveMail"})
        ));

        let data = &store.read().unwrap().data;
        assert_eq!(data["relics"].as_array().unwrap().len(), 1);
        assert_eq!(data["rune_craft_item_list"].as_array().unwrap().len(), 2);
        assert_eq!(data["inventory_info"].as_array().unwrap().len(), 1);

        assert!(store.apply_update(
            &json!({"ret_code": 0}),
            &json!({"command": "SellRuneCraftItem", "craft_item_id_list": [{"craft_item_id": 20, "amount": 2}]})
        ));
        assert_eq!(
            store.read().unwrap().data["rune_craft_item_list"][0]["amount"],
            3
        );
    }

    #[test]
    fn accepts_a_new_account_item_even_when_a_future_wrapper_name_is_used() {
        let mut store = ProfileStore::default();
        store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [],
            "runes": [],
            "artifacts": [],
            "relics": []
        }));
        assert!(store.apply_update(
            &json!({
                "future_reward_wrapper": {
                    "rune_id": 14,
                    "set_id": 13,
                    "slot_no": 1,
                    "wizard_id": 7
                }
            }),
            &json!({"command": "FutureRewardCommand"})
        ));
        assert_eq!(
            store.read().unwrap().data["runes"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn rejects_rewards_from_previews_and_failed_actions() {
        let mut store = ProfileStore::default();
        store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [],
            "runes": [{"rune_id": 1, "set_id": 1}],
            "artifacts": [],
            "relics": []
        }));

        assert!(!store.apply_update(
            &json!({
                "ret_code": 1,
                "changed_item_list": [{"type": 8, "info": {"rune_id": 2, "wizard_id": 7, "set_id": 1}}]
            }),
            &json!({"command": "BattleDungeonResult_V2"})
        ));
        assert!(!store.apply_update(
            &json!({
                "market_list": [{"runes": [{"rune_id": 3, "wizard_id": 7, "set_id": 1}]}],
                "mail_list": [{"artifact": {"rid": 4, "wizard_id": 7, "type": 1, "pri_effect": [100, 1000]}}]
            }),
            &json!({"command": "GetBlackMarketList"})
        ));

        let data = &store.read().unwrap().data;
        assert_eq!(data["runes"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn rejects_new_monsters_without_this_accounts_wizard_id() {
        let mut store = ProfileStore::default();
        store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [{
                "unit_id": 1,
                "wizard_id": 7,
                "unit_master_id": 10101,
                "unit_level": 40,
                "building_id": 0
            }],
            "runes": [],
            "artifacts": [],
            "relics": []
        }));

        assert!(!store.apply_update(
            &json!({
                "unit_list": [{
                    "unit_id": 2,
                    "unit_master_id": 13815,
                    "unit_level": 40
                }]
            }),
            &json!({"command": "ArenaBattleResult"})
        ));
        assert_eq!(
            store.read().unwrap().data["unit_list"]
                .as_array()
                .unwrap()
                .len(),
            1,
            "a battle unit without the account wizard id is not owned inventory"
        );

        assert!(!store.apply_update(
            &json!({
                "unit_list": [{
                    "unit_id": 3,
                    "wizard_id": 99,
                    "unit_master_id": 13815,
                    "unit_level": 40
                }]
            }),
            &json!({"command": "ArenaBattleResult"})
        ));
        assert_eq!(
            store.read().unwrap().data["unit_list"]
                .as_array()
                .unwrap()
                .len(),
            1,
            "a unit from another wizard is not owned inventory"
        );
    }

    #[test]
    fn rejects_reward_preview_items_with_placeholder_ids() {
        let mut store = ProfileStore::default();
        store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [],
            "runes": [],
            "artifacts": [],
            "relics": []
        }));

        assert!(!store.apply_update(
            &json!({
                "pass_info_list": [{
                    "pass_reward_rune_info": [
                        {
                            "rune_id": 0,
                            "wizard_id": 7,
                            "set_id": 22,
                            "slot_no": 2,
                            "pri_eff": [8, 7],
                            "sec_eff": []
                        },
                        {
                            "rune_id": 123,
                            "wizard_id": 7,
                            "set_id": 22,
                            "slot_no": 3,
                            "pri_eff": [8, 7],
                            "sec_eff": []
                        }
                    ]
                }]
            }),
            &json!({"command": "getPlayPassInfo"})
        ));
        assert!(
            store.read().unwrap().data["runes"]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn updates_equipment_occupation_fields_when_moved() {
        let mut store = ProfileStore::default();
        store.accept_snapshot(json!({
            "unit_list": [{"unit_id": 1, "runes": []}],
            "runes": [{"rune_id": 5, "occupied_id": 0, "occupied_type": 2}]
        }));
        assert!(store.apply_update(
            &json!({}),
            &json!({"command": "EquipRune", "rune_id": 5, "unit_id": 1})
        ));
        let data = &store.read().unwrap().data;
        assert_eq!(data["unit_list"][0]["runes"][0]["occupied_id"], 1);
        assert_eq!(data["unit_list"][0]["runes"][0]["occupied_type"], 1);

        assert!(store.apply_update(&json!({}), &json!({"command": "UnequipRune", "rune_id": 5})));
        assert_eq!(store.read().unwrap().data["runes"][0]["occupied_id"], 0);
        assert_eq!(store.read().unwrap().data["runes"][0]["occupied_type"], 2);
    }

    #[test]
    fn keeps_relic_inventory_when_equipping_and_removes_only_the_selected_copy() {
        let mut store = ProfileStore::default();
        store.accept_snapshot(json!({
            "unit_list": [
                {"unit_id": 1, "relics": []},
                {"unit_id": 2, "relics": [{"rid": 9, "pri_effect": [100, 12]}]}
            ],
            "runes": [],
            "relics": [{"rid": 9, "pri_effect": [100, 12]}]
        }));
        assert!(store.apply_update(
            &json!({}),
            &json!({"command": "EquipRelic", "rid": 9, "unit_id": 1})
        ));
        let data = &store.read().unwrap().data;
        assert_eq!(data["relics"].as_array().unwrap().len(), 1);
        assert_eq!(data["unit_list"][0]["relics"][0]["rid"], 9);
        assert_eq!(data["unit_list"][1]["relics"][0]["rid"], 9);

        assert!(store.apply_update(
            &json!({}),
            &json!({"command": "UnequipRelic", "rid": 9, "unit_id": 1})
        ));
        let data = &store.read().unwrap().data;
        assert_eq!(data["relics"].as_array().unwrap().len(), 1);
        assert!(
            data["unit_list"][0]["relics"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert_eq!(data["unit_list"][1]["relics"][0]["rid"], 9);
    }
}

#[cfg(test)]
mod phantom_rune_regression {
    use super::*;
    use serde_json::json;

    /* The real getPlayPassInfo payload shape: five Play Pass reward previews,
    every one carrying rune_id 0. They describe runes the account does not
    own, and five of them collapsing into one phantom rune is what made a
    whole export unreadable. Reproduced from the user's own traffic log,
    2026-09-02. */
    #[test]
    fn pass_reward_previews_never_enter_the_profile() {
        let preview = || {
            json!({
                "base_value": 760800, "class": 16, "extra": 15, "occupied_id": 0,
                "occupied_type": 2, "prefix_eff": [0, 0], "pri_eff": [8, 7], "rank": 15,
                "rune_id": 0, "sec_eff": [[2, 10, 0, 0]], "sell_value": 40738,
                "set_id": 22, "slot_no": 2, "upgrade_curr": 0, "upgrade_limit": 15,
                "wizard_id": 21822407
            })
        };
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 21822407,
            "unit_list": [{"unit_id": 1, "wizard_id": 21822407, "building_id": 0}],
            "runes": [{"rune_id": 5, "set_id": 22}],
            "artifacts": [], "relics": [], "rune_craft_item_list": []
        })));
        let before = collection(&store.read().unwrap().data, "runes").len();
        store.apply_update(
            &json!({
                "command": "getPlayPassInfo", "ret_code": 0,
                "pass_info_list": [
                    {},
                    {"pass_reward_rune_info": [
                        preview(), preview(), preview(), preview(), preview()
                    ]}
                ]
            }),
            &json!({"command": "getPlayPassInfo"}),
        );
        let profile = store.read().unwrap();
        let runes = collection(&profile.data, "runes");
        assert_eq!(
            runes.len(),
            before,
            "a reward preview must not become an owned rune"
        );
        assert!(
            runes
                .iter()
                .all(|rune| rune.get("rune_id").and_then(Value::as_u64) != Some(0)),
            "no zero-id rune may reach the profile"
        );
    }

    /* A snapshot carrying one is refused outright rather than normalized into a
    smaller profile, which is the other way the record could arrive. */
    #[test]
    fn a_snapshot_carrying_a_zero_id_rune_is_refused() {
        let mut store = ProfileStore::default();
        assert!(!store.accept_snapshot(json!({
            "wizard_id": 21822407,
            "unit_list": [{"unit_id": 1, "wizard_id": 21822407, "building_id": 0}],
            "runes": [{"rune_id": 0, "set_id": 22}],
            "artifacts": [], "relics": [], "rune_craft_item_list": []
        })));
    }
}
