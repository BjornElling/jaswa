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

const ENTITIES: [Entity; 5] = [
    Entity {
        collection: "unit_list",
        identifier: "unit_id",
        direct: &["unit_info", "unit"],
    },
    Entity {
        collection: "runes",
        identifier: "rune_id",
        direct: &["rune"],
    },
    Entity {
        collection: "artifacts",
        identifier: "rid",
        direct: &["artifact"],
    },
    Entity {
        collection: "relics",
        identifier: "rid",
        direct: &["relic"],
    },
    Entity {
        collection: "rune_craft_item_list",
        identifier: "craft_item_id",
        direct: &["rune_craft_item", "craft"],
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

pub struct ProfileStore {
    profile: Option<Value>,
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

    pub fn accept_snapshot(&mut self, snapshot: Value) -> bool {
        let Some(object) = snapshot.as_object() else {
            return false;
        };
        if !is_array(object.get("unit_list")) || !is_array(object.get("runes")) {
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
        self.updated_at = Some(now());
        self.source = Some("game-start".into());
        self.session_id += 1;
        self.revision += 1;
        true
    }

    pub fn apply_update(&mut self, response: &Value, request: &Value) -> bool {
        if self.profile.is_none() || !response.is_object() || rta_command(request) {
            return false;
        }
        let mut profile = self.profile.clone().expect("checked above");
        let mut changed = false;
        for (entity, item) in response_entities(response, "", false) {
            if !known_account_entity(&profile, entity, &item) {
                continue;
            }
            let current = collection(&profile, entity.collection).to_vec();
            let next = merge_collection(current.clone(), vec![item], entity.identifier);
            if next != current {
                set_collection(&mut profile, entity.collection, next);
                changed = true;
            }
        }
        let command = request
            .get("command")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_ascii_lowercase();
        let unit_id = identifier(request, "unit_id");
        if let (Some(unit_id), Some(_)) = (
            unit_id,
            request
                .get("building_id")
                .filter(|value| value.is_number() || value.is_string()),
        ) {
            let current = collection(&profile, "unit_list").to_vec();
            let next = merge_collection(
                current.clone(),
                vec![
                    serde_json::json!({"unit_id": unit_id, "building_id": request["building_id"]}),
                ],
                "unit_id",
            );
            if next != current {
                set_collection(&mut profile, "unit_list", next);
                changed = true;
            }
        }
        for entity in [ENTITIES[1], ENTITIES[2], ENTITIES[3]] {
            if command.contains("equip")
                || command.contains("occupation")
                || command.contains("unequip")
            {
                for (item_id, destination) in occupation_updates(request, entity.identifier) {
                    changed |=
                        move_equipment(&mut profile, entity, &item_id, destination.as_deref());
                }
            }
        }
        if command.contains("sell") {
            for entity in ENTITIES {
                let ids = request_identifiers(request, entity.identifier);
                if ids.is_empty() {
                    continue;
                }
                changed |= remove_everywhere(&mut profile, entity, &ids);
            }
        }
        if command.contains("amplify") || command.contains("convert") {
            let ids = request_identifiers(request, "craft_item_id");
            if !ids.is_empty() {
                let current = collection(&profile, "rune_craft_item_list").to_vec();
                let next = consume_crafts(current.clone(), &ids);
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

/// The downloadable file is intentionally the game payload, never the helper
/// envelope, and it must not turn a locally captured session secret into a
/// shareable file.
pub fn serialize_export(profile: &Value) -> Option<String> {
    profile.as_object()?;
    Some(format!(
        "{}\n",
        serde_json::to_string_pretty(&remove_session_keys(profile)).ok()?
    ))
}

fn remove_session_keys(value: &Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.iter().map(remove_session_keys).collect()),
        Value::Object(values) => Value::Object(
            values
                .iter()
                .filter(|(key, _)| {
                    key.as_str() != "session_key" && key.as_str() != "session_key_node"
                })
                .map(|(key, value)| (key.clone(), remove_session_keys(value)))
                .collect(),
        ),
        value => value.clone(),
    }
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
        if let Some(id) = identifier(&item, key) {
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
        if let Some(id) = identifier(&item, key) {
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
fn normalize(items: Vec<Value>, key: &str) -> Vec<Value> {
    merge_collection(Vec::new(), items, key)
}
fn set_collection(profile: &mut Value, key: &str, value: Vec<Value>) {
    if let Some(object) = profile.as_object_mut() {
        object.insert(key.into(), Value::Array(value));
    }
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
        _ => [
            "set_id",
            "slot_no",
            "upgrade_curr",
            "pri_effect",
            "sec_effect",
        ]
        .iter()
        .any(|key| value.contains_key(*key)),
    }
}
fn response_entities(value: &Value, parent: &str, inside_unit: bool) -> Vec<(Entity, Value)> {
    let mut found = Vec::new();
    fn visit(value: &Value, parent: &str, inside_unit: bool, found: &mut Vec<(Entity, Value)>) {
        if let Value::Array(entries) = value {
            for entry in entries {
                visit(entry, parent, inside_unit, found);
            }
            return;
        }
        let Some(map) = value.as_object() else {
            return;
        };
        for entity in ENTITIES {
            if !inside_unit
                && identifier(value, entity.identifier).is_some()
                && (entity.direct.contains(&parent) || candidate(value, entity))
            {
                found.push((entity, value.clone()));
            }
        }
        let is_unit = identifier(value, "unit_id").is_some() && candidate(value, ENTITIES[0]);
        for (key, entry) in map {
            visit(entry, key, inside_unit || is_unit, found);
        }
    }
    visit(value, parent, inside_unit, &mut found);
    found
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
            next = merge_collection(next, vec![item.clone()], entity.identifier);
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
        merge_collection(inventory.clone(), vec![item], entity.identifier)
    };
    if next != inventory {
        set_collection(profile, entity.collection, next);
        changed = true;
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
                for (name, value) in values {
                    let aliases: &[&str] = if key == "craft_item_id" {
                        &["craft_id", "craft_id_list", "craft_ids"]
                    } else {
                        &[]
                    };
                    if name == key
                        || name == &format!("{key}s")
                        || name == &format!("{key}_list")
                        || name == &format!("{}_ids", key.trim_end_matches("_id"))
                        || aliases.contains(&name.as_str())
                    {
                        match value {
                            Value::Array(values) => ids.extend(values.iter().filter_map(|value| {
                                identifier(&serde_json::json!({"id": value}), "id")
                            })),
                            _ => {
                                if let Some(id) =
                                    identifier(&serde_json::json!({"id": value}), "id")
                                {
                                    ids.push(id);
                                }
                            }
                        }
                    }
                    visit(value, key, ids);
                }
            }
            _ => {}
        }
    }
    visit(value, key, &mut ids);
    ids
}
fn occupation_updates(request: &Value, key: &str) -> Vec<(String, Option<String>)> {
    let mut updates = Vec::new();
    fn visit(value: &Value, key: &str, updates: &mut Vec<(String, Option<String>)>) {
        match value {
            Value::Array(values) => {
                for value in values {
                    visit(value, key, updates);
                }
            }
            Value::Object(values) => {
                if let Some(id) = identifier(value, key)
                    && values.contains_key("unit_id")
                {
                    updates.push((id, identifier(value, "unit_id")));
                }
                for value in values.values() {
                    visit(value, key, updates);
                }
            }
            _ => {}
        }
    }
    visit(request, key, &mut updates);
    updates
}
fn consume_crafts(items: Vec<Value>, ids: &[String]) -> Vec<Value> {
    items
        .into_iter()
        .filter_map(|item| {
            if !identifier(&item, "craft_item_id").is_some_and(|id| ids.contains(&id)) {
                return Some(item);
            }
            let amount = item.get("amount").and_then(Value::as_i64);
            if amount.unwrap_or(0) <= 1 {
                None
            } else {
                let mut item = item;
                item["amount"] = Value::from(amount.unwrap() - 1);
                Some(item)
            }
        })
        .collect()
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
    fn export_omits_session_secrets_at_every_depth() {
        let exported = serialize_export(&json!({"session_key": "root", "unit_list": [{"session_key_node": "nested", "unit_id": 1}]})).unwrap();
        assert!(!exported.contains("session_key"));
        assert!(exported.contains("unit_id"));
    }
}
