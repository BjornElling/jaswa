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
    /* What the last `apply_update` declined, for the caller to log: monsters
    whose answer showed them in a deck's gear, and an exchange refused whole. */
    set_aside: Vec<String>,
    refused: Option<String>,
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
            set_aside: Vec::new(),
            refused: None,
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

    /// Rebuilds the SWEX wire document from the original login envelope and
    /// the current account collections. The envelope retains every field the
    /// game sent, while the ownership collections reflect actions since login.
    ///
    /// SWEX places equipped runes and artifacts below their monster and keeps
    /// only free copies in the top-level collections. `ProfileStore` keeps an
    /// account-wide index as well, so exporting that index verbatim would make
    /// SWOP see the same item in two locations. Reconstruct those two lists
    /// from their live owners; the remaining collections have the same wire
    /// ownership shape as the live profile.
    pub fn swex_snapshot(&self) -> Option<Value> {
        let mut snapshot = self.swex_snapshot.clone()?;
        let profile = self.profile.as_ref()?;
        let snapshot = snapshot.as_object_mut()?;

        for key in [
            "unit_list",
            "unit_storage_list",
            "unit_storage_normal_list",
            "relics",
            "rune_craft_item_list",
            "artifact_crafts",
            "inventory_info",
        ] {
            let records = collection(profile, key);
            if snapshot.contains_key(key) || !records.is_empty() {
                snapshot.insert(key.to_owned(), Value::Array(records.to_vec()));
            }
        }

        for entity in [ENTITIES[1], ENTITIES[2]] {
            let equipped = collection(profile, "unit_list")
                .iter()
                .flat_map(|unit| collection(unit, entity.collection))
                .filter_map(|item| identifier(item, entity.identifier))
                .collect::<Vec<_>>();
            let inventory = collection(profile, entity.collection)
                .iter()
                .filter(|item| {
                    identifier(item, entity.identifier).is_none_or(|id| !equipped.contains(&id))
                })
                .cloned()
                .collect::<Vec<_>>();
            if snapshot.contains_key(entity.collection) || !inventory.is_empty() {
                snapshot.insert(entity.collection.to_owned(), Value::Array(inventory));
            }
        }

        Some(Value::Object(snapshot.clone()))
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
        if wizard.is_some()
            && collection(&snapshot, "unit_list")
                .iter()
                .any(|unit| identifier(unit, "wizard_id") != wizard)
        {
            return false;
        }
        let units = collection(&snapshot, "unit_list").to_vec();
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

    /// Names an exchange the account model cannot apply faithfully, so the
    /// caller can stop live import instead of letting the account drift.
    pub fn unmodeled_exchange(&self, response: &Value, request: &Value) -> Option<String> {
        unmodeled_shrine_move(self.profile.as_ref(), request, response)
            .or_else(|| unmodeled_unit_conversion(self.profile.as_ref(), request, response))
            .or_else(|| unmodeled_summoned_stacks(request, response))
            .or_else(|| self.live_entities(response, request).unresolved)
    }

    fn live_entities(&self, response: &Value, request: &Value) -> LiveEntities {
        if self.profile.is_none() || rta_command(request) || !successful_response(response) {
            return LiveEntities::default();
        }
        let mut entities = response_entities(response, request, self.profile.as_ref().expect("checked above"), &mail_claim_ids(request));
        let command = request.get("command").and_then(Value::as_str).unwrap_or("").to_ascii_lowercase();
        let action = gear_moving_command(&command) || command.contains("sell")
            || command.contains("amplify") || command.contains("convert") || command.contains("sacrifice")
            || request.get("building_id").is_some();
        let named_items = ENTITIES.iter().any(|entity| !request_entity_identifiers(request, *entity).is_empty());
        if !account_mutation_command(request)
            && ((action && named_items) || !response_removals(response).is_empty())
        {
            entities.unresolved.get_or_insert_with(|| format!(
                "Unrecognised account mutation {command}. Live import is paused until this request is understood."
            ));
        }
        entities
    }

    /// What the last `apply_update` declined: the monsters whose gear it kept
    /// as the account had it, and the reason it refused the exchange, if it did.
    pub fn take_declined(&mut self) -> (Vec<String>, Option<String>) {
        (std::mem::take(&mut self.set_aside), self.refused.take())
    }

    pub fn apply_update(&mut self, response: &Value, request: &Value) -> bool {
        let command = request
            .get("command")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_ascii_lowercase();
        if self.profile.is_none()
            || !response.is_object()
            || rta_command(request)
            || !successful_response(response)
        {
            return false;
        }
        self.set_aside.clear();
        self.refused = None;
        let mut profile = self.profile.clone().expect("checked above");
        let mut changed = false;
        let mutation = account_mutation_command(request);
        let moves_gear = mutation && gear_moving_command(&command);
        let entities = self.live_entities(response, request);
        if let Some(reason) = entities.unresolved {
            self.refused = Some(reason);
            return false;
        }
        let response_items = entities.records;
        /* A normal-shrine record and a live unit have the same identity. The
        game moves that one record between the two collections; it never owns
        two copies under one unit id. Keep the ids that a response establishes
        as live units, so an unseal reply which omits the complete shrine list
        cannot leave yesterday's shrine record beside today's inventory unit. */
        let mut received_unit_ids = Vec::new();
        for (entity, item) in &response_items {
            if !known_account_entity(&profile, *entity, item)
                && !new_account_entity(&profile, *entity, item)
            {
                continue;
            }
            if entity.collection == "unit_list" {
                if let Some(id) = identifier(item, entity.identifier) {
                    received_unit_ids.push(id);
                }
            }
            let scenario;
            let item = if entity.collection == "unit_list" && !moves_gear {
                let (record, set_aside) = with_scenario_gear(&profile, item);
                if set_aside {
                    self.set_aside.extend(identifier(item, "unit_id"));
                }
                scenario = record;
                &scenario
            } else {
                item
            };
            /* The inventory collections hold what no monster carries. A record
            of gear a monster carries updates the monster's copy below, and
            pushed into the inventory it stood in two places at once. */
            if matches!(entity.collection, "runes" | "artifacts")
                && engraved_outside_inventory(&profile, *entity, item)
            {
                changed |= sync_equipment_copies(&mut profile, *entity, item);
                continue;
            }
            if merge_into(&mut profile, entity.collection, item, entity.identifier) {
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
            .filter(|(entity, _)| entity.collection == "rune_craft_item_list")
            .filter_map(|(_, item)| identifier(item, "craft_item_id"))
            .collect::<Vec<_>>();
        /* Only a read of the shrine answers with the whole Summoned tab. A
        power-up answers with the stacks it fed from — none, when every fodder
        came from the roster — so reading that empty list as the tab emptied a
        shrine of 148 stacks on the first ordinary power-up. Sealing answers
        per side and is read in `apply_shrine_move`. */
        if let Some(storage_list) = summoned_storage_list(response, &command) {
            let next = normalize(storage_list, "unit_master_id");
            self.record_snapshot_section("unit_storage_list", &next);
            if collection(&profile, "unit_storage_list") != next.as_slice() {
                set_collection(&mut profile, "unit_storage_list", next);
                changed = true;
            }
        } else if command == "sacrificeunit_v4" {
            changed |= merge_touched_stacks(&mut profile, collection(response, "unit_storage_list"));
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
            /* A list from the game is the complete, authoritative shrine
            location. It wins over a partial unit record elsewhere in this
            response, and evicts any stale live copy with the same id. */
            let shrine_unit_ids = collection(&profile, "unit_storage_normal_list")
                .iter()
                .filter_map(|unit| identifier(unit, "unit_id"))
                .collect::<Vec<_>>();
            changed |=
                remove_collection_items(&mut profile, "unit_list", "unit_id", &shrine_unit_ids);
        } else {
            /* The unseal replies observed in the wild provide the released
            unit but not a replacement shrine list. That direct unit is the
            authoritative location update for its own id. */
            changed |= remove_collection_items(
                &mut profile,
                "unit_storage_normal_list",
                "unit_id",
                &unique(received_unit_ids),
            );
        }
        /* A request that names a building and the monsters going into it says
        the same thing whether it carries one `unit_id` or a `unit_id_list`.
        Reading only the singular field left a batched move — the game's own
        way of putting several monsters away at once — changing nothing at
        all, and changing nothing is silent. */
        if let Some(building_id) = request
            .get("building_id")
            .filter(|_| mutation)
            .filter(|value| value.is_number() || value.is_string())
        {
            let building_id = building_id.clone();
            changed |= update_unit_building(
                &mut profile,
                &request_identifiers(request, "unit_id"),
                &building_id,
            );
        }
        if command == "movestoragefromto" {
            changed |= apply_shrine_move(&mut profile, response);
        }
        if command == "setdecklist" {
            changed |= apply_deck_list(&mut profile, response);
        }
        changed |= apply_defense_decks(&mut profile, response);
        for entity in [ENTITIES[1], ENTITIES[2], ENTITIES[3]] {
            if moves_gear {
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
        if mutation {
            let mut envelopes = vec![response];
            if command == "movestoragefromto" {
                envelopes.extend([response.get("result_from"), response.get("result_to")].into_iter().flatten());
            }
            for envelope in envelopes {
                for (entity, ids) in response_removals(envelope) {
                    changed |= remove_everywhere(&mut profile, entity, &ids);
                }
            }
        }
        let mut removed_unit_ids = Vec::new();
        if mutation && command.contains("sacrifice") {
            removed_unit_ids.extend(identifiers_in_fields(
                request,
                "unit_id",
                &["source_unit_list"],
            ));
        }
        /* Crafting an item out of monsters — an Engraved Stone, say — answers
        with the item it made and says nothing of the monsters it spent. Waiting
        for a `remove_unit_id_list` kept every spent monster on screen, while the
        revision still moved for the new item, so the log read as if it had
        worked. The request is where the spent monsters are named. A sealed
        monster has the same id as the live one it was, so the shrine copy goes
        too. */
        if command == "convertunittoitem" {
            let spent = request_identifiers(request, "unit_id");
            changed |=
                remove_collection_items(&mut profile, "unit_storage_normal_list", "unit_id", &spent);
            removed_unit_ids.extend(spent);
        }
        changed |= remove_everywhere(&mut profile, ENTITIES[0], &unique(removed_unit_ids));
        if mutation && command.contains("sell") {
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
        if mutation && (command.contains("amplify")
            || command.contains("convert")
            || command.contains("sellrunecraftitem"))
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
        /* The last line of defence, for an answer shaped in a way nothing above
        reads correctly yet: an account carrying one rune or artifact on two
        monsters is one JASWA must refuse, and every later revision would be
        refused with it. Keeping the account as it stood leaves live import
        running; the caller names the exchange so the shape can be modelled. */
        if changed && self.profile.as_ref().and_then(contradiction).is_none() {
            if let Some(reason) = contradiction(&profile) {
                self.refused = Some(format!(
                    "{} would have left the account with {reason}; the account was kept as it stood.",
                    request.get("command").and_then(Value::as_str).unwrap_or("An exchange")
                ));
                return false;
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
/* The game has returned the complete Summoned tab in more than one envelope
over time. Keep the wire-shape knowledge at the helper boundary so the profile
never depends on whichever response wrapper happened to carry it. A list at the
top of a response is the whole tab only when the response is the shrine read
itself; elsewhere the same key names the stacks one action touched. */
const WHOLE_SUMMONED_TAB_COMMAND: &str = "getunitstoragelist";

fn summoned_storage_list(response: &Value, command: &str) -> Option<Vec<Value>> {
    response
        .get("unit_storage_list")
        .filter(|_| command == WHOLE_SUMMONED_TAB_COMMAND)
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
/* `MoveStorageFromTo` is the Sealed Shrine's door, and only that: Monster
Storage is `MoveUnitBuilding`, which answers with the moved unit and its new
building. Reading side `3` as Monster Storage — an assumption no capture ever
backed — filed every monster sealed into the Summoned tab as Storage and let a
monster sealed into the Normal tab stay in the inventory. The sides below are
the ones captured traffic shows the game using; any other is refused by
`unmodeled_shrine_move` rather than read. */
const ROSTER_SIDE: &str = "1";
const SUMMONED_SIDE: &str = "3";
const NORMAL_SIDE: &str = "4";

fn shrine_move_sides(request: &Value) -> (Option<String>, Option<String>) {
    (identifier(request, "from"), identifier(request, "to"))
}

/* Each half of the answer describes the side it names. Captured shapes:
- roster → Summoned: `result_to` carries `remove_unit_id_list` (the generic
  removal handles it) and the changed stack in `unit_storage_list`;
- Summoned → roster: `result_from` carries the new unit in `add_unit_list`
  (the generic unit merge handles it) and the changed stack;
- roster → Normal: `result_to.stored_unit_list` carries each monster whole,
  in the shape the Normal list itself holds;
- Normal → roster: `result_from.add_unit_list` carries the released unit, which
  the generic merge files and which then evicts its shrine record.
The stack list here is only the stacks this move touched, never the whole tab,
so it updates stacks by master id instead of replacing the collection. */
/* Saving a Deck Preset answers with every saved deck of that one content type
(`deck_info.deck_type`) as it now stands, so those decks replace the type's
decks in the account and every other type's are left alone. A deck is named
by both `deck_type` and `deck_seq`; keying on the type alone would overwrite
real placements (`docs/DECK-PRESETS.md` §3). An answer that does not carry a
type and a list changes nothing. */
fn apply_deck_list(profile: &mut Value, response: &Value) -> bool {
    let Some(info) = response.get("deck_info") else {
        return false;
    };
    let Some(deck_type) = info.get("deck_type").and_then(Value::as_i64) else {
        return false;
    };
    let Some(decks) = info.get("deck_list").and_then(Value::as_array) else {
        return false;
    };
    if decks
        .iter()
        .any(|deck| deck.get("deck_type").and_then(Value::as_i64) != Some(deck_type))
    {
        return false;
    }
    let current = collection(profile, "deck_list").to_vec();
    let mut next = current
        .iter()
        .filter(|deck| deck.get("deck_type").and_then(Value::as_i64) != Some(deck_type))
        .cloned()
        .collect::<Vec<_>>();
    next.extend(decks.iter().cloned());
    if next == current {
        return false;
    }
    set_collection(profile, "deck_list", next);
    true
}

/* An Arena defense deck is one record of its own, in the same field the login
snapshot carries it in. Saving it (`arenav2_setDefenseUnitList`) answers with
that field whole, and so may other commands: any answer that carries it with
its monster list states the defense as it now stands. */
fn apply_defense_decks(profile: &mut Value, response: &Value) -> bool {
    let mut changed = false;
    for key in ["defense_deck_info", "server_arena_defense_deck_info"] {
        let Some(deck) = response.get(key).filter(|deck| deck.get("unit_id_list").is_some_and(Value::is_array)) else {
            continue;
        };
        if profile.get(key) == Some(deck) {
            continue;
        }
        if let Some(object) = profile.as_object_mut() {
            object.insert(key.into(), deck.clone());
            changed = true;
        }
    }
    changed
}

fn apply_shrine_move(profile: &mut Value, response: &Value) -> bool {
    let mut changed = false;
    for side in ["result_from", "result_to"] {
        if let Some(stacks) = response.get(side) {
            changed |= merge_touched_stacks(profile, collection(stacks, "unit_storage_list"));
        }
    }
    let stored = response
        .get("result_to")
        .and_then(|value| value.get("stored_unit_list"))
        .and_then(Value::as_array)
        .map(|units| {
            units
                .iter()
                .filter(|unit| valid_identifier(unit, "unit_id"))
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if !stored.is_empty() {
        let ids = stored
            .iter()
            .filter_map(|unit| identifier(unit, "unit_id"))
            .collect::<Vec<_>>();
        changed |= remove_collection_items(profile, "unit_list", "unit_id", &ids);
        let current = collection(profile, "unit_storage_normal_list").to_vec();
        let next = merge_collection(current.clone(), stored, "unit_id");
        if next != current {
            set_collection(profile, "unit_storage_normal_list", next);
            changed = true;
        }
    }
    changed
}

/* The Summoned stacks one action touched, each restated with what is left of
it. Stacks the action did not name are untouched, never removed. */
fn merge_touched_stacks(profile: &mut Value, stacks: &[Value]) -> bool {
    if stacks.is_empty() {
        return false;
    }
    let touched = stacks
        .iter()
        .filter_map(|stack| identifier(stack, "unit_master_id"))
        .collect::<Vec<_>>();
    let current = collection(profile, "unit_storage_list").to_vec();
    /* A stack of nothing is not a stack: counting it would show a copy the
    tab no longer holds. */
    let next = merge_collection(current.clone(), stacks.to_vec(), "unit_master_id")
        .into_iter()
        .filter(|stack| {
            !identifier(stack, "unit_master_id").is_some_and(|id| touched.contains(&id))
                || stack.get("quantity").and_then(Value::as_u64) != Some(0)
        })
        .collect::<Vec<_>>();
    if next == current {
        return false;
    }
    set_collection(profile, "unit_storage_list", next);
    true
}

/* A power-up may feed on Summoned stacks as well as on monsters: the request
names them in `source_storage_list`, and the answer restates each in its own
`unit_storage_list`. A fed stack the answer does not restate would keep
counting the copy it spent, so that answer stops live import. So does a top-level
Summoned list under any command not yet seen carrying one: whether it means the
whole tab or the stacks one action touched is the game's to show, not ours to
assume, and assuming "whole tab" is what emptied the shrine. */
fn unmodeled_summoned_stacks(request: &Value, response: &Value) -> Option<String> {
    let command = request.get("command").and_then(Value::as_str)?;
    if !successful_response(response) {
        return None;
    }
    let lower = command.to_ascii_lowercase();
    if lower == WHOLE_SUMMONED_TAB_COMMAND || lower == "movestoragefromto" {
        return None;
    }
    let restated = collection(response, "unit_storage_list")
        .iter()
        .filter_map(|stack| identifier(stack, "unit_master_id"))
        .collect::<Vec<_>>();
    if lower == "sacrificeunit_v4" {
        let fed = collection(request, "source_storage_list");
        let fed_ids = fed
            .iter()
            .filter_map(|stack| identifier(stack, "unit_master_id"))
            .collect::<Vec<_>>();
        if fed_ids.len() != fed.len() {
            return Some(
                "SacrificeUnit_V4 fed on a Summoned stack JASWA cannot read, which JASWA does not model yet."
                    .into(),
            );
        }
        if !fed_ids.iter().all(|id| restated.contains(id)) {
            return Some(
                "SacrificeUnit_V4 fed on a Summoned stack its answer did not restate, which JASWA does not model yet."
                    .into(),
            );
        }
        return None;
    }
    if response.get("unit_storage_list").is_some() {
        return Some(format!(
            "{command} answered with a Summoned shrine list, which JASWA does not model yet."
        ));
    }
    None
}

/* A shrine move JASWA cannot place must stop live import rather than leave a
monster counted where it no longer is. That is exactly what the unread
roster → Normal move did: it changed nothing, and the monster stayed on screen
in the inventory it had left. Each check below is a shape the captured moves
had; an answer without it is one the game has not been seen to give, and its
meaning is to be found out, not assumed. */
fn unmodeled_shrine_move(profile: Option<&Value>, request: &Value, response: &Value) -> Option<String> {
    let command = request.get("command").and_then(Value::as_str)?;
    if !command.eq_ignore_ascii_case("MoveStorageFromTo") || !successful_response(response) {
        return None;
    }
    let (from, to) = shrine_move_sides(request);
    let (from, to) = (from.unwrap_or_default(), to.unwrap_or_default());
    let refuse = |why: &str| {
        Some(format!(
            "MoveStorageFromTo from side {from} to side {to} {why}, which JASWA does not model yet."
        ))
    };
    let half = |side: &str, key: &str| {
        response
            .get(side)
            .and_then(|value| value.get(key))
            .and_then(Value::as_array)
            .cloned()
    };
    match (from.as_str(), to.as_str()) {
        (ROSTER_SIDE, SUMMONED_SIDE) if half("result_to", "remove_unit_id_list").is_none() => {
            return refuse("named no monster leaving the roster");
        }
        (ROSTER_SIDE, NORMAL_SIDE) if half("result_to", "stored_unit_list").is_none() => {
            return refuse("gave no record of the sealed monster");
        }
        (SUMMONED_SIDE | NORMAL_SIDE, ROSTER_SIDE) => {
            let Some(added) = half("result_from", "add_unit_list") else {
                return refuse("gave no record of the released monster");
            };
            /* Leaving the Summoned tab spends one copy of a stack. A stack
            the answer does not restate would keep counting that copy. */
            if from == SUMMONED_SIDE {
                let stacks = half("result_from", "unit_storage_list").unwrap_or_default();
                let restated = |unit: &Value| {
                    identifier(unit, "unit_master_id").is_some_and(|master| {
                        stacks
                            .iter()
                            .any(|stack| identifier(stack, "unit_master_id").as_deref() == Some(&master))
                    })
                };
                if !added.iter().all(restated) {
                    return refuse("did not restate the stack the monster left");
                }
            }
        }
        (ROSTER_SIDE, SUMMONED_SIDE) | (ROSTER_SIDE, NORMAL_SIDE) => {}
        _ => return refuse("moved monsters between sides no captured exchange has shown"),
    }
    /* Every captured seal left the monster's equipment untouched and said so
    with two empty lists. Equipment coming off, or a departing monster still
    carrying some, would leave runes or artifacts attached to a monster the
    roster no longer holds. */
    let unequipped = ["unequip_rune_list", "unequip_artifact_list"].iter().any(|key| {
        half("result_to", key).is_some_and(|items| !items.is_empty())
            || half("result_from", key).is_some_and(|items| !items.is_empty())
    });
    if unequipped {
        return refuse("also took equipment off");
    }
    if from == ROSTER_SIDE {
        let leaving = request_identifiers(request, "unit_id");
        let equipped = profile
            .map(|profile| collection(profile, "unit_list"))
            .unwrap_or(&[])
            .iter()
            .filter(|unit| identifier(unit, "unit_id").is_some_and(|id| leaving.contains(&id)))
            .any(|unit| {
                ["runes", "artifacts", "relics"]
                    .iter()
                    .any(|key| !collection(unit, key).is_empty())
            });
        if equipped {
            return refuse("sealed a monster that still carries equipment");
        }
    }
    None
}

/* A conversion is modelled by the monsters its request names. One that names
none the helper can read would spend monsters and change nothing, which is the
silent drift this whole check exists to stop. Equipment on a spent monster has
to go somewhere, and no captured exchange has shown where. */
fn unmodeled_unit_conversion(
    profile: Option<&Value>,
    request: &Value,
    response: &Value,
) -> Option<String> {
    let command = request.get("command").and_then(Value::as_str)?;
    if !command.eq_ignore_ascii_case("ConvertUnitToItem") || !successful_response(response) {
        return None;
    }
    let spent = request_identifiers(request, "unit_id");
    if spent.is_empty() {
        return Some(
            "ConvertUnitToItem named no monster JASWA can read, which JASWA does not model yet."
                .into(),
        );
    }
    let equipped = profile
        .map(|profile| collection(profile, "unit_list"))
        .unwrap_or(&[])
        .iter()
        .filter(|unit| identifier(unit, "unit_id").is_some_and(|id| spent.contains(&id)))
        .any(|unit| {
            ["runes", "artifacts", "relics"]
                .iter()
                .any(|key| !collection(unit, key).is_empty())
        });
    if equipped {
        return Some(
            "ConvertUnitToItem spent a monster that still carries equipment, which JASWA does not model yet."
                .into(),
        );
    }
    None
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
/* Indexed, because a linear search per record made a merge quadratic in the
collection: one scout result of a hundred runes into an account of 1,500 took
eighteen seconds, and the game gave up waiting for its next answer. */
fn merge_collection(current: Vec<Value>, incoming: Vec<Value>, key: &str) -> Vec<Value> {
    let mut result: Vec<Value> = Vec::new();
    let mut positions = std::collections::HashMap::new();
    for item in current.into_iter().chain(incoming) {
        if valid_identifier(&item, key) {
            let id = identifier(&item, key).expect("validated identifier");
            if let Some(&index) = positions.get(&id) {
                result[index] = merge_record(Some(&result[index]), item);
            } else {
                positions.insert(id, result.len());
                result.push(item);
            }
        }
    }
    result
}

/* Merges one record into a collection where it stands. Every account collection
is already free of duplicate and invalid ids — the snapshot is rejected
otherwise — so this agrees with `merge_collection` without copying the whole
collection for each record a response carries. */
fn merge_item(items: &mut Vec<Value>, item: &Value, key: &str) -> bool {
    let Some(id) = identifier(item, key).filter(|_| valid_identifier(item, key)) else {
        return false;
    };
    match items
        .iter()
        .position(|current| identifier(current, key).as_deref() == Some(&id))
    {
        Some(index) => {
            let merged = merge_record(Some(&items[index]), item.clone());
            if merged == items[index] {
                return false;
            }
            items[index] = merged;
            true
        }
        None => {
            items.push(item.clone());
            true
        }
    }
}

fn merge_into(profile: &mut Value, key: &str, item: &Value, identifier_key: &str) -> bool {
    let Some(object) = profile.as_object_mut() else {
        return false;
    };
    let entry = object
        .entry(key)
        .or_insert_with(|| Value::Array(Vec::new()));
    if !entry.is_array() {
        *entry = Value::Array(Vec::new());
    }
    merge_item(
        entry.as_array_mut().expect("array ensured above"),
        item,
        identifier_key,
    )
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
    let normal_storage = object
        .get("unit_storage_normal_list")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    /* These lists describe locations, not separate inventories. A repeated
    id is a contradictory snapshot; reject it rather than arbitrarily making
    one location invisible. */
    if units.iter().any(|unit| {
        identifier(unit, "unit_id").is_some_and(|unit_id| {
            normal_storage
                .iter()
                .any(|stored| identifier(stored, "unit_id").as_deref() == Some(unit_id.as_str()))
        })
    }) {
        return false;
    }
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
/* A location transition removes records only from the collection it leaves;
`remove_everywhere` is for destruction and would erase the new owner too. */
fn remove_collection_items(
    profile: &mut Value,
    collection_key: &str,
    identifier_key: &str,
    ids: &[String],
) -> bool {
    if ids.is_empty() {
        return false;
    }
    let current = collection(profile, collection_key).to_vec();
    let next = remove_items(&current, ids, identifier_key);
    if next == current {
        return false;
    }
    set_collection(profile, collection_key, next);
    true
}
fn sync_unit_equipment(profile: &mut Value, unit: &Value) -> bool {
    let mut changed = false;
    for entity in [ENTITIES[1], ENTITIES[2], ENTITIES[3]] {
        for item in collection(unit, entity.collection) {
            if entity.collection != "relics" && engraved_outside_inventory(profile, entity, item) {
                continue;
            }
            changed |= merge_into(profile, entity.collection, item, entity.identifier);
        }
    }
    changed
}

/* Only a command that moves gear may change which runes and artifacts a monster
carries; `apply_update` reads the request for where each one went. Every other
answer that names a monster may show it in the gear of a deck or a battle
instead — `battleGuildRivalStart` answers with the attacking team in the World
Guild Battle preset's runes — and read as the monster's own, those runes stood
on two monsters at once and JASWA refused every revision after it. */
fn gear_moving_command(command: &str) -> bool {
    command.contains("equip") || command.contains("occupation")
}

/* `unit` with its runes and artifacts left out where they differ from the gear
the account has on that monster, so the merge keeps the account's. A monster
new to the account is taken as it comes. Relics are left alone: one relic is
read into every preset and may stand on many monsters. */
fn with_scenario_gear(profile: &Value, unit: &Value) -> (Value, bool) {
    let Some(held) = identifier(unit, "unit_id").and_then(|id| {
        collection(profile, "unit_list")
            .iter()
            .find(|current| identifier(current, "unit_id").as_deref() == Some(id.as_str()))
    }) else {
        return (unit.clone(), false);
    };
    let mut record = unit.clone();
    let mut set_aside = false;
    for entity in [ENTITIES[1], ENTITIES[2]] {
        let Some(shown) = unit.get(entity.collection).and_then(Value::as_array) else {
            continue;
        };
        if gear_ids(shown, entity) != gear_ids(collection(held, entity.collection), entity) {
            if let Some(object) = record.as_object_mut() {
                object.remove(entity.collection);
            }
            set_aside = true;
        }
    }
    (record, set_aside)
}

fn gear_ids(items: &[Value], entity: Entity) -> std::collections::BTreeSet<String> {
    items
        .iter()
        .filter_map(|item| identifier(item, entity.identifier))
        .collect()
}

/* Gear a monster carries and the inventory collection does not hold. */
fn engraved_outside_inventory(profile: &Value, entity: Entity, item: &Value) -> bool {
    let Some(id) = identifier(item, entity.identifier) else {
        return false;
    };
    let holds = |items: &[Value]| {
        items
            .iter()
            .any(|current| identifier(current, entity.identifier).as_deref() == Some(id.as_str()))
    };
    !holds(collection(profile, entity.collection))
        && collection(profile, "unit_list")
            .iter()
            .any(|unit| holds(collection(unit, entity.collection)))
}

/* The contradiction JASWA's import refuses (`validateGameFile`): one rune or one
artifact on two monsters. */
fn contradiction(profile: &Value) -> Option<String> {
    for (entity, noun) in [(ENTITIES[1], "rune"), (ENTITIES[2], "artifact")] {
        let mut seen = std::collections::HashSet::new();
        for unit in collection(profile, "unit_list") {
            for item in collection(unit, entity.collection) {
                if let Some(id) = identifier(item, entity.identifier) {
                    if !seen.insert(id.clone()) {
                        return Some(format!("{noun} {id} on two monsters"));
                    }
                }
            }
        }
    }
    None
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
#[derive(Default)]
struct LiveEntities {
    records: Vec<(Entity, Value)>,
    unresolved: Option<String>,
}

/* A live record needs both a state-changing request and a recognised response
path. A new notification cannot become an acquisition by reusing `reward` or
`changed_item_list`. Unknown exchanges are surfaced by the boundary below. */
fn account_mutation_command(request: &Value) -> bool {
    let command = request.get("command").and_then(Value::as_str).unwrap_or("").to_ascii_lowercase();
    let base = command.rsplit_once("_v")
        .filter(|(_, suffix)| !suffix.is_empty() && suffix.bytes().all(|byte| byte.is_ascii_digit()))
        .map_or(command.as_str(), |(base, _)| base);
    matches!(base,
        "battledungeonresult" | "battlescenarioresult" | "battleworldbossresult"
        | "battleriftdungeonresult" | "battleriftofworldsraidresult"
        | "battledimensionholeresult" | "battledimensionholedungeonresult"
        | "arenabattleresult" | "receivemail" | "receiveguildbossclearreward"
        | "receivedailyrewardspecial" | "receivedailyrewardnewuser" | "receivedailyrewardinactive"
        | "receivedailyrewardspecialevent" | "receivedailyrewardspecialpass" | "receiveplaypassreward"
        | "pickguildmazebattleclearreward" | "buyshopitem" | "buyblackmarketitem"
        | "summonunit" | "sellunit" | "sacrificeunit" | "convertunittoitem" | "movestoragefromto"
        | "moveunitbuilding" | "upgraderune"
        | "amplifyrune" | "convertrune" | "confirmrune" | "equiprune" | "equiprunelist" | "unequiprune"
        | "sellrune" | "sellrunecraftitem" | "upgradeartifact" | "convertartifact"
        | "equipartifact" | "unequipartifact" | "updateartifactoccupation" | "sellartifact" | "sellartifacts"
        | "upgraderelic" | "equiprelic" | "unequiprelic" | "sellrelic" | "breakdownrelic"
    )
}

/* Ownership is not freshness: archives carry valid ids and this account's
wizard id too. Only a continuous, recognised path from the response root may
supply live records. An unknown wrapper cannot grant authority to its children. */
fn response_entities(value: &Value, request: &Value, profile: &Value, claimed_mail_ids: &[String]) -> LiveEntities {
    struct Scope<'a> {
        profile: &'a Value,
        claimed_mail_ids: &'a [String],
        shrine_move: bool,
        live_request: bool,
        battle_team: bool,
    }
    fn visit(
        value: &Value,
        path: &str,
        parent: &str,
        inside_unit: bool,
        authorized: bool,
        blocked: bool,
        scope: &Scope<'_>,
        found: &mut LiveEntities,
    ) {
        if let Value::Array(entries) = value {
            for entry in entries {
                visit(entry, path, parent, inside_unit, authorized, blocked,
                    scope, found);
            }
            return;
        }
        let Some(map) = value.as_object() else { return; };
        let claimed_mail = !path.contains('.')
            && claimed_mail_record(value, parent, scope.claimed_mail_ids);
        let blocked = if claimed_mail { false } else {
            blocked || non_account_container(parent)
                || superseded_record(parent) || departed_record(parent)
        };
        let authorized = authorized || claimed_mail;
        let removal_path = path.is_empty()
            || (scope.shrine_move && matches!(path, "result_from" | "result_to"));
        if !blocked && !removal_path && !response_removals(value).is_empty() {
            found.unresolved.get_or_insert_with(|| format!(
                "Unrecognised account-removal path {path}. Live import is paused until this response is understood."
            ));
        }
        let account_wizard_id = identifier(scope.profile, "wizard_id");
        let belongs_elsewhere = account_wizard_id.as_ref().is_some_and(|account| {
            identifier(value, "wizard_id").is_some_and(|wizard| wizard != *account)
        });
        if !inside_unit && !blocked && !belongs_elsewhere {
            for entity in ENTITIES {
                let named_record = entity.direct.contains(&parent) || account_collection(parent, entity);
                if !valid_identifier(value, entity.identifier)
                    || !(candidate_at(value, entity, parent) || named_record) {
                    continue;
                }
                if authorized && (!path.is_empty() || scope.live_request) {
                    if candidate_at(value, entity, parent) || known_account_entity(scope.profile, entity, value) {
                        found.records.push((entity, value.clone()));
                    } else {
                        found.unresolved.get_or_insert_with(|| format!(
                            "Incomplete new account record at {path} ({} {}). Live import is paused.",
                            entity.collection, identifier(value, entity.identifier).unwrap_or_default()
                        ));
                    }
                } else {
                    found.unresolved.get_or_insert_with(|| format!(
                        "Unrecognised account-data path {path} ({} {}). Live import is paused until this response is understood.",
                        entity.collection, identifier(value, entity.identifier).unwrap_or_default()
                    ));
                }
            }
            if matches!(parent, "changed_item_list" | "item_list") {
                if let Some((entity, item)) = changed_item_entity(value) {
                    let foreign = account_wizard_id.as_ref().is_some_and(|account| {
                        identifier(&item, "wizard_id").is_some_and(|wizard| wizard != *account)
                    });
                    if !foreign {
                        if authorized {
                            if candidate(&item, entity) || known_account_entity(scope.profile, entity, &item) {
                                found.records.push((entity, item));
                            } else {
                                found.unresolved.get_or_insert_with(|| format!(
                                    "Incomplete new reward at {path} ({} {}). Live import is paused.",
                                    entity.collection, identifier(&item, entity.identifier).unwrap_or_default()
                                ));
                            }
                        } else {
                            found.unresolved.get_or_insert_with(|| format!(
                                "Unrecognised reward path {path} ({} {}). Live import is paused.",
                                entity.collection, identifier(&item, entity.identifier).unwrap_or_default()
                            ));
                        }
                    }
                }
            }
        }
        let is_unit = valid_identifier(value, "unit_id") && candidate_at(value, ENTITIES[0], parent);
        for (key, entry) in map {
            let child_path = if path.is_empty() { key.clone() } else { format!("{path}.{key}") };
            let edge = account_container(key)
                || ENTITIES.iter().any(|entity| entity.direct.contains(&key.as_str()) || account_collection(key, *entity))
                || (path.is_empty() && scope.battle_team && key == "battle_team")
                || (scope.shrine_move && (child_path == "result_from" || child_path == "result_from.add_unit_list"))
                || (matches!(parent, "changed_item_list" | "item_list" | "changed_item") && key == "info");
            let root_allowed = !path.is_empty() || scope.live_request
                || (scope.battle_team && matches!(key.as_str(), "battle_team" | "unit_list" | "unit_info"));
            visit(entry, &child_path, key, inside_unit || is_unit,
                authorized && edge && root_allowed, blocked, scope, found);
        }
    }
    let mut found = LiveEntities::default();
    let shrine_move = request.get("command").and_then(Value::as_str)
        .is_some_and(|command| command.eq_ignore_ascii_case("MoveStorageFromTo"));
    let battle_team = request.get("command").and_then(Value::as_str)
        .is_some_and(|command| command.eq_ignore_ascii_case("battleGuildRivalStart"));
    let scope = Scope { profile, claimed_mail_ids, shrine_move,
        live_request: account_mutation_command(request), battle_team };
    visit(value, "", "", false, true, false, &scope, &mut found);
    found
}

fn mail_claim_ids(request: &Value) -> Vec<String> {
    let command = request
        .get("command")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_ascii_lowercase();
    if command != "receivemail" && command != "receivemail_v2" {
        return Vec::new();
    }
    identifiers_in_fields(request, "mail_id", &["mail_id", "mail_id_list", "mail_ids"])
}

fn claimed_mail_record(value: &Value, parent: &str, claimed_mail_ids: &[String]) -> bool {
    if claimed_mail_ids.is_empty() {
        return false;
    }
    let parent = parent.to_ascii_lowercase();
    if !matches!(
        parent.as_str(),
        "mail_list" | "mail_message_list" | "inventory_mail_info" | "mail_info_list"
    ) {
        return false;
    }
    identifier(value, "mail_id").is_some_and(|id| claimed_mail_ids.contains(&id))
}

fn account_collection(parent: &str, entity: Entity) -> bool {
    match entity.collection {
        "unit_list" => matches!(parent, "unit_list" | "units" | "mob_list"),
        "runes" => matches!(parent, "runes" | "rune_list"),
        "artifacts" => matches!(parent, "artifacts" | "artifact_list"),
        "relics" => matches!(parent, "relics" | "relic_list"),
        "rune_craft_item_list" => {
            matches!(
                parent,
                "rune_craft_item_list" | "craft_item_list" | "crafts" | "runecraft_list"
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

/* A monster the game has just sealed into the Normal tab, answered in full so
it can be filed there. Read as a roster record it put the monster straight back
in the inventory it had left; `apply_shrine_move` files it instead. */
fn departed_record(parent: &str) -> bool {
    parent == "stored_unit_list"
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
            // Opened guild-boss crates retain old item records, including sold gear.
            | "clear_reward_crate_list"
            | "user_reward_info"
            // These are displayed teams and previews, not live monster records.
            | "my_unit_deck_list"
            | "rift_dungeon_unit_list"
            | "unit_preview"
            // These collections have their own location-aware readers.
            | "unit_storage_normal_list"
            | "unit_storage_list"
            | "pass_reward_rune_info"
            | "event_list"
            | "webevent_list"
            | "mail_list"
            | "mail_message_list"
            | "mail_info_list"
            | "inventory_mail_info"
            | "npc_list"
            | "arena_list"
            | "world_ranking"
            | "helper_list"
            | "helper_info"
            | "friend_list"
            | "guild"
            | "defense_deck_info"
            | "server_arena_defense_deck_info"
            | "temporary_defense_deck"
            /* A saved deck names each monster by `unit_id` beside the runes it
            carries in that deck. Read as a unit record it wrote the deck's
            `rune_id_list` into the monster itself on every preset the player
            saved; the deck is read whole in `apply_deck_list` instead. */
            | "deck_info"
            | "deck_list"
            | "deck_recent_list"
            | "equip"
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
fn new_account_entity(profile: &Value, entity: Entity, item: &Value) -> bool {
    if !valid_identifier(item, entity.identifier) || !candidate(item, entity) {
        return false;
    }
    let Some(account_wizard_id) = identifier(profile, "wizard_id") else {
        return true;
    };
    /* A unit is the one entity that can look perfectly valid while describing
    somebody else's battle roster. The proven live path is enough for gear
    without a wizard id; a new unit must also name this account. Known units
    still follow the merge path above, so partial
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
    let Some(units) = profile.get_mut("unit_list").and_then(Value::as_array_mut) else {
        return false;
    };
    let mut changed = false;
    for unit in units {
        let Some(equipment) = unit
            .get_mut(entity.collection)
            .and_then(Value::as_array_mut)
        else {
            continue;
        };
        if equipment
            .iter()
            .any(|current| identifier(current, entity.identifier).as_deref() == Some(&id))
        {
            changed |= merge_item(equipment, item, entity.identifier);
        }
    }
    changed
}
fn response_removals(response: &Value) -> Vec<(Entity, Vec<String>)> {
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
    let mut found = Vec::new();
    for (entity, fields) in removals {
        let mut ids = Vec::new();
        for field in fields {
            if let Some(value) = response.get(*field) {
                collect_identifier_values(value, entity.identifier, &mut ids);
            }
        }
        if !ids.is_empty() {
            found.push((entity, unique(ids)));
        }
    }
    found
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

    /* The shape is the game's own, trimmed from a captured `setDeckList`: the
    answer carries every saved deck of the one type that was saved. */
    #[test]
    fn a_saved_deck_replaces_its_type_and_never_touches_a_monster() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [{"unit_id": 1, "wizard_id": 7, "runes": []}, {"unit_id": 2, "wizard_id": 7, "runes": []}],
            "runes": [{"rune_id": 5}], "artifacts": [], "relics": [], "rune_craft_item_list": [],
            "deck_list": [
                {"deck_type": 1, "deck_seq": 1, "equip": [], "leader_unit_id": 1, "unit_id_list": [1, 0, 0, 0]},
                {"deck_type": 24, "deck_seq": 101, "equip": [], "leader_unit_id": 2, "unit_id_list": [2, 0, 0, 0, 0]}
            ]
        })));
        let saved = json!({"deck_type": 1, "deck_seq": 1, "leader_unit_id": 1, "unit_id_list": [1, 2, 0, 0],
            "equip": [{"unit_id": 1, "rune_id_list": [5], "artifact_id_list": []}, {"unit_id": 2, "rune_id_list": [], "artifact_id_list": []}]});
        assert!(store.apply_update(
            &json!({"command": "setDeckList", "ret_code": 0, "deck_info": {"deck_type": 1, "wizard_id": 7, "deck_list": [saved.clone()]}}),
            &json!({"command": "setDeckList", "deck_list": [saved.clone()]})
        ));
        let data = store.read().unwrap().data;
        let decks = data["deck_list"].as_array().unwrap();
        assert_eq!(decks.len(), 2);
        assert!(decks.contains(&saved));
        assert!(decks.iter().any(|deck| deck["deck_type"] == 24 && deck["deck_seq"] == 101));
        for unit in data["unit_list"].as_array().unwrap() {
            assert!(unit.get("rune_id_list").is_none(), "a deck's runes never land on the monster");
        }
        assert!(!store.apply_update(
            &json!({"command": "setDeckList", "ret_code": 0, "deck_info": {"deck_type": 1, "deck_list": [saved.clone()]}}),
            &json!({"command": "setDeckList"})
        ), "the same answer again changes nothing");
    }

    fn two_monsters_with_gear() -> ProfileStore {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [
                {"unit_id": 1, "wizard_id": 7, "unit_level": 40,
                    "runes": [{"rune_id": 5, "occupied_id": 1, "slot_no": 1}, {"rune_id": 6, "occupied_id": 1, "slot_no": 2}],
                    "artifacts": [{"rid": 8, "occupied_id": 1, "slot": 1}]},
                {"unit_id": 2, "wizard_id": 7, "unit_level": 40, "runes": [], "artifacts": []}
            ],
            "runes": [{"rune_id": 9, "occupied_id": 0, "slot_no": 3}], "artifacts": [], "relics": [], "rune_craft_item_list": []
        })));
        store
    }

    /* The capture behind this: `battleGuildRivalStart` answered with the team
    dressed in its World Guild Battle preset's runes, the account came out with
    24 runes on two monsters, and JASWA refused every revision after it. The
    container's name is not what decides it, so the test does not depend on one. */
    #[test]
    fn a_monster_shown_in_a_decks_gear_keeps_the_gear_it_has() {
        let mut store = two_monsters_with_gear();
        let before = store.read().unwrap().data;
        assert!(store.apply_update(
            &json!({"ret_code": 0, "battle_team": {"unit_list": [
                {"unit_id": 2, "wizard_id": 7, "unit_level": 40, "runes": [{"rune_id": 5, "occupied_id": 2, "slot_no": 1}, {"rune_id": 9, "occupied_id": 2, "slot_no": 3}]},
                {"unit_id": 1, "wizard_id": 7, "unit_level": 40, "runes": [{"rune_id": 6, "occupied_id": 1, "slot_no": 2}], "artifacts": [], "skills": [[1, 2]]}
            ]}}),
            &json!({"command": "battleGuildRivalStart"})
        ), "what the record says beyond its gear is still read");
        let (set_aside, refused) = store.take_declined();
        assert_eq!(set_aside, vec!["2".to_owned(), "1".to_owned()]);
        assert_eq!(refused, None);
        let data = store.read().unwrap().data;
        assert_eq!(data["unit_list"][0]["runes"], before["unit_list"][0]["runes"]);
        assert_eq!(data["unit_list"][0]["artifacts"], before["unit_list"][0]["artifacts"]);
        assert_eq!(data["unit_list"][0]["skills"], json!([[1, 2]]));
        assert_eq!(data["unit_list"][1]["runes"], json!([]));
        assert_eq!(data["runes"], before["runes"], "the inventory is untouched");
    }

    #[test]
    fn a_command_that_moves_gear_still_moves_it() {
        let mut store = two_monsters_with_gear();
        assert!(store.apply_update(
            &json!({"ret_code": 0, "unit_info": {"unit_id": 2, "wizard_id": 7, "runes": [{"rune_id": 5, "occupied_id": 2, "slot_no": 1}]}}),
            &json!({"command": "EquipRune", "rune_id": 5, "unit_id": 2})
        ));
        let data = store.read().unwrap().data;
        assert_eq!(data["unit_list"][1]["runes"][0]["rune_id"], 5);
        assert!(!data["unit_list"][0]["runes"].as_array().unwrap().iter().any(|rune| rune["rune_id"] == 5));
    }

    #[test]
    fn a_powered_up_rune_on_a_monster_stays_out_of_the_inventory() {
        let mut store = two_monsters_with_gear();
        assert!(store.apply_update(
            &json!({"ret_code": 0, "rune": {"rune_id": 5, "wizard_id": 7, "occupied_id": 1, "slot_no": 1, "upgrade_curr": 12}}),
            &json!({"command": "UpgradeRune", "rune_id": 5})
        ));
        let data = store.read().unwrap().data;
        assert_eq!(data["unit_list"][0]["runes"][0]["upgrade_curr"], 12);
        assert_eq!(data["runes"].as_array().unwrap().len(), 1, "the inventory still holds rune 9 alone");
    }

    #[test]
    fn an_exchange_that_would_engrave_a_rune_twice_is_refused_whole() {
        let mut store = two_monsters_with_gear();
        let before = store.read().unwrap();
        assert!(!store.apply_update(
            &json!({"ret_code": 0, "unit_info": {"unit_id": 2, "wizard_id": 7, "runes": [{"rune_id": 5, "occupied_id": 2, "slot_no": 1}]}}),
            &json!({"command": "EquipRune", "rune_id": 9, "unit_id": 2})
        ));
        let (_, refused) = store.take_declined();
        assert!(refused.is_some_and(|reason| reason.contains("EquipRune") && reason.contains("rune 5 on two monsters")));
        let after = store.read().unwrap();
        assert_eq!(after.data, before.data);
        assert_eq!(after.revision, before.revision);
    }

    #[test]
    fn an_arena_defense_arriving_whole_replaces_the_one_held() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 7, "unit_list": [{"unit_id": 1, "wizard_id": 7}, {"unit_id": 2, "wizard_id": 7}],
            "runes": [], "artifacts": [], "relics": [], "rune_craft_item_list": [],
            "defense_deck_info": {"unit_id_list": [1, 2], "equip": []}
        })));
        let defense = json!({"unit_id_list": [2, 1], "equip": []});
        assert!(store.apply_update(&json!({"ret_code": 0, "defense_deck_info": defense.clone()}), &json!({"command": "arenav2_setDefenseUnitList"})));
        assert_eq!(store.read().unwrap().data["defense_deck_info"], defense);
        assert!(!store.apply_update(&json!({"ret_code": 0, "defense_deck_info": {"battle_power": 1}}), &json!({"command": "GetArenaInfo"})),
            "a defense without its monster list is not a defense to keep");
    }

    /* The request and response shapes in the shrine tests below are the
    game's own, trimmed from a captured session: one monster to Monster Storage
    and back, one into each Sealed Shrine tab and back. */
    fn shrine_account() -> ProfileStore {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 7,
            "building_list": [{"building_id": 99, "building_master_id": 25}],
            "unit_list": [
                {"unit_id": 1, "wizard_id": 7, "unit_master_id": 10615, "building_id": 0, "runes": [], "artifacts": []},
                {"unit_id": 2, "wizard_id": 7, "unit_master_id": 22401, "building_id": 0, "runes": [], "artifacts": []}
            ],
            "unit_storage_list": [{"class": 3, "quantity": 3, "unit_master_id": 22401}],
            "unit_storage_normal_list": [],
            "runes": []
        })));
        store
    }

    fn unit_ids(data: &Value, key: &str) -> Vec<String> {
        collection(data, key)
            .iter()
            .filter_map(|unit| identifier(unit, "unit_id"))
            .collect()
    }

    #[test]
    fn follows_a_monster_into_monster_storage_and_back() {
        let mut store = shrine_account();
        for building_id in [99, 0] {
            assert!(store.apply_update(
                &json!({"ret_code": 0, "unit_list": [
                    {"unit_id": 1, "wizard_id": 7, "unit_master_id": 10615, "building_id": building_id}
                ]}),
                &json!({"command": "MoveUnitBuilding", "move_list": [
                    {"building_id": building_id, "island_id": 5, "pos_x": 7, "pos_y": 15, "unit_id": 1}
                ]})
            ));
            assert_eq!(
                store.read().unwrap().data["unit_list"][0]["building_id"],
                building_id
            );
        }
    }

    #[test]
    fn seals_a_monster_into_the_normal_tab_and_releases_it() {
        let mut store = shrine_account();
        let seal_request = json!({"command": "MoveStorageFromTo", "from": 1, "to": 4, "move_list": [], "pos_arr": [], "unit_id_list": [1]});
        let seal = json!({"ret_code": 0, "from": 1, "to": 4, "result_from": [], "result_to": {
            "ret_code": 0,
            "stored_unit_list": [{"unit_id": 1, "wizard_id": 7, "unit_master_id": 10615, "building_id": 0, "runes": [], "artifacts": []}],
            "unequip_artifact_list": [], "unequip_rune_list": [], "unit_id_list": [1]
        }});
        assert_eq!(store.unmodeled_exchange(&seal, &seal_request), None);
        assert!(store.apply_update(&seal, &seal_request));
        let data = &store.read().unwrap().data;
        assert_eq!(unit_ids(data, "unit_list"), vec!["2"]);
        assert_eq!(unit_ids(data, "unit_storage_normal_list"), vec!["1"]);

        let release_request = json!({"command": "MoveStorageFromTo", "from": 4, "to": 1, "move_list": [], "pos_arr": [], "unit_id_list": [1]});
        let release = json!({"ret_code": 0, "from": 4, "to": 1, "result_to": [], "result_from": {
            "ret_code": 0,
            "add_unit_list": [{"unit_id": 1, "wizard_id": 7, "unit_master_id": 10615, "building_id": 0, "runes": [], "artifacts": []}]
        }});
        assert_eq!(store.unmodeled_exchange(&release, &release_request), None);
        assert!(store.apply_update(&release, &release_request));
        let data = &store.read().unwrap().data;
        assert_eq!(unit_ids(data, "unit_list"), vec!["2", "1"]);
        assert!(unit_ids(data, "unit_storage_normal_list").is_empty());
    }

    #[test]
    fn seals_a_monster_into_the_summoned_tab_and_summons_one_out() {
        let mut store = shrine_account();
        let seal_request = json!({"command": "MoveStorageFromTo", "from": 1, "to": 3, "move_list": [], "pos_arr": [], "unit_id_list": [2]});
        let seal = json!({"ret_code": 0, "from": 1, "to": 3, "result_from": [], "result_to": {
            "ret_code": 0,
            "remove_unit_id_list": [2],
            "unit_storage_list": [{"class": 3, "quantity": 4, "unit_master_id": 22401}]
        }});
        assert_eq!(store.unmodeled_exchange(&seal, &seal_request), None);
        assert!(store.apply_update(&seal, &seal_request));
        let data = &store.read().unwrap().data;
        /* Gone from the roster, not filed as Storage. */
        assert_eq!(unit_ids(data, "unit_list"), vec!["1"]);
        assert_eq!(data["unit_storage_list"][0]["quantity"], 4);

        let summon_request = json!({"command": "MoveStorageFromTo", "from": 3, "to": 1, "move_list": [], "unit_id_list": [],
            "pos_arr": [{"class": 3, "island_id": 5, "pos_x": 39, "pos_y": 24, "unit_master_id": 22401}]});
        let summon = json!({"ret_code": 0, "from": 3, "to": 1, "result_to": [], "result_from": {
            "ret_code": 0,
            "add_unit_list": [{"unit_id": 3, "wizard_id": 7, "unit_master_id": 22401, "building_id": 0, "runes": [], "artifacts": []}],
            "unit_storage_list": [{"class": 3, "quantity": 3, "unit_master_id": 22401}]
        }});
        assert_eq!(store.unmodeled_exchange(&summon, &summon_request), None);
        assert!(store.apply_update(&summon, &summon_request));
        let data = &store.read().unwrap().data;
        assert_eq!(unit_ids(data, "unit_list"), vec!["1", "3"]);
        assert_eq!(data["unit_storage_list"][0]["quantity"], 3);
    }

    #[test]
    fn a_summoned_stack_that_reaches_zero_is_no_longer_counted() {
        let mut store = shrine_account();
        assert!(store.apply_update(
            &json!({"ret_code": 0, "result_to": [], "result_from": {
                "add_unit_list": [{"unit_id": 3, "wizard_id": 7, "unit_master_id": 22401}],
                "unit_storage_list": [{"class": 3, "quantity": 0, "unit_master_id": 22401}]
            }}),
            &json!({"command": "MoveStorageFromTo", "from": 3, "to": 1, "unit_id_list": []})
        ));
        assert!(collection(&store.read().unwrap().data, "unit_storage_list").is_empty());
    }

    #[test]
    fn refuses_a_shrine_move_it_cannot_place() {
        let store = shrine_account();
        let request = |from: u8, to: u8| {
            json!({"command": "MoveStorageFromTo", "from": from, "to": to, "unit_id_list": [1]})
        };
        /* A side no captured exchange has used. */
        assert!(store.unmodeled_exchange(&json!({"ret_code": 0}), &request(1, 2)).is_some());
        assert!(store.unmodeled_exchange(&json!({"ret_code": 0}), &request(3, 4)).is_some());
        /* A known side answered in a shape it has not been seen to take. */
        assert!(store.unmodeled_exchange(&json!({"ret_code": 0, "result_to": {}}), &request(1, 4)).is_some());
        assert!(store.unmodeled_exchange(&json!({"ret_code": 0, "result_to": {}}), &request(1, 3)).is_some());
        assert!(store.unmodeled_exchange(
            &json!({"ret_code": 0, "result_from": {"add_unit_list": [{"unit_id": 3, "unit_master_id": 22401}]}}),
            &request(3, 1)
        ).is_some());
        /* Equipment coming off with the seal. */
        assert!(store.unmodeled_exchange(
            &json!({"ret_code": 0, "result_to": {"remove_unit_id_list": [1], "unequip_rune_list": [{"rune_id": 5}]}}),
            &request(1, 3)
        ).is_some());
        /* A failed move changes nothing and is not a gap. */
        assert_eq!(store.unmodeled_exchange(&json!({"ret_code": 1}), &request(1, 2)), None);
    }

    #[test]
    fn refuses_to_seal_a_monster_that_still_carries_equipment() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [{"unit_id": 1, "wizard_id": 7, "runes": [{"rune_id": 5}]}],
            "runes": [{"rune_id": 5}]
        })));
        assert!(store.unmodeled_exchange(
            &json!({"ret_code": 0, "result_to": {"remove_unit_id_list": [1], "unequip_rune_list": []}}),
            &json!({"command": "MoveStorageFromTo", "from": 1, "to": 3, "unit_id_list": [1]})
        ).is_some());
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
    fn a_complete_normal_shrine_list_evicts_a_stale_live_record() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [
                {"unit_id": 1, "wizard_id": 7},
                {"unit_id": 8, "wizard_id": 7, "unit_master_id": 10101}
            ],
            "runes": []
        })));

        assert!(store.apply_update(
            &json!({
                "ret_code": 0,
                "unit_storage_normal_list": [{"unit_id": 8, "unit_master_id": 10101}]
            }),
            /* The list is the signal, whichever command brought it. */
            &json!({"command": "GetWizardDataPart1"})
        ));
        let data = &store.read().unwrap().data;
        assert!(
            !collection(data, "unit_list")
                .iter()
                .any(|unit| identifier(unit, "unit_id").as_deref() == Some("8"))
        );
        assert_eq!(collection(data, "unit_storage_normal_list").len(), 1);
    }

    #[test]
    fn rejects_a_snapshot_that_places_a_unit_in_two_locations() {
        let mut store = ProfileStore::default();
        assert!(!store.accept_snapshot(json!({
            "unit_list": [{"unit_id": 8, "unit_master_id": 10101}],
            "unit_storage_normal_list": [{"unit_id": 8, "unit_master_id": 10101}],
            "runes": []
        })));
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
            }), "getwizarddatapart1")
            .unwrap()
            .len(),
            1
        );
    }

    /* The shape a captured power-up had (September 29, 2026): every fodder from
    the roster, `source_storage_list` empty, and the answer's own
    `unit_storage_list` empty with it. Reading that as the whole tab emptied a
    shrine of 148 stacks on the first ordinary power-up. */
    #[test]
    fn a_power_up_from_the_roster_keeps_every_summoned_stack() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "unit_list": [{"unit_id": 1, "unit_master_id": 10101}, {"unit_id": 2, "unit_master_id": 10102}],
            "unit_storage_list": [
                {"unit_master_id": 10101, "quantity": 8, "class": 3},
                {"unit_master_id": 10102, "quantity": 12, "class": 3}
            ],
            "runes": []
        })));
        let request = json!({
            "command": "SacrificeUnit_V4",
            "target_unit_id": 1,
            "source_unit_list": [{"unit_id": 2}],
            "source_storage_list": [],
            "source_item_list": []
        });
        let response = json!({
            "ret_code": 0,
            "target_unit": {"unit_id": 1, "unit_master_id": 10101, "unit_level": 2},
            "unit_storage_list": [],
            "inventory_item_list": []
        });
        assert_eq!(store.unmodeled_exchange(&response, &request), None);
        assert!(store.apply_update(&response, &request));
        let data = store.read().unwrap().data;
        assert_eq!(data["unit_storage_list"].as_array().unwrap().len(), 2);
        assert_eq!(data["unit_storage_list"][1]["quantity"], 12);
    }

    /* Fodder taken from the Summoned tab is spent from its stack. The answer
    restates the stack it fed from; the others stay as they were. */
    #[test]
    fn a_power_up_fed_from_the_shrine_updates_only_that_stack() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "unit_list": [{"unit_id": 1, "unit_master_id": 10101}],
            "unit_storage_list": [
                {"unit_master_id": 10101, "quantity": 8, "class": 3},
                {"unit_master_id": 10102, "quantity": 1, "class": 3}
            ],
            "runes": []
        })));
        let feed = |master: u64| {
            json!({
                "command": "SacrificeUnit_V4",
                "target_unit_id": 1,
                "source_unit_list": [],
                "source_storage_list": [{"unit_master_id": master, "quantity": 1}]
            })
        };
        let answer = |master: u64, quantity: u64| {
            json!({
                "ret_code": 0,
                "target_unit": {"unit_id": 1, "unit_master_id": 10101},
                "unit_storage_list": [{"unit_master_id": master, "quantity": quantity, "class": 3}]
            })
        };
        assert_eq!(store.unmodeled_exchange(&answer(10101, 7), &feed(10101)), None);
        assert!(store.apply_update(&answer(10101, 7), &feed(10101)));
        assert!(store.apply_update(&answer(10102, 0), &feed(10102)));
        let data = store.read().unwrap().data;
        assert_eq!(
            data["unit_storage_list"],
            json!([{"unit_master_id": 10101, "quantity": 7, "class": 3}])
        );
    }

    /* What a list at the top of an answer means is shown by the game, one
    command at a time. A fed stack the answer leaves out, or a list under a
    command never seen carrying one, stops live import instead. */
    #[test]
    fn an_unknown_summoned_list_stops_live_import() {
        let store = ProfileStore::default();
        let ok = json!({"ret_code": 0, "unit_storage_list": []});
        assert!(store
            .unmodeled_exchange(
                &ok,
                &json!({
                    "command": "SacrificeUnit_V4",
                    "source_storage_list": [{"unit_master_id": 10101, "quantity": 1}]
                })
            )
            .is_some());
        assert!(store
            .unmodeled_exchange(
                &ok,
                &json!({"command": "SacrificeUnit_V4", "source_storage_list": [{"quantity": 1}]})
            )
            .is_some());
        assert!(store
            .unmodeled_exchange(&ok, &json!({"command": "ConvertUnitToItem", "unit_id_list": [{"unit_id": 1}]}))
            .is_some_and(|reason| reason.contains("Summoned")));
        assert_eq!(
            store.unmodeled_exchange(&ok, &json!({"command": "getUnitStorageList"})),
            None
        );
        assert_eq!(
            store.unmodeled_exchange(&json!({"ret_code": 0}), &json!({"command": "SummonUnit"})),
            None
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

    /* The game sends the whole Summoned tab each time the shrine is opened,
    under `getUnitStorageList`, and the whole Normal tab under any command that
    carries one. */
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
            &json!({"command": "getUnitStorageList"})
        ));
        assert_eq!(
            store.read().unwrap().data["unit_storage_list"][0]["quantity"],
            2
        );
        assert!(store.apply_update(
            &json!({"ret_code": 0, "unit_storage_normal_list": []}),
            &json!({"command": "GetWizardDataPart1"})
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

    /// Crafting Engraved Stones answered with the new item alone, and the
    /// three monsters it spent stayed on screen.
    #[test]
    fn a_conversion_spends_the_monsters_its_request_names() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "unit_list": [{"unit_id": 1}, {"unit_id": 2}, {"unit_id": 3}],
            "unit_storage_normal_list": [{"unit_id": 4}],
            "runes": []
        })));
        let request = json!({
            "command": "ConvertUnitToItem",
            "unit_id_list": [{"unit_id": 1}, {"unit_id": 2}, {"unit_id": 4}]
        });
        let response = json!({"ret_code": 0, "inventory_item_list": []});
        assert_eq!(store.unmodeled_exchange(&response, &request), None);
        assert!(store.apply_update(&response, &request));
        let data = store.read().unwrap().data;
        let ids = |key: &str| {
            data[key]
                .as_array()
                .unwrap()
                .iter()
                .map(|unit| unit["unit_id"].clone())
                .collect::<Vec<_>>()
        };
        assert_eq!(ids("unit_list"), vec![json!(3)]);
        assert!(ids("unit_storage_normal_list").is_empty());
    }

    #[test]
    fn a_conversion_it_cannot_read_stops_live_import() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "unit_list": [{"unit_id": 1, "runes": [{"rune_id": 9, "occupied_id": 1}]}],
            "runes": []
        })));
        let ok = json!({"ret_code": 0});
        assert!(store
            .unmodeled_exchange(&ok, &json!({"command": "ConvertUnitToItem", "item_id": 5}))
            .is_some());
        assert!(store
            .unmodeled_exchange(&ok, &json!({"command": "ConvertUnitToItem", "unit_id": 1}))
            .is_some());
        assert_eq!(
            store.unmodeled_exchange(
                &json!({"ret_code": 1}),
                &json!({"command": "ConvertUnitToItem", "item_id": 5})
            ),
            None
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
        assert_eq!(data["unit_list"][0]["artifacts"][0]["level"], 15);
        assert_eq!(data["artifacts"], json!([]), "an engraved artifact never joins the inventory");
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
    fn swex_export_uses_current_owned_content_without_duplication() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({
            "wizard_id": 7,
            "wizard_info": {"wizard_name": "Culpa", "wizard_id": 21822407},
            "building_list": [],
            "unit_list": [{"unit_id": 1, "wizard_id": 7, "unit_master_id": 10101, "unit_level": 40, "runes": []}],
            "runes": [{"rune_id": 5, "occupied_id": 0, "set_id": 1, "slot_no": 1}],
            "artifacts": [{"rid": 6, "occupied_id": 0, "type": 1, "attribute": 1, "sec_effects": []}],
            "relics": [{"rid": 7, "pri_effect": [100, 12], "sec_effect": [14, 150, 2]}],
            "rune_craft_item_list": [{"craft_item_id": 20, "craft_type": 6, "amount": 1}],
            "artifact_crafts": [{"rid": 30, "master_id": 1, "quantity": 1}],
            "inventory_info": [{"rid": 40, "item_master_id": 61, "item_master_type": 61, "item_quantity": 1}]
        })));

        assert!(store.apply_update(
            &json!({
                "unit_list": [{"unit_id": 2, "wizard_id": 7, "unit_master_id": 34911, "unit_level": 40, "building_id": 0}],
                "runes": [{"rune_id": 11, "wizard_id": 7, "set_id": 13, "slot_no": 1}],
                "artifacts": [{"rid": 12, "wizard_id": 7, "type": 1, "attribute": 1, "sec_effects": []}],
                "relics": [{"rid": 13, "wizard_id": 7, "pri_effect": [100, 12], "sec_effect": [14, 150, 2]}],
                "rune_craft_item_list": [{"craft_item_id": 21, "wizard_id": 7, "craft_type": 6, "amount": 2}],
                "artifact_crafts": [{"rid": 31, "wizard_id": 7, "master_id": 2, "quantity": 1}],
                "inventory_info": [{"rid": 41, "wizard_id": 7, "item_master_id": 62, "item_master_type": 62, "item_quantity": 3}]
            }),
            &json!({"command": "ReceiveMail"})
        ));
        assert!(store.apply_update(
            &json!({}),
            &json!({"command": "EquipRune", "rune_id": 5, "unit_id": 1})
        ));

        let document = store.swex_snapshot().unwrap();
        let export = serialize_swex_export(&document).unwrap();
        let document: Value = serde_json::from_str(&export.content).unwrap();
        assert_eq!(document["unit_list"].as_array().unwrap().len(), 2);
        assert!(
            document["unit_list"]
                .as_array()
                .unwrap()
                .iter()
                .any(|unit| unit["unit_master_id"] == 34911)
        );
        assert_eq!(document["unit_list"][0]["runes"][0]["rune_id"], 5);
        assert_eq!(
            document["runes"],
            json!([{"rune_id": 11, "wizard_id": 7, "set_id": 13, "slot_no": 1}])
        );
        assert_eq!(document["artifacts"].as_array().unwrap().len(), 2);
        assert_eq!(document["relics"].as_array().unwrap().len(), 2);
        assert_eq!(
            document["rune_craft_item_list"].as_array().unwrap().len(),
            2
        );
        assert_eq!(document["artifact_crafts"].as_array().unwrap().len(), 2);
        assert_eq!(document["inventory_info"].as_array().unwrap().len(), 2);
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
    fn imports_only_the_mail_that_receive_mail_claimed() {
        let mut store = ProfileStore::default();
        store.accept_snapshot(json!({
            "wizard_id": 7,
            "unit_list": [],
            "runes": [],
            "artifacts": [],
            "relics": [],
            "rune_craft_item_list": [],
            "artifact_crafts": [],
            "inventory_info": []
        }));

        assert!(store.apply_update(
            &json!({
                "ret_code": 0,
                "mail_list": [
                    {
                        "mail_id": 71,
                        "reward": {"crate": {
                            "runes": [{"rune_id": 11, "set_id": 13, "slot_no": 1}],
                            "artifacts": [{"rid": 12, "type": 1, "pri_effect": [100, 1000], "sec_effects": []}],
                            "relics": [{"rid": 13, "pri_effect": [100, 12], "sec_effect": [14, 150, 2]}],
                            "changestones": [{"craft_item_id": 14, "craft_type": 6, "amount": 1}],
                            "artifact_crafts": [{"rid": 15, "master_id": 2, "quantity": 1}],
                            "inventory_info": [{"rid": 16, "item_master_id": 61, "item_master_type": 61, "item_quantity": 1}]
                        }}
                    },
                    {
                        "mail_id": 72,
                        "reward": {"crate": {
                            "runes": [{"rune_id": 99, "set_id": 13, "slot_no": 1}],
                            "artifacts": [{"rid": 98, "type": 1, "pri_effect": [100, 1000], "sec_effects": []}]
                        }}
                    }
                ]
            }),
            &json!({"command": "ReceiveMail", "mail_id": 71})
        ));

        let data = &store.read().unwrap().data;
        assert_eq!(data["runes"].as_array().unwrap().len(), 1);
        assert_eq!(data["runes"][0]["rune_id"], 11);
        assert_eq!(data["artifacts"].as_array().unwrap().len(), 1);
        assert_eq!(data["artifacts"][0]["rid"], 12);
        assert_eq!(data["relics"].as_array().unwrap().len(), 1);
        assert_eq!(data["relics"][0]["rid"], 13);
        assert_eq!(data["rune_craft_item_list"].as_array().unwrap().len(), 1);
        assert_eq!(data["rune_craft_item_list"][0]["craft_item_id"], 14);
        assert_eq!(data["artifact_crafts"].as_array().unwrap().len(), 1);
        assert_eq!(data["artifact_crafts"][0]["rid"], 15);
        assert_eq!(data["inventory_info"].as_array().unwrap().len(), 1);
        assert_eq!(data["inventory_info"][0]["rid"], 16);
    }

    #[test]
    fn an_unknown_owned_record_stops_import_instead_of_guessing_ownership() {
        for populated in [false, true] {
            let mut store = ProfileStore::default();
            let rune = json!({"rune_id": 14, "set_id": 13, "slot_no": 1,
                "wizard_id": 7, "upgrade_curr": 12});
            let mut snapshot = json!({"wizard_id": 7, "unit_list": [], "runes": [],
                "artifacts": [], "relics": []});
            if populated { snapshot["runes"] = json!([rune.clone()]); }
            assert!(store.accept_snapshot(snapshot));
            let before = store.read().unwrap();
            for wrapper in [
                json!({"future_reward_wrapper": rune}),
                json!({"future_history": {"reward": {"crate": {"runes": [rune.clone()]}}}}),
                json!({"future_history": {"changed_item_list": [{"type": 8, "info": rune}]}}),
            ] {
                let request = json!({"command": "FutureRewardCommand"});
                assert!(store.unmodeled_exchange(&wrapper, &request).unwrap().contains("future_"));
                assert!(!store.apply_update(&wrapper, &request));
                assert!(store.take_declined().1.is_some());
                let after = store.read().unwrap();
                assert_eq!(after.data, before.data);
                assert_eq!(after.revision, before.revision);
            }
        }
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

    #[test]
    fn provenance_is_required_for_every_entity_and_every_existing_record() {
        let records = [
            json!({"unit_id": 11, "wizard_id": 7, "unit_master_id": 10101, "unit_level": 1}),
            json!({"rune_id": 12, "wizard_id": 7, "set_id": 13, "slot_no": 1, "upgrade_curr": 0}),
            json!({"rid": 13, "wizard_id": 7, "slot": 1, "sec_effects": [], "level": 0}),
            json!({"rid": 14, "wizard_id": 7, "sec_effect": [14, 150, 2], "durability": 10}),
            json!({"craft_item_id": 15, "wizard_id": 7, "craft_type": 6, "amount": 1}),
            json!({"rid": 16, "wizard_id": 7, "master_id": 2, "quantity": 1}),
            json!({"rid": 17, "wizard_id": 7, "item_master_id": 61, "item_master_type": 61, "item_quantity": 1}),
        ];
        for populated in [false, true] {
            for (entity, record) in ENTITIES.iter().zip(&records) {
                let mut store = ProfileStore::default();
                let mut snapshot = json!({"wizard_id": 7, "unit_list": [], "runes": [],
                    "artifacts": [], "relics": [], "rune_craft_item_list": [],
                    "artifact_crafts": [], "inventory_info": []});
                if populated {
                    let mut current = record.clone();
                    let field = match entity.collection {
                        "unit_list" => "unit_level", "runes" => "upgrade_curr",
                        "artifacts" => "level", "relics" => "durability",
                        "rune_craft_item_list" => "amount", "artifact_crafts" => "quantity",
                        _ => "item_quantity",
                    };
                    current[field] = json!(15);
                    snapshot[entity.collection] = json!([current]);
                }
                assert!(store.accept_snapshot(snapshot));
                let before = store.read().unwrap();
                let mut payload = json!({});
                payload[entity.collection] = json!([record]);
                // Neither an unknown request nor an unknown ancestor may authorise the record.
                for (command, response) in [
                    ("FutureNotification", payload.clone()),
                    ("ReceiveMail", json!({"future_archive": payload})),
                    ("ReceiveMail", json!({"future_archive": {"reward": {"crate": payload}}})),
                ] {
                    let request = json!({"command": command});
                    assert!(store.unmodeled_exchange(&response, &request).is_some(), "{} {command}", entity.collection);
                    assert!(!store.apply_update(&response, &request));
                    assert_eq!(store.read().unwrap().data, before.data);
                    assert_eq!(store.read().unwrap().revision, before.revision);
                }
                // The same record is usable through the supported action's current reward.
                assert!(store.unmodeled_exchange(&json!({"reward": {"crate": payload}}),
                    &json!({"command": "ReceiveMail"})).is_none());
                store.apply_update(&json!({"reward": {"crate": payload}}), &json!({"command": "ReceiveMail"}));
                assert_eq!(collection(&store.read().unwrap().data, entity.collection).len(), 1);
                assert_eq!(collection(&store.read().unwrap().data, entity.collection)[0], *record);
            }
        }
    }

    #[test]
    fn a_familiar_reward_shape_does_not_authorise_an_unknown_command() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({"wizard_id": 7, "unit_list": [], "runes": []})));
        for response in [
            json!({"changed_item_list": [{"type": 8, "info": {"rune_id": 5, "wizard_id": 7, "set_id": 13}}]}),
            json!({"reward": {"crate": {"runes": [{"rune_id": 5, "wizard_id": 7, "set_id": 13}]}}}),
            json!({"reward": {"crate": {"runes": [{"rune_id": 5, "set_id": 13}]}}}),
        ] {
            let request = json!({"command": "GetNewRewardHistory"});
            assert!(store.unmodeled_exchange(&response, &request).is_some());
            assert!(!store.apply_update(&response, &request));
            assert!(collection(&store.read().unwrap().data, "runes").is_empty());
        }
    }

    #[test]
    fn incomplete_rewards_are_reported_and_known_partial_updates_are_kept() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({"wizard_id": 7, "unit_list": [], "runes": [],
            "rune_craft_item_list": [{"craft_item_id": 3, "craft_type": 6, "amount": 5}]})));
        let request = json!({"command": "ReceiveMail"});
        for response in [
            json!({"changed_item_list": [{"type": 8, "info": {"rune_id": 5}}]}),
            json!({"runes": [{"rune_id": 5}]}),
        ] {
            assert!(store.unmodeled_exchange(&response, &request).unwrap().contains("Incomplete"));
            assert!(!store.apply_update(&response, &request));
            assert!(collection(&store.read().unwrap().data, "runes").is_empty());
        }
        assert!(store.apply_update(&json!({"rune_craft_item_list": [{"craft_item_id": 3, "amount": 2}]}), &request));
        assert_eq!(store.read().unwrap().data["rune_craft_item_list"][0]["amount"], 2);
        assert_eq!(store.read().unwrap().data["rune_craft_item_list"][0]["craft_type"], 6);
    }

    #[test]
    fn unknown_actions_cannot_spend_or_remove_current_inventory() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({"wizard_id": 7,
            "unit_list": [{"unit_id": 1, "wizard_id": 7, "unit_master_id": 10101, "building_id": 0}],
            "runes": [{"rune_id": 5, "set_id": 13}],
            "rune_craft_item_list": [{"craft_item_id": 3, "craft_type": 6, "amount": 5}]})));
        let before = store.read().unwrap().data;
        for request in [
            json!({"command": "GetSellRuneHistory", "rune_id_list": [5]}),
            json!({"command": "FutureAmplifyRune", "rune_id": 5, "craft_item_id": 3}),
            json!({"command": "FutureSacrificeUnit", "source_unit_list": [1]}),
            json!({"command": "FutureMoveUnit", "building_id": 99, "unit_id": 1}),
        ] {
            assert!(store.unmodeled_exchange(&json!({"ret_code": 0}), &request).is_some());
            assert!(!store.apply_update(&json!({"ret_code": 0}), &request));
            assert_eq!(store.read().unwrap().data, before);
        }
        assert!(store.apply_update(&json!({"ret_code": 0}),
            &json!({"command": "SellRune", "rune_id_list": [5]})));
        assert!(collection(&store.read().unwrap().data, "runes").is_empty());
    }

    #[test]
    fn removals_need_a_current_response_path_too() {
        let mut store = ProfileStore::default();
        assert!(store.accept_snapshot(json!({"wizard_id": 7, "unit_list": [],
            "runes": [{"rune_id": 5, "set_id": 13}]})));
        let response = json!({"future_history": {"remove_rune_id_list": [5]}});
        let request = json!({"command": "ReceiveMail"});
        assert!(store.unmodeled_exchange(&response, &request).unwrap().contains("removal path"));
        assert!(!store.apply_update(&response, &request));
        assert_eq!(collection(&store.read().unwrap().data, "runes").len(), 1);
        assert!(store.apply_update(&json!({
            "user_reward_info": {"remove_rune_id_list": [5]},
            "runes": [{"rune_id": 6, "wizard_id": 7, "set_id": 13}]
        }), &request));
        assert_eq!(collection(&store.read().unwrap().data, "runes").len(), 2);
        assert!(store.apply_update(&json!({"remove_rune_id_list": [5]}), &request));
        assert_eq!(collection(&store.read().unwrap().data, "runes").len(), 1);
        assert_eq!(store.read().unwrap().data["runes"][0]["rune_id"], 6);
    }

    #[test]
    fn guild_boss_crate_history_cannot_restore_sold_runes() {
        for populated in [false, true] {
            let mut store = ProfileStore::default();
            let rune = |id| json!({
                "rune_id": id, "wizard_id": 7, "set_id": 13, "slot_no": 1,
                "upgrade_curr": 0, "occupied_id": 0, "occupied_type": 2,
                "prefix_eff": [1, 288], "pri_eff": [3, 22],
                "sec_eff": [[9, 4], [2, 6], [10, 7]]
            });
            let mut snapshot = json!({
                "wizard_id": 7, "unit_list": [], "runes": [],
                "artifacts": [], "relics": [], "rune_craft_item_list": []
            });
            if populated {
                snapshot["runes"] = json!([rune(51), rune(54)]);
            }
            assert!(store.accept_snapshot(snapshot));
            if populated {
                assert!(store.apply_update(
                    &json!({"ret_code": 0}),
                    &json!({"command": "SellRune", "rune_id_list": [54]})
                ));
                assert!(store.apply_update(
                    &json!({"ret_code": 0, "rune": {"rune_id": 51, "upgrade_curr": 15}}),
                    &json!({"command": "UpgradeRune_v2", "rune_id": 51})
                ));
            }
            let before = store.read().unwrap();
            // The login omits these sold runes; the guild's crate history repeats them.
            let history = json!({"ret_code": 0, "clear_reward_crate_list": [{
                "boss_seq": 1, "open_crate_count": 12, "total_crate_count": 12,
                "week_num": 1, "reward_crate_list": [{"crate_index": 11,
                    "reward_list": [
                        {"changed_item": {"type": 8, "info": rune(51)}, "item_master_type": 8},
                        {"changed_item": {"type": 8, "info": rune(54)}, "item_master_type": 8}
                    ]
                }]
            }]});
            for (command, response) in [
                ("GetGuildDataAll", json!({"ret_code": 0, "GetGuildBossClearRewardCrateList": history})),
                ("GetGuildBossClearRewardCrateList", history),
            ] {
                assert!(!store.apply_update(&response, &json!({"command": command})));
                let after = store.read().unwrap();
                assert_eq!(after.data, before.data);
                assert_eq!(after.revision, before.revision);
            }
            assert!(store.apply_update(
                &json!({"ret_code": 0, "changed_item_list": [{"type": 8, "info": rune(55)}]}),
                &json!({"command": "ReceiveGuildBossClearReward"})
            ));
            assert!(collection(&store.read().unwrap().data, "runes")
                .iter().any(|item| identifier(item, "rune_id").as_deref() == Some("55")));
        }
    }

    #[test]
    fn arena_reward_notification_cannot_replay_old_inventory() {
        let old_rune = |id| {
            json!({
                "rune_id": id, "wizard_id": 7, "set_id": 5,
                "slot_no": 6, "upgrade_curr": 0, "occupied_id": 0
            })
        };
        for populated in [false, true] {
            let mut store = ProfileStore::default();
            let mut snapshot = json!({
                "wizard_id": 7, "unit_list": [], "runes": [],
                "artifacts": [], "relics": [], "rune_craft_item_list": [],
                "inventory_info": []
            });
            if populated {
                snapshot["runes"] = json!([old_rune(51), old_rune(54)]);
                snapshot["inventory_info"] = json!([{
                    "rid": 9, "wizard_id": 7, "item_master_id": 2,
                    "item_master_type": 9, "item_quantity": 3
                }]);
            }
            assert!(store.accept_snapshot(snapshot));
            if populated {
                assert!(store.apply_update(
                    &json!({"ret_code": 0}),
                    &json!({"command": "SellRune", "rune_id_list": [54]})
                ));
                assert!(store.apply_update(
                    &json!({"ret_code": 0, "rune": {"rune_id": 51, "upgrade_curr": 15}}),
                    &json!({"command": "UpgradeRune_v2", "rune_id": 51})
                ));
            }
            let before = store.read().unwrap();
            // Captured on 2026-10-11: opening Arena repeats already awarded items.
            let notification = json!({
                "command": "getServerArenaRewardInfoForNoti_v2", "ret_code": 0,
                "user_reward_info": {"season_id": 38, "wizard_id": 7,
                    "reward_result": [{"reward_id": 3, "changed_item_list": [
                        {"type": 8, "info": old_rune(51)},
                        {"type": 8, "info": old_rune(54)},
                        {"type": 9, "info": {"rid": 9, "wizard_id": 7,
                            "item_master_id": 2, "item_master_type": 9, "item_quantity": 8}}
                    ]}]
                }
            });
            for _ in 0..2 {
                assert!(!store.apply_update(
                    &notification,
                    &json!({"command": "getServerArenaRewardInfoForNoti_v2"})
                ));
                let after = store.read().unwrap();
                assert_eq!(after.data, before.data);
                assert_eq!(after.revision, before.revision);
                assert_eq!(after.updated_at, before.updated_at);
            }
            // A fresh award still enters the same owned-item pipeline.
            assert!(store.apply_update(
                &json!({"ret_code": 0, "changed_item_list": [{"type": 8, "info": old_rune(55)}]}),
                &json!({"command": "BattleDungeonResult_V2"})
            ));
            assert!(
                collection(&store.read().unwrap().data, "runes")
                    .iter()
                    .any(|rune| identifier(rune, "rune_id").as_deref() == Some("55"))
            );
        }
    }

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
